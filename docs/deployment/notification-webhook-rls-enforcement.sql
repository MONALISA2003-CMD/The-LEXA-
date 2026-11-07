-- LEXA WEBHOOK HARDENING - PHASE 2, MANUAL OPERATOR-APPROVED ACTION.
-- Not a Prisma migration: NEVER apply as part of the same ZIP/Render rollout.
-- Prerequisites:
-- 1. Phase 1 migration and gateway-only NestJS controller live in every API instance.
-- 2. No old controllers remain; notification workers use ON CONFLICT DO NOTHING.
-- 3. All webhook processing and worker retry tests pass with FORCE RLS in staging.
-- 4. Rollback and outage window approved, with DB snapshot and monitoring in place.
BEGIN;
ALTER TABLE public.notification_email_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_email_webhook_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notification_email_webhook_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_email_webhook_routes FORCE ROW LEVEL SECURITY;

-- Routes are populated only by the tenant-scoped email worker. Unscoped reads
-- are deliberately not permitted; the webhook controller uses the narrow gateway below.
CREATE POLICY notification_email_webhook_routes_tenant_insert
  ON public.notification_email_webhook_routes
  FOR INSERT TO lexa_app_runtime
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.tenant_id', true), ''));

REVOKE ALL ON TABLE public.notification_email_webhook_events FROM PUBLIC;
REVOKE ALL ON TABLE public.notification_email_webhook_routes FROM PUBLIC;
REVOKE ALL ON TABLE public.notification_email_webhook_events FROM lexa_app_runtime;
REVOKE ALL ON TABLE public.notification_email_webhook_routes FROM lexa_app_runtime;
GRANT INSERT ON TABLE public.notification_email_webhook_routes TO lexa_app_runtime;
COMMIT;
