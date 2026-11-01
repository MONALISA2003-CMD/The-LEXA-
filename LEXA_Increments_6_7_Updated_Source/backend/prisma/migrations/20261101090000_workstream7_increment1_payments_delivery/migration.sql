-- Workstream 7 / Increment 1. Additive: preserve existing sale payments and
-- legacy commerce deliveries, while making both workflows auditable and batchable.

-- Tenant-safe parent keys used by child records in this increment.
CREATE UNIQUE INDEX IF NOT EXISTS sales_tenant_id_id_key ON sales(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS sale_lines_tenant_id_id_key ON sale_lines(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_id_id_key ON products(tenant_id, id);

-- Enrich the existing payment ledger; do not create a second receipts ledger.
ALTER TABLE sale_payments
  ADD COLUMN IF NOT EXISTS method_category text,
  ADD COLUMN IF NOT EXISTS method_label text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS reported_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS recorded_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS request_hash text,
  ADD COLUMN IF NOT EXISTS reversal_of_payment_id uuid,
  ADD COLUMN IF NOT EXISTS delivery_id uuid;

UPDATE sale_payments
SET method_category = COALESCE(method_category, CASE
      WHEN lower(method) = 'cash' THEN 'cash'
      WHEN lower(method) IN ('mtn_momo','airtel_money','mobile_money') THEN 'mobile_money'
      WHEN lower(method) IN ('bank_transfer','bank') THEN 'bank_transfer'
      WHEN lower(method) IN ('card_recorded','card') THEN 'card'
      WHEN lower(method) = 'cheque' THEN 'cheque'
      ELSE 'other'
    END),
    method_label = COALESCE(method_label, CASE
      WHEN lower(method) = 'mtn_momo' THEN 'MTN'
      WHEN lower(method) = 'airtel_money' THEN 'Airtel'
      ELSE NULL
    END),
    recorded_at = COALESCE(recorded_at, created_at),
    source_type = COALESCE(source_type, CASE ledger_source
      WHEN 'sale_completed' THEN 'checkout'
      WHEN 'sale_payment_received' THEN 'instalment'
      WHEN 'sale_return_recorded' THEN 'refund'
      WHEN 'customer_receipt_recorded' THEN 'customer_receipt'
      ELSE 'legacy'
    END);

ALTER TABLE sale_payments
  ALTER COLUMN method_category SET DEFAULT 'other',
  ALTER COLUMN method_category SET NOT NULL,
  ALTER COLUMN recorded_at SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN recorded_at SET NOT NULL;

ALTER TABLE sale_payments
  ADD CONSTRAINT sale_payments_method_category_check
    CHECK (method_category = ANY (ARRAY['cash','mobile_money','bank_transfer','card','cheque','other'])),
  ADD CONSTRAINT sale_payments_source_type_check
    CHECK (source_type IS NULL OR source_type = ANY (ARRAY['checkout','instalment','refund','correction','rider_remittance','customer_receipt','legacy'])),
  ADD CONSTRAINT sale_payments_amount_positive_check CHECK (amount_minor > 0);

CREATE UNIQUE INDEX IF NOT EXISTS sale_payments_tenant_id_id_key ON sale_payments(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS sale_payments_tenant_id_idempotency_key_key
  ON sale_payments(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS sale_payments_tenant_method_created_idx
  ON sale_payments(tenant_id, method_category, created_at DESC);
CREATE INDEX IF NOT EXISTS sale_payments_tenant_recorder_created_idx
  ON sale_payments(tenant_id, recorded_by_user_id, recorded_at DESC);

-- Replace the legacy sale-only payment FK with a tenant-safe composite FK.
ALTER TABLE sale_payments DROP CONSTRAINT IF EXISTS sale_payments_sale_id_fkey;
ALTER TABLE sale_payments
  ADD CONSTRAINT sale_payments_tenant_sale_fkey
  FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE sale_payments
  ADD CONSTRAINT sale_payments_recorded_by_user_fkey
  FOREIGN KEY (recorded_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sale_payments
  ADD CONSTRAINT sale_payments_reversal_same_tenant_fkey
  FOREIGN KEY (tenant_id, reversal_of_payment_id) REFERENCES sale_payments(tenant_id, id) ON DELETE RESTRICT;

-- Manual directory for riders and transport contacts. No carrier integration.
CREATE TABLE commerce_delivery_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  default_branch_id uuid,
  display_name text NOT NULL,
  phone text,
  agent_type text NOT NULL,
  transport_description text,
  employee_record_id text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT commerce_delivery_agents_type_check CHECK (agent_type = ANY (ARRAY[
    'employee','internal_rider','independent_rider','bus_operator','transport_partner','courier_contact','other'
  ])),
  CONSTRAINT commerce_delivery_agents_tenant_branch_fkey
    FOREIGN KEY (tenant_id, default_branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT commerce_delivery_agents_tenant_id_key UNIQUE (tenant_id, id)
);
CREATE INDEX commerce_delivery_agents_active_name_idx ON commerce_delivery_agents(tenant_id, active, display_name);
CREATE INDEX commerce_delivery_agents_branch_idx ON commerce_delivery_agents(tenant_id, default_branch_id, active);

-- Extend the existing fulfilment/delivery header to support direct POS dispatches
-- and multiple batches from the same fulfilment/sale.
ALTER TABLE commerce_deliveries
  ALTER COLUMN fulfilment_id DROP NOT NULL,
  ADD COLUMN sale_id uuid,
  ADD COLUMN recipient_phone text,
  ADD COLUMN destination_area text,
  ADD COLUMN destination_town text,
  ADD COLUMN delivery_instructions text,
  ADD COLUMN delivery_method text NOT NULL DEFAULT 'other',
  ADD COLUMN delivery_agent_id uuid,
  ADD COLUMN transport_details text,
  ADD COLUMN delivery_expense_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN expected_collection_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN assigned_at timestamptz,
  ADD COLUMN picked_up_at timestamptz,
  ADD COLUMN picked_up_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN recipient_confirmation text,
  ADD COLUMN failure_reason text,
  ADD COLUMN returned_at timestamptz,
  ADD COLUMN return_reason text,
  ADD COLUMN idempotency_key text,
  ADD COLUMN request_hash text;

UPDATE commerce_deliveries d
SET sale_id = f.sale_id,
    delivery_method = CASE WHEN d.courier IS NOT NULL AND trim(d.courier) <> '' THEN 'courier_manual' ELSE 'other' END
FROM commerce_fulfilments f
WHERE f.id = d.fulfilment_id AND d.sale_id IS NULL;

ALTER TABLE commerce_deliveries
  ADD CONSTRAINT commerce_deliveries_tenant_sale_fkey
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT commerce_deliveries_tenant_agent_fkey
    FOREIGN KEY (tenant_id, delivery_agent_id) REFERENCES commerce_delivery_agents(tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT commerce_deliveries_expense_nonnegative_check CHECK (delivery_expense_minor >= 0),
  ADD CONSTRAINT commerce_deliveries_expected_collection_nonnegative_check CHECK (expected_collection_minor >= 0),
  ADD CONSTRAINT commerce_deliveries_method_check CHECK (delivery_method = ANY (ARRAY[
    'business_rider','independent_rider','bus','transport_company','courier_manual','customer_pickup','business_employee','other'
  ]));

ALTER TABLE commerce_deliveries DROP CONSTRAINT IF EXISTS commerce_deliveries_status_check;
ALTER TABLE commerce_deliveries
  ADD CONSTRAINT commerce_deliveries_status_check CHECK (status = ANY (ARRAY[
    'prepared','assigned','picked_up','in_transit','delivered','delivery_failed','return_pending','returned','cancelled','dispatched'
  ]));

DROP INDEX IF EXISTS commerce_deliveries_fulfilment_key;
CREATE UNIQUE INDEX commerce_deliveries_tenant_id_id_key ON commerce_deliveries(tenant_id, id);
CREATE UNIQUE INDEX commerce_deliveries_tenant_idempotency_key_key
  ON commerce_deliveries(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX commerce_deliveries_sale_status_idx ON commerce_deliveries(tenant_id, branch_id, sale_id, status, dispatched_at DESC);
CREATE INDEX commerce_deliveries_agent_status_idx ON commerce_deliveries(tenant_id, delivery_agent_id, status, dispatched_at DESC);

-- A direct-to-business payment may be reconciled to a dispatch without being
-- misclassified as a rider collection report.
ALTER TABLE sale_payments
  ADD CONSTRAINT sale_payments_tenant_delivery_fkey
  FOREIGN KEY (tenant_id, delivery_id) REFERENCES commerce_deliveries(tenant_id, id) ON DELETE RESTRICT;
CREATE INDEX sale_payments_tenant_delivery_idx ON sale_payments(tenant_id, delivery_id, created_at DESC) WHERE delivery_id IS NOT NULL;

-- Immutable product/price/cost snapshots for each dispatch batch.
CREATE TABLE commerce_delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  delivery_id uuid NOT NULL,
  sale_line_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_name_snapshot text NOT NULL,
  sku_snapshot text NOT NULL,
  variant_id uuid,
  lot_id uuid,
  serial_ids uuid[] NOT NULL DEFAULT '{}',
  quantity numeric(12,3) NOT NULL,
  unit_selling_minor bigint NOT NULL,
  total_selling_minor bigint NOT NULL,
  unit_cost_minor bigint NOT NULL,
  total_cost_minor bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT commerce_delivery_items_tenant_delivery_fkey
    FOREIGN KEY (tenant_id, delivery_id) REFERENCES commerce_deliveries(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT commerce_delivery_items_tenant_sale_line_fkey
    FOREIGN KEY (tenant_id, sale_line_id) REFERENCES sale_lines(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT commerce_delivery_items_tenant_product_fkey
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT commerce_delivery_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT commerce_delivery_items_money_check CHECK (
    unit_selling_minor >= 0 AND total_selling_minor >= 0 AND unit_cost_minor >= 0 AND total_cost_minor >= 0
  ),
  CONSTRAINT commerce_delivery_items_tenant_id_key UNIQUE (tenant_id, id)
);
CREATE INDEX commerce_delivery_items_sale_line_idx ON commerce_delivery_items(tenant_id, sale_line_id);
CREATE INDEX commerce_delivery_items_delivery_idx ON commerce_delivery_items(tenant_id, delivery_id);

-- Append-only lifecycle history. Delivery header.status is only the current projection.
CREATE TABLE commerce_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  delivery_id uuid NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason text,
  location_label text,
  recipient_name text,
  proof_attachment_id uuid,
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT commerce_delivery_events_tenant_branch_fkey
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT commerce_delivery_events_tenant_delivery_fkey
    FOREIGN KEY (tenant_id, delivery_id) REFERENCES commerce_deliveries(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT commerce_delivery_events_tenant_idempotency_key UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT commerce_delivery_events_status_check CHECK (new_status = ANY (ARRAY[
    'prepared','assigned','picked_up','in_transit','delivered','delivery_failed','return_pending','returned','cancelled','dispatched'
  ]))
);
CREATE INDEX commerce_delivery_events_delivery_time_idx ON commerce_delivery_events(tenant_id, delivery_id, occurred_at);

-- Rider reports are operational claims, not sale receipts or cash movements.
CREATE TABLE commerce_delivery_collection_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  delivery_id uuid NOT NULL,
  delivery_agent_id uuid,
  amount_reported_minor bigint NOT NULL,
  amount_remitted_minor bigint NOT NULL DEFAULT 0,
  amount_accepted_minor bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'reported',
  reported_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reported_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes text,
  variance_reason text,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT commerce_delivery_collection_reports_tenant_branch_fkey
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT commerce_delivery_collection_reports_tenant_delivery_fkey
    FOREIGN KEY (tenant_id, delivery_id) REFERENCES commerce_deliveries(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT commerce_delivery_collection_reports_tenant_agent_fkey
    FOREIGN KEY (tenant_id, delivery_agent_id) REFERENCES commerce_delivery_agents(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT commerce_delivery_collection_reports_amount_check CHECK (
    amount_reported_minor > 0 AND amount_remitted_minor >= 0 AND amount_accepted_minor >= 0
  ),
  CONSTRAINT commerce_delivery_collection_reports_status_check CHECK (status = ANY (ARRAY['reported','partially_remitted','reconciled','disputed'])),
  CONSTRAINT commerce_delivery_collection_reports_idempotency_key UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT commerce_delivery_collection_reports_tenant_id_key UNIQUE (tenant_id, id)
);
CREATE INDEX commerce_delivery_collection_reports_agent_status_idx ON commerce_delivery_collection_reports(tenant_id, delivery_agent_id, status, reported_at);
CREATE INDEX commerce_delivery_collection_reports_delivery_idx ON commerce_delivery_collection_reports(tenant_id, delivery_id, reported_at DESC);

CREATE TABLE commerce_delivery_collection_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  report_id uuid NOT NULL,
  method_category text NOT NULL,
  method_label text,
  amount_minor bigint NOT NULL,
  reference text,
  notes text,
  reported_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT commerce_delivery_collection_lines_tenant_report_fkey
    FOREIGN KEY (tenant_id, report_id) REFERENCES commerce_delivery_collection_reports(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT commerce_delivery_collection_lines_amount_check CHECK (amount_minor > 0),
  CONSTRAINT commerce_delivery_collection_lines_method_check CHECK (method_category = ANY (ARRAY['cash','mobile_money','bank_transfer','card','cheque','other']))
);
CREATE INDEX commerce_delivery_collection_lines_report_idx ON commerce_delivery_collection_lines(tenant_id, report_id);

-- Accepted handovers are separate from rider claims and are allocated explicitly.
CREATE TABLE commerce_delivery_remittances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  remittance_number text NOT NULL,
  delivery_agent_id uuid,
  amount_received_minor bigint NOT NULL,
  method_category text NOT NULL,
  method_label text,
  reference text,
  cash_session_id uuid,
  received_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  variance_reason text,
  status text NOT NULL DEFAULT 'accepted',
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT commerce_delivery_remittances_tenant_branch_fkey
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT commerce_delivery_remittances_tenant_agent_fkey
    FOREIGN KEY (tenant_id, delivery_agent_id) REFERENCES commerce_delivery_agents(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT commerce_delivery_remittances_tenant_cash_session_fkey
    FOREIGN KEY (tenant_id, cash_session_id) REFERENCES cash_sessions(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT commerce_delivery_remittances_amount_check CHECK (amount_received_minor > 0),
  CONSTRAINT commerce_delivery_remittances_method_check CHECK (method_category = ANY (ARRAY['cash','mobile_money','bank_transfer','card','cheque','other'])),
  CONSTRAINT commerce_delivery_remittances_status_check CHECK (status = ANY (ARRAY['accepted','partially_allocated','allocated','disputed'])),
  CONSTRAINT commerce_delivery_remittances_idempotency_key UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT commerce_delivery_remittances_number_key UNIQUE (tenant_id, remittance_number),
  CONSTRAINT commerce_delivery_remittances_tenant_id_key UNIQUE (tenant_id, id)
);
CREATE INDEX commerce_delivery_remittances_agent_time_idx ON commerce_delivery_remittances(tenant_id, delivery_agent_id, received_at DESC);

CREATE TABLE commerce_delivery_remittance_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  remittance_id uuid NOT NULL,
  collection_report_id uuid NOT NULL,
  amount_minor bigint NOT NULL,
  sale_payment_id uuid,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT commerce_delivery_remittance_allocations_tenant_remittance_fkey
    FOREIGN KEY (tenant_id, remittance_id) REFERENCES commerce_delivery_remittances(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT commerce_delivery_remittance_allocations_tenant_report_fkey
    FOREIGN KEY (tenant_id, collection_report_id) REFERENCES commerce_delivery_collection_reports(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT commerce_delivery_remittance_allocations_payment_fkey
    FOREIGN KEY (tenant_id, sale_payment_id) REFERENCES sale_payments(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT commerce_delivery_remittance_allocations_amount_check CHECK (amount_minor > 0),
  CONSTRAINT commerce_delivery_remittance_allocations_tenant_id_key UNIQUE (tenant_id, id)
);
CREATE INDEX commerce_delivery_remittance_allocations_report_idx ON commerce_delivery_remittance_allocations(tenant_id, collection_report_id);
CREATE INDEX commerce_delivery_remittance_allocations_remittance_idx ON commerce_delivery_remittance_allocations(tenant_id, remittance_id);

-- Legacy delivered/dispatched rows receive a deterministic event so the timeline
-- starts with an honest compatibility event instead of invented intermediate states.
INSERT INTO commerce_delivery_events
  (tenant_id, branch_id, delivery_id, previous_status, new_status, occurred_at,
   reason, idempotency_key, metadata)
SELECT d.tenant_id, d.branch_id, d.id, NULL,
       CASE WHEN d.status = 'dispatched' THEN 'dispatched' ELSE d.status END,
       d.dispatched_at, 'Legacy delivery state migrated to event history',
       'legacy-delivery-state:' || d.id::text,
       jsonb_build_object('migration', '20261101090000_workstream7_increment1_payments_delivery')
FROM commerce_deliveries d
WHERE NOT EXISTS (
  SELECT 1 FROM commerce_delivery_events e
  WHERE e.tenant_id = d.tenant_id AND e.delivery_id = d.id
);
