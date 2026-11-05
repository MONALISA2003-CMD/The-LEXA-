import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const schema=read('../prisma/schema.prisma');
const migration=read('../prisma/migrations/20261106010000_industry_operations/migration.sql');
const controller=read('../src/commerce/industry-operations.controller.ts');
const backup=JSON.parse(read('../backup/authoritative-inventory.json'));
const tables=['business_divisions','product_division_links','product_uom_conversions','inventory_formulas','inventory_formula_components','inventory_production_orders','inventory_production_inputs','measured_stock_cuts'];

test('Prisma and the additive database migration register every industry operations table',()=>{
 for(const table of tables){
  assert.match(schema,new RegExp(`@@map\\("${table}"\\)`),`Missing Prisma mapping for ${table}`);
  assert.match(migration,new RegExp(`CREATE TABLE public\\.${table} \\(`),`Missing migration for ${table}`);
  assert.ok(backup.some(x=>x.table===table&&x.disposition==='authoritative'),`Missing backup coverage for ${table}`);
 }
 assert.match(migration,/ALTER TABLE public\.sale_lines ADD COLUMN business_division_id uuid NULL/);
 assert.match(schema,/businessDivisionId\s+String\?\s+@map\("business_division_id"\)/);
});

test('new operational records have tenant RLS and immutable posting evidence',()=>{
 assert.match(migration,/FORCE ROW LEVEL SECURITY/);
 assert.match(migration,/current_setting\(''app\.tenant_id''/);
 assert.match(migration,/CREATE TRIGGER inventory_formula_guard/);
 assert.match(migration,/CREATE TRIGGER inventory_production_orders_guard/);
 assert.match(migration,/CREATE TRIGGER measured_stock_cuts_posted_immutable/);
 assert.match(migration,/product_division_one_primary_idx/);
 assert.match(migration,/UNIQUE\(tenant_id,idempotency_key\)/);
});

test('industry posting requires independent approval, enabled rollout and ledger journal',()=>{
 assert.match(controller,/industryOperationsV1/);
 assert.match(controller,/await this\.enabled\(t\)/);
 assert.match(controller,/createdByUserId===a\.userId/);
 assert.match(controller,/isolationLevel:'Serializable'/);
 assert.match(controller,/await postLedgerJournal/);
 assert.match(controller,/quantityOnHand:\{decrement:formatMilli/);
 assert.match(controller,/industry\.production\.completed/);
});
