import test from 'node:test';import assert from 'node:assert/strict';
import {EQUIPMENT_SUBTYPES,subtypePolicy,validateEquipmentSpecs,validateFulfilmentTransition,requireExactSoldUnit,validateMeterReading,exactRefurbishedUnitCost,allocateLandedCost,validateFiscalClaim,canPromoteElectronics} from '../src/catalog/equipment-domain-rules.ts';

test('all reviewed subtypes resolve to one published family',async()=>{
 // Do not load Nest in this pure domain test; generated catalogue is the source of truth.
 const {ELECTRONICS_V2_CONTRACT}=await import('../src/catalog/electronics-catalogue-v2.generated.ts');
 const names=new Set(ELECTRONICS_V2_CONTRACT.families.map(f=>f.code));
 assert.ok(EQUIPMENT_SUBTYPES.length>=30);
 for(const s of EQUIPMENT_SUBTYPES)assert.ok(names.has(s.familyCode),s.code);
 assert.equal(new Set(EQUIPMENT_SUBTYPES.map(x=>x.code)).size,EQUIPMENT_SUBTYPES.length);
 assert.equal(subtypePolicy('home.fridge','refrigerator').tracking,'serial');
 assert.throws(()=>subtypePolicy('home.fridge','small_appliance'),/does not belong/);
});
test('typed printer and laptop specifications cannot be forged or substituted',()=>{
 assert.deepEqual(validateEquipmentSpecs('office.printer.laser',{printerTechnology:'laser',cartridgeFamily:'TN-441',colourCapability:'mono'},'HL-L5000D','printer'),{printerTechnology:'laser',cartridgeFamily:'TN-441',colourCapability:'mono'});
 assert.throws(()=>validateEquipmentSpecs('office.printer.laser',{printerTechnology:'inkjet',cartridgeFamily:'X',colourCapability:'mono'},'M'),/published option/);
 assert.throws(()=>validateEquipmentSpecs('home.fridge',{capacityLitres:200,doorCount:1,heightMm:1350,widthMm:500,depthMm:480},''),/manufacturer/);
 assert.throws(()=>validateEquipmentSpecs('computer.laptop.business',{processorModel:'CPU',ramCapacityGB:-8,storageCapacityGB:256},'MODEL'),/non-negative/);
});
test('serialized refurbishments preserve exact value and reject invalid amounts',()=>{
 assert.equal(exactRefurbishedUnitCost(125000,[35000,12000],8000),180000);
 assert.throws(()=>exactRefurbishedUnitCost(125000,[2.5]),/integer/);
 assert.deepEqual(allocateLandedCost(7,[1,1,1]),[3,2,2]);
 assert.deepEqual(allocateLandedCost(1,[100,1,1]),[1,0,0]);
});
test('delivery and return rules never make a sold unit available',()=>{
 validateFulfilmentTransition('reserved','picked');validateFulfilmentTransition('picked','dispatched');validateFulfilmentTransition('dispatched','delivered');
 assert.throws(()=>validateFulfilmentTransition('delivered','reserved'),/Cannot move/);
 assert.throws(()=>validateFulfilmentTransition('dispatched','reserved'),/Cannot move/);
 requireExactSoldUnit(['unit-a'],'unit-a');assert.throws(()=>requireExactSoldUnit(['unit-a'],'unit-b'),/does not belong/);
});
test('copier service meter requires monotonic exact readings',()=>{
 validateMeterReading({total:1000,colour:20},{total:1100,colour:25});
 assert.throws(()=>validateMeterReading({total:1000,colour:20},{total:999,colour:25}),/decrease/);
 assert.throws(()=>validateMeterReading(null,{total:10,colour:15}),/Colour/);
});
test('fiscal and rollout claims fail closed without independently verified evidence',()=>{
 assert.throws(()=>validateFiscalClaim('confirmed','fake',false),/authorized provider/);
 validateFiscalClaim('pending');
 const result=canPromoteElectronics({backendBuild:true,frontendBuild:true,databaseMigrated:true,rlsVerified:true,restoreRehearsed:true,serialLedgerReconciled:true,financeReconciled:true,smokeTests:false,ownerApproved:false});
 assert.deepEqual(result.missing,['smokeTests','ownerApproved']);assert.equal(result.allowed,false);
});
