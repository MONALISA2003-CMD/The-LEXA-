-- Increment 3-5 durable import/export, backup/restore, and worker substrate.
ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS payload_version integer NOT NULL DEFAULT 1;
ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;
ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS worker_id text;
ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS worker_version text;
ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS preview_hash text;
ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz;
ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS snapshot_at timestamptz;
ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS retention_until timestamptz;
ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS manifest jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS scope_type text;
ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS format text;
ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS last_error_code text;
ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS correlation_id uuid;
CREATE INDEX IF NOT EXISTS platform_jobs_available_idx ON platform_jobs(status,available_at,created_at) WHERE status IN ('queued','retry_wait','failed');
CREATE TABLE IF NOT EXISTS platform_job_attempts (id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES platform_jobs(id) ON DELETE CASCADE, attempt_no integer NOT NULL, worker_id text, worker_version text, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, outcome text NOT NULL DEFAULT 'running', error_code text, error_message text, checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE INDEX IF NOT EXISTS platform_job_attempts_job_idx ON platform_job_attempts(job_id,attempt_no DESC);
CREATE TABLE IF NOT EXISTS platform_job_replays (id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES platform_jobs(id) ON DELETE CASCADE, requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), idempotency_key text NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS platform_backup_inventory (table_name text PRIMARY KEY, disposition text NOT NULL CHECK(disposition IN ('authoritative','reconstructed','excluded')), domain text NOT NULL, rationale text NOT NULL, dependency_order integer NOT NULL DEFAULT 100, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS platform_restore_approvals (id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES platform_jobs(id) ON DELETE CASCADE, approver_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, approval_role text NOT NULL, target_project_id text NOT NULL, target_branch_id text NOT NULL, approved_at timestamptz NOT NULL DEFAULT now(), UNIQUE(job_id,approver_user_id));
CREATE TABLE IF NOT EXISTS platform_import_templates (importer_type text NOT NULL, schema_version integer NOT NULL, template jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(importer_type,schema_version));
ALTER TABLE platform_import_rows ADD COLUMN IF NOT EXISTS source_hash text;
ALTER TABLE platform_import_rows ADD COLUMN IF NOT EXISTS action text CHECK(action IN ('create','update','skip','invalid'));
ALTER TABLE platform_import_rows ADD COLUMN IF NOT EXISTS before_data jsonb;
ALTER TABLE platform_import_rows ADD COLUMN IF NOT EXISTS after_data jsonb;
ALTER TABLE platform_import_rows ADD COLUMN IF NOT EXISTS applied_record_id text;
ALTER TABLE platform_import_rows ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE platform_import_rows ADD COLUMN IF NOT EXISTS result jsonb;
CREATE INDEX IF NOT EXISTS platform_import_rows_pending_idx ON platform_import_rows(job_id,row_number) WHERE applied_at IS NULL;
ALTER TABLE module_domain_events ADD COLUMN IF NOT EXISTS dead_letter_at timestamptz;
ALTER TABLE module_domain_events ADD COLUMN IF NOT EXISTS lease_owner text;
ALTER TABLE module_domain_events ADD COLUMN IF NOT EXISTS lease_until timestamptz;
ALTER TABLE module_domain_events ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE module_domain_events ADD COLUMN IF NOT EXISTS event_version integer NOT NULL DEFAULT 1;
ALTER TABLE module_domain_events ADD COLUMN IF NOT EXISTS correlation_id uuid;
CREATE INDEX IF NOT EXISTS module_domain_events_claim_idx ON module_domain_events(next_attempt_at,created_at) WHERE outbox_status IN ('pending','failed');
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='platform_job_attempts' AND policyname='platform_job_attempts_tenant_scope') THEN
  ALTER TABLE platform_job_attempts ENABLE ROW LEVEL SECURITY; ALTER TABLE platform_job_attempts FORCE ROW LEVEL SECURITY;
  CREATE POLICY platform_job_attempts_tenant_scope ON platform_job_attempts USING (EXISTS(SELECT 1 FROM platform_jobs j WHERE j.id=job_id AND j.tenant_id::text=NULLIF(current_setting('app.tenant_id',true),''))) WITH CHECK (EXISTS(SELECT 1 FROM platform_jobs j WHERE j.id=job_id AND j.tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'')));
 END IF;
