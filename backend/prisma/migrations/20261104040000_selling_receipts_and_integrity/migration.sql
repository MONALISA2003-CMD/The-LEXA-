-- Additive: never alters historical totals, stock movements or existing receipts.
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS cashier_user_id uuid;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS receipt_business_snapshot jsonb;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS cash_tendered_minor integer;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS cash_change_minor integer;
CREATE INDEX IF NOT EXISTS sales_by_cashier_date_idx ON public.sales(tenant_id,branch_id,cashier_user_id,created_at);
ALTER TABLE public.sale_lines ADD COLUMN IF NOT EXISTS sku_snapshot text;
ALTER TABLE public.sale_lines ADD COLUMN IF NOT EXISTS barcode_snapshot text;
