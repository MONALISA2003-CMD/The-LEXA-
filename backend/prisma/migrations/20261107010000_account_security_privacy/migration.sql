-- LEXA account security and privacy. Additive; existing account and session IDs are preserved.
CREATE TABLE trusted_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 credential_hash text NOT NULL UNIQUE, label varchar(160) NOT NULL,
 created_at timestamptz(3) NOT NULL DEFAULT now(), last_seen_at timestamptz(3) NOT NULL DEFAULT now(),
 expires_at timestamptz(3) NOT NULL, revoked_at timestamptz(3)
);
CREATE INDEX trusted_devices_user_status_idx ON trusted_devices(user_id,revoked_at,expires_at);
ALTER TABLE sessions ADD COLUMN trusted_device_id uuid REFERENCES trusted_devices(id) ON DELETE SET NULL;
CREATE INDEX sessions_trusted_device_idx ON sessions(trusted_device_id);

-- The browser credential and session must belong to the same account even if an API client is faulty.
CREATE FUNCTION lexa_session_device_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.trusted_device_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM trusted_devices d WHERE d.id=NEW.trusted_device_id AND d.user_id=NEW.user_id
 ) THEN
   RAISE EXCEPTION 'A browser credential cannot be attached to another account' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sessions_device_owner_guard BEFORE INSERT OR UPDATE OF user_id,trusted_device_id
 ON sessions FOR EACH ROW EXECUTE FUNCTION lexa_session_device_owner_guard();


CREATE TABLE login_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE, code_hash text, method varchar(16) NOT NULL CHECK(method IN ('email','totp')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 expires_at timestamptz(3) NOT NULL, consumed_at timestamptz(3),
 created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX login_challenges_user_time_idx ON login_challenges(user_id,created_at DESC);
CREATE INDEX login_challenges_expiration_idx ON login_challenges(expires_at);

CREATE TABLE authenticator_credentials (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 encrypted_secret text NOT NULL, enabled_at timestamptz(3), setup_expires_at timestamptz(3),
 last_used_step integer NOT NULL DEFAULT -1, recovery_hashes text[] NOT NULL DEFAULT ARRAY[]::text[],
 created_at timestamptz(3) NOT NULL DEFAULT now()
);

CREATE TABLE account_security_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 event_type varchar(64) NOT NULL, device_label varchar(160),
 created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX account_security_events_user_time_idx ON account_security_events(user_id,created_at DESC);

CREATE TABLE user_privacy_preferences (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 optional_analytics boolean NOT NULL DEFAULT false,
 policy_version varchar(32) NOT NULL DEFAULT '2026-11-05',
 updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE TABLE privacy_consent_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 optional_analytics boolean NOT NULL, policy_version varchar(32) NOT NULL,
 changed_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX privacy_consent_events_user_time_idx ON privacy_consent_events(user_id,changed_at DESC);

-- User-scoped policies, including token-scoped lookup only for unauthenticated one-time challenges.
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['trusted_devices','login_challenges','authenticator_credentials','account_security_events','user_privacy_preferences','privacy_consent_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY self_owned ON public.%I FOR ALL USING (user_id::text = NULLIF(current_setting(''app.user_id'',true),'''')) WITH CHECK (user_id::text = NULLIF(current_setting(''app.user_id'',true),''''))',table_name);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO lexa_app_runtime',table_name);
 END LOOP;
END $$;
CREATE POLICY login_challenge_token_lookup ON login_challenges FOR SELECT USING (
 token_hash = NULLIF(current_setting('app.login_challenge_hash',true),'')
);

CREATE FUNCTION lexa_account_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Security and consent history is append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER account_security_events_immutable BEFORE UPDATE OR DELETE ON account_security_events FOR EACH ROW EXECUTE FUNCTION lexa_account_evidence_immutable();
CREATE TRIGGER privacy_consent_events_immutable BEFORE UPDATE OR DELETE ON privacy_consent_events FOR EACH ROW EXECUTE FUNCTION lexa_account_evidence_immutable();
REVOKE UPDATE,DELETE ON account_security_events,privacy_consent_events FROM lexa_app_runtime;

-- Anti-brute-force state is not subject to account ownership: attempts happen before login.
-- Expose a parameterized, bounded definer function, never the table itself.
CREATE FUNCTION lexa_login_rate_gate(p_key text, p_failed boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE prior auth_rate_limits%ROWTYPE;
BEGIN
 IF length(p_key)<>64 THEN RAISE EXCEPTION 'Invalid rate-limit key'; END IF;
 INSERT INTO auth_rate_limits(key,attempts,window_started_at,updated_at)
 VALUES(p_key,0,now(),now()) ON CONFLICT(key) DO NOTHING;
 SELECT * INTO prior FROM auth_rate_limits WHERE key=p_key FOR UPDATE;
 IF prior.window_started_at < now()-interval '15 minutes' THEN
  UPDATE auth_rate_limits SET attempts=CASE WHEN p_failed IS TRUE THEN 1 ELSE 0 END,window_started_at=now(),updated_at=now() WHERE key=p_key;
  RETURN true;
 END IF;
 IF prior.attempts>=12 THEN RETURN false; END IF;
 IF p_failed IS TRUE THEN
  UPDATE auth_rate_limits SET attempts=attempts+1,updated_at=now() WHERE key=p_key;
 ELSIF p_failed IS FALSE THEN
  UPDATE auth_rate_limits SET attempts=0,window_started_at=now(),updated_at=now() WHERE key=p_key;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION lexa_login_rate_gate(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lexa_login_rate_gate(text,boolean) TO lexa_app_runtime;

INSERT INTO platform_backup_inventory(table_name,disposition,domain,rationale,dependency_order) VALUES
 ('trusted_devices','excluded','identity','Device credentials are deliberately invalidated during disaster recovery',40),
 ('login_challenges','excluded','identity','One-time login challenges must never be restored',40),
 ('authenticator_credentials','authoritative','identity','Encrypted authenticator enrollment and recovery information; restore only with encryption key and strict owner review',41),
 ('account_security_events','authoritative','audit','Append-only account login, device and MFA event history',42),
 ('user_privacy_preferences','authoritative','privacy','Per-user privacy choices with default-deny optional analytics',42),
 ('privacy_consent_events','authoritative','privacy','Append-only proof of consent choice changes and policy version',43)
ON CONFLICT(table_name) DO UPDATE SET disposition=EXCLUDED.disposition,domain=EXCLUDED.domain,rationale=EXCLUDED.rationale,dependency_order=EXCLUDED.dependency_order;
