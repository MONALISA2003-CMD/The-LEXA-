import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifySignupChallenge} from '../src/auth/turnstile-verification.ts';
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const source = path => readFileSync(resolve(root,path),'utf8');

test('general ledger GET accounts and periods do not call initializer', () => {
  const s=source('backend/src/general-ledger/general-ledger.controller.ts');
  for (const endpoint of ['accounts','periods']) {
    const body=s.match(new RegExp(`@Get\\('${endpoint}'\\)([\\s\\S]*?)(?=\\n\\s+@(?:Get|Post|Patch|Put|Delete)\\()`));
    assert.ok(body, `Missing GET ${endpoint}`);
    assert.doesNotMatch(body[1], /initializeLedgerDefaults|ensureLedgerDefaults|INSERT INTO accounting_periods/);
  }
  assert.match(s, /@Post\('initialize'\)/);
  assert.match(s, /isWorkspaceAdministrator\(actor.role\)/);
  assert.match(s, /pg_advisory_xact_lock/);
  assert.match(s, /daterange\(existing.starts_on/);
});

test('inventory picklists compare stock-reservation text IDs as text', () => {
  const s=source('backend/src/supply-chain/supply-chain.controller.ts');
  assert.match(s,/r\.order_id=l\.id::text/);
  assert.doesNotMatch(s,/r\.order_id=l\.id\)/);
});

test('Business Tools does not render disallowed notices and uses private attachments',()=>{
  const s=source('lexa-frontend/src/modules/tools/BusinessToolsPage.tsx');
  assert.doesNotMatch(s,/Connected business services|Storage and trust boundary|LEXA helps you manage your business information here/);
  assert.match(s,/apiCollaboration\.uploadBusinessDocument/);
  const p=source('backend/src/platform/platform.controller.ts');
  assert.match(p,/recordType==='business_document'/);
  assert.match(p,/recordId!==b/);
  assert.match(p,/hasPermission\(a.role,'collaboration.write'\)/);
  assert.match(p,/hasPermission\(actor.role,'collaboration.read'\)/);
  assert.match(p,/f\.record_type==='business_document'/);
});

test('private app remains noindex while public marketing pages use clean canonical URLs',()=>{
  assert.match(source('lexa-frontend/index.html'),/noindex,nofollow/);
  const appConfig=JSON.parse(source('lexa-frontend/vercel.json'));
  const appHeaders=appConfig.headers.find(item=>item.source==='/(.*)').headers;
  assert.ok(appHeaders.some(h=>h.key==='X-Robots-Tag'&&h.value.includes('noindex')));
  const publicConfig=JSON.parse(source('lexa-frontend/marketing/vercel.json'));
  assert.equal(publicConfig.cleanUrls,true);
  const robots=source('lexa-frontend/marketing/robots.txt');
  assert.match(robots,/Sitemap: https:\/\/lexaaamaal\.com\/sitemap\.xml/);
  const sitemap=source('lexa-frontend/marketing/sitemap.xml');
  for(const [page,route] of [['index','/'],['features','/features'],['industries','/industries'],['pricing','/pricing'],['security','/security'],['help','/help']]){
    const html=source(`lexa-frontend/marketing/${page}.html`);
    assert.match(html,/<title>/);
    assert.match(html,/name="description"/);
    assert.ok(html.includes(`rel="canonical" href="https://lexaaamaal.com${route}"`), page);
    assert.ok(sitemap.includes(`<loc>https://lexaaamaal.com${route}</loc>`), route);
  }
  const legacy=source('lexa-frontend/public/lexa.html');
  assert.match(legacy,/rel="canonical" href="https:\/\/lexaaamaal\.com\/"/);
  assert.match(legacy,/LEXA is a subsidiary of AMAAL GROUP/);
});

test('public sign-up challenges require server-side Siteverify if enabled', async()=>{
  const base={enforced:true,secret:'private-test-only',allowedHosts:['lexaaamaal.com']};
  await assert.rejects(verifySignupChallenge(null,base),/TURNSTILE_TOKEN_REQUIRED/);
  await assert.rejects(verifySignupChallenge('valid-token-123',{...base,secret:''}),/TURNSTILE_CONFIGURATION_MISSING/);
  await assert.rejects(verifySignupChallenge('valid-token-123',{...base,fetchImpl:async()=>new Response(JSON.stringify({success:true,hostname:'attacker.example',action:'signup'}))}),/TURNSTILE_TOKEN_INVALID/);
  await assert.rejects(verifySignupChallenge('valid-token-123',{...base,fetchImpl:async()=>new Response(JSON.stringify({success:true,hostname:'lexaaamaal.com',action:'wrong'}))}),/TURNSTILE_TOKEN_INVALID/);
  assert.equal(await verifySignupChallenge('valid-token-123',{...base,fetchImpl:async()=>new Response(JSON.stringify({success:true,hostname:'lexaaamaal.com',action:'signup'}))}),'verified');
  assert.equal(await verifySignupChallenge(null,{...base,enforced:false}),'disabled');
});

test('public pages contain no invented review scores',()=>{
  for(const page of ['lexa','features','security','help']) {
    const html=source(`lexa-frontend/public/${page}.html`);
    assert.doesNotMatch(html,/aggregateRating|ratingValue|reviewCount/);
  }
});

test('sidebar allows pinned routes and visual group accents',()=>{
  const s=source('lexa-frontend/src/app/layouts/AppShell.tsx');
  assert.match(s,/pinnedPaths/);
  assert.match(s,/moduleSearch/);
  assert.match(s,/moduleAccentForGroup/);
});
