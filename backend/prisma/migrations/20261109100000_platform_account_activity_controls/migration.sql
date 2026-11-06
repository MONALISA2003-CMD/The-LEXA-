-- LEXA platform account oversight: additive, reversible and non-destructive.
-- No business, membership, ledger, invoice, or customer row is deleted.
-- Archived accounts retain their records and payment history pending an explicit recovery.
ALTER TABLE platform_subscriptions
  DROP CONSTRAINT IF EXISTS platform_subscriptions_status_check;
ALTER TABLE platform_subscriptions
  ADD CONSTRAINT platform_subscriptions_status_check
  CHECK(status IN ('pending','active','suspended','legacy','archived'));
ALTER TABLE platform_subscriptions
  ADD COLUMN archived_at timestamptz(3),
  ADD COLUMN archived_previous_status text
    CHECK(archived_previous_status IN ('pending','active','suspended','legacy'));

-- A low-volume, upserted activity register. The Fastify socket IP is recorded, not
-- untrusted X-Forwarded-For values. Addresses might reflect a hosting proxy.
CREATE TABLE platform_account_activity (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  last_seen_at timestamptz(3) NOT NULL DEFAULT now(),
  observed_ip inet,
  previous_ip inet,
  ip_changed_at timestamptz(3),
  client_label varchar(160),
  last_activity_kind text NOT NULL DEFAULT 'registration' CHECK(last_activity_kind IN ('registration','account_access','business_operation')),
  request_count integer NOT NULL DEFAULT 1,
  PRIMARY KEY(tenant_id,user_id)
);
CREATE INDEX platform_account_activity_recent ON platform_account_activity(last_seen_at DESC);
ALTER TABLE platform_account_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_account_activity FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_account_activity_admin_read ON platform_account_activity
  FOR SELECT USING(platform_admin_authorized());
CREATE POLICY platform_account_activity_member_read ON platform_account_activity
  FOR SELECT USING(tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'')
    AND user_id::text=NULLIF(current_setting('app.user_id',true),''));
CREATE POLICY platform_account_activity_member_insert ON platform_account_activity
  FOR INSERT WITH CHECK(
    tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'')
    AND user_id::text=NULLIF(current_setting('app.user_id',true),'')
    AND EXISTS (SELECT 1 FROM memberships m
      WHERE m.tenant_id=platform_account_activity.tenant_id
        AND m.user_id=platform_account_activity.user_id AND m.status='ACTIVE')
  );
CREATE POLICY platform_account_activity_member_update ON platform_account_activity
  FOR UPDATE USING(
    tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'')
    AND user_id::text=NULLIF(current_setting('app.user_id',true),'')
  ) WITH CHECK(
    tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'')
    AND user_id::text=NULLIF(current_setting('app.user_id',true),'')
  );
GRANT SELECT,INSERT,UPDATE ON platform_account_activity TO lexa_app_runtime;

-- A narrow administrative read, not a grant to select unrestricted session or ERP tables.
-- The runtime cannot delete activity records or update another user's activity.
INSERT INTO platform_administration_audit(id,actor_user_id,action,details)
  SELECT gen_random_uuid(),user_id,'platform.activity_controls.migrated',
    '{"migration":"20261109100000_platform_account_activity_controls"}'::jsonb
  FROM platform_admin_members WHERE false;

-- Database-level least privilege for sensitive billing writes, in addition to
-- controller role checks. Account support/auditor roles cannot alter entitlements.
CREATE FUNCTION platform_admin_can_bill() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_catalog AS $$
 SELECT EXISTS (SELECT 1 FROM platform_admin_members m
 WHERE m.user_id::text=NULLIF(current_setting('app.user_id',true),'')
   AND m.enabled AND m.role IN ('super_admin','billing_manager'));
$$;
REVOKE ALL ON FUNCTION platform_admin_can_bill() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_admin_can_bill() TO lexa_app_runtime;
DROP POLICY platform_subscriptions_admin_update ON platform_subscriptions;
CREATE POLICY platform_subscriptions_admin_update ON platform_subscriptions
 FOR UPDATE USING(platform_admin_can_bill()) WITH CHECK(platform_admin_can_bill());
DROP POLICY platform_payment_claims_admin_update ON platform_payment_claims;
CREATE POLICY platform_payment_claims_admin_update ON platform_payment_claims
 FOR UPDATE USING(platform_admin_can_bill()) WITH CHECK(platform_admin_can_bill());
CREATE POLICY platform_payment_claims_admin_verified_insert ON platform_payment_claims
 FOR INSERT WITH CHECK(platform_admin_can_bill() AND status='approved'
   AND submitted_by::text=NULLIF(current_setting('app.user_id',true),'')
   AND reviewed_by::text=NULLIF(current_setting('app.user_id',true),'')
   AND verified_reference IS NOT NULL);
DROP POLICY platform_subscription_periods_admin_insert ON platform_subscription_periods;
CREATE POLICY platform_subscription_periods_admin_insert ON platform_subscription_periods
 FOR INSERT WITH CHECK(platform_admin_can_bill());
