#!/usr/bin/env python3
"""Exact structural preflight for GitHub's .github/workflows/repository-import.yml.

Run *before upload*, because the workflow exits on the first invalid archive path.
Keep the allowlists synchronized with that workflow. ZIP is read-only.
"""
from __future__ import annotations

import argparse
import ast
import json
import re
import stat
import sys
from pathlib import Path
from zipfile import BadZipFile, ZipFile

ALLOWED_DIRS = {"backend", "lexa-frontend", "docs", "scripts"}
ALLOWED_FILES = {
    ".dockerignore", ".gitignore", ".nvmrc", "README.md", "REPOSITORY_LAYOUT_MANIFEST.json",
    "render.yaml", "LICENSE", "LICENSE.md", "NOTICE", "SECURITY.md", "CODEOWNERS",
    ".gitattributes", ".editorconfig", ".prettierrc", ".prettierignore",
}
REQUIRED = {
    "README.md", "render.yaml", "REPOSITORY_LAYOUT_MANIFEST.json",
    "backend/package.json", "backend/Dockerfile", "backend/prisma/schema.prisma",
    "lexa-frontend/package.json", "lexa-frontend/vercel.json",
    "scripts/clean_repository.py", "scripts/validate_repository.py",
    "docs/architecture/backend-architecture.md", "docs/deployment/deployment-guide.md",
    "docs/operations/runbooks/README.md",
}
FORBIDDEN_PARTS = {
    ".git", "node_modules", "dist", "coverage", ".vercel", "__pycache__", ".pytest_cache",
    ".mypy_cache", ".ruff_cache", ".turbo",
}
NESTED_COPIES = {
    "the-lexa", "the-lexa--main", "lexa_ws7_updated", "lexa_ws8_updated", "lexa_render_current_fix",
    "lexa_render_ts2339_fix", "increment-5",
}


