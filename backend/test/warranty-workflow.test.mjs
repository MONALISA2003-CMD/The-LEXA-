import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeWarrantyTransition,assertWarrantyPartEligible} from '../src/commerce/warranty-workflow.ts';
const edge=(previous,next,more={})=>({previous,next,createdBy:'owner',actor:'manager',evidenceReference:'SIGNED-INSPECTION-2026',notes:'Device inspected; findings documented.',...more});
test('warranty progresses only through inspected, independently decided repairs',()=>{
 authorizeWarrantyTransition(edge('opened','inspecting'));
 authorizeWarrantyTransition(edge('inspecting','repair_approved',{coverage:'seller_warranty'}));
 authorizeWarrantyTransition(edge('repair_approved','repairing'));
 authorizeWarrantyTransition(edge('repairing','closed'));
 assertWarrantyPartEligible('repairing','goodwill');
 assertWarrantyPartEligible('repairing','seller_warranty');
});
test('direct replacement, reopened closed and unauthorized transitions are rejected',()=>{
 for(const [from,to] of [['opened','closed'],['opened','replaced'],['inspecting','repairing'],['repair_approved','closed'],['closed','opened']])
  assert.throws(()=>authorizeWarrantyTransition(edge(from,to)),/not permitted/);
});
test('coverage decision cannot be self-approved and unknown manufacturer responsibility never debits store warranty expenses',()=>{
 assert.throws(()=>authorizeWarrantyTransition(edge('inspecting','repair_approved',{coverage:'seller_warranty',actor:'owner'})),/separate/);
 assert.throws(()=>authorizeWarrantyTransition(edge('inspecting','repair_approved',{coverage:'manufacturer_warranty'})),/seller warranty/);
 assert.throws(()=>authorizeWarrantyTransition(edge('inspecting','rejected',{coverage:'goodwill'})),/covered claim/);
 authorizeWarrantyTransition(edge('inspecting','rejected',{coverage:'out_of_warranty'}));
 for(const status of ['opened','inspecting','repair_approved','rejected','closed'])assert.throws(()=>assertWarrantyPartEligible(status,'seller_warranty'),/reviewed/);
 assert.throws(()=>assertWarrantyPartEligible('repairing','manufacturer_warranty'),/reviewed/);
});
test('warranty decisions require traceable evidence and substantive notes',()=>{
 assert.throws(()=>authorizeWarrantyTransition(edge('inspecting','repair_approved',{coverage:'seller_warranty',evidenceReference:''})),/evidence/);
 assert.throws(()=>authorizeWarrantyTransition(edge('opened','inspecting',{notes:'brief'})),/notes/);
 assert.throws(()=>authorizeWarrantyTransition(edge('opened','inspecting',{coverage:'goodwill'})),/reviewer/);
});
