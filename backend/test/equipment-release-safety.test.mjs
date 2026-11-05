import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {permissionForRequest,hasPermission} from '../src/authorization/role-policy.ts';
import {canPromoteElectronics,exactRefurbishedUnitCost,requireExactSoldUnit,validateFulfilmentTransition,validateFiscalClaim} from '../src/catalog/equipment-domain-rules.ts';

const source=(file)=>readFileSync(new URL(file,import.meta.url),'utf8');
const root='/workspaces/00000000-0000-4000-8000-000000000001/branches/00000000-0000-4000-8000-000000000002/equipment';

test('warehouse and cashier cannot approve physical-unit configuration changes',()=>{
 const route=permissionForRequest('POST',`${root}/upgrades/00000000-0000-4000-8000-000000000003/apply`);
 assert.equal(route,'inventory.approve');
 for(const role of ['cashier','warehouse_operator','technician','auditor','read_only','unrecognized'])assert.equal(hasPermission(role,route),false,role);
 for(const role of ['owner','branch_manager'])assert.equal(hasPermission(role,route),true,role);
});

test('delivery and service endpoints have explicit read/write permissions, not generic workspace admin',()=>{
 assert.equal(permissionForRequest('POST',`${root}/fulfilments`),'fulfilment.write');
 assert.equal(permissionForRequest('POST',`${root}/customer-repairs`),'support.write');
 assert.equal(permissionForRequest('GET',`${root}/reports/reconciliation`),'finance.read');
 assert.equal(permissionForRequest('GET',`${root}/serials/00000000-0000-4000-8000-000000000003/service-history`),'inventory.read');
 assert.equal(hasPermission('cashier','finance.read'),false);
 assert.equal(hasPermission('technician','inventory.read'),true);
});

test('full financial gate is denied without each independent certification evidence',()=>{
 const all={backendBuild:true,frontendBuild:true,databaseMigrated:true,rlsVerified:true,restoreRehearsed:true,serialLedgerReconciled:true,financeReconciled:true,smokeTests:true,ownerApproved:true};
 assert.deepEqual(canPromoteElectronics(all),{allowed:true,missing:[]});
 for(const key of Object.keys(all)){
  const failing={...all,[key]:false};
  assert.deepEqual(canPromoteElectronics(failing),{allowed:false,missing:[key]});
 }
 assert.throws(()=>validateFiscalClaim('confirmed','unverified receipt',false),/authorized provider/);
});

test('five laptop unit costs remain separate after one physical SSD upgrade',()=>{
 const unitCosts=Array.from({length:5},()=>470000);
 unitCosts[2]=exactRefurbishedUnitCost(unitCosts[2],[85000],20000);
 assert.deepEqual(unitCosts,[470000,470000,575000,470000,470000]);
 assert.equal(unitCosts.reduce((a,b)=>a+b,0),2455000);
 requireExactSoldUnit(['unit-3'],'unit-3');
 assert.throws(()=>requireExactSoldUnit(['unit-3'],'unit-4'),/original sale line/);
 assert.throws(()=>validateFulfilmentTransition('delivered','reserved'),/Cannot move/);
});

test('equipment migration preserves existing IDs and locks new cost/delivery evidence under RLS',()=>{
 const migration=source('../prisma/migrations/20261105220000_equipment_service_and_appliance_custody/migration.sql');
 const inventory=JSON.parse(source('../backup/authoritative-inventory.json'));
 assert.doesNotMatch(migration,/\b(?:TRUNCATE|DROP TABLE|DELETE FROM|UPDATE public\.inventory_serials)\b/i);
 for(const table of ['equipment_upgrade_work_orders','equipment_upgrade_parts','equipment_unit_configuration_events','equipment_unit_fulfilments','equipment_fulfilment_events','equipment_installed_systems','equipment_installed_components','equipment_warranty_cases','equipment_customer_repair_custody','equipment_copier_meter_events']){
  assert.match(migration,new RegExp(`CREATE TABLE public\\.${table}\\s*\\(`));
  assert.match(migration,new RegExp(`'${table}'`));
  assert.ok(JSON.stringify(inventory).includes(table),`backup inventory missing ${table}`);
 }
 assert.match(migration,/FORCE ROW LEVEL SECURITY/);
 assert.match(migration,/lexa_electronics_immutable_event/);
});

test('upgrade part issue is one transaction with deterministic product locks and no saleable repair stock',()=>{
 const code=source('../src/commerce/equipment-service.controller.ts');
 assert.match(code,/for\(const productId of productIds\)await tx\.\$queryRaw/);
 assert.match(code,/isolationLevel:'Serializable'/);
 assert.match(code,/sourceType:'equipment_upgrade'/);
 assert.match(code,/resultingCostMinor/);
 assert.match(code,/return this\.prisma\.\$transaction\(async tx=>\{\s*const row=await tx\.equipmentCustomerRepairCustody\.create/);
 assert.doesNotMatch(code,/equipmentCustomerRepairCustody\.create\([^]*?tx\.inventorySerial\.create/);
});
