import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => readFileSync(resolve(root, p), 'utf8');
const require = createRequire(import.meta.url);
const typescript = require('typescript');
const ui = read('lexa-frontend/src/modules/auth/AuthPage.tsx');
const controller = read('backend/src/auth/public-registration.controller.ts');
const mailer = read('backend/src/notifications/email-delivery.ts');
const email = read('backend/src/notifications/welcome-email.ts');

function loadWelcomeModule(sendTransactionalEmail = async () => {}) {
  const compiled = typescript.transpileModule(email, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 }, reportDiagnostics: true });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const exports = {};
  const module = { exports };
  const context = { module, exports, require: spec => {
    assert.equal(spec, './email-delivery');
    return { sendTransactionalEmail };
  }, process: { env: { FRONTEND_PUBLIC_URL: 'https://lexaaamaal.com' } } };
  vm.runInNewContext(compiled.outputText, context, { timeout: 1000 });
  return module.exports;
}

test('reset page preserves a single-use token during password input and hides the form when token is absent', () => {
  assert.match(ui, /const \[token\] = useState\(\(\) => new URLSearchParams\(window.location.search\)\.get\('token'\) \?\? ''\)/);
  assert.doesNotMatch(ui, /const token = new URLSearchParams\(window.location.search\)\.get\('token'\)/);
  assert.match(ui, /window\.history\.replaceState\(\{\}, document\.title, window.location.pathname\)/);
  assert.match(ui, /!complete && \(mode !== 'reset-password' \|\| Boolean\(token\)\)/);
  assert.match(ui, /await apiAuth\.resetPassword\(token, password\)/);
});

test('welcome message describes LEXA services, includes approved contacts and escapes input', () => {
  const { buildLexaWelcomeEmail } = loadWelcomeModule();
  const { text, html, actionUrl } = buildLexaWelcomeEmail({ displayName: '<script>alert(1)</script>', businessName: 'My & Company', owner: true, baseUrl: 'https://lexaaamaal.com/' });
  assert.equal(actionUrl, 'https://lexaaamaal.com/workspace');
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('My &amp; Company'));
  for (const category of ['Sales and customers', 'Products and inventory', 'Purchasing and suppliers', 'Finance and accounting', 'People and operations', 'Projects and production', 'Dashboards and reporting', 'Teamwork and administration']) {
    assert.ok(text.includes(category));
    assert.ok(html.includes(category));
  }
  assert.ok(text.includes('https://wa.me/256749064282'));
  assert.ok(text.includes('+256200912134'));
  assert.ok(html.includes('https://wa.me/256749064282'));
  assert.ok(html.includes('tel:+256200912134'));
  assert.ok(text.includes('full administrative access'));
  assert.ok(!text.includes('access to other LEXA businesses'));
});

test('invited employee welcome does not promise tenant owner privileges', () => {
  const { buildLexaWelcomeEmail } = loadWelcomeModule();
  const { text } = buildLexaWelcomeEmail({ displayName: 'New employee', businessName: 'Shop', owner: false, baseUrl: 'https://lexaaamaal.com' });
  assert.ok(text.includes('Your business administrator controls'));
  assert.ok(!text.includes('full administrative access'));
});

test('welcome sends once after creating the new user with a provider idempotency key', async () => {
  const calls = [];
  const { sendLexaWelcomeEmail } = loadWelcomeModule(async input => { calls.push(input); });
  await sendLexaWelcomeEmail({ userId: '12345678-1234-4234-8234-123456789012', recipientEmail: 'example@example.test', displayName: 'Alex', businessName: 'Shop', owner: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].subject, 'Welcome to LEXA — Shop');
  assert.equal(calls[0].idempotencyKey, 'lexa-welcome-12345678-1234-4234-8234-123456789012');
  assert.equal(calls[0].actionUrl, 'https://lexaaamaal.com/workspace');
});

test('welcome delivery is tied to verified owner and accepted invited employee, not unauthenticated signup', () => {
  assert.match(controller, /@Post\('signup\/verify'\)[\s\S]*?await this\.establishSession\(userId, reply\);[\s\S]*?await sendLexaWelcomeEmail\(/);
  assert.match(controller, /businessName: created\.tenant\.name, owner: true/);
  assert.match(controller, /@Post\('invitations\/join'\)[\s\S]*?businessName: result\.businessName, owner: false/);
  assert.match(controller, /LEXA_WELCOME_EMAIL_DELIVERY_FAILED/);
  assert.match(mailer, /'Idempotency-Key': input\.idempotencyKey/);
  assert.match(mailer, /html: input\.html \?\?/);
});
