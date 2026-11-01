-- LEXA double-entry general ledger foundation. All money values are stored in
-- integer minor currency units. Posted entries are immutable; corrections use
-- reversal journals instead of editing historical financial evidence.
CREATE TABLE "ledger_accounts" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "account_code" TEXT NOT NULL,
  "account_name" TEXT NOT NULL,
  "account_type" TEXT NOT NULL CHECK ("account_type" IN ('asset','liability','equity','revenue','expense')),
  "normal_balance" TEXT NOT NULL CHECK ("normal_balance" IN ('debit','credit')),
  "system_key" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ledger_accounts_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ledger_accounts_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "ledger_accounts_tenant_code_key" UNIQUE ("tenant_id", "account_code")
);
CREATE UNIQUE INDEX "ledger_accounts_tenant_system_key_key"
  ON "ledger_accounts"("tenant_id", "system_key") WHERE "system_key" IS NOT NULL;
CREATE INDEX "ledger_accounts_tenant_type_idx" ON "ledger_accounts"("tenant_id", "account_type", "account_code");

CREATE TABLE "accounting_periods" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "period_key" TEXT NOT NULL,
  "starts_on" DATE NOT NULL,
  "ends_on" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open' CHECK ("status" IN ('open','closed')),
  "closed_at" TIMESTAMPTZ(3),
  "closed_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accounting_periods_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "accounting_periods_closed_by_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "accounting_periods_date_order_check" CHECK ("ends_on" >= "starts_on"),
  CONSTRAINT "accounting_periods_tenant_period_key" UNIQUE ("tenant_id", "period_key")
);
CREATE INDEX "accounting_periods_tenant_dates_idx" ON "accounting_periods"("tenant_id", "starts_on", "ends_on");

CREATE TABLE "ledger_journals" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "journal_number" TEXT NOT NULL,
  "entry_date" DATE NOT NULL,
  "memo" TEXT NOT NULL,
  "source_type" TEXT,
  "source_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft','posted')),
  "reversal_of_id" UUID,
  "idempotency_key" TEXT,
  "request_hash" TEXT,
  "created_by_user_id" UUID NOT NULL,
  "posted_by_user_id" UUID,
  "posted_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ledger_journals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ledger_journals_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ledger_journals_branch_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ledger_journals_created_by_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ledger_journals_posted_by_fkey" FOREIGN KEY ("posted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ledger_journals_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "ledger_journals_tenant_number_key" UNIQUE ("tenant_id", "journal_number"),
  CONSTRAINT "ledger_journals_reversal_fkey" FOREIGN KEY ("tenant_id", "reversal_of_id") REFERENCES "ledger_journals"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ledger_journals_idempotency_pair_check" CHECK (("idempotency_key" IS NULL AND "request_hash" IS NULL) OR ("idempotency_key" IS NOT NULL AND "request_hash" IS NOT NULL))
);
CREATE UNIQUE INDEX "ledger_journals_tenant_idempotency_key"
  ON "ledger_journals"("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;
CREATE UNIQUE INDEX "ledger_journals_one_reversal_key"
  ON "ledger_journals"("tenant_id", "reversal_of_id") WHERE "reversal_of_id" IS NOT NULL;
CREATE UNIQUE INDEX "ledger_journals_source_key"
  ON "ledger_journals"("tenant_id", "source_type", "source_id")
  WHERE "source_type" IS NOT NULL AND "source_id" IS NOT NULL AND "reversal_of_id" IS NULL;
CREATE INDEX "ledger_journals_tenant_branch_date_idx" ON "ledger_journals"("tenant_id", "branch_id", "entry_date" DESC);
CREATE INDEX "ledger_journals_tenant_status_date_idx" ON "ledger_journals"("tenant_id", "status", "entry_date");

CREATE TABLE "ledger_journal_lines" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "journal_id" UUID NOT NULL,
  "line_number" INTEGER NOT NULL,
  "account_id" UUID NOT NULL,
  "description" TEXT,
  "debit_minor" BIGINT NOT NULL DEFAULT 0,
  "credit_minor" BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT "ledger_journal_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ledger_journal_lines_tenant_journal_fkey" FOREIGN KEY ("tenant_id", "journal_id") REFERENCES "ledger_journals"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ledger_journal_lines_tenant_account_fkey" FOREIGN KEY ("tenant_id", "account_id") REFERENCES "ledger_accounts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ledger_journal_lines_line_number_check" CHECK ("line_number" > 0),
  CONSTRAINT "ledger_journal_lines_nonnegative_check" CHECK ("debit_minor" >= 0 AND "credit_minor" >= 0),
  CONSTRAINT "ledger_journal_lines_one_side_check" CHECK (("debit_minor" > 0 AND "credit_minor" = 0) OR ("credit_minor" > 0 AND "debit_minor" = 0)),
  CONSTRAINT "ledger_journal_lines_unique_number" UNIQUE ("tenant_id", "journal_id", "line_number")
);
CREATE INDEX "ledger_journal_lines_tenant_account_idx" ON "ledger_journal_lines"("tenant_id", "account_id", "journal_id");

