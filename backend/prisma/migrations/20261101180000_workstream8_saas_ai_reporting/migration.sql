-- Workstream 8: SaaS plans, feature entitlements, atomic usage metering and AI audit.
-- Additive only; operational ledgers are not rewritten.
CREATE TABLE IF NOT EXISTS saas_plans (
  plan_key text PRIMARY KEY, display_name text NOT NULL, active boolean NOT NULL DEFAULT true,
  max_users integer NOT NULL CHECK(max_users>0), max_branches integer NOT NULL CHECK(max_branches>0),
  ai_requests_monthly integer NOT NULL CHECK(ai_requests_monthly>=0),
  ai_budget_micros_monthly bigint NOT NULL CHECK(ai_budget_micros_monthly>=0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS saas_plan_features (
  plan_key text NOT NULL REFERENCES saas_plans(plan_key) ON DELETE CASCADE,
  feature_key text NOT NULL, enabled boolean NOT NULL DEFAULT false,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(configuration)='object'),
  PRIMARY KEY(plan_key,feature_key)
);
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  plan_key text NOT NULL REFERENCES saas_plans(plan_key),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('trialing','active','past_due','suspended','cancelled')),
  current_period_start date NOT NULL DEFAULT date_trunc('month',now())::date,
  current_period_end date NOT NULL DEFAULT (date_trunc('month',now())+interval '1 month')::date,
  billing_reference text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(current_period_end>current_period_start)
);
CREATE TABLE IF NOT EXISTS tenant_feature_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_key text NOT NULL, enabled boolean NOT NULL,
  reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 8 AND 500), expires_at timestamptz,
  updated_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,feature_key)
);
CREATE TABLE IF NOT EXISTS tenant_usage_counters (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, meter_key text NOT NULL,
  period_start date NOT NULL, quantity bigint NOT NULL DEFAULT 0 CHECK(quantity>=0),
  amount_micros bigint NOT NULL DEFAULT 0 CHECK(amount_micros>=0), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,meter_key,period_start)
);
CREATE TABLE IF NOT EXISTS ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id text NOT NULL, period_start date NOT NULL, purpose text NOT NULL CHECK(purpose IN ('business_explanation','document_extraction')),
  data_class text NOT NULL CHECK(data_class IN ('public','internal_aggregate','confidential_aggregate','restricted')),
  provider text, model_alias text, provider_model text,
  status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','succeeded','failed','denied')),
  policy_code text, input_tokens integer NOT NULL DEFAULT 0 CHECK(input_tokens>=0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK(output_tokens>=0),
  reserved_micros bigint NOT NULL DEFAULT 0 CHECK(reserved_micros>=0),
  reported_cost_micros bigint CHECK(reported_cost_micros IS NULL OR reported_cost_micros>=0),
  latency_ms integer, correlation_id text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  UNIQUE(tenant_id,request_id)
);
CREATE INDEX IF NOT EXISTS ai_usage_events_tenant_created_idx ON ai_usage_events(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_tenant_branch_created_idx ON ai_usage_events(tenant_id,branch_id,created_at DESC);
CREATE TABLE IF NOT EXISTS tenant_support_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  access_type text NOT NULL CHECK(access_type IN ('diagnostics','read_only_support','impersonation_requested','impersonation_approved','impersonation_denied')),
  reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 8 AND 500), ticket_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object'), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_support_access_audit_tenant_created_idx ON tenant_support_access_audit(tenant_id,created_at DESC);

INSERT INTO saas_plans(plan_key,display_name,max_users,max_branches,ai_requests_monthly,ai_budget_micros_monthly) VALUES
 ('starter','Starter',5,1,60,3000000),('growth','Growth',20,5,300,15000000),
 ('professional','Professional',100,20,1500,75000000),('enterprise','Enterprise',1000,250,10000,500000000)
ON CONFLICT(plan_key) DO UPDATE SET display_name=EXCLUDED.display_name,max_users=EXCLUDED.max_users,
 max_branches=EXCLUDED.max_branches,ai_requests_monthly=EXCLUDED.ai_requests_monthly,
 ai_budget_micros_monthly=EXCLUDED.ai_budget_micros_monthly,updated_at=now();
INSERT INTO saas_plan_features(plan_key,feature_key,enabled,configuration)
SELECT p.plan_key,f.feature_key,f.enabled,f.configuration FROM saas_plans p CROSS JOIN LATERAL (VALUES
 ('analytics.authoritative',true,'{"source":"operational_ledgers"}'::jsonb),
 ('analytics.advanced',p.plan_key<>'starter','{}'::jsonb),
 ('intelligence.explain',true,'{"data_classes":["internal_aggregate","confidential_aggregate"]}'::jsonb),
 ('intelligence.document_extract',true,'{"max_file_bytes":5242880,"providers":[]}'::jsonb),
 ('intelligence.write_actions',false,'{"requires_preview":true,"explicit_confirmation":true,"second_authorization":true}'::jsonb),
 ('saas.usage_view',true,'{}'::jsonb),('saas.feature_management',p.plan_key='enterprise','{}'::jsonb)
) AS f(feature_key,enabled,configuration)
ON CONFLICT(plan_key,feature_key) DO UPDATE SET enabled=EXCLUDED.enabled,configuration=EXCLUDED.configuration;
-- Existing workspaces are grandfathered into the smallest plan that can contain
-- their current active seats and branches. A migration must never strand a live
-- tenant by silently assigning a plan below its existing usage.
INSERT INTO tenant_subscriptions(tenant_id,plan_key,status)
SELECT t.id,CASE
  WHEN COALESCE(b.branch_count,0)>20 OR COALESCE(m.active_users,0)>100 THEN 'enterprise'
  WHEN COALESCE(b.branch_count,0)>5 OR COALESCE(m.active_users,0)>20 THEN 'professional'
  WHEN COALESCE(b.branch_count,0)>1 OR COALESCE(m.active_users,0)>5 THEN 'growth'
  ELSE 'starter' END,'active'
