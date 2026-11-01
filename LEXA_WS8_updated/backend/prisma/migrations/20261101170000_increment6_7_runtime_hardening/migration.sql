-- LEXA Workstream 7: Increment 6/7 recovery + runtime hardening.
-- Forward-only and idempotent: validation may already contain the earlier 15:00/16:00
-- Increment 6/7 objects whose original migration source was omitted from the ZIP.
-- This migration does not run a production restore or alter existing business rows.

CREATE TABLE IF NOT EXISTS business_notifications (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_event_id uuid NOT NULL REFERENCES module_domain_events(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  event_version integer NOT NULL DEFAULT 1 CHECK (event_version > 0),
  title text NOT NULL,
  body text NOT NULL,
  entity_module text,
  entity_record_id text,
  href text,
  safe_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  visible_in_app boolean NOT NULL DEFAULT true,
  UNIQUE(tenant_id,recipient_user_id,dedupe_key),
  CHECK ((is_read AND read_at IS NOT NULL) OR (NOT is_read AND read_at IS NULL))
);
CREATE INDEX IF NOT EXISTS business_notifications_inbox_idx
  ON business_notifications(tenant_id,branch_id,recipient_user_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS business_notifications_unread_idx
  ON business_notifications(tenant_id,recipient_user_id,created_at DESC) WHERE is_read=false AND visible_in_app=true;
CREATE INDEX IF NOT EXISTS business_notifications_expiry_idx ON business_notifications(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_email_deliveries (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES business_notifications(id) ON DELETE CASCADE,
  source_event_id uuid NOT NULL REFERENCES module_domain_events(id) ON DELETE RESTRICT,
  template_key text NOT NULL,
  template_version integer NOT NULL DEFAULT 1,
  recipient_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','delivered','retry_wait','failed','suppressed','bounced','complained')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  idempotency_key text NOT NULL UNIQUE,
  provider_message_id text,
  last_error_code text,
  last_error_summary text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,notification_id)
);
CREATE INDEX IF NOT EXISTS notification_email_due_idx
  ON notification_email_deliveries(status,next_attempt_at,created_at)
  WHERE status IN ('pending','retry_wait');
CREATE INDEX IF NOT EXISTS notification_email_tenant_status_idx
  ON notification_email_deliveries(tenant_id,branch_id,status,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS notification_email_provider_message_id_key
  ON notification_email_deliveries(provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_email_suppressions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_hash text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('bounce','complaint','operator')),
  source_provider_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,user_id,recipient_hash)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('in_app','email')),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,user_id,event_type,channel)
);
CREATE INDEX IF NOT EXISTS notification_preferences_user_idx ON notification_preferences(tenant_id,user_id);

