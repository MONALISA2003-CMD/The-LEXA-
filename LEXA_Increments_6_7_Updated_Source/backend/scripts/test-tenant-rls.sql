-- DISPOSABLE-CI-ONLY: exercise the exact runtime policies installed by migrations.
-- This script rolls back all test data and never applies changes to a persistent environment.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lexa_app_runtime') THEN
    RAISE EXCEPTION 'RLS migration must create lexa_app_runtime before this test';
  END IF;
  IF (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = 'lexa_app_runtime') THEN
    RAISE EXCEPTION 'Runtime database role must not be superuser or BYPASSRLS';
  END IF;
  IF (SELECT count(*) FROM pg_tables t JOIN information_schema.columns c ON c.table_schema=t.schemaname AND c.table_name=t.tablename AND c.column_name='tenant_id' WHERE t.schemaname='public' AND NOT t.rowsecurity) > 0 THEN
    RAISE EXCEPTION 'At least one tenant-owned table is missing row-level security';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename IN ('sessions','password_reset_tokens') AND NOT rowsecurity) THEN
    RAISE EXCEPTION 'Session and password reset tables must also have row-level security';
  END IF;
END $$;

-- Seed while using the table owner but with valid tenant GUC context. RLS is FORCEd,
-- so each insert still proves that the corresponding write policy exists.
INSERT INTO users(id,email,display_name,password_hash,created_at,updated_at)
VALUES
 ('11111111-1111-4111-8111-111111111111','rls-a@example.invalid','RLS user A','not-a-login',now(),now()),
 ('22222222-2222-4222-8222-222222222222','rls-b@example.invalid','RLS user B','not-a-login',now(),now())
ON CONFLICT (id) DO NOTHING;
SELECT set_config('app.user_id','11111111-1111-4111-8111-111111111111',true);
INSERT INTO tenants(id,name,slug,updated_at) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','RLS Tenant A','rls-tenant-a',now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','RLS Tenant B','rls-tenant-b',now())
ON CONFLICT (id) DO NOTHING;

SELECT set_config('app.tenant_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
INSERT INTO memberships(tenant_id,user_id,role,status,branch_scope_mode,created_at,updated_at)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner','ACTIVE','all',now(),now())
ON CONFLICT (tenant_id,user_id) DO NOTHING;
INSERT INTO branches(id,tenant_id,code,name,timezone,currency,created_at,updated_at)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','RLS-A','RLS Branch A','Africa/Kampala','UGX',now(),now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO products(id,tenant_id,name,sku,cost_price_minor,selling_price_minor,low_stock_threshold,track_stock,active,created_at,updated_at)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','RLS Product A','RLS-PRODUCT-A',100,200,0,true,true,now(),now())
ON CONFLICT (id) DO NOTHING;

SELECT set_config('app.tenant_id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
INSERT INTO memberships(tenant_id,user_id,role,status,branch_scope_mode,created_at,updated_at)
VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','owner','ACTIVE','all',now(),now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','viewer','ACTIVE','restricted',now(),now())
ON CONFLICT (tenant_id,user_id) DO NOTHING;
INSERT INTO branches(id,tenant_id,code,name,timezone,currency,created_at,updated_at)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbab','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','RLS-B','RLS Branch B','Africa/Kampala','UGX',now(),now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO products(id,tenant_id,name,sku,cost_price_minor,selling_price_minor,low_stock_threshold,track_stock,active,created_at,updated_at)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbac','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','RLS Product B','RLS-PRODUCT-B',100,200,0,true,true,now(),now())
ON CONFLICT (id) DO NOTHING;

SELECT set_config('app.user_id','11111111-1111-4111-8111-111111111111',true);
INSERT INTO sessions(id,user_id,tenant_id,token_hash,expires_at,created_at)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','rls-session-a-hash',now()+interval '1 hour',now());
INSERT INTO password_reset_tokens(id,user_id,tenant_id,token_hash,expires_at,created_at)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaae','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','rls-reset-a-hash',now()+interval '1 hour',now());
SELECT set_config('app.user_id','22222222-2222-4222-8222-222222222222',true);
INSERT INTO sessions(id,user_id,tenant_id,token_hash,expires_at,created_at)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbad','22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','rls-session-b-hash',now()+interval '1 hour',now());
INSERT INTO password_reset_tokens(id,user_id,tenant_id,token_hash,expires_at,created_at)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbae','22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','rls-reset-b-hash',now()+interval '1 hour',now());

SET LOCAL ROLE lexa_app_runtime;
SELECT set_config('app.tenant_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('app.user_id','11111111-1111-4111-8111-111111111111',true);
DO $$
DECLARE visible_products integer; own_memberships integer; visible_tenants integer;
BEGIN
 SELECT count(*) INTO visible_products FROM products WHERE id IN (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac'::uuid,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbac'::uuid
 );
 IF visible_products <> 1 THEN RAISE EXCEPTION 'Product RLS should expose only tenant A; found %',visible_products; END IF;
 SELECT count(*) INTO own_memberships FROM memberships WHERE user_id='11111111-1111-4111-8111-111111111111'::uuid;
 IF own_memberships <> 2 THEN RAISE EXCEPTION 'User-owned memberships should be readable across workspaces; found %',own_memberships; END IF;
 IF (SELECT count(*) FROM sessions) <> 1 THEN RAISE EXCEPTION 'User A must not see User B sessions'; END IF;
 IF (SELECT count(*) FROM password_reset_tokens) <> 1 THEN RAISE EXCEPTION 'User A must not see User B reset tokens'; END IF;
 PERFORM set_config('app.session_token_hash','rls-session-b-hash',true);
 IF (SELECT count(*) FROM sessions WHERE token_hash='rls-session-b-hash') <> 1 THEN RAISE EXCEPTION 'Exact session token lookup should be permitted'; END IF;
 PERFORM set_config('app.session_token_hash','',true);
 PERFORM set_config('app.reset_token_hash','rls-reset-b-hash',true);
 IF (SELECT count(*) FROM password_reset_tokens WHERE token_hash='rls-reset-b-hash') <> 1 THEN RAISE EXCEPTION 'Exact recovery token lookup should be permitted'; END IF;
 SELECT count(*) INTO visible_tenants FROM tenants WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid;
 IF visible_tenants <> 1 THEN RAISE EXCEPTION 'A second owned workspace should be visible as a workspace row'; END IF;
 BEGIN
  INSERT INTO products(id,tenant_id,name,sku,updated_at) VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Cross tenant insert','RLS-CROSS-INSERT',now());
  RAISE EXCEPTION 'Cross-tenant product insert unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  INSERT INTO memberships(tenant_id,user_id,role,status,updated_at) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','manager','ACTIVE',now());
  RAISE EXCEPTION 'Cross-tenant membership write unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 UPDATE products SET name='tampered' WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbac'::uuid;
 IF FOUND THEN RAISE EXCEPTION 'Cross-tenant product update unexpectedly changed a row'; END IF;
END $$;

RESET ROLE;
ROLLBACK;
