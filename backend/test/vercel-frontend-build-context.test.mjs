import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const frontend = new URL('../../lexa-frontend/', import.meta.url);
const source = readFileSync(new URL('scripts/verify_catalogue_sources.mjs', frontend), 'utf8');

const config = JSON.parse(readFileSync(new URL('package.json', frontend), 'utf8'));
test('Vercel builds checked-in catalogues while CI keeps the full source checks', () => {
  assert.match(config.scripts.prebuild, /^node scripts\/verify_catalogue_sources\.mjs && /);
  assert.match(source, /process\.env\.VERCEL !== '1'/);
  assert.match(source, /sync_industry_catalogue\.py/);
  assert.match(source, /sync_electronics_catalogue_v2\.py/);
  assert.match(source, /Required published catalogue contract missing/);
});

test('frontend-only checkout runs on Vercel and fails closed outside Vercel', () => {
  const parent = mkdtempSync(join(tmpdir(), 'lexa-frontend-root-'));
  const testRoot = join(parent, 'lexa-frontend');
  try {
    mkdirSync(join(testRoot, 'scripts'), { recursive: true });
    writeFileSync(join(testRoot, 'scripts', 'verify_catalogue_sources.mjs'), source);
    for (const file of [
      'src/domain/catalog/industry-manifest.json',
      'src/domain/catalog/electronics-catalogue-v2.generated.ts',
      'public/catalog/electronics-catalogue-v2.json',
    ]) {
      const dest = join(testRoot, file);
      mkdirSync(join(dest, '..'), { recursive: true });
      writeFileSync(dest, '{}');
    }
    const command = join(testRoot, 'scripts', 'verify_catalogue_sources.mjs');
    const pass = spawnSync(process.execPath, [command], {
      cwd: testRoot, encoding: 'utf8', env: { ...process.env, VERCEL: '1' },
    });
    assert.equal(pass.status, 0, pass.stderr);
    const cleanEnv = { ...process.env };
    delete cleanEnv.VERCEL;
    const rejected = spawnSync(process.execPath, [command], {
      cwd: testRoot, encoding: 'utf8', env: cleanEnv,
    });
    assert.notEqual(rejected.status, 0);
    rmSync(join(testRoot, 'src/domain/catalog/electronics-catalogue-v2.generated.ts'));
    const missing = spawnSync(process.execPath, [command], {
      cwd: testRoot, encoding: 'utf8', env: { ...process.env, VERCEL: '1' },
    });
    assert.notEqual(missing.status, 0);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
