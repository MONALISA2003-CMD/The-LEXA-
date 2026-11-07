#!/usr/bin/env python3
"""Offline regression cases for deterministic GitHub ZIP imports and npm locks."""
from __future__ import annotations
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'scripts'))
from verify_dependency_locks import LockfileError, prepare, verify_lock


def assert_raises(action, contains: str) -> None:
    try:
        action()
    except LockfileError as error:
        assert contains in str(error), str(error)
        return
    raise AssertionError(f'Expected LockfileError: {contains}')


def fixture(base: Path):
    for app in ('backend', 'lexa-frontend'):
        folder = base / app
        folder.mkdir(parents=True, exist_ok=True)
        pkg = json.loads((ROOT / app / 'package.json').read_text())
        if app == 'lexa-frontend':
            pkg['dependencies']['@tanstack/react-query'] = '^5.90.2'
            # GitHub Actions #156: this existed in the last committed lock,
            # but the new app deliberately uses its own icons.
            pkg['dependencies']['lucide-react'] = '^0.468.0'
        (folder / 'package.json').write_text(json.dumps(pkg))
        entries = {'': {k: pkg[k] for k in ('name', 'version', 'dependencies', 'devDependencies', 'engines') if k in pkg}}
        for field in ('dependencies', 'devDependencies'):
            for name, spec in pkg.get(field, {}).items():
                if name == '@tanstack/react-query':
                    version = '5.106.0'
                else:
                    version = spec.lstrip('^~>=< ').split(' ')[0]
                entries[f'node_modules/{name}'] = {'version':version,'resolved':f'https://registry.npmjs.org/{name}/-/{version}.tgz','integrity':'sha512-fixture'}
        if app == 'lexa-frontend':
            entries['node_modules/@tanstack/react-query']['dependencies'] = {'@tanstack/query-core':'5.106.0'}
            entries['node_modules/@tanstack/query-core'] = {'version':'5.106.0','resolved':'https://registry.npmjs.org/@tanstack/query-core/-/query-core-5.106.0.tgz','integrity':'sha512-fixture'}
        (folder / 'package-lock.json').write_text(json.dumps({'name':pkg['name'],'version':pkg['version'],'lockfileVersion':3,'packages':entries}))
    subprocess.run(['git','init','-q'],cwd=base,check=True)
    subprocess.run(['git','add','backend','lexa-frontend'],cwd=base,check=True)
    subprocess.run(['git','-c','user.name=LEXA CI','-c','user.email=ci@example.com','commit','-qm','known-good lockfiles'],cwd=base,check=True)


def main():
    manifest = json.loads((ROOT / 'lexa-frontend/package.json').read_text())
    assert manifest['dependencies']['@tanstack/react-query'] == '5.106.0'
    with tempfile.TemporaryDirectory(prefix='lexa-npm-lock-regression-') as work:
        folder = Path(work)
        fixture(folder)
        # Reproduce ZIP importer: package.json updated, lockfiles removed, Git object history retained.
        (folder/'lexa-frontend/package.json').write_text(json.dumps(manifest))
        for app in ('backend','lexa-frontend'):
            (folder/app/'package-lock.json').unlink()
        prepare(folder)
        normalized = json.loads((folder/'lexa-frontend/package-lock.json').read_text())
        original = json.loads(subprocess.check_output(['git','show','HEAD:lexa-frontend/package-lock.json'], cwd=folder, text=True))
        assert {k:v for k,v in normalized['packages'].items() if k} == {k:v for k,v in original['packages'].items() if k and k!='node_modules/lucide-react'}, 'only the orphan Lucide leaf may be pruned; every surviving resolved tarball and integrity hash must remain unchanged'
        assert normalized['packages']['']['dependencies']['@tanstack/react-query'] == '5.106.0'
        assert normalized['packages']['node_modules/@tanstack/react-query']['version'] == '5.106.0'
        assert normalized['packages']['node_modules/@tanstack/query-core']['version'] == '5.106.0'
        assert 'lucide-react' not in normalized['packages']['']['dependencies'], 'removed direct dependency was not dropped'
        assert 'node_modules/lucide-react' not in normalized['packages'], 'unused Lucide must not be installed by npm ci'
        assert 'lucide-react' not in manifest['dependencies'], 'frontend must use only its own icons'
        # Unknown additions remain forbidden, including packages that happen to
        # have orphaned entries in the lockfile.
        unexpected = json.loads(json.dumps(manifest))
        unexpected['dependencies']['brand-new-frontend-package'] = '^1.0.0'
        assert_raises(lambda: verify_lock('lexa-frontend', unexpected, normalized), 'lacks requested dependencies')
        readded = json.loads(json.dumps(manifest))
        readded['dependencies']['lucide-react'] = '^0.468.0'
        assert_raises(lambda: verify_lock('lexa-frontend', readded, normalized), 'lacks requested dependencies')
        # Repeated validation must be idempotent and not update lock files.
        before=(folder/'lexa-frontend/package-lock.json').read_bytes()
        prepare(folder)
        assert (folder/'lexa-frontend/package-lock.json').read_bytes() == before
        # A future version not present in the previous lock must fail, not query registry.
        invalid_pkg=json.loads((folder/'lexa-frontend/package.json').read_text())
        invalid_pkg['dependencies']['@tanstack/react-query']='5.106.1'
        assert_raises(lambda:verify_lock('lexa-frontend',invalid_pkg,normalized),'does not contain that exact version')
        # A mismatched transitive query-core must also fail closed.
        bad=json.loads(json.dumps(normalized))
        bad['packages']['node_modules/@tanstack/query-core']['version']='5.106.1'
        assert_raises(lambda:verify_lock('lexa-frontend',manifest,bad),'version mismatch')
        # Prevent accidental lock graphs that omit a direct dependency.
        bad=json.loads(json.dumps(normalized))
        bad['packages'].pop('node_modules/sonner')
        assert_raises(lambda:verify_lock('lexa-frontend',manifest,bad),'missing resolved lockfile entry')
    print('Reproducible npm lock bootstrap passed: git recovery, exact pin, transitive match, idempotence and fail-closed upgrade tests.')

if __name__=='__main__': main()
