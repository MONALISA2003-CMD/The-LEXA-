import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src=(path)=>readFile(new URL(path,import.meta.url),'utf8');
test('owner-only business assistant cannot be granted to accountant', async()=>{
  const policy=await src('../src/authorization/role-policy.ts');
  const controller=await src('../src/workstream8/workstream8.controller.ts');
  assert.match(controller,/permission === 'intelligence.read' \|\| permission === 'intelligence.run'/);
  assert.match(controller,/isOwnerRole\(membership.role\)/);
  assert.doesNotMatch(policy,/accountant: \['intelligence.read', 'intelligence.run'/);
});
test('owner actions require review and use authoritative business APIs', async()=>{
  const page=await src('../../lexa-frontend/src/modules/intelligence/OwnerActions.tsx');
  assert.match(page,/Confirm before saving/);
  assert.match(page,/if\(!enabled\|\|!review\|\|!valid\|\|saving\)return/);
  assert.match(page,/apiProcurement.createRequest/);
  assert.match(page,/apiWorkstream6.createProjectTask/);
  assert.doesNotMatch(page,/postJournal|approvePayment|recordPayrollPayment/);
});
test('no backend service diagnostics in business settings', async()=>{
  const settings=await src('../../lexa-frontend/src/modules/settings/SettingsPage.tsx');
  for(const phrase of ['LEXA availability','Background jobs, encrypted backups','Data & privacy','<SecurityPanel'])assert.equal(settings.includes(phrase),false,phrase);
  assert.match(settings,/to="\/settings\/security"/); // User-facing security settings are allowed; internal diagnostics are not.
});
test('consistent delivery summary and AMAAL GROUP footers', async()=>{
  const delivery=await src('../../lexa-frontend/src/modules/operations/commerce-workflows.css');
  const shell=await src('../../lexa-frontend/src/app/layouts/AppShell.tsx');
  const publicPage=await src('../../lexa-frontend/public/lexa.html');
  assert.match(delivery,/\.commerce-summary-card>strong/);
  assert.match(shell,/LEXA is a subsidiary of AMAAL GROUP/);
  assert.match(publicPage,/LEXA is a subsidiary of AMAAL GROUP/);
});
test('internal assistant diagnostics and provider count are not in customer page',async()=>{
  const page=await src('../../lexa-frontend/src/modules/intelligence/IntelligencePage.tsx');
  assert.doesNotMatch(page,/4 configured provider routes|Verified business snapshot|Works even when external AI models are offline|New chat/);
});
