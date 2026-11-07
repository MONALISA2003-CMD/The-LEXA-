import { spawnSync } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;
const recoverableMigrations = [
  '20261030320000_platform_catalog_finance_rls',
  '20261105170000_inventory_receipts_identifiers_fitment_bundles',
  '20261111100000_isolated_demo_sessions',
];
const demoMigration = '20261111100000_isolated_demo_sessions';
const receiptsMigration = '20261105170000_inventory_receipts_identifiers_fitment_bundles';
const connectionString = process.env.DATABASE_URL_UNPOOLED;

if (!connectionString) {
  console.error('DATABASE_URL_UNPOOLED (direct Neon connection) is required for the migration recovery preflight.');
  process.exit(2);
}

// The inventory migration was observed to roll back fully on PostgreSQL.
// The recovery must fail closed if the actual database state ever differs.
const expectedAbsentTables = [
  'inventory_unit_identifiers',
  'inventory_receipt_batches',
  'catalog_product_aliases',
  'package_conversion_revisions',
  'product_bundles',
  'product_bundle_components',
];
const expectedAbsentColumns = [
  'products.gtin',
  'product_variants.gtin',
  'product_variants.variant_signature',
  'product_packages.gtin',
  'inventory_serials.warehouse_id',
  'inventory_serials.receipt_batch_id',
  'inventory_serials.unit_cost_minor',
  'inventory_serials.accepted_at',
  'accessory_compatibilities.compatibility_kind',
  'accessory_compatibilities.evidence',
  'accessory_compatibilities.review_state',
  'accessory_compatibilities.revoked_at',
];

async function assertInventoryMigrationRolledBack(client) {
  const result = await client.query(`
    SELECT
      ARRAY(
        SELECT candidate.name FROM unnest($1::text[]) AS candidate(name)
        WHERE to_regclass('public.' || quote_ident(candidate.name)) IS NOT NULL
      ) AS existing_tables,
      ARRAY(
        SELECT c.table_name || '.' || c.column_name
        FROM information_schema.columns AS c
        WHERE c.table_schema = 'public'
          AND (c.table_name || '.' || c.column_name) = ANY($2::text[])
      ) AS existing_columns
  `, [expectedAbsentTables, expectedAbsentColumns]);
  const { existing_tables: tables = [], existing_columns: columns = [] } = result.rows[0] ?? {};
  if (tables.length || columns.length) {
    console.error('[migration] Inventory migration recovery refused: partial schema changes detected.');
    console.error('[migration] Existing tables:', tables.join(', ') || '(none)');
    console.error('[migration] Existing columns:', columns.join(', ') || '(none)');
    throw new Error('Database requires manual review before a failed inventory migration can be retried.');
  }
  console.log('[migration] Inventory migration recovery preflight confirmed no partial schema changes.');
}

/**
 * Production deployment recovery for the 7 Nov 2026 SQLSTATE 42601 incident.
 * The recorded migration failed while parsing a CREATE POLICY, and the live
 * production schema was verified to contain NONE of this migration's objects.
 * Prisma v7 then reports P3009 on every subsequent deployment until that
 * failed history entry is marked rolled-back. This check never discards data.
 *
 * Fail closed if any table, index, policy, function or other database state
 * suggests the migration applied partially, or if the failure was NOT the
 * exact reviewed syntax error. A human must investigate other failures.
 */
async function assertDemoMigrationRolledBack(client) {
  const failure = await client.query(`
    SELECT logs FROM public._prisma_migrations
    WHERE migration_name = $1
      AND started_at IS NOT NULL AND finished_at IS NULL AND rolled_back_at IS NULL
    ORDER BY started_at DESC LIMIT 2
  `, [demoMigration]);
  const log = failure.rows[0]?.logs;
  if (failure.rows.length !== 1 || typeof log !== 'string' ||
      !log.includes('Database error code: 42601') ||
      !log.includes('syntax error at or near')) {
    throw new Error('Demo migration recovery refused: failed history is not the reviewed SQLSTATE 42601 incident.');
  }
  const state = await client.query(`
    SELECT
      to_regclass('public.demo_sessions') AS demo_sessions_table,
      to_regprocedure('public.lexa_demo_assert_start_limit(text,integer)') AS start_limit_function,
      to_regprocedure('public.lexa_demo_purge_expired(integer)') AS purge_function,
      EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'platform_subscriptions'
          AND policyname = 'demo_subscription_temporary_activation'
      ) AS subscription_policy
  `);
  const actual = state.rows[0] ?? {};
  if (actual.demo_sessions_table || actual.start_limit_function ||
      actual.purge_function || actual.subscription_policy) {
    throw new Error('Demo migration recovery refused: partial schema changes detected; manual review required.');
  }
  console.log('[migration] Reviewed demo SQLSTATE 42601 history and confirmed no demo migration objects exist.');
}

const client = new Client({ connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 15_000 });
let failedNames = [];

try {
  await client.connect();
  const state = await client.query(`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS migration_table_exists`);
  if (state.rows[0]?.migration_table_exists) {
    const failed = await client.query(`
      SELECT migration_name FROM public._prisma_migrations
      WHERE migration_name = ANY($1::text[])
        AND started_at IS NOT NULL AND finished_at IS NULL AND rolled_back_at IS NULL
      GROUP BY migration_name
    `, [recoverableMigrations]);
    failedNames = failed.rows.map(row => row.migration_name);
    if (failedNames.includes(receiptsMigration)) await assertInventoryMigrationRolledBack(client);
    if (failedNames.includes(demoMigration)) await assertDemoMigrationRolledBack(client);
  }
} catch (error) {
  console.error(`Migration recovery preflight failed (${error?.code ?? 'database_error'}).`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

if (process.exitCode) process.exit(process.exitCode);
if (failedNames.length === 0) {
  console.log('No known failed migration needs recovery.');
} else {
  for (const migrationName of recoverableMigrations.filter(name => failedNames.includes(name))) {
    console.warn(`Recovering confirmed failed migration ${migrationName} after checking its prerequisites.`);
    const result = spawnSync('npx', ['prisma', 'migrate', 'resolve', '--rolled-back', migrationName], {
      stdio: 'inherit',
      env: process.env,
    });
    if (result.error) {
      console.error('Could not start Prisma migration recovery.');
      process.exit(1);
    }
    if (result.status !== 0) {
      console.error(`Prisma could not mark ${migrationName} as rolled back; stopping startup.`);
      process.exit(result.status ?? 1);
    }
    console.log(`Confirmed failed migration ${migrationName} marked rolled back; Prisma can now retry it.`);
  }
}
