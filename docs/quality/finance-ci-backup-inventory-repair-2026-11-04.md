# LEXA Finance CI repair — 4 November 2026

**GitHub Actions run:** 41788566336  
**Failed job:** 126436307086, `Validate, replace and verify the source tree`  
**Starting package:** `LEXA_FINANCE_EXECUTIVE_SAPPHIRE_UPLOAD_20261104.zip`

## Exact root cause

The new tenant- and branch-scoped `finance_budgets` table was declared in `backend/prisma/schema.prisma` and created by `backend/prisma/migrations/20261104090000_finance_budgets/migration.sql`, but was omitted from `backend/backup/authoritative-inventory.json`.

`backend/scripts/check-backup-inventory.mjs` discovers tables from the Prisma schema and SQL migrations, then **fails closed** if any table lacks an explicit backup disposition. The importer ran the check as part of `npm run build` and stopped with:

```
Backup inventory missing tables: finance_budgets
```

This is a production-safety check: bypassing it would silently exclude new approved budget records from the platform backup and recovery scope.

## Corrective changes

1. Registered `finance_budgets` in `backend/backup/authoritative-inventory.json` with `disposition: authoritative`, `domain: finance`, and a rationale that specifies tenant-scoped budget records and approval history.
2. Added a regression test to `backend/test/finance-production-isolation.test.mjs` verifying that the budget table has **exactly one** authoritative Finance backup-inventory entry and that the backup worker selects authoritative data with a tenant ID filter.
3. Made **no changes** to the live database, customer financial data, Prisma migration, row-level security policy, transaction posting logic, or deployment settings.

## Actual local verification

- Backend inventory JavaScript validator: **passed**, 169 policy entries covering 152 discovered schema/migration table references.
- Backend inventory Python validator: **passed**.
- Backend Node test suite: **175 passed; 0 failed** (including new regression test).
- OpenAPI contract: **374 operations across 302 routes**, exact match.
- Backend adapter coverage: **17 adapters**, passed.
- Python Finance analytics tests: **6 passed**.
- TypeScript/TSX syntax parser: **246 source files, 0 syntax diagnostics**.
- Source ZIP root structure and content safety: checked separately after packaging.

## Limits and next CI stage

The referenced GitHub job reached the backup inventory checker **after** all 174 preexisting backend tests and the 374-operation API contract succeeded. Its backend TypeScript/Nest compilation and frontend test/typecheck/Vite build were **not reached**. This repair removes the confirmed gate, but cannot certify later stages until they run.

The local execution environment cannot resolve `registry.npmjs.org` (DNS `EAI_AGAIN`) and has no frontend/backend npm dependencies installed. Consequently a full Nest compiler build and Vite/TypeScript application build **were not performed locally**; passing TypeScript parsing alone does not prove type safety.

After uploading the corrected root-level ZIP as the **only new ZIP in one GitHub commit**, inspect the next import run's backend compilation and frontend build. Do not treat the current ZIP as production certified until those checks pass. Do not execute migrations or delete finance data for this repair.
