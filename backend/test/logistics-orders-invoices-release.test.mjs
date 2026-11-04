import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
test('existing account CEO context applies to invoice, sales order and delivery reads',()=>{
 for(const p of ['../src/receivables/receivables.controller.ts','../src/commerce/commerce.controller.ts','../src/commerce/delivery-workflow.controller.ts']){
  const code=read(p);
  assert.match(code,/this.prisma.enterTenantContext\(workspaceId, session.userId\)/);
  assert.match(code,/membership|member/);
  assert.match(code,/assertBranchAccess/);
 }
});
test('sales orders keep accepted prices even if the catalogue price changes before dispatch',()=>{
 const code=read('../src/commerce/commerce.controller.ts');
 const part=code.slice(code.indexOf('async fulfilSalesOrder('),code.indexOf("@Get('purchase-orders')"));
 assert.match(part,/Number\(x.line.unit_price_minor\)/);
 assert.match(part,/Number\(item.line.unit_price_minor\)/);
 assert.doesNotMatch(part,/Math\.round\(item.product.sellingPriceMinor\*item.qty\)/);
 assert.match(part,/packageIds/);
 assert.match(part,/sealedPackages/);
});
test('package creation and dispatch protect quantities and source documents',()=>{
 const packages=read('../src/commerce/logistics-packages.controller.ts');
 const shipping=read('../src/commerce/commerce.controller.ts');
 assert.match(packages,/quantity_fulfilled/);
 assert.match(packages,/status IN \('packed','sealed'\)/);
 assert.match(packages,/isolationLevel:'Serializable'/);
 assert.match(packages,/commerce_package_lines/);
 assert.match(packages,/action:'logistics.package.packed'/);
 assert.match(shipping,/delivery_id=.*deliveryId/);
});
test('all new parcel tables are tenant-isolated and included in backup coverage',()=>{
 const migration=read('../prisma/migrations/20261104050000_logistics_packages/migration.sql');
 const inventory=JSON.parse(read('../backup/authoritative-inventory.json'));
 for(const table of ['commerce_packages','commerce_package_lines']){
  assert.match(migration,new RegExp('CREATE TABLE IF NOT EXISTS public\\.'+table));
  assert.match(migration,new RegExp('ALTER TABLE public\\.'+table+' FORCE ROW LEVEL SECURITY'));
  assert.ok(inventory.some(x=>x.table===table&&x.disposition==='authoritative'));
 }
 assert.match(migration,/app.tenant_id/);
 assert.match(migration,/GRANT SELECT,INSERT,UPDATE/);
});
test('the invoice seller profile is retained and printing shows the actual business',()=>{
 const ar=read('../src/receivables/receivables.controller.ts');
 const document=read('../../lexa-frontend/src/modules/operations/InvoiceDocument.tsx');
 const migration=read('../prisma/migrations/20261104060000_customer_invoice_business_identity/migration.sql');
 assert.match(ar,/sellerSnapshot/);
 assert.match(ar,/receipt_business_snapshot/);
 assert.match(migration,/seller_snapshot jsonb/);
 assert.match(document,/invoice\.sellerSnapshot/);
 assert.match(document,/invoice\.lines\.map/);
 assert.match(document,/invoice\.balanceDueMinor/);
});
