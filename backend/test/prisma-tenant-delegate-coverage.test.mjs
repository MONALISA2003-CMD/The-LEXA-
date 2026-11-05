import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const src=path.join(root,'backend/src');
const service=fs.readFileSync(path.join(src,'prisma/prisma.service.ts'),'utf8');
const schema=fs.readFileSync(path.join(root,'backend/prisma/schema.prisma'),'utf8');
const block=service.split('const MODEL_DELEGATES = new Set([')[1]?.split(']);')[0];
const included=new Set([...block.matchAll(/'([A-Za-z][A-Za-z0-9]*)'/g)].map(m=>m[1]));
const prismaModels=new Set([...schema.matchAll(/^model\s+([A-Za-z][A-Za-z0-9]*)\s*\{/gm)].map(m=>m[1][0].toLowerCase()+m[1].slice(1)));
function filesUnder(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(e=>e.isDirectory()?filesUnder(path.join(folder,e.name)):e.name.endsWith('.ts')?[path.join(folder,e.name)]:[]);}

test('all directly used Prisma model delegates receive transaction-scoped tenant and runtime role context',()=>{
 assert.match(service,/app\.tenant_id/);assert.match(service,/runInTenantTransaction/);
 assert.match(service,/MODEL_DELEGATES\.has\(property\)/);
 const missing=[];let checked=0;
 for(const file of filesUnder(src)){
  const content=fs.readFileSync(file,'utf8');
  for(const match of content.matchAll(/\bthis\.prisma\.([A-Za-z][A-Za-z0-9]*)\./g)){
   if(!prismaModels.has(match[1]))continue;
   checked++;
   if(!included.has(match[1]))missing.push(`${path.relative(src,file)}: ${match[1]}`);
  }
 }
 assert.ok(checked>100,'Should cover controllers that use tenant-owned models');
 assert.deepEqual(missing,[],'Unwrapped Prisma delegates can bypass tenant-local SET ROLE and RLS context');
});

test('electronics, catalogue reference and package models are registered for RLS-scoped direct reads',()=>{
 for(const model of ['productPackage','catalogBrand','catalogDeviceModel','accessoryCompatibility',
  'inventoryUnitInspection','catalogCategoryAlias','catalogBrandAlias','catalogBrandMergeProposal',
  'catalogModelSpecRevision','catalogFamilyPolicy']){
  assert.ok(prismaModels.has(model),`Prisma schema missing ${model}`);
  assert.ok(included.has(model),`Tenant DB context wrapper missing ${model}`);
 }
});
