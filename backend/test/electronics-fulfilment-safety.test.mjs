import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {safeAccessoryFitment} from '../src/catalog/accessory-fitment-policy.ts';

const read = filename => readFileSync(new URL(filename,import.meta.url),'utf8');
const controller = read('../src/commerce/catalog-inventory.controller.ts');
const recommendations = read('../src/commerce/electronics-inventory-operations.controller.ts');
const productWizard = read('../../lexa-frontend/src/modules/products/AdaptiveProductFields.tsx');
const productSearch = read('../../lexa-frontend/src/modules/products/ProductsPage.tsx');
const wizard = read('../../lexa-frontend/src/domain/catalog/electronicsFamilyWizard.ts');

test('serialized inventory cannot be opened from an unverified lot count',()=>{
 assert.match(controller,/if\(product\.trackSerial\)throw new BadRequestException\('Serialized goods require an exact accepted unit receipt/);
 assert.match(controller,/\bawait tx\.inventorySerial\.update\(\{where:\{id\},data:\{status:quarantining\?'quarantine':'available'/);
 assert.match(controller,/hasPermission\(member\.role,'inventory\.approve'\)/);
 assert.match(controller,/FOR UPDATE`;/);
});

test('an unverified charger is never offered to checkout, even if a legacy fitment link was marked verified',()=>{
 const base={compatibilityKind:'electrical',reviewState:'verified',verifiedAt:new Date(),revokedAt:null,evidence:{reference:'Maker spec DOC-01',checkedElectricalSafety:true,voltageRange:'5-20 V',currentAmps:3,connectorType:'USB-C'}};
 assert.equal(safeAccessoryFitment('charger',base),true);
 assert.equal(safeAccessoryFitment('charger',{...base,compatibilityKind:'physical'}),false);
 assert.equal(safeAccessoryFitment('charger',{...base,evidence:{reference:'Maker spec DOC-01'}}),false);
 assert.equal(safeAccessoryFitment('charger',{...base,reviewState:'proposed'}),false);
 assert.equal(safeAccessoryFitment('charger',{...base,revokedAt:new Date()}),false);
 assert.equal(safeAccessoryFitment('printer_toner',{...base,compatibilityKind:'physical'}),false);
 assert.equal(safeAccessoryFitment('printer_toner',{...base,compatibilityKind:'consumable'}),true);
 assert.match(recommendations,/proposedFits\.filter\(f=>safeAccessoryFitment\(productById\.get\(f\.accessoryProductId\)\?\.productType,f\)\)/);
});

test('bulk variants show invalid combinations before API submission',()=>{
 assert.match(productWizard,/matrixIssues\.length>0\|\|batch\.isPending/);
 assert.match(productWizard,/matrixPreview\.error\|\|matrixIssues\[0\]/);
 assert.match(productWizard,/validateWizardVariantAxes\(matrixRows,family\)/);
 assert.match(wizard,/validGtin\(row\.gtin\.trim\(\)\)/);
});

test('product table identity search includes registered aliases and supplier codes',()=>{
 assert.match(productSearch,/searchProductsByIdentity\(workspace\.id,search\.trim\(\)\)/);
 assert.match(productSearch,/matchedIdentifiers\.has\(item\.id\)/);
 assert.match(productSearch,/item\.supplierSku/);
});

test('opening-stock CSV cannot create phantom serialized inventory',()=>{
 const core=read('../src/core/core.controller.ts');
 assert.match(core,/if \(product\.trackSerial\) throw new BadRequestException\(`CSV row \$\{item\.rowNumber\}: serialized products require a validated per-unit receipt/);
});

test('CSV variants revalidate family options, GTIN, signature uniqueness and identity at apply time',()=>{
 const worker=read('../src/platform/platform-jobs.ts');
 const template=read('../src/platform/import-export.ts');
 const policy=read('../src/catalog/variant-import-policy.ts');
 assert.match(worker,/validateCatalogVariantImport\(p\.rows\[0\]\.product_type,p\.rows\[0\]\.catalog_code/);
 assert.match(worker,/validCatalogGtin\(d\.gtin\)/);
 assert.match(worker,/Two CSV rows describe the same sellable product options/);
 assert.match(worker,/FOR UPDATE OF p/);
 assert.match(worker,/variant_signature,attributes,cost_price_minor/);
 assert.match(template,/product_variants:\{version:2,required:\['product_sku','sku'\],optional:\['barcode','gtin'/);
 assert.match(policy,/validateFamilySpecifications\(published,family,\{required:false\}\)/);
});

test('stock-changing receiving and kit actions live in Inventory rather than product creation',()=>{
 const page=read('../../lexa-frontend/src/modules/products/ProductsPage.tsx');
 const inventory=read('../../lexa-frontend/src/modules/inventory/CatalogInventoryPanel.tsx');
 assert.doesNotMatch(page,/<ElectronicsSerializedReceiving/);
 assert.doesNotMatch(page,/<ElectronicsBundleManager/);
 assert.match(inventory,/<ElectronicsSerializedReceiving/);
 assert.match(inventory,/<ElectronicsBundleManager/);
});


test('legacy commerce orders cannot receive or fulfil tracked devices without exact identities',()=>{
 const commerce=read('../src/commerce/commerce.controller.ts');
 assert.match(commerce,/if\(item\.product\.trackSerial\|\|item\.product\.trackLot\)throw new BadRequestException/);
 assert.match(commerce,/if\(product\.trackSerial\|\|product\.trackLot\)throw new BadRequestException/);
});
