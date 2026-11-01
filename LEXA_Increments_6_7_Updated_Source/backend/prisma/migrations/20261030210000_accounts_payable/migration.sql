-- LEXA Increment 4: supplier invoicing and accounts payable.
-- Bills are tied to accepted goods-receipt lines; stock remains in stock_movements.

CREATE TABLE "ap_supplier_invoices" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "purchase_order_id" UUID NOT NULL,
  "supplier_record_id" TEXT,
  "supplier_name" TEXT NOT NULL,
  "supplier_invoice_number" TEXT NOT NULL,
  "invoice_number" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "bill_date" DATE NOT NULL,
  "due_date" DATE NOT NULL,
  "subtotal_minor" INTEGER NOT NULL,
  "tax_minor" INTEGER NOT NULL DEFAULT 0,
  "total_minor" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "notes" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "approved_by_user_id" UUID,
  "approved_at" TIMESTAMPTZ(3),
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ap_supplier_invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ap_supplier_invoices_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "ap_supplier_invoices_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "ap_supplier_invoices_po_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "commerce_purchase_orders"("id") ON DELETE RESTRICT,
  CONSTRAINT "ap_supplier_invoices_approver_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "ap_supplier_invoices_actor_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "ap_supplier_invoices_status_check" CHECK ("status" IN ('draft','approved','partially_paid','paid','void')),
  CONSTRAINT "ap_supplier_invoices_money_check" CHECK ("subtotal_minor" >= 0 AND "tax_minor" >= 0 AND "total_minor" = "subtotal_minor" + "tax_minor" AND "total_minor" <= 2000000000),
  CONSTRAINT "ap_supplier_invoices_due_check" CHECK ("due_date" >= "bill_date"),
  CONSTRAINT "ap_supplier_invoices_tenant_id_key" UNIQUE ("tenant_id", "id")
);
CREATE UNIQUE INDEX "ap_supplier_invoices_internal_number_key" ON "ap_supplier_invoices"("tenant_id", "invoice_number");
CREATE UNIQUE INDEX "ap_supplier_invoices_idempotency_key" ON "ap_supplier_invoices"("tenant_id", "branch_id", "idempotency_key");
CREATE UNIQUE INDEX "ap_supplier_invoices_supplier_bill_key" ON "ap_supplier_invoices"("tenant_id", lower("supplier_name"), upper("supplier_invoice_number")) WHERE "status" <> 'void';
CREATE INDEX "ap_supplier_invoices_branch_status_idx" ON "ap_supplier_invoices"("tenant_id", "branch_id", "status", "due_date");
CREATE INDEX "ap_supplier_invoices_po_idx" ON "ap_supplier_invoices"("tenant_id", "purchase_order_id");

CREATE TABLE "ap_supplier_invoice_lines" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "purchase_order_line_id" UUID NOT NULL,
  "receipt_line_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "product_name_snapshot" TEXT NOT NULL,
  "receipt_number_snapshot" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unit_cost_minor" INTEGER NOT NULL,
  "line_total_minor" INTEGER NOT NULL,
  CONSTRAINT "ap_supplier_invoice_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ap_supplier_invoice_lines_tenant_invoice_fkey" FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "ap_supplier_invoices"("tenant_id", "id") ON DELETE CASCADE,
  CONSTRAINT "ap_supplier_invoice_lines_po_line_fkey" FOREIGN KEY ("purchase_order_line_id") REFERENCES "commerce_purchase_order_lines"("id") ON DELETE RESTRICT,
  CONSTRAINT "ap_supplier_invoice_lines_receipt_line_fkey" FOREIGN KEY ("receipt_line_id") REFERENCES "commerce_goods_receipt_lines"("id") ON DELETE RESTRICT,
  CONSTRAINT "ap_supplier_invoice_lines_product_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
  CONSTRAINT "ap_supplier_invoice_lines_quantity_check" CHECK ("quantity" > 0 AND "unit_cost_minor" >= 0 AND "line_total_minor" >= 0 AND "line_total_minor" <= 2000000000),
  CONSTRAINT "ap_supplier_invoice_lines_receipt_key" UNIQUE ("invoice_id", "receipt_line_id")
);
CREATE INDEX "ap_supplier_invoice_lines_receipt_idx" ON "ap_supplier_invoice_lines"("tenant_id", "receipt_line_id");
CREATE INDEX "ap_supplier_invoice_lines_po_line_idx" ON "ap_supplier_invoice_lines"("tenant_id", "purchase_order_line_id");

CREATE TABLE "ap_supplier_payments" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "supplier_record_id" TEXT,
  "supplier_name" TEXT NOT NULL,
  "payment_number" TEXT NOT NULL,
  "payment_date" DATE NOT NULL,
  "method" TEXT NOT NULL,
  "account" TEXT NOT NULL,
  "reference" TEXT,
  "amount_minor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ap_supplier_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ap_supplier_payments_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "ap_supplier_payments_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "ap_supplier_payments_actor_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "ap_supplier_payments_amount_check" CHECK ("amount_minor" > 0 AND "amount_minor" <= 2000000000),
  CONSTRAINT "ap_supplier_payments_method_check" CHECK ("method" IN ('cash','bank_transfer','mtn_momo','airtel_money','cheque','card_recorded','other')),
  CONSTRAINT "ap_supplier_payments_account_check" CHECK ("account" IN ('Cash till','Main bank account','MTN Mobile Money','Airtel Money')),
  CONSTRAINT "ap_supplier_payments_tenant_id_key" UNIQUE ("tenant_id", "id")
);
CREATE UNIQUE INDEX "ap_supplier_payments_number_key" ON "ap_supplier_payments"("tenant_id", "payment_number");
CREATE UNIQUE INDEX "ap_supplier_payments_idempotency_key" ON "ap_supplier_payments"("tenant_id", "branch_id", "idempotency_key");
CREATE INDEX "ap_supplier_payments_branch_date_idx" ON "ap_supplier_payments"("tenant_id", "branch_id", "payment_date" DESC);

CREATE TABLE "ap_supplier_payment_allocations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ap_supplier_payment_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ap_supplier_payment_allocations_tenant_payment_fkey" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "ap_supplier_payments"("tenant_id", "id") ON DELETE CASCADE,
  CONSTRAINT "ap_supplier_payment_allocations_tenant_invoice_fkey" FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "ap_supplier_invoices"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "ap_supplier_payment_allocations_amount_check" CHECK ("amount_minor" > 0),
  CONSTRAINT "ap_supplier_payment_allocations_payment_invoice_key" UNIQUE ("payment_id", "invoice_id")
);
CREATE INDEX "ap_supplier_payment_allocations_invoice_idx" ON "ap_supplier_payment_allocations"("tenant_id", "invoice_id");
