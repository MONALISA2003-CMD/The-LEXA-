import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { workerConfigProblems, workerHeartbeatStatus } from '../src/platform/worker-config.ts';

const valid = {
  NODE_ENV: 'production',
  LEXA_WORKER_ENABLED: 'true',
  LEXA_WORKER_DURABLE_REDIS_CONFIRMED: 'true',
  REDIS_URL: 'rediss://internal-redis.example:6379',
  WORKER_DATABASE_URL: 'postgresql://worker:secret@db.example/lexa',
  DATABASE_RUNTIME_ROLE: 'lexa_app_runtime',
  R2_ACCOUNT_ID: 'private-account',
  R2_BUCKET: 'private-bucket',
  R2_ACCESS_KEY_ID: 'access-key',
  R2_SECRET_ACCESS_KEY: 'secret-access-key',
  BACKUP_ENCRYPTION_KEY: 'key',
  RESEND_API_KEY: 'resend-key',
  RESEND_FROM_EMAIL: 'noreply@example.com',
  CLAMAV_HOST: 'scanner.internal',
};

test('worker requires an explicit opt-in and fully configured private dependencies', () => {
  assert.deepEqual(workerConfigProblems(valid), []);
  assert.match(workerConfigProblems({ ...valid, LEXA_WORKER_ENABLED: 'false' }).join(' '), /LEXA_WORKER_ENABLED/);
  assert.match(workerConfigProblems({ ...valid, LEXA_WORKER_DURABLE_REDIS_CONFIRMED: 'false' }).join(' '), /DURABLE_REDIS/);
  assert.match(workerConfigProblems({ ...valid, CLAMAV_HOST: undefined }).join(' '), /CLAMAV_HOST/);
  assert.match(workerConfigProblems({ ...valid, REDIS_URL: 'http://malformed/' }).join(' '), /REDIS_URL/);
  assert.match(workerConfigProblems({ ...valid, DATABASE_RUNTIME_ROLE: 'postgres' }).join(' '), /DATABASE_RUNTIME_ROLE/);
  assert.match(workerConfigProblems({ ...valid, WORKER_DATABASE_URL: 'postgresql://db.example/lexa?options=-c%20role%3Dpostgres' }).join(' '), /startup role/);
  assert.match(workerConfigProblems({ ...valid, CLAMAV_HOST: '127.0.0.1' }).join(' '), /isolated scanner/);
});

test('worker startup diagnostics do not expose database or object-store secrets', () => {
  const problems = workerConfigProblems({ ...valid, REDIS_URL: 'invalid-private-password', R2_SECRET_ACCESS_KEY: undefined });
  assert.ok(problems.length > 0);
  const message = problems.join(' ');
  assert.doesNotMatch(message, /invalid-private-password|private-account|secret-access-key/);
});

test('worker is degraded if scanner, storage or Redis is unhealthy', () => {
  assert.equal(workerHeartbeatStatus({ redisHealthy:true, clamavHealthy:true, r2Configured:true }), 'healthy');
  for (const name of ['redisHealthy','clamavHealthy','r2Configured']) {
    const state = { redisHealthy:true, clamavHealthy:true, r2Configured:true };
    state[name] = false;
    assert.equal(workerHeartbeatStatus(state), 'degraded');
  }
});

test('attachment handling is tenant-scoped and the poll loop cannot overlap', () => {
  const text = readFileSync(new URL('../src/platform/worker.ts', import.meta.url), 'utf8');
  assert.match(text, /async function scanAttachment\(id:string,tenantId:string\)/);
  assert.match(text, /WHERE id=\$1 AND tenant_id=\$2 AND status=\$3/);
  assert.match(text, /shuttingDown \|\| inFlightTick/);
  assert.match(text, /clamavHealthy\?attachments.rows:\[\]/);
});
