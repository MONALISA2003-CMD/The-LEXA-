-- Persist the origin of each sale payment so source-to-ledger reconciliation
-- distinguishes checkout receipts, later POS receipts, AR allocations and refunds.
ALTER TABLE "sale_payments" ADD COLUMN IF NOT EXISTS "ledger_source" TEXT;

-- Preserve only origins that can be proved from existing ledger/AR relations.
UPDATE "sale_payments" sp
SET "ledger_source" = CASE
  WHEN sp."kind" = 'refund' THEN 'sale_return_recorded'
  WHEN EXISTS (
    SELECT 1 FROM "ar_customer_receipt_allocations" a
    WHERE a."tenant_id" = sp."tenant_id" AND a."sale_payment_id" = sp."id"
  ) THEN 'customer_receipt_recorded'
  WHEN EXISTS (
    SELECT 1 FROM "ledger_journals" j
    WHERE j."tenant_id" = sp."tenant_id" AND j."source_type" = 'sale_payment_received'
      AND j."source_id" = sp."id"::text
  ) THEN 'sale_payment_received'
  ELSE NULL
END
WHERE sp."ledger_source" IS NULL;

ALTER TABLE "sale_payments"
  ADD CONSTRAINT "sale_payments_ledger_source_check"
  CHECK ("ledger_source" IS NULL OR "ledger_source" IN (
    'sale_completed', 'sale_payment_received', 'sale_return_recorded', 'customer_receipt_recorded'
  ));
CREATE INDEX IF NOT EXISTS "sale_payments_tenant_ledger_source_idx"
  ON "sale_payments" ("tenant_id", "ledger_source", "created_at");
