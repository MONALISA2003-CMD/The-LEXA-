import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..','..');
const src=(path)=>readFileSync(join(root,path),'utf8');

// Import pure policy with native TypeScript type stripping so this contract test
// remains independent of an installed Nest application and external services.
const policy=await import('../src/demo/demo-policy.ts');
test('public demo is never enabled by default and rejects production credentials',()=>{
  assert.equal(policy.isDemoRuntime({}),false);
  assert.equal(policy.isDemoRuntime({LEXA_RUNTIME_MODE:'demo'}),true);
  const valid={LEXA_RUNTIME_MODE:'demo', NODE_ENV:'production',DEMO_DATABASE_NAME:'lexa_demo',
    DEMO_ORIGIN:'https://demo.lexaaamaal.com',TURNSTILE_SECRET_KEY:'test',DEMO_TURNSTILE_ENFORCE:'true',
    DEMO_IP_HASH_SECRET:'x'.repeat(40),DATABASE_URL:'postgresql://u:password@test.invalid/lexa_demo',
    DATABASE_URL_UNPOOLED:'postgresql://u:password@test.invalid/lexa_demo'};
  assert.doesNotThrow(()=>policy.validateDemoEnvironment(valid));
  for(const bad of [{...valid,DATABASE_URL:'postgresql://u:password@test.invalid/lexa'},
    {...valid,DATABASE_URL_UNPOOLED:'postgresql://u:password@test.invalid/lexa'},
    {...valid,DEMO_TURNSTILE_ENFORCE:'false'},
    {...valid,DEMO_DATABASE_NAME:'lexa'},
    {...valid,DEMO_IP_HASH_SECRET:'short'},
  ]) assert.throws(()=>policy.validateDemoEnvironment(bad));
});
test('demo allowlist excludes platform-wide actions, billing, real integrations, uploads and backups',()=>{
  const p=policy.demoRoutePolicy;
  assert.equal(p('POST','/api/v1/demo/sessions'),'public');
  assert.equal(p('GET','/api/v1/auth/csrf'),'public');
  assert.equal(p('GET','/api/v1/auth/session'),'visitor');
  assert.equal(p('GET','/api/v1/workspaces'),'visitor');
  const scope='/api/v1/workspaces/00000000-0000-4000-8000-000000000001';
  assert.equal(p('GET',`${scope}/branches/00000000-0000-4000-8000-000000000002/dashboard`),'visitor');
  assert.equal(p('POST',`${scope}/branches/00000000-0000-4000-8000-000000000002/sales/complete`),'visitor');
  for(const path of ['/api/v1/platform-admin','/api/v1/auth/signup','/api/v1/auth/register','/api/v1/auth/login',
    `${scope}/backup`,`${scope}/backup/restore`,`${scope}/invitations`,
    `${scope}/imports/products-csv`,`${scope}/platform-billing/payments`,
    `${scope}/attachments/sign`,`${scope}/branches/anything/integrations`,
    `${scope}/branches/anything/send-email`,`${scope}/branches/anything/payroll/disburse`,
    `${scope}/branches/anything/efris/submit`,`${scope}/branches/anything/upload`]) {
    assert.equal(p('POST',path),'blocked',path);
  }
  assert.equal(p('DELETE',`${scope}/products/123`),'blocked');
});
test('demo sessions expire on absolute expiry, 30 minute inactivity or explicit end',()=>{
  const now=new Date('2026-11-08T08:00:00Z');
  assert.equal(policy.validDemoSession(new Date('2026-11-08T09:00:00Z'),new Date('2026-11-08T07:35:00Z'),null,now),true);
  assert.equal(policy.validDemoSession(new Date('2026-11-08T07:59:00Z'),new Date('2026-11-08T07:59:00Z'),null,now),false);
  assert.equal(policy.validDemoSession(new Date('2026-11-08T10:00:00Z'),new Date('2026-11-08T07:29:00Z'),null,now),false);
  assert.equal(policy.validDemoSession(new Date('2026-11-08T10:00:00Z'),new Date('2026-11-08T07:59:00Z'),now,now),false);
});
test('demo migration enforces database-name isolation, RLS and transactionally constrained cleanup',()=>{
  const sql=src('backend/prisma/migrations/20261111100000_isolated_demo_sessions/migration.sql');
  assert.match(sql,/current_database\(\)='lexa_demo'/);
  assert.match(sql,/FORCE ROW LEVEL SECURITY/);
  assert.match(sql,/platform_subscriptions FOR UPDATE/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/DELETE FROM public\.%I WHERE tenant_id=\$1/);
  assert.match(sql,/DELETE FROM demo_sessions WHERE id=item\.id/);
  assert.match(sql,/DELETE FROM tenants WHERE id=item\.tenant_id/);
  assert.doesNotMatch(sql,/DISABLE TRIGGER|session_replication_role\s*=|TRUNCATE\s+tenants/i);
});
test('demo uses true production business API and real seeded linked transactions',()=>{
  const seed=src('backend/src/demo/demo-seed.ts');
  assert.match(seed,/tx\.sale\.createMany/);
  assert.match(seed,/tx\.saleLine\.createMany/);
  assert.match(seed,/tx\.salePayment\.createMany/);
  assert.match(seed,/tx\.stockMovement\.createMany/);
  assert.match(seed,/tx\.moduleRecord\.createMany/);
  assert.match(seed,/DEMO_MODULES/);
  const api=src('lexa-frontend/src/data/remote/apiDemo.ts');
  assert.match(api,/apiClient\.post.*\/demo\/sessions/);
  assert.match(src('lexa-frontend/src/app/router.tsx'),/\/demo/);
  assert.match(src('backend/src/app.module.ts'),/DemoModeGuard/);
  assert.match(src('backend/src/prisma/prisma.service.ts'),/demoSession/);
  assert.match(src('backend/src/notifications/email-delivery.ts'),/DEMO_EXTERNAL_EMAIL_DISABLED/);
});
test('public marketing pages have indexable homepage while app shell is not indexed',()=>{
  const home=src('lexa-frontend/marketing/index.html');
  assert.match(home,/index,follow/);
  assert.match(home,/<link rel="canonical" href="https:\/\/lexaaamaal\.com\/"/);
  assert.match(home,/https:\/\/demo\.lexaaamaal\.com\/demo/);
  assert.match(home,/https:\/\/app\.lexaaamaal\.com\/sign-in/);
  assert.match(src('lexa-frontend/index.html'),/noindex,nofollow/);
  assert.ok(existsSync(join(root,'lexa-frontend/marketing/sitemap.xml')));
});


