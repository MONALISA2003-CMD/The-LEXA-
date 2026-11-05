-- Electronics equipment service, exact serial delivery and warranty.
-- Additive only: never changes historical stock, posted payments, receipts or sale snapshots.
CREATE TABLE public.equipment_upgrade_work_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,branch_id uuid NOT NULL,
 serial_id uuid NOT NULL, idempotency_key text NOT NULL CHECK(length(btrim(idempotency_key)) BETWEEN 8 AND 160),
 request_hash text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','applied','cancelled')),
 before_specs jsonb NOT NULL DEFAULT '{}'::jsonb, after_specs jsonb NOT NULL DEFAULT '{}'::jsonb,
 inspection jsonb NOT NULL DEFAULT '{}'::jsonb,
 initial_cost_minor integer NOT NULL CHECK(initial_cost_minor>=0),
 parts_cost_minor integer NOT NULL DEFAULT 0 CHECK(parts_cost_minor>=0),
 labour_cost_minor integer NOT NULL DEFAULT 0 CHECK(labour_cost_minor>=0),
 journal_id uuid,created_by_user_id uuid NOT NULL,approved_by_user_id uuid,
 approved_at timestamptz(3),applied_at timestamptz(3),
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,idempotency_key),
 FOREIGN KEY(tenant_id,serial_id) REFERENCES public.inventory_serials(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,branch_id) REFERENCES public.branches(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
 FOREIGN KEY(approved_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
 FOREIGN KEY(journal_id) REFERENCES public.ledger_journals(id) ON DELETE RESTRICT
);
CREATE INDEX equipment_upgrade_serial_idx ON public.equipment_upgrade_work_orders(tenant_id,serial_id,created_at DESC);

CREATE TABLE public.equipment_upgrade_parts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,work_order_id uuid NOT NULL,
 product_id uuid NOT NULL,variant_id uuid,warehouse_id uuid NOT NULL,lot_id uuid,
 quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 actual_unit_cost_minor integer CHECK(actual_unit_cost_minor>=0), movement_id uuid,
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,work_order_id) REFERENCES public.equipment_upgrade_work_orders(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,product_id) REFERENCES public.products(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,product_id,variant_id) REFERENCES public.product_variants(tenant_id,product_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,warehouse_id) REFERENCES public.warehouses(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,lot_id) REFERENCES public.inventory_lots(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(movement_id) REFERENCES public.stock_movements(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX equipment_upgrade_part_movement_idx ON public.equipment_upgrade_parts(movement_id) WHERE movement_id IS NOT NULL;
CREATE INDEX equipment_upgrade_parts_order_idx ON public.equipment_upgrade_parts(tenant_id,work_order_id);

CREATE TABLE public.equipment_unit_configuration_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,branch_id uuid NOT NULL,
 serial_id uuid NOT NULL,work_order_id uuid NOT NULL,
 previous_specs jsonb NOT NULL,configured_specs jsonb NOT NULL,
 initial_cost_minor integer NOT NULL CHECK(initial_cost_minor>=0),
 added_cost_minor integer NOT NULL CHECK(added_cost_minor>=0),
 resulting_cost_minor integer NOT NULL CHECK(resulting_cost_minor>=0),
 recorded_by_user_id uuid NOT NULL,recorded_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,work_order_id),
 FOREIGN KEY(tenant_id,serial_id) REFERENCES public.inventory_serials(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,work_order_id) REFERENCES public.equipment_upgrade_work_orders(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(recorded_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT
);
CREATE INDEX equipment_unit_configuration_history_idx ON public.equipment_unit_configuration_events(tenant_id,serial_id,recorded_at DESC);

-- A serial is sold once in the sale ledger; delivery changes custody, never stock count.
CREATE TABLE public.equipment_unit_fulfilments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,branch_id uuid NOT NULL,
 sale_line_id uuid NOT NULL,serial_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN('reserved','picked','dispatched','delivered','delivery_failed','returned_to_warehouse','cancelled')),
 assigned_technician_user_id uuid,delivered_at timestamptz(3),
 created_by_user_id uuid NOT NULL,created_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,serial_id),
 FOREIGN KEY(tenant_id,serial_id) REFERENCES public.inventory_serials(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,sale_line_id) REFERENCES public.sale_lines(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,branch_id) REFERENCES public.branches(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(assigned_technician_user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
 FOREIGN KEY(created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT
);
CREATE INDEX equipment_fulfilment_branch_idx ON public.equipment_unit_fulfilments(tenant_id,branch_id,state,created_at DESC);

CREATE TABLE public.equipment_fulfilment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,fulfilment_id uuid NOT NULL,
 previous_state text, next_state text NOT NULL,
 evidence_reference text CHECK(evidence_reference IS NULL OR length(evidence_reference)<=250),
 checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
 actor_user_id uuid NOT NULL,created_at timestamptz(3) NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,fulfilment_id) REFERENCES public.equipment_unit_fulfilments(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(actor_user_id) REFERENCES public.users(id) ON DELETE RESTRICT
);
CREATE INDEX equipment_fulfilment_events_idx ON public.equipment_fulfilment_events(tenant_id,fulfilment_id,created_at DESC);

CREATE TABLE public.equipment_installed_systems (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,branch_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('split_ac','cctv','network','appliance','office')),
 sale_id uuid NOT NULL, state text NOT NULL DEFAULT 'planned' CHECK(state IN('planned','installed','commissioned','service_required','decommissioned')),
 technician_user_id uuid,commissioning jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_by_user_id uuid NOT NULL,created_at timestamptz(3) NOT NULL DEFAULT now(),
 commissioned_at timestamptz(3),UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES public.branches(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,sale_id) REFERENCES public.sales(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(technician_user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
 FOREIGN KEY(created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT
);
CREATE TABLE public.equipment_installed_components (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,
 system_id uuid NOT NULL,serial_id uuid NOT NULL,
 component_role text NOT NULL CHECK(component_role IN('indoor','outdoor','camera','recorder','network','peripheral','base')),
 UNIQUE(tenant_id,serial_id),UNIQUE(tenant_id,system_id,component_role,serial_id),
 FOREIGN KEY(tenant_id,system_id) REFERENCES public.equipment_installed_systems(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,serial_id) REFERENCES public.inventory_serials(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX equipment_system_components_idx ON public.equipment_installed_components(tenant_id,system_id);

CREATE TABLE public.equipment_warranty_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,branch_id uuid NOT NULL,
 sale_line_id uuid NOT NULL,serial_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'opened' CHECK(status IN('opened','inspecting','repair_approved','repairing','replaced','closed','rejected')),
 issue_summary text NOT NULL CHECK(length(btrim(issue_summary)) BETWEEN 5 AND 500),
 warranty_policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 parts_journal_id uuid, created_by_user_id uuid NOT NULL,
 created_at timestamptz(3) NOT NULL DEFAULT now(),resolved_at timestamptz(3),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,serial_id) REFERENCES public.inventory_serials(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,sale_line_id) REFERENCES public.sale_lines(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
 FOREIGN KEY(parts_journal_id) REFERENCES public.ledger_journals(id) ON DELETE RESTRICT
);
CREATE INDEX equipment_warranty_unit_idx ON public.equipment_warranty_cases(tenant_id,serial_id,created_at DESC);

-- Customer-owned repairs never refer to merchant stock movements or inventory units.
CREATE TABLE public.equipment_customer_repair_custody (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,branch_id uuid NOT NULL,
 customer_record_id text, device_description text NOT NULL CHECK(length(btrim(device_description)) BETWEEN 3 AND 300),
 manufacturer_serial_masked text,consent_reference text NOT NULL,
 status text NOT NULL DEFAULT 'received' CHECK(status IN('received','diagnosing','repairing','ready_for_collection','released','abandoned_review')),
 intake_condition jsonb NOT NULL DEFAULT '{}'::jsonb,
 received_by_user_id uuid NOT NULL,created_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES public.branches(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(received_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT
);
CREATE INDEX equipment_repair_custody_branch_idx ON public.equipment_customer_repair_custody(tenant_id,branch_id,status);

CREATE TABLE public.equipment_copier_meter_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,branch_id uuid NOT NULL,
 serial_id uuid NOT NULL,total_count bigint NOT NULL CHECK(total_count>=0),
 colour_count bigint NOT NULL DEFAULT 0 CHECK(colour_count>=0 AND colour_count<=total_count),
 evidence_reference text, recorded_by_user_id uuid NOT NULL,
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,serial_id) REFERENCES public.inventory_serials(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(recorded_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT
);
CREATE INDEX equipment_copier_meter_idx ON public.equipment_copier_meter_events(tenant_id,serial_id,created_at DESC);

-- Immutable primary history: no one may silently alter an approved unit cost or delivery evidence.
CREATE FUNCTION public.lexa_electronics_immutable_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Posted equipment history is append-only' USING ERRCODE='23514'; END $$;
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['equipment_unit_configuration_events','equipment_fulfilment_events','equipment_copier_meter_events'] LOOP
  EXECUTE format('CREATE TRIGGER electronics_immutable_history BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.lexa_electronics_immutable_event()',name);
 END LOOP;
END $$;
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['equipment_upgrade_work_orders','equipment_upgrade_parts','equipment_unit_configuration_events',
 'equipment_unit_fulfilments','equipment_fulfilment_events','equipment_installed_systems','equipment_installed_components',
 'equipment_warranty_cases','equipment_customer_repair_custody','equipment_copier_meter_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY tenant_scope ON public.%I FOR ALL USING (tenant_id::text=NULLIF(current_setting(''app.tenant_id'',true),'''')) WITH CHECK(tenant_id::text=NULLIF(current_setting(''app.tenant_id'',true),''''))',name);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.%I TO lexa_app_runtime',name);
 END LOOP;
END $$;
-- Backup/restore must include all new relational, cost and after-sales evidence.
INSERT INTO public.platform_backup_inventory(table_name,disposition,domain,rationale,dependency_order) VALUES
('equipment_upgrade_work_orders','authoritative','inventory','Approved exact-unit modification work orders and cost history',80),
('equipment_upgrade_parts','authoritative','inventory','Stock component consumption and immutable price evidence',81),
('equipment_unit_configuration_events','authoritative','inventory','Effective serial-specific manufacturer versus merchant configuration snapshots',82),
('equipment_unit_fulfilments','authoritative','fulfilment','One sold unit linked to a delivery custody lifecycle',83),
('equipment_fulfilment_events','authoritative','fulfilment','Append-only proof of delivery and failure audit',84),
('equipment_installed_systems','authoritative','fulfilment','Customer systems distinct from warehouse stock',85),
('equipment_installed_components','authoritative','fulfilment','Exact indoor and outdoor AC/component unit mappings',86),
('equipment_warranty_cases','authoritative','support','Original-sale warranty evidence and service cases',87),
('equipment_customer_repair_custody','authoritative','support','Customer repair custody never counted as merchant inventory',88),
('equipment_copier_meter_events','authoritative','support','Append-only printer/copier service meter history',89)
ON CONFLICT(table_name) DO UPDATE SET disposition=EXCLUDED.disposition,domain=EXCLUDED.domain,rationale=EXCLUDED.rationale,dependency_order=EXCLUDED.dependency_order;
