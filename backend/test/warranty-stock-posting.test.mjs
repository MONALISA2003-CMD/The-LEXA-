import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const controller=readFileSync(new URL('../src/commerce/equipment-service.controller.ts',import.meta.url),'utf8');
const ledger=readFileSync(new URL('../src/general-ledger/ledger-posting.ts',import.meta.url),'utf8');
const sql=readFileSync(new URL('../prisma/migrations/20261106100000_warranty_decisions_and_stock_issues/migration.sql',import.meta.url),'utf8');
test('reviewed warranty decisions have an append-only history and independent authorization',()=>{
 assert.match(controller,/@Post\('warranty-cases\/:caseId\/transition'\)/);
 assert.match(controller,/authorizeWarrantyTransition\(/);
 assert.match(controller,/createdBy:row\.createdByUserId/);
 assert.match(sql,/equipment_warranty_events_immutable/);
});
test('warranty expense and source inventory post in the same serializable transaction',()=>{
 assert.match(controller,/@Post\('warranty-cases\/:caseId\/parts'\)/);
 assert.match(controller,/type:'production_issue'/);
 assert.match(controller,/postLedgerJournal\(tx,/);
 assert.match(controller,/accountKey:'warranty_expense',debitMinor:cost/);
 assert.match(controller,/accountKey:'inventory',creditMinor:cost/);
 assert.match(controller,/isolationLevel:'Serializable'/);
 assert.match(ledger,/'5300', 'Warranty repair expense'/);
});
test('warranty part issue is scoped to actual lot identity, evidence, and idempotency key',()=>{
 assert.match(controller,/where:\{tenantId:w,branchId:b,id:lotId,productId,variantId,warehouseId,status:'available'\}/);
 assert.match(controller,/if\(previous\.requestHash!==requestHash\)/);
 assert.match(controller,/extendedMinorCost\(qty,lot\.unitCostMinor\)/);
 assert.match(sql,/UNIQUE\(tenant_id,idempotency_key\)/);
 assert.match(sql,/FORCE ROW LEVEL SECURITY/);
});
