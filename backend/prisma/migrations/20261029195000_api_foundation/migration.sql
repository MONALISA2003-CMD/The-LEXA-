ALTER TABLE "tenants"
  ADD COLUMN "business_type" TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'UGX',
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Africa/Kampala',
  ADD COLUMN "enabled_modules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "branches" ADD COLUMN "address" TEXT;

CREATE TABLE "sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "tenant_id" UUID,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

CREATE TABLE "password_reset_tokens" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "tenant_id" UUID,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "password_reset_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");
CREATE INDEX "password_reset_tokens_user_id_expires_at_idx" ON "password_reset_tokens"("user_id", "expires_at");

CREATE TABLE "categories" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "categories_tenant_id_name_key" ON "categories"("tenant_id", "name");
CREATE INDEX "categories_tenant_id_idx" ON "categories"("tenant_id");

CREATE TABLE "products" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "barcode" TEXT,
  "brand" TEXT,
  "unit_of_measure" TEXT,
  "supplier_sku" TEXT,
  "category_id" UUID,
  "cost_price_minor" INTEGER NOT NULL DEFAULT 0,
  "selling_price_minor" INTEGER NOT NULL DEFAULT 0,
  "low_stock_threshold" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "track_stock" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "products_tenant_id_sku_key" ON "products"("tenant_id", "sku");
CREATE INDEX "products_tenant_id_active_name_idx" ON "products"("tenant_id", "active", "name");
CREATE INDEX "products_tenant_id_category_id_idx" ON "products"("tenant_id", "category_id");

CREATE TABLE "module_records" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "module_id" TEXT NOT NULL,
  "record_id" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "module_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "module_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "module_records_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "module_records_tenant_id_branch_id_module_id_record_id_key" ON "module_records"("tenant_id", "branch_id", "module_id", "record_id");
CREATE INDEX "module_records_tenant_id_branch_id_module_id_updated_at_idx" ON "module_records"("tenant_id", "branch_id", "module_id", "updated_at");

CREATE TYPE "StockMovementType" AS ENUM ('opening', 'receiving', 'sale', 'return', 'adjustment', 'transfer_in', 'transfer_out', 'write_off');

CREATE TABLE "stock_movements" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "type" "StockMovementType" NOT NULL,
  "quantity_delta" DECIMAL(12,3) NOT NULL,
  "reason" TEXT NOT NULL,
  "source_id" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "stock_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "stock_movements_tenant_id_branch_id_created_at_idx" ON "stock_movements"("tenant_id", "branch_id", "created_at");
CREATE INDEX "stock_movements_tenant_id_branch_id_product_id_created_at_idx" ON "stock_movements"("tenant_id", "branch_id", "product_id", "created_at");

CREATE TABLE "sales" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "receipt_number" TEXT NOT NULL,
  "customer_name" TEXT,
  "customer_phone" TEXT,
  "promised_payment_date" DATE,
  "total_minor" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sales_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sales_tenant_id_receipt_number_key" ON "sales"("tenant_id", "receipt_number");
CREATE INDEX "sales_tenant_id_branch_id_created_at_idx" ON "sales"("tenant_id", "branch_id", "created_at");

CREATE TABLE "sale_lines" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "sale_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "product_name_snapshot" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unit_price_minor" INTEGER NOT NULL,
  "line_total_minor" INTEGER NOT NULL,
  CONSTRAINT "sale_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sale_lines_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sale_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "sale_lines_tenant_id_sale_id_idx" ON "sale_lines"("tenant_id", "sale_id");

CREATE TABLE "sale_payments" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "sale_id" UUID NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'receipt',
  "method" TEXT NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "reference" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sale_payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "sale_payments_tenant_id_sale_id_created_at_idx" ON "sale_payments"("tenant_id", "sale_id", "created_at");

CREATE TABLE "sale_returns" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "sale_id" UUID NOT NULL,
  "return_number" TEXT NOT NULL,
  "total_minor" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "refund_recorded" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_returns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sale_returns_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sale_returns_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sale_returns_tenant_id_return_number_key" ON "sale_returns"("tenant_id", "return_number");
CREATE INDEX "sale_returns_tenant_id_sale_id_created_at_idx" ON "sale_returns"("tenant_id", "sale_id", "created_at");

CREATE TABLE "sale_return_lines" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "return_id" UUID NOT NULL,
  "original_sale_line_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "product_name_snapshot" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unit_price_minor" INTEGER NOT NULL,
  "line_total_minor" INTEGER NOT NULL,
  CONSTRAINT "sale_return_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_return_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sale_return_lines_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "sale_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sale_return_lines_original_sale_line_id_fkey" FOREIGN KEY ("original_sale_line_id") REFERENCES "sale_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sale_return_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "sale_return_lines_tenant_id_return_id_idx" ON "sale_return_lines"("tenant_id", "return_id");
CREATE INDEX "sale_return_lines_tenant_id_original_sale_line_id_idx" ON "sale_return_lines"("tenant_id", "original_sale_line_id");
