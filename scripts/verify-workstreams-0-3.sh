#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL must point to a disposable local PostgreSQL database (never production)." >&2
  exit 2
fi
(cd "$ROOT/backend" && npm install --no-audit --no-fund && npm run contract:check && npm run adapter:check && npm run ledger:coverage && npx prisma validate && npx prisma generate && npx prisma migrate deploy && npm run db:verify && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/test-tenant-rls.sql && npm run build && npm run test:tenant-http && npm test)
(cd "$ROOT/lexa-frontend" && npm install --no-audit --no-fund && npm run typecheck && npm test && npm run build)
echo "Workstreams 0-3 local verification completed against the supplied disposable database. Review the audit matrix and provider/deployment gates before production."