test('temporary demo session table has an explicit excluded-from-backup disposition',()=>{
  const entries=JSON.parse(src('backend/backup/authoritative-inventory.json'));
  const item=entries.find(x=>x.table==='demo_sessions');
  assert.equal(item?.disposition,'excluded');
  assert.match(item.rationale,/ephemeral|temporary|session/i);
  assert.match(src('backend/scripts/check-backup-inventory.mjs'),/Backup inventory missing tables/);
});
test('release package has an isolated demo Vercel builder, not a production bundle copy',()=>{
  const script=src('scripts/build_demo_vercel_bundle.py');
  assert.match(script,/VITE_LEXA_DEMO.*true/);
  assert.match(script,/VITE_API_BASE_URL.*\/api\/v1/);
  assert.match(script,/lexa-demo-api\.onrender\.com/);
  assert.match(script,/npm.*run.*build/);
});


test('NestJS sandbox rate limit uses an exported HttpException and HTTP 429',()=>{
  const service=src('backend/src/demo/demo-session.service.ts');
  assert.match(service,/import\s*\{[^}]*HttpException[^}]*HttpStatus[^}]*\}\s*from\s*'@nestjs\/common'/);
  assert.match(service,/new HttpException\(\{code:'DEMO_RATE_LIMIT',[\s\S]*?HttpStatus\.TOO_MANY_REQUESTS\)/);
  assert.doesNotMatch(service,/TooManyRequestsException/);
});

test('strict TypeScript demo database URLs are narrowed before parsing',()=>{
  const policySource=src('backend/src/demo/demo-policy.ts');
  assert.match(policySource,/const configuredUrl\s*=\s*env\[key\]/);
  assert.match(policySource,/typeof configuredUrl !== 'string' \|\| !configuredUrl\.trim\(\)/);
  assert.match(policySource,/new URL\(configuredUrl\)/);
  assert.doesNotMatch(policySource,/new URL\(env\[key\]\)/);
  assert.match(policySource,/url\.protocol !== 'postgresql:' && url\.protocol !== 'postgres:'/);
});