END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON platform_job_attempts,platform_job_replays,platform_backup_inventory,platform_restore_approvals,platform_import_templates TO lexa_app_runtime;
CREATE TABLE IF NOT EXISTS platform_event_attempts (
 id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES module_domain_events(id) ON DELETE CASCADE,
 attempt_no integer NOT NULL, worker_id text, started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz, outcome text NOT NULL DEFAULT 'running', error_code text, error_message text,
 UNIQUE(event_id,attempt_no)
);
CREATE TABLE IF NOT EXISTS platform_event_receipts (
 id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES module_domain_events(id) ON DELETE CASCADE,
 consumer text NOT NULL, event_type text NOT NULL, payload_hash text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(), UNIQUE(event_id,consumer)
);
ALTER TABLE platform_event_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_event_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_event_attempts_scope ON platform_event_attempts USING (EXISTS(SELECT 1 FROM module_domain_events e WHERE e.id=event_id AND e.tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'')));
ALTER TABLE platform_event_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_event_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_event_receipts_scope ON platform_event_receipts USING (EXISTS(SELECT 1 FROM module_domain_events e WHERE e.id=event_id AND e.tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'')));
GRANT SELECT,INSERT,UPDATE,DELETE ON platform_event_attempts,platform_event_receipts TO lexa_app_runtime;
CREATE TABLE IF NOT EXISTS platform_event_replays (
 id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES module_domain_events(id) ON DELETE CASCADE,
 requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL, reason text NOT NULL,
 idempotency_key text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_event_replays ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_event_replays FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_event_replays_scope ON platform_event_replays USING (EXISTS(SELECT 1 FROM module_domain_events e WHERE e.id=event_id AND e.tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'')));
GRANT SELECT,INSERT,UPDATE,DELETE ON platform_event_replays TO lexa_app_runtime;
ALTER TABLE platform_job_replays ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_job_replays FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_job_replays_scope ON platform_job_replays USING (EXISTS(SELECT 1 FROM platform_jobs j WHERE j.id=job_id AND j.tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'')));
ALTER TABLE platform_restore_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_restore_approvals FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_restore_approvals_scope ON platform_restore_approvals USING (EXISTS(SELECT 1 FROM platform_jobs j WHERE j.id=job_id AND j.tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'')));
INSERT INTO platform_import_templates(importer_type,schema_version,template) VALUES
 ('products',1,'{"required":["sku","name"],"optional":["barcode","brand","unit_of_measure","category_name","cost_price_minor","selling_price_minor","low_stock_threshold","track_stock","active"]}'::jsonb),
 ('categories',1,'{"required":["name"],"optional":[]}'::jsonb),
 ('product_variants',1,'{"required":["product_sku","sku"],"optional":["barcode","attributes_json","cost_price_minor","selling_price_minor","active"]}'::jsonb),
 ('customers',1,'{"required":["customer_code","name"],"optional":["email","phone","tax_number","address"]}'::jsonb),
 ('suppliers',1,'{"required":["supplier_code","name"],"optional":["email","phone","tax_number","address"]}'::jsonb),
 ('warehouses',1,'{"required":["code","name"],"optional":["active"]}'::jsonb),
 ('storage_bins',1,'{"required":["warehouse_code","code","name"],"optional":["bin_type","active"]}'::jsonb)
ON CONFLICT(importer_type,schema_version) DO NOTHING;

