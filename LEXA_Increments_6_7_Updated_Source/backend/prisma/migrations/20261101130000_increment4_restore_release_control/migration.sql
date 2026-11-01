-- Increment 4: runtime safety controls and independently approved isolated restore.
ALTER TABLE platform_jobs DROP CONSTRAINT IF EXISTS platform_jobs_status_check;
ALTER TABLE platform_jobs ADD CONSTRAINT platform_jobs_status_check CHECK (status IN ('queued','running','validating','ready','failed','dead_letter','cancelled','awaiting_approval','restoring','retry_wait'));
CREATE TABLE IF NOT EXISTS platform_runtime_controls (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  control_key text NOT NULL CHECK (control_key IN ('outbound_paused','recurring_jobs_paused','restore_review_required')),
  enabled boolean NOT NULL DEFAULT true,
  reason text NOT NULL,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,control_key)
);
ALTER TABLE platform_runtime_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_runtime_controls FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_runtime_controls_tenant_scope ON platform_runtime_controls
 USING (tenant_id::text=NULLIF(current_setting('app.tenant_id',true),''))
 WITH CHECK (tenant_id::text=NULLIF(current_setting('app.tenant_id',true),''));
GRANT SELECT,INSERT,UPDATE,DELETE ON platform_runtime_controls TO lexa_app_runtime;
INSERT INTO platform_backup_inventory(table_name,disposition,domain,rationale,dependency_order)
VALUES ('platform_runtime_controls','authoritative','platform','Recovery pause/release state is durable business control state and must be restored paused.',990)
ON CONFLICT(table_name) DO UPDATE SET disposition=EXCLUDED.disposition,domain=EXCLUDED.domain,rationale=EXCLUDED.rationale,dependency_order=EXCLUDED.dependency_order,updated_at=now();
