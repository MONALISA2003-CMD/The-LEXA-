#!/usr/bin/env python3
"""Remove generated build artefacts and nested archives from a LEXA checkout."""
from pathlib import Path
import shutil
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1]
GENERATED = {"node_modules", "dist", "coverage", ".vercel", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".turbo"}
LEGACY_SNAPSHOTS = ("The-LEXA", "The-LEXA--main", "LEXA_WS8_updated", "LEXA_Render_Current_Fix", "LEXA_Render_TS2339_Fix", "LEXA_Render_Vercel_Build_Repairs_20261031", "LEXA_Workstream4_Reviewed_Patch", "LEXA_Workstreams_0_3_Patch", "increment-5")

def remove(path: Path) -> None:
    if path.is_symlink() or path.is_file(): path.unlink(missing_ok=True)
    elif path.is_dir(): shutil.rmtree(path)

for name in LEGACY_SNAPSHOTS:
    target = ROOT / name
    if target.exists() or target.is_symlink(): remove(target)
for path in sorted(ROOT.rglob("*"), key=lambda item: len(item.parts), reverse=True):
    if ".git" in path.parts: continue
    if path.is_dir() and path.name in GENERATED: remove(path)
    elif path.is_file() and path.suffix.lower() in {".pyc", ".zip"}: path.unlink(missing_ok=True)
# Verify and restore the *committed* dependency graph without contacting npm.
# Missing incoming lockfiles are restored from the Git tree preserved by the
# repository-import workflow. Other version changes require a matching lockfile.
import sys
sys.dont_write_bytecode = True  # Keep validate_repository.py from detecting a generated .pyc
from verify_dependency_locks import prepare
prepare(ROOT)

print("LEXA repository cleanup completed.")
