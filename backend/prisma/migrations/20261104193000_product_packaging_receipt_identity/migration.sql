-- Additive multi-industry packaging + receipt/transfer variant identity.
-- Never rewrite historical stock, invoice, receipt, customer, SKU, or serial records.
CREATE UNIQUE INDEX IF NOT EXISTS product_packages_product_identity_idx ON products(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS product_packages_variant_identity_idx ON product_variants(tenant_id,product_id,id);
CREATE TABLE IF NOT EXISTS public.product_packages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
 product_id uuid NOT NULL, variant_id uuid,
 code text NOT NULL CHECK(length(btrim(code)) BETWEEN 1 AND 40),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 80),
 units_per_package numeric(14,3) NOT NULL CHECK(units_per_package>0 AND units_per_package<=1000000),
 base_unit text NOT NULL CHECK(length(btrim(base_unit)) BETWEEN 1 AND 80),
 active boolean NOT NULL DEFAULT true, created_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,product_id,code),
 FOREIGN KEY (tenant_id,product_id) REFERENCES public.products(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (tenant_id,product_id,variant_id) REFERENCES public.product_variants(tenant_id,product_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS product_packages_active_idx ON public.product_packages(tenant_id,product_id,active);
ALTER TABLE public.product_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_packages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_packages_tenant_scope ON public.product_packages;
CREATE POLICY product_packages_tenant_scope ON public.product_packages FOR ALL
 USING(tenant_id::text = NULLIF(current_setting('app.tenant_id',true),''))
 WITH CHECK(tenant_id::text = NULLIF(current_setting('app.tenant_id',true),''));
GRANT SELECT, INSERT, UPDATE ON TABLE public.product_packages TO lexa_app_runtime;
ALTER TABLE public.commerce_goods_receipt_lines ADD COLUMN IF NOT EXISTS variant_id uuid;
ALTER TABLE public.inventory_transfer_lines ADD COLUMN IF NOT EXISTS variant_id uuid;
-- Add new tenant-scoped references without rewriting old rows or nulls.
ALTER TABLE public.commerce_goods_receipt_lines
 ADD CONSTRAINT goods_receipt_variant_owner_fkey FOREIGN KEY (tenant_id,product_id,variant_id)
 REFERENCES public.product_variants(tenant_id,product_id,id) NOT VALID;
ALTER TABLE public.inventory_transfer_lines
 ADD CONSTRAINT transfer_variant_owner_fkey FOREIGN KEY (tenant_id,product_id,variant_id)
 REFERENCES public.product_variants(tenant_id,product_id,id) NOT VALID;
