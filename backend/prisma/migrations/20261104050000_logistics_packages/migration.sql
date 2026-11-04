
-- Shipment packages belong to a verified business, location and sales order.
-- Packing does not alter stock or recognise revenue; order dispatch performs those actions.
CREATE TABLE IF NOT EXISTS public.commerce_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  order_id uuid NOT NULL,
  delivery_id uuid,
  package_number text NOT NULL,
  status text NOT NULL DEFAULT 'packed' CHECK(status IN ('packed','sealed','dispatched','delivered','returned','cancelled')),
  customer_name text,
  recipient_name text,
  recipient_phone text,
  delivery_address text,
  package_weight_kg numeric(12,3) CHECK(package_weight_kg IS NULL OR package_weight_kg >= 0),
  length_cm numeric(12,2) CHECK(length_cm IS NULL OR length_cm >= 0),
  width_cm numeric(12,2) CHECK(width_cm IS NULL OR width_cm >= 0),
  height_cm numeric(12,2) CHECK(height_cm IS NULL OR height_cm >= 0),
  handling_notes text,
  seal_number text,
  tracking_reference text,
  packed_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  packed_at timestamptz(3) NOT NULL DEFAULT now(),
  sealed_at timestamptz(3),
  delivered_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT commerce_packages_tenant_fkey FOREIGN KEY(tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT,
  CONSTRAINT commerce_packages_branch_fkey FOREIGN KEY(tenant_id,branch_id) REFERENCES public.branches(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT commerce_packages_order_fkey FOREIGN KEY(order_id) REFERENCES public.commerce_sales_orders(id) ON DELETE RESTRICT,
  CONSTRAINT commerce_packages_delivery_fkey FOREIGN KEY(tenant_id,delivery_id) REFERENCES public.commerce_deliveries(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,package_number)
);
CREATE INDEX IF NOT EXISTS commerce_packages_order_status_idx ON public.commerce_packages(tenant_id,branch_id,order_id,status);
CREATE INDEX IF NOT EXISTS commerce_packages_delivery_idx ON public.commerce_packages(tenant_id,branch_id,delivery_id) WHERE delivery_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.commerce_package_lines(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  package_id uuid NOT NULL,
  order_line_id uuid NOT NULL REFERENCES public.commerce_sales_order_lines(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL,
  product_name_snapshot text NOT NULL,
  sku_snapshot text NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK(quantity>0),
  FOREIGN KEY(tenant_id,package_id) REFERENCES public.commerce_packages(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,branch_id) REFERENCES public.branches(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE(tenant_id,package_id,order_line_id)
);
CREATE INDEX IF NOT EXISTS commerce_package_lines_order_line_idx ON public.commerce_package_lines(tenant_id,order_line_id);

-- RLS is fail-closed on both tables, including the runtime role.
ALTER TABLE public.commerce_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_packages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_package_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_package_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS commerce_packages_tenant_scope ON public.commerce_packages;
CREATE POLICY commerce_packages_tenant_scope ON public.commerce_packages
  FOR ALL USING (tenant_id::text = NULLIF(current_setting('app.tenant_id',true),''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.tenant_id',true),''));
DROP POLICY IF EXISTS commerce_package_lines_tenant_scope ON public.commerce_package_lines;
CREATE POLICY commerce_package_lines_tenant_scope ON public.commerce_package_lines
  FOR ALL USING (tenant_id::text = NULLIF(current_setting('app.tenant_id',true),''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.tenant_id',true),''));
GRANT SELECT,INSERT,UPDATE ON TABLE public.commerce_packages,public.commerce_package_lines TO lexa_app_runtime;

