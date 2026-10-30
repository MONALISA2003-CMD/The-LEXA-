#!/usr/bin/env bash
set -euo pipefail
BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git -C "$BASE" rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" ]]; then
  echo "ERROR: Run this from an extracted increment-5 folder inside a cloned The-LEXA repository." >&2
  exit 2
fi

printf '\n== Backend Prisma validation ==\n'
(cd "$ROOT/backend" && npx prisma validate)
printf '\n== Backend Prisma client generation ==\n'
(cd "$ROOT/backend" && npx prisma generate)
printf '\n== Backend build ==\n'
(cd "$ROOT/backend" && npm run build)
printf '\n== Frontend build ==\n'
(cd "$ROOT/lexa-frontend" && npm run build)
printf '\n== Patch whitespace / conflict checks ==\n'
git -C "$ROOT" diff --check
printf '\nAll available validation commands completed. Review git diff before committing.\n'
