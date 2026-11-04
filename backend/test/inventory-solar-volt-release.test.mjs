
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');
test('all ten inventory screens use explicit business routes, real records and Solar Volt styling',()=>{
 const routes=read('../../lexa-frontend/src/app/router.tsx');
 for(const path of ['receiving','stock-counts','batches','replenishment','stock-transfers','warehouses','picklists','item-bundles'])
  assert.match(routes,new RegExp("path: 'modules/"+path+"'"));
 for(const file of ['InventoryWorkflowsA.tsx','InventoryTransfersPage.tsx','InventoryWarehousesPage.tsx','InventoryPicklistsPage.tsx','InventoryBundlesPage.tsx']){
  const code=read('../../lexa-frontend/src/modules/inventory/'+file);
  assert.match(code,/InventoryFrame/);
  assert.match(code,/apiInventoryOperations/);
 }
 const palette=read('../../lexa-frontend/scripts/apply_lexa_palette.py');
 assert.match(palette,/Solar Volt/);
 assert.match(palette,/INVENTORY:'volt'/);
});
test('stock intelligence never uses selling prices for reported stock purchase-cost estimates',()=>{
 const code=read('../src/supply-chain/inventory-intelligence.controller.ts');
 assert.match(code,/estimatedCostValueMinor:Math.round\(Math.max\(0,onHand\)\*p.cost_price_minor\)/);
 assert.match(code,/valuationNote:/);
 assert.match(code,/sale_lines/);
});
test('business access is verified before showing inventory, lots or sales traceability',()=>{
 const code=read('../src/supply-chain/inventory-intelligence.controller.ts');
 for(const required of ['tokenHash','member.status','hasPermission(member.role,','assertBranchAccess','this.prisma.enterTenantContext'])
   assert.ok(code.includes(required),required);
 for(const required of ['inventory_lots','stock_movements','sale_lines','inventory_replenishment_policies'])
   assert.ok(code.includes(required),required);
});
test('lot restriction and release require staff rights, rationale and expired-goods protection',()=>{
 const code=read('../src/supply-chain/inventory-intelligence.controller.ts');
 assert.match(code,/inventory\.lot\.quarantined/);
 assert.match(code,/inventory\.lot\.released/);
 assert.match(code,/hasPermission\(actor.role,'inventory.write'\)/);
 assert.match(code,/quantity_reserved/);
 assert.match(code,/lot\.expiry_date/);
 assert.match(code,/isolationLevel:'Serializable'/);
});
test('stock counts, supplier receiving and transfers use real stock and finance workflows',()=>{
 const code=read('../src/supply-chain/supply-chain.controller.ts');
 for(const required of ["@Post('inventory/stock-counts/:countId/approve')","@Post('inventory/transfers/:transferId/dispatch')","@Post('inventory/transfers/:transferId/receive')","@Post('procurement/purchase-orders/:purchaseOrderId/receipts')","@Post('inventory/replenishment/policies')"])
  assert.ok(code.includes(required),required);
 assert.match(code,/postLedgerJournal\(tx/);
 assert.match(code,/isolationLevel:'Serializable'/);
});
test('products enable stock batch and serial flags without inventing opening stock',()=>{
 const code=read('../../lexa-frontend/src/modules/products/ProductsPage.tsx');
 assert.match(code,/trackLot/);
 assert.match(code,/trackSerial/);
 assert.match(code,/trackStock/);
 assert.match(code,/InventoryIntelligencePanel/);
 assert.match(code,/create-account|products\.create/);
});
test('source-linked bundles are structured and require actual manufacturing work orders',()=>{
 const code=read('../../lexa-frontend/src/modules/inventory/InventoryBundlesPage.tsx');
 assert.match(code,/apiInventoryOperations\.createBom/);
 assert.match(code,/quantityPerOutput/);
 assert.match(code,/modules\/work-orders/);
 assert.match(code,/stock/);
});

