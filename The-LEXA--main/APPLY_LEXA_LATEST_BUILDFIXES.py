#!/usr/bin/env python3
"""Apply the two source repairs confirmed by the 31-Oct-2026 LEXA deploy logs.

Run from any directory with:
    python APPLY_LEXA_LATEST_BUILDFIXES.py

The script locates the repository from its own location, checks exact anchors,
keeps edits idempotent, and refuses to overwrite unexpected source shapes.
"""
from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent
FINANCE_FILE = ROOT / "backend/src/finance/finance-operations.controller.ts"
VERCEL_GUARD = ROOT / "lexa-frontend/scripts/fix_build_origin.py"

REPLACEMENT_REPAIR_CONFIG = '''def repair_config(text: str) -> str:
    """Ensure Vitest includes unit-test files without relying on formatting."""
    include = "include: ['src/**/*.test.{ts,tsx}'],"
    if include in text:
        return text

    # Match the test object with any indentation, spacing, or same-line properties.
    matches = list(re.finditer(r"\\btest\\s*:\\s*\\{", text))
    if len(matches) == 1:
        match = matches[0]
        line_start = text.rfind("\\n", 0, match.start()) + 1
        line_prefix = text[line_start:match.start()]
        indent_match = re.match(r"[ \\t]*", line_prefix)
        indent = indent_match.group(0) if indent_match else ""
        child_indent = indent + "  "
        insertion = (
            "\\n" + child_indent + "// Playwright E2E specs run separately through npm run test:e2e."
            + "\\n" + child_indent + include
        )
        # Keep an inline `test: { property: ... }` valid after inserting include.
        if text[match.end():match.end() + 1] not in ("\\n", "\\r"):
            insertion += "\\n" + child_indent
        return text[:match.end()] + insertion + text[match.end():]

    if len(matches) > 1:
        fail(f"found {len(matches)} test configuration objects; refusing an ambiguous edit")

    # Some Vite configs inherit test options and have no inline `test` object.
    # Add one to defineConfig only when there is exactly one clear config root.
    roots = list(re.finditer(r"export\\s+default\\s+defineConfig\\s*\\(\\s*\\{", text))
    if len(roots) != 1:
        fail("could not identify one Vitest test object or one defineConfig root")
    root = roots[0]
    line_start = text.rfind("\\n", 0, root.end()) + 1
    line_prefix = text[line_start:root.start()]
    indent_match = re.match(r"[ \\t]*", line_prefix)
    indent = (indent_match.group(0) if indent_match else "") + "  "
    child_indent = indent + "  "
    addition = (
        "\\n" + indent + "test: {"
        + "\\n" + child_indent + "// Playwright E2E specs run separately through npm run test:e2e."
        + "\\n" + child_indent + include
        + "\\n" + indent + "},"
    )
    return text[:root.end()] + addition + text[root.end():]
'''


def replace_exact(path: Path, old: str, new: str, label: str) -> bool:
    if not path.is_file():
        raise RuntimeError(f"Required file is missing: {path.relative_to(ROOT)}")
    content = path.read_text(encoding="utf-8")
    if new in content:
        print(f"Already fixed: {label}")
        return False
    count = content.count(old)
    if count != 1:
        raise RuntimeError(
            f"Refusing to edit {path.relative_to(ROOT)}: expected one exact anchor for {label}, found {count}."
        )
    path.write_text(content.replace(old, new, 1), encoding="utf-8")
    print(f"Fixed: {label}")
    return True


def repair_vercel_guard() -> bool:
    if not VERCEL_GUARD.is_file():
        raise RuntimeError(f"Required file is missing: {VERCEL_GUARD.relative_to(ROOT)}")
    content = VERCEL_GUARD.read_text(encoding="utf-8")
    if '"""Ensure Vitest includes unit-test files without relying on formatting."""' in content:
        print("Already fixed: Vercel Vitest configuration guard")
        return False

    pattern = re.compile(
        r"def repair_config\(text: str\) -> str:\n.*?(?=\n\ndef repair_reports\()",
        re.S,
    )
    matches = list(pattern.finditer(content))
    if len(matches) != 1:
        raise RuntimeError(
            "Refusing to edit fix_build_origin.py: expected one repair_config function before repair_reports, "
            f"found {len(matches)}."
        )
    updated = content[:matches[0].start()] + REPLACEMENT_REPAIR_CONFIG + content[matches[0].end():]
    # This is a source-level syntax check only; it does not execute the build script.
    compile(updated, str(VERCEL_GUARD), "exec")
    VERCEL_GUARD.write_text(updated, encoding="utf-8")
    print("Fixed: Vercel Vitest configuration guard (whitespace- and layout-tolerant)")
    return True


def main() -> int:
    try:
        replace_exact(
            FINANCE_FILE,
            "entryDate:new Date(period.startDate)",
            "entryDate:new Date(period.startsOn)",
            "Render depreciation accounting-period date field (startDate -> startsOn)",
        )
        repair_vercel_guard()
    except Exception as exc:  # print a concise actionable failure for the operator
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print("LEXA latest build fixes applied. Commit and push these files to main to trigger deployments.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
