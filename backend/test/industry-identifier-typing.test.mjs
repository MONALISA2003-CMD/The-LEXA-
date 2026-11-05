import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const backend = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = path => readFileSync(join(backend, path), 'utf8');

test('identifier capability helper compiles in strict TypeScript against generated industry policies', () => {
  // CI installs TypeScript via npm ci. Locally, the globally installed tsc is also supported.
  const result = spawnSync('tsc', [
    '--strict', '--noEmit', '--skipLibCheck', '--target', 'ES2022',
    '--module', 'nodenext', '--moduleResolution', 'nodenext',
    'src/catalog/identifier-policy.ts',
  ], { cwd: backend, encoding: 'utf8', timeout: 25_000 });
  assert.equal(result.status, 0, [result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n'));
});

test('goods receipt and standalone serial registration use the same identifier capability policy', () => {
  const purchasing = source('src/supply-chain/supply-chain.controller.ts');
  const inventory = source('src/commerce/catalog-inventory.controller.ts');
  assert.match(purchasing, /productHasIdentifier\(p\.productType,'imei'\)/);
  assert.match(inventory, /productHasIdentifier\(productType,'imei'\)/);
  assert.doesNotMatch(purchasing, /identifiers\.includes\('imei'\)/);
  assert.doesNotMatch(inventory, /identifiers\.includes\('imei'\)/);
});

test('manifest has explicit phone IMEI capability and leaves unrelated products unmodified', () => {
  const { presets } = JSON.parse(source('src/catalog/industry-manifest.json'));
  const policy = key => presets.find(p => p.key === key);
  assert.ok(policy('smartphone').identifiers.includes('imei'));
  assert.ok(!policy('clothing').identifiers.includes('imei'));
  assert.ok(!policy('bread').identifiers.includes('imei'));
  assert.ok(policy('tv').identifiers.includes('serial'));
});
