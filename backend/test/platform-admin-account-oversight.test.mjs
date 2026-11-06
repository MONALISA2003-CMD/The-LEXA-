import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { observedClientIp, safeClientLabel, authenticatedSessionHash, recentActivity } from '../src/platform-administration/platform-activity-policy.ts';
import { hasOperationalAccess } from '../src/platform-administration/subscription-policy.ts';

const source=(file)=>readFileSync(new URL(file,import.meta.url),'utf8');
const api=source('../src/platform-administration/platform-administration.controller.ts');
const migrations=source('../prisma/migrations/20261109100000_platform_account_activity_controls/migration.sql');
const client=source('../../lexa-frontend/src/modules/platform-admin/PlatformAdministrationPage.tsx');
const recovery=source('../../lexa-frontend/src/modules/platform-admin/PlatformAdministratorRecoveryPage.tsx');
const main=source('../src/main.ts');

test('all new businesses remain payment-pending and cannot bypass billing',()=>{
  const signup=source('../src/auth/public-registration.controller.ts');
  const create=source('../src/core/core.controller.ts');
  const guard=source('../src/platform-administration/subscription-access.guard.ts');
  assert.match(signup,/INSERT INTO platform_subscriptions[\s\S]{0,240}'pending'/);
  assert.match(create,/INSERT INTO platform_subscriptions[\s\S]{0,240}'pending'/);
  assert.match(guard,/hasOperationalAccess\(/);
  assert.match(guard,/LEXA_SUBSCRIPTION_REQUIRED/);
  assert.equal(hasOperationalAccess('pending',new Date(Date.now()+86400000)),false);
  assert.equal(hasOperationalAccess('archived',new Date(Date.now()+86400000)),false);
});

test('manual offline activation requires a confirmed provider receipt, an authorized billing role and atomic records',()=>{
  assert.match(api, /@Post\('businesses\/:tenantId\/activate'\)/);
  assert.match(api, /activateWithVerifiedPayment[\s\S]{0,400}this\.admin\(request,\['super_admin','billing_manager'\]\)/);
  assert.match(api,/b\.confirmation!=='I_VERIFIED_RECEIPT'/);
  assert.match(api,/status='approved'/);
  assert.match(api,/INSERT INTO platform_subscription_periods/);
  assert.match(api,/isolationLevel:'Serializable'/);
  assert.match(migrations,/platform_payment_claims_admin_verified_insert/);
  assert.match(migrations,/platform_admin_can_bill\(\)/);
});

test('archive is reversible, deliberate, audited and never performs tenant data DELETE',()=>{
  assert.match(api, /@Post\('businesses\/:tenantId\/archive'\)/);
  assert.match(api, /b\.confirmation!=='ARCHIVE_BUSINESS'/);
  assert.match(api, /b\.businessName!==rows\[0\]\.business_name/);
  assert.match(api, /status='archived'/);
  assert.match(api, /@Post\('businesses\/:tenantId\/restore'\)/);
  assert.match(api, /previous==='suspended'\?'suspended'/);
  assert.match(api, /'subscription.account.archived'/);
  assert.doesNotMatch(api, /DELETE FROM (?:tenants|users|memberships|sales|ledger_)/i);
});

test('observed IP validation never trusts request-supplied X-Forwarded-For implicitly',()=>{
  assert.equal(observedClientIp('192.0.2.42'),'192.0.2.42');
  assert.equal(observedClientIp('2001:db8::b'), '2001:db8::b');
  assert.equal(observedClientIp('1.1.1.1, 2.2.2.2'),null);
  assert.equal(observedClientIp('forged'),null);
  assert.equal(observedClientIp(null),null);
  assert.equal(safeClientLabel('Mobile\r\nInjected'), 'Mobile  Injected');
  assert.equal(authenticatedSessionHash('x=1; lexa_session=abc%20def; foo=bar')?.length,64);
  assert.equal(authenticatedSessionHash('lexa_session=%') ,null);
  assert.match(main,/LEXA_TRUSTED_PROXY_CIDRS/);
  assert.doesNotMatch(main,/trustProxy:\s*true/);
  assert.match(main,/observedClientIp\(request\.ip\)/);
});

test('real activity is scoped, rate-limited and polls every 15 seconds while visible',()=>{
  assert.match(main,/reply\.statusCode >= 400/);
  assert.match(main,/platform_account_activity/);
  assert.match(main,/interval '15 seconds'/);
  assert.match(migrations,/FORCE ROW LEVEL SECURITY/);
  assert.match(migrations,/platform_account_activity_member_insert/);
  assert.match(api,/@Get\('activity'\)/);
  assert.match(api,/this\.admin\(request,\['super_admin','operations_manager','auditor'\]\)/);
  assert.match(client,/section==='activity'/);
  assert.match(client,/15_000/);
  assert.match(client,/document\.visibilityState==='visible'/);
  assert.equal(recentActivity(new Date(),new Date()),true);
  assert.equal(recentActivity(new Date(0),new Date()),false);
});

test('yellow administrator recovery uses dedicated one-time tokens without a backdoor password',()=>{
  const router=source('../../lexa-frontend/src/app/router.tsx');
  const login=source('../../lexa-frontend/src/modules/platform-admin/PlatformAdministratorLoginPage.tsx');
  const auth=source('../src/platform-administration/platform-administrator-auth.controller.ts');
  assert.match(router, /path: '\/platform-admin\/recover'/);
  assert.match(login, /to="\/platform-admin\/recover"/);
  assert.match(recovery,/auth\.recover\(email\.trim\(\)\)/);
  assert.match(auth,/platform_admin_recovery_request/);
  assert.match(auth,/platform_admin_recovery_finish/);
  assert.doesNotMatch(recovery,/ADMIN_PASSWORD|bootstrapSecret|localStorage|recoveryBypass/);
});

