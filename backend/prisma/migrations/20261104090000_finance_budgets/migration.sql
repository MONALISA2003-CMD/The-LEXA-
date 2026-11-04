-- LEXA Finance: tenant- and branch-scoped, versioned departmental budgets.
-- No seeding, no customer transaction deletions, no synthetic balances.
CREATE TABLE finance_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  accounting_period_id uuid NOT NULL REFERENCES accounting_periods(id) ON DELETE RESTRICT,
  cost_centre_id uuid NOT NULL REFERENCES cost_centres(id) ON DELETE RESTRICT,
  planned_minor bigint NOT NULL CHECK(planned_minor > 0 AND planned_minor <= 9000000000000),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved')),
  version integer NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by_user_id uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at timestamptz NULL,
  approved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_budget_branch_fk FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT finance_budget_period_centre_unique UNIQUE(tenant_id,branch_id,accounting_period_id,cost_centre_id),
  CONSTRAINT finance_budget_approval_consistency CHECK((status='approved' AND approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL) OR (status<>'approved' AND approved_by_user_id IS NULL AND approved_at IS NULL))
);
CREATE INDEX finance_budgets_scope_idx ON finance_budgets(tenant_id,branch_id,accounting_period_id,status);
ALTER TABLE finance_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_budgets FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_budgets_tenant_scope ON finance_budgets FOR ALL
  USING(tenant_id::text=NULLIF(current_setting('app.tenant_id',true),''))
  WITH CHECK(tenant_id::text=NULLIF(current_setting('app.tenant_id',true),''));
