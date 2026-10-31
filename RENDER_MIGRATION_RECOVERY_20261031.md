# LEXA Render / Prisma Migration Recovery — 31 October 2026

## Root cause

Render's backend image built successfully. Startup then failed when Prisma applied
`20261030320000_platform_catalog_finance_rls` with PostgreSQL error `42830`.

That migration created two tenant-scoped foreign keys targeting `(tenant_id, id)`:

- `bank_reconciliation_matches(tenant_id, reconciliation_id)` → `bank_reconciliations(tenant_id, id)`
- `bank_reconciliation_matches(tenant_id, statement_line_id)` → `bank_statement_lines(tenant_id, id)`

Both parent tables had globally unique `id` primary keys but did not declare a matching
composite unique key. PostgreSQL requires the referenced composite key to be backed by a
unique or primary-key constraint.

The Workstream 5 migration had the same issue in the quality-inspection model:
`quality_inspection_results(tenant_id, plan_check_id)` references
`quality_inspection_plan_checks(tenant_id, id)`; its parent table also needed
`UNIQUE (tenant_id, id)`.

## Included repairs

1. Add `UNIQUE (tenant_id, id)` to `bank_statement_lines` and `bank_reconciliations` in
   the failed `20261030320000` migration.
2. Mirror those keys as `@@unique([tenantId, id])` in the Prisma schema.
3. Add `UNIQUE (tenant_id, id)` to Workstream 5's `quality_inspection_plan_checks` table.
4. Add a narrowly scoped startup recovery script. It checks `_prisma_migrations` for this
   exact failed migration, and only when the row is still failed (started, not finished,
   not rolled back) runs:
   `prisma migrate resolve --rolled-back 20261030320000_platform_catalog_finance_rls`.
   The normal `prisma migrate deploy` command then retries the corrected migration and
   applies the pending Workstream 5 migration. Other migration failures are not swallowed.

## Database safety check

The connected Neon database was checked read-only. The `_prisma_migrations` row for the
failed migration existed, and the tables it would have created—including
`workspace_invitations`, `unit_of_measures`, `bank_accounts`, `bank_statement_lines`,
`bank_reconciliations`, `cash_sessions`, and `tax_rules`—were absent. This confirms that
PostgreSQL rolled back the failed migration transaction; there were no partial tables to
manually drop. No production DDL or data mutation was performed as part of this patch.

## Verification performed

- Backend tests: 13/13 passed.
- OpenAPI contract: 214 operations across 167 routes, exact match.
- Route-to-adapter coverage: passed (16 domain adapters).
- Ledger posting coverage: passed (9 source workflows and balance/idempotency checks).
- Static composite-FK audit: all declared composite foreign keys have matching unique or
  primary-key targets across all 18 migrations.
- Recovery script: Node syntax check passed.

The current Render logs already show that Docker image build and NestJS compilation pass;
the failure is during database migration at container startup.

## Apply this patch

The repository's existing `LEXA ZIP Extractor` GitHub Action extracts ZIP entries into the
repository root, removes the ZIP, and commits the extracted files to `main`. Upload this
patch ZIP to the root of `MONALISA2003-CMD/The-LEXA-` on the `main` branch. Do not add a
parent `The-LEXA--main/` folder around the paths in the archive.

Once the extractor commits the files, Render's configured `main` auto-deploy should build
and restart `lexa-backend-api-live`. In the new Render logs, confirm that the failed
`20261030320000` migration is marked rolled back, the corrected migration applies, the
Workstream 5 migration applies, and Nest starts successfully.

The patch has not been pushed by the ChatGPT GitHub connection: its write requests returned
HTTP 403 (`Resource not accessible by integration`). The ZIP is therefore ready for the
repository's existing upload-and-extract workflow; production remains unchanged until that
commit is made and Render redeploys.