-- Seed a safe default chart and open monthly posting periods for each existing
-- tenant. These are account definitions only; no historical balances are made up.
INSERT INTO "ledger_accounts" ("id","tenant_id","account_code","account_name","account_type","normal_balance","system_key")
SELECT gen_random_uuid(), t."id", a.code, a.name, a.kind, a.normal, a.system_key
FROM "tenants" t
CROSS JOIN (VALUES
  ('1000','Cash on hand','asset','debit','cash'),
  ('1010','Bank accounts','asset','debit','bank'),
  ('1020','Mobile money clearing','asset','debit','mobile_money'),
  ('1100','Accounts receivable control','asset','debit','accounts_receivable'),
  ('1200','Inventory control','asset','debit','inventory'),
  ('2000','Accounts payable control','liability','credit','accounts_payable'),
  ('2100','Tax payable','liability','credit','tax_payable'),
  ('3000','Owner equity','equity','credit','owner_equity'),
  ('4000','Sales revenue','revenue','credit','sales_revenue'),
  ('4100','Other income','revenue','credit','other_income'),
  ('5000','Cost of goods sold','expense','debit','cost_of_goods_sold'),
  ('6000','Operating expenses','expense','debit','operating_expenses')
) AS a(code,name,kind,normal,system_key)
ON CONFLICT ("tenant_id", "account_code") DO NOTHING;

INSERT INTO "accounting_periods" ("id","tenant_id","period_key","starts_on","ends_on")
SELECT gen_random_uuid(), t."id", to_char(m.start_date,'YYYY-MM'), m.start_date::date,
       (m.start_date + interval '1 month - 1 day')::date
FROM "tenants" t
CROSS JOIN LATERAL generate_series(
  date_trunc('month', CURRENT_DATE)::date,
  (date_trunc('month', CURRENT_DATE) + interval '11 months')::date,
  interval '1 month'
) AS m(start_date)
ON CONFLICT ("tenant_id", "period_key") DO NOTHING;

CREATE OR REPLACE FUNCTION lexa_guard_ledger_journal() RETURNS trigger AS $$
DECLARE
  debit_total BIGINT;
  credit_total BIGINT;
  open_period_count INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'posted' THEN RAISE EXCEPTION 'Posted ledger journals cannot be deleted' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'posted' THEN
    RAISE EXCEPTION 'Posted ledger journals are immutable; create a reversal instead' USING ERRCODE='23514';
  END IF;

  IF NEW.status = 'posted' AND (TG_OP = 'INSERT' OR OLD.status <> 'posted') THEN
    SELECT COALESCE(SUM(debit_minor),0), COALESCE(SUM(credit_minor),0)
      INTO debit_total, credit_total
      FROM ledger_journal_lines WHERE tenant_id=NEW.tenant_id AND journal_id=NEW.id;
    IF debit_total <= 0 OR debit_total <> credit_total THEN
      RAISE EXCEPTION 'Ledger journal is not balanced' USING ERRCODE='23514';
    END IF;
    SELECT COUNT(*) INTO open_period_count FROM accounting_periods
      WHERE tenant_id=NEW.tenant_id AND status='open'
        AND NEW.entry_date BETWEEN starts_on AND ends_on;
    IF open_period_count <> 1 THEN
      RAISE EXCEPTION 'Ledger entry date is not in exactly one open accounting period' USING ERRCODE='23514';
    END IF;
    NEW.posted_at := COALESCE(NEW.posted_at, CURRENT_TIMESTAMP);
  END IF;
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ledger_journals_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ledger_journals"
FOR EACH ROW EXECUTE FUNCTION lexa_guard_ledger_journal();

CREATE OR REPLACE FUNCTION lexa_guard_ledger_journal_line() RETURNS trigger AS $$
DECLARE journal_status TEXT; journal_tenant UUID; journal_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN journal_tenant := OLD.tenant_id; journal_id := OLD.journal_id;
  ELSE journal_tenant := NEW.tenant_id; journal_id := NEW.journal_id; END IF;
  SELECT status INTO journal_status FROM ledger_journals
    WHERE tenant_id=journal_tenant AND id=journal_id FOR UPDATE;
  IF journal_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Only draft ledger journal lines may be changed' USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ledger_journal_lines_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ledger_journal_lines"
FOR EACH ROW EXECUTE FUNCTION lexa_guard_ledger_journal_line();