FROM tenants t
LEFT JOIN LATERAL (SELECT count(*)::int AS branch_count FROM branches WHERE tenant_id=t.id) b ON true
LEFT JOIN LATERAL (SELECT count(*)::int AS active_users FROM memberships WHERE tenant_id=t.id AND status='ACTIVE') m ON true
ON CONFLICT(tenant_id) DO NOTHING;


-- Every tenant created after this migration also receives the safe default plan.
-- SECURITY DEFINER is narrowly scoped and uses a fixed search_path; it writes only
-- the one subscription row for the tenant being created.
CREATE OR REPLACE FUNCTION lexa_seed_default_saas_subscription() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  INSERT INTO tenant_subscriptions(tenant_id,plan_key,status)
  VALUES(NEW.id,'starter','active')
  ON CONFLICT(tenant_id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tenants_seed_default_saas_subscription ON tenants;
CREATE TRIGGER tenants_seed_default_saas_subscription
AFTER INSERT ON tenants FOR EACH ROW EXECUTE FUNCTION lexa_seed_default_saas_subscription();



-- Enforce seat and branch caps at the database boundary as well as in the API.
-- Subscription-row locks serialize concurrent inserts so parallel requests cannot
-- exceed a plan's ceiling. Existing tenants have already been grandfathered above.
CREATE OR REPLACE FUNCTION lexa_enforce_tenant_branch_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE plan_limit integer; current_count integer;
BEGIN
  IF TG_OP='UPDATE' AND OLD.tenant_id=NEW.tenant_id THEN RETURN NEW; END IF;
  SELECT p.max_branches INTO plan_limit
  FROM tenant_subscriptions s JOIN saas_plans p ON p.plan_key=s.plan_key
  WHERE s.tenant_id=NEW.tenant_id AND s.status IN ('trialing','active')
  FOR UPDATE OF s;
  IF plan_limit IS NULL THEN
    RAISE EXCEPTION 'An active workspace plan is required to create a branch.' USING ERRCODE='23514';
  END IF;
  SELECT count(*)::int INTO current_count FROM branches WHERE tenant_id=NEW.tenant_id;
  IF current_count >= plan_limit THEN
    RAISE EXCEPTION 'PLAN_BRANCH_LIMIT_REACHED: The current workspace plan has reached its branch limit.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS branches_enforce_tenant_plan_limit ON branches;
CREATE TRIGGER branches_enforce_tenant_plan_limit BEFORE INSERT OR UPDATE OF tenant_id ON branches
FOR EACH ROW EXECUTE FUNCTION lexa_enforce_tenant_branch_limit();

CREATE OR REPLACE FUNCTION lexa_enforce_tenant_seat_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE plan_limit integer; current_count integer;
BEGIN
  IF NEW.status='ACTIVE' AND (
    TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
  ) THEN
    SELECT p.max_users INTO plan_limit
    FROM tenant_subscriptions s JOIN saas_plans p ON p.plan_key=s.plan_key
    WHERE s.tenant_id=NEW.tenant_id AND s.status IN ('trialing','active')
    FOR UPDATE OF s;
    IF plan_limit IS NULL THEN
      RAISE EXCEPTION 'An active workspace plan is required to activate a member.' USING ERRCODE='23514';
    END IF;
    SELECT count(*)::int INTO current_count FROM memberships
    WHERE tenant_id=NEW.tenant_id AND status='ACTIVE' AND user_id<>NEW.user_id;
    IF current_count >= plan_limit THEN
      RAISE EXCEPTION 'PLAN_USER_LIMIT_REACHED: The current workspace plan has reached its active user limit.' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS memberships_enforce_tenant_plan_limit ON memberships;
CREATE TRIGGER memberships_enforce_tenant_plan_limit BEFORE INSERT OR UPDATE ON memberships
FOR EACH ROW EXECUTE FUNCTION lexa_enforce_tenant_seat_limit();

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['tenant_subscriptions','tenant_feature_overrides','tenant_usage_counters','ai_usage_events','tenant_support_access_audit'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname=current_schema() AND tablename=t AND policyname=t||'_tenant_scope') THEN
   EXECUTE format('CREATE POLICY %I ON %I USING (tenant_id::text=NULLIF(current_setting(''app.tenant_id'',true),'''')) WITH CHECK (tenant_id::text=NULLIF(current_setting(''app.tenant_id'',true),''''))',t||'_tenant_scope',t);
  END IF;
 END LOOP;
END $$;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='lexa_app_runtime') THEN
  GRANT SELECT ON saas_plans,saas_plan_features TO lexa_app_runtime;
  GRANT SELECT,INSERT,UPDATE ON tenant_subscriptions,tenant_feature_overrides,tenant_usage_counters,ai_usage_events,tenant_support_access_audit TO lexa_app_runtime;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='lexa_app') THEN
  GRANT SELECT ON saas_plans,saas_plan_features TO lexa_app;
  GRANT SELECT,INSERT,UPDATE,DELETE ON tenant_subscriptions,tenant_feature_overrides,tenant_usage_counters,ai_usage_events,tenant_support_access_audit TO lexa_app;
 END IF;
END $$;
