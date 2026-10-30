-- Increment 3: Customer invoicing and accounts receivable.
-- Invoices are immutable snapshots of completed sales. Existing sales and sale_payments
-- remain the authoritative transaction and cash ledgers; this migration adds AR views,
-- allocations and audit links without moving stock or posting duplicate cash entries.

CREATE TABLE "ar_customer_invoices" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "invoice_number" TEXT NOT NULL,
  "source_sale_id" UUID NOT NULL,
  "customer_record_id" TEXT,
  "customer_name" TEXT NOT NULL,
  "customer_phone" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'UGX',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "subtotal_minor" INTEGER NOT NULL,
  "tax_minor" INTEGER NOT NULL DEFAULT 0,
  "total_minor" INTEGER NOT NULL,
  "issue_date" DATE,
  "due_date" DATE NOT NULL,
  "issued_at" TIMESTAMPTZ(3),
  "notes" TEXT,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ar_customer_invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ar_customer_invoices_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "ar_customer_invoices_status_check" CHECK ("status" IN ('draft','issued','partially_paid','paid','void')),
  CONSTRAINT "ar_customer_invoices_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "ar_customer_invoices_amount_check" CHECK ("subtotal_minor" >= 0 AND "tax_minor" >= 0 AND "total_minor" = "subtotal_minor" + "tax_minor"),
  CONSTRAINT "ar_customer_invoices_due_date_check" CHECK ("issue_date" IS NULL OR "due_date" >= "issue_date")
);
CREATE UNIQUE INDEX "ar_customer_invoices_number_key" ON "ar_customer_invoices"("tenant_id", "invoice_number");
CREATE UNIQUE INDEX "ar_customer_invoices_source_sale_key" ON "ar_customer_invoices"("tenant_id", "source_sale_id") WHERE "status" <> 'void';
CREATE INDEX "ar_customer_invoices_branch_status_due_idx" ON "ar_customer_invoices"("tenant_id", "branch_id", "status", "due_date");
CREATE INDEX "ar_customer_invoices_customer_idx" ON "ar_customer_invoices"("tenant_id", "branch_id", "customer_name", "issue_date");

CREATE TABLE "ar_customer_invoice_lines" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "source_sale_line_id" UUID NOT NULL,
  "product_id" UUID,
  "product_name_snapshot" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unit_price_minor" INTEGER NOT NULL,
  "line_total_minor" INTEGER NOT NULL,
  CONSTRAINT "ar_customer_invoice_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ar_customer_invoice_lines_invoice_fkey" FOREIGN KEY ("invoice_id") REFERENCES "ar_customer_invoices"("id") ON DELETE RESTRICT,
  CONSTRAINT "ar_customer_invoice_lines_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "ar_customer_invoice_lines_amount_check" CHECK ("unit_price_minor" >= 0 AND "line_total_minor" >= 0)
);
CREATE INDEX "ar_customer_invoice_lines_invoice_idx" ON "ar_customer_invoice_lines"("tenant_id", "invoice_id");

