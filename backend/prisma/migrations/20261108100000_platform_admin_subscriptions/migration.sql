-- LEXA Control Centre: additive, non-destructive migration.
-- Existing customers remain operational until a separate, explicit transition.
-- No tenant, user, invoice, payment, or business transaction is deleted or reset.
CREATE TABLE platform_admin_members (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('super_admin','billing_manager','support_agent','operations_manager','auditor')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE TABLE platform_subscriptions (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE RESTRICT,
  business_name text NOT NULL,
  owner_email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','legacy')),
  suspension_previous_status text CHECK(suspension_previous_status IN ('legacy','active','pending')),
  activated_at timestamptz(3),
  paid_through timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CHECK (paid_through IS NULL OR activated_at IS NOT NULL)
);
-- This INSERT preserves every previously created business. It does not make them expire.
INSERT INTO platform_subscriptions(tenant_id,business_name,owner_email,status,created_at)
  SELECT t.id,t.name,(SELECT u.email FROM memberships m JOIN users u ON u.id=m.user_id
    WHERE m.tenant_id=t.id AND m.role='owner' ORDER BY m.created_at LIMIT 1),
    'legacy',t.created_at FROM tenants t
  ON CONFLICT (tenant_id) DO NOTHING;
CREATE TABLE platform_payment_claims (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  payment_reference text NOT NULL UNIQUE,
  method text NOT NULL CHECK (method IN ('mtn_momo','airtel_money','bank_transfer','other')),
  transaction_reference text,
  verified_reference text,
  claim_message text,
  amount_ugx integer NOT NULL DEFAULT 50000 CHECK(amount_ugx=50000),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected')),
  submitted_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  review_note text,
  reviewed_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CHECK (transaction_reference IS NOT NULL OR claim_message IS NOT NULL)
);
CREATE UNIQUE INDEX platform_payment_verified_provider_reference_unique
  ON platform_payment_claims(method, upper(btrim(verified_reference)))
  WHERE status='approved' AND verified_reference IS NOT NULL;
CREATE UNIQUE INDEX platform_payment_one_open_claim_per_tenant
  ON platform_payment_claims(tenant_id) WHERE status='submitted';
CREATE INDEX platform_payment_claims_review_queue ON platform_payment_claims(status,created_at DESC);
CREATE INDEX platform_payment_claims_tenant_created ON platform_payment_claims(tenant_id,created_at DESC);
CREATE TABLE platform_subscription_periods (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  payment_claim_id uuid NOT NULL UNIQUE REFERENCES platform_payment_claims(id) ON DELETE RESTRICT,
  starts_at timestamptz(3) NOT NULL,
  ends_at timestamptz(3) NOT NULL,
  amount_ugx integer NOT NULL CHECK(amount_ugx=50000),
  approved_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX platform_subscription_periods_date ON platform_subscription_periods(created_at DESC);
CREATE INDEX platform_subscription_periods_tenant ON platform_subscription_periods(tenant_id,ends_at DESC);
CREATE TABLE platform_administration_audit (
  id uuid PRIMARY KEY,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX platform_administration_audit_date ON platform_administration_audit(created_at DESC);
CREATE TABLE platform_support_cases (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  opened_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subject text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','investigating','resolved')),
  priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','high','urgent')),
  assigned_to uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX platform_support_cases_status ON platform_support_cases(status,created_at DESC);
CREATE TABLE platform_incidents (
  id uuid PRIMARY KEY,
  category text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical','high','medium','info')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  acknowledged_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  resolved_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX platform_incidents_status ON platform_incidents(status,severity,created_at DESC);

-- Only a verified, explicitly enrolled platform user may read cross-business metadata.
-- Admin membership can only be read for the current authenticated user. The API
-- never exposes INSERT/UPDATE on that table: enroll from a trusted DBA console.
CREATE FUNCTION platform_admin_authorized() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admin_members m
    WHERE m.user_id::text=NULLIF(current_setting('app.user_id',true),'') AND m.enabled);
$$;
REVOKE ALL ON FUNCTION platform_admin_authorized() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_admin_authorized() TO lexa_app_runtime;

ALTER TABLE platform_admin_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admin_members FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_admin_members_self_read ON platform_admin_members FOR SELECT
  USING(user_id::text=NULLIF(current_setting('app.user_id',true),''));
-- Neon database owners require an explicit RLS policy when FORCE RLS is on.
-- This permits manual initial enrollment from the trusted DB owner console only.
-- The API switches to lexa_app_runtime and has NO INSERT/UPDATE grant here.
CREATE POLICY platform_admin_members_owner_enroll ON platform_admin_members FOR INSERT
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner)
    FROM pg_class WHERE oid='platform_admin_members'::regclass));
CREATE POLICY platform_admin_members_owner_revoke ON platform_admin_members FOR UPDATE
  USING(current_user=(SELECT pg_get_userbyid(relowner)
    FROM pg_class WHERE oid='platform_admin_members'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner)
    FROM pg_class WHERE oid='platform_admin_members'::regclass));

ALTER TABLE platform_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_subscriptions_read ON platform_subscriptions FOR SELECT
  USING(tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'') OR platform_admin_authorized());
CREATE POLICY platform_subscriptions_signup ON platform_subscriptions FOR INSERT
  WITH CHECK ((tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'') AND status='pending') OR platform_admin_authorized());
CREATE POLICY platform_subscriptions_admin_update ON platform_subscriptions FOR UPDATE
  USING(platform_admin_authorized()) WITH CHECK(platform_admin_authorized());

