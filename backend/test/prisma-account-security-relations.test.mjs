import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schema = readFileSync(resolve(root, 'prisma/schema.prisma'), 'utf8');
function model(name) {
  const match = schema.match(new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, 'm'));
  assert.ok(match, `Expected Prisma model ${name}`);
  return match[1];
}

test('account security and privacy records belong to User rather than Tenant', () => {
  const user = model('User');
  const tenant = model('Tenant');
  const required = {
    trustedDevices: 'TrustedDevice[]',
    loginChallenges: 'LoginChallenge[]',
    accountSecurityEvents: 'AccountSecurityEvent[]',
    privacyPreference: 'UserPrivacyPreference?',
    privacyConsentEvents: 'PrivacyConsentEvent[]',
    authenticatorCredential: 'AuthenticatorCredential?',
  };
  for (const [field, type] of Object.entries(required)) {
    assert.match(user, new RegExp(`^\\s*${field}\\s+${type.replaceAll('[','\\[').replaceAll(']','\\]').replaceAll('?','\\?')}\\s*$`, 'm'), `Missing ${field} inverse on User`);
    assert.doesNotMatch(tenant, new RegExp(`^\\s*${field}\\s`, 'm'), `${field} must not be a Tenant relation`);
  }
  for (const name of ['TrustedDevice','LoginChallenge','AccountSecurityEvent','UserPrivacyPreference','PrivacyConsentEvent','AuthenticatorCredential']) {
    const body = model(name);
    assert.match(body, /^\s*userId\s+String\s+(?:@id\s+)?@map\("user_id"\)\s+@db\.Uuid/m, `${name} must use user_id`);
    assert.match(body, /^\s*user\s+User\s+@relation\(fields:\s*\[userId\],\s*references:\s*\[id\],\s*onDelete:\s*Cascade\)/m, `${name} must reference User`);
  }
});
