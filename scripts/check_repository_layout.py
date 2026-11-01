#!/usr/bin/env python3
"""Validate LEXA's single-root repository layout and guard against re-nesting."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    "README.md",
    ".gitignore",
    "backend/package.json",
    "backend/Dockerfile",
    "lexa-frontend/package.json",
    "lexa-frontend/vercel.json",
    "render.yaml",
    ".github/workflows/backend-ci.yml",
    ".github/workflows/extract-frontend.yml",
    "scripts/cleanup_legacy_repo_copies.py",
]
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
errors = []
for rel in REQUIRED:
    if not (ROOT / rel).is_file():
        errors.append(f"Missing canonical project file: {rel}")
for rel in FORBIDDEN_COPIES:
    if (ROOT / rel).exists():
        errors.append(f"Duplicate or obsolete source copy remains: {rel}/")

package_files = sorted(p.relative_to(ROOT).as_posix() for p in ROOT.rglob("package.json") if ".git" not in p.parts)
expected_packages = ["backend/package.json", "lexa-frontend/package.json"]
if package_files != expected_packages:
    errors.append(f"Expected exactly two application package files; found: {package_files}")

for pattern in ("*.zip", "*.pyc"):
    for path in ROOT.rglob(pattern):
        if ".git" not in path.parts:
            errors.append(f"Generated/import file must not be committed: {path.relative_to(ROOT)}")
for directory in ("node_modules", "dist", "coverage", ".vercel", "__pycache__", ".pytest_cache", ".mypy_cache"):
    for path in ROOT.rglob(directory):
        if ".git" not in path.parts and path.is_dir():
            errors.append(f"Generated directory must not be committed: {path.relative_to(ROOT)}")

# No credential-bearing environment file may be present in source control.
for path in ROOT.rglob(".env*"):
    if ".git" in path.parts:
        continue
    if path.name not in {".env.example", ".env.worker.example"}:
        errors.append(f"Potential secret environment file must not be committed: {path.relative_to(ROOT)}")

if errors:
    print("LEXA repository layout check failed:")
    for item in errors:
        print(f" - {item}")
    sys.exit(1)

print("LEXA repository layout is canonical: one frontend, one backend, two package manifests, no duplicate snapshots, archives or generated files.")
