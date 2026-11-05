import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = source('../prisma/migrations/20261105170000_inventory_receipts_identifiers_fitment_bundles/migration.sql');
const recovery = source('../scripts/recover-known-failed-migration.mjs');

test('legacy identifier backfill qualifies the serial owner when joining products', () => {
  assert.match(migration, /SELECT s\.tenant_id\s*,\s*s\.id AS serial_id/);
  assert.doesNotMatch(migration, /SELECT tenant_id\s*,\s*id AS serial_id/);
  assert.match(migration, /PARTITION BY tenant_id\s*,\s*upper\(value\)/);
});

test('bundle component ownership uses a declared tenant-scoped composite key', () => {
  const definition = migration.match(/CREATE TABLE public\.product_bundles\(([\s\S]*?)\);/);
  assert.ok(definition, 'bundle table must be present');
  assert.match(definition[1], /UNIQUE\(tenant_id,id\)/);
  assert.match(migration, /FOREIGN KEY\(tenant_id,bundle_id\) REFERENCES public\.product_bundles\(tenant_id,id\)/);
});

test('failed receipt migration is retried only after proving no partial schema is present', () => {
  assert.match(recovery, /20261105170000_inventory_receipts_identifiers_fitment_bundles/);
  assert.match(recovery, /expectedAbsentTables/);
  assert.match(recovery, /inventory_unit_identifiers/);
  assert.match(recovery, /product_bundles/);
  assert.match(recovery, /expectedAbsentColumns/);
  assert.match(recovery, /receipt_batch_id/);
  assert.match(recovery, /to_regclass/);
  assert.match(recovery, /information_schema\.columns/);
  assert.match(recovery, /partial schema changes detected/);
  assert.match(recovery, /--rolled-back/);
  assert.doesNotMatch(recovery, /migrate reset|db push|DROP TABLE|DELETE FROM public\._prisma_migrations/);
});
