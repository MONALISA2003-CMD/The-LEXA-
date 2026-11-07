import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {subscriptionConfirmationContent} from '../src/platform-administration/subscription-confirmation-content.ts';
const get = path => readFileSync(new URL(path,import.meta.url),'utf8');

test('the active LEXA public domain owns account, invitation and recovery links',()=>{
  const blueprint=get('../../render.yaml');
  assert.match(blueprint,/key: FRONTEND_PUBLIC_URL\s+value: https:\/\/lexaaamaal\.com/);
  for(const path of [
    '../src/auth/public-registration.controller.ts',
    '../src/invitations/invitations.controller.ts',
    '../src/notifications/welcome-email.ts',
    '../src/auth/account-protection.service.ts',
    '../src/platform-administration/platform-administrator-auth.controller.ts',
  ]){
    const code=get(path);
    assert.ok(code.includes('https://lexaaamaal.com'),`${path}: missing main-domain fallback`);
    assert.ok(!code.includes('https://app.lexaaamaal.com'),`${path}: outdated account link`);
  }
});

test('subscription email opens sign-in, never a bearer-token account bypass',()=>{
  const content=subscriptionConfirmationContent({businessName:'Kampala Books',paidThrough:new Date('2026-12-08T06:00:00Z')});
  assert.equal(new URL(content.actionUrl).hostname,'lexaaamaal.com');
  assert.equal(new URL(content.actionUrl).pathname,'/sign-in');
  assert.match(content.text,/verified business email and password/);
  assert.doesNotMatch(content.actionUrl,/token=|session=/i);
});
