-- Seller-warranty decisions and exact repair-part issues.
-- No existing warranty case, serial, lot, stock or journal identity is replaced.
CREATE TABLE public.equipment_warranty_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,branch_id uuid NOT NULL,case_id uuid NOT NULL,
 previous_status text NOT NULL,
 next_status text NOT NULL CHECK(next_status IN ('opened','inspecting','repair_approved','repairing','rejected','closed')),
 coverage_decision text NULL CHECK(coverage_decision IN ('seller_warranty','goodwill','manufacturer_warranty','out_of_warranty','not_covered')),
 evidence_reference text NOT NULL CHECK(length(btrim(evidence_reference)) BETWEEN 1 AND 250),
 notes text NOT NULL CHECK(length(btrim(notes)) BETWEEN 8 AND 1000),
 actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,case_id) REFERENCES public.equipment_warranty_cases(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,branch_id) REFERENCES public.branches(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX equipment_warranty_events_case_time_idx ON public.equipment_warranty_events(tenant_id,case_id,created_at DESC);

CREATE TABLE public.equipment_warranty_parts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,branch_id uuid NOT NULL,case_id uuid NOT NULL,
 product_id uuid NOT NULL,variant_id uuid NULL,
 warehouse_id uuid NOT NULL,lot_id uuid NOT NULL,
 quantity numeric(14,3) NOT NULL CHECK(quantity>0 AND quantity<=1000000),
 unit_cost_minor integer NOT NULL CHECK(unit_cost_minor>0),
 total_cost_minor integer NOT NULL CHECK(total_cost_minor>0),
 movement_id uuid NOT NULL REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
 journal_id uuid NOT NULL REFERENCES public.ledger_journals(id) ON DELETE RESTRICT,
 evidence_reference text NOT NULL CHECK(length(btrim(evidence_reference)) BETWEEN 1 AND 250),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 160),
 request_hash text NOT NULL CHECK(length(request_hash)=64),
 issued_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 posted_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,idempotency_key),
 FOREIGN KEY(tenant_id,case_id) REFERENCES public.equipment_warranty_cases(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,branch_id) REFERENCES public.branches(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,product_id) REFERENCES public.products(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,product_id,variant_id) REFERENCES public.product_variants(tenant_id,product_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,lot_id) REFERENCES public.inventory_lots(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX equipment_warranty_parts_case_time_idx ON public.equipment_warranty_parts(tenant_id,case_id,posted_at DESC);

CREATE FUNCTION public.lexa_warranty_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Posted warranty evidence cannot be edited or deleted' USING ERRCODE='23514'; END $$;
CREATE TRIGGER equipment_warranty_events_immutable BEFORE UPDATE OR DELETE ON public.equipment_warranty_events
 FOR EACH ROW EXECUTE FUNCTION public.lexa_warranty_evidence_immutable();
CREATE TRIGGER equipment_warranty_parts_immutable BEFORE UPDATE OR DELETE ON public.equipment_warranty_parts
 FOR EACH ROW EXECUTE FUNCTION public.lexa_warranty_evidence_immutable();
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['equipment_warranty_events','equipment_warranty_parts'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY tenant_scope ON public.%I FOR ALL USING (tenant_id::text = NULLIF(current_setting(''app.tenant_id'',true),'''')) WITH CHECK (tenant_id::text = NULLIF(current_setting(''app.tenant_id'',true),''''))',name);
  EXECUTE format('GRANT SELECT,INSERT ON public.%I TO lexa_app_runtime',name);
  INSERT INTO public.platform_backup_inventory(table_name,disposition,domain,rationale,dependency_order)
  VALUES(name,'authoritative','equipment_service','Original-sale warranty state decisions, immutable repair parts, physical stock movements and expense journals',88)
  ON CONFLICT(table_name) DO UPDATE SET disposition=EXCLUDED.disposition,domain=EXCLUDED.domain,rationale=EXCLUDED.rationale,dependency_order=EXCLUDED.dependency_order;
 END LOOP;
END $$;