ALTER TABLE platform_payment_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_payment_claims FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_payment_claims_read ON platform_payment_claims FOR SELECT
  USING(tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'') OR platform_admin_authorized());
CREATE POLICY platform_payment_claims_submit ON platform_payment_claims FOR INSERT
  WITH CHECK(tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'') AND status='submitted'
    AND submitted_by::text=NULLIF(current_setting('app.user_id',true),''));
CREATE POLICY platform_payment_claims_admin_update ON platform_payment_claims FOR UPDATE
  USING(platform_admin_authorized()) WITH CHECK(platform_admin_authorized());

ALTER TABLE platform_subscription_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_subscription_periods FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_subscription_periods_read ON platform_subscription_periods FOR SELECT
  USING(tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'') OR platform_admin_authorized());
CREATE POLICY platform_subscription_periods_admin_insert ON platform_subscription_periods FOR INSERT
  WITH CHECK(platform_admin_authorized());

ALTER TABLE platform_administration_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_administration_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_admin_audit_read ON platform_administration_audit FOR SELECT USING(platform_admin_authorized());
CREATE POLICY platform_admin_audit_insert ON platform_administration_audit FOR INSERT WITH CHECK(platform_admin_authorized());

ALTER TABLE platform_support_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_support_cases FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_support_read ON platform_support_cases FOR SELECT
  USING(tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'') OR platform_admin_authorized());
CREATE POLICY platform_support_insert ON platform_support_cases FOR INSERT
  WITH CHECK(tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'')
    AND opened_by::text=NULLIF(current_setting('app.user_id',true),''));
CREATE POLICY platform_support_admin_update ON platform_support_cases FOR UPDATE
  USING(platform_admin_authorized()) WITH CHECK(platform_admin_authorized());

ALTER TABLE platform_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_incidents FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_incidents_admin_read ON platform_incidents FOR SELECT USING(platform_admin_authorized());
CREATE POLICY platform_incidents_admin_insert ON platform_incidents FOR INSERT WITH CHECK(platform_admin_authorized());
CREATE POLICY platform_incidents_admin_update ON platform_incidents FOR UPDATE
  USING(platform_admin_authorized()) WITH CHECK(platform_admin_authorized());

-- The runtime role cannot enroll admins, rewrite ledgers, or delete billing records.
GRANT SELECT ON platform_admin_members TO lexa_app_runtime;
GRANT SELECT,INSERT,UPDATE ON platform_subscriptions,platform_payment_claims,platform_support_cases TO lexa_app_runtime;
GRANT SELECT,INSERT ON platform_subscription_periods,platform_administration_audit TO lexa_app_runtime;
GRANT SELECT,INSERT,UPDATE ON platform_incidents TO lexa_app_runtime;

-- A deliberately narrow directory for platform account-support staff. Do NOT
-- grant platform admins unrestricted SELECT on users/password_hash or ERP rows.
CREATE TABLE platform_user_directory (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  email text NOT NULL,
  display_name text,
  membership_role text NOT NULL,
  membership_status text NOT NULL,
  joined_at timestamptz(3) NOT NULL,
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,user_id)
);
CREATE INDEX platform_user_directory_search ON platform_user_directory(lower(email));
-- Read only the exact existing user / membership metadata, never credentials.
INSERT INTO platform_user_directory(tenant_id,user_id,email,display_name,membership_role,membership_status,joined_at)
 SELECT m.tenant_id,m.user_id,u.email,u.display_name,m.role,m.status::text,m.created_at
 FROM memberships m JOIN users u ON u.id=m.user_id WHERE true ON CONFLICT DO NOTHING;
ALTER TABLE platform_user_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_user_directory FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_directory_admin_read ON platform_user_directory FOR SELECT
  USING(platform_admin_authorized());
-- Trigger executes as the migration owner; this policy does not grant writes to
-- LEXA platform admins or business users. Forced RLS remains enabled.
CREATE POLICY platform_directory_owner_maintenance ON platform_user_directory FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='platform_user_directory'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='platform_user_directory'::regclass));
GRANT SELECT ON platform_user_directory TO lexa_app_runtime;

CREATE FUNCTION platform_refresh_membership_directory() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   UPDATE platform_user_directory SET membership_status='REMOVED',updated_at=now()
   WHERE tenant_id=OLD.tenant_id AND user_id=OLD.user_id;
   RETURN OLD;
 END IF;
 INSERT INTO platform_user_directory(tenant_id,user_id,email,display_name,membership_role,membership_status,joined_at)
 SELECT NEW.tenant_id,NEW.user_id,u.email,u.display_name,NEW.role,NEW.status::text,NEW.created_at
 FROM users u WHERE u.id=NEW.user_id
 ON CONFLICT(tenant_id,user_id) DO UPDATE SET email=EXCLUDED.email,
   display_name=EXCLUDED.display_name,membership_role=EXCLUDED.membership_role,
   membership_status=EXCLUDED.membership_status,updated_at=now();
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION platform_refresh_membership_directory() FROM PUBLIC;
CREATE TRIGGER platform_membership_directory_sync
  AFTER INSERT OR UPDATE OF role,status OR DELETE ON memberships FOR EACH ROW
  EXECUTE FUNCTION platform_refresh_membership_directory();

CREATE FUNCTION platform_refresh_user_directory() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE platform_user_directory SET email=NEW.email,display_name=NEW.display_name,updated_at=now()
 WHERE user_id=NEW.id;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION platform_refresh_user_directory() FROM PUBLIC;
CREATE TRIGGER platform_user_directory_sync
  AFTER UPDATE OF email,display_name ON users FOR EACH ROW
  EXECUTE FUNCTION platform_refresh_user_directory();
