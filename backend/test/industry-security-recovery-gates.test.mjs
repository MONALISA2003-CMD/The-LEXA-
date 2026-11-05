import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {availableIndustryCodes,normaliseSavedIndustries,selectIndustries} from '../src/business-setup/business-setup.rules.ts';
import {hasPermission,permissionForRequest,canAccessBranch} from '../src/authorization/role-policy.ts';
import {RECOVERY_CATALOG_TABLES,catalogBackupRowCounts,assertRestoredCatalogIntegrity} from '../src/platform/catalog-recovery-integrity.ts';
import {PRODUCT_PRESETS,INDUSTRY_OPTIONS,validateProductDraft,suggestedCategoryPaths} from '../../lexa-frontend/src/domain/catalog/industryCatalog.ts';
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const base='/api/v1/workspaces/workspace-1/branches/branch-1';

const allow={
 owner:['workspace.manage','catalog.write','inventory.write','sales.write','procurement.receive','finance.write'],
 manager:['catalog.write','inventory.write','sales.write','procurement.receive'],
 cashier:['sales.write','inventory.read','catalog.read'],
 inventory_operator:['inventory.write','procurement.receive','catalog.write'],
 warehouse_operator:['inventory.write','procurement.receive'],
 technician:['support.assigned.read','support.assigned.write','inventory.read','catalog.read'],
};
const deny={
 manager:['workspace.manage','finance.write','people.private.read'],
 cashier:['inventory.write','procurement.receive','catalog.write','finance.write','workspace.manage'],
 inventory_operator:['sales.write','finance.write','workspace.manage'],
 warehouse_operator:['catalog.write','sales.write','finance.write'],
 technician:['support.write','inventory.write','sales.write','finance.write','workspace.manage','catalog.write'],
};
test('owner, manager, cashier, storekeeper, warehouse operator, technician capabilities fail closed',()=>{
 for(const [role,grants] of Object.entries(allow))for(const p of grants)assert.equal(hasPermission(role,p),true,`${role} should receive ${p}`);
 for(const [role,rejects] of Object.entries(deny))for(const p of rejects)assert.equal(hasPermission(role,p),false,`${role} must not receive ${p}`);
 assert.equal(hasPermission('technician_admin','inventory.write'),false);
 assert.match(source('../src/authorization/employee-role-catalog.ts'),/technician:\s*\{label: 'Repair technician'/);
 assert.equal(canAccessBranch('technician','restricted',false),false);
 assert.equal(canAccessBranch('technician','restricted',true),true);
 assert.equal(canAccessBranch('owner','restricted',false),true);
});
test('direct API routes cannot be used to bypass role boundaries',()=>{
 const paths=[
  ['POST',`${base}/sales`,'sales.write','cashier',true],
  ['POST',`${base}/inventory/serials`,'inventory.write','cashier',false],
  ['POST',`${base}/inventory/lots`,'inventory.write','technician',false],
  ['GET',`${base}/inventory/serials/lookup`,'inventory.read','technician',true],
  ['PATCH',`${base}/workstream6/support/my-cases/a`,'support.assigned.write','technician',true],
  ['PATCH',`${base}/workstream6/support/cases/a`,'support.write','technician',false],
  ['POST',`${base}/platform/jobs/restore`,'workspace.manage','manager',false],
  ['POST',`${base}/platform/jobs/import`,'catalog.write','cashier',false],
  ['POST',`${base}/commerce/purchase-orders/123/receipts`,'procurement.receive','inventory_operator',true],
 ];
 for(const [method,url,permission,role,allowed] of paths){
  assert.equal(permissionForRequest(method,url),permission,`${method} ${url}`);
  assert.equal(hasPermission(role,permission),allowed,`${role} ${url}`);
 }
 const guard=source('../src/authorization/tenant-authorization.guard.ts');
 assert.match(guard,/membership\.status !== 'ACTIVE'/);
 assert.match(guard,/canAccessBranch\(membership\.role/);
 assert.match(guard,/hasPermission\(membership\.role, permission\)/);
 const assigned=source('../src/people-projects/people-projects.controller.ts');
 assert.match(assigned,/assigned_employee_id=\$\{employeeId\}::uuid FOR UPDATE/);
});
test('technician frontend uses assigned-work panel, not global support module',()=>{
 const panel=source('../../lexa-frontend/src/modules/dashboard/EmployeeWorkPanel.tsx');
 const staff=source('../../lexa-frontend/src/modules/dashboard/StaffDashboard.tsx');
 const nav=source('../../lexa-frontend/src/domain/shared/staffNavigation.ts');
 assert.match(panel,/role==='field_agent'\|\|role==='technician'/);
 assert.match(staff,/access\.role==='technician'/);
 assert.match(nav,/technician:\['\/products','\/inventory'\]/);
 assert.doesNotMatch(nav,/technician:\[[^\n]*\/modules\/support/);
});
test('queued product and variant imports reject reassignment after preview',()=>{
 const worker=source('../src/platform/platform-jobs.ts');
 assert.match(worker,/WHERE \(products\.product_type IS NULL OR products\.product_type=EXCLUDED\.product_type\)/);
 assert.match(worker,/NOT EXISTS \(SELECT 1 FROM stock_movements sm/);
 assert.match(worker,/products\.track_serial=EXCLUDED\.track_serial/);
 assert.match(worker,/WHERE product_variants\.product_id=EXCLUDED\.product_id/);
 assert.match(worker,/Category no longer exists at CSV apply time/);
 assert.match(worker,/product type or existing stock tracking policy changed/i);
 assert.match(worker,/Business industry selection changed since import preview/);
 assert.match(worker,/validateVariantDimensions\(p\.rows\[0\]\.product_type,attrs\)/);
});
test('old and mixed-industry accounts retain history but do not regain retired selections',()=>{
 assert.equal(availableIndustryCodes.length,13);
 assert.deepEqual(normaliseSavedIndustries(['agriculture','mobile_phones','healthcare']),['mobile_phones']);
 assert.deepEqual(normaliseSavedIndustries(['healthcare']),['other']);
 assert.throws(()=>selectIndustries(['manufacturing']));
 const migration=source('../prisma/migrations/20261104170000_retail_catalogue_hierarchy_retirement/migration.sql');
 assert.match(migration,/business_profiles/);
 assert.doesNotMatch(migration,/(?:DELETE\s+FROM|TRUNCATE\s+(?:TABLE\s+)?|DROP\s+TABLE)\s+(?:products|sales|inventory_serials|stock_movements)/i);
});
function manifestFixture(override={}){
 const tables=RECOVERY_CATALOG_TABLES.map(table=>({table,part:0,rows:0,artifact:null}));
 return {complete:true,tables,...override};
}
test('recovery requires all category/product/variant/serial/lot/stock/sale tables, even when empty',()=>{
 const manifest=manifestFixture();
 const counts=catalogBackupRowCounts(manifest);
 assert.equal(counts.size,RECOVERY_CATALOG_TABLES.length);
 for(const key of RECOVERY_CATALOG_TABLES)assert.equal(counts.get(key),0);
 assert.throws(()=>catalogBackupRowCounts(manifestFixture({tables:manifest.tables.filter(p=>p.table!=='inventory_serials')})),/inventory_serials/);
 assert.throws(()=>catalogBackupRowCounts(manifestFixture({tables:[...manifest.tables,{table:'products',part:0,rows:0}]})),/Duplicate backup chunk|Empty placeholder/);
 assert.throws(()=>catalogBackupRowCounts(manifestFixture({tables:manifest.tables.map(p=>p.table==='products'?{table:p.table,part:1,rows:2}:p)})),/Missing backup artifact/);
 assert.throws(()=>catalogBackupRowCounts(manifestFixture({tables:[...manifest.tables.filter(p=>p.table!=='products'),{table:'products',part:2,rows:1,artifact:{key:'parts2'}},{table:'products',part:3,rows:1,artifact:{key:'parts3'}}]})),/missing or unordered chunks/);
});
test('actual restore transaction independently checks counts and tenant-scoped relation integrity',async()=>{
 const manifest=manifestFixture({tables:RECOVERY_CATALOG_TABLES.map(table=>({table,part:1,rows:1,artifact:{key:`${table}.aesgcm`}}))});
 const statements=[];
 const db={query:async(sql,params)=>{statements.push({sql,params});return {rows:[{n:sql.includes('COUNT(*)::int AS n FROM "')?1:0}]};}};
 const result=await assertRestoredCatalogIntegrity(db,'workspace-fixture',manifest);
 assert.equal(result.checkedTables,RECOVERY_CATALOG_TABLES.length);
 assert.equal(result.referenceAudits,11);
 assert.ok(statements.every(x=>x.params.length===1&&x.params[0]==='workspace-fixture'));
 const wrongCount={query:async()=>({rows:[{n:0}]})};
 await assert.rejects(()=>assertRestoredCatalogIntegrity(wrongCount,'workspace-fixture',manifest),/count mismatch/);
 let call=0;
 const broken={query:async(sql)=>({rows:[{n:sql.includes('COUNT(*)::int AS n FROM "')?1:(++call===1?1:0)}]})};
 await assert.rejects(()=>assertRestoredCatalogIntegrity(broken,'workspace-fixture',manifest),/broken links/);
 const jobs=source('../src/platform/platform-jobs.ts');
 assert.match(jobs,/const catalogRecovery=await assertRestoredCatalogIntegrity\(c,String\(j\.tenant_id\),manifest\);\s*await c\.query\('COMMIT'\)/);
 assert.match(jobs,/catalogBackupRowCounts\(manifest\)/);
});
test('all thirteen industry templates have executable form acceptance and real category depth',()=>{
 assert.deepEqual(availableIndustryCodes,[...INDUSTRY_OPTIONS.map(([code])=>code)]);
 const manifest=JSON.parse(source('../src/catalog/industry-manifest.json'));
 for(const industry of availableIndustryCodes){
  const allowed=PRODUCT_PRESETS.filter(p=>p.industries.includes(industry)&&p.key!=='general');
  assert.ok(allowed.length>=1,industry);
  assert.ok(suggestedCategoryPaths([industry]).some(path=>path.length>=2),industry);
  let validated=0;
  for(const preset of allowed){
   const attributes=Object.fromEntries(preset.fields.filter(f=>f.required).map(field=>[field.key,field.kind==='number'?'1':field.options?.[0]??'Sample']));
   const tracking={trackStock:preset.stock!=='none',trackSerial:preset.stock==='serial',trackLot:preset.stock==='batch'};
   assert.deepEqual(validateProductDraft(preset.key,attributes,tracking,[industry]),[],`${industry}/${preset.key}`);
   if(preset.stock==='serial')assert.ok(validateProductDraft(preset.key,attributes,{...tracking,trackSerial:false},[industry]).length>0);
   if(preset.stock==='batch')assert.ok(validateProductDraft(preset.key,attributes,{...tracking,trackLot:false},[industry]).length>0);
   if(preset.stock==='none')assert.ok(validateProductDraft(preset.key,attributes,{...tracking,trackStock:true},[industry]).length>0);
   validated++;
  }
  assert.ok(validated>0,industry);
  assert.ok(manifest.industries.some(x=>x.code===industry));
 }
});

test('existing-account release gate proves identity and history retention across before/after snapshots',async()=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {spawnSync}=await import('node:child_process');
 const tmp=mkdtempSync(join(tmpdir(),'lexa-history-gate-'));
 try{
  const sql=source('../scripts/capture-catalog-history.mjs');
  const tableMatch=sql.match(/const TABLES = \[([\s\S]*?)\];/);
  assert.ok(tableMatch);
  const names=[...tableMatch[1].matchAll(/'([a-z_]+)'/g)].map(x=>x[1]);
  assert.ok(names.includes('products')&&names.includes('inventory_serials')&&names.includes('sale_return_lines'));
  const base={schemaVersion:1,tenantHash:'test-business',tables:Object.fromEntries(names.map(name=>[name,{count:2,sha256:`sample-${name}`}]))};
  const a=join(tmp,'before.json'),b=join(tmp,'after.json');
  writeFileSync(a,JSON.stringify(base));writeFileSync(b,JSON.stringify(base));
  const cli=join(process.cwd(),'scripts','capture-catalog-history.mjs');
  let x=spawnSync(process.execPath,[cli,'compare',a,b],{encoding:'utf8'});
  assert.equal(x.status,0,x.stderr);
  base.tables.inventory_serials.sha256='different-record-payload';writeFileSync(b,JSON.stringify(base));
  x=spawnSync(process.execPath,[cli,'compare',a,b],{encoding:'utf8'});
  assert.notEqual(x.status,0,'Changed serial history must block release');
  assert.match(x.stderr,/Historical business data changed in inventory_serials/);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});
