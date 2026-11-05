import {describe,it,expect} from 'vitest';
import {resolvePhysicalReturnIds} from './serialReturn';
const evidence=[{unitId:'unit2',serialNumber:'SN-B'},{unitId:'unit1',serialNumber:'SN-A'}];
describe('exact sold-unit returns from verified physical identity',()=>{
 it('uses explicit unit ID/serial pairs independent of any database or receipt ordering',()=>{
  expect(resolvePhysicalReturnIds(['unit1','unit2'],evidence,'SN-B')).toEqual(['unit2']);
  expect(resolvePhysicalReturnIds(['unit1','unit2'],evidence,'sn-a\nSN-B')).toEqual(['unit1','unit2']);
 });
 it('blocks wrong serial, repeated or previously returned units, incomplete or ambiguous identity',()=>{
  expect(()=>resolvePhysicalReturnIds(['unit1','unit2'],evidence,'UNKNOWN')).toThrow(/does not match/);
  expect(()=>resolvePhysicalReturnIds(['unit1','unit2'],evidence,'SN-A\nSN-A')).toThrow(/twice/);
  expect(()=>resolvePhysicalReturnIds(['unit1','unit2'],evidence,'SN-B',['unit2'])).toThrow(/already been returned/);
  expect(()=>resolvePhysicalReturnIds(['unit1'],[], 'SN-A')).toThrow(/incomplete/);
  expect(()=>resolvePhysicalReturnIds(['unit1','unit2'],[{unitId:'unit1',serialNumber:'SN-A'},{unitId:'unit2',serialNumber:'SN-A'}],'SN-A')).toThrow(/ambiguous/);
  expect(()=>resolvePhysicalReturnIds(['unit1','unit2'],[{unitId:'unit2',serialNumber:'SN-A'},{unitId:'unit2',serialNumber:'SN-B'}],'SN-A')).toThrow(/ambiguous/);
 });
});
