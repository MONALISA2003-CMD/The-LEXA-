import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { serializedCostsFromOriginalSale, totalSerializedReturnCost } from '../src/commerce/serialized-sale-cost.ts';
const unit=(serialId,unitCostMinor,more={})=>({serialId,productId:'phone',variantId:'128-blue',quantityDelta:'-1',unitCostMinor,...more});
test('returns the actual original cost per physical unit when historical line costs differ',()=>{
 const costs=serializedCostsFromOriginalSale(['A','B'],'phone','128-blue',[unit('B',230000),unit('A',175000)]);
 assert.equal(costs.get('A'),175000);assert.equal(costs.get('B'),230000);
 assert.equal(totalSerializedReturnCost(costs),405000);
});
test('rejects missing, duplicate or unrelated original unit movements',()=>{
 assert.throws(()=>serializedCostsFromOriginalSale(['A','B'],'phone','128-blue',[unit('A',100)]),/missing/);
 assert.throws(()=>serializedCostsFromOriginalSale(['A'],'phone','128-blue',[unit('A',100),unit('A',100)]),/Duplicate/);
 assert.throws(()=>serializedCostsFromOriginalSale(['A'],'phone','128-blue',[unit('B',100)]),/unexpected/);
 assert.throws(()=>serializedCostsFromOriginalSale(['A','A'],'phone','128-blue',[unit('A',100)]),/distinct/);
});
test('rejects forged variant, wrong movement quantity or unverified unit cost',()=>{
 assert.throws(()=>serializedCostsFromOriginalSale(['A'],'phone','128-blue',[unit('A',20,{variantId:'256-red'})]),/variant/);
 assert.throws(()=>serializedCostsFromOriginalSale(['A'],'phone','128-blue',[unit('A',20,{quantityDelta:'1'})]),/reduced stock/);
 assert.throws(()=>serializedCostsFromOriginalSale(['A'],'phone','128-blue',[unit('A',0)]),/missing/);
 assert.throws(()=>serializedCostsFromOriginalSale(['A'],'phone','128-blue',[unit('A',1.5)]),/missing/);
});
test('returned physical-unit movement and GL must use the exact same original cost evidence',()=>{
 const source=readFileSync(new URL('../src/core/core.controller.ts',import.meta.url),'utf8');
 assert.match(source,/sourceId: saleId, type: 'sale', serialId: \{ in: returnedSerialIds \}/);
 assert.match(source,/unitCostMinor:item\.unitCosts\.get\(serialId\)/);
 assert.match(source,/totalSerializedReturnCost\(item\.unitCosts\)/);
});
