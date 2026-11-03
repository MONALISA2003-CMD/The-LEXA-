#!/usr/bin/env python3
"""Validate LEXA's source-import ZIP layout and GitHub-side workflow accounting."""
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_FILES = [
    "backend/package.json",
    "backend/Dockerfile",
    "backend/prisma/schema.prisma",
    "lexa-frontend/package.json",
    "lexa-frontend/vercel.json",
    "render.yaml",
    "README.md",
    ".nvmrc",
    ".gitignore",
    ".dockerignore",
    "REPOSITORY_LAYOUT_MANIFEST.json",
    "scripts/clean_repository.py",
    "scripts/validate_repository.py",
]
REQUIRED_DIRS = ["backend/", "lexa-frontend/", "docs/", "scripts/"]
EXPECTED_PACKAGE_FILES = ["backend/package.json", "lexa-frontend/package.json"]
GENERATED_DIRS = {
    ".git", ".vercel", "node_modules", "dist", "coverage", "__pycache__",
    ".pytest_cache", ".mypy_cache", ".ruff_cache", ".turbo", ".vite",
}
ALLOWED_ENV_FILES = {".env.example", ".env.worker.example"}
FORBIDDEN_COPIES = [
    "The-LEXA",
    "The-LEXA--main",
    "LEXA_WS8_updated",
    "LEXA_Render_Current_Fix",
    "LEXA_Render_TS2339_Fix",
    "LEXA_Render_Vercel_Build_Repairs_20261031",
    "LEXA_Workstream4_Reviewed_Patch",
    "LEXA_Workstreams_0_3_Patch",
    "increment-5",
]

errors: list[str] = []
for rel in REQUIRED_FILES:
    if not (ROOT / rel).is_file():
        errors.append(f"Missing required project file: {rel}")
for rel in REQUIRED_DIRS:
    if not (ROOT / rel).is_dir():
        errors.append(f"Missing required project directory: {rel}")

manifest_path = ROOT / "REPOSITORY_LAYOUT_MANIFEST.json"
workflow_paths: list[str] = []
try:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    policy = manifest.get("github_repository_requirements", {})
    workflow_paths = policy.get("workflows", [])
    if workflow_paths != [".github/workflows/backend-ci.yml"]:
        errors.append("Manifest must record .github/workflows/backend-ci.yml as the GitHub-side workflow requirement.")
    if policy.get("preserved_in_github_repository") is not True:
        errors.append("Manifest must require the existing GitHub Actions workflow to remain in the GitHub repository.")
    if policy.get("included_in_source_import_zip") is not False:
        errors.append("Manifest must explicitly exclude .github/ from source-import ZIPs.")
    dependency_policy = manifest.get("dependency_installation", {})
    expected_lockfiles = ["backend/package-lock.json", "lexa-frontend/package-lock.json"]
    if dependency_policy.get("package_manifests") != EXPECTED_PACKAGE_FILES:
        errors.append("Manifest must record exactly the backend and frontend package manifests.")
    if dependency_policy.get("lockfiles") != expected_lockfiles:
        errors.append("Manifest must record the backend and frontend npm lockfiles.")
    if dependency_policy.get("lockfiles_in_source_import_zip") is not False:
        errors.append("Manifest must explicitly exclude npm lockfiles from source-import ZIPs.")
except (OSError, json.JSONDecodeError) as error:
    errors.append(f"Cannot read repository layout manifest: {error}")

# Preserve the workflow in GitHub, but never include .github/ in an import ZIP.
if (ROOT / ".github").exists():
    errors.append(".github/ must be excluded entirely from the source-import ZIP.")
for rel in workflow_paths:
    if (ROOT / rel).exists():
        errors.append(f"GitHub workflow unexpectedly included in source-import ZIP: {rel}")

for rel in FORBIDDEN_COPIES:
    if (ROOT / rel).exists():
        errors.append(f"Duplicate or legacy repository bundle found: {rel}/")

# Lockfiles are deliberately absent from source-import ZIPs. The import workflow
# generates them from the canonical manifests before npm ci; when validating a
# cleaned checkout, verify any present lockfile's root dependency metadata.
for app in ("backend", "lexa-frontend"):
    package_path = ROOT / app / "package.json"
    lock_path = ROOT / app / "package-lock.json"
    try:
        package = json.loads(package_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"Cannot read {app}/package.json: {error}")
        continue
    if not lock_path.exists():
        continue
    try:
        lock = json.loads(lock_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"Cannot read {app}/package-lock.json: {error}")
        continue
    lock_root = lock.get("packages", {}).get("")
    if not isinstance(lock.get("lockfileVersion"), int) or lock["lockfileVersion"] < 1 or not isinstance(lock_root, dict):
        errors.append(f"{app}/package-lock.json is not a supported npm lockfile.")
        continue
    for field in ("name", "version", "dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "engines"):
        if package.get(field) != lock_root.get(field):
            errors.append(f"{app}/package-lock.json is stale: root {field!r} does not match package.json.")

package_files = sorted(
    path.relative_to(ROOT).as_posix()
    for path in ROOT.rglob("package.json")
    if not any(part in GENERATED_DIRS for part in path.parts)
)
if package_files != EXPECTED_PACKAGE_FILES:
    errors.append(f"Expected exactly the backend and frontend package manifests; found {package_files}")

migration_dir = ROOT / "backend/prisma/migrations"
if not migration_dir.is_dir():
    errors.append("Missing backend/prisma/migrations/")
else:
    migrations = [path for path in migration_dir.iterdir() if path.is_dir()]
    if len(migrations) < 30:
        errors.append(f"Expected at least 30 preserved Prisma migration directories; found {len(migrations)}")

for path in ROOT.rglob("*"):
    if path.is_symlink():
        errors.append(f"Symlink is not allowed in source-import ZIP: {path.relative_to(ROOT)}")
        continue
    if path.is_dir():
        if path.name in GENERATED_DIRS:
            errors.append(f"Generated or local-only directory must not be included: {path.relative_to(ROOT)}")
        continue
    if not path.is_file():
        continue
    rel = path.relative_to(ROOT).as_posix()
    if path.suffix.lower() in {".zip", ".pyc"}:
        errors.append(f"Nested/generated file must not be included: {rel}")
    if path.name.startswith(".env") and path.name not in ALLOWED_ENV_FILES:
        errors.append(f"Potential local or secret environment file must not be included: {rel}")

if errors:
    print("LEXA source-import layout check failed:")
    for item in errors:
        print(f" - {item}")
    sys.exit(1)

print(
    "LEXA source-import layout passed: canonical root, required backend/frontend/docs/scripts, "
    "exactly two package manifests, optional validated lockfiles, at least 30 Prisma migrations, "
    "no nested copies/build artifacts/secrets, .github/ excluded, and GitHub workflow "
    "retained as an explicit repository-side requirement."
)
