# LEXA GitHub Actions run 41975333797 — Prisma/brand-model parity and migration RLS repair

## Failing job and exact cause

- Run: https://github.com/MONALISA2003-CMD/The-LEXA-/actions/runs/41975333797/job/127072734454
- ZIP import and repository validation: passed.
- Backend unit tests: 264 passed.
- API contract, route uniqueness and backup inventory: passed.
- `nest build`: blocked with four errors in `src/core/core.controller.ts` (lines 987, 1033, 1034 and 1051): `TS2353` and `TS2339` for `catalogBrandId`/`catalogModelId`.
- Frontend build and auto-commit: skipped, so this historical workflow does not certify them.

The four-division SQL migration added the two nullable columns to the `products` table and the controller used them for creation and update, but the Prisma `Product` model omitted the corresponding mapped scalar fields. `prisma generate` therefore created a TypeScript Product client without the columns. This is **schema/client drift**, not a failing runtime test.

## Applied source repair

1. `backend/prisma/schema.prisma`: add nullable UUID `catalogBrandId` and `catalogModelId` mapped respectively to `catalog_brand_id` and `catalog_model_id`; add index declarations that match the existing SQL migration. The existing Prisma primary key, tenant ID, SKU and historical relationships remain untouched.
2. `backend/prisma/migrations/20261105090000_specialized_devices_brands_compatibility/migration.sql`: fix the dynamic tenant RLS policy string. The original source emitted malformed `NULLIF`/`current_setting` SQL. The corrected policy compiles to a `USING` and `WITH CHECK` expression equivalent to:

   ```sql
   tenant_id::text = NULLIF(current_setting('app.tenant_id', true), '')
   ```

3. `backend/test/four-division-prisma-migration-parity.test.mjs`: three regression tests for Prisma column/schema parity, RLS policy quoting and non-destructive migration content. These run in the existing backend test gate.

The repair makes no change to current product/serial IDs, ledger entries, stock quantities, receipts, and existing customer data. The existing migration remains additive.

## Verification performed locally

- Backend unit tests: **267/267 passed**, including three new tests.
- OpenAPI: **410 operations / 329 routes** matched.
- Fastify route uniqueness: **433 registrations / 27 controllers**, no duplicates.
- Frontend adapters: **17 checks passed**.
- Backup inventory: **174 decisions** covered.
- Ledger coverage: **15 source workflows** passed.
- Industry catalogue generator: **13 industries**, contract synchronized.
- Source syntax: **270 TS/TSX/JS files** checked, **798 relative imports**, no unresolved imports or parser errors (generated Prisma client is created in CI).
- ZIP integrity and GitHub import layout: verified.

## Remaining release gates — do not skip

1. Upload exactly **one new ZIP** to the repository root on `main`, without deleting another ZIP in the same commit. The import workflow validates one changed root-level ZIP.
2. Require the **complete** GitHub import workflow to pass, especially Prisma generate/validate, Nest build, frontend tests and Vite build, then verify the source-update commit.
3. Before deploying the new Prisma migration on production: make a verified PostgreSQL backup and rehearse this migration against an isolated staging branch. Run a SQL inspection of all new tenant policies and restricted roles, and check that legacy products retain their IDs and prices.
4. Smoke-test creating and editing a branded model, device compatibility approval, serial receiving, a sale, after-sales lookup, and owner-versus-employee tenant isolation. Check product fields survive an authorized database backup/restore.
5. Observe Render deployment start, migration status, API readiness and Vercel frontend deployment to their new source commits. Roll back application code if the new stack fails; follow database restore procedures rather than deleting history.

**Environment limitation:** the local runtime cannot resolve `registry.npmjs.org`, so a full dependency-backed Nest build, Prisma generation, frontend Vite build, database migration and production smoke test could not be run locally. Their status is **not verified** by this report.
