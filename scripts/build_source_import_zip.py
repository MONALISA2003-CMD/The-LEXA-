#!/usr/bin/env python3
"""Produce a compact, canonical LEXA source ZIP accepted by GitHub importer.

Usage: python3 scripts/build_source_import_zip.py /absolute/path/LEXA.zip [--lzma]
Build outside the source folder. No root marketing, duplicate config or .github.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_LZMA, ZipFile, ZipInfo

from preflight_import_zip import ALLOWED_DIRS, ALLOWED_FILES, problems

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_DIRS = {".git", ".github", ".vercel", "node_modules", "dist", "coverage", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".turbo", ".vite"}
EXCLUDED_FILES = {"package-lock.json"}  # GitHub import restores committed locks by design.


def allowed(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    parts = rel.parts
    if any(part in EXCLUDED_DIRS for part in parts):
        return False
    if path.is_symlink():
        raise ValueError(f"Symlink not allowed: {rel}")
    if not path.is_file():
        return False
    if len(parts) == 1 and parts[0] not in ALLOWED_FILES:
        raise ValueError(f"Disallowed root-level file {rel}; move to docs/ or an existing app directory")
    if len(parts) > 1 and parts[0] not in ALLOWED_DIRS:
        raise ValueError(f"Disallowed top-level folder {parts[0]}")
    if path.name in EXCLUDED_FILES or path.suffix.lower() in {".zip", ".pyc"}:
        return False
    if path.name.startswith(".env") and path.name not in {".env.example", ".env.worker.example"}:
        raise ValueError(f"Secret-looking file excluded: {rel}")
    return True


def main() -> int:
    arg = argparse.ArgumentParser(description=__doc__)
    arg.add_argument("output", type=Path)
    arg.add_argument("--lzma", action="store_true", help="Smaller ZIP with Python-compatible LZMA compression; importer uses Python zipfile")
    opts = arg.parse_args()
    output = opts.output.resolve()
    if ROOT == output or ROOT in output.parents:
        arg.error("Write the archive outside the repository source root")
    compression = ZIP_LZMA if opts.lzma else ZIP_DEFLATED
    output.parent.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in ROOT.rglob("*") if allowed(p))
    try:
        with ZipFile(output, "w", compression=compression, compresslevel=None if opts.lzma else 9, allowZip64=True) as z:
            for path in files:
                rel = path.relative_to(ROOT).as_posix()
                info = ZipInfo(rel, date_time=(2026, 11, 7, 0, 0, 0))
                info.compress_type = compression
                info.external_attr = 0o100644 << 16
                if not opts.lzma:
                    z.writestr(info, path.read_bytes(), compress_type=compression, compresslevel=9)
                else:
                    z.writestr(info, path.read_bytes(), compress_type=compression)
    except Exception:
        output.unlink(missing_ok=True)
        raise
    errors, count = problems(output)
    if errors:
        output.unlink(missing_ok=True)
        raise ValueError("Importer preflight failed: " + "; ".join(errors))
    print(f"Built and validated {output.name}: {count} files, {output.stat().st_size:,} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
