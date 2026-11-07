import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkSqlStructure } from '../scripts/check-migration-sql-structure.mjs';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = source('../prisma/migrations/20261111100000_isolated_demo_sessions/migration.sql');
const recovery = source('../scripts/recover-known-failed-migration.mjs');

test('the actual failed demo migration has balanced SQL expressions and the documented syntax regression is rejected', () => {
  assert.doesNotThrow(() => checkSqlStructure(migration));
  const correct = "AND d.user_id::text=NULLIF(current_setting('app.user_id',true),'')));";
  assert.ok(migration.includes(correct), 'the repaired subscription policy must be present');
  const formerlyBroken = migration.replace(correct, "AND d.user_id::text=NULLIF(current_setting('app.user_id',true),''))));");
  assert.throws(() => checkSqlStructure(formerlyBroken, '20261111100000_isolated_demo_sessions/migration.sql'), /unexpected '\)'/);
});

test('Render build checks PostgreSQL migration structure before NestJS compilation', () => {
  const pkg = JSON.parse(source('../package.json'));
  assert.match(pkg.scripts.build, /^node scripts\/check-migration-sql-structure\.mjs &&/);
});

test('recovery is restricted to the exact failed demo migration and SQLSTATE 42601', () => {
  assert.match(recovery, /20261111100000_isolated_demo_sessions/);
  assert.match(recovery, /Database error code: 42601/);
  assert.match(recovery, /syntax error at or near/);
  assert.match(recovery, /failure\.rows\.length !== 1/);
  assert.match(recovery, /SELECT logs FROM public\._prisma_migrations/);
  assert.match(recovery, /failedNames\.includes\(demoMigration\).*assertDemoMigrationRolledBack/);
});

test('recovery checks all schema objects and fails closed before changing migration history', () => {
  for (const marker of ['public.demo_sessions', 'public.lexa_demo_assert_start_limit(text,integer)',
    'public.lexa_demo_purge_expired(integer)', 'demo_subscription_temporary_activation',
    'partial schema changes detected', 'manual review required']) {
    assert.ok(recovery.includes(marker), `missing guard: ${marker}`);
  }
  assert.ok(recovery.indexOf('assertDemoMigrationRolledBack(client)') < recovery.indexOf("['prisma', 'migrate', 'resolve'"));
  assert.match(recovery, /--rolled-back/);
  assert.doesNotMatch(recovery, /migrate reset|db push|DROP TABLE|TRUNCATE|DELETE FROM public\._prisma_migrations/i);
});

test('production blueprint gates deploys on CI and excludes ZIP upload commits', () => {
  const blueprint = source('../../render.yaml');
  assert.match(blueprint, /autoDeployTrigger:\s*checksPass/);
  assert.match(blueprint, /buildFilter:[\s\S]*?paths:[\s\S]*?backend\/\*\*/);
  assert.match(blueprint, /ignoredPaths:[\s\S]*?"\*\.zip"/);
  assert.match(blueprint, /healthCheckPath:\s*\/health\/ready/);
});