CREATE TABLE "ar_customer_receipts" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "receipt_number" TEXT NOT NULL,
  "customer_name" TEXT NOT NULL,
  "payment_date" DATE NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'receipt',
  "method" TEXT NOT NULL,
  "reference" TEXT,
  "amount_minor" INTEGER NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'accounts_receivable',
  "source_sale_payment_id" UUID,
  "idempotency_key" TEXT,
  "request_hash" TEXT,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ar_customer_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ar_customer_receipts_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "ar_customer_receipts_kind_check" CHECK ("kind" IN ('receipt','refund')),
  CONSTRAINT "ar_customer_receipts_amount_check" CHECK ("amount_minor" > 0),
  CONSTRAINT "ar_customer_receipts_method_check" CHECK ("method" IN ('cash','mtn_momo','airtel_money','bank_transfer','card_recorded','other'))
);
CREATE UNIQUE INDEX "ar_customer_receipts_number_key" ON "ar_customer_receipts"("tenant_id", "receipt_number");
CREATE UNIQUE INDEX "ar_customer_receipts_source_payment_key" ON "ar_customer_receipts"("tenant_id", "source_sale_payment_id") WHERE "source_sale_payment_id" IS NOT NULL;
CREATE UNIQUE INDEX "ar_customer_receipts_idempotency_key" ON "ar_customer_receipts"("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;
CREATE INDEX "ar_customer_receipts_customer_date_idx" ON "ar_customer_receipts"("tenant_id", "branch_id", "customer_name", "payment_date" DESC);

CREATE TABLE "ar_customer_receipt_allocations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "receipt_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "sale_payment_id" UUID,
  "amount_minor" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ar_customer_receipt_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ar_customer_receipt_allocations_receipt_fkey" FOREIGN KEY ("receipt_id") REFERENCES "ar_customer_receipts"("id") ON DELETE RESTRICT,
  CONSTRAINT "ar_customer_receipt_allocations_invoice_fkey" FOREIGN KEY ("invoice_id") REFERENCES "ar_customer_invoices"("id") ON DELETE RESTRICT,
  CONSTRAINT "ar_customer_receipt_allocations_amount_check" CHECK ("amount_minor" > 0)
);
CREATE UNIQUE INDEX "ar_customer_receipt_allocations_sale_payment_key" ON "ar_customer_receipt_allocations"("tenant_id", "sale_payment_id") WHERE "sale_payment_id" IS NOT NULL;
CREATE INDEX "ar_customer_receipt_allocations_invoice_idx" ON "ar_customer_receipt_allocations"("tenant_id", "invoice_id", "created_at");
CREATE INDEX "ar_customer_receipt_allocations_receipt_idx" ON "ar_customer_receipt_allocations"("tenant_id", "receipt_id");

-- Render values in the module register in major currency units while keeping all
-- accounting calculations in integer minor units.
CREATE OR REPLACE FUNCTION lexa_currency_minor_scale(currency_code text) RETURNS integer AS $$
  SELECT CASE
    WHEN upper(currency_code) IN ('BIF','CLP','DJF','GNF','ISK','JPY','KMF','KRW','PYG','RWF','UGX','UYI','VND','VUV','XAF','XOF','XPF') THEN 1
    WHEN upper(currency_code) IN ('BHD','IQD','JOD','KWD','LYD','OMR','TND') THEN 1000
    ELSE 100
  END;
$$ LANGUAGE SQL IMMUTABLE;

-- The pre-existing sales screen also records customer receipts directly against a sale.
-- Automatically mirror those receipts into AR once an invoice has been issued. The AR
-- endpoint sets a transaction-local flag while it creates the mirror itself, preventing
-- duplicate capture. Refunds against issued invoices require a credit note and are blocked.
CREATE OR REPLACE FUNCTION lexa_capture_ar_sale_payment() RETURNS trigger AS $$
DECLARE
  invoice_row RECORD;
