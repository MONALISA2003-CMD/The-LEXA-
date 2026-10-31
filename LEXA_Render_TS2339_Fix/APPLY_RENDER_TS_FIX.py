#!/usr/bin/env python3
"""Apply the exact, verified LEXA Render TS2339 fix to the repository checkout."""
from __future__ import annotations
from hashlib import sha1
from pathlib import Path
import sys

ROOT = Path.cwd()
REL = Path("backend/src/finance/finance-operations.controller.ts")
EXPECTED_BLOB = "a66ae048b3a77aedf05d83cba2e3441ce0a10f3c"
OLD = "entryDate:new Date(period.startDate).toISOString().slice(0,10)"
NEW = "entryDate:period.startsOn.toISOString().slice(0,10)"


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)

path = ROOT / REL
if not path.is_file():
    fail(f"Run this script from the repository root; missing {REL}")
content = path.read_text(encoding="utf-8")
blob = content.encode("utf-8")
actual = sha1(b"blob " + str(len(blob)).encode("ascii") + b"\0" + blob).hexdigest()
if NEW in content and OLD not in content:
    print("Already fixed: AccountingPeriod.startsOn")
    raise SystemExit(0)
if actual != EXPECTED_BLOB:
    fail(
        "Source revision differs from the audited revision. "
        f"Expected Git blob {EXPECTED_BLOB}; found {actual}. Review the file before editing."
    )
if content.count(OLD) != 1:
    fail(f"Expected exactly one stale reference, found {content.count(OLD)}; no file written.")
updated = content.replace(OLD, NEW, 1)
path.write_text(updated, encoding="utf-8")
print(f"Fixed {REL}: period.startDate -> period.startsOn.toISOString()")
print("Next: run backend Prisma validation and TypeScript build, then commit and push to main.")
