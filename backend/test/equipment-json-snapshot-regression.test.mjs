import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {asEquipmentConfigurationSnapshot,InvalidEquipmentConfigurationSnapshot} from '../src/catalog/equipment-json-snapshot.ts';

test('Prisma JSON snapshots preserve exact original and upgraded specifications, including nested nulls',()=>{
 const original={ramGB:16,storageGB:256,firmware:{version:null,verified:false},notes:['SSD original',null]};
 const snapshot=asEquipmentConfigurationSnapshot(original,'Original specifications');
 assert.strictEqual(snapshot,original,'Must preserve the original immutable history rather than silently rebuilding it');
 assert.deepEqual(snapshot,original);
});

test('Prisma JSON boundary fails closed for top-level nulls, arrays, and primitive records',()=>{
 for(const bad of [null,[],['parts'],42,'unverified',true]){
  assert.throws(()=>asEquipmentConfigurationSnapshot(bad,'Original specifications'),e=>
   e instanceof InvalidEquipmentConfigurationSnapshot&&/reinspect/i.test(e.message));
 }
});

test('equipment history records both independently validated JSON objects, never raw JsonValue or any-cast',()=>{
 const s=readFileSync(new URL('../src/commerce/equipment-service.controller.ts',import.meta.url),'utf8');
 assert.match(s,/previousSpecs:asEquipmentConfigurationSnapshot\(work\.beforeSpecs/);
 assert.match(s,/configuredSpecs:asEquipmentConfigurationSnapshot\(work\.afterSpecs/);
 assert.doesNotMatch(s,/previousSpecs:work\.beforeSpecs|configuredSpecs:work\.afterSpecs|previousSpecs:work\.beforeSpecs as any/);
});
