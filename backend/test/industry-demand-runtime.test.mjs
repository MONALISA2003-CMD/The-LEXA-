import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewDemandAggregates} from '../src/supply-chain/industry-demand-client.ts';

const workspaceId='11111111-1111-4111-8111-111111111111';
const branchId='22222222-2222-4222-8222-222222222222';
const productId='33333333-3333-4333-8333-333333333333';

test('Python demand worker returns bounded read-only evidence with no purchase action', async()=>{
 const response=await reviewDemandAggregates({schemaVersion:1,tenantId:workspaceId,branchId,asOf:'2026-11-05',items:[{
   productId,variantId:null,dailyDemand:Array.from({length:30},(_,i)=>i%7===0?'3':'1'),
   availableToPromise:'8',confirmedOnOrder:'0',leadTimeDays:7,safetyStock:'2',supplierPackMultiple:'1',
   currency:'UGX',sourceVersion:'test-only-aggregates',
 }]});
 assert.equal(response.tenantId,workspaceId);
 assert.equal(response.branchId,branchId);
 assert.equal(response.scope,'read_only_recommendations');
 assert.equal(response.requiresHumanApproval,true);
 assert.equal(response.items.length,1);
 assert.equal(response.items[0].productId,productId);
 assert.equal(response.items[0].requiresApproval,true);
 assert.equal(response.items[0].postingAllowed,false);
 assert.match(response.items[0].modelVersion,/lexa-demand-rules-/);
});

test('Python demand process rejects malformed or unscoped aggregates',async()=>{
 await assert.rejects(reviewDemandAggregates({schemaVersion:1,tenantId:'not-a-uuid',branchId,asOf:'2026-11-05',items:[]}));
 await assert.rejects(reviewDemandAggregates({schemaVersion:1,tenantId:workspaceId,branchId,asOf:'2026-11-05',items:[],unapprovedField:'never'}));
 await assert.rejects(reviewDemandAggregates({schemaVersion:1,tenantId:workspaceId,branchId,asOf:'2026-11-05',items:Array(3000).fill({})}));
});
