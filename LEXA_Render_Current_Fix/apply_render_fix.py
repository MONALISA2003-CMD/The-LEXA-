#!/usr/bin/env python3
"""Apply the verified LEXA Render TS2339 fix to a matching checkout.

Run from the repository root: python3 LEXA_Render_Current_Fix/apply_render_fix.py
The script only edits the file when its Git blob hash and the exact old expression match.
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

RELATIVE_PATH = Path("backend/src/finance/finance-operations.controller.ts")
EXPECTED_BLOB_SHA = "a66ae048b3a77aedf05d83cba2e3441ce0a10f3c"
OLD = "entryDate:new Date(period.startDate).toISOString().slice(0,10)"
NEW = "entryDate:period.startsOn.toISOString().slice(0,10)"


def git_blob_sha(data: bytes) -> str:
    header = b"blob " + str(len(data)).encode("ascii") + b"\0"
    return hashlib.sha1(header + data).hexdigest()


def main() -> int:
    path = Path.cwd() / RELATIVE_PATH
    if not path.is_file():
        print(f"ERROR: {RELATIVE_PATH} was not found. Run this script from the repository root.", file=sys.stderr)
        return 2

    original = path.read_bytes()
    actual_sha = git_blob_sha(original)
    if actual_sha != EXPECTED_BLOB_SHA:
        print("ERROR: source file differs from the revision this patch was reviewed against.", file=sys.stderr)
        print(f"Expected Git blob: {EXPECTED_BLOB_SHA}", file=sys.stderr)
        print(f"Found Git blob:    {actual_sha}", file=sys.stderr)
        print("No changes were made. Inspect the current file and adjust the patch manually.", file=sys.stderr)
        return 3

    try:
        source = original.decode("utf-8")
    except UnicodeDecodeError:
        print("ERROR: source file is not valid UTF-8. No changes were made.", file=sys.stderr)
        return 4

    count = source.count(OLD)
    if count != 1:
        print(f"ERROR: expected exactly one occurrence of the stale expression; found {count}.", file=sys.stderr)
        print("No changes were made.", file=sys.stderr)
        return 5

    repaired = source.replace(OLD, NEW, 1)
    if OLD in repaired or repaired.count(NEW) != 1:
        print("ERROR: post-edit verification failed. No changes were made.", file=sys.stderr)
        return 6

    path.write_bytes(repaired.encode("utf-8"))
    updated_sha = git_blob_sha(path.read_bytes())
    print("Applied the verified LEXA Render TypeScript fix.")
    print(f"File: {RELATIVE_PATH}")
    print(f"Changed: {OLD}")
    print(f"To:      {NEW}")
    print(f"New Git blob: {updated_sha}")
    print("Next: run the backend build and tests, then commit and push to main to trigger Render auto-deploy.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
