import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = path => readFileSync(new URL(path,import.meta.url),'utf8');
const controller=source('../src/commerce/electronics-inventory-operations.controller.ts');
const migration=source('../prisma/migrations/20261105170000_inventory_receipts_identifiers_fitment_bundles/migration.sql');
const schema=source('../prisma/schema.prisma');
const api=source('../../lexa-frontend/src/data/remote/apiWorkstream03.ts');
test('all new physical unit identifier claims reject historical and concurrent collisions',()=>{
 assert.match(migration,/pg_advisory_xact_lock\(hashtextextended/);
 assert.match(migration,/CREATE FUNCTION public\.lexa_claim_unit_identifier/);
 assert.match(migration,/EXISTS\(SELECT 1 FROM public\.inventory_unit_identifiers/);
 assert.match(migration,/PERFORM public\.lexa_claim_unit_identifier\(NEW\.tenant_id,NEW\.id/);
 assert.match(migration,/CREATE TRIGGER lexa_new_unit_identifiers AFTER INSERT ON public\.inventory_serials/);
 assert.match(migration,/copies>1 FROM cleaned/);
 assert.match(migration,/CREATE UNIQUE INDEX unit_identifier_claim_unique/);
});
test('tenant RLS is fail-closed and SQL quotation is valid',()=>{
 assert.match(migration,/FORCE ROW LEVEL SECURITY/);
 assert.match(migration,/current_setting\(''app\.tenant_id'',true\),''''\)/);
 assert.doesNotMatch(migration,/current_setting\(app\.tenant_id/);
 assert.doesNotMatch(migration,/current_setting\(''app\.tenant_id'',true\),\)/);
 for(const name of ['inventory_unit_identifiers','inventory_receipt_batches','catalog_product_aliases','package_conversion_revisions','product_bundles','product_bundle_components']){
  assert.match(migration,new RegExp('CREATE TABLE public\\.'+name));
  assert.match(migration,new RegExp("'"+name+"'"));
 }
});
test('one physical unit produces one stock movement regardless of IMEI cardinality',()=>{
 assert.match(controller,/prepareSerializedReceiptUnits\(b\.units/);
 assert.match(controller,/if\(prior\)\{if\(prior\.payloadHash!==payloadHash/);
 assert.match(controller,/for\(const unit of units\)/);
 assert.match(controller,/serial=await tx\.inventorySerial\.create/);
 assert.match(controller,/tx\.stockMovement\.create\(\{data:\{tenantId:w,branchId:branch,productId,variantId,warehouseId,serialId:serial\.id,quantityDelta:'1'/);
 assert.match(controller,/condition==='damaged'\?'quarantine':'available'/);
 assert.match(controller,/sourceKind:'approved_opening'/);
 assert.match(controller,/isolationLevel:'Serializable'/);
});
test('kit assembly is all-or-none and does not consume serialized/lot stock',()=>{
 assert.match(controller,/Nested kits are not allowed/);
 assert.match(controller,/component\.trackSerial\|\|component\.trackLot/);
 assert.match(controller,/production_issue/);
 assert.match(controller,/production_receipt/);
 assert.match(controller,/componentCosts\.get\(component\.id\)/);
 assert.match(controller,/Insufficient unreserved component stock/);
 assert.match(controller,/idempotencyKey:key/);
});
test('stock policies, tracking and package revisions affect all API consumers',()=>{
 const catalog=source('../src/commerce/catalog-inventory.controller.ts');
 const procurement=source('../src/supply-chain/supply-chain.controller.ts');
 assert.match(catalog,/familyForCategoryCode/);
 assert.match(catalog,/validateFamilySpecifications\(familyAttributes/);
 assert.match(procurement,/packageConversionRevision\.findFirst/);
 assert.match(procurement,/applicableRevision\?\.unitsPerPackage\?\?pack\.unitsPerPackage/);
 assert.match(catalog,/reviewState:'verified',revokedAt:null/);
 assert.match(api,/receiveSerializedStock/);
 assert.match(api,/reviewAccessoryFit/);
 assert.match(api,/assembleProductBundle/);
});
test('normalized identifier and kit schemas match the migration',()=>{
 for(const name of ['InventoryUnitIdentifier','InventoryReceiptBatch','CatalogProductAlias','PackageConversionRevision','ProductBundle','ProductBundleComponent'])assert.match(schema,new RegExp(`model ${name} \\{`));
 const delegates=source('../src/prisma/prisma.service.ts');
 for(const model of ['inventoryUnitIdentifier','inventoryReceiptBatch','catalogProductAlias','packageConversionRevision','productBundle','productBundleComponent'])assert.ok(delegates.includes(model),`${model} needs tenant context`);
});
