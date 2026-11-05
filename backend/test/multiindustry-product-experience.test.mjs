import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {buildVariantMatrix} from '../../lexa-frontend/src/domain/catalog/variantMatrix.ts';

const source=(filename)=>readFileSync(new URL(filename,import.meta.url),'utf8');
const policySource=source('../src/catalog/product-attribute-validation.ts');
function loadPolicy(){
 const js=ts.transpileModule(policySource,{fileName:'policy.ts',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const exports={};
 class BadRequestException extends Error{}
 const preset={key:'smartphone',stock:'serial',industries:['mobile_phones'],variants:['storage','colour'],fields:[{key:'model',label:'Model',kind:'text',required:true},{key:'storage',label:'Storage',kind:'text',required:false},{key:'colour',label:'Colour',kind:'text',required:false}]};
 const requireStub=(name)=>{
  if(name==='@nestjs/common')return {BadRequestException};
  if(name==='./industry-contract.generated')return {INDUSTRY_POLICIES:{smartphone:preset},LEGACY_PRODUCT_TYPE_FIELDS:{}};
  if(name==='../business-setup/business-setup.rules')return {normaliseSavedIndustries:(codes)=>codes??[]};
  throw new Error('Unmocked module '+name);
 };
 new Function('require','exports',js)(requireStub,exports);
 return {api:exports,BadRequestException};
}

test('category schema accepts typed, required fields and rejects malformed dropdowns',()=>{
 const {api,BadRequestException}=loadPolicy();
 const rows=api.cleanCategoryAttributeSchema([
  {key:'fabricGrade',label:'Fabric grade',kind:'select',options:['A','B'],required:true},
  {key:'width',label:'Width in metres',kind:'number',required:false},
 ]);
 assert.equal(rows.length,2);assert.equal(rows[0].required,true);
 assert.deepEqual(rows[0].options,['A','B']);
 assert.throws(()=>api.cleanCategoryAttributeSchema([{key:'code',label:'Code',kind:'select'}]),BadRequestException);
 assert.throws(()=>api.cleanCategoryAttributeSchema([{key:'code',label:'Code',required:'yes'}]),BadRequestException);
 assert.throws(()=>api.cleanCategoryAttributeSchema([{key:'code',label:'One'},{key:'code',label:'Two'}]),BadRequestException);
});

test('API policy rejects omitted or invalid custom attributes, including cross-client payloads',()=>{
 const {api,BadRequestException}=loadPolicy();
 const schema=[{key:'fabricGrade',label:'Fabric grade',kind:'select',options:['A','B'],required:true},{key:'width',label:'Width',kind:'number'}];
 const validate=(attrs,strict=true)=>api.cleanProductAttributes(attrs,'smartphone',['fabricGrade','width'],strict,schema);
 assert.throws(()=>validate({model:'Galaxy S',width:'2'}),BadRequestException);
 assert.throws(()=>validate({model:'Galaxy S',fabricGrade:'C'}),BadRequestException);
 assert.throws(()=>validate({model:'Galaxy S',fabricGrade:'A',width:'not a number'}),BadRequestException);
 assert.throws(()=>validate({model:'Galaxy S',fabricGrade:123}),BadRequestException);
 assert.throws(()=>validate({model:123,fabricGrade:'A'}),BadRequestException);
 const saved=validate({model:'Galaxy S',fabricGrade:'A',width:'2.5'});
 assert.equal(saved.width,2.5);
 assert.equal(saved.fabricGrade,'A');
 assert.deepEqual(validate({model:'Existing'},false),{model:'Existing'});
});

test('variant matrix generates real deterministic dimensions without duplicates',()=>{
 const rows=buildVariantMatrix('DRESS-1',['size','colour'],{size:'S, M, L',colour:'Black, Blue'});
 assert.equal(rows.length,6);
 assert.deepEqual(rows[0],{sku:'DRESS-1-S-BLACK',attributes:{size:'S',colour:'Black'}});
 assert.equal(new Set(rows.map(r=>r.sku)).size,6);
 assert.equal(buildVariantMatrix('SHIRT',['size'],{size:'S, s, M'}).length,2);
 assert.throws(()=>buildVariantMatrix('P',['size','colour'],{size:Array(10).fill(0).map((_,i)=>String(i)).join(','),colour:'A,B,C,D,E,F,G,H,I'}),/Limit/);
 assert.throws(()=>buildVariantMatrix('prefix with spaces',['size'],{size:'L'}),/SKU prefix/);
});

test('bulk and single variant APIs share atomic checks, client adapter and contract',()=>{
 const controller=source('../src/commerce/catalog-inventory.controller.ts');
 const client=source('../../lexa-frontend/src/data/remote/apiWorkstream03.ts');
 const contract=source('../../lexa-frontend/openapi/backend-contract.yaml');
 assert.match(controller,/async createVariantBatch\(/);
 assert.match(controller,/this\.createVariantBatch\(w,id,\{variants:\[raw\]\},req\)/);
 assert.match(controller,/isolationLevel:'Serializable'/);
 assert.match(controller,/seenDimensions\.has\(dimensionKey\)/);
 assert.match(controller,/seenBarcodes\.has\(normalized\)/);
 assert.match(client,/createVariantBatch:/);
 assert.match(contract,/\/products\/\{productId\}\/variants\/bulk:/);
});

test('category policy is enforced by backend and stock detail is read-only',()=>{
 const core=source('../src/core/core.controller.ts');
 const hierarchy=source('../src/catalog/category-hierarchy.ts');
 const ui=source('../../lexa-frontend/src/modules/products/AdaptiveProductFields.tsx');
 const inventory=source('../../lexa-frontend/src/modules/inventory/InventoryPage.tsx');
 assert.match(core,/categoryFields\.customFields/);
 assert.match(hierarchy,/customFields:new Map|customFields= new Map|customFields=new Map/);
 assert.match(ui,/setCustomRequired/);
 assert.match(ui,/setCustomOptions/);
 assert.match(inventory,/Inspect actual stock/);
 assert.match(inventory,/apiCatalogInventory\.availableLots\(/);
 assert.match(inventory,/apiCatalogInventory\.availableSerials\(/);
});

test('legacy backup fails closed when rich stock would be lost',()=>{
 const core=source('../src/core/core.controller.ts');
 assert.match(core,/Legacy workspace export cannot preserve variant, package, batch or serialized stock/);
 assert.match(core,/Legacy restore is unsafe for businesses using variants, packages, lots or serials/);
 assert.match(core,/r\.attributeSchema/);
 assert.match(core,/r\.productType/);
});
