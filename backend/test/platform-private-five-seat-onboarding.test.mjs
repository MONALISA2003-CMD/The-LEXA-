import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
const sql=read('../prisma/migrations/20261110100000_private_platform_admin_enrolment/migration.sql');
const backend=read('../src/platform-administration/platform-administrator-auth.controller.ts');
const platform=read('../src/platform-administration/platform-administration.controller.ts');
const login=read('../../lexa-frontend/src/modules/platform-admin/PlatformAdministratorLoginPage.tsx');
const setup=read('../../lexa-frontend/src/modules/platform-admin/PlatformAdministratorSetupPage.tsx');
const api=read('../../lexa-frontend/src/data/remote/apiPlatformAdministration.ts');
const shell=read('../../lexa-frontend/src/modules/platform-admin/PlatformAdministrationPage.tsx');
const router=read('../../lexa-frontend/src/app/router.tsx');

test('founder onboarding is email-bound to the developer with no Neon manual role grant',()=>{
 assert.match(sql,/kabuusumohammed182@gmail\.com/);
 assert.match(sql,/platform_admin_request_founder/);
 assert.match(sql,/platform_admin_bootstrap_available\(\)/);
 assert.match(sql,/interval '30 minutes'/);
 assert.match(backend,/sendTransactionalEmail/);
 assert.match(backend,/\/platform-admin\/setup\?token=/);
 assert.doesNotMatch(backend,/DATABASE_URL_UNPOOLED|LEXA_BOOTSTRAP_SECRET|platform_admin_members_owner_enroll/);
});
test('administrator identity and session are distinct from customer accounts and sessions',()=>{
 assert.match(sql,/CREATE TABLE platform_admin_accounts/);
 assert.match(sql,/CREATE TABLE platform_admin_sessions/);
 assert.match(sql,/lexa-admin-.*identity\.lexa\.invalid/);
 assert.match(platform,/cookie\(request, 'lexa_admin_session'\)/);
 assert.match(backend,/lexa_admin_session=/);
 assert.match(backend,/platform_admin_private_login/);
 assert.doesNotMatch(login,/apiAuth\.signIn|lexa_session=/);
 assert.match(api,/apiPlatformAdministratorAuth/);
});
test('all new admin credentials require a verified unexpired one-time email invitation',()=>{
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/consumed_at IS NULL AND expires_at>now\(\)/);
 assert.match(sql,/UPDATE platform_admin_enrolment_links SET consumed_at=now\(\)/);
 assert.match(sql,/invitation\.email<>lower\(trim\(p_email\)\)/);
 assert.match(backend,/length<12|value.length<12/);
 assert.match(backend,/scrypt/);
 assert.match(setup,/auth.register\(token,email\.trim\(\),name\.trim\(\),password\)/);
});
test('Super Administrators invite up to five people and can revoke peers, but not themselves',()=>{
 assert.match(sql,/seats>=5/);
 assert.match(sql,/interval '24 hours'/);
 assert.match(sql,/p_actor=p_target THEN RETURN false/);
 assert.match(sql,/m\.role='super_admin'/);
 assert.match(sql,/DELETE FROM platform_admin_sessions WHERE user_id=p_target/);
 assert.match(backend,/@Post\('invite'\)/);
 assert.match(backend,/this\.superAdmin\(request\)/);
 assert.match(shell,/Admin team & invitations/);
 assert.match(shell,/adminAuth\.invite\(/);
});
test('login is rate-limited and recovery invalidates dedicated administrator sessions',()=>{
 assert.match(sql,/platform_admin_login_limits/);
 assert.match(sql,/locked_until/);
 assert.match(sql,/p_failed IS NULL THEN RETURN true/);
 assert.match(sql,/platform_admin_recovery_finish/);
 assert.match(sql,/DELETE FROM platform_admin_sessions WHERE user_id=target/);
 assert.match(backend,/platform_admin_login_limiter\(/);
 assert.match(backend,/platform_admin_recovery_request/);
 assert.match(router,/path: '\/platform-admin\/reset'/);
});
test('admin security tables are RLS restricted and functions are executable only by runtime',()=>{
 for(const table of ['platform_admin_accounts','platform_admin_enrolment_links','platform_admin_sessions','platform_admin_recovery_tokens'])assert.match(sql,new RegExp(table));
 assert.match(sql,/FORCE ROW LEVEL SECURITY/);
 assert.match(sql,/platform_admin_members_owner_lookup/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.platform_admin_claim_enrolment/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.platform_admin_claim_enrolment/);
 assert.doesNotMatch(sql,/DELETE FROM (?:tenants|memberships|sales|ledger_)/i);
});
test('both confirmed WhatsApp contacts are published without billing-phone configuration',()=>{
 assert.match(platform,/256749064282,256703953711/);
 assert.match(platform,/whatsappNumbers: numbers/);
 const bill=read('../../lexa-frontend/src/modules/platform-admin/SubscriptionAccessPage.tsx');
 assert.match(bill,/status\?\.whatsappNumbers/);
 assert.match(bill,/wa\.me\/\$\{number\}/);
});

test('failed founder invitation email releases the one-use token without delaying retry',()=>{
 assert.match(sql,/CREATE FUNCTION platform_admin_cancel_founder/);
 assert.match(sql,/WHERE kind='founder' AND consumed_at IS NULL AND created_at > now\(\)-interval '10 minutes'/);
 assert.match(backend,/await this\.prisma\.\$queryRaw`SELECT platform_admin_cancel_founder\(\$\{hash\}\)`/);
});