CREATE TABLE IF NOT EXISTS recurring_invoice_schedules (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  customer_record_id text NOT NULL,
  customer_name_snapshot text NOT NULL,
  customer_phone_snapshot text,
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  line_templates jsonb NOT NULL CHECK(jsonb_typeof(line_templates)='array' AND jsonb_array_length(line_templates)>0),
  frequency text NOT NULL CHECK(frequency IN ('weekly','monthly','quarterly','annual','custom')),
  interval_count integer NOT NULL DEFAULT 1 CHECK(interval_count BETWEEN 1 AND 120),
  interval_unit text CHECK(interval_unit IN ('day','week','month','year')),
  start_date date NOT NULL,
  end_date date,
  maximum_occurrences integer CHECK(maximum_occurrences IS NULL OR maximum_occurrences BETWEEN 1 AND 10000),
  due_days integer NOT NULL DEFAULT 0 CHECK(due_days BETWEEN 0 AND 3650),
  issue_mode text NOT NULL DEFAULT 'draft' CHECK(issue_mode IN ('draft','auto_issue')),
  schedule_timezone text NOT NULL DEFAULT 'Africa/Kampala',
  run_at_local_time time NOT NULL DEFAULT '09:00',
  anchor_day integer NOT NULL CHECK(anchor_day BETWEEN 1 AND 31),
  next_run_date date NOT NULL,
  next_run_at timestamptz NOT NULL,
  occurrence_count integer NOT NULL DEFAULT 0 CHECK(occurrence_count>=0),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed','cancelled','needs_attention')),
  notification_user_ids uuid[] NOT NULL DEFAULT '{}',
  last_error_summary text,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(end_date IS NULL OR end_date>=start_date),
  CHECK((frequency='custom' AND interval_unit IS NOT NULL) OR (frequency<>'custom' AND interval_unit IS NULL)),
  UNIQUE(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS recurring_invoice_due_idx
  ON recurring_invoice_schedules(status,next_run_at) WHERE status='active';
CREATE INDEX IF NOT EXISTS recurring_invoice_customer_idx
  ON recurring_invoice_schedules(tenant_id,branch_id,customer_record_id,status);

CREATE TABLE IF NOT EXISTS recurring_invoice_occurrences (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES recurring_invoice_schedules(id) ON DELETE RESTRICT,
  occurrence_key text NOT NULL,
  scheduled_local_date date NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','generating','generated','failed','cancelled')),
  invoice_id uuid UNIQUE,
  invoice_number text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  error_summary text,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(schedule_id,occurrence_key),
  UNIQUE(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS recurring_occurrences_schedule_idx
  ON recurring_invoice_occurrences(tenant_id,branch_id,schedule_id,scheduled_local_date DESC);
ALTER TABLE ar_customer_invoices ADD COLUMN IF NOT EXISTS recurring_schedule_id uuid;
ALTER TABLE ar_customer_invoices ADD COLUMN IF NOT EXISTS recurring_occurrence_id uuid;
ALTER TABLE recurring_invoice_schedules ADD COLUMN IF NOT EXISTS correlation_id uuid;
ALTER TABLE recurring_invoice_occurrences ADD COLUMN IF NOT EXISTS correlation_id uuid;
ALTER TABLE recurring_invoice_schedules ALTER COLUMN correlation_id SET DEFAULT gen_random_uuid();
ALTER TABLE recurring_invoice_occurrences ALTER COLUMN correlation_id SET DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS ar_customer_invoices_recurring_schedule_idx
  ON ar_customer_invoices(tenant_id,recurring_schedule_id) WHERE recurring_schedule_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS platform_alert_rules (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  title text NOT NULL,
  severity text NOT NULL CHECK(severity IN ('low','medium','high','critical')),
  enabled boolean NOT NULL DEFAULT true,
  threshold jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_role text NOT NULL DEFAULT 'admin',
  runbook_path text NOT NULL,
  cooldown_seconds integer NOT NULL DEFAULT 900 CHECK(cooldown_seconds BETWEEN 60 AND 86400),
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,rule_key)
);
CREATE TABLE IF NOT EXISTS platform_alert_incidents (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  rule_id uuid REFERENCES platform_alert_rules(id) ON DELETE SET NULL,
  fingerprint text NOT NULL,
  rule_key text NOT NULL,
  severity text NOT NULL CHECK(severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved')),
  title text NOT NULL,
  summary text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurrence_count integer NOT NULL DEFAULT 1 CHECK(occurrence_count>=1),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_notification_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_alert_incidents_active_fingerprint_key
  ON platform_alert_incidents(tenant_id,fingerprint) WHERE status IN ('open','acknowledged');
CREATE INDEX IF NOT EXISTS platform_alert_incidents_tenant_status_idx
  ON platform_alert_incidents(tenant_id,status,last_seen_at DESC);

-- Provider webhook evidence is intentionally minimal; the raw webhook body is never stored.
CREATE TABLE IF NOT EXISTS notification_email_webhook_events (
  id uuid PRIMARY KEY,
  provider_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  provider_created_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  safe_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_id uuid,
  tenant_id uuid,
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS notification_email_webhook_events_received_idx
  ON notification_email_webhook_events(received_at DESC);
CREATE TABLE IF NOT EXISTS notification_email_webhook_routes (
  provider_message_id text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  delivery_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_email_webhook_routes_delivery_idx
  ON notification_email_webhook_routes(tenant_id,delivery_id);

-- Every new tenant-owned table is protected by the same runtime tenant context as LEXA core.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'business_notifications','notification_email_deliveries','notification_email_suppressions',
    'notification_preferences','recurring_invoice_schedules','recurring_invoice_occurrences',
    'platform_alert_rules','platform_alert_incidents'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_tenant_scope') THEN
      EXECUTE format('CREATE POLICY %I ON %I USING (tenant_id::text=NULLIF(current_setting(''app.tenant_id'',true),'''')) WITH CHECK (tenant_id::text=NULLIF(current_setting(''app.tenant_id'',true),''''))',t||'_tenant_scope',t);
    END IF;
  END LOOP;
END $$;

-- Runtime role grants. Webhook mapping/evidence is internal-only and deliberately has no tenant
-- RLS because the signed provider event must be mapped before tenant context is known.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='lexa_app_runtime') THEN
    EXECUTE 'GRANT SELECT,INSERT,UPDATE,DELETE ON business_notifications,notification_email_deliveries,notification_email_suppressions,notification_preferences,recurring_invoice_schedules,recurring_invoice_occurrences,platform_alert_rules,platform_alert_incidents TO lexa_app_runtime';
    EXECUTE 'GRANT SELECT,INSERT,UPDATE ON notification_email_webhook_events,notification_email_webhook_routes TO lexa_app_runtime';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='lexa_app') THEN
    EXECUTE 'GRANT SELECT,INSERT,UPDATE,DELETE ON business_notifications,notification_email_deliveries,notification_email_suppressions,notification_preferences,recurring_invoice_schedules,recurring_invoice_occurrences,platform_alert_rules,platform_alert_incidents,notification_email_webhook_events,notification_email_webhook_routes TO lexa_app';
  END IF;
END $$;

-- Starter alert rules are tenant-scoped configuration, not global production switches.
INSERT INTO platform_alert_rules(id,tenant_id,rule_key,title,severity,enabled,threshold,owner_role,runbook_path,cooldown_seconds)
SELECT gen_random_uuid(),t.id,v.rule_key,v.title,v.severity,true,v.threshold::jsonb,'admin',v.runbook_path,v.cooldown
FROM tenants t
CROSS JOIN (VALUES
 ('queue.dead_letter','Dead-letter queue increased','high','{"minCount":1}','docs/workstream7/runbooks/04-outbox-and-dlq.md',900),
 ('redis.unavailable','Worker Redis connection unavailable','critical','{"minCount":1}','docs/workstream7/runbooks/03-redis-outage-and-recovery.md',300),
 ('queue.oldest','Oldest queued job exceeded its SLA','high','{"maxAgeSeconds":300}','docs/workstream7/runbooks/02-worker-heartbeat-and-stalled-jobs.md',600),
 ('import_export.stalled','Import or export job stalled','high','{"maxAgeSeconds":1800}','docs/workstream7/runbooks/08-import-failure-and-retry.md',900),
 ('worker.stale','Background worker heartbeat stale','critical','{"minCount":1,"maxAgeSeconds":180}','docs/workstream7/runbooks/02-worker-heartbeat-and-stalled-jobs.md',300),
 ('outbox.oldest','Transactional outbox is delayed','high','{"minCount":1,"maxAgeSeconds":300}','docs/workstream7/runbooks/04-outbox-and-dlq.md',600),
 ('attachment.scan_backlog','Attachment scan backlog growing','high','{"minCount":20}','docs/workstream7/runbooks/05-clamav-and-attachment-scanning.md',900),
 ('notification.email_failure','Notification email delivery failure','medium','{"minCount":1}','docs/workstream7/runbooks/14-resend-bounce-and-webhook.md',1800),
 ('clamav.unavailable','ClamAV scanner unavailable','critical','{"minCount":1}','docs/workstream7/runbooks/05-clamav-and-attachment-scanning.md',300),
 ('recurring_invoice.failure','Recurring invoice generation failure','high','{"minCount":1}','docs/workstream7/runbooks/15-recurring-invoice-failure.md',900),
 ('backup.stale','Latest successful backup is stale','critical','{"maxAgeHours":24}','docs/workstream7/runbooks/10-backup-failure-and-verification.md',3600)
) AS v(rule_key,title,severity,threshold,runbook_path,cooldown)
ON CONFLICT(tenant_id,rule_key) DO NOTHING;

-- Keep sent/suppressed history for audit; the worker deletes only expired notifications whose
-- related email delivery is no longer pending/sending/retry-wait.


-- Correlation IDs connect the HTTP write, transactional outbox row and worker span.
ALTER TABLE module_domain_events ALTER COLUMN correlation_id SET DEFAULT gen_random_uuid();
CREATE OR REPLACE FUNCTION lexa_set_correlation_id() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE request_id text;
BEGIN
  IF NEW.correlation_id IS NULL THEN
    request_id := NULLIF(current_setting('app.correlation_id',true),'');
    IF request_id IS NOT NULL AND request_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      NEW.correlation_id := request_id::uuid;
    ELSE
      NEW.correlation_id := gen_random_uuid();
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS module_domain_events_set_correlation_id ON module_domain_events;
CREATE TRIGGER module_domain_events_set_correlation_id BEFORE INSERT ON module_domain_events
FOR EACH ROW EXECUTE FUNCTION lexa_set_correlation_id();
DROP TRIGGER IF EXISTS platform_jobs_set_correlation_id ON platform_jobs;
CREATE TRIGGER platform_jobs_set_correlation_id BEFORE INSERT ON platform_jobs
FOR EACH ROW EXECUTE FUNCTION lexa_set_correlation_id();

DROP TRIGGER IF EXISTS recurring_invoice_schedules_set_correlation_id ON recurring_invoice_schedules;
CREATE TRIGGER recurring_invoice_schedules_set_correlation_id BEFORE INSERT ON recurring_invoice_schedules
FOR EACH ROW EXECUTE FUNCTION lexa_set_correlation_id();
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ar_customer_invoices_recurring_schedule_id_fkey') THEN
    ALTER TABLE ar_customer_invoices ADD CONSTRAINT ar_customer_invoices_recurring_schedule_id_fkey
      FOREIGN KEY(recurring_schedule_id) REFERENCES recurring_invoice_schedules(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ar_customer_invoices_recurring_occurrence_id_fkey') THEN
    ALTER TABLE ar_customer_invoices ADD CONSTRAINT ar_customer_invoices_recurring_occurrence_id_fkey
      FOREIGN KEY(recurring_occurrence_id) REFERENCES recurring_invoice_occurrences(id) ON DELETE SET NULL;
  END IF;
END $$;
