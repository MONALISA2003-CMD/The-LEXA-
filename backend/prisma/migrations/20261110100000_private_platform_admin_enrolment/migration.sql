-- LEXA isolated administrator identities. Additive: no customer accounts are changed.
-- The initial owner is enrolled only by email possession, and subsequent seats require
-- a signed-in super administrator's expiring, single-use email invitation.
CREATE TABLE platform_admin_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  email text NOT NULL UNIQUE,
  display_name varchar(100) NOT NULL,
  password_hash text NOT NULL,
  verified_at timestamptz(3) NOT NULL DEFAULT now(),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  disabled_at timestamptz(3),
  CHECK(email=lower(email))
);
CREATE TABLE platform_admin_enrolment_links (
  token_hash char(64) PRIMARY KEY,
  email text NOT NULL,
  role text NOT NULL CHECK(role IN ('super_admin','billing_manager','support_agent','operations_manager','auditor')),
  kind text NOT NULL CHECK(kind IN ('founder','invitation')),
  created_by uuid REFERENCES platform_admin_accounts(user_id) ON DELETE RESTRICT,
  expires_at timestamptz(3) NOT NULL,
  consumed_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CHECK(email=lower(email))
);
CREATE INDEX platform_admin_links_pending ON platform_admin_enrolment_links(email,expires_at) WHERE consumed_at IS NULL;
CREATE TABLE platform_admin_sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES platform_admin_accounts(user_id) ON DELETE RESTRICT,
  expires_at timestamptz(3) NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX platform_admin_sessions_user ON platform_admin_sessions(user_id,expires_at);
