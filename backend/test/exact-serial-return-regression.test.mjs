import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {exactReturnedSerials,validateSerializedReturnDisposition,ExactSerialReturnError,orderedSaleSerialNumbers,matchPhysicalReturnScans} from '../src/commerce/exact-serial-return.ts';
const core=readFileSync(new URL('../src/core/core.controller.ts',import.meta.url),'utf8');
const client=readFileSync(new URL('../../lexa-frontend/src/data/remote/apiSalesWorkflow.ts',import.meta.url),'utf8');
const screen=readFileSync(new URL('../../lexa-frontend/src/modules/sales/SaleDetailPage.tsx',import.meta.url),'utf8');
const ids=['laptop-A','laptop-B','laptop-C'];

test('five serialized laptops: return only the exact physically scanned unit, not the first free unit',()=>{
  assert.deepEqual(exactReturnedSerials(ids,[],['laptop-C'],1),['laptop-C']);
  assert.deepEqual(exactReturnedSerials(ids,['laptop-A'],['laptop-B'],1),['laptop-B']);
  assert.throws(()=>exactReturnedSerials(ids,[],[],1),ExactSerialReturnError);
  assert.throws(()=>exactReturnedSerials(ids,[],['laptop-X'],1),/does not belong/);
  assert.throws(()=>exactReturnedSerials(ids,['laptop-B'],['laptop-B'],1),/already been returned/);
  assert.throws(()=>exactReturnedSerials(ids,[],['laptop-B','laptop-B'],2),/same physical unit/);
  assert.throws(()=>exactReturnedSerials(ids,[],['laptop-B'],2),/exactly one/);
  assert.deepEqual(exactReturnedSerials([],[],[],2),[]);
  assert.throws(()=>exactReturnedSerials([],[],['laptop-C'],1),/non-serialized/);
});

test('a physical-unit return needs inspection, never silently writes off a serialized device',()=>{
  const evidence={physicalSerialScanned:true,conditionChecked:true,notes:'Battery and keyboard checked: passed'};
  validateSerializedReturnDisposition('restock',evidence);
  validateSerializedReturnDisposition('quarantine',evidence);
  assert.throws(()=>validateSerializedReturnDisposition('scrap',evidence),/approved write-off/);
  assert.throws(()=>validateSerializedReturnDisposition('restock',null),/scan/);
  assert.throws(()=>validateSerializedReturnDisposition('restock',{...evidence,physicalSerialScanned:false}),/scan/);
  assert.throws(()=>validateSerializedReturnDisposition('restock',{...evidence,notes:'bad'}),/notes/);
});

test('REST returns choose exact IDs, lock availability, preserve identities and journal quarantined inventory',()=>{
  assert.match(core,/exactReturnedSerials\(line\.serialIds,previouslyReturnedSerials,item\.serialIds,item\.quantity\)/);
  assert.doesNotMatch(core,/availableSerials\.slice\(/);
  assert.match(core,/changed\.count !== item\.serialIds\.length/);
  assert.match(core,/item\.disposition === 'quarantine' \? 'quarantine' : 'available'/);
  assert.doesNotMatch(core,/status:item\.disposition==='quarantine'\?'quarantined':'scrapped'/);
  assert.match(core,/quantityQuarantined:\{increment:item\.quantity\}/);
  assert.match(core,/\['restock','quarantine'\]\.includes\(item\.disposition\)/);
  assert.match(core,/serialIds:line\.serialIds\?\?\[\]/);
  assert.match(core,/sourceType: 'sale_return_recorded'/);
});

test('sales REST client passes scanned IDs and the real receipt UI requires physical inspection',()=>{
  assert.match(client,/items: input\.items/);
  assert.match(screen,/resolvePhysicalReturnIds/);
  assert.match(screen,/returnScans\[line\.id\]/);
  assert.match(screen,/returnInspected\[line\.id\]/);
  assert.match(screen,/inspection:\{physicalSerialScanned:true,conditionChecked:true,notes,scannedSerialNumbers:/);
});

test('checkout preserves selected unit order instead of trusting unordered SELECT IN results',()=>{
  const fetched=[{id:'unit-b',serialNumber:'SN-B'},{id:'unit-a',serialNumber:'SN-A'}];
  assert.deepEqual(orderedSaleSerialNumbers(['unit-a','unit-b'],fetched),['SN-A','SN-B']);
  assert.throws(()=>orderedSaleSerialNumbers(['unit-a','unit-c'],fetched),/missing/);
  assert.match(core,/orderedSaleSerialNumbers\(line\.serialIds,serialRows\)/);
  // This query's Prisma projection must include both canonical identity and raw serial.
  // A serial-number-only projection passes runtime helper tests but breaks the Nest build.
  assert.match(core,/const serialRows=line\.serialIds\.length\?await tx\.inventorySerial\.findMany\(\{where:\{tenantId:workspaceId,branchId,id:\{in:line\.serialIds\}\},select:\{id:true,serialNumber:true\}\}\)/);
  assert.match(core,/serialUnitEvidence:/);
  assert.match(screen,/line\.serialUnitEvidence/);
});

test('REST server validates raw physical scans against canonical unit identity',()=>{
 const units=[{id:'laptop-A',serialNumber:'SN-A'},{id:'laptop-B',serialNumber:'SN-B'}];
 matchPhysicalReturnScans(['laptop-B','laptop-A'],['sn-b','SN-A'],units);
 assert.throws(()=>matchPhysicalReturnScans(['laptop-B'],['SN-A'],units),/does not match/);
 assert.throws(()=>matchPhysicalReturnScans(['laptop-B'],[],units),/one raw/);
 assert.throws(()=>matchPhysicalReturnScans(['laptop-Z'],['SN-B'],units),/does not match/);
 assert.match(core,/matchPhysicalReturnScans\(returnedSerialIds,item\.inspection\?\.scannedSerialNumbers,originalUnits\)/);
});
