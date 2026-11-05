import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '../..');

test('Clean ZIP imports restore last committed npm lockfiles without resolving floating packages', () => {
 const source = readFileSync(resolve(root, 'scripts/clean_repository.py'), 'utf8');
 assert.match(source, /from verify_dependency_locks import prepare/);
 assert.doesNotMatch(source, /npm\s*["', ]*install|--package-lock-only/);
 const verifier = readFileSync(resolve(root, 'scripts/verify_dependency_locks.py'), 'utf8');
 assert.match(verifier, /git.*show/);
 assert.match(verifier, /@tanstack\/query-core/);
 const result = spawnSync('python3', [resolve(root, 'scripts/test_dependency_lock_reproducibility.py')], {cwd:root,encoding:'utf8'});
 assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
