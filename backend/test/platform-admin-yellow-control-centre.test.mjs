import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const login = source('../../lexa-frontend/src/modules/platform-admin/PlatformAdministratorLoginPage.tsx');
const consolePage = source('../../lexa-frontend/src/modules/platform-admin/PlatformAdministrationPage.tsx');
const css = source('../../lexa-frontend/src/modules/platform-admin/platform-administration.css');
const router = source('../../lexa-frontend/src/app/router.tsx');
const backend = source('../src/platform-administration/platform-administration.controller.ts');

test('yellow administrator login has independent credentials, an emailed founder setup and no customer session dependency', () => {
  assert.match(router, /path: '\/platform-admin\/login'/);
  assert.match(router, /path: '\/platform-admin\/setup'/);
  assert.match(login, /auth.login\(/);
  assert.match(login, /auth.requestFounder\(/);
  assert.match(login, /<TurnstileWidget.*action="login"/);
  assert.doesNotMatch(login, /apiAuth\.signIn\(|apiAuth\.verifySignIn\(|localStorage|sessionStorage|bootstrapSecret|demoPassword|ADMIN_PASSWORD/);
});

test('yellow admin design is isolated from the client workspace, with accessible fallbacks', () => {
  assert.match(css, /LEXA YELLOW \/ CHAMPAGNE GLASS PLATFORM DESIGN/);
  assert.match(css, /\.lexa-admin-login-card/);
  assert.match(css, /backdrop-filter:blur\(26px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /@supports not \(\(backdrop-filter:/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.lexa-platform-app \.lexa-platform-sidebar/);
  assert.doesNotMatch(css, /(?:^|\n)\.lexa-platform-page\s*\{[^}]*#ffd/);
});

test('interactive dashboard uses server data, safe reporting controls and no simulated health scores', () => {
  for (const text of ['api.overview()', 'api.payments(', 'api.revenue()', 'api.health()', 'api.incidents()', 'api.audit()', 'setRevenueDays(', 'setRevenueMode(', 'exportRevenueCsv(', 'Confirm payment & activate']) {
    assert.ok(consolePage.includes(text), `Missing dashboard behavior: ${text}`);
  }
  assert.doesNotMatch(consolePage, /Control-centre health score|severityScore.*100/);
  assert.match(consolePage, /not_connected/);
  assert.match(consolePage, /Number\.isFinite\(timestamp\)/);
});

test('operations-only and support-only platform roles cannot access financial overview', () => {
  assert.match(backend, /async overview\(@Req\(\) request: FastifyRequest\) \{\s*const actor = await this\.admin\(request,\['super_admin','billing_manager','auditor'\]\)/);
  assert.match(consolePage, /first = sections\.find\(s => s\.roles\.some/);
  assert.match(consolePage, /roles:\['super_admin','billing_manager','auditor'\]/);
});