BEGIN
  IF current_setting('lexa.ar_internal', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT i.id, i.tenant_id, i.branch_id, i.customer_name, i.status
    INTO invoice_row
    FROM ar_customer_invoices i
   WHERE i.tenant_id = NEW.tenant_id
     AND i.source_sale_id = NEW.sale_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  -- A payment made while a draft exists is picked up by the issue-time backfill.
  -- The row lock serializes this decision with issueInvoice so no receipt is lost.
  IF invoice_row.status NOT IN ('issued','partially_paid','paid') THEN
    RETURN NEW;
  END IF;

  IF NEW.kind = 'refund' THEN
    RAISE EXCEPTION 'CREDIT_NOTE_REQUIRED: refunds on issued invoices must be processed through a customer credit note.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.kind = 'receipt' THEN
    INSERT INTO ar_customer_receipts (
      id, tenant_id, branch_id, receipt_number, customer_name, payment_date,
      kind, method, reference, amount_minor, source, source_sale_payment_id, created_at
    ) VALUES (
      NEW.id, NEW.tenant_id, invoice_row.branch_id,
      'POS-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 12)),
      invoice_row.customer_name, NEW.created_at::date, 'receipt', NEW.method,
      NEW.reference, NEW.amount_minor, 'sale_payment', NEW.id, NEW.created_at
    ) ON CONFLICT (tenant_id, source_sale_payment_id) WHERE source_sale_payment_id IS NOT NULL DO NOTHING;

    INSERT INTO ar_customer_receipt_allocations (
      id, tenant_id, branch_id, receipt_id, invoice_id, sale_payment_id, amount_minor, created_at
    ) VALUES (
      NEW.id, NEW.tenant_id, invoice_row.branch_id, NEW.id, invoice_row.id, NEW.id,
      NEW.amount_minor, NEW.created_at
    ) ON CONFLICT (tenant_id, sale_payment_id) WHERE sale_payment_id IS NOT NULL DO NOTHING;

    UPDATE ar_customer_invoices i
       SET status = CASE
         WHEN COALESCE((SELECT SUM(a.amount_minor) FROM ar_customer_receipt_allocations a
                         JOIN ar_customer_receipts r ON r.id = a.receipt_id
                        WHERE a.invoice_id = i.id AND r.kind = 'receipt'), 0) >= i.total_minor THEN 'paid'
         ELSE 'partially_paid'
       END,
       updated_at = CURRENT_TIMESTAMP
     WHERE i.id = invoice_row.id;

    UPDATE module_records m
       SET data = jsonb_set(
         jsonb_set(
           jsonb_set(m.data, '{status}', to_jsonb(CASE
             WHEN COALESCE((SELECT SUM(a.amount_minor) FROM ar_customer_receipt_allocations a
                             JOIN ar_customer_receipts r ON r.id = a.receipt_id
                            WHERE a.invoice_id = invoice_row.id AND r.kind = 'receipt'), 0) >= i.total_minor
             THEN 'Paid' WHEN i.due_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Kampala')::date THEN 'Overdue' ELSE 'Partially paid' END), true),
           '{amountReceived}', to_jsonb((COALESCE((SELECT SUM(a.amount_minor) FROM ar_customer_receipt_allocations a
                                                  JOIN ar_customer_receipts r ON r.id = a.receipt_id
                                                 WHERE a.invoice_id = invoice_row.id AND r.kind = 'receipt'), 0)::numeric / lexa_currency_minor_scale(i.currency))::text), true),
         '{amountDue}', to_jsonb((GREATEST(0, i.total_minor - COALESCE((SELECT SUM(a.amount_minor) FROM ar_customer_receipt_allocations a
                                                                       JOIN ar_customer_receipts r ON r.id = a.receipt_id
                                                                      WHERE a.invoice_id = invoice_row.id AND r.kind = 'receipt'), 0))::numeric / lexa_currency_minor_scale(i.currency))::text), true),
         version = version + 1,
         updated_at = CURRENT_TIMESTAMP
      FROM ar_customer_invoices i
     WHERE m.tenant_id = i.tenant_id AND m.branch_id = i.branch_id
       AND m.module_id = 'sales-invoices' AND m.record_id = i.id::text AND i.id = invoice_row.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sale_payments_capture_accounts_receivable
AFTER INSERT ON "sale_payments"
FOR EACH ROW EXECUTE FUNCTION lexa_capture_ar_sale_payment();

-- Prevent the generic module-record editor from being treated as an invoice posting API.
-- The backend's typed receivables controller writes the module record together with the
-- invoice transaction; the UI also marks the module read-only.
UPDATE "module_definitions" SET "is_writable" = false, "updated_at" = CURRENT_TIMESTAMP
 WHERE "module_id" = 'sales-invoices';


-- Prevent generic module-record CRUD from creating, editing or deleting invoices outside
-- the typed receivables endpoints. These endpoints set a transaction-local write flag.
CREATE OR REPLACE FUNCTION lexa_guard_sales_invoice_module_record() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.module_id = 'sales-invoices' AND current_setting('lexa.ar_invoice_write', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'AR_INVOICE_WORKFLOW_REQUIRED: create or amend invoices through Accounts Receivable.' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.module_id = 'sales-invoices' AND current_setting('lexa.ar_invoice_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'AR_INVOICE_WORKFLOW_REQUIRED: create or amend invoices through Accounts Receivable.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER module_records_guard_sales_invoices
BEFORE INSERT OR UPDATE OR DELETE ON "module_records"
FOR EACH ROW EXECUTE FUNCTION lexa_guard_sales_invoice_module_record();
