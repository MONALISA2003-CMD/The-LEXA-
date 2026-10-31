-- Workstream 5: procurement, warehouse execution, manufacturing and traceability.
-- All inventory quantity changes are recorded in stock_movements; operational
-- documents are linked back to those movements and existing AP purchase orders.

ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'supplier_return';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'production_issue';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'production_receipt';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'count_adjustment';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'quarantine';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'release';

-- Supplier master records are mirrored to module_records.suppliers so legacy
-- purchase orders and Accounts Payable can continue to resolve supplier IDs.
CREATE TABLE IF NOT EXISTS procurement_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  supplier_code text NOT NULL, name text NOT NULL, email text, phone text, address text,
  tax_number text, currency char(3) NOT NULL DEFAULT 'UGX', payment_terms text,
  lead_time_days integer NOT NULL DEFAULT 0 CHECK(lead_time_days>=0), status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','blocked')),
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,supplier_code), UNIQUE(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS procurement_suppliers_branch_status_idx ON procurement_suppliers(tenant_id,branch_id,status,name);

CREATE TABLE IF NOT EXISTS procurement_purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT, request_number text NOT NULL,
  title text NOT NULL, required_date date, delivery_location text, notes text,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','rejected','rfq_created','cancelled')),
  requested_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz(3), created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,request_number), UNIQUE(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS procurement_purchase_requests_branch_status_idx ON procurement_purchase_requests(tenant_id,branch_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS procurement_purchase_request_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, request_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT, quantity numeric(14,3) NOT NULL CHECK(quantity>0),
  required_date date, notes text, created_at timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,request_id) REFERENCES procurement_purchase_requests(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS procurement_pr_lines_request_idx ON procurement_purchase_request_lines(tenant_id,request_id);

CREATE TABLE IF NOT EXISTS procurement_rfqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  rfq_number text NOT NULL, purchase_request_id uuid, title text NOT NULL, currency char(3) NOT NULL DEFAULT 'UGX', response_deadline date,
  delivery_location text, delivery_terms text, notes text,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','closed','awarded','cancelled')),
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, issued_at timestamptz(3), closed_at timestamptz(3), created_at timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,purchase_request_id) REFERENCES procurement_purchase_requests(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE(tenant_id,rfq_number), UNIQUE(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS procurement_rfqs_branch_status_idx ON procurement_rfqs(tenant_id,branch_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS procurement_rfq_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, rfq_id uuid NOT NULL,
  purchase_request_line_id uuid, product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL CHECK(quantity>0), required_date date, specification text,
  FOREIGN KEY(tenant_id,rfq_id) REFERENCES procurement_rfqs(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(purchase_request_line_id) REFERENCES procurement_purchase_request_lines(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS procurement_rfq_lines_rfq_idx ON procurement_rfq_lines(tenant_id,rfq_id);
CREATE TABLE IF NOT EXISTS procurement_rfq_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, rfq_id uuid NOT NULL, supplier_id uuid NOT NULL,
  invited_at timestamptz(3) NOT NULL DEFAULT now(), responded_at timestamptz(3), status text NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','responded','declined','withdrawn')),
  FOREIGN KEY(tenant_id,rfq_id) REFERENCES procurement_rfqs(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,supplier_id) REFERENCES procurement_suppliers(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE(tenant_id,rfq_id,supplier_id)
);
CREATE TABLE IF NOT EXISTS supplier_quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL, rfq_id uuid NOT NULL, supplier_id uuid NOT NULL,
  quotation_number text NOT NULL, currency char(3) NOT NULL DEFAULT 'UGX', valid_until date NOT NULL,
  lead_time_days integer NOT NULL DEFAULT 0 CHECK(lead_time_days>=0), delivery_terms text, payment_terms text, notes text,
  subtotal_minor bigint NOT NULL DEFAULT 0 CHECK(subtotal_minor>=0), status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','withdrawn','expired','selected','rejected')),
  submitted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL, submitted_at timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,rfq_id) REFERENCES procurement_rfqs(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,supplier_id) REFERENCES procurement_suppliers(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE(tenant_id,quotation_number), UNIQUE(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS supplier_quotations_rfq_idx ON supplier_quotations(tenant_id,rfq_id,status);
CREATE TABLE IF NOT EXISTS supplier_quotation_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, quotation_id uuid NOT NULL,
  rfq_line_id uuid NOT NULL, product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL CHECK(quantity>0), unit_cost_minor integer NOT NULL CHECK(unit_cost_minor>=0),
  line_total_minor bigint NOT NULL CHECK(line_total_minor>=0), notes text,
  FOREIGN KEY(tenant_id,quotation_id) REFERENCES supplier_quotations(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(rfq_line_id) REFERENCES procurement_rfq_lines(id) ON DELETE RESTRICT,
  UNIQUE(tenant_id,quotation_id,rfq_line_id)
);
CREATE TABLE IF NOT EXISTS procurement_approval_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL, min_amount_minor bigint NOT NULL DEFAULT 0 CHECK(min_amount_minor>=0), required_approvals integer NOT NULL DEFAULT 1 CHECK(required_approvals BETWEEN 1 AND 5),
  approver_roles text[] NOT NULL DEFAULT ARRAY['owner','admin','administrator','accountant']::text[], active boolean NOT NULL DEFAULT true,
  created_at timestamptz(3) NOT NULL DEFAULT now(), UNIQUE(tenant_id,name)
);
CREATE TABLE IF NOT EXISTS procurement_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL, rfq_id uuid NOT NULL,
  quotation_id uuid NOT NULL, supplier_id uuid NOT NULL, award_number text NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor>=0),
  currency char(3) NOT NULL DEFAULT 'UGX', status text NOT NULL DEFAULT 'pending_approval' CHECK(status IN ('pending_approval','approved','rejected','converted')),
  notes text, created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, approved_at timestamptz(3), created_at timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,rfq_id) REFERENCES procurement_rfqs(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,quotation_id) REFERENCES supplier_quotations(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,supplier_id) REFERENCES procurement_suppliers(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE(tenant_id,award_number), UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS procurement_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, award_id uuid NOT NULL,
  decision text NOT NULL CHECK(decision IN ('approved','rejected')), comments text,
  decided_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, decided_at timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,award_id) REFERENCES procurement_awards(tenant_id,id) ON DELETE CASCADE,
  UNIQUE(tenant_id,award_id,decided_by_user_id)
);
ALTER TABLE commerce_purchase_orders ADD COLUMN IF NOT EXISTS purchase_request_id uuid;
ALTER TABLE commerce_purchase_orders ADD COLUMN IF NOT EXISTS rfq_id uuid;
ALTER TABLE commerce_purchase_orders ADD COLUMN IF NOT EXISTS award_id uuid;
ALTER TABLE commerce_purchase_orders ADD COLUMN IF NOT EXISTS supplier_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS commerce_purchase_orders_award_key ON commerce_purchase_orders(tenant_id,award_id) WHERE award_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commerce_purchase_orders_procurement_idx ON commerce_purchase_orders(tenant_id,branch_id,purchase_request_id,rfq_id);

-- Transfer documents retain in-transit quantities separately from both source and destination.
CREATE TABLE IF NOT EXISTS inventory_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  transfer_number text NOT NULL, source_warehouse_id uuid NOT NULL, destination_warehouse_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','dispatched','partially_received','received','cancelled')),
  notes text, created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  dispatched_at timestamptz(3), received_at timestamptz(3), created_at timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,source_warehouse_id) REFERENCES warehouses(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,destination_warehouse_id) REFERENCES warehouses(tenant_id,id) ON DELETE RESTRICT,
  CHECK(source_warehouse_id<>destination_warehouse_id), UNIQUE(tenant_id,transfer_number), UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS inventory_transfer_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, transfer_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT, lot_id uuid, quantity numeric(14,3) NOT NULL CHECK(quantity>0),
  quantity_dispatched numeric(14,3) NOT NULL DEFAULT 0 CHECK(quantity_dispatched>=0), quantity_received numeric(14,3) NOT NULL DEFAULT 0 CHECK(quantity_received>=0 AND quantity_received<=quantity_dispatched), serial_ids uuid[] NOT NULL DEFAULT '{}',
  FOREIGN KEY(tenant_id,transfer_id) REFERENCES inventory_transfers(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,lot_id) REFERENCES inventory_lots(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS inventory_transfer_lines_transfer_idx ON inventory_transfer_lines(tenant_id,transfer_id);

CREATE TABLE IF NOT EXISTS inventory_stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL, warehouse_id uuid NOT NULL,
  count_number text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','reviewed','approved','posted','rejected','cancelled')),
  notes text, created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz(3), posted_at timestamptz(3), created_at timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,warehouse_id) REFERENCES warehouses(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE(tenant_id,count_number), UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS inventory_stock_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, count_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT, lot_id uuid,
  book_quantity numeric(14,3) NOT NULL DEFAULT 0, counted_quantity numeric(14,3), variance numeric(14,3),
  reason text, reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(tenant_id,count_id) REFERENCES inventory_stock_counts(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,lot_id) REFERENCES inventory_lots(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS inventory_stock_counts_status_idx ON inventory_stock_counts(tenant_id,branch_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS inventory_replenishment_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL, warehouse_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE, safety_stock numeric(14,3) NOT NULL DEFAULT 0 CHECK(safety_stock>=0),
  reorder_point numeric(14,3) NOT NULL DEFAULT 0 CHECK(reorder_point>=0), target_stock numeric(14,3) NOT NULL DEFAULT 0 CHECK(target_stock>=0), lead_time_days integer NOT NULL DEFAULT 0 CHECK(lead_time_days>=0),
  preferred_supplier_id uuid, active boolean NOT NULL DEFAULT true,
  FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,warehouse_id) REFERENCES warehouses(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(preferred_supplier_id) REFERENCES procurement_suppliers(id) ON DELETE SET NULL,
  UNIQUE(tenant_id,warehouse_id,product_id)
);

CREATE TABLE IF NOT EXISTS inventory_picklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  picklist_number text NOT NULL, warehouse_id uuid NOT NULL, source_type text, source_id text,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','released','picking','picked','packed','dispatched','cancelled')),
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,warehouse_id) REFERENCES warehouses(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE(tenant_id,picklist_number), UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS inventory_picklist_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, picklist_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT, lot_id uuid, quantity numeric(14,3) NOT NULL CHECK(quantity>0),
  quantity_picked numeric(14,3) NOT NULL DEFAULT 0 CHECK(quantity_picked>=0 AND quantity_picked<=quantity),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','partial','picked','short')), serial_ids uuid[] NOT NULL DEFAULT '{}',
  FOREIGN KEY(tenant_id,picklist_id) REFERENCES inventory_picklists(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,lot_id) REFERENCES inventory_lots(tenant_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS inventory_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL, picklist_id uuid NOT NULL,
  package_number text NOT NULL, carton_count integer NOT NULL DEFAULT 1 CHECK(carton_count>0), gross_weight numeric(12,3), net_weight numeric(12,3),
  weight_unit text NOT NULL DEFAULT 'kg', delivery_reference text, tracking_reference text, status text NOT NULL DEFAULT 'packed' CHECK(status IN ('packed','dispatched','delivered','void')),
  packed_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, packed_at timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,picklist_id) REFERENCES inventory_picklists(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE(tenant_id,package_number), UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS inventory_package_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, package_id uuid NOT NULL,
  picklist_line_id uuid NOT NULL, quantity numeric(14,3) NOT NULL CHECK(quantity>0),
  FOREIGN KEY(tenant_id,package_id) REFERENCES inventory_packages(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(picklist_line_id) REFERENCES inventory_picklist_lines(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS procurement_supplier_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  return_number text NOT NULL, supplier_id uuid NOT NULL, purchase_order_id uuid, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','dispatched','credited','rejected')),
  reason text NOT NULL, currency char(3) NOT NULL DEFAULT 'UGX', total_minor bigint NOT NULL DEFAULT 0 CHECK(total_minor>=0),
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  dispatched_at timestamptz(3), created_at timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,supplier_id) REFERENCES procurement_suppliers(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(purchase_order_id) REFERENCES commerce_purchase_orders(id) ON DELETE RESTRICT,
  UNIQUE(tenant_id,return_number), UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS procurement_supplier_return_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, return_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT, warehouse_id uuid NOT NULL, lot_id uuid,
  quantity numeric(14,3) NOT NULL CHECK(quantity>0), unit_cost_minor integer NOT NULL CHECK(unit_cost_minor>=0), reason text NOT NULL, serial_ids uuid[] NOT NULL DEFAULT '{}',
  FOREIGN KEY(tenant_id,return_id) REFERENCES procurement_supplier_returns(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,warehouse_id) REFERENCES warehouses(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,lot_id) REFERENCES inventory_lots(tenant_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS procurement_supplier_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL, supplier_id uuid NOT NULL,
  supplier_return_id uuid NOT NULL, note_number text NOT NULL, note_type text NOT NULL CHECK(note_type IN ('supplier_debit','supplier_credit')),
  amount_minor bigint NOT NULL CHECK(amount_minor>=0), currency char(3) NOT NULL DEFAULT 'UGX', status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','applied','void')),
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,supplier_id) REFERENCES procurement_suppliers(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,supplier_return_id) REFERENCES procurement_supplier_returns(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE(tenant_id,note_number)
);

-- Consumed serials remain traceable after they are issued as production components.
ALTER TABLE inventory_serials DROP CONSTRAINT IF EXISTS inventory_serials_status_check;
ALTER TABLE inventory_serials ADD CONSTRAINT inventory_serials_status_check CHECK(status IN ('available','reserved','sold','returned','quarantine','scrap','in_transit','consumed'));

-- BOMs and production orders carry actual material usage and finished-goods receipt.
CREATE TABLE IF NOT EXISTS manufacturing_boms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  bom_code text NOT NULL, product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  output_quantity numeric(14,3) NOT NULL DEFAULT 1 CHECK(output_quantity>0), version integer NOT NULL DEFAULT 1 CHECK(version>0),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','inactive')), notes text,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE(tenant_id,bom_code), UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS manufacturing_bom_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, bom_id uuid NOT NULL,
  component_product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_per_output numeric(14,3) NOT NULL CHECK(quantity_per_output>0), scrap_percent numeric(7,4) NOT NULL DEFAULT 0 CHECK(scrap_percent BETWEEN 0 AND 100), operation_name text, sequence integer NOT NULL DEFAULT 1,
  FOREIGN KEY(tenant_id,bom_id) REFERENCES manufacturing_boms(tenant_id,id) ON DELETE CASCADE,
  UNIQUE(tenant_id,bom_id,component_product_id,sequence)
);
CREATE TABLE IF NOT EXISTS manufacturing_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  work_order_number text NOT NULL, bom_id uuid NOT NULL, product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL, planned_quantity numeric(14,3) NOT NULL CHECK(planned_quantity>0), completed_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(completed_quantity>=0),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','released','in_progress','quality_hold','completed','cancelled')),
  planned_start date, due_date date, actual_material_cost_minor bigint NOT NULL DEFAULT 0 CHECK(actual_material_cost_minor>=0),
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, started_at timestamptz(3), completed_at timestamptz(3), created_at timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,bom_id) REFERENCES manufacturing_boms(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,warehouse_id) REFERENCES warehouses(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE(tenant_id,work_order_number), UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS manufacturing_work_order_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, work_order_id uuid NOT NULL,
  component_product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT, lot_id uuid,
  required_quantity numeric(14,3) NOT NULL CHECK(required_quantity>0), reserved_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(reserved_quantity>=0),
  consumed_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(consumed_quantity>=0 AND consumed_quantity<=required_quantity), unit_cost_minor integer NOT NULL DEFAULT 0, serial_ids uuid[] NOT NULL DEFAULT '{}',
  FOREIGN KEY(tenant_id,work_order_id) REFERENCES manufacturing_work_orders(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,lot_id) REFERENCES inventory_lots(tenant_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS manufacturing_job_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL, work_order_id uuid NOT NULL,
  card_number text NOT NULL, assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','completed','on_hold','cancelled')),
  started_at timestamptz(3), completed_at timestamptz(3), notes text, created_at timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,work_order_id) REFERENCES manufacturing_work_orders(tenant_id,id) ON DELETE CASCADE,
  UNIQUE(tenant_id,card_number), UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS manufacturing_job_card_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, job_card_id uuid NOT NULL,
  sequence integer NOT NULL, step_name text NOT NULL, instructions text, assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','blocked','skipped')),
  started_at timestamptz(3), completed_at timestamptz(3), actual_minutes integer CHECK(actual_minutes IS NULL OR actual_minutes>=0), notes text,
  FOREIGN KEY(tenant_id,job_card_id) REFERENCES manufacturing_job_cards(tenant_id,id) ON DELETE CASCADE,
  UNIQUE(tenant_id,job_card_id,sequence)
);
CREATE TABLE IF NOT EXISTS quality_inspection_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_code text NOT NULL, name text NOT NULL, product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  inspection_stage text NOT NULL CHECK(inspection_stage IN ('receiving','in_process','final')),
  active boolean NOT NULL DEFAULT true, created_at timestamptz(3) NOT NULL DEFAULT now(), UNIQUE(tenant_id,plan_code), UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS quality_inspection_plan_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, plan_id uuid NOT NULL,
  check_code text NOT NULL, description text NOT NULL, check_type text NOT NULL DEFAULT 'boolean' CHECK(check_type IN ('boolean','numeric','text')),
  required boolean NOT NULL DEFAULT true, minimum_value numeric, maximum_value numeric, sequence integer NOT NULL DEFAULT 1,
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,plan_id) REFERENCES quality_inspection_plans(tenant_id,id) ON DELETE CASCADE,
  UNIQUE(tenant_id,plan_id,check_code)
);
CREATE TABLE IF NOT EXISTS quality_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  inspection_number text NOT NULL, plan_id uuid NOT NULL, product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  lot_id uuid, work_order_id uuid, source_type text, source_id text, inspected_quantity numeric(14,3) NOT NULL CHECK(inspected_quantity>0),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','passed','failed','quarantined','released')),
  decision_notes text, inspected_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  inspected_at timestamptz(3) NOT NULL DEFAULT now(), decided_at timestamptz(3),
  FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,plan_id) REFERENCES quality_inspection_plans(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,lot_id) REFERENCES inventory_lots(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,work_order_id) REFERENCES manufacturing_work_orders(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE(tenant_id,inspection_number), UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS quality_inspection_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, inspection_id uuid NOT NULL, plan_check_id uuid NOT NULL,
  boolean_value boolean, numeric_value numeric, text_value text, passed boolean, comments text,
  FOREIGN KEY(tenant_id,inspection_id) REFERENCES quality_inspections(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,plan_check_id) REFERENCES quality_inspection_plan_checks(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE(tenant_id,inspection_id,plan_check_id)
);

-- Supplier provenance and manufacture/expiry dating stay on each lot.
ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS manufactured_date date;
ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS supplier_id uuid;
ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS source_receipt_line_id uuid;
ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS source_work_order_id uuid;
ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS trace_notes text;
ALTER TABLE inventory_lots ADD CONSTRAINT inventory_lots_supplier_fk FOREIGN KEY(tenant_id,supplier_id) REFERENCES procurement_suppliers(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE inventory_lots ADD CONSTRAINT inventory_lots_receipt_line_fk FOREIGN KEY(source_receipt_line_id) REFERENCES commerce_goods_receipt_lines(id) ON DELETE SET NULL;
ALTER TABLE inventory_lots ADD CONSTRAINT inventory_lots_work_order_fk FOREIGN KEY(source_work_order_id) REFERENCES manufacturing_work_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS inventory_lots_trace_supplier_idx ON inventory_lots(tenant_id,supplier_id,product_id,expiry_date);
CREATE INDEX IF NOT EXISTS inventory_lots_trace_work_order_idx ON inventory_lots(tenant_id,source_work_order_id);

-- Tenant isolation for every new entity. Branch access is additionally checked
-- in the controller's session/role guard before any business operation.
DO $$ DECLARE t text; p text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
  'procurement_suppliers','procurement_purchase_requests','procurement_purchase_request_lines','procurement_rfqs','procurement_rfq_lines','procurement_rfq_suppliers','supplier_quotations','supplier_quotation_lines','procurement_approval_rules','procurement_awards','procurement_approvals',
  'inventory_transfers','inventory_transfer_lines','inventory_stock_counts','inventory_stock_count_lines','inventory_replenishment_policies','inventory_picklists','inventory_picklist_lines','inventory_packages','inventory_package_lines','procurement_supplier_returns','procurement_supplier_return_lines','procurement_supplier_notes',
  'manufacturing_boms','manufacturing_bom_lines','manufacturing_work_orders','manufacturing_work_order_materials','manufacturing_job_cards','manufacturing_job_card_steps','quality_inspection_plans','quality_inspection_plan_checks','quality_inspections','quality_inspection_results'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  p := left(t||'_tenant_scope',60);
  EXECUTE format('CREATE POLICY %I ON public.%I USING (tenant_id::text=NULLIF(current_setting(''app.tenant_id'',true),'''')) WITH CHECK (tenant_id::text=NULLIF(current_setting(''app.tenant_id'',true),''''))',p,t);
 END LOOP;
END $$;