INSERT INTO platform_backup_inventory(table_name,disposition,domain,rationale) VALUES
('tenants','authoritative','tenant','Workspace root and business settings'),
('branches','authoritative','tenant','Branch and location structure'),
('users','authoritative','identity','Identity references only; never restore credentials or sessions'),
('memberships','authoritative','identity','Tenant membership and role mapping; require relinking and review'),
('branch_memberships','authoritative','identity','Branch access map; require privilege review'),
('workspace_invitations','excluded','identity','Pending invitations and tokens must be reissued'),
('sessions','excluded','identity','Live sessions are never restored'),
('password_reset_tokens','excluded','identity','Reset tokens are never restored'),
('auth_rate_limits','excluded','security','Ephemeral security counters reinitialize'),
('audit_events','authoritative','audit','Required audit attribution and evidence'),
('module_definitions','reconstructed','platform','Reinstalled from versioned application catalog'),
('module_records','authoritative','collaboration','Business module records'),
('module_record_links','authoritative','collaboration','Module relationships'),
('module_domain_events','authoritative','platform','Durable business event history; transient queues excluded'),
('idempotency_records','authoritative','platform','Business request deduplication evidence'),
('platform_attachments','authoritative','documents','Metadata and object manifest; objects restored privately and rescanned'),
('platform_jobs','authoritative','platform','Durable job and recovery metadata; reset active leases'),
('platform_import_rows','authoritative','imports','Import preview and reconciliation history'),
('platform_job_attempts','authoritative','platform','Execution attempt history'),
('platform_job_replays','authoritative','platform','Replay audit trail'),
('platform_backup_inventory','reconstructed','backup','Versioned inventory ships with application'),
('platform_restore_approvals','authoritative','backup','Recovery approval evidence'),
('platform_import_templates','reconstructed','imports','Versioned templates ship with application'),
('platform_worker_heartbeats','excluded','platform','Transient worker liveness rebuilt after restart'),
('platform_provider_connections','excluded','security','Provider credentials never backed up; reconnect manually'),
('platform_provider_operations','authoritative','integrations','Provider operation audit, no credentials'),
('platform_webhook_events','authoritative','integrations','Webhook deduplication and processing evidence'),
('products','authoritative','catalog','Product master'),
('categories','authoritative','catalog','Category master'),
('product_variants','authoritative','catalog','Variant master'),
('unit_of_measures','authoritative','catalog','Unit definitions'),
('price_lists','authoritative','catalog','Pricing rules'),
('price_list_items','authoritative','catalog','Pricing rows'),
('tax_codes','authoritative','tax','Tax code configuration'),
('tax_rules','authoritative','tax','Approved tax rule state'),
('tax_code_rule_versions','authoritative','tax','Immutable effective-dated rule versions'),
('tax_reference_documents','authoritative','tax','Tax reference metadata; document object references'),
('tax_rule_reference_links','authoritative','tax','Rule-to-reference relationships'),
('warehouses','authoritative','inventory','Warehouse master'),
('storage_bins','authoritative','inventory','Bin master'),
('stock_movements','authoritative','inventory','Source stock movement ledger'),
('stock_reservations','authoritative','inventory','Stock reservation state'),
('inventory_lots','authoritative','inventory','Lot and expiry tracking'),
('inventory_serials','authoritative','inventory','Serial tracking'),
('inventory_packages','authoritative','inventory','Package state'),
('inventory_package_lines','authoritative','inventory','Package contents'),
('inventory_picklists','authoritative','inventory','Picklist state'),
('inventory_picklist_lines','authoritative','inventory','Picklist lines'),
('inventory_replenishment_policies','authoritative','inventory','Replenishment policy'),
('inventory_stock_counts','authoritative','inventory','Stock count source records'),
('inventory_stock_count_lines','authoritative','inventory','Stock count lines'),
('inventory_transfers','authoritative','inventory','Stock transfer source records'),
('inventory_transfer_lines','authoritative','inventory','Stock transfer lines'),
('sales','authoritative','sales','Sales transactions'),
('sale_lines','authoritative','sales','Sales lines and tax snapshots'),
('sale_payments','authoritative','sales','Receipts, reversals and payment attribution'),
('sale_returns','authoritative','sales','Return transactions'),
('sale_return_lines','authoritative','sales','Return lines'),
('commerce_sales_orders','authoritative','commerce','Sales orders'),
('commerce_sales_order_lines','authoritative','commerce','Sales order lines'),
('commerce_fulfilments','authoritative','commerce','Fulfilment records'),
('commerce_fulfilment_lines','authoritative','commerce','Fulfilment line history'),
('commerce_stock_reservations','authoritative','commerce','Commerce reservations'),
('commerce_deliveries','authoritative','delivery','Delivery lifecycle'),
('commerce_delivery_agents','authoritative','delivery','Delivery agent directory'),
('commerce_delivery_items','authoritative','delivery','Delivery line snapshots'),
('commerce_delivery_events','authoritative','delivery','Append-only delivery events'),
('commerce_delivery_collection_reports','authoritative','delivery','Collection reports'),
('commerce_delivery_collection_lines','authoritative','delivery','Collection allocations'),
('commerce_delivery_remittances','authoritative','delivery','Remittance evidence'),
('commerce_delivery_remittance_allocations','authoritative','delivery','Remittance allocations'),
('commerce_purchase_orders','authoritative','procurement','Purchase orders'),
('commerce_purchase_order_lines','authoritative','procurement','Purchase order lines'),
('commerce_goods_receipts','authoritative','procurement','Goods receipt records'),
('commerce_goods_receipt_lines','authoritative','procurement','Goods receipt lines'),
('procurement_suppliers','authoritative','procurement','Supplier master'),
('procurement_purchase_requests','authoritative','procurement','Purchase requests'),
('procurement_purchase_request_lines','authoritative','procurement','Purchase request lines'),
('procurement_rfqs','authoritative','procurement','RFQs'),
('procurement_rfq_lines','authoritative','procurement','RFQ lines'),
('procurement_rfq_suppliers','authoritative','procurement','RFQ supplier invitations'),
('procurement_awards','authoritative','procurement','Procurement awards'),
('procurement_approvals','authoritative','procurement','Procurement approvals'),
('procurement_approval_rules','authoritative','procurement','Approval rules'),
('procurement_supplier_notes','authoritative','procurement','Supplier notes'),
('procurement_supplier_returns','authoritative','procurement','Supplier returns'),
('procurement_supplier_return_lines','authoritative','procurement','Supplier return lines'),
('supplier_quotations','authoritative','procurement','Supplier quotations'),
('supplier_quotation_lines','authoritative','procurement','Supplier quotation lines'),
('ap_supplier_invoices','authoritative','payables','Supplier invoices'),
('ap_supplier_invoice_lines','authoritative','payables','Supplier invoice lines'),
('ap_supplier_payments','authoritative','payables','Supplier payments'),
('ap_supplier_payment_allocations','authoritative','payables','Supplier payment allocations'),
('ar_customer_invoices','authoritative','receivables','Customer invoices'),
('ar_customer_invoice_lines','authoritative','receivables','Customer invoice lines'),
('ar_customer_receipts','authoritative','receivables','Customer receipts'),
('ar_customer_receipt_allocations','authoritative','receivables','Receipt allocations'),
('credit_notes','authoritative','receivables','Credit notes'),
('credit_note_lines','authoritative','receivables','Credit note lines'),
('ledger_accounts','authoritative','ledger','Chart of accounts'),
('ledger_journals','authoritative','ledger','Journal headers'),
('ledger_journal_lines','authoritative','ledger','Journal lines'),
('accounting_periods','authoritative','ledger','Accounting period state'),
('cash_sessions','authoritative','cash','Cash session records'),
('cash_movements','authoritative','cash','Cash movement records'),
('cash_ups','authoritative','cash','Cash-up records'),
('bank_accounts','authoritative','banking','Bank metadata only; exclude credentials'),
('bank_reconciliations','authoritative','banking','Manual reconciliation state'),
('bank_reconciliation_matches','authoritative','banking','Reconciliation matching'),
('bank_statement_lines','authoritative','banking','Imported bank statement data'),
('expenses','authoritative','finance','Expense records'),
('expense_categories','authoritative','finance','Expense categories'),
('fixed_assets','authoritative','finance','Fixed asset register'),
('fixed_asset_depreciations','authoritative','finance','Depreciation schedule and postings'),
('hr_employees','authoritative','people','Employee records subject to retention/access policy'),
('hr_employee_compensation','authoritative','people','Compensation data restricted by role'),
('hr_attendance','authoritative','people','Attendance records'),
('hr_leave_requests','authoritative','people','Leave records'),
('hr_shifts','authoritative','people','Shift definitions'),
('hr_employee_shift_assignments','authoritative','people','Shift assignments'),
('hr_timesheets','authoritative','people','Timesheets'),
('hr_payroll_runs','authoritative','people','Payroll runs; restricted'),
('hr_payroll_lines','authoritative','people','Payroll lines; restricted'),
('hr_payroll_deductions','authoritative','people','Payroll deductions; restricted'),
('projects','authoritative','projects','Project records'),
('project_tasks','authoritative','projects','Project tasks'),
('project_cost_entries','authoritative','projects','Project costs'),
('manufacturing_boms','authoritative','manufacturing','BOM headers'),
('manufacturing_bom_lines','authoritative','manufacturing','BOM components'),
('manufacturing_work_orders','authoritative','manufacturing','Work orders'),
('manufacturing_work_order_materials','authoritative','manufacturing','Work order material consumption'),
('manufacturing_job_cards','authoritative','manufacturing','Job cards'),
('manufacturing_job_card_steps','authoritative','manufacturing','Job card steps'),
('quality_inspection_plans','authoritative','quality','Inspection plans'),
('quality_inspection_plan_checks','authoritative','quality','Inspection plan checks'),
('quality_inspections','authoritative','quality','Inspection records'),
('quality_inspection_results','authoritative','quality','Inspection results'),
('support_cases','authoritative','support','Support case history'),
('cost_centres','authoritative','finance','Cost centre master'),
('cost_centre_allocations','authoritative','finance','Cost allocation rows'),
('platform_event_attempts','authoritative','platform','Durable event attempt and dead-letter history'),
('platform_event_receipts','authoritative','platform','Idempotent internal event consumer receipts'),
('platform_event_replays','authoritative','platform','Dead-letter event replay audit trail')
ON CONFLICT(table_name) DO UPDATE SET disposition=EXCLUDED.disposition,domain=EXCLUDED.domain,rationale=EXCLUDED.rationale,updated_at=now();
