-- Additive reporting performance indexes, no business records changed.
CREATE INDEX IF NOT EXISTS sales_tenant_branch_status_created_reporting_idx ON sales(tenant_id,branch_id,status,created_at);
CREATE INDEX IF NOT EXISTS sale_payments_tenant_kind_recorded_reporting_idx ON sale_payments(tenant_id,kind,recorded_at);
CREATE INDEX IF NOT EXISTS module_records_tenant_branch_module_reporting_idx ON module_records(tenant_id,branch_id,module_id);
CREATE INDEX IF NOT EXISTS expenses_tenant_branch_expense_date_reporting_idx ON expenses(tenant_id,branch_id,expense_date,status);
CREATE INDEX IF NOT EXISTS hr_attendance_tenant_branch_date_reporting_idx ON hr_attendance(tenant_id,branch_id,attendance_date,status);
