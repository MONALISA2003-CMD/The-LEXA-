-- Phase 1 of 2: additive webhook gateway functions for a rolling API upgrade.
-- This migration is backward compatible with the running API because it does
-- not yet revoke existing table access or force row-level security.
-- Phase 2 must run only after the gateway-only API is fully deployed and
-- old instances have drained. See docs/deployment/notification-webhook-rls-enforcement.sql.

-- The signed webhook request is authenticated in NestJS BEFORE calling this function.
-- It returns no sensitive provider evidence or unrelated tenant rows.
CREATE FUNCTION public.lexa_notification_webhook_claim(
  p_provider_event_id text,
  p_event_type text,
  p_provider_created_at timestamptz,
  p_safe_evidence jsonb,
  p_provider_message_id text
)
RETURNS TABLE (
  event_uuid uuid,
  mapped_tenant_id uuid,
  mapped_delivery_id uuid,
  already_processed boolean
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_id uuid;
  v_processed_at timestamptz;
  v_tenant uuid;
  v_delivery uuid;
BEGIN
  IF p_provider_event_id IS NULL OR length(p_provider_event_id) NOT BETWEEN 1 AND 255
    OR p_event_type IS NULL OR length(p_event_type) NOT BETWEEN 1 AND 120
    OR p_safe_evidence IS NULL OR octet_length(p_safe_evidence::text) > 2048
    OR (p_provider_message_id IS NOT NULL AND length(p_provider_message_id) > 250) THEN
    RAISE EXCEPTION 'Invalid signed webhook metadata' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.notification_email_webhook_events
    (id, provider_event_id, event_type, provider_created_at, safe_evidence, received_at)
  VALUES
    (gen_random_uuid(), p_provider_event_id, p_event_type,
     p_provider_created_at, p_safe_evidence, now())
  ON CONFLICT (provider_event_id) DO NOTHING RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT e.id, e.processed_at INTO v_id, v_processed_at
      FROM public.notification_email_webhook_events AS e
     WHERE e.provider_event_id = p_provider_event_id FOR UPDATE;
  END IF;

  IF p_provider_message_id IS NOT NULL THEN
    SELECT r.tenant_id, r.delivery_id INTO v_tenant, v_delivery
      FROM public.notification_email_webhook_routes AS r
     WHERE r.provider_message_id = p_provider_message_id;
  END IF;

  RETURN QUERY SELECT v_id, v_tenant, v_delivery, (v_processed_at IS NOT NULL);
END;
$fn$;

-- Completion requires the same provider message and exact tenant/delivery route.
-- A failed tenant write leaves the event unprocessed, so provider retries can recover.
CREATE FUNCTION public.lexa_notification_webhook_finish(
  p_provider_event_id text,
  p_provider_message_id text,
  p_tenant_id uuid,
  p_delivery_id uuid
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE v_updated boolean;
BEGIN
  UPDATE public.notification_email_webhook_events AS e
     SET delivery_id = p_delivery_id,
         tenant_id = p_tenant_id,
         processed_at = now()
   WHERE e.provider_event_id = p_provider_event_id
     AND EXISTS (
       SELECT 1 FROM public.notification_email_webhook_routes AS r
        WHERE r.provider_message_id = p_provider_message_id
          AND r.tenant_id = p_tenant_id
          AND r.delivery_id = p_delivery_id
     )
   RETURNING true INTO v_updated;
  RETURN COALESCE(v_updated, false);
END;
$fn$;

REVOKE ALL ON FUNCTION public.lexa_notification_webhook_claim(text,text,timestamptz,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lexa_notification_webhook_finish(text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lexa_notification_webhook_claim(text,text,timestamptz,jsonb,text) TO lexa_app_runtime;
GRANT EXECUTE ON FUNCTION public.lexa_notification_webhook_finish(text,text,uuid,uuid) TO lexa_app_runtime;