CREATE TABLE platform_admin_recovery_tokens (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES platform_admin_accounts(user_id) ON DELETE RESTRICT,
  expires_at timestamptz(3) NOT NULL,
  consumed_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX platform_admin_recovery_user ON platform_admin_recovery_tokens(user_id,created_at DESC);
CREATE TABLE platform_admin_login_limits (
  key_hash char(64) PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  window_started_at timestamptz(3) NOT NULL DEFAULT now(),
  locked_until timestamptz(3)
);

-- Only migration-owner functions may manipulate the new credential tables.
-- The runtime gets function EXECUTE, never direct SELECT or password export tables.
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['platform_admin_accounts','platform_admin_enrolment_links',
    'platform_admin_sessions','platform_admin_recovery_tokens','platform_admin_login_limits'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY owner_only ON public.%I FOR ALL USING (current_user = (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = %L::regclass)) WITH CHECK (current_user = (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = %L::regclass))',table_name,table_name,table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',table_name);
  END LOOP;
END $$;

-- SECURITY DEFINER functions run as the migration owner. Existing FORCE RLS on
-- platform_admin_members needs a deliberate owner-only SELECT policy.
CREATE POLICY platform_admin_members_owner_lookup ON platform_admin_members FOR SELECT
  USING(current_user=(SELECT pg_get_userbyid(relowner)
    FROM pg_class WHERE oid='platform_admin_members'::regclass));

CREATE FUNCTION platform_admin_bootstrap_available() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=pg_catalog,public AS $$
 SELECT NOT EXISTS (SELECT 1 FROM platform_admin_accounts)
  AND NOT EXISTS (SELECT 1 FROM platform_admin_members WHERE enabled);
$$;

CREATE FUNCTION platform_admin_request_founder(p_email text,p_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(78712101);
  IF lower(trim(p_email)) <> 'kabuusumohammed182@gmail.com' OR p_hash !~ '^[0-9a-f]{64}$'
    OR NOT platform_admin_bootstrap_available() THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM platform_admin_enrolment_links
      WHERE kind='founder' AND consumed_at IS NULL AND created_at > now()-interval '10 minutes') THEN RETURN false; END IF;
  IF (SELECT count(*) FROM platform_admin_enrolment_links WHERE kind='founder'
      AND created_at > now()-interval '24 hours') >= 5 THEN RETURN false; END IF;
  INSERT INTO platform_admin_enrolment_links(token_hash,email,role,kind,expires_at)
    VALUES(p_hash,'kabuusumohammed182@gmail.com','super_admin','founder',now()+interval '30 minutes');
  RETURN true;
END $$;

-- If transactional email fails, the founder invitation must not consume the
-- ten-minute resend allowance; this only revokes the precise unguessable token.
CREATE FUNCTION platform_admin_cancel_founder(p_hash text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 UPDATE platform_admin_enrolment_links SET consumed_at=now()
 WHERE token_hash=p_hash AND kind='founder' AND consumed_at IS NULL;
$$;

CREATE FUNCTION platform_admin_claim_enrolment(p_hash text,p_email text,p_name text,
    p_password_hash text,p_id uuid) RETURNS TABLE(admin_user_id uuid,admin_role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE invitation platform_admin_enrolment_links%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(78712101);
  SELECT * INTO invitation FROM platform_admin_enrolment_links
    WHERE token_hash=p_hash AND consumed_at IS NULL AND expires_at>now() FOR UPDATE;
  IF NOT FOUND OR invitation.email<>lower(trim(p_email)) OR length(trim(p_name)) NOT BETWEEN 2 AND 100
    OR length(p_password_hash) NOT BETWEEN 60 AND 300 THEN RAISE EXCEPTION 'ADMIN_INVITATION_INVALID' USING ERRCODE='P0001'; END IF;
  IF invitation.kind='founder' AND NOT platform_admin_bootstrap_available() THEN
    RAISE EXCEPTION 'ADMIN_FOUNDER_ENROLMENT_CLOSED' USING ERRCODE='P0001'; END IF;
  IF invitation.kind='invitation' AND NOT EXISTS(
    SELECT 1 FROM platform_admin_members m JOIN platform_admin_accounts a ON a.user_id=m.user_id
    WHERE m.user_id=invitation.created_by AND m.role='super_admin' AND m.enabled AND a.disabled_at IS NULL) THEN
    RAISE EXCEPTION 'ADMIN_INVITER_DISABLED' USING ERRCODE='P0001'; END IF;
  IF (SELECT count(*) FROM platform_admin_accounts WHERE disabled_at IS NULL)>=5
    OR EXISTS(SELECT 1 FROM platform_admin_accounts WHERE email=invitation.email) THEN
    RAISE EXCEPTION 'ADMIN_SEAT_UNAVAILABLE' USING ERRCODE='P0001'; END IF;
  -- This database-only surrogate is not a customer login. The actual admin email
  -- and password reside separately and never conflict with a customer identity.
  INSERT INTO users(id,email,display_name,password_hash,updated_at)
    VALUES(p_id,'lexa-admin-'||replace(p_id::text,'-','')||'@identity.lexa.invalid',trim(p_name),NULL,now());
  INSERT INTO platform_admin_accounts(user_id,email,display_name,password_hash)
    VALUES(p_id,invitation.email,trim(p_name),p_password_hash);
  INSERT INTO platform_admin_members(user_id,role,enabled)
    VALUES(p_id,invitation.role,true);
  UPDATE platform_admin_enrolment_links SET consumed_at=now() WHERE token_hash=p_hash;
  PERFORM set_config('app.user_id',p_id::text,true);
  INSERT INTO platform_administration_audit(id,actor_user_id,action,details)
    VALUES(gen_random_uuid(),p_id,'platform.admin.registered',
      jsonb_build_object('role',invitation.role,'method',invitation.kind));
  RETURN QUERY SELECT p_id,invitation.role;
END $$;

CREATE FUNCTION platform_admin_private_login(p_email text)
RETURNS TABLE(admin_user_id uuid, password_hash text, admin_role text, display_name text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=pg_catalog,public AS $$
 SELECT a.user_id,a.password_hash,m.role,a.display_name::text
 FROM platform_admin_accounts a JOIN platform_admin_members m ON m.user_id=a.user_id
 WHERE a.email=lower(trim(p_email)) AND a.disabled_at IS NULL AND m.enabled LIMIT 1;
$$;

CREATE FUNCTION platform_admin_login_limiter(p_hash text,p_failed boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE entry platform_admin_login_limits%ROWTYPE;
BEGIN
  IF p_hash !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
  INSERT INTO platform_admin_login_limits(key_hash,attempts,window_started_at)
    VALUES(p_hash,0,now()) ON CONFLICT(key_hash) DO NOTHING;
  SELECT * INTO entry FROM platform_admin_login_limits WHERE key_hash=p_hash FOR UPDATE;
  IF entry.locked_until>now() THEN RETURN false; END IF;
  IF p_failed IS NULL THEN RETURN true; END IF;
  IF p_failed THEN
    IF entry.window_started_at < now()-interval '15 minutes' THEN
      UPDATE platform_admin_login_limits SET attempts=1,window_started_at=now(),locked_until=NULL WHERE key_hash=p_hash;
    ELSE
      UPDATE platform_admin_login_limits SET attempts=entry.attempts+1,
        locked_until=CASE WHEN entry.attempts>=6 THEN now()+interval '15 minutes' ELSE NULL END WHERE key_hash=p_hash;
    END IF;
  ELSE
    UPDATE platform_admin_login_limits SET attempts=0,window_started_at=now(),locked_until=NULL WHERE key_hash=p_hash;
  END IF;
  RETURN true;
END $$;

CREATE FUNCTION platform_admin_begin_session(p_user_id uuid,p_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF p_hash !~ '^[0-9a-f]{64}$' OR NOT EXISTS(
      SELECT 1 FROM platform_admin_accounts a JOIN platform_admin_members m ON m.user_id=a.user_id
      WHERE a.user_id=p_user_id AND a.disabled_at IS NULL AND m.enabled) THEN RETURN false; END IF;
  INSERT INTO platform_admin_sessions(token_hash,user_id,expires_at) VALUES(p_hash,p_user_id,now()+interval '3 days');
  PERFORM set_config('app.user_id',p_user_id::text,true);
  INSERT INTO platform_administration_audit(id,actor_user_id,action)
    VALUES(gen_random_uuid(),p_user_id,'platform.admin.signed_in');
  RETURN true;
END $$;

CREATE FUNCTION platform_admin_active_session(p_hash text)
RETURNS TABLE(admin_user_id uuid, admin_role text, admin_email text, admin_display_name text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=pg_catalog,public AS $$
 SELECT a.user_id,m.role,a.email,a.display_name::text
 FROM platform_admin_sessions s JOIN platform_admin_accounts a ON a.user_id=s.user_id
 JOIN platform_admin_members m ON m.user_id=a.user_id
 WHERE s.token_hash=p_hash AND s.expires_at>now() AND a.disabled_at IS NULL AND m.enabled LIMIT 1;
$$;

CREATE FUNCTION platform_admin_end_session(p_hash text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 DELETE FROM platform_admin_sessions WHERE token_hash=p_hash;
$$;

CREATE FUNCTION platform_admin_list_team(p_actor uuid)
RETURNS TABLE(admin_user_id uuid, email text, display_name text, role text, enabled boolean, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=pg_catalog,public AS $$
BEGIN
  IF current_setting('app.user_id',true) IS DISTINCT FROM p_actor::text OR NOT EXISTS(
    SELECT 1 FROM platform_admin_members m JOIN platform_admin_accounts a ON a.user_id=m.user_id
    WHERE m.user_id=p_actor AND m.role='super_admin' AND m.enabled AND a.disabled_at IS NULL)
  THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT a.user_id,a.email,a.display_name::text,m.role,m.enabled AND a.disabled_at IS NULL,a.created_at
    FROM platform_admin_accounts a JOIN platform_admin_members m ON m.user_id=a.user_id ORDER BY a.created_at;
END $$;

CREATE FUNCTION platform_admin_issue_invitation(p_actor uuid,p_email text,p_role text,p_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE seats integer;
BEGIN
  PERFORM pg_advisory_xact_lock(78712101);
  IF current_setting('app.user_id',true) IS DISTINCT FROM p_actor::text
    OR NOT EXISTS(SELECT 1 FROM platform_admin_accounts a JOIN platform_admin_members m ON m.user_id=a.user_id
     WHERE a.user_id=p_actor AND a.disabled_at IS NULL AND m.enabled AND m.role='super_admin')
  THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_role NOT IN ('super_admin','billing_manager','support_agent','operations_manager','auditor')
    OR p_hash !~ '^[0-9a-f]{64}$' OR lower(trim(p_email)) !~ '^[^ @]+@[^ @]+\.[^ @]+$' THEN
      RAISE EXCEPTION 'ADMIN_INVITE_INVALID' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO seats FROM platform_admin_accounts WHERE disabled_at IS NULL;
  seats := seats + (SELECT count(DISTINCT email) FROM platform_admin_enrolment_links
    WHERE kind='invitation' AND consumed_at IS NULL AND expires_at>now()
      AND email NOT IN (SELECT email FROM platform_admin_accounts WHERE disabled_at IS NULL));
  IF seats>=5 OR EXISTS(SELECT 1 FROM platform_admin_accounts WHERE email=lower(trim(p_email))) THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM platform_admin_enrolment_links WHERE email=lower(trim(p_email))
    AND consumed_at IS NULL AND expires_at>now()) THEN RETURN false; END IF;
  INSERT INTO platform_admin_enrolment_links(token_hash,email,role,kind,created_by,expires_at)
    VALUES(p_hash,lower(trim(p_email)),p_role,'invitation',p_actor,now()+interval '24 hours');
  INSERT INTO platform_administration_audit(id,actor_user_id,action,details)
    VALUES(gen_random_uuid(),p_actor,'platform.admin.invited',jsonb_build_object('email',lower(trim(p_email)),'role',p_role));
  RETURN true;
END $$;

CREATE FUNCTION platform_admin_cancel_invitation(p_actor uuid,p_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF current_setting('app.user_id',true) IS DISTINCT FROM p_actor::text OR NOT EXISTS(
    SELECT 1 FROM platform_admin_members WHERE user_id=p_actor AND role='super_admin' AND enabled)
    THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN' USING ERRCODE='42501'; END IF;
  UPDATE platform_admin_enrolment_links SET consumed_at=now()
    WHERE token_hash=p_hash AND created_by=p_actor AND consumed_at IS NULL;
END $$;

CREATE FUNCTION platform_admin_update_member(p_actor uuid,p_target uuid,p_enabled boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target_role text;
BEGIN
  PERFORM pg_advisory_xact_lock(78712101);
  IF current_setting('app.user_id',true) IS DISTINCT FROM p_actor::text OR NOT EXISTS(
    SELECT 1 FROM platform_admin_members WHERE user_id=p_actor AND role='super_admin' AND enabled)
    THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_actor=p_target THEN RETURN false; END IF;
  SELECT role INTO target_role FROM platform_admin_members WHERE user_id=p_target FOR UPDATE;
  IF target_role IS NULL THEN RETURN false; END IF;
  IF NOT p_enabled AND target_role='super_admin' AND
    (SELECT count(*) FROM platform_admin_members WHERE enabled AND role='super_admin')<=1 THEN RETURN false; END IF;
  IF p_enabled AND (SELECT count(*) FROM platform_admin_members WHERE enabled)>=5 THEN RETURN false; END IF;
  UPDATE platform_admin_members SET enabled=p_enabled WHERE user_id=p_target;
  UPDATE platform_admin_accounts SET disabled_at=CASE WHEN p_enabled THEN NULL ELSE now() END WHERE user_id=p_target;
  IF NOT p_enabled THEN DELETE FROM platform_admin_sessions WHERE user_id=p_target; END IF;
  INSERT INTO platform_administration_audit(id,actor_user_id,action,details)
    VALUES(gen_random_uuid(),p_actor,CASE WHEN p_enabled THEN 'platform.admin.access_restored' ELSE 'platform.admin.access_revoked' END,
      jsonb_build_object('target',p_target));
  RETURN true;
END $$;

CREATE FUNCTION platform_admin_recovery_request(p_email text,p_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target uuid;
BEGIN
  SELECT a.user_id INTO target FROM platform_admin_accounts a JOIN platform_admin_members m ON m.user_id=a.user_id
    WHERE a.email=lower(trim(p_email)) AND a.disabled_at IS NULL AND m.enabled;
  IF target IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM platform_admin_recovery_tokens WHERE user_id=target
    AND created_at>now()-interval '5 minutes') THEN RETURN false; END IF;
  INSERT INTO platform_admin_recovery_tokens(token_hash,user_id,expires_at)
    VALUES(p_hash,target,now()+interval '30 minutes');
  RETURN true;
END $$;

CREATE FUNCTION platform_admin_recovery_cancel(p_hash text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 DELETE FROM platform_admin_recovery_tokens WHERE token_hash=p_hash;
$$;

CREATE FUNCTION platform_admin_recovery_finish(p_hash text,p_password_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target uuid;
BEGIN
  SELECT user_id INTO target FROM platform_admin_recovery_tokens
    WHERE token_hash=p_hash AND consumed_at IS NULL AND expires_at>now() FOR UPDATE;
  IF target IS NULL OR length(p_password_hash) NOT BETWEEN 60 AND 300 THEN RETURN false; END IF;
  UPDATE platform_admin_recovery_tokens SET consumed_at=now() WHERE token_hash=p_hash;
  UPDATE platform_admin_accounts SET password_hash=p_password_hash WHERE user_id=target;
  DELETE FROM platform_admin_sessions WHERE user_id=target;
  PERFORM set_config('app.user_id',target::text,true);
  INSERT INTO platform_administration_audit(id,actor_user_id,action)
    VALUES(gen_random_uuid(),target,'platform.admin.password_reset');
  RETURN true;
END $$;


-- Explicit signature revocation: no anonymous SQL caller may execute onboarding.
REVOKE ALL ON FUNCTION public.platform_admin_bootstrap_available() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_bootstrap_available() TO lexa_app_runtime;
REVOKE ALL ON FUNCTION public.platform_admin_request_founder(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_request_founder(text,text) TO lexa_app_runtime;
REVOKE ALL ON FUNCTION public.platform_admin_cancel_founder(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_cancel_founder(text) TO lexa_app_runtime;
REVOKE ALL ON FUNCTION public.platform_admin_claim_enrolment(text,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_claim_enrolment(text,text,text,text,uuid) TO lexa_app_runtime;
REVOKE ALL ON FUNCTION public.platform_admin_private_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_private_login(text) TO lexa_app_runtime;
REVOKE ALL ON FUNCTION public.platform_admin_login_limiter(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_login_limiter(text,boolean) TO lexa_app_runtime;
REVOKE ALL ON FUNCTION public.platform_admin_begin_session(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_begin_session(uuid,text) TO lexa_app_runtime;
REVOKE ALL ON FUNCTION public.platform_admin_active_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_active_session(text) TO lexa_app_runtime;
REVOKE ALL ON FUNCTION public.platform_admin_end_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_end_session(text) TO lexa_app_runtime;
REVOKE ALL ON FUNCTION public.platform_admin_list_team(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_list_team(uuid) TO lexa_app_runtime;
REVOKE ALL ON FUNCTION public.platform_admin_issue_invitation(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_issue_invitation(uuid,text,text,text) TO lexa_app_runtime;
REVOKE ALL ON FUNCTION public.platform_admin_cancel_invitation(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_cancel_invitation(uuid,text) TO lexa_app_runtime;
REVOKE ALL ON FUNCTION public.platform_admin_update_member(uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_update_member(uuid,uuid,boolean) TO lexa_app_runtime;
REVOKE ALL ON FUNCTION public.platform_admin_recovery_request(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_recovery_request(text,text) TO lexa_app_runtime;
REVOKE ALL ON FUNCTION public.platform_admin_recovery_cancel(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_recovery_cancel(text) TO lexa_app_runtime;
REVOKE ALL ON FUNCTION public.platform_admin_recovery_finish(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_recovery_finish(text,text) TO lexa_app_runtime;
