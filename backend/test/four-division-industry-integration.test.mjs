import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=(name)=>readFileSync(new URL(name,import.meta.url),'utf8');
const manifest=JSON.parse(source('../../scripts/industry-catalogue.v1.json'));
const presets=new Map(manifest.presets.map(x=>[x.key,x]));

test('four divisions expand without creating new industries or deleting historical product types',()=>{
 assert.equal(manifest.industries.length,13);
 assert.equal(manifest.schemaVersion,2);
 assert.equal(manifest.presets.length,51);
 assert.equal(manifest.industries.reduce((n,x)=>n+x.categoryPaths.length,0),146);
 for(const code of ['mobile_phones','electronics','household_goods','repair_services'])assert.ok(manifest.industries.some(x=>x.code===code));
 assert.ok(manifest.legacyReadOnlyProductTypes);
});

test('mobile devices use real unit identifiers, accessories use quantity and compatibility specifications',()=>{
 for(const key of ['smartphone','feature_phone','cellular_tablet','mifi_router']) {
  const p=presets.get(key);assert.equal(p.stock,'serial');assert.ok(p.identifiers.includes('imei'));
 }
 for(const key of ['phone_case','screen_protector','charger','usb_cable','power_bank','earphones']){
  const p=presets.get(key);assert.equal(p.stock,'quantity');assert.deepEqual(p.identifiers,[]);
 }
 assert.ok(presets.get('usb_cable').fields.some(x=>x.key==='powerWatts'));
 assert.ok(presets.get('charger').fields.some(x=>x.key==='connector'&&x.required));
});

test('electronics and large appliances have distinct, typed specification policies',()=>{
 for(const key of ['tv','laptop','network_router','printer','cctv_camera','gaming_console','refrigerator','washing_machine','cooker','air_conditioner']){
  const p=presets.get(key);assert.equal(p.stock,'serial');assert.ok(p.fields.some(x=>x.key==='model'&&x.required));
 }
 assert.ok(presets.get('refrigerator').fields.some(x=>x.key==='capacityLitres'&&x.kind==='number'&&x.required));
 assert.ok(presets.get('washing_machine').fields.some(x=>x.key==='capacityKg'&&x.kind==='number'));
 assert.ok(presets.get('cooker').fields.some(x=>x.key==='fuelType'&&x.kind==='select'));
});

test('manufacturer brands, model names, compatibility and inspections have tenant-scoped constraints',()=>{
 const sql=source('../prisma/migrations/20261105090000_specialized_devices_brands_compatibility/migration.sql');
 for(const name of ['catalog_brands','catalog_device_models','accessory_compatibilities','inventory_unit_inspections']){
  assert.match(sql,new RegExp(`CREATE TABLE public\\.${name}`));
  assert.match(sql,new RegExp(`'${name}'`));
 }
 assert.match(sql,/UNIQUE\(tenant_id,normalized_name\)/);
 assert.match(sql,/UNIQUE\(tenant_id,accessory_product_id,device_model_id\)/);
 assert.match(sql,/FOREIGN KEY\(tenant_id,device_model_id\)/);
 assert.match(sql,/FORCE ROW LEVEL SECURITY/);
 assert.match(sql,/CHECK \(condition IN/);
 assert.doesNotMatch(sql,/\b(DROP TABLE|TRUNCATE|DELETE FROM|UPDATE public\.products|UPDATE public\.inventory_serials)\b/i);
});

test('no compatibility advice without a verified human approval and actual branch stock',()=>{
 const api=source('../src/commerce/catalog-inventory.controller.ts');
 const checkout=source('../../lexa-frontend/src/modules/checkout/CheckoutPage.tsx');
 assert.match(api,/verifiedAt:\{not:null\}/);
 assert.match(api,/hasPermission\(member\.role,'inventory\.approve'\)/);
 assert.match(api,/verifiedByUserId:actor/);
 assert.match(api,/where:\{tenantId:w,active:true,id:\{in:links\.map/);
 assert.match(checkout,/apiCatalogInventory\.verifiedAccessories/);
 assert.match(checkout,/choiceBalance\(choice\)>0/);
});

test('untrusted catalogue requests bind product models to tenant, brand and type',()=>{
 const core=source('../src/core/core.controller.ts');
 assert.match(core,/resolveManufacturerIdentity/);
 assert.match(core,/model\.productType!==productType/);
 assert.match(core,/model\.brandId!==catalogBrandId/);
 assert.match(core,/catalogBrandId:catalogueIdentity\.catalogBrandId/);
 assert.match(core,/catalogModelId:catalogueIdentity\.catalogModelId/);
 assert.match(core,/tenantId,\s*id:catalogModelId/);
});

test('physical-unit condition is immutable and damaged stock is rejected by core checkout',()=>{
 const api=source('../src/commerce/catalog-inventory.controller.ts');
 const checkout=source('../src/core/core.controller.ts');
 assert.match(api,/inventoryUnitInspection\.create/);
 assert.match(api,/previous\?\.condition==='damaged'/);
 assert.match(checkout,/latestInspections\.some\(entry=>entry\.condition==='damaged'\)/);
 assert.match(checkout,/inventory_unit_inspections WHERE tenant_id=/);
});
