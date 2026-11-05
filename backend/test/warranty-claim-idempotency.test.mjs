import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const controller=readFileSync(new URL('../src/commerce/equipment-service.controller.ts',import.meta.url),'utf8');

test('opening a claim serializes on the sold device and reuses an identical active claim',()=>{
 const start=controller.indexOf("@Post('warranty-cases')");
 const end=controller.indexOf("@Get('warranty-cases')",start);
 assert.ok(start>0&&end>start);
 const code=controller.slice(start,end);
 assert.match(code,/SELECT id FROM inventory_serials WHERE tenant_id=\$\{w\}::uuid AND branch_id=\$\{b\}::uuid AND id=\$\{serialId\}::uuid FOR UPDATE/);
 assert.match(code,/status:\{in:\['opened','inspecting','repair_approved','repairing','rejected'\]\}/);
 assert.match(code,/if\(active\.saleLineId===saleLineId&&active\.issueSummary===issue\)return active/);
 assert.match(code,/isolationLevel:'Serializable'/);
});
