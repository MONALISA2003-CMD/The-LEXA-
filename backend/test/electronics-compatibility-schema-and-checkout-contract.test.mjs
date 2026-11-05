import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
const schema=source('../prisma/schema.prisma');
const migration=source('../prisma/migrations/20261105170000_inventory_receipts_identifiers_fitment_bundles/migration.sql');
const controller=source('../src/commerce/electronics-inventory-operations.controller.ts');
const baseCatalog=source('../src/commerce/catalog-inventory.controller.ts');
const checkout=source('../../lexa-frontend/src/modules/checkout/CheckoutPage.tsx');
const ui=source('../../lexa-frontend/src/modules/products/DeviceCatalogExperiences.tsx');
const api=source('../../lexa-frontend/src/data/remote/apiWorkstream03.ts');
const kitUi=source('../../lexa-frontend/src/modules/products/ElectronicsStockOperations.tsx');
test('compatibility review fields exist both in Prisma model and additive SQL migration',()=>{
 const model=schema.match(/model AccessoryCompatibility \{([\s\S]*?)\n\}/)?.[1];
 assert.ok(model,'Prisma compatibility model missing');
 for(const [prismaField,dbField] of Object.entries({compatibilityKind:'compatibility_kind',evidence:'evidence',reviewState:'review_state',revokedAt:'revoked_at'})){
  assert.match(model,new RegExp('\\b'+prismaField+'\\b'));
  assert.match(migration,new RegExp('ALTER TABLE public\\.accessory_compatibilities ADD COLUMN '+dbField+'\\b'));
 }
 assert.match(model,/revokedAt DateTime\? @map\("revoked_at"\)/);
 assert.match(model,/evidence Json @default\("\{\}"\)/);
});
test('tenant and branch scoped physical-unit lookup uses an existing typed branch parameter',()=>{
 assert.match(controller,/@Param\('branchId'\) branch:string/);
 assert.match(controller,/inventorySerial\.findFirst\(\{where:\{tenantId:w,branchId:branch,id:claims\[0\]\.serialId\}\}/);
 assert.doesNotMatch(controller,/where:\{tenantId:w,branchId,id:claims/);
 assert.match(ui,/lookupPhysicalIdentity\(workspaceId,branchId,value\)/);
});
test('POS recommends only verified branch-stock SKU records and no unstocked variants',()=>{
 assert.match(checkout,/availableCompatibleAccessories\(workspace\.id,branch\.id,id\)/);
 assert.doesNotMatch(checkout,/apiCatalogInventory\.verifiedAccessories\(/);
 assert.match(checkout,/item\.available>0/);
 assert.match(checkout,/accessorySuggestionsQuery\.data\?\.includes\(choice\.key\)/);
 assert.match(controller,/reviewState:'verified',verifiedAt:\{not:null\},revokedAt:null/);
 assert.match(baseCatalog,/reviewState:'verified',revokedAt:null/);
});
test('electrical fitment requires documented voltage, current and connector and approver confirmation',()=>{
 assert.match(controller,/const voltageRange=string\(b\.voltageRange/);
 assert.match(controller,/const currentAmps=Number\(b\.currentAmps\)/);
 assert.match(controller,/const connectorType=string\(b\.connectorType/);
 assert.match(controller,/b\.confirmedElectricalSafety!==true/);
 assert.match(controller,/electricalSpecifications=\{voltageRange,currentAmps,connectorType\}/);
 assert.match(ui,/Supported voltage range/);
 assert.match(ui,/Rated current \(A\)/);
 assert.match(ui,/Verified connector/);
 assert.match(api,/voltageRange\?:string;currentAmps\?:number;connectorType\?:string/);
});
test('kit assembly respects branch reservations without a warehouse and disallows late nested kits',()=>{
 assert.match(controller,/productBundleComponent\.findFirst\(\{where:\{tenantId:w,productId:parent\}\}/);
 assert.match(controller,/OR:\[\{warehouseId\},\{warehouseId:null\}\]/);
 assert.match(controller,/isolationLevel:'Serializable'/);
 assert.match(kitUi,/componentVariantId/);
 assert.match(kitUi,/Component SKU<select/);
});
test('one to many identifiers pass through purchase receiving and legacy registration',()=>{
 const purchase=source('../src/supply-chain/supply-chain.controller.ts');
 const catalog=source('../src/commerce/catalog-inventory.controller.ts');
 const shared=source('../src/catalog/serial-identity.ts');
 assert.match(purchase,/validateAdditionalImeis\(info\.extraImeis/);
 assert.match(purchase,/\.\.\.s\.extraImeis/);
 assert.match(purchase,/warehouse_id,unit_cost_minor,accepted_at/);
 assert.match(purchase,/inventoryUnitInspection\.create/);
 assert.match(catalog,/validatedExtraImeis\(b\.extraImeis/);
 assert.match(catalog,/quantity_on_hand::text/);
 assert.match(catalog,/status:locked\[0\]\.status==='available'\?'available':'quarantine'/);
 assert.match(shared,/export function validateAdditionalImeis/);
 assert.match(source('../../lexa-frontend/src/modules/inventory/InventoryWorkflowsA.tsx'),/extraImeis:extra/);
});
