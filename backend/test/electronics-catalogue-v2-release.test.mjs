import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'../..');
const content=JSON.parse(fs.readFileSync(path.join(root,'scripts/electronics-catalogue-v2.v1.json'),'utf8'));
const old=JSON.parse(fs.readFileSync(path.join(root,'scripts/industry-catalogue.v1.json'),'utf8'));
const tree=new Map(content.nodes.map(node=>[node.code,node]));
const families=new Map(content.families.map(family=>[family.code,family]));
const allowed=new Set(old.industries.map(i=>i.code));
const schema=fs.readFileSync(path.join(root,'backend/prisma/schema.prisma'),'utf8');
const sql=fs.readFileSync(path.join(root,'backend/prisma/migrations/20261105120000_electronics_catalogue_v2_phase1/migration.sql'),'utf8');
const controller=fs.readFileSync(path.join(root,'backend/src/catalog/electronics-catalogue.controller.ts'),'utf8');

function loadPolicy() {
 const require=createRequire(import.meta.url);
 const ts=require('typescript');
 const generated=fs.readFileSync(path.join(root,'backend/src/catalog/electronics-catalogue-v2.generated.ts'),'utf8');
 const source=fs.readFileSync(path.join(root,'backend/src/catalog/electronics-catalogue-policy.ts'),'utf8');
 const run=(text,imports)=>{
  const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${js}\n})`,{Number,String,Boolean,Map,Set,Object,Array,JSON,RegExp,Error},{timeout:1000})(x=>{
   if(x in imports)return imports[x];
   throw new Error('Unexpected dependency '+x);
  },module,module.exports);
  return module.exports;
 };
 const generatedModule=run(generated,{});
 const ErrorClass=class extends Error{};
 return run(source,{'@nestjs/common':{BadRequestException:ErrorClass,ForbiddenException:ErrorClass,NotFoundException:ErrorClass},'./electronics-catalogue-v2.generated':generatedModule,'../business-setup/business-setup.rules':{normaliseSavedIndustries:(arr)=>Array.isArray(arr)?arr:[]}});
}

test('all V2 leaves resolve to immutable family policies and approved 13-industry mappings',()=>{
 assert.equal(old.industries.length,13);
 assert.equal(old.presets.length,51);
 assert.equal(content.schemaVersion,2);
 assert.equal(content.policyVersion,1);
 assert.equal(content.nodes.length,282);
 assert.equal(content.nodes.filter(n=>n.selectable).length,221);
 assert.equal(content.families.length,52);
 for(const node of content.nodes){
  assert.ok(node.industryCodes.every(k=>allowed.has(k)),node.code);
  assert.ok(node.path.length>0,node.code);
  assert.equal(node.label,node.path.at(-1));
  if(node.parentCode){const parent=tree.get(node.parentCode);assert.ok(parent,node.code);assert.deepEqual(node.path.slice(0,-1),parent.path);}
  if(node.selectable){assert.ok(families.has(node.familyCode),node.code);assert.equal(node.code.split('.').length,4);}
 }
 for(const family of content.families){
  assert.equal(family.reviewStatus,'published');
  assert.ok(old.presets.some(p=>p.key===family.legacyProductType),family.code);
  assert.ok(family.industryCodes.every(i=>allowed.has(i)),family.code);
 }
});

test('feature phones have their own unit-serial policy, optional second IMEI and characteristic fields',()=>{
 const f=families.get('feature_phone');assert.ok(f);
 assert.equal(f.stockProfile,'serial');
 assert.deepEqual(f.identifiers,['imei','imei2?']);
 for(const key of ['model','keypadStyle','simSlots','fmRadio','torch','removableBattery','chargerConnector','memoryCardSupport'])assert.ok(f.fields.some(x=>x.key===key),key);
 assert.equal(f.fields.find(x=>x.key==='model').required,true);
 assert.equal(f.fields.find(x=>x.key==='networkGeneration').type,'enum');
 assert.ok(content.nodes.some(n=>n.selectable&&n.familyCode==='feature_phone'&&n.path.join('/').toLowerCase().includes('keypad')));
});

test('canonical manifest sync is enforced for backend browser and public/mobile clients',()=>{
 const stdout=execFileSync('python3',[path.join(root,'scripts/sync_electronics_catalogue_v2.py'),'--check'],{cwd:root,encoding:'utf8'});
 assert.match(stdout,/221 leaves/);
 const backend=fs.readFileSync(path.join(root,'backend/src/catalog/electronics-catalogue-v2.generated.ts'),'utf8');
 assert.equal(backend,fs.readFileSync(path.join(root,'lexa-frontend/src/domain/catalog/electronics-catalogue-v2.generated.ts'),'utf8'));
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'docs/contracts/public/electronics-catalogue-v2.json'),'utf8')),JSON.parse(fs.readFileSync(path.join(root,'lexa-frontend/public/catalog/electronics-catalogue-v2.json'),'utf8')));
});

test('taxonomy resolves aliases without guessing, permissions fail closed across industries',()=>{
 const policy=loadPolicy();
 const leaf=content.nodes.find(n=>n.selectable&&n.familyCode==='feature_phone');
 assert.equal(policy.taxonomyNode(leaf.code).code,leaf.code);
 assert.equal(policy.taxonomyNode(leaf.path.join(' > ')).code,leaf.code);
 for(const alias of leaf.aliases??[])assert.equal(policy.taxonomyNode(alias).code,leaf.code,alias);
 assert.equal(policy.industryEnabled(['mobile_phones'],['mobile_phones']),true);
 assert.equal(policy.industryEnabled(['mobile_phones'],['fashion_beauty']),false);
 assert.equal(policy.industryEnabled(['mobile_phones'],[]),false);
 assert.throws(()=>policy.assertNodeEnabled(leaf,['education']));
 assert.doesNotThrow(()=>policy.assertNodeEnabled(leaf,['mobile_phones']));
 assert.throws(()=>policy.taxonomyNode('ELEC.NOT_REAL.MISSING'));
});

test('typed specification validation enforces requiredness, enum, units and safe legacy compatibility',()=>{
 const policy=loadPolicy();
 const phone=policy.familyPolicy('feature_phone');
 assert.deepEqual({...policy.validateFamilySpecifications({model:'itel 2160',fmRadio:true,simSlots:2,keypadStyle:'standard'},phone)},
 {model:'itel 2160',fmRadio:true,simSlots:2,keypadStyle:'standard'});
 assert.throws(()=>policy.validateFamilySpecifications({fmRadio:true},phone),/model is required/);
 assert.throws(()=>policy.validateFamilySpecifications({model:'X',keypadStyle:'invented'},phone),/published enumeration/);
 assert.throws(()=>policy.validateFamilySpecifications({model:'X',batteryMah:-200},phone),/non-negative/);
 assert.throws(()=>policy.validateFamilySpecifications({model:'X',fmRadio:'true'},phone),/true or false/);
 assert.throws(()=>policy.validateFamilySpecifications({model:'X',metadata:{injected:true}},phone),/not published/);
 assert.doesNotThrow(()=>policy.validateFamilySpecifications({model:'X'},phone));
 assert.doesNotThrow(()=>policy.validateFamilySpecifications({},phone,{required:false}));
 assert.throws(()=>policy.assertModelFamilyProductType(phone,'smartphone'));
 assert.doesNotThrow(()=>policy.assertModelFamilyProductType(phone,'feature_phone'));
 assert.throws(()=>policy.validateSourceProvenance({sourceUrl:'http://untrusted.test'}),/HTTPS/);
});

test('database migration is additive with tenant RLS, aliases, immutable revisions and seeded policies',()=>{
 for(const table of ['catalog_category_aliases','catalog_brand_aliases','catalog_brand_merge_proposals','catalog_model_spec_revisions','catalog_family_policies']){
  assert.match(sql,new RegExp(`CREATE TABLE public\\.${table}\\s*\\(`));
  assert.match(schema,new RegExp(`@@map\\("${table}"\\)`));
 }
 assert.match(sql,/FOREACH t IN ARRAY ARRAY\['catalog_category_aliases'/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/FORCE ROW LEVEL SECURITY/);
 assert.match(sql,/NEW\.normalized_alias<>normalized/);
 assert.match(sql,/catalog_model_versions_append_only/);
 assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE) TABLE\s+(?:public\.)?(?:products|categories|catalog_brands|inventory_serials|inventory_lots)\b/i);
 assert.doesNotMatch(sql,/UPDATE\s+public\.(?:products|categories|stock_movements|inventory_serials)\b/i);
 assert.equal((sql.match(/INSERT INTO public\.catalog_family_policies\(/g)??[]).length,content.families.length);
 for(const f of content.families){const value=JSON.stringify(f,Object.keys(f).sort());assert.match(sql,new RegExp(`VALUES \\('${f.code}',${f.policyVersion},`));}
 for(const field of ['catalogCode','taxonomyVersion','familyCode','referenceSpecs','referenceVersion','provenance','reviewStatus'])assert.ok(schema.includes(field),field);
});

test('V2 API validates tenant membership, write permissions and explicit change approval',()=>{
 assert.match(controller,/member\.status!=='ACTIVE'/);
 assert.match(controller,/hasPermission\(member\.role,'catalog\.read'\)/);
 assert.match(controller,/hasPermission\(member\.role,'catalog\.write'\)/);
 assert.match(controller,/hasPermission\(member\.role,'inventory\.approve'\)/);
 assert.match(controller,/if\(!target\.selectable/);
 assert.match(controller,/An uncoded category already occupies this path/);
 assert.match(controller,/link-existing/);
 assert.match(controller,/existingProductsModified:0/);
 assert.match(controller,/rowsMerged:0/);
 assert.match(controller,/validation|validateFamilySpecifications/);
 assert.match(controller,/catalogModelSpecRevision\.create/);
 assert.match(controller,/isolationLevel:'Serializable'/);
});

test('explicit import plan defaults to dry-run and preserves old ID for linking',()=>{
 const data=JSON.parse(execFileSync('python3',[path.join(root,'scripts/plan_electronics_category_import.py'),'--codes','ELEC.MOB.FEATURE.GSM'],{cwd:root,encoding:'utf8'}));
 assert.equal(data.previewCount,1);
 assert.equal(data.preview[0].action,'adopt_new_with_approval');
 assert.equal(data.preview[0].changesToExistingProducts,0);
});
