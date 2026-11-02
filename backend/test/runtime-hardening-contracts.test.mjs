import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHmac, randomBytes } from 'node:crypto';
import { nextRecurringDate, addCalendarDays, occurrenceKey } from '../src/receivables/recurring-schedule-rules.ts';
import { normalizeRawBody, verifyResendWebhookSignature } from '../src/notifications/resend-signature.ts';
import { NOTIFICATION_CATALOGUE, notificationHref } from '../src/notifications/event-catalogue.ts';

const root = new URL('../', import.meta.url);

function resendSignature(rawBody, id, timestamp, secret) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const digest = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody.toString('utf8')}`).digest('base64');
  return `v1,${digest}`;
}

test('recurring schedules support weekly, monthly, quarterly and annual cycles', () => {
  assert.equal(nextRecurringDate({ currentDate: '2026-11-01', frequency: 'weekly', anchorDay: 1 }), '2026-11-08');
  assert.equal(nextRecurringDate({ currentDate: '2026-01-15', frequency: 'monthly', anchorDay: 15 }), '2026-02-15');
  assert.equal(nextRecurringDate({ currentDate: '2026-01-15', frequency: 'quarterly', anchorDay: 15 }), '2026-04-15');
  assert.equal(nextRecurringDate({ currentDate: '2026-11-01', frequency: 'annual', anchorDay: 1 }), '2027-11-01');
});

test('month-end anchors clamp to the last valid day and restore on longer months', () => {
  assert.equal(nextRecurringDate({ currentDate: '2026-01-31', frequency: 'monthly', anchorDay: 31 }), '2026-02-28');
  assert.equal(nextRecurringDate({ currentDate: '2026-02-28', frequency: 'monthly', anchorDay: 31 }), '2026-03-31');
  assert.equal(nextRecurringDate({ currentDate: '2024-01-31', frequency: 'monthly', anchorDay: 31 }), '2024-02-29');
  assert.equal(nextRecurringDate({ currentDate: '2024-02-29', frequency: 'annual', anchorDay: 29 }), '2025-02-28');
});

test('custom day/week/month/year intervals and invoice due dates use calendar days', () => {
  assert.equal(nextRecurringDate({ currentDate: '2026-03-01', frequency: 'custom', intervalCount: 10, intervalUnit: 'day', anchorDay: 1 }), '2026-03-11');
  assert.equal(nextRecurringDate({ currentDate: '2026-03-01', frequency: 'custom', intervalCount: 2, intervalUnit: 'week', anchorDay: 1 }), '2026-03-15');
  assert.equal(nextRecurringDate({ currentDate: '2026-01-31', frequency: 'custom', intervalCount: 1, intervalUnit: 'month', anchorDay: 31 }), '2026-02-28');
  assert.equal(nextRecurringDate({ currentDate: '2024-02-29', frequency: 'custom', intervalCount: 1, intervalUnit: 'year', anchorDay: 29 }), '2025-02-28');
  assert.equal(addCalendarDays('2024-02-28', 1), '2024-02-29');
  assert.equal(occurrenceKey('2026-03-31'), '2026-03-31');
});

test('recurring date rules reject invalid dates and unsupported units', () => {
  assert.throws(() => nextRecurringDate({ currentDate: '2026-02-30', frequency: 'monthly', anchorDay: 30 }));
  assert.throws(() => nextRecurringDate({ currentDate: '2026-01-01', frequency: 'custom', intervalUnit: null, anchorDay: 1 }));
  assert.throws(() => addCalendarDays('2026-01-01', -1));
});

test('Resend Svix signature accepts a fresh exact raw-body signature', () => {
  const key = randomBytes(32);
  const secret = `whsec_${key.toString('base64')}`;
  const body = Buffer.from(JSON.stringify({ type: 'email.delivered', data: { email_id: 're_123' } }));
  const id = 'msg_lexa_webhook_1';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = resendSignature(body, id, timestamp, secret);
  assert.equal(verifyResendWebhookSignature(body, id, timestamp, signature, secret), true);
  assert.equal(verifyResendWebhookSignature(Buffer.from('{}'), id, timestamp, signature, secret), false);
  assert.equal(verifyResendWebhookSignature(body, id, timestamp, 'v1,invalid', secret), false);
});

test('route-scoped UTF-8 raw-body capture reconstructs the exact bytes used by Svix', () => {
  const key = randomBytes(32);
  const secret = `whsec_${key.toString('base64')}`;
  const body = Buffer.from(JSON.stringify({ type: 'email.delivered', data: { email_id: 're_123' }, note: 'café — Kampala' }), 'utf8');
  const captured = body.toString('utf8');
  const normalized = normalizeRawBody(captured);
  assert.ok(normalized);
  assert.deepEqual(normalized, body);
  const id = 'msg_lexa_webhook_utf8';
  const timestamp = String(Math.floor(Date.now() / 1000));
  assert.equal(verifyResendWebhookSignature(normalized, id, timestamp, resendSignature(body, id, timestamp, secret), secret), true);
  assert.equal(normalizeRawBody(undefined), null);
});

test('Resend webhook rejects stale timestamps, unsigned and malformed deliveries', () => {
  const key = randomBytes(32);
  const secret = `whsec_${key.toString('base64')}`;
  const body = Buffer.from('{"type":"email.bounced"}');
  const id = 'msg_lexa_webhook_2';
  const now = Math.floor(Date.now() / 1000);
  const stale = String(now - 301);
  const signature = resendSignature(body, id, stale, secret);
  assert.equal(verifyResendWebhookSignature(body, id, stale, signature, secret), false);
  assert.equal(verifyResendWebhookSignature(body, '', String(now), 'v1,abc', secret), false);
  assert.equal(verifyResendWebhookSignature(body, id, 'not-a-time', 'v1,abc', secret), false);
});

test('notification catalogue contains core business and operational events with safe deep links', () => {
  const expected = [
    'sale.completed', 'sale.payment.received', 'customer.credit.created', 'customer.payment.overdue',
    'sale.return.recorded', 'delivery.dispatch.created', 'delivery.picked_up', 'delivery.delivered',
    'delivery.failed', 'delivery.collection.reported', 'delivery.remittance.accepted',
    'import.preview.completed', 'import.applied', 'import.failed', 'export.completed', 'backup.failed',
    'restore.completed', 'recurring_invoice.generated', 'recurring_invoice.failed',
    'attachment.scan.quarantined', 'worker.queue.incident',
  ];
  for (const eventType of expected) assert.ok(Object.hasOwn(NOTIFICATION_CATALOGUE, eventType), eventType);
  assert.equal(notificationHref('sale.completed', 'bad<script>'), '/sales');
  assert.equal(notificationHref('sale.completed', '123e4567-e89b-12d3-a456-426614174000'), '/sales/123e4567-e89b-12d3-a456-426614174000');
});

test('backend contracts retain idempotent source processing, no payment collection and notification isolation', async () => {
  const [worker, outbox, email, invoices, webhook] = await Promise.all([
    readFile(new URL('../src/platform/worker.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/notifications/notification-outbox.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/notifications/notification-email-worker.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/receivables/recurring-invoice-worker.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/notifications/resend-webhook.controller.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(worker, /ON CONFLICT|attempts<8/);
  assert.match(outbox, /ON CONFLICT \(tenant_id,recipient_user_id,dedupe_key\) DO NOTHING/);
  assert.match(outbox, /visible_in_app,expires_at/);
  assert.match(email, /Idempotency-Key/);
  assert.match(email, /retry_wait/);
  assert.match(invoices, /ON CONFLICT\(schedule_id,occurrence_key\)/);
  assert.match(invoices, /postRecurringInvoiceJournal/);
  assert.doesNotMatch(invoices, /stripe|paymentIntent|chargeCustomer|collectPayment/i);
  assert.match(webhook, /verifyResendWebhookSignature/);
  assert.match(webhook, /ON CONFLICT\(provider_event_id\) DO NOTHING/);
});


test('retired operations centre is not exposed while protected alert controls remain server-side', async () => {
  const [controller, router, api, evaluator, migration, appShell] = await Promise.all([
    readFile(new URL('../src/operations/operations.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../lexa-frontend/src/app/router.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../lexa-frontend/src/data/remote/apiOperations.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/operations/alert-evaluator.ts', import.meta.url), 'utf8'),
    readFile(new URL('../prisma/migrations/20261101170000_increment6_7_runtime_hardening/migration.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../lexa-frontend/src/app/layouts/AppShell.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(controller, /isWorkspaceAdministrator/);
  assert.match(controller, /cooldownSeconds/);
  assert.match(controller, /alert-rules\/:ruleKey/);
  assert.match(router, /path: 'operations', element: <Navigate to=\"\/\" replace \/>/);
  assert.doesNotMatch(router, /OperationsCentrePage/);
  assert.doesNotMatch(appShell, /Operations centre|Activity and audit logs|Integration status|Inbox and collaboration|All modules/i);
  assert.match(api, /updateRule/);
  assert.match(evaluator, /redis\.unavailable/);
  assert.match(evaluator, /import_export\.stalled/);
  assert.match(migration, /platform_alert_rules/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
});

test('automatic recurring invoices remain administrator-controlled and cancelled schedules cannot retry', async () => {
  const source = await readFile(new URL('../src/receivables/recurring-invoices.controller.ts', import.meta.url), 'utf8');
  assert.match(source, /Only an administrator can edit an automatic-issue schedule/);
  assert.match(source, /Only an administrator can retry an automatic-issue invoice occurrence/);
  assert.match(source, /cancelled or completed schedule cannot be retried/);
  assert.match(source, /Maximum occurrences must be greater than the number already generated/);
});

test('Resend raw-body capture uses the Fastify 5 plugin and only the prefixed webhook route', async () => {
  const [packageText, main, controller] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/notifications/resend-webhook.controller.ts', import.meta.url), 'utf8'),
  ]);
  const manifest = JSON.parse(packageText);
  assert.equal(manifest.dependencies['fastify-raw-body'], '^5.0.0');
  assert.equal(manifest.dependencies['@fastify/raw-body'], undefined);
  assert.match(main, /import rawBody from 'fastify-raw-body'/);
  assert.match(main, /routes:\s*\['\/api\/v1\/webhooks\/resend'\]/);
  assert.match(main, /apiBodyLimitBytes/);
  assert.match(main, /const routePath = routeOptions\.path/);
  assert.match(main, /routeOptions.bodyLimit = routePath === .*intelligence\/extract/);
  assert.match(main, /encoding:\s*['"]utf8['"]/);
  assert.doesNotMatch(main, /^\s*encoding:\s*false\s*,/m);
  assert.doesNotMatch(main, /global:\s*true/);
  assert.doesNotMatch(main, /limit:\s*1024\s*\*\s*1024/);
  assert.match(controller, /normalizeRawBody\(request\.rawBody\)/);
  assert.doesNotMatch(controller, /\(request as any\)\.rawBody/);
});
