import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyTurnstileChallenge } from '../src/auth/turnstile-verification.ts';
const source=(path)=>readFile(new URL(path,import.meta.url),'utf8');
const args={secret:'private-test-secret',enforced:true,allowedHosts:['lexaaamaal.com'],action:'login'};
const fake=(result)=>async()=>new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json'}});
test('Cloudflare verification rejects token reuse, wrong hostname, wrong action, service errors and missing token',async()=>{
  assert.equal(await verifyTurnstileChallenge('unimportant',{...args,enforced:false}),'disabled');
  await assert.rejects(verifyTurnstileChallenge('insufficient-length',{...args,secret:''}),/CONFIGURATION_MISSING/);
  await assert.rejects(verifyTurnstileChallenge('',args),/TOKEN_REQUIRED/);
  assert.equal(await verifyTurnstileChallenge('long-test-challenge-token',{...args,fetchImpl:fake({success:true,hostname:'lexaaamaal.com',action:'login'})}),'verified');
  await assert.rejects(verifyTurnstileChallenge('long-test-challenge-token',{...args,fetchImpl:fake({success:true,hostname:'lookalike.example',action:'login'})}),/TOKEN_INVALID/);
  await assert.rejects(verifyTurnstileChallenge('long-test-challenge-token',{...args,fetchImpl:fake({success:true,hostname:'lexaaamaal.com',action:'signup'})}),/TOKEN_INVALID/);
  await assert.rejects(verifyTurnstileChallenge('long-test-challenge-token',{...args,fetchImpl:fake({success:false,hostname:'lexaaamaal.com',action:'login'})}),/TOKEN_INVALID/);
  await assert.rejects(verifyTurnstileChallenge('long-test-challenge-token',{...args,fetchImpl:async()=>{throw new Error('network')}}),/VERIFICATION_UNAVAILABLE/);
});
test('sign-in uses server-side Turnstile, OTP and browser credentials, never a client-declared trusted state',async()=>{
  const core=await source('../src/core/core.controller.ts');
  const protection=await source('../src/auth/account-protection.service.ts');
  assert.match(core,/await verifyTurnstileChallenge\(body\.turnstileToken/);
  assert.match(core,/await this\.accountProtection\.limitLogin\(email,null\)/);
  assert.match(core,/await this\.accountProtection\.beginSignIn\(user,request,reply\)/);
  assert.match(protection,/where:\{userId,credentialHash:tokenDigest\(raw\),revokedAt:null,expiresAt:\{gt:new Date\(\)\}\}/);
  assert.match(protection,/SELECT id,method,code_hash,attempts,expires_at,consumed_at FROM login_challenges/);
  assert.match(protection,/FOR UPDATE/);
  assert.match(protection,/sessionToken=secretToken\(\)/);
  assert.match(protection,/SameSite=None/);
  assert.doesNotMatch(protection,/sessionStorage|localStorage|fingerprint/);
});
test('privacy is denied by default, history is append-only, RLS is forced for all security tables',async()=>{
  const sql=await source('../prisma/migrations/20261107010000_account_security_privacy/migration.sql');
  const controller=await source('../src/auth/account-security.controller.ts');
  assert.match(sql,/optional_analytics boolean NOT NULL DEFAULT false/);
  assert.match(sql,/ALTER TABLE public\.%I FORCE ROW LEVEL SECURITY/);
  assert.match(sql,/CREATE POLICY self_owned/);
  assert.match(sql,/CREATE TRIGGER sessions_device_owner_guard/);
  assert.match(sql,/REVOKE UPDATE,DELETE ON account_security_events,privacy_consent_events/);
  assert.match(sql,/CREATE TRIGGER privacy_consent_events_immutable/);
  assert.match(controller,/@Put\('privacy\/preferences'\) @UseGuards\(CsrfGuard\)/);
  assert.match(controller,/@Post\('login\/verify'\) @UseGuards\(CsrfGuard\)/);
});
test('public legal policies and account management exist at distinct routes with a consent notice',async()=>{
  const router=await source('../../lexa-frontend/src/app/router.tsx');
  const providers=await source('../../lexa-frontend/src/app/providers.tsx');
  const notice=await source('../../lexa-frontend/src/modules/account/CookieNotice.tsx');
  const page=await source('../../lexa-frontend/src/modules/account/AccountSecurityPage.tsx');
  for(const route of ['/legal/cookies','/legal/privacy','settings/security','settings/privacy'])assert.ok(router.includes(route),`Missing route ${route}`);
  assert.match(providers,/<CookieNotice\s*\/>/);
  assert.doesNotMatch(notice,/useLocation|<Link/); // Notice is mounted above RouterProvider.
  assert.match(notice,/Essential only/);
  assert.match(page,/Confirm authenticator/);
  assert.match(page,/End other sessions/);
  assert.match(page,/Store these recovery codes/);
});
