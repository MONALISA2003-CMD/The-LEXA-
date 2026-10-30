-- Additive operational workflows: sales orders, purchasing, goods receipts and dispatch.
-- Existing products, sales and stock_movements remain the canonical product and stock ledgers.

CREATE TABLE "commerce_sales_orders" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "order_number" TEXT NOT NULL,
  "customer_record_id" TEXT,
  "customer_name" TEXT,
  "delivery_address" TEXT,
  "courier" TEXT,
  "expected_date" DATE,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "total_minor" INTEGER NOT NULL DEFAULT 0,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commerce_sales_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commerce_sales_orders_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "commerce_sales_orders_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "commerce_sales_orders_actor_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "commerce_sales_orders_status_check" CHECK ("status" IN ('draft','confirmed','partially_fulfilled','fulfilled','cancelled')),
  CONSTRAINT "commerce_sales_orders_total_check" CHECK ("total_minor" >= 0)
);
CREATE UNIQUE INDEX "commerce_sales_orders_number_key" ON "commerce_sales_orders"("tenant_id", "order_number");
CREATE INDEX "commerce_sales_orders_branch_status_idx" ON "commerce_sales_orders"("tenant_id", "branch_id", "status", "created_at" DESC);

CREATE TABLE "commerce_sales_order_lines" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "product_name_snapshot" TEXT NOT NULL,
  "sku_snapshot" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "quantity_fulfilled" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "unit_price_minor" INTEGER NOT NULL,
  "line_total_minor" INTEGER NOT NULL,
  CONSTRAINT "commerce_sales_order_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commerce_sales_order_lines_order_fkey" FOREIGN KEY ("order_id") REFERENCES "commerce_sales_orders"("id") ON DELETE CASCADE,
  CONSTRAINT "commerce_sales_order_lines_product_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
  CONSTRAINT "commerce_sales_order_lines_quantity_check" CHECK ("quantity" > 0 AND "quantity_fulfilled" >= 0 AND "quantity_fulfilled" <= "quantity"),
  CONSTRAINT "commerce_sales_order_lines_money_check" CHECK ("unit_price_minor" >= 0 AND "line_total_minor" >= 0)
);
CREATE INDEX "commerce_sales_order_lines_order_idx" ON "commerce_sales_order_lines"("tenant_id", "order_id");

CREATE TABLE "commerce_stock_reservations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "order_line_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity_reserved" DECIMAL(12,3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commerce_stock_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commerce_stock_reservations_order_line_key" UNIQUE ("order_line_id"),
  CONSTRAINT "commerce_stock_reservations_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "commerce_stock_reservations_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE,
  CONSTRAINT "commerce_stock_reservations_order_fkey" FOREIGN KEY ("order_id") REFERENCES "commerce_sales_orders"("id") ON DELETE CASCADE,
  CONSTRAINT "commerce_stock_reservations_line_fkey" FOREIGN KEY ("order_line_id") REFERENCES "commerce_sales_order_lines"("id") ON DELETE CASCADE,
  CONSTRAINT "commerce_stock_reservations_product_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
  CONSTRAINT "commerce_stock_reservations_quantity_check" CHECK ("quantity_reserved" >= 0)
);
CREATE INDEX "commerce_stock_reservations_balance_idx" ON "commerce_stock_reservations"("tenant_id", "branch_id", "product_id");

CREATE TABLE "commerce_fulfilments" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "sale_id" UUID NOT NULL,
  "fulfilment_number" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'dispatched',
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commerce_fulfilments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commerce_fulfilments_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "commerce_fulfilments_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "commerce_fulfilments_order_fkey" FOREIGN KEY ("order_id") REFERENCES "commerce_sales_orders"("id") ON DELETE RESTRICT,
  CONSTRAINT "commerce_fulfilments_sale_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT,
  CONSTRAINT "commerce_fulfilments_actor_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "commerce_fulfilments_number_key" ON "commerce_fulfilments"("tenant_id", "fulfilment_number");
CREATE INDEX "commerce_fulfilments_order_idx" ON "commerce_fulfilments"("tenant_id", "order_id", "created_at" DESC);

CREATE TABLE "commerce_fulfilment_lines" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "fulfilment_id" UUID NOT NULL,
  "order_line_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  CONSTRAINT "commerce_fulfilment_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commerce_fulfilment_lines_fulfilment_fkey" FOREIGN KEY ("fulfilment_id") REFERENCES "commerce_fulfilments"("id") ON DELETE CASCADE,
  CONSTRAINT "commerce_fulfilment_lines_order_line_fkey" FOREIGN KEY ("order_line_id") REFERENCES "commerce_sales_order_lines"("id") ON DELETE RESTRICT,
  CONSTRAINT "commerce_fulfilment_lines_product_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
  CONSTRAINT "commerce_fulfilment_lines_quantity_check" CHECK ("quantity" > 0)
);

