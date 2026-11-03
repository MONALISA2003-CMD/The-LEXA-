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
# Source-import ZIPs intentionally omit generated files, but npm ci requires a
# lockfile. Recreate a v3+ lockfile from each committed manifest before CI runs.
# --package-lock-only avoids installing node_modules; --ignore-scripts prevents
# arbitrary package lifecycle scripts from running during this bootstrap step.
for app in ("backend", "lexa-frontend"):
    app_dir = ROOT / app
    package_path = app_dir / "package.json"
    lock_path = app_dir / "package-lock.json"
    if not package_path.is_file():
        raise SystemExit(f"Cannot prepare npm lockfile: missing {package_path.relative_to(ROOT)}")
    if not lock_path.is_file():
        print(f"Generating missing {lock_path.relative_to(ROOT)} for clean npm ci installs...")
        subprocess.run(
            ["npm", "install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"],
            cwd=app_dir,
            check=True,
        )
    try:
        package = json.loads(package_path.read_text(encoding="utf-8"))
        lock = json.loads(lock_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"Invalid npm manifest/lockfile in {app}: {error}") from error
    lock_root = lock.get("packages", {}).get("")
    if not isinstance(lock.get("lockfileVersion"), int) or lock["lockfileVersion"] < 1 or not isinstance(lock_root, dict):
        raise SystemExit(f"{app}/package-lock.json is not a supported npm lockfile; regenerate it.")
    for field in ("name", "version", "dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "engines"):
        if package.get(field) != lock_root.get(field):
            raise SystemExit(f"{app}/package-lock.json is stale: root {field!r} does not match package.json.")

print("LEXA repository cleanup completed.")
