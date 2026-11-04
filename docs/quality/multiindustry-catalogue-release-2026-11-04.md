# LEXA multi-industry catalogue — release and migration audit

## Scope

This source release adds unlimited supported industry combinations per business, backwards-compatible business profile migration, category parent/child relationships and tenant-owned field definitions, industry-specific product forms, product variants and variant stock visibility at POS, independent serialized unit registration, batch/lot lookup and receipt snapshots of variant descriptions, sales units and human-readable serialized identifiers. Existing business, product and sale IDs are preserved. No demonstration records are inserted.

## Existing account migration

`backend/prisma/migrations/20261104153000_multiindustry_catalogue_upgrade/migration.sql` adds columns and indexes; it does not drop or truncate tables. Existing `business_profiles.industry` values are mapped into `business_profiles.industries` only when the new selection is empty. Products without newly introduced attributes or product types remain valid. Historical sale rows retain their original snapshots and do not get fabricated variant/IMEI data. The migration must be applied by the authenticated production deployment process, after a database backup and rehearsal on a non-production branch. This package has not modified production database data.

## Evidence from local source validation

- Node backend tests: **216 passed, 0 failed**, including five new regression tests for migration, mixed industries, stock/serial workflows, and receipt snapshots.
- OpenAPI: **391 exact operations across 315 routes**, no orphan/missing operations.
- Route-to-frontend-adapter coverage: **17 verified**.
- Ledger: **15 posting workflows** and invariants passed.
- Database backup inventory: **169 table decisions** verified.
- Frontend generator sequence: completed successfully.
- TypeScript source parser: **261 source files, 0 syntax errors**; **762 relative imports**, one expected generated Prisma client import (`backend/src/generated/prisma/client` created by Prisma generation).
- Standalone strict TypeScript checks passed for the pure multi-industry business and catalogue selection logic.
- Full dependency-backed frontend Vite build, NestJS/Prisma build, browser E2E and authenticated live cross-module tests: **not run locally** because the environment cannot resolve the npm registry; must be checked by GitHub Actions and production smoke tests.

## Release gates

1. Run GitHub Actions importer against this ZIP and require all backend/frontend test/build gates green.
2. Rehearse the additive migration on a non-production Neon branch, check indexes, RLS, business profile backfill, and rollback plan; then deploy with backup.
3. Log in as an existing owner and confirm products, categories, stock, POS receipts, staff, roles and finance reports remain intact.
4. As two isolated tenants, verify no cross-tenant category, variant, serial, stock or receipt access.
5. Check a smartphone + perfume tenant, a fashion + household tenant, and a business with no selected industries. Confirm category-specific fields, variants, serialized checkout, batch checkout and receipts.
6. Confirm concurrent attempts to sell the last stock unit or the same serial cannot both commit; confirm sale idempotency, returns and partial-payment workflows.

## Known boundaries

- The new unit dropdown includes common Ugandan trade units. It is **not** a completed purchase-to-stock-to-sales package conversion engine; do not interpret it as automated crate/bottle or kg/sack conversion.
- Older receipts do not gain fictional serial numbers or variant descriptions. New receipt snapshots capture these values on new transactions.
- The existing business remains the same tenant with the same business data. This release does not auto-create categories, fake stock, sale documents or balances.
- A green source build alone is not a live production readiness certification.
