#!/usr/bin/env python3
"""Enforce LEXA's canonical repository structure and release hygiene."""
from __future__ import annotations

from pathlib import Path
import sys
import re

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_FILES = (
    "README.md",
    ".nvmrc",
    ".gitignore",
    ".dockerignore",
    "render.yaml",
    "REPOSITORY_LAYOUT_MANIFEST.json",
    "backend/package.json",
    "backend/Dockerfile",
    "backend/prisma/schema.prisma",
    "lexa-frontend/package.json",
    "lexa-frontend/vercel.json",
    ".github/workflows/backend-ci.yml",
    ".github/workflows/repository-import.yml",
    "scripts/clean_repository.py",
    "scripts/validate_repository.py",
    "docs/architecture/backend-architecture.md",
    "docs/deployment/deployment-guide.md",
    "docs/operations/runbooks/README.md",
)
LEGACY_SNAPSHOTS = (
    "The-LEXA", "The-LEXA--main", "LEXA_WS8_updated",
    "LEXA_Render_Current_Fix", "LEXA_Render_TS2339_Fix",
    "LEXA_Render_Vercel_Build_Repairs_20261031",
    "LEXA_Workstream4_Reviewed_Patch", "LEXA_Workstreams_0_3_Patch", "increment-5",
)
IMMUTABLE_MIGRATION_ROOT = "backend/prisma/migrations/"
LEGACY_FILE_MARKERS = re.compile(r"(^|[-_.])(phase|workstream|increment|patch)(?:[0-9]+)?([-_.]|$)", re.IGNORECASE)
IGNORED_DIRS = {".git", "node_modules", ".vercel", "dist", "coverage"}
errors: list[str] = []

for rel in REQUIRED_FILES:
    if not (ROOT / rel).is_file():
        errors.append(f"Missing required file: {rel}")

for rel in LEGACY_SNAPSHOTS:
    if (ROOT / rel).exists():
        errors.append(f"Legacy repository copy remains: {rel}/")
for rel in ("services", "deploy"):
    if (ROOT / rel).exists():
        errors.append(f"Inactive reference infrastructure remains: {rel}/")

package_files = sorted(
    path.relative_to(ROOT).as_posix()
    for path in ROOT.rglob("package.json")
    if not any(part in IGNORED_DIRS for part in path.parts)
)
if package_files != ["backend/package.json", "lexa-frontend/package.json"]:
    errors.append(f"Expected exactly two application manifests; found {package_files}")

for path in ROOT.rglob("*"):
    if any(part in IGNORED_DIRS for part in path.parts):
        continue
    if path.is_symlink():
        errors.append(f"Symbolic links are not allowed in the source archive: {path.relative_to(ROOT)}")
        continue
    if not path.is_file():
        continue
    rel = path.relative_to(ROOT).as_posix()
    if rel.startswith(IMMUTABLE_MIGRATION_ROOT):
        # Prisma migration names are part of the production migration ledger; do not rename them.
        continue
    if LEGACY_FILE_MARKERS.search(path.stem):
        errors.append(f"Legacy stage/patch label remains in filename: {rel}")
    if path.suffix.lower() in {".zip", ".pyc"}:
        errors.append(f"Generated or nested artifact must not be committed: {rel}")
    if path.name.startswith(".env") and path.name not in {".env.example", ".env.worker.example"}:
        errors.append(f"Potential secret environment file found: {rel}")

migration_root = ROOT / "backend/prisma/migrations"
migration_dirs = [path for path in migration_root.iterdir() if path.is_dir()]
if len(migration_dirs) != 30:
    errors.append(
        "Expected 30 active Prisma migration directories matching production history; "
        f"found {len(migration_dirs)}"
    )

for required_dir in ("backend", "lexa-frontend", "docs", "scripts"):
    if not (ROOT / required_dir).is_dir():
        errors.append(f"Missing canonical directory: {required_dir}/")

if errors:
    print("Repository validation failed:")
    for error in errors:
        print(f" - {error}")
    raise SystemExit(1)

print("Repository validation passed: one backend, one frontend, 30 preserved production migrations, professional filenames, and no duplicate snapshots or embedded archives.")
