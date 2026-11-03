import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('Render starts only after the serialized migration coordinator passes', () => {
 const docker = read('../Dockerfile');
 assert.match(docker, /node scripts\/migrate-with-guard\.mjs && exec node dist\/src\/main\.js/);
 assert.doesNotMatch(docker, /npx prisma migrate deploy/);
 assert.equal(JSON.parse(read('../package.json')).scripts['db:migrate:deploy'], 'node scripts/migrate-with-guard.mjs');
});

test('the migration guard uses the direct Neon database with a separate exclusive lock', () => {
 const source = read('../scripts/migrate-with-guard.mjs');
 assert.match(source, /DATABASE_URL_UNPOOLED/);
 assert.match(source, /host\.includes\('-pooler'\)/);
 assert.match(source, /GUARD_LOCK_ID = 72707370/);
 assert.match(source, /pg_try_advisory_lock/);
 assert.match(source, /pg_advisory_unlock/);
 assert.match(source, /WAIT_LIMIT_MS = 120_000/);
 assert.match(source, /await db\.connect\(\)/);
});

test('legacy Prisma lock override applies ONLY within guarded migration children', () => {
 const source = read('../scripts/migrate-with-guard.mjs');
 assert.match(source, /PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: '1'/);
 assert.match(source, /recover-known-failed-migration\.mjs/);
 assert.match(source, /\['migrate', 'deploy'\]/);
 assert.ok(source.indexOf('lockHeld = true') < source.indexOf('await run(process.execPath'));
 assert.ok(source.indexOf("['migrate', 'deploy']") < source.lastIndexOf('pg_advisory_unlock'));
 assert.doesNotMatch(read('../Dockerfile'), /PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=/);
});

test('the fix never resets migrations, deletes business data, or terminates production sessions', () => {
 const source = read('../scripts/migrate-with-guard.mjs');
 assert.doesNotMatch(source, /pg_terminate_backend|DROP DATABASE|migrate reset|db push/);
});
