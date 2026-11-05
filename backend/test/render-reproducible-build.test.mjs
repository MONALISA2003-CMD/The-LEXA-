import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=name=>readFileSync(new URL(name,import.meta.url),'utf8');

test('Render API Docker build uses the same verified dependency lockfile as GitHub CI',()=>{
 const docker=source('../Dockerfile');
 const locks=source('../../scripts/verify_dependency_locks.py');
 assert.match(docker,/COPY backend\/package\.json backend\/package-lock\.json \.\//);
 assert.match(docker,/RUN npm ci --no-audit --no-fund/);
 assert.doesNotMatch(docker,/RUN npm install/);
 assert.match(locks,/restore_committed_lock/);
 assert.match(locks,/verify_lock/);
 assert.match(docker,/npx prisma generate/);
 assert.match(docker,/npm run build/);
 assert.match(docker,/scripts\/migrate-with-guard\.mjs/);
});

test('Render worker Docker build never resolves floating dependency ranges',()=>{
 const docker=source('../Dockerfile.worker');
 assert.match(docker,/RUN npm ci --no-audit --no-fund/);
 assert.match(docker,/RUN npm ci --omit=dev --no-audit --no-fund/);
 assert.doesNotMatch(docker,/RUN npm install/);
});

test('Render Blueprint readiness path is a database-aware public endpoint, not just an open port',()=>{
 const blueprint=source('../../render.yaml');
 const health=source('../src/health/health.controller.ts');
 const main=source('../src/main.ts');
 assert.match(blueprint,/healthCheckPath:\s*\/health\/ready/);
 assert.match(health,/@Get\('ready'\)/);
 assert.match(health,/await this\.prisma\.\$queryRaw`SELECT 1`/);
 assert.match(main,/path: 'health\/ready', method: RequestMethod\.GET/);
});
