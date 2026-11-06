import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {lexaTurnstileHostnames,verifyTurnstileChallenge} from '../src/auth/turnstile-verification.ts';

const source=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');

test('production turnstile host remains accepted when optional configuration is unset',()=>{
  assert.deepEqual(lexaTurnstileHostnames(undefined),['lexaaamaal.com','www.lexaaamaal.com']);
  assert.deepEqual(lexaTurnstileHostnames(''),['lexaaamaal.com','www.lexaaamaal.com']);
  assert.ok(lexaTurnstileHostnames('lexareview.vercel.app, lexaaamaal.com').includes('lexareview.vercel.app'));
  assert.ok(!lexaTurnstileHostnames('https://attacker.example').includes('https://attacker.example'));
});

test('valid login challenges still require successful action and host verification',async()=>{
  const fetchImpl=async()=>new Response(JSON.stringify({success:true,hostname:'lexaaamaal.com',action:'login'}),{status:200});
  const options={secret:'test-only-siteverify-secret',enforced:true,allowedHosts:lexaTurnstileHostnames(undefined),action:'login',fetchImpl};
  assert.equal(await verifyTurnstileChallenge('sufficiently-long-test-token',{...options}),'verified');
  await assert.rejects(verifyTurnstileChallenge('sufficiently-long-test-token',{...options,action:'signup'}),/TURNSTILE_TOKEN_INVALID/);
  await assert.rejects(verifyTurnstileChallenge('sufficiently-long-test-token',{...options,allowedHosts:['attacker.example']}),/TURNSTILE_TOKEN_INVALID/);
  await assert.rejects(verifyTurnstileChallenge('',{...options}),/TURNSTILE_TOKEN_REQUIRED/);
});

test('business and administrator logins use the shared hostname validator and preserve fail-closed handling',()=>{
  const customer=source('../src/core/core.controller.ts');
  const admin=source('../src/platform-administration/platform-administrator-auth.controller.ts');
  assert.match(customer,/allowedHosts:lexaTurnstileHostnames\(process\.env\.TURNSTILE_ALLOWED_HOSTNAMES\)/);
  assert.match(admin,/allowedHosts:lexaTurnstileHostnames\(process\.env\.TURNSTILE_ALLOWED_HOSTNAMES\)/);
  assert.match(admin,/HUMAN_VERIFICATION_UNAVAILABLE/);
  assert.match(admin,/HUMAN_VERIFICATION_REQUIRED/);
  assert.match(customer,/HUMAN_VERIFICATION_UNAVAILABLE/);
  assert.match(customer,/HUMAN_VERIFICATION_REQUIRED/);
  assert.doesNotMatch(customer,/TURNSTILE_ENFORCE_LOGIN.*false/);
});

test('developer account is retained while it still owns business workspaces',()=>{
  const customer=source('../src/core/core.controller.ts');
  assert.match(customer,/remainingOwners === 0/);
  assert.match(customer,/role:\{in:\['owner','owner_administrator'\]\}/);
  assert.match(customer,/ADMIN_ONLY_IDENTITY/);
  // The submitted identifier may be a username; check the resolved email.
  assert.match(customer,/user\.email\.toLowerCase\(\)/);
  assert.doesNotMatch(customer,/DELETE FROM (?:users|tenants|memberships)/i);
});

test('trusted first-party production API routing is defined alongside guarded CORS',()=>{
  const client=source('../../lexa-frontend/src/data/remote/apiClient.ts');
  const main=source('../src/main.ts');
  assert.match(client,/export function resolveLexaApiBase/);
  assert.match(client,/return '\/api\/v1'/);
  assert.match(main,/https:\/\/lexaaamaal\.com/);
  assert.doesNotMatch(main,/origin:\s*true/);
});

test('failed administrator and business sign-ins expose safe request references, never credentials',()=>{
  const business=source('../../lexa-frontend/src/modules/auth/AuthPage.tsx');
  const admin=source('../../lexa-frontend/src/modules/platform-admin/PlatformAdministratorLoginPage.tsx');
  for(const page of [business,admin]){
    assert.match(page,/Support reference:/);
    assert.match(page,/requestId/);
    assert.doesNotMatch(page,/Support reference:.*\{password\}/);
  }
});
