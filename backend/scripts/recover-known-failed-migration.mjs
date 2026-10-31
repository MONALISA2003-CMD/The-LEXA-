import { spawnSync } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;
const migrationName = '20261030320000_platform_catalog_finance_rls';
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is required for the migration recovery preflight.');
  process.exit(2);
}

const client = new Client({ connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 15_000 });
let shouldResolve = false;

try {
  await client.connect();
  const state = await client.query(`
    SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS migration_table_exists
  `);

  if (state.rows[0]?.migration_table_exists) {
    const failed = await client.query(
      `SELECT 1
         FROM public._prisma_migrations
        WHERE migration_name = $1
          AND started_at IS NOT NULL
          AND finished_at IS NULL
          AND rolled_back_at IS NULL
        LIMIT 1`,
      [migrationName],
    );
    shouldResolve = failed.rowCount > 0;
  }
} catch (error) {
  // Do not print connection details; let the deploy fail clearly if the DB cannot be checked.
  console.error(`Migration recovery preflight failed (${error?.code ?? 'database_error'}).`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

if (process.exitCode) process.exit(process.exitCode);
if (!shouldResolve) {
  console.log('No known failed migration needs recovery.');
} else {
  console.warn(`Recovering the confirmed failed migration ${migrationName} after its SQL correction.`);
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
