-- Forward-only industry-specific production, exact UoM policies and division attribution.
-- All existing transaction IDs, cost snapshots and product identities stay unchanged.
CREATE TABLE public.business_divisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
 code text NOT NULL CHECK(code ~ '^[a-z][a-z0-9_]{1,47}$'),name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 active boolean NOT NULL DEFAULT true,created_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 created_at timestamptz(3) NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),UNIQUE(tenant_id,code));
CREATE TABLE public.product_division_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
 product_id uuid NOT NULL,division_id uuid NOT NULL, "primary" boolean NOT NULL DEFAULT false,
 created_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,created_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,product_id,division_id),
 FOREIGN KEY(tenant_id,product_id) REFERENCES public.products(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,division_id) REFERENCES public.business_divisions(tenant_id,id) ON DELETE RESTRICT);
CREATE UNIQUE INDEX product_division_one_primary_idx ON public.product_division_links(tenant_id,product_id) WHERE "primary"=true;
ALTER TABLE public.sale_lines ADD COLUMN business_division_id uuid NULL;
ALTER TABLE public.sale_lines ADD CONSTRAINT sale_lines_business_division_fk
 FOREIGN KEY(tenant_id,business_division_id) REFERENCES public.business_divisions(tenant_id,id) ON DELETE RESTRICT;
CREATE INDEX sale_lines_division_idx ON public.sale_lines(tenant_id,business_division_id,sale_id);

CREATE TABLE public.product_uom_conversions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
 product_id uuid NOT NULL,variant_id uuid NULL,from_unit text NOT NULL,to_unit text NOT NULL,
 dimension text NOT NULL CHECK(dimension IN ('count','mass','volume','length','area')),
 numerator bigint NOT NULL CHECK(numerator BETWEEN 1 AND 1000000000000),
 denominator bigint NOT NULL CHECK(denominator BETWEEN 1 AND 1000000000000),
 evidence_reference text NOT NULL CHECK(length(trim(evidence_reference)) BETWEEN 1 AND 200),
 version integer NOT NULL CHECK(version>0),status text NOT NULL DEFAULT 'approved' CHECK(status IN ('approved','retired')),
 effective_at timestamptz(3) NOT NULL DEFAULT now(),approved_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 created_at timestamptz(3) NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,product_id) REFERENCES public.products(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,product_id,variant_id) REFERENCES public.product_variants(tenant_id,product_id,id) ON DELETE RESTRICT);
CREATE UNIQUE INDEX product_uom_versions_unique ON public.product_uom_conversions(tenant_id,product_id,COALESCE(variant_id,'00000000-0000-0000-0000-000000000000'::uuid),from_unit,to_unit,version);

CREATE TABLE public.inventory_formulas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
 branch_id uuid NOT NULL,name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 kind text NOT NULL CHECK(kind IN ('decant','tester','recipe','production','assembly')),
 output_product_id uuid NOT NULL,output_variant_id uuid NULL,
 output_quantity numeric(14,3) NOT NULL CHECK(output_quantity>0 AND output_quantity<=1000000000),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','retired')),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 approved_by_user_id uuid NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 approved_at timestamptz(3) NULL,created_at timestamptz(3) NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES public.branches(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,output_product_id) REFERENCES public.products(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,output_product_id,output_variant_id) REFERENCES public.product_variants(tenant_id,product_id,id) ON DELETE RESTRICT);
CREATE INDEX inventory_formulas_tenant_branch_idx ON public.inventory_formulas(tenant_id,branch_id,status,kind);
CREATE TABLE public.inventory_formula_components (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
 formula_id uuid NOT NULL,product_id uuid NOT NULL,variant_id uuid NULL,
 quantity numeric(14,3) NOT NULL CHECK(quantity>0 AND quantity<=1000000000),
 unit_code text NOT NULL CHECK(length(unit_code) BETWEEN 1 AND 24),UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,formula_id) REFERENCES public.inventory_formulas(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,product_id) REFERENCES public.products(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,product_id,variant_id) REFERENCES public.product_variants(tenant_id,product_id,id) ON DELETE RESTRICT);
CREATE UNIQUE INDEX inventory_formula_component_identity ON public.inventory_formula_components(tenant_id,formula_id,product_id,COALESCE(variant_id,'00000000-0000-0000-0000-000000000000'::uuid));

