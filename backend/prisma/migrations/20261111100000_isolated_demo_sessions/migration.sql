-- Additive application capability: does not modify or backfill any customer account.
-- Sandbox controllers fail closed unless LEXA_RUNTIME_MODE=demo AND current_database()='lexa_demo'.
CREATE TABLE demo_sessions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  visitor_hash text NOT NULL,
  seed_version integer NOT NULL DEFAULT 1,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  expires_at timestamptz(3) NOT NULL,
  last_seen_at timestamptz(3) NOT NULL DEFAULT now(),
  ended_at timestamptz(3),
  CONSTRAINT demo_session_time_valid CHECK (expires_at > created_at)
);
CREATE INDEX demo_sessions_visitor_rate ON demo_sessions(visitor_hash, created_at DESC);
CREATE INDEX demo_sessions_expiry ON demo_sessions(expires_at) WHERE ended_at IS NULL;
ALTER TABLE demo_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY demo_session_self_read ON demo_sessions FOR SELECT
  USING (current_database()='lexa_demo'
    AND user_id::text=NULLIF(current_setting('app.user_id',true),'')
    AND tenant_id::text=NULLIF(current_setting('app.tenant_id',true),''));
CREATE POLICY demo_session_self_insert ON demo_sessions FOR INSERT
  WITH CHECK (current_database()='lexa_demo'
    AND user_id::text=NULLIF(current_setting('app.user_id',true),'')
    AND tenant_id::text=NULLIF(current_setting('app.tenant_id',true),''));
CREATE POLICY demo_session_self_update ON demo_sessions FOR UPDATE
  USING (current_database()='lexa_demo'
    AND user_id::text=NULLIF(current_setting('app.user_id',true),'')
    AND tenant_id::text=NULLIF(current_setting('app.tenant_id',true),''))
  WITH CHECK (current_database()='lexa_demo'
    AND user_id::text=NULLIF(current_setting('app.user_id',true),'')
    AND tenant_id::text=NULLIF(current_setting('app.tenant_id',true),''));
GRANT SELECT, INSERT, UPDATE ON demo_sessions TO lexa_app_runtime;

-- Actual demo tenant seed starts as pending, just like a genuine signup. Only
-- the *isolated demo database* may activate that temporary subscription, never
-- production, and it must be owned by the same temporary identity.
CREATE POLICY demo_subscription_temporary_activation ON platform_subscriptions FOR UPDATE
 USING (current_database()='lexa_demo'
    AND tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM demo_sessions d
      WHERE d.tenant_id=platform_subscriptions.tenant_id
        AND d.user_id::text=NULLIF(current_setting('app.user_id',true),'')))
 WITH CHECK (current_database()='lexa_demo'
    AND status='active' AND paid_through IS NOT NULL AND paid_through<=now()+interval '2 hours'
    AND tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM demo_sessions d
      WHERE d.tenant_id=platform_subscriptions.tenant_id
        AND d.user_id::text=NULLIF(current_setting('app.user_id',true),'')));

-- Enforced by database even if two API instances race to create new demos.
-- Advisory transaction lock serializes starts from the same anonymized address.
CREATE FUNCTION lexa_demo_assert_start_limit(p_visitor_hash text, p_limit integer DEFAULT 8)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE used integer;
BEGIN
 IF current_database() <> 'lexa_demo' THEN RAISE EXCEPTION 'Not a demo database'; END IF;
 IF length(p_visitor_hash) <> 64 OR p_limit < 1 OR p_limit > 30 THEN RAISE EXCEPTION 'Invalid demo rate limiter'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_visitor_hash, 1917));
 SELECT count(*) INTO used FROM demo_sessions WHERE visitor_hash=p_visitor_hash AND created_at > now()-interval '1 hour';
 IF used >= p_limit THEN RAISE EXCEPTION 'DEMO_RATE_LIMIT' USING ERRCODE='P0001'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION lexa_demo_assert_start_limit(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lexa_demo_assert_start_limit(text,integer) TO lexa_app_runtime;

-- Expired demo data is purged per visitor in a demo-only SECURITY DEFINER
-- transaction. Deletions are constrained by the exact tenant_id at every step;
-- FK constraints are NOT disabled. A failed purge rolls back atomically.
CREATE FUNCTION lexa_demo_purge_expired(p_limit integer DEFAULT 5)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE
  item record;
  tbl record;
  pass integer;
  removed integer;
  changed integer;
  remaining integer;
  processed integer:=0;
BEGIN
  IF current_database()<>'lexa_demo' THEN RAISE EXCEPTION 'Not a demo database'; END IF;
  IF p_limit<1 OR p_limit>20 THEN RAISE EXCEPTION 'Invalid purge batch limit'; END IF;
  PERFORM pg_advisory_xact_lock(2093379817);
  FOR item IN
    SELECT d.id,d.tenant_id,d.user_id FROM demo_sessions d
    WHERE d.ended_at IS NOT NULL OR d.expires_at<=now()
       OR d.last_seen_at<now()-interval '30 minutes'
    ORDER BY d.expires_at LIMIT p_limit FOR UPDATE
  LOOP
    -- Apply tenant identity to FORCED RLS tables even though this function
    -- runs as the trusted migration owner. Never suppress RLS or FK triggers.
    PERFORM set_config('app.user_id',item.user_id::text,true);
    PERFORM set_config('app.tenant_id',item.tenant_id::text,true);
    UPDATE demo_sessions SET ended_at=COALESCE(ended_at,now()) WHERE id=item.id;
    UPDATE categories SET parent_id=NULL WHERE tenant_id=item.tenant_id AND parent_id IS NOT NULL;
    UPDATE ledger_journals SET reversal_of_id=NULL WHERE tenant_id=item.tenant_id AND reversal_of_id IS NOT NULL;

    FOR pass IN 1..30 LOOP
      changed:=0;
      FOR tbl IN
        SELECT c.table_name FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
        WHERE c.table_schema='public' AND c.column_name='tenant_id'
          AND c.table_name NOT IN ('demo_sessions','tenants')
        GROUP BY c.table_name ORDER BY c.table_name
      LOOP
        BEGIN
          EXECUTE format('DELETE FROM public.%I WHERE tenant_id=$1',tbl.table_name) USING item.tenant_id;
          GET DIAGNOSTICS removed=ROW_COUNT;
          changed:=changed+removed;
        EXCEPTION WHEN foreign_key_violation THEN
          -- Another tenant-scoped table still references this one; retry on
          -- the next pass after its child rows have been deleted.
          NULL;
        END;
      END LOOP;
      EXIT WHEN changed=0;
    END LOOP;
    FOR tbl IN
      SELECT c.table_name FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
      WHERE c.table_schema='public' AND c.column_name='tenant_id'
        AND c.table_name NOT IN ('demo_sessions','tenants')
      GROUP BY c.table_name
    LOOP
      EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id=$1',tbl.table_name)
        INTO remaining USING item.tenant_id;
      IF remaining>0 THEN RAISE EXCEPTION 'Demo cleanup blocked by % (% rows)',tbl.table_name,remaining; END IF;
    END LOOP;
    DELETE FROM demo_sessions WHERE id=item.id;
    DELETE FROM tenants WHERE id=item.tenant_id;
    DELETE FROM users WHERE id=item.user_id;
    processed:=processed+1;
  END LOOP;
  RETURN processed;
END;
$$;
REVOKE ALL ON FUNCTION lexa_demo_purge_expired(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lexa_demo_purge_expired(integer) TO lexa_app_runtime;
