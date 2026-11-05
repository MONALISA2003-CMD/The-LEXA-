import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'../..');
const controller=fs.readFileSync(path.join(root,'backend/src/catalog/electronics-catalogue.controller.ts'),'utf8');
const browser=fs.readFileSync(path.join(root,'lexa-frontend/src/modules/products/ElectronicsCatalogueDirectory.tsx'),'utf8');
const api=fs.readFileSync(path.join(root,'lexa-frontend/src/data/remote/apiElectronicsCatalogue.ts'),'utf8');
const policy=fs.readFileSync(path.join(root,'backend/src/catalog/electronics-catalogue-policy.ts'),'utf8');
const generator=fs.readFileSync(path.join(root,'scripts/sync_electronics_catalogue_v2.py'),'utf8');
const openapi=fs.readFileSync(path.join(root,'lexa-frontend/openapi/backend-contract.yaml'),'utf8');
const ts=createRequire(import.meta.url)('typescript');

test('category adoption has explicit Prisma ID typing and strict TypeScript fixture compiles',()=>{
 const match=controller.match(/const row: \{id:string\}=await tx\.category\.create\(\{data:([\s\S]*?)\}\);/);
 assert.ok(match,'Category creation result must use a non-circular explicit ID type');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lexa-electronics-strict-'));
 try{
  const content=`declare const tx: {category:{create:(arg:{data:Record<string,unknown>})=>Promise<{id:string;createdAt:Date}>}};
  declare const tenantId:string, w:string, parentId:string|null, V2_TAXONOMY_VERSION:number, leaf:boolean;
  declare const node:{label:string;code:string};declare const family:{legacyProductType:string};
  declare function legacyCategoryAttributeSchema(x:unknown):unknown[];
  async function create(){const row: {id:string}=await tx.category.create({data:${match[1]}});return row.id;}`;
  const file=path.join(dir,'regression.ts');fs.writeFileSync(file,content);
  const options={strict:true,noEmit:true,target:ts.ScriptTarget.ES2022,skipLibCheck:true};
  const program=ts.createProgram([file],options);
  const issues=ts.getPreEmitDiagnostics(program).map(d=>ts.flattenDiagnosticMessageText(d.messageText,' '));
  assert.deepEqual(issues,[],'Prisma category creation narrowing must remain strict-TS safe');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('custom and historical category search is read-only and uses stable tenant-owned IDs',()=>{
 assert.ok(controller.indexOf("@Get('taxonomy/custom')")<controller.indexOf("@Get('taxonomy/:code')"));
 const block=controller.split("@Get('taxonomy/custom')")[1].split("@Get('taxonomy/:code')")[0];
 assert.match(block,/await this\.actor\(req,w\)/);
 assert.match(block,/where:\{tenantId:w\}/);
 assert.match(block,/CUSTOM\.C/);
 assert.match(block,/category\.id\.replace/);
 assert.match(block,/seen\.has\(current\.id\)/);
 assert.doesNotMatch(block,/\.(create|update|delete|upsert)\(/);
 assert.match(api,/customCategories:/);
 assert.match(browser,/customCategories\.data/);
 assert.match(openapi,/operationId: electronicsCatalogueCustomCategoriesGet/);
});

test('choosing a legacy custom category preserves the existing product type and stock flags',()=>{
 const products=fs.readFileSync(path.join(root,'lexa-frontend/src/modules/products/ProductsPage.tsx'),'utf8');
 assert.match(products,/onCategoryChosen=\{\(categoryId,legacyType\)=>\{if\(!legacyType\)/);
 assert.match(products,/setForm\(current=>\(\{\.\.\.current,categoryId,categoryName:''\}\)\)/);
 assert.match(browser,/onCategoryChosen\?\.\(item\.categoryId,item\.templateKey\?\?undefined\)/);
});

test('frontend manufacturer directory supports revisions, approval and rejection without editing historical products',()=>{
 assert.match(browser,/apiElectronicsCatalogue\.reviseModel/);
 assert.match(browser,/apiElectronicsCatalogue\.reviewModel/);
 assert.match(browser,/outcome:'rejected'/);
 assert.match(browser,/Create revised specification version/);
 assert.match(browser,/immutable revision/);
});

test('manufacturer model reads obey enabled family policies without hiding legacy models',()=>{
 const block=controller.split("@Get('models')")[1].split("@Post('models')")[0];
 assert.match(block,/const enabledCodes=V2_FAMILIES\.filter/);
 assert.match(block,/assertFamilyEnabled\(familyPolicy\(familyCode\),selected\)/);
 assert.match(block,/familyCode:null/);
 assert.match(block,/AND:\[allowed/);
});

test('approved reference specifications require provenance but draft creation remains permissible',()=>{
 const review=controller.split("@Post('models/:modelId/review')")[1];
 assert.match(review,/outcome==='reviewed'&&/);
 assert.match(review,/reviewedProvenance/);
 assert.match(review,/Provide source or manufacturer evidence/);
 assert.match(controller,/reviewStatus:'draft'/);
 assert.match(policy,/validateSourceProvenance/);
});

test('canonical code aliases and all leaf/industry permissions fail at generator time if ambiguous',()=>{
 assert.match(generator,/for value in \[n\['code'\]/);
 assert.match(generator,/set\(n\['industryCodes'\]\) <= set\(families/);
 const d=JSON.parse(fs.readFileSync(path.join(root,'scripts/electronics-catalogue-v2.v1.json'),'utf8'));
 const fam=new Map(d.families.map(f=>[f.code,f]));
 for(const node of d.nodes.filter(n=>n.selectable)){
  assert.ok(node.industryCodes.every(x=>fam.get(node.familyCode).industryCodes.includes(x)),node.code);
 }
});