-- A given sold menu line may be consumed once, or a finished-batch operation may
-- receive stock once. A production order cannot perform both posting modes.
CREATE UNIQUE INDEX sale_lines_tenant_identity_idx ON public.sale_lines(tenant_id,id);
CREATE TABLE public.inventory_production_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
 branch_id uuid NOT NULL,formula_id uuid NOT NULL,warehouse_id uuid NOT NULL,sale_line_id uuid NULL,
 output_lot_number text NULL, batches integer NOT NULL CHECK(batches BETWEEN 1 AND 10000),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','completed','cancelled')),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 160),
 request_hash text NOT NULL CHECK(length(request_hash)=64),source_cost_minor integer NULL CHECK(source_cost_minor>=0),
 waste_cost_minor integer NULL CHECK(waste_cost_minor>=0),output_cost_minor integer NULL CHECK(output_cost_minor>=0),
 journal_id uuid NULL,created_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 approved_by_user_id uuid NULL REFERENCES public.users(id) ON DELETE RESTRICT,approved_at timestamptz(3) NULL,
 applied_at timestamptz(3) NULL,created_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,idempotency_key),UNIQUE(tenant_id,sale_line_id),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES public.branches(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,formula_id) REFERENCES public.inventory_formulas(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,sale_line_id) REFERENCES public.sale_lines(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,journal_id) REFERENCES public.ledger_journals(tenant_id,id) ON DELETE RESTRICT);
CREATE INDEX inventory_production_orders_branch_idx ON public.inventory_production_orders(tenant_id,branch_id,status,created_at DESC);
CREATE UNIQUE INDEX inventory_lots_tenant_identity_idx ON public.inventory_lots(tenant_id,id);
CREATE TABLE public.inventory_production_inputs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
 order_id uuid NOT NULL,formula_component_id uuid NOT NULL,source_lot_id uuid NOT NULL,
 required_quantity numeric(14,3) NOT NULL CHECK(required_quantity>0),
 waste_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(waste_quantity>=0),
 net_cost_minor integer NULL CHECK(net_cost_minor>=0),waste_cost_minor integer NULL CHECK(waste_cost_minor>=0),
 issue_movement_id uuid NULL,waste_movement_id uuid NULL,UNIQUE(tenant_id,id),UNIQUE(tenant_id,order_id,formula_component_id),
 FOREIGN KEY(tenant_id,order_id) REFERENCES public.inventory_production_orders(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,formula_component_id) REFERENCES public.inventory_formula_components(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,source_lot_id) REFERENCES public.inventory_lots(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(issue_movement_id) REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
 FOREIGN KEY(waste_movement_id) REFERENCES public.stock_movements(id) ON DELETE RESTRICT);
CREATE INDEX inventory_production_inputs_lot_idx ON public.inventory_production_inputs(tenant_id,source_lot_id);

CREATE FUNCTION public.lexa_production_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Posted production evidence cannot be deleted' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='inventory_formulas' AND OLD.status IN ('approved','retired') THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.branch_id IS DISTINCT FROM OLD.branch_id OR
       NEW.kind IS DISTINCT FROM OLD.kind OR NEW.output_product_id IS DISTINCT FROM OLD.output_product_id OR
       NEW.output_variant_id IS DISTINCT FROM OLD.output_variant_id OR NEW.output_quantity IS DISTINCT FROM OLD.output_quantity OR
       NEW.name IS DISTINCT FROM OLD.name THEN
      RAISE EXCEPTION 'Approved formula content is immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_TABLE_NAME='inventory_formula_components' AND EXISTS(
    SELECT 1 FROM public.inventory_formulas f WHERE f.tenant_id=OLD.tenant_id AND f.id=OLD.formula_id AND f.status<>'draft'
  ) THEN RAISE EXCEPTION 'Approved formula ingredients are immutable' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='inventory_production_orders' AND OLD.status='completed' THEN
    RAISE EXCEPTION 'Completed production cannot be modified' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='inventory_production_inputs' AND EXISTS(
    SELECT 1 FROM public.inventory_production_orders o WHERE o.tenant_id=OLD.tenant_id AND o.id=OLD.order_id AND o.status='completed'
  ) THEN RAISE EXCEPTION 'Completed production inputs are immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_formula_guard BEFORE UPDATE OR DELETE ON public.inventory_formulas FOR EACH ROW EXECUTE FUNCTION public.lexa_production_version_guard();
