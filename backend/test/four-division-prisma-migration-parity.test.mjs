import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../prisma/migrations/20261105090000_specialized_devices_brands_compatibility/migration.sql', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../src/core/core.controller.ts', import.meta.url), 'utf8');

/** Prevent a SQL-only column from reintroducing TS2353 and TS2339 after Prisma generate. */
test('four-division product manufacturer identifiers are reflected in generated Prisma model inputs', () => {
  const productModel = schema.match(/model Product \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(productModel, 'Product Prisma model must exist');
  for (const [field, column, index] of [
    ['catalogBrandId', 'catalog_brand_id', 'products_catalog_brand_idx'],
    ['catalogModelId', 'catalog_model_id', 'products_catalog_model_idx'],
  ]) {
    assert.match(productModel, new RegExp(`\\b${field}\\s+String\\?\\s+@map\\("${column}"\\)\\s+@db\\.Uuid`));
    assert.match(productModel, new RegExp(`@@index\\(\\[tenantId,\\s*${field}\\],\\s*map:\\s*"${index}"\\)`));
    assert.match(migration, new RegExp(`ALTER TABLE public\\.products ADD COLUMN IF NOT EXISTS ${column} uuid;`));
    assert.match(migration, new RegExp(`CREATE INDEX ${index} ON public\\.products\\(tenant_id,${column}\\);`));
    assert.match(controller, new RegExp(`existing\\.${field}\\b`));
    assert.match(controller, new RegExp(`${field}:catalogueIdentity\\.${field}`));
  }
});

test('generated RLS policy quotes tenant context correctly for all four new tables', () => {
  const policySql = migration.match(/EXECUTE format\(\s*'(CREATE POLICY tenant_scope[\s\S]*?)',\s*t\s*\);/)?.[1];
  assert.ok(policySql, 'New tables must have an explicit dynamic tenant-isolation policy');
  // Decode a standard SQL single-quoted literal; doubled quotes represent one quote.
  const rendered = policySql.replaceAll("''", "'").replaceAll('%I', 'catalog_brands');
  const predicate = "tenant_id::text = NULLIF(current_setting('app.tenant_id', true), '')";
  assert.match(rendered, /^CREATE POLICY tenant_scope ON public\.catalog_brands FOR ALL USING \(/);
  assert.equal(rendered.split(predicate).length - 1, 2, 'USING and WITH CHECK must both filter by the authenticated tenant');
  assert.ok(rendered.includes(`USING (${predicate}) WITH CHECK (${predicate})`));
  for (const table of ['catalog_brands', 'catalog_device_models', 'accessory_compatibilities', 'inventory_unit_inspections']) {
    assert.ok(migration.includes(`'${table}'`), `RLS loop must cover ${table}`);
  }
});

test('specialized retail migration is additive and preserves historical product and stock identifiers', () => {
  for (const table of ['catalog_brands', 'catalog_device_models', 'accessory_compatibilities', 'inventory_unit_inspections']) {
    assert.match(migration, new RegExp(`CREATE TABLE public\\.${table} \\(`));
  }
  assert.doesNotMatch(migration, /^\s*(?:DELETE\s+FROM|TRUNCATE|DROP\s+TABLE|UPDATE\s+(?:public\.)?(?:products|inventory_serials|stock_movements|sale_lines))\b/gim);
  assert.match(migration, /products_catalog_brand_tenant_fkey/);
  assert.match(migration, /products_catalog_model_tenant_fkey/);
});
