import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { availableIndustryCodes, selectIndustries, normaliseSavedIndustries, SetupValidationError } from '../src/business-setup/business-setup.rules.ts';
import { PRODUCT_PRESETS,INDUSTRY_OPTIONS,suggestedCategoryPaths,permittedPresets,validateProductDraft } from '../../lexa-frontend/src/domain/catalog/industryCatalog.ts';

const manifest=JSON.parse(readFileSync(new URL('../src/catalog/industry-manifest.json',import.meta.url),'utf8'));
const core=readFileSync(new URL('../src/core/core.controller.ts',import.meta.url),'utf8');
const validation=readFileSync(new URL('../src/catalog/product-attribute-validation.ts',import.meta.url),'utf8');
const migrations=readFileSync(new URL('../prisma/migrations/20261104170000_retail_catalogue_hierarchy_retirement/migration.sql',import.meta.url),'utf8');

test('exactly thirteen active industries are consistent for all clients',()=>{
 assert.equal(availableIndustryCodes.length,13);
 assert.deepEqual(INDUSTRY_OPTIONS.map(item=>item[0]),[...availableIndustryCodes]);
 assert.equal(manifest.presets.length,PRODUCT_PRESETS.length);
 for(const retired of manifest.retiredIndustryCodes){
  assert.ok(!availableIndustryCodes.includes(retired));
  assert.throws(()=>selectIndustries([retired]),SetupValidationError);
 }
 assert.deepEqual(normaliseSavedIndustries(['agriculture','mobile_phones','healthcare']),['mobile_phones']);
 assert.deepEqual(normaliseSavedIndustries(['healthcare'] ),['other']);
});

test('all thirteen industries have real nested category templates',()=>{
 for(const code of availableIndustryCodes){
  const paths=suggestedCategoryPaths([code]);
  assert.ok(paths.length>=3,code);
  assert.ok(paths.every(path=>path.length>=2&&path.every(Boolean)),code);
 }
 assert.ok(suggestedCategoryPaths(['mobile_phones']).some(path=>path.includes('Smartphones')));
});

test('phone and fashion product entry enforce different tracking policies',()=>{
 assert.ok(permittedPresets(['mobile_phones']).some(p=>p.key==='smartphone'));
 assert.ok(!permittedPresets(['mobile_phones']).some(p=>p.key==='cosmetic'));
 const phone={trackStock:true,trackSerial:true,trackLot:false};
 assert.ok(validateProductDraft('smartphone',{model:'Samsung Galaxy S24'},phone,['mobile_phones']).length===0);
 assert.ok(validateProductDraft('smartphone',{model:''},phone,['mobile_phones']).some(e=>e.includes('Model')));
 assert.ok(validateProductDraft('smartphone',{model:'Samsung'}, {...phone,trackSerial:false},['mobile_phones']).some(e=>e.includes('serial')));
 const dress={trackStock:true,trackSerial:false,trackLot:false};
 assert.deepEqual(validateProductDraft('clothing',{style:'Dress'},dress,['fashion_beauty']),[]);
 assert.ok(validateProductDraft('clothing',{style:'Dress'},dress,['mobile_phones']).some(e=>e.includes('business')));
 assert.ok(validateProductDraft('service',{}, {...dress,trackStock:true},['repair_services']).some(e=>e.includes('non-stock')));
});

test('API, variants and categorized inventory are enforced at the server boundary',()=>{
 assert.match(core,/await assertTypeAllowed\(this\.prisma,workspaceId,effectiveType\)/);
 assert.match(core,/enforceTrackingPolicy\(effectiveType/);
 assert.match(core,/async ensureCategoryPath\(/);
 assert.match(core,/async industryConfig\(/);
 assert.match(validation,/validateVariantDimensions/);
 assert.match(validation,/strictRequired/);
 assert.match(migrations,/categories_tenant_parent_name_unique/);
 assert.doesNotMatch(migrations,/DELETE FROM (?:products|sales|categories|stock_movements)/i);
});

test('new backend products require an explicit supported type; retired existing types are preserved',()=>{
 assert.match(core,/if\(!effectiveType\)throw new BadRequestException\('Choose a supported product type/);
 assert.match(validation,/existingType:string\|null= null/);
 assert.match(validation,/if\(productType===existingType\)return/);
 assert.match(core,/assertTypeAllowed\(this\.prisma,workspaceId,effectiveType,existing\.productType\)/);
});

test('staged and direct product import paths use the shared policy rather than bypassing it',()=>{
 const jobs=readFileSync(new URL('../src/platform/platform-jobs.ts',import.meta.url),'utf8');
 const direct=core.slice(core.indexOf("@Post('workspaces/:workspaceId/imports/products-csv')"));
 assert.match(jobs,/enforceTrackingPolicy\(d\.product_type/);
 assert.match(jobs,/validateCatalogVariantImport\(p\.rows\[0\]\.product_type,p\.rows\[0\]\.catalog_code/);
 assert.match(direct,/requiredCsvCell\(row,headers,'productType'/);
 assert.match(direct,/await Promise\.all\(\[\.\.\.new Set\(items\.map\(item=>item\.productType\)\)\]/);
 assert.match(direct,/productType:item\.productType,attributes:item\.attributes/);
});

test('offline preview retains category metadata and tracking policy without creating stock',()=>{
 const local=readFileSync(new URL('../../lexa-frontend/src/data/local/products.ts',import.meta.url),'utf8');
 assert.match(local,/validateProductDraft\(input\.productType/);
 assert.match(local,/productType:input\.productType/);
 assert.match(local,/attributes:input\.attributes/);
 assert.match(local,/trackLot:input\.trackLot===true,trackSerial:input\.trackSerial===true/);
});
