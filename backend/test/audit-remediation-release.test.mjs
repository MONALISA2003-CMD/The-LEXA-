import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('browser demo uses one canonical /demo/ route and preserves customer app isolation', () => {
  const router = read('lexa-frontend/src/app/router.tsx');
  const entry = read('lexa-frontend/src/app/BrowserDemoRoot.tsx');
  const banner = read('lexa-frontend/src/modules/demo/DemoBanner.tsx');
  const shell = read('lexa-frontend/src/app/layouts/AppShell.tsx');
  const config = JSON.parse(read('lexa-frontend/vercel.json'));
  assert.match(router, /basename: isBrowserDemoBuild \? '\/demo' : '\/'/);
  assert.match(router, /isBrowserDemoBuild \? BrowserDemoRoot : AppShell/);
  assert.match(entry, /browserDemoExists\(\)/);
  assert.match(entry, /hasSample \? <AppShell \/> : <DemoEntryPage \/>/);
  assert.doesNotMatch(banner, /\/demo\/demo/);
  assert.match(shell, /'\/my-employment'/);
  assert.match(shell, /'\/workspace'/);
  assert.ok(config.redirects.some(({source,destination}) => source === '/demo/demo' && destination === '/demo/'));
});

test('sample Assistant and employee routes do not fall back to live customer APIs or report screen', () => {
  const demo = read('lexa-frontend/src/modules/demo/BrowserDemoAreaPage.tsx');
  const assistant = read('lexa-frontend/src/modules/demo/SampleAssistant.tsx');
  const employment = read('lexa-frontend/src/modules/demo/SampleEmployment.tsx');
  assert.match(demo, /path === '\/intelligence'\) return <SampleAssistant\/>/);
  assert.match(demo, /path === '\/my-employment'\) return <SampleEmployment\/>/);
  assert.match(demo, /path === '\/workspace'\) return <SampleBusiness\/>/);
  assert.match(assistant, /localReportsRepository\.getDashboardSnapshot/);
  assert.match(assistant, /not the connected AI Assistant/);
  assert.doesNotMatch(assistant, /apiClient|\bfetch\(/);
  assert.match(employment, /public sample cannot identify an employee/);
});

test('public security claims accurately describe the browser-contained demo', () => {
  const page = read('lexa-frontend/public/security.html');
  assert.match(page, /fictional records stored locally in your browser/);
  assert.doesNotMatch(page, /separate database and temporary sample tenants/);
});

test('signed webhook gateway is additive until a separately approved RLS enforcement release', () => {
  const migration = read('backend/prisma/migrations/20261113100000_notification_webhook_rls_gate/migration.sql');
  const phase2 = read('docs/deployment/notification-webhook-rls-enforcement.sql');
  const controller = read('backend/src/notifications/resend-webhook.controller.ts');
  const worker = read('backend/src/notifications/notification-email-worker.ts');

  // No table privilege changes during the first API rolling restart.
  assert.doesNotMatch(migration, /(?:ENABLE|FORCE) ROW LEVEL SECURITY|REVOKE ALL ON TABLE/);
  assert.match(migration, /lexa_notification_webhook_claim/);
  assert.match(migration, /lexa_notification_webhook_finish/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /REVOKE ALL ON FUNCTION .* FROM PUBLIC/);
  for (const name of ['notification_email_webhook_events', 'notification_email_webhook_routes']) {
    assert.match(phase2, new RegExp('ALTER TABLE public\\.' + name + ' ENABLE ROW LEVEL SECURITY'));
    assert.match(phase2, new RegExp('ALTER TABLE public\\.' + name + ' FORCE ROW LEVEL SECURITY'));
    assert.match(phase2, new RegExp('REVOKE ALL ON TABLE public\\.' + name + ' FROM lexa_app_runtime'));
  }
  assert.ok(phase2.includes("WITH CHECK (tenant_id::text = NULLIF(current_setting('app.tenant_id'"));
  assert.match(controller, /verifyResendWebhookSignature/);
  assert.match(controller, /lexa_notification_webhook_claim/);
  assert.match(controller, /lexa_notification_webhook_finish/);
  assert.doesNotMatch(controller, /FROM notification_email_webhook_routes/);
  assert.match(worker, /INSERT INTO notification_email_webhook_routes/);
  assert.match(worker, /ON CONFLICT DO NOTHING/);
  assert.doesNotMatch(worker, /ON CONFLICT\\(provider_message_id\\)/);
});
