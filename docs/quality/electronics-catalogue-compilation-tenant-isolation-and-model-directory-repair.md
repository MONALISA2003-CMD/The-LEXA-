# LEXA electronics category, brand and model directory: CI and security repair

**Date:** 5 November 2026  
**Failed GitHub Actions run:** [41988554301](https://github.com/MONALISA2003-CMD/The-LEXA-/actions/runs/41988554301)  
**Affected commit:** `9eb61993b68c52ce3878104c02ccb052b6c40983`  
**Release type:** Additive, tenant-safe source replacement ZIP for the existing importer.

## 1. Exact CI failure and fix

- GitHub imported the ZIP, validated layout and passed **275/275 backend tests**, catalogue synchronization, 427 OpenAPI operations, 450 Fastify registrations and inventory backup checks.
- Nest build failed before frontend CI with `TS7022` at `src/catalog/electronics-v2.controller.ts:125`. The awaited Prisma category-creation result (`row`) had an inference loop inside an interactive transaction callback.
- Fix: explicitly type the result as `const row: {id:string}=await tx.category.create(...)` in `backend/src/catalog/electronics-catalogue.controller.ts`, preserving the real Prisma `create` operation and the unchanged category UUID. A strict TypeScript compiler regression test checks this exact source fragment.
- No `any` cast, suppression directive or removal of tenant checks is involved.

## 2. Deeper runtime security issue addressed

`PrismaService` wraps a declared list of model delegates with a transaction-local runtime role and `app.tenant_id` context. Several recently added models were missing from `MODEL_DELEGATES`; calling them directly outside an explicit `$transaction` could use the underlying connection without the normal tenant-context guard. Added:

- `productPackage`
- `catalogBrand`, `catalogDeviceModel`
- `accessoryCompatibility`, `inventoryUnitInspection`
- `catalogCategoryAlias`, `catalogBrandAlias`, `catalogBrandMergeProposal`
- `catalogModelSpecRevision`, `catalogFamilyPolicy`

Added `backend/test/prisma-tenant-delegate-coverage.test.mjs`, which compares all directly invoked `this.prisma.<model>.*` references to the Prisma model schema and asserts each is registered in the tenant wrapper. This prevents regression when later electronics modules are introduced. Real PostgreSQL RLS and two-tenant negative testing remain mandatory before production.

## 3. Requirements audit: electronics catalogue foundation

| Requirement | Implementation state |
| --- | --- |
| Stable category codes and historical aliases | Canonical manifest with `ELEC.*` codes; alias collision validation now also covers canonical codes and slash-delimited breadcrumbs |
| Taxonomy and family coverage | 282 nodes, 221 selectable leaves, 52 published families, 13 unchanged industry codes |
| Searchable custom owner categories | New authenticated `GET /workspaces/:workspaceId/catalog/v2/taxonomy/custom`, showing existing category IDs and full breadcrumbs; `CUSTOM.C<uuid-without-dashes>` is only a stable display identity and is not silently persisted |
| Explicit category adoption / legacy linking | Existing API remains; categories are not bulk-adopted or silently renamed; custom category selection now preserves the existing product type when the category has no template |
| Tenant-scoped brand aliases | Existing alias API, normalized collision trigger and non-destructive merge proposals retained |
| Versioned manufacturer reference specs | Draft creation, append-only revisions, reviewed/rejected states and source provenance; browser UI now offers edit-as-new-revision, approve and reject |
| Family and 13-industry permissions | Controller reads and writes gated by business membership; V2 model queries restrict to active families, while historical models with no V2 family remain readable; generator verifies leaf industry codes are a subset of family industry codes |
| Typed validation and historical edit path | Existing requiredness, enum, boolean, unit and safe legacy compatibility rules preserved |
| Backend/browser/mobile/public contract parity | Generated from `scripts/electronics-catalogue-v2.v1.json` and checked against the immutable database policy seed hashes |
| Preview/import tools | Read-only plan remains default in the renamed `scripts/plan_electronics_category_import.py`; applying categories requires an explicit authorized action |

## 4. Descriptive filenames

- `backend/src/catalog/electronics-catalogue.controller.ts`
- `backend/src/catalog/electronics-catalogue-policy.ts`
- `lexa-frontend/src/modules/products/ElectronicsCatalogueDirectory.tsx`
- `lexa-frontend/src/data/remote/apiElectronicsCatalogue.ts`
- `lexa-frontend/src/modules/products/electronics-catalogue-directory.css`
- `scripts/plan_electronics_category_import.py`
- `backend/test/electronics-catalogue-typing-and-custom-category.test.mjs`
- `backend/test/prisma-tenant-delegate-coverage.test.mjs`

**Exception:** The Prisma migration folder `20261105120000_electronics_catalogue_v2_phase1` keeps its historical identity. Renaming a migration that may have been applied can break Prisma migration history or trigger duplicate ALTER TABLE commands. Avoid changing this name.

## 5. Verified local checks

- **284/284 backend tests passing**, including 9 newly added tests compared with the failed 275-test run.
- Electronics manifest synchronization: 282 nodes, 221 leaves, 52 family policies.
- Existing 13-industry manifest synchronization: passed.
- OpenAPI exact parity: **428 operations across 344 routes**.
- Fastify route uniqueness: **451 registrations across 28 controllers**.
- Route adapter coverage: 17 backend-backed adapters.
- Inventory backup: 179 table decisions; ledger: 15 posted source workflows.
- TypeScript/TSX AST syntax validation: 276 source files, zero syntax errors; 811 checked relative imports, with one expected generated Prisma-client import unavailable before `prisma generate`.
- Frontend prebuild source-generation scripts executed on a separate copy and retained the new directory UI and imports.
- A strict-TS test compiled the Prisma category-create narrowing fixture.

**Not verified locally:** a complete dependency-backed `nest build`, `tsc -b`, Vite production build, PostgreSQL migration, two-tenant RLS HTTP tests, Render deployment or authenticated end-to-end browser workflow. No npm registry DNS connectivity was available in this sandbox. These remain release gates, not implied successes.

## 6. Safe release procedure for an existing LEXA business

1. Upload **exactly one new ZIP** to the **root** of `main` in `MONALISA2003-CMD/The-LEXA-`, without deleting older ZIPs in the same commit. Allow `.github/workflows/repository-import.yml` to import it.
2. Confirm GitHub Actions completes all steps: import, canonical layout, backend tests+`nest build`, frontend tests+`tsc -b`+Vite build and source commit. If not, inspect the new job log; do not deploy partial source.
3. Before any database migration, record the current deployed SHA and obtain a **tested PostgreSQL backup**. Restore it into isolated staging and apply migrations there, including the preserved-name catalogue migration.
4. Compare historical category, product, variant, IMEI/serial, lot, stock-movement, sale, return and ledger IDs and counts before/after migration. Run tenant-A/tenant-B read and write denial tests, duplicate brand alias races and model-review role tests.
5. Test feature-phone category search, brand creation, model drafting/revision/review, legacy custom-category selection, and explicit category adoption using staging accounts. Test frontend with a real browser.
6. Deploy a proven GitHub source commit and completed database migration to Render/Vercel; verify live migration status, API health and read-only catalog queries. For rollback, prefer source/feature rollback while retaining additive schema and all data.

This package contains no user account credentials and does not apply any live database change by itself.
