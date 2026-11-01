-- Keep enough closed/open periods for backdated imports and audited corrections.
-- Existing generated periods are kept; this fills the historical and forward gaps.
INSERT INTO "accounting_periods" ("id", "tenant_id", "period_key", "starts_on", "ends_on", "status", "closed_at")
SELECT gen_random_uuid(), t."id", to_char(m.start_date, 'YYYY-MM'), m.start_date::date,
       (m.start_date + interval '1 month - 1 day')::date,
       CASE WHEN m.start_date < date_trunc('month', CURRENT_DATE)::date THEN 'closed' ELSE 'open' END,
       CASE WHEN m.start_date < date_trunc('month', CURRENT_DATE)::date THEN CURRENT_TIMESTAMP ELSE NULL END
FROM "tenants" t
CROSS JOIN LATERAL generate_series(
  (date_trunc('month', CURRENT_DATE) - interval '60 months')::date,
  (date_trunc('month', CURRENT_DATE) + interval '24 months')::date,
  interval '1 month'
) AS m(start_date)
ON CONFLICT ("tenant_id", "period_key") DO NOTHING;

-- Periods must never overlap. Closed periods are immutable; correcting a closed
-- period requires a controlled adjustment in a new open period.
CREATE OR REPLACE FUNCTION lexa_guard_accounting_period() RETURNS trigger AS $$
DECLARE overlap_count INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'closed' THEN
    IF NEW.status <> 'closed'
       OR NEW.tenant_id <> OLD.tenant_id
       OR NEW.period_key <> OLD.period_key
       OR NEW.starts_on <> OLD.starts_on
       OR NEW.ends_on <> OLD.ends_on THEN
      RAISE EXCEPTION 'Closed accounting periods are immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.ends_on < NEW.starts_on THEN
    RAISE EXCEPTION 'Accounting period end must not precede its start' USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*) INTO overlap_count
  FROM accounting_periods p
  WHERE p.tenant_id = NEW.tenant_id
    AND p.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND daterange(p.starts_on, p.ends_on, '[]') && daterange(NEW.starts_on, NEW.ends_on, '[]');
  IF overlap_count > 0 THEN
    RAISE EXCEPTION 'Accounting periods may not overlap' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'closed' THEN
    NEW.closed_at := COALESCE(NEW.closed_at, CURRENT_TIMESTAMP);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "accounting_periods_guard"
BEFORE INSERT OR UPDATE ON "accounting_periods"
FOR EACH ROW EXECUTE FUNCTION lexa_guard_accounting_period();

CREATE INDEX IF NOT EXISTS "accounting_periods_tenant_status_dates_idx"
  ON "accounting_periods" ("tenant_id", "status", "starts_on", "ends_on");
