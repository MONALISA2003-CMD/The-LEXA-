#!/usr/bin/env python3
"""Build and stage the isolated LEXA demo Vercel client (never the production client).

Usage: VITE_TURNSTILE_SITE_KEY=<public demo site key> \
    python3 scripts/build_demo_vercel_bundle.py --output /tmp/lexa-demo-vercel

This runs the real frontend build with forced demo-only public settings and copies
only its output plus docs/deployment/vercel.demo.json. It deliberately cannot
reuse an existing production dist; a demo artifact must always be newly built.
"""
from __future__ import annotations
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / 'lexa-frontend'
DEMO_CONFIG = ROOT / 'docs/deployment/vercel.demo.json'


def verify_demo_proxy(config: dict) -> None:
    """Fail closed when a demo config routes any API requests to production."""
    rewrites = config.get('rewrites')
    if not isinstance(rewrites, list):
        raise ValueError('Demo Vercel configuration must contain rewrites.')
    api_rules = [rule for rule in rewrites if isinstance(rule, dict) and str(rule.get('source', '')).startswith('/api/')]
    if not api_rules or not any(rule.get('source') == '/api/v1/:path*' for rule in api_rules):
        raise ValueError('Demo API catch-all rewrite is required.')
    for rule in api_rules:
        destination = rule.get('destination')
        if not isinstance(destination, str) or not destination.startswith('https://lexa-demo-api.onrender.com/'):
            raise ValueError(f'Demo API route is not isolated: {rule!r}')
    headers = config.get('headers')
    if not isinstance(headers, list) or not any(
        isinstance(rule, dict) and rule.get('source') == '/(.*)' and
        any(h.get('key', '').lower() == 'x-robots-tag' and 'noindex' in h.get('value', '').lower()
            for h in rule.get('headers', [])) for rule in headers
    ):
        raise ValueError('Demo site must include a global X-Robots-Tag: noindex header.')


def verify_build_env(env: dict[str, str]) -> None:
    if env.get('VITE_LEXA_DEMO') != 'true' or env.get('VITE_DATA_PROVIDER') != 'api' or env.get('VITE_API_BASE_URL') != '/api/v1':
        raise ValueError('Unsafe demo frontend build configuration.')
    key = env.get('VITE_TURNSTILE_SITE_KEY', '')
    if not re.fullmatch(r'[A-Za-z0-9_-]{20,100}', key):
        raise ValueError('Set VITE_TURNSTILE_SITE_KEY to the PUBLIC site key for demo.lexaaamaal.com before building.')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='New deployment folder outside the source repo')
    args = parser.parse_args()
    out = args.output.resolve()
    if out == ROOT or ROOT in out.parents:
        parser.error('The output folder must be outside the source repository.')
    if out.exists():
        parser.error('The output folder already exists; use a new empty destination.')
    config = json.loads(DEMO_CONFIG.read_text(encoding='utf-8'))
    verify_demo_proxy(config)
    env = os.environ.copy()
    env['VITE_LEXA_DEMO'] = 'true'
    env['VITE_DATA_PROVIDER'] = 'api'
    env['VITE_API_BASE_URL'] = '/api/v1'
    verify_build_env(env)
    if not (FRONTEND / 'node_modules').is_dir():
        parser.error('Install frontend dependencies using npm ci before building the demo.')
    subprocess.run(['npm', 'run', 'build'], cwd=FRONTEND, env=env, check=True)
    dist = FRONTEND / 'dist'
    if not (dist / 'index.html').is_file() or not any((dist / 'assets').glob('*.js')):
        raise RuntimeError('The frontend did not generate a valid application bundle.')
    out.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='lexa-demo-build-', dir=out.parent))
    try:
        for p in dist.rglob('*'):
            if p.is_symlink():
                raise ValueError(f'Demo bundle contains a symlink: {p.relative_to(dist)}')
        shutil.copytree(dist, stage, dirs_exist_ok=True)
        shutil.copy2(DEMO_CONFIG, stage / 'vercel.json')
        verify_demo_proxy(json.loads((stage / 'vercel.json').read_text(encoding='utf-8')))
        if not (stage / 'index.html').is_file() or not any((stage / 'assets').glob('*.js')):
            raise RuntimeError('Demo bundle is incomplete after staging.')
        stage.rename(out)
        print(f'Isolated demo client ready: {out} (API proxy: demo only, noindex enabled)')
    finally:
        if stage.exists():
            shutil.rmtree(stage)
    return 0

if __name__ == '__main__':
    sys.exit(main())