def problems(archive: Path) -> tuple[list[str], int]:
    errors: list[str] = []
    files: set[str] = set()
    roots: set[str] = set()
    seen: set[str] = set()
    try:
        with ZipFile(archive) as z:
            entries = z.infolist()
            if not entries or len(entries) > 30000:
                return ["ZIP is empty or contains more than 30000 entries"], 0
            # Verify members safely without extracting anything. This is intentionally
            # equivalent to the repository import workflow's safety and path rules.
            for item in entries:
                name = item.filename
                if not name or name.startswith("/") or "\\" in name or "\x00" in name:
                    errors.append(f"Unsafe ZIP path: {name!r}")
                    continue
                clean = name.rstrip("/")
                parts = clean.split("/")
                if not clean or any(p in {"", ".", ".."} for p in parts) or ":" in parts[0]:
                    errors.append(f"Unsafe ZIP path: {name!r}")
                    continue
                mode = item.external_attr >> 16
                kind = stat.S_IFMT(mode)
                if stat.S_ISLNK(mode) or kind not in (0, stat.S_IFREG, stat.S_IFDIR):
                    errors.append(f"Links and special files are not allowed: {name!r}")
                key = clean.casefold()
                if key in seen:
                    errors.append(f"Duplicate/case-colliding path: {name!r}")
                seen.add(key)
                if any(p in FORBIDDEN_PARTS for p in parts):
                    errors.append(f"Generated/dependency content is not allowed: {name!r}")
                if any(p.lower() in NESTED_COPIES for p in parts):
                    errors.append(f"Nested/duplicate repository copy detected: {name!r}")
                if parts[0] == ".github":
                    errors.append("Do not include .github in the source ZIP")
                if len(parts) == 1 and not item.is_dir() and parts[0] not in ALLOWED_FILES:
                    errors.append(f"Unexpected root-level file: {name!r}")
                if len(parts) > 1 and parts[0] not in ALLOWED_DIRS:
                    errors.append(f"Unexpected top-level directory or wrapper folder: {parts[0]!r}")
                if parts[-1].lower().endswith((".zip", ".pyc")):
                    errors.append(f"Nested archives/bytecode are not allowed: {name!r}")
                if parts[-1].startswith(".env") and parts[-1] not in {".env.example", ".env.worker.example"}:
                    errors.append(f"Potential live secret file: {name!r}")
                if not item.is_dir():
                    if item.file_size > 100 * 1024 * 1024:
                        errors.append(f"File is too large: {name!r}")
                    files.add(clean)
                roots.add(parts[0])
            if not ALLOWED_DIRS.issubset(roots):
                errors.append(f"Missing canonical source directories: {sorted(ALLOWED_DIRS - roots)}")
            if sorted(f for f in files if f.endswith("/package.json")) != ["backend/package.json", "lexa-frontend/package.json"]:
                errors.append("Expected exactly two package manifests")
            missing = sorted(REQUIRED - files)
            if missing:
                errors.append("Required files are missing: " + ", ".join(missing))
            # Catch the backend build's backup-inventory failure before upload.
            # The importer validates ZIP structure but later runs this same
            # migration-vs-inventory gate during npm run build.
            inventory_name = "backend/backup/authoritative-inventory.json"
            if inventory_name in files:
                try:
                    inventory = json.loads(z.read(inventory_name))
                    known = {row["table"] for row in inventory if isinstance(row, dict) and isinstance(row.get("table"), str)}
                    if len(known) != len(inventory):
                        errors.append("Backup inventory contains duplicate or malformed entries")
                    sql_names = {n for n in files if n.startswith("backend/prisma/migrations/") and n.endswith("/migration.sql")}
                    table_names: set[str] = set()
                    if "backend/prisma/schema.prisma" in files:
                        schema = z.read("backend/prisma/schema.prisma").decode("utf-8")
                        table_names.update(re.findall(r'@@map\("([a-zA-Z0-9_]+)"\)', schema))
                    for sql_name in sql_names:
                        sql = z.read(sql_name).decode("utf-8")
                        sql = re.sub(r"\bIF\s+(?:NOT\s+)?EXISTS\b", "", sql, flags=re.I)
                        sql = re.sub(r"\bpublic\.", "", sql, flags=re.I)
                        table_names.update(re.findall(r"CREATE\s+TABLE\s+([a-zA-Z0-9_]+)", sql, re.I))
                        table_names.update(re.findall(r"ALTER\s+TABLE\s+([a-zA-Z0-9_]+)", sql, re.I))
                    missing_backup = sorted(table_names - known - {"_prisma_migrations"})
                    if missing_backup:
                        errors.append("Backup inventory missing tables: " + ", ".join(missing_backup))
                except (ValueError, UnicodeDecodeError, KeyError, TypeError) as err:
                    errors.append(f"Backup inventory validation failed: {err}")
            if "backend/src/demo/demo-session.service.ts" in files:
                for required_demo in (
                    inventory_name,
                    "scripts/build_demo_vercel_bundle.py",
                    "docs/deployment/render.demo.yaml",
                    "docs/deployment/vercel.demo.json",
                ):
                    if required_demo not in files:
                        errors.append(f"Missing demo release prerequisite: {required_demo}")
            # The frontend generator used to silently put retired department
            # colours back after CI had already validated the checked-in map.
            # Inspect ZIP bytes without executing untrusted generator code.
            generator_file = "lexa-frontend/scripts/apply_lexa_palette.py"
            accent_file = "lexa-frontend/src/domain/shared/moduleAccents.ts"
            manifest_file = "lexa-frontend/package.json"
            if {generator_file, accent_file, manifest_file}.issubset(files):
                try:
                    generator = z.read(generator_file).decode("utf-8")
                    published = z.read(accent_file).decode("utf-8")
                    tree = ast.parse(generator, filename=generator_file)
                    definitions = [n.value for n in tree.body
                                   if isinstance(n, ast.Assign) and any(
                                       isinstance(t, ast.Name) and t.id == "ACCENT_SOURCE"
                                       for t in n.targets)]
                    if len(definitions) != 1:
                        errors.append("Missing single authoritative ACCENT_SOURCE in palette generator")
                    else:
                        expected = ast.literal_eval(definitions[0])
                        if expected.strip() != published.strip():
                            errors.append("Frontend palette generator would rewrite approved module colors during build")
                    if "write(SRC / 'domain/shared/moduleAccents.test.ts'" in generator:
                        errors.append("Frontend generator would erase maintained module color tests")
                    prebuild = json.loads(z.read(manifest_file))["scripts"]["prebuild"]
                    generate_command = "python3 scripts/apply_lexa_palette.py"
                    palette_command = "python3 scripts/check_module_group_palette.py"
                    if (generate_command not in prebuild or
                            prebuild.count(palette_command) < 2 or
                            prebuild.rfind(palette_command) <= prebuild.index(generate_command)):
                        errors.append("Frontend prebuild must recheck module colors after generator runs")
                except (ValueError, SyntaxError, KeyError, TypeError, UnicodeDecodeError) as err:
                    errors.append(f"Frontend palette generator preflight failed: {err}")
            # Run CRC and decompression check only after checking paths, so this also
            # handles Python's supported LZMA/Zlib ZIP compression methods.
            bad = z.testzip()
            if bad is not None:
                errors.append(f"Corrupted ZIP entry: {bad}")
    except (BadZipFile, OSError, RuntimeError, NotImplementedError) as e:
        errors.append(f"Cannot read ZIP: {e}")
    return errors, len(files)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    errors, count = problems(args.archive)
    if errors:
        print(f"FAIL: GitHub ZIP-import preflight ({len(errors)} problem(s))")
        for error in dict.fromkeys(errors):
            print(" -", error)
        return 1
    print(f"PASS: GitHub ZIP-import preflight ({count} files; no unexpected roots, paths, secrets, or corrupt members)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
