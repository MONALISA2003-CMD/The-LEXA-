-- Workstream 7: private files, durable jobs, provider operations and worker observability.
CREATE TABLE platform_attachments (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
 uploaded_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 object_key text NOT NULL UNIQUE, original_name text NOT NULL, mime_type text NOT NULL,
 size_bytes bigint NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 26214400),
 sha256 text NOT NULL, status text NOT NULL DEFAULT 'pending_scan' CHECK(status IN ('pending_upload','pending_scan','clean','quarantined','deleted')),
 record_type text, record_id text, conversation_id uuid, scan_engine text, scanned_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_attachments_scope_idx ON platform_attachments(tenant_id,branch_id,status,created_at DESC);
CREATE INDEX platform_attachments_record_idx ON platform_attachments(tenant_id,record_type,record_id);
CREATE TABLE platform_jobs (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 branch_id uuid REFERENCES branches(id) ON DELETE CASCADE, requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 kind text NOT NULL CHECK(kind IN ('import','export','backup','restore','provider_reconcile','recurring_invoice')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','validating','ready','failed','dead_letter','cancelled')),
 idempotency_key text NOT NULL, input jsonb NOT NULL DEFAULT '{}', result jsonb, error text,
 attempts int NOT NULL DEFAULT 0, max_attempts int NOT NULL DEFAULT 5,
 progress int NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100), created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 UNIQUE(tenant_id,idempotency_key)
);
CREATE INDEX platform_jobs_queue_idx ON platform_jobs(status,created_at) WHERE status IN ('queued','failed');
CREATE TABLE platform_provider_connections (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 provider text NOT NULL, display_name text NOT NULL, encrypted_config text NOT NULL,
 status text NOT NULL DEFAULT 'unverified' CHECK(status IN ('unverified','sandbox','active','degraded','disabled')),
 last_success_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,provider,display_name)
);
CREATE TABLE platform_provider_operations (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 connection_id uuid NOT NULL REFERENCES platform_provider_connections(id) ON DELETE RESTRICT,
 operation_type text NOT NULL, idempotency_key text NOT NULL, provider_reference text,
 amount_minor bigint, currency text, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','submitted','succeeded','failed','unknown')),
 request_payload jsonb NOT NULL DEFAULT '{}', response_payload jsonb, last_checked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,idempotency_key)
);
CREATE TABLE platform_worker_heartbeats (
 worker_id text PRIMARY KEY, status text NOT NULL, queues jsonb NOT NULL DEFAULT '[]',
 last_seen_at timestamptz NOT NULL DEFAULT now(), details jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE platform_webhook_events (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 provider text NOT NULL, provider_event_id text NOT NULL, payload jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
 UNIQUE(tenant_id,provider,provider_event_id)
);
CREATE TABLE platform_import_rows (
 id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES platform_jobs(id) ON DELETE CASCADE,
 row_number int NOT NULL, row_data jsonb NOT NULL, validation_errors jsonb NOT NULL DEFAULT '[]',
 applied_at timestamptz, UNIQUE(job_id,row_number)
);
ALTER TABLE module_domain_events ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0;
ALTER TABLE module_domain_events ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE module_domain_events ADD COLUMN IF NOT EXISTS processed_at timestamptz;
CREATE INDEX IF NOT EXISTS module_domain_events_worker_idx ON module_domain_events(outbox_status,created_at) WHERE outbox_status IN ('pending','failed');
ALTER TABLE platform_attachments ADD CONSTRAINT platform_attachments_tenant_branch_fkey FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE CASCADE;
ALTER TABLE platform_jobs ADD CONSTRAINT platform_jobs_tenant_branch_fkey FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE CASCADE;
