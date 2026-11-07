import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => readFileSync(resolve(root, p), 'utf8');
const controller = read('backend/src/auth/public-registration.controller.ts');
const migration = read('backend/prisma/migrations/20261103160000_public_signup_verification/migration.sql');
const authUi = read('lexa-frontend/src/modules/auth/AuthPage.tsx');
const routes = read('lexa-frontend/src/app/router.tsx');
const inviteUi = read('lexa-frontend/src/modules/auth/AcceptInvitationPage.tsx');
const config = read('render.yaml');

test('public signup cannot bypass email possession: one-use hash with expiration', () => {
  assert.match(controller, /@Post\('signup'\)/);
  assert.match(controller, /@Post\('signup\/verify'\)/);
  assert.match(controller, /randomBytes\(32\)\.toString\('base64url'\)/);
  assert.match(controller, /const tokenHash = sha\(rawToken\)/);
  assert.match(controller, /token_hash=\$\{tokenHash\} AND expires_at>now\(\) FOR UPDATE/);
  assert.match(controller, /tx\.signupVerification\.delete\(/);
  assert.match(controller, /SIGNUP_EMAIL_NOT_CONFIGURED/);
  assert.match(controller, /sendTransactionalEmail\(/);
});

test('verification transaction creates a separate tenant, owner membership, and branch', () => {
  assert.match(controller, /@Post\('signup\/verify'\)[\s\S]*isolationLevel: 'Serializable'/);
  for (const method of ['tx.user.create', 'tx.tenant.create', 'tx.membership.create', 'tx.branch.create']) assert.ok(controller.includes(method), method);
  assert.match(controller, /role: 'owner', status: 'ACTIVE'/);
  assert.match(controller, /set_config\('app\.user_id'/);
  assert.match(controller, /set_config\('app\.tenant_id'/);
});

test('pending email tokens are protected by row-level security and least privilege', () => {
  assert.match(migration, /ALTER TABLE signup_verifications FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /current_setting\('app\.signup_email',true\)/);
  assert.match(migration, /current_setting\('app\.signup_token_hash',true\)/);
  assert.match(migration, /GRANT SELECT,INSERT,UPDATE,DELETE ON signup_verifications TO lexa_app_runtime/);
});

test('invitation acceptance is single-use, scoped, and cannot replace active membership', () => {
  assert.match(controller, /@Post\('invitations\/join'\)/);
  assert.match(controller, /@Post\('invitations\/accept'\)/);
  assert.match(controller, /token_hash=\$\{invitationHash\} AND status='PENDING' AND expires_at>now\(\) FOR UPDATE/);
  assert.match(controller, /invitation\.email\.toLowerCase\(\) !== session\.user\.email\.toLowerCase\(\)/);
  assert.match(controller, /existingMembership\?\.status === 'ACTIVE'/);
  assert.match(controller, /role: invitation\.role/);
});

test('public signup and employee invite UI are routed; bootstrap remains separate', () => {
  assert.match(authUi, /to="\/create-account"/);
  assert.match(routes, /path: '\/create-account'/);
  assert.match(routes, /path: '\/verify-email'/);
  assert.match(routes, /path: '\/accept-invitation'/);
  assert.match(routes, /path: '\/first-admin-setup'/);
  assert.match(inviteUi, /previewInvitation/);
  assert.match(inviteUi, /acceptExistingInvitation/);
  assert.match(inviteUi, /joinInvitation/);
  assert.match(config, /FRONTEND_PUBLIC_URL\n        value: https:\/\/lexaaamaal\.com/);
});
