# LEXA Render / Neon / Vercel release recovery audit

**Review date:** 2026-11-05

## Incident evidence

- GitHub source commit: `e5d999cd1ba9825be51d36288526e63cca6caabb`.
- Render service: `lexa-backend-api-live`; deploy `dep-dbm6ovqvcj2c738642u0` reported `update_failed`. Docker image compiled and pushed; startup stopped before API handover.
- Neon production project/database: `lexa-backend` / `lexa`, branch `production`. Prisma migration `20261105170000_inventory_receipts_identifiers_fitment_bundles` recorded a failed attempt with PostgreSQL `42702` (ambiguous `tenant_id`). Subsequent retry encountered Prisma `P3009`.
- Production database was inspected read-only. The six new tables and all twelve expected new columns were absent when checked; the failed Prisma migration record remained. No direct production schema mutations were performed in this audit.
- Connected Vercel project `lexa_review`, deployment `dpl_4pPb7aPYL7bjBCT48Kp83oxUUhDf` of the same commit reported `ERROR` because the frontend-root checkout could not access `../scripts/sync_industry_catalogue.py`.

## Repairs included

1. Qualify `s.tenant_id,s.id` in historical physical-unit backfill. Both `inventory_serials` and `products` expose those names, making unqualified references ambiguous.
2. Declare `UNIQUE(tenant_id,id)` on `product_bundles` so the `product_bundle_components(tenant_id,bundle_id)` composite foreign key has a valid PostgreSQL parent key. This second defect was discovered while applying the full migration on an isolated branch.
3. Extend the guarded migration-recovery preflight to recognize this *specific* failed migration. It proves that all six tables and twelve columns remain absent before calling `prisma migrate resolve --rolled-back`. It does not reset the DB, delete customer data, or skip migration execution. Existing old-migration recovery is preserved. The coordinator's direct-session migration lock serializes recovery and retry.
4. Replace frontend prebuild's unconditional `../scripts` dependency with `verify_catalogue_sources.mjs`. When full monorepo files exist, it executes both exact catalogue synchronization checks. If they are unavailable, it accepts a frontend-only build **only** when `VERCEL=1` and all required checked-in catalogue contracts exist; non-Vercel and incomplete frontends fail closed.
5. Add regression tests for SQL owner qualification, composite bundle ownership, safe Prisma recovery, and frontend-root build behavior.

## Validation completed

| Check | Result | Limit |
| --- | --- | --- |
| Corrected SQL executed in Neon isolated branch `lexa-receiving-migration-validation-20261105` | **PASS — 42 statements** within one database transaction | Branch is not production; historical data volume is limited |
| Stage schema | **PASS** — 6 new tables, 6 RLS policies, 3 key indexes, 1 serial identifier trigger | Live workflow/API not exercised |
| Backend regression suite | **PASS — 315 / 315 tests** | Tests do not replace live transaction concurrency tests |
| Catalogue synchronization | **PASS** — 13 industries, 282 nodes, 52 published family policies | Checked-in artifacts |
| OpenAPI / API adapter coverage | **PASS** — 442 operations, 17 adapters | Source contracts only |
| Route uniqueness | **PASS** — 465 registrations / 29 controllers | Source audit |
| Ledger and backup invariants | **PASS** — 15 workflows and 185 backup table decisions | Source checks |
| Full-monorepo frontend prebuild check | **PASS** | Does not perform entire Vite build |
| Frontend-only Vercel simulation | **PASS**, with explicit negative tests | Not a live Vercel deployment |
| GitHub Actions complete workflow and frontend `tsc -b && vite build` | **NOT VERIFIED AFTER REPAIR** | Dependency installation unavailable locally; GitHub must run |
| Neon production migration state after deployment | **NOT APPLIED** | Needs reviewed source import and Render rollout |
| Live Render health / Vercel readiness | **NOT GREEN VERIFIED** | Requires new successful deployments |

## Recovery and release sequence

1. Review the source diff. Keep the existing `.github/` workflows and npm lockfiles in the GitHub repository; **do not include** either in the clean source-import ZIP. The GitHub importer rebuilds/verifies locks before invoking CI. Do not upload a nested repository ZIP.
2. Submit the attached ZIP through the existing repository-refresh workflow. Wait for the complete GitHub Actions run to pass **backend tests/build and frontend tests/build** before considering this a release candidate.
3. The Render auto-deploy will acquire its migration guard. On the exact observed failed inventory migration, the recovery script first checks for missing schema objects; only if the schema is still untouched will it mark the failed attempt rolled back and retry the corrected SQL through `prisma migrate deploy`.
4. Do **not** manually mark the migration as `--applied`, use `prisma migrate reset`, `prisma db push`, truncate data, or edit `_prisma_migrations` directly. If the preflight detects any partial table or column, stop and inspect production before taking further action.
5. Verify `_prisma_migrations` has a `finished_at` record for the corrected migration; confirm 6 new tables, RLS, identifier trigger, API readiness, serial/IMEI duplicate rejection, receiving and bundle stock consistency.
6. Check the new Vercel `lexa_review` production deployment is `READY`, then inspect its `/api/v1/health/ready` proxy and frontend navigation. A Vercel **READY** status by itself does not prove the backend is ready.
7. Review PostgreSQL `pg-connection-string` SSL-mode deprecation warnings separately. They were non-fatal and are not the cause of this deployment failure; confirm the production certificate-verification policy before editing connection strings.

**Production remains pending until the new GitHub, Render, and Vercel runs succeed.** The isolated staging validation is evidence for the SQL fix, not a claim of a successful production migration or full operational acceptance.
