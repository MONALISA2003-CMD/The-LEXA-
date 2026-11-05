/**
 * Validate both catalogue generators when the complete monorepo is present.
 * Vercel's frontend-root checkout excludes ../scripts, but includes the reviewed,
 * generated frontend contracts. CI must still check root sources before release.
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(frontend, '..');
const generators = ['sync_industry_catalogue.py', 'sync_electronics_catalogue_v2.py'];
const available = generators.every(name => existsSync(resolve(repository, 'scripts', name)));
const generated = [
  'src/domain/catalog/industry-manifest.json',
  'src/domain/catalog/electronics-catalogue-v2.generated.ts',
  'public/catalog/electronics-catalogue-v2.json',
];

for (const path of generated) {
  if (!existsSync(resolve(frontend, path))) {
    console.error(`Required published catalogue contract missing: ${path}`);
    process.exit(1);
  }
}

if (!available) {
  if (process.env.VERCEL !== '1') {
    console.error('Repository catalogue generators are missing outside a Vercel frontend-only build.');
    process.exit(1);
  }
  console.log('Building published frontend catalogue contracts; full monorepo synchronization is enforced by GitHub CI.');
} else {
  for (const generator of generators) {
    const result = spawnSync('python3', [resolve(repository, 'scripts', generator), '--check'], {
      cwd: repository, stdio: 'inherit', env: process.env,
    });
    if (result.error || result.status !== 0) {
      console.error(`Catalogue synchronization check failed: ${generator}`);
      process.exit(result.status || 1);
    }
  }
}
