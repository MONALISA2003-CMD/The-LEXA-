-- Automatically close elapsed monthly periods before any journal can post.
-- Corrections to elapsed periods must be posted as approved entries in a current
-- open period, with a clear memo and source reference; historical periods are
-- never silently reopened.
CREATE OR REPLACE FUNCTION lexa_guard_ledger_journal() RETURNS trigger AS $$
DECLARE
  debit_total BIGINT;
  credit_total BIGINT;
  open_period_count INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'posted' THEN
      RAISE EXCEPTION 'Posted ledger journals cannot be deleted' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'posted' THEN
    RAISE EXCEPTION 'Posted ledger journals are immutable; create a reversal instead' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'posted' AND (TG_OP = 'INSERT' OR OLD.status <> 'posted') THEN
    -- Close any elapsed periods in this tenant, including periods that were
    -- previously generated as future periods by an older app version.
    UPDATE accounting_periods
      SET status = 'closed', closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP)
      WHERE tenant_id = NEW.tenant_id
        AND status = 'open'
        AND starts_on < date_trunc('month', CURRENT_DATE)::date;

    SELECT COALESCE(SUM(debit_minor), 0), COALESCE(SUM(credit_minor), 0)
      INTO debit_total, credit_total
      FROM ledger_journal_lines
      WHERE tenant_id = NEW.tenant_id AND journal_id = NEW.id;

    IF debit_total <= 0 OR debit_total <> credit_total THEN
      RAISE EXCEPTION 'Ledger journal is not balanced' USING ERRCODE = '23514';
    END IF;

    SELECT COUNT(*) INTO open_period_count
      FROM accounting_periods
      WHERE tenant_id = NEW.tenant_id
        AND status = 'open'
        AND NEW.entry_date BETWEEN starts_on AND ends_on;
    IF open_period_count <> 1 THEN
      RAISE EXCEPTION 'Ledger entry date is not in exactly one open accounting period' USING ERRCODE = '23514';
    END IF;

    NEW.posted_at := COALESCE(NEW.posted_at, CURRENT_TIMESTAMP);
  END IF;
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