CREATE TRIGGER inventory_formula_components_guard BEFORE UPDATE OR DELETE ON public.inventory_formula_components FOR EACH ROW EXECUTE FUNCTION public.lexa_production_version_guard();
CREATE TRIGGER inventory_production_orders_guard BEFORE UPDATE OR DELETE ON public.inventory_production_orders FOR EACH ROW EXECUTE FUNCTION public.lexa_production_version_guard();
CREATE TRIGGER inventory_production_inputs_guard BEFORE UPDATE OR DELETE ON public.inventory_production_inputs FOR EACH ROW EXECUTE FUNCTION public.lexa_production_version_guard();

CREATE FUNCTION public.lexa_immutable_conversion_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Published unit conversions cannot be changed or deleted; publish a new version' USING ERRCODE='23514'; END $$;
CREATE TRIGGER product_uom_conversions_immutable BEFORE UPDATE OR DELETE ON public.product_uom_conversions FOR EACH ROW EXECUTE FUNCTION public.lexa_immutable_conversion_policy();

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'business_divisions','product_division_links','product_uom_conversions',
  'inventory_formulas','inventory_formula_components','inventory_production_orders','inventory_production_inputs'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_scope ON public.%I FOR ALL USING (tenant_id::text = NULLIF(current_setting(''app.tenant_id'',true),'''')) WITH CHECK (tenant_id::text = NULLIF(current_setting(''app.tenant_id'',true),''''))',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.%I TO lexa_app_runtime',t);
  INSERT INTO public.platform_backup_inventory(table_name,disposition,domain,rationale,dependency_order)
   VALUES(t,'authoritative','industry_operations','Approved industry inventory transformations, document history and division reports; include in restore checksum validation',35)
   ON CONFLICT(table_name) DO UPDATE SET disposition=EXCLUDED.disposition,domain=EXCLUDED.domain,rationale=EXCLUDED.rationale,dependency_order=EXCLUDED.dependency_order;
 END LOOP;
END $$;

CREATE TABLE public.measured_stock_cuts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
 branch_id uuid NOT NULL,sale_line_id uuid NOT NULL,lot_id uuid NOT NULL,
 waste_quantity numeric(14,3) NOT NULL CHECK(waste_quantity>0),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 8 AND 500),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 160),
 request_hash text NOT NULL CHECK(length(request_hash)=64),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','posted','cancelled')),
 waste_cost_minor integer NULL CHECK(waste_cost_minor>=0),movement_id uuid NULL,journal_id uuid NULL,
 created_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 approved_by_user_id uuid NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 posted_at timestamptz(3) NULL,created_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,sale_line_id),UNIQUE(tenant_id,idempotency_key),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES public.branches(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,sale_line_id) REFERENCES public.sale_lines(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,lot_id) REFERENCES public.inventory_lots(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(movement_id) REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,journal_id) REFERENCES public.ledger_journals(tenant_id,id) ON DELETE RESTRICT);
CREATE INDEX measured_stock_cuts_branch_idx ON public.measured_stock_cuts(tenant_id,branch_id,status);
CREATE FUNCTION public.lexa_measured_cut_posted_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND OLD.status='posted') THEN
  RAISE EXCEPTION 'Posted measured stock cuts are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER measured_stock_cuts_posted_immutable BEFORE UPDATE OR DELETE ON public.measured_stock_cuts
 FOR EACH ROW EXECUTE FUNCTION public.lexa_measured_cut_posted_guard();
ALTER TABLE public.measured_stock_cuts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measured_stock_cuts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON public.measured_stock_cuts FOR ALL
 USING (tenant_id::text = NULLIF(current_setting('app.tenant_id',true),''))
 WITH CHECK (tenant_id::text = NULLIF(current_setting('app.tenant_id',true),''));
GRANT SELECT,INSERT,UPDATE ON public.measured_stock_cuts TO lexa_app_runtime;
INSERT INTO public.platform_backup_inventory(table_name,disposition,domain,rationale,dependency_order)
 VALUES('measured_stock_cuts','authoritative','industry_operations','Immutable sale-linked measured stock loss and posted valuation evidence',35)
 ON CONFLICT(table_name) DO UPDATE SET disposition=EXCLUDED.disposition,domain=EXCLUDED.domain,rationale=EXCLUDED.rationale,dependency_order=EXCLUDED.dependency_order;