CREATE TABLE "commerce_deliveries" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "fulfilment_id" UUID NOT NULL,
  "delivery_number" TEXT NOT NULL,
  "recipient_name" TEXT,
  "delivery_address" TEXT,
  "courier" TEXT,
  "expected_date" DATE,
  "tracking_reference" TEXT,
  "status" TEXT NOT NULL DEFAULT 'dispatched',
  "dispatched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "delivered_at" TIMESTAMPTZ(3),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commerce_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commerce_deliveries_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "commerce_deliveries_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "commerce_deliveries_fulfilment_fkey" FOREIGN KEY ("fulfilment_id") REFERENCES "commerce_fulfilments"("id") ON DELETE RESTRICT,
  CONSTRAINT "commerce_deliveries_status_check" CHECK ("status" IN ('dispatched','in_transit','delivered','delivery_failed'))
);
CREATE UNIQUE INDEX "commerce_deliveries_number_key" ON "commerce_deliveries"("tenant_id", "delivery_number");
CREATE UNIQUE INDEX "commerce_deliveries_fulfilment_key" ON "commerce_deliveries"("fulfilment_id");
CREATE INDEX "commerce_deliveries_branch_status_idx" ON "commerce_deliveries"("tenant_id", "branch_id", "status", "dispatched_at" DESC);

CREATE TABLE "commerce_purchase_orders" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "order_number" TEXT NOT NULL,
  "supplier_record_id" TEXT,
  "supplier_name" TEXT NOT NULL,
  "expected_date" DATE,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "total_minor" INTEGER NOT NULL DEFAULT 0,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commerce_purchase_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commerce_purchase_orders_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "commerce_purchase_orders_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "commerce_purchase_orders_actor_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "commerce_purchase_orders_status_check" CHECK ("status" IN ('draft','ordered','partially_received','received','cancelled')),
  CONSTRAINT "commerce_purchase_orders_total_check" CHECK ("total_minor" >= 0)
);
CREATE UNIQUE INDEX "commerce_purchase_orders_number_key" ON "commerce_purchase_orders"("tenant_id", "order_number");
CREATE INDEX "commerce_purchase_orders_branch_status_idx" ON "commerce_purchase_orders"("tenant_id", "branch_id", "status", "created_at" DESC);

CREATE TABLE "commerce_purchase_order_lines" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "product_name_snapshot" TEXT NOT NULL,
  "sku_snapshot" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "quantity_accepted" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "quantity_rejected" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "unit_cost_minor" INTEGER NOT NULL,
  "line_total_minor" INTEGER NOT NULL,
  CONSTRAINT "commerce_purchase_order_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commerce_purchase_order_lines_order_fkey" FOREIGN KEY ("order_id") REFERENCES "commerce_purchase_orders"("id") ON DELETE CASCADE,
  CONSTRAINT "commerce_purchase_order_lines_product_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
  CONSTRAINT "commerce_purchase_order_lines_quantity_check" CHECK ("quantity" > 0 AND "quantity_accepted" >= 0 AND "quantity_accepted" <= "quantity" AND "quantity_rejected" >= 0),
  CONSTRAINT "commerce_purchase_order_lines_money_check" CHECK ("unit_cost_minor" >= 0 AND "line_total_minor" >= 0)
);
CREATE INDEX "commerce_purchase_order_lines_order_idx" ON "commerce_purchase_order_lines"("tenant_id", "order_id");

CREATE TABLE "commerce_goods_receipts" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "purchase_order_id" UUID NOT NULL,
  "receipt_number" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'posted',
  "reason" TEXT,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commerce_goods_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commerce_goods_receipts_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "commerce_goods_receipts_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "commerce_goods_receipts_po_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "commerce_purchase_orders"("id") ON DELETE RESTRICT,
  CONSTRAINT "commerce_goods_receipts_actor_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "commerce_goods_receipts_number_key" ON "commerce_goods_receipts"("tenant_id", "receipt_number");
CREATE INDEX "commerce_goods_receipts_po_idx" ON "commerce_goods_receipts"("tenant_id", "purchase_order_id", "created_at" DESC);

CREATE TABLE "commerce_goods_receipt_lines" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "receipt_id" UUID NOT NULL,
  "purchase_order_line_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity_accepted" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "quantity_rejected" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "rejection_reason" TEXT,
  "batch_number" TEXT,
  "expiry_date" DATE,
  CONSTRAINT "commerce_goods_receipt_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commerce_goods_receipt_lines_receipt_fkey" FOREIGN KEY ("receipt_id") REFERENCES "commerce_goods_receipts"("id") ON DELETE CASCADE,
  CONSTRAINT "commerce_goods_receipt_lines_po_line_fkey" FOREIGN KEY ("purchase_order_line_id") REFERENCES "commerce_purchase_order_lines"("id") ON DELETE RESTRICT,
  CONSTRAINT "commerce_goods_receipt_lines_product_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
  CONSTRAINT "commerce_goods_receipt_lines_quantity_check" CHECK ("quantity_accepted" >= 0 AND "quantity_rejected" >= 0 AND "quantity_accepted" + "quantity_rejected" > 0)
);
CREATE INDEX "commerce_goods_receipt_lines_receipt_idx" ON "commerce_goods_receipt_lines"("tenant_id", "receipt_id");
