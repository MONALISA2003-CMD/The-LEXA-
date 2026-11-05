import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const get=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');

test('legacy Commerce order and purchase endpoints reject unidentifiable variants, lots and serials',()=>{
 const code=get('../src/commerce/commerce.controller.ts');
 assert.match(code,/private async assertLegacyOrderCanTrackProducts\(/);
 assert.match(code,/product\.trackSerial \|\| product\.trackLot/);
 assert.match(code,/tx\.productVariant\.count\(/);
 // Every legacy entry must refuse rows that need exact-unit or sellable-variant evidence.
 assert.match(code,/const values = await this\.productsFor\(tx, workspaceId, body\.lines, 'sell'\);\s*await this\.assertLegacyOrderCanTrackProducts/);
 assert.match(code,/const values=await this\.productsFor\(tx,workspaceId,body\.lines,'cost'\);await this\.assertLegacyOrderCanTrackProducts/);
 assert.match(code,/if\(!product\.trackStock\) continue/);
 assert.match(code,/await this\.assertLegacyOrderCanTrackProducts\(tx,workspaceId,\[\{product\}\]\)/);
});

test('physical-unit margin report does not invent missing receipt cost or count cancelled sales',()=>{
 const code=get('../src/commerce/equipment-service.controller.ts');
 assert.match(code,/AS "unknownCostLines"/);
 assert.match(code,/sl\.unit_cost_minor IS NULL/);
 assert.match(code,/sale\.status='completed'/);
 assert.doesNotMatch(code,/COALESCE\(sl\.unit_cost_minor,0\)\*sl\.quantity/);
 const client=get('../../lexa-frontend/src/data/remote/apiEquipmentService.ts');
 assert.match(client,/grossMarginMinor:string\|null/);
});

test('a separate approver can discover pending work orders with branch-scoped read access',()=>{
 const controller=get('../src/commerce/equipment-service.controller.ts');
 const client=get('../../lexa-frontend/src/data/remote/apiEquipmentService.ts');
 const ui=get('../../lexa-frontend/src/modules/inventory/EquipmentServicePanel.tsx');
 assert.match(controller,/@Get\('upgrades'\)/);
 assert.match(controller,/await this\.actor\(req,w,b,'inventory.read'\)/);
 assert.match(controller,/where:\{tenantId:w,branchId:b,status:\{in:\['draft','approved'\]\}\}/);
 assert.match(client,/pendingUpgrades:/);
 assert.match(ui,/Upgrades awaiting approval or posting/);
});

test('upgrade workbench requires the real SKU and accepted lot and exposes quantitative sell-through',()=>{
 const code=get('../../lexa-frontend/src/modules/inventory/EquipmentServicePanel.tsx');
 assert.match(code,/Select the exact part variant/);
 assert.match(code,/Select the accepted spare-part lot/);
 assert.match(code,/partVariants\.data/);
 assert.match(code,/availablePartLots\.data/);
 assert.match(code,/Exact-unit sell-through, ageing and posted margin/);
});

test('certification CLI refuses an unevidenced 45-scenario staging submission',()=>{
 const template=new URL('../../docs/quality/electronics-v2-staging-evidence.template.json',import.meta.url).pathname;
 const gate=new URL('../scripts/certify-electronics-release.mjs',import.meta.url).pathname;
 const result=spawnSync(process.execPath,[gate,template],{encoding:'utf8',timeout:5000});
 assert.equal(result.status,2,result.stderr);
 const response=JSON.parse(result.stdout);
 assert.equal(response.status,'blocked');
 for(const id of ['E2E-001','E2E-009','E2E-025','NEG-001','NEG-020'])
  assert.ok(response.missing.some(line=>line.includes(`scenarios.${id}`)),id);
 for(const field of ['performance.searchP95Ms','qaSignoff','ownerAuthorization'])
  assert.ok(response.missing.some(line=>line.includes(field)),field);
});
