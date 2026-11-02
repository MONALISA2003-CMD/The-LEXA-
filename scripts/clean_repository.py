#!/usr/bin/env python3
"""Remove legacy repository snapshots and generated files from the checkout."""
from __future__ import annotations

from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
LEGACY_SNAPSHOTS = (
    "The-LEXA",
    "The-LEXA--main",
    "LEXA_WS8_updated",
    "LEXA_Render_Current_Fix",
    "LEXA_Render_TS2339_Fix",
    "LEXA_Render_Vercel_Build_Repairs_20261031",
    "LEXA_Workstream4_Reviewed_Patch",
    "LEXA_Workstreams_0_3_Patch",
    "increment-5",
)
GENERATED_DIRECTORY_NAMES = {
    "node_modules", "dist", "coverage", ".vercel", "__pycache__",
    ".pytest_cache", ".mypy_cache", ".ruff_cache", ".turbo",
}


def remove_path(path: Path) -> None:
    if path.is_symlink() or path.is_file():
        path.unlink(missing_ok=True)
    elif path.is_dir():
        shutil.rmtree(path)


def main() -> int:
    for name in LEGACY_SNAPSHOTS:
        target = ROOT / name
        if target.exists() or target.is_symlink():
            remove_path(target)
            print(f"Removed legacy snapshot: {name}")

    for path in sorted(ROOT.rglob("*"), key=lambda item: len(item.parts), reverse=True):
        if ".git" in path.parts:
            continue
        if path.is_dir() and path.name in GENERATED_DIRECTORY_NAMES:
            remove_path(path)
        elif path.is_file() and path.suffix.lower() == ".pyc":
            path.unlink(missing_ok=True)

    # ZIP archives are never source files and must not be nested in the project.
    for path in ROOT.rglob("*.zip"):
        if ".git" not in path.parts and path.is_file():
            path.unlink(missing_ok=True)

    print("Repository cleanup completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
