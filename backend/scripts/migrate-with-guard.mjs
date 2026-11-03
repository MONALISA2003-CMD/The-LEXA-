#!/usr/bin/env node
/**
 * LEXA's single-writer Prisma migration coordinator.
 *
 * Why: On Neon a stale pgBouncer-backed session can retain Prisma's default
 * advisory lock (72707369) long after a deployment. Prisma times out after
 * 10 seconds and does not allow configuring that timeout.
 *
 * This coordinator owns a distinct, direct-connection PostgreSQL session lock.
 * Prisma's *own* lock is suppressed for this child process only. Never set
 * PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK globally on the application service:
 * the direct-connection lock below replaces that concurrency safeguard.
 *
 * Both migration recovery and migrate deploy execute while the guard is held.
 * The guard releases automatically if the process crashes or the connection
 * drops, and the API starts only after migration success.
 */
import { spawn } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;
const GUARD_LOCK_ID = 72707370; // Deliberately NOT Prisma's stranded 72707369.
const WAIT_LIMIT_MS = 120_000;
const WAIT_INTERVAL_MS = 1_500;
const directUrl = process.env.DATABASE_URL_UNPOOLED;

if (!directUrl) {
  console.error('[migration] DATABASE_URL_UNPOOLED is required for the direct Neon migration connection.');
  process.exit(2);
}
let host;
try {
  host = new URL(directUrl).hostname;
} catch {
  console.error('[migration] The direct database connection string is invalid.');
  process.exit(2);
}
if (host.includes('-pooler')) {
  console.error('[migration] DATABASE_URL_UNPOOLED must use a direct Neon hostname without -pooler.');
  process.exit(2);
}

const db = new Client({
  connectionString: directUrl,
  application_name: 'lexa-migration-coordinator',
  connectionTimeoutMillis: 15_000,
  keepAlive: true,
});
let lockHeld = false;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run(executable, arguments_, env) {
  console.log('[migration] Starting ' + arguments_.join(' '));
  return new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, { env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) return resolve();
      reject(new Error('Migration command failed with status ' + (code ?? signal ?? 'unknown')));
    });
  });
}

try {
  await db.connect();

  // A session-level lock is intentional: the same connection remains open
  // until the entire migration workflow has exited.
  const started = Date.now();
  while (Date.now() - started < WAIT_LIMIT_MS) {
    const result = await db.query(
      'SELECT pg_try_advisory_lock($1::bigint) AS acquired',
      [GUARD_LOCK_ID],
    );
    if (result.rows[0]?.acquired === true) {
      lockHeld = true;
      break;
    }
    console.warn('[migration] Another LEXA migration owns the deployment guard. Waiting...');
    await delay(WAIT_INTERVAL_MS);
  }

  if (!lockHeld) {
    throw new Error('Could not acquire the exclusive LEXA migration guard within 120 seconds. A separate migration is already running.');
  }

  // Only migration child processes receive this scoped override. The separate
  // PostgreSQL guard above still blocks simultaneous migration writers.
  const childEnv = {
    ...process.env,
    PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: '1',
  };

  console.log('[migration] Exclusive direct-database migration guard acquired.');
  await run(process.execPath, ['scripts/recover-known-failed-migration.mjs'], childEnv);
  await run('node_modules/.bin/prisma', ['migrate', 'deploy'], childEnv);
  console.log('[migration] Prisma migrations verified. Starting the API.');
} catch (error) {
  // Intentionally do not log database connection strings, secrets or query
  // payloads from the underlying driver.
  console.error('[migration] Startup aborted safely:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
} finally {
  if (lockHeld) {
    try {
      await db.query('SELECT pg_advisory_unlock($1::bigint)', [GUARD_LOCK_ID]);
      console.log('[migration] Deployment guard released.');
    } catch {
      // PostgreSQL releases the session-level lock when the connection closes.
      console.warn('[migration] Explicit release unavailable; the session will close.');
    }
  }
  await db.end().catch(() => {});
}

