import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';

const base=resolve(import.meta.dirname,'../..');
const fe=join(base,'lexa-frontend');
const p=join(fe,'public');
const content=(relative)=>readFileSync(join(fe,relative),'utf8');
const iconInfo=(path)=>{const b=readFileSync(join(p,path));assert.equal(b.subarray(1,4).toString(),'PNG');return [b.readUInt32BE(16),b.readUInt32BE(20)];};

test('approved LX logo variants use the original symbol and wordmark, never letterform substitutes',()=>{
  const source=content('src/components/LexaLogo.tsx');
  assert.match(source,/\/lexa-master-lockup\.png/);
  assert.match(source,/\/lexa-master-wordmark\.png/);
  assert.match(source,/\/lexa-identity\/\$\{accent\}\.png/);
  assert.doesNotMatch(source,/lexa-identity-wordmark[^\n]+>LEXA</);
  for(const path of ['lexa-master-lockup.png','lexa-master-lockup-light.png','lexa-master-wordmark.png','lexa-master-wordmark-light.png','lexa-lx-symbol.png']){
    assert.ok(existsSync(join(p,path)),`Missing approved asset: ${path}`);
  }
});

test('all navigation module colours have two reproducible artwork-based icon assets',()=>{
  const keys=['navy','blue','cyan','emerald','gold','orange','coral','violet','volt','bronze','indigo','teal','sapphire','mulberry','industrial'];
  for(const k of keys){for(const suffix of ['','-on-dark']){const path=`lexa-identity/${k}${suffix}.png`;assert.ok(existsSync(join(p,path)),path);assert.deepEqual(iconInfo(path),[587,440]);}}
});

test('favicon, Apple icon and installed app icon use the LX-only artwork',()=>{
  for(const [n,dim] of [['lexa-icon-16.png',16],['lexa-icon-32.png',32],['lexa-icon-48.png',48],['apple-touch-icon.png',180],['lexa-icon-192.png',192],['lexa-icon-512.png',512]]){
    assert.deepEqual(iconInfo(n),[dim,dim]);
  }
  assert.ok(existsSync(join(p,'favicon.ico')));
  const manifest=JSON.parse(readFileSync(join(p,'site.webmanifest'),'utf8'));
  assert.equal(manifest.short_name,'LEXA');
  assert.ok(manifest.icons.some(i=>i.purpose==='maskable'&&i.sizes==='512x512'));
  assert.match(content('index.html'),/\/lexa-icon-32\.png/);
  assert.match(content('index.html'),/\/site\.webmanifest/);
});

test('authentication, onboarding and public pages do not reference the retired logo',()=>{
  const pages=['src/modules/auth/AuthPage.tsx','src/modules/auth/SignupPage.tsx','src/modules/auth/VerifyEmailPage.tsx','src/modules/auth/AcceptInvitationPage.tsx','src/modules/onboarding/OnboardingPage.tsx'];
  for(const path of pages){const s=content(path);assert.match(s,/\/lexa-master-lockup(?:-light)?\.png/);assert.doesNotMatch(s,/\/lexa-logo\.png/);}
  for(const path of ['lexa.html','help.html','features.html','security.html']){
    const s=readFileSync(join(p,path),'utf8');assert.match(s,/\/lexa-master-lockup-light\.png/);assert.match(s,/\/lexa-icon-32\.png/);assert.match(s,/\/lexa-social-card\.png/);
  }
});

test('sidebar, loading and receipt marks use the official image silhouette',()=>{
  assert.match(content('src/app/layouts/AppShell.tsx'),/<LexaLogo accent=\{moduleAccentForPath\(location\.pathname\)\} onDark/);
  assert.match(content('src/app/layouts/AppShell.tsx'),/<LexaLogo compact variant="master"/);
  assert.doesNotMatch(content('src/app/layouts/AppShell.tsx'),/<div className="brand-mark">L<\/div>/);
  assert.match(content('src/modules/sales/SaleDetailPage.tsx'),/\/lexa-lx-symbol\.png/);
});
