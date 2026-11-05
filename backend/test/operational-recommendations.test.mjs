import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildOperationalWork } from '../src/operations/operational-recommendations.ts';
const now = new Date().toISOString();
const item = (code, area='inventory', count=1) => ({code, area, count, source:'verified_source', asOf:now});
test('no fabricated task when no evidence', () => assert.deepEqual(buildOperationalWork([item('low_stock','inventory',0)]), []));
test('priority order gives overdue receivables and expiry a first review', () => {
 const result=buildOperationalWork([item('purchase_review','purchasing',4),item('overdue_receivable','finance',2),item('low_stock')]);
 assert.equal(result[0].code,'overdue_receivable');
 assert.equal(result[0].priority,'urgent');
 assert.equal(result[2].code,'purchase_review');
});
test('recommendation is read only and preserves source evidence', () => {
 const result=buildOperationalWork([item('late_purchase','purchasing',3)])[0];
 assert.equal(result.count,3); assert.equal(result.source,'verified_source');
 assert.equal(result.href,'/modules/purchases'); assert.equal(result.recommendationType,'deterministic_rule');
 assert.match(result.detail,/3 purchase orders/);
});
test('invalid/negative/unsafe counts cannot produce work', () => {
 assert.deepEqual(buildOperationalWork([item('low_stock','inventory',-1),item('low_stock','inventory',Number.MAX_SAFE_INTEGER+1),item('low_stock','inventory',NaN)]),[]);
});
test('operational advice controller is protected by session, membership, branch and domain permissions', () => {
 const source=readFileSync(new URL('../src/operations/operational-advice.controller.ts',import.meta.url),'utf8');
 for(const t of ['tokenHash',"member.status !== 'ACTIVE'",'assertBranchAccess',"'inventory.read'","'finance.read'","'procurement.read'",'tenant_id=${workspaceId}', 'branch_id=${branchId}', 'buildOperationalWork'])assert.ok(source.includes(t),t);
 assert.ok(!source.includes('@Post('));
});
