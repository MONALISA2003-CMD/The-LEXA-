#!/usr/bin/env python3
"""Validate LEXA's canonical roots, secrets hygiene and production migrations."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = (
    "README.md", ".nvmrc", ".gitignore", ".dockerignore", "render.yaml",
    "REPOSITORY_LAYOUT_MANIFEST.json", "backend/package.json", "backend/package-lock.json", "backend/Dockerfile",
    "backend/prisma/schema.prisma", "lexa-frontend/package.json", "lexa-frontend/package-lock.json", "lexa-frontend/vercel.json",
    "scripts/clean_repository.py", "scripts/validate_repository.py",
    "docs/architecture/backend-architecture.md", "docs/deployment/deployment-guide.md",
    "docs/operations/runbooks/README.md", "docs/quality/release-readiness.md",
)
errors = [f"Missing required file: {item}" for item in REQUIRED if not (ROOT / item).is_file()]
try:
    manifest = json.loads((ROOT / "REPOSITORY_LAYOUT_MANIFEST.json").read_text(encoding="utf-8"))
    workflow_policy = manifest.get("github_repository_requirements", {})
    if workflow_policy.get("workflows") != [".github/workflows/backend-ci.yml"]:
        errors.append("Manifest must account for .github/workflows/backend-ci.yml.")
    if workflow_policy.get("preserved_in_github_repository") is not True:
        errors.append("The existing GitHub workflow must remain in the GitHub repository.")
    if workflow_policy.get("included_in_source_import_zip") is not False:
        errors.append("The .github directory must be excluded from source-import ZIPs.")
except (OSError, json.JSONDecodeError) as error:
    errors.append(f"Cannot validate repository workflow policy in manifest: {error}")
if (ROOT / ".github").exists() and not (ROOT / ".github/workflows/backend-ci.yml").is_file():
    errors.append("GitHub workflow directory exists but backend-ci.yml is missing from the repository checkout.")
for folder in ("services", "deploy", "node_modules", "dist", "coverage", ".vercel"):
    if (ROOT / folder).exists(): errors.append(f"Unexpected or generated root directory: {folder}/")
package_files = sorted(p.relative_to(ROOT).as_posix() for p in ROOT.rglob("package.json") if not any(part in {"node_modules", "dist", "coverage"} for part in p.parts))
if package_files != ["backend/package.json", "lexa-frontend/package.json"]:
    errors.append(f"Expected exactly two application manifests; found {package_files}")
for p in ROOT.rglob("*"):
    if ".git" in p.parts: continue
    if p.is_symlink(): errors.append(f"Symlink not allowed: {p.relative_to(ROOT)}"); continue
    if not p.is_file(): continue
    rel = p.relative_to(ROOT).as_posix()
    if p.suffix.lower() in {".zip", ".pyc"}: errors.append(f"Nested/generated archive not allowed: {rel}")
    if p.name.startswith(".env") and p.name not in {".env.example", ".env.worker.example"}:
        errors.append(f"Potential live secret file: {rel}")
# Historical API/module identifiers remain intentionally intact for compatibility. Documentation filenames are kept professional.
legacy_doc_names = re.compile(r"(^|[-_.])(phase|workstream|increment|patch)(?:[0-9]+)?([-_.]|$)", re.I)
for p in (ROOT / "docs").rglob("*"):
    if p.is_file() and legacy_doc_names.search(p.stem): errors.append(f"Legacy stage label in documentation filename: {p.relative_to(ROOT)}")
if (ROOT / "backend/prisma/migrations").is_dir():
    dirs = [p for p in (ROOT / "backend/prisma/migrations").iterdir() if p.is_dir()]
    if len(dirs) < 30: errors.append(f"Expected at least 30 preserved Prisma migrations; found {len(dirs)}")
else: errors.append("Missing Prisma migrations directory")
# Dependency graph must be deterministic. After the cleaner restores the
# repository's known-good committed lockfiles, never tolerate silent drift.
import subprocess
import os
lock_check = subprocess.run(['python3',str(ROOT/'scripts/verify_dependency_locks.py'),'--check'],capture_output=True,text=True)
if lock_check.returncode: errors.append('Dependency-lock mismatch: '+lock_check.stdout+lock_check.stderr)
# GitHub Actions #170: npm 11 accepted a lockfile missing a nested webpack
# entry required by the Node 22 runner's npm 10. Validate with *the same npm*
# as the active runner before any install; no package downloads or scripts run.
# The explicit local switch lets release tooling simulate GitHub in a clean
# checkout without turning npm into a mandatory dependency for Python-only QA.
if os.environ.get('GITHUB_ACTIONS') == 'true' or os.environ.get('LEXA_VALIDATE_NPM_CI') == '1':
    for app in ('backend', 'lexa-frontend'):
        try:
            dry_run = subprocess.run(
                ['npm', 'ci', '--dry-run', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'],
                cwd=ROOT/app, capture_output=True, text=True, timeout=90,
            )
            if dry_run.returncode:
                lines = (dry_run.stdout + '\n' + dry_run.stderr).splitlines()
                key_lines = [line for line in lines if any(
                    marker in line for marker in ('npm error code', 'npm error Missing:',
                                                 'npm error Invalid:', 'npm error EUSAGE'))]
                detail = '\n'.join(key_lines[:12] or lines[-15:])
                errors.append(f'{app} npm ci lock graph rejected by the active runner: {detail}')
        except (OSError, subprocess.TimeoutExpired) as error:
            errors.append(f'{app} npm ci lock graph preflight failed: {error}')
result = subprocess.run(['python3',str(ROOT/'scripts/sync_industry_catalogue.py'),'--check'],capture_output=True,text=True)
if result.returncode: errors.append('Industry contract mismatch: '+result.stdout+result.stderr)
if errors:
    print("Repository validation failed:")
    for error in errors: print(" - " + error)
    raise SystemExit(1)
print("Repository validation passed: canonical application roots, two package manifests, 30+ preserved migrations, GitHub workflow policy recorded, and no live secrets or nested archives.")
