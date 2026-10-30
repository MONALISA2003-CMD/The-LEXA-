#!/usr/bin/env bash
set -euo pipefail

BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git -C "$BASE" rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" ]]; then
  echo "ERROR: Run this from an extracted increment-5 folder inside a cloned The-LEXA repository." >&2
  exit 2
fi

for required in backend/prisma/schema.prisma lexa-frontend/src/modules/operations/moduleCatalog.ts; do
  [[ -f "$ROOT/$required" ]] || { echo "ERROR: Missing repository file: $required" >&2; exit 2; }
done

echo "Checking source patches against $(git -C "$ROOT" rev-parse --abbrev-ref HEAD)..."
git -C "$ROOT" apply --check "$BASE/patches/schema-stock-movement.patch"
git -C "$ROOT" apply --check "$BASE/patches/module-catalog-accounting.patch"

# Overlay only the new/updated implementation files. Existing operational source files are untouched.
cp -a "$BASE/backend/." "$ROOT/backend/"
cp -a "$BASE/lexa-frontend/." "$ROOT/lexa-frontend/"

git -C "$ROOT" apply "$BASE/patches/schema-stock-movement.patch"
git -C "$ROOT" apply "$BASE/patches/module-catalog-accounting.patch"

echo
echo "Increment 5 files applied to: $ROOT"
echo "Next: run ./increment-5/verify-increment-5.sh, inspect git diff, then commit/push through your normal review process."
