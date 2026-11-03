import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertNoRoleStartupOption, withTenantTransactionPool } from '../src/platform/tenant-pool.ts';

function fakePool({ failOn } = {}) {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql: typeof sql === 'string' ? sql : sql.text, values });
      if (failOn && (typeof sql === 'string' ? sql : sql.text).includes(failOn)) throw new Error('query failed');
      return { rows: [{ ok: true }], rowCount: 1 };
    },
    release(error) { calls.push({ release: true, error: Boolean(error) }); },
  };
  return { calls, pool: { async connect() { return client; } } };
}

test('pool query applies runtime role before tenant context inside a transaction', async () => {
  process.env.DATABASE_RUNTIME_ROLE = 'lexa_app_runtime';
  const fake = fakePool();
  const scoped = withTenantTransactionPool(fake.pool, 'tenant-a');
  await scoped.query('SELECT 1');
  assert.deepEqual(fake.calls.map((x) => x.sql || (x.release ? 'RELEASE' : '')), [
    'BEGIN',
    "SELECT set_config('role', $1, true)",
    "SELECT set_config('app.tenant_id', $1, true)",
    'SELECT 1',
    'COMMIT',
    'RELEASE',
  ]);
  assert.deepEqual(fake.calls[1].values, ['lexa_app_runtime']);
  assert.deepEqual(fake.calls[2].values, ['tenant-a']);
});

test('client explicit transactions receive context immediately after BEGIN', async () => {
  process.env.DATABASE_RUNTIME_ROLE = 'lexa_app_runtime';
  const fake = fakePool();
  const scoped = withTenantTransactionPool(fake.pool, 'tenant-b');
  const client = await scoped.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query('SELECT current_user');
  await client.query('COMMIT');
  client.release();
  assert.deepEqual(fake.calls.map((x) => x.sql || (x.release ? 'RELEASE' : '')), [
    'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
    "SELECT set_config('role', $1, true)",
    "SELECT set_config('app.tenant_id', $1, true)",
    'SELECT current_user',
    'COMMIT',
    'RELEASE',
  ]);
});

test('standalone query errors are rolled back and client is released', async () => {
  process.env.DATABASE_RUNTIME_ROLE = 'lexa_app_runtime';
  const fake = fakePool({ failOn: 'SELECT broken' });
  const scoped = withTenantTransactionPool(fake.pool, 'tenant-c');
  await assert.rejects(() => scoped.query('SELECT broken'), /query failed/);
  assert.equal(fake.calls.some((x) => x.sql === 'ROLLBACK'), true);
  assert.equal(fake.calls.some((x) => x.release), true);
});

test('invalid or missing runtime role is rejected', () => {
  process.env.DATABASE_RUNTIME_ROLE = 'lexa_app';
  const fake = fakePool();
  assert.throws(() => withTenantTransactionPool(fake.pool, 'tenant-d'), /approved role lexa_app_runtime/);
});

test('role startup options are rejected but other PostgreSQL options are left alone', () => {
  assert.throws(
    () => assertNoRoleStartupOption('postgresql://user:pass@db.example/lexa?options=-c%20role%3Dlexa_app_runtime', 'DATABASE_URL'),
    /must not contain a PostgreSQL role startup option/,
  );
  assert.doesNotThrow(() => assertNoRoleStartupOption('postgresql://user:pass@db.example/lexa?options=-c%20search_path%3Dpublic', 'DATABASE_URL'));
});

test('Prisma service keeps pooled URL unchanged and applies the role before tenant/session context', async () => {
  const source = await readFile(new URL('../src/prisma/prisma.service.ts', import.meta.url), 'utf8');
  const setContextStart = source.indexOf('const setContext = async');
  const setContextEnd = source.indexOf('const runInTenantTransaction', setContextStart);
  assert.notEqual(setContextStart, -1);
  assert.notEqual(setContextEnd, -1);
  const setContext = source.slice(setContextStart, setContextEnd);
  const roleIndex = setContext.indexOf("set_config('role'");
  const tenantIndex = setContext.indexOf("set_config('app.tenant_id'");
  const userIndex = setContext.indexOf("set_config('app.user_id'");
  assert.ok(roleIndex >= 0 && roleIndex < tenantIndex && tenantIndex < userIndex);
  assert.match(setContext, /set_config\([^;]+, true\)/s);
  assert.match(source, /new PrismaPg\(\{ connectionString: configuredUrl \}\)/);
  assert.match(source, /DATABASE_URL must not contain a PostgreSQL role startup option/);
});
