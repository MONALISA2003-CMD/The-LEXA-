# LEXA Electronics Catalogue V2 — taxonomy, directory and policy release

**Release class:** additive, read-safe Phase 1; **date:** 2026-11-05; **scope:** existing 13 industries, no new industry codes.

## Corrective build and catalogue audit (2026-11-05)

- GitHub Actions run `41988554301` passed all 275 existing backend tests but failed `nest build` at `electronics-v2.controller.ts:125` with `TS7022` on the category-create result. This release explicitly types the Prisma-created category ID and introduces a strict TypeScript compile regression test, plus a source AST/relative-import audit.
- Deep runtime security fix: `PrismaService` now wraps the new catalogue, manufacturer/compatibility, inspection and product-package model delegates with transaction-scoped `DATABASE_RUNTIME_ROLE` and `app.tenant_id` context. A schema-aware regression test fails if future controller code invokes any Prisma model delegate without registration in the tenant-scoped proxy. This closes a missing context path not covered by previous source-only catalogue tests.
- The category directory now searches both canonical V2 nodes and **existing tenant-owned custom/historical categories**, showing actual breadcrumbs and a stable display code derived from each unchanged category UUID. Reading/searching never assigns codes, creates inventory or migrates products; selection uses the existing category ID.
- The frontend now supports both creating immutable draft revisions and approving/rejecting drafts, with the existing API audit trail and role checks. Manufacturer model listing respects active industry/family policies while preserving legacy unclassified model reads. Reviewed manufacturer references require source provenance; draft references may remain incomplete for later review. The generator also rejects alias/canonical-code collisions and mismatched family/leaf industry permissions.
- New source files are named after their functions: `electronics-catalogue.controller.ts`, `electronics-catalogue-policy.ts`, `ElectronicsCatalogueDirectory.tsx`, `apiElectronicsCatalogue.ts`, `electronics-catalogue-directory.css`, and `plan_electronics_category_import.py`. The released ZIP filename uses taxonomy, brand and model terms rather than implementation phase numbers.
- **Important migration identity exception:** `20261105120000_electronics_catalogue_v2_phase1` retains its original Prisma migration identity. Renaming an already-used migration risks checksum drift and duplicate ALTER TABLE application. Keep the folder name unchanged even though the source and release filenames are descriptive.
- No automated production database migration, browser test or successful Nest/Vite full build is claimed locally. GitHub CI plus a staging migration and tenant-ID parity audit remain mandatory.

## What ships

- `scripts/electronics-catalogue-v2.v1.json` is the source-of-truth contract: 10 electronics divisions, 282 hierarchy nodes, 221 selectable taxonomy leaves and 52 versioned family specification policies. Feature phones have a dedicated `feature_phone` profile with IMEI1, optional IMEI2, SIM capabilities, keypad, FM radio, torch, battery, charging and storage attributes.
- `scripts/sync_electronics_catalogue_v2.py --check` verifies the backend, frontend, browser-public and mobile/public JSON contracts, the previous 51 legacy product presets, 13 industry codes, every path/alias and the SQL-seeded policy hashes.
- Tenant-scoped category V2 codes (`ELEC.*`), legacy path aliases and owner-approved adoption with parent, brand and model identities preserved. The old user-defined category builder remains available without forcing an industry template.
- Tenant-scoped normalized brand aliases and **proposals** to merge duplicates (no automatic brand merges, product moves, deletions or alias reassignment).
- Manufacturer model references with family/product-type validation, typed specs, source provenance, immutable revisions and explicit draft/review/reject workflow.
- A searchable V2 taxonomy browser, explicit category preview/adopt/link, manufacturer directory and specification editor. This is a read-safe V2 reference layer: detailed subtype-aware product wizard, unit scanning, sales and finance changes are later phases.
- 17 audited endpoints within `workspaces/:workspaceId/catalog/v2`, all protected by a valid business session. Write endpoints also require `catalog.write` and `inventory.approve` and valid CSRF. Tenant isolation enforced at database level by explicit RLS; 13-industry allowlist enforced on API.
- `scripts/plan_electronics_category_import.py` offline dry-run path and deliberately explicit online apply mode. Never imports all categories or overwrites historical categories by default.

## No-mutation guarantees

The migration adds nullable `categories.catalog_code`, `categories.taxonomy_version`, manufacturer reference columns, and five new tables. It does **not** delete/rename existing categories, brands, products, variants, IMEIs, lots, movement, sale, ledger or customer IDs. It does not automatically create products, open stock, change stock balances, move money, or reclassify old categories. Unrecognized legacy product types remain editable via their existing compatibility path.

**Existing accounts:** a category can be linked to a V2 code only after a tenant-authorized manager explicitly previews and approves its matching historical breadcrumb. If a legacy category already occupies a path, creating a duplicate V2 path is blocked. Actual brand merge is not part of this release.

**Do not run `--apply` on production without a verified backup, approved workspace, and staging rehearsal.** The frontend adoption button applies a user-authorized category change only; all counts/serials remain untouched.

## Staging migration and rollback gates

1. Record the deployed Git commit and all existing categories/products/variants/IMEIs/stock movements/sales/returns/financial ledger counts and hashes using the established `backend/scripts/capture-catalog-history.mjs` audit. Take and test a tenant-authorized full database backup.
2. Restore a copy of the live database into **isolated staging**. Apply all pending Prisma migrations (`prisma migrate deploy`) using the migration role. Do not run destructive `migrate reset` or `db push --accept-data-loss`.
3. Validate migration SQL and RLS: `catalog_category_aliases`, `catalog_brand_aliases`, `catalog_brand_merge_proposals`, `catalog_model_spec_revisions` are FORCE-RLS tenant scoped; global `catalog_family_policies` allows application reads only. Attempt cross-tenant reads/writes and verify rejection.
4. Verify the existing products, serials, sales, return, ledger and category IDs have identical counts and checksums. New schemas should not change them. Run the repository `backend/scripts/check-backup-inventory.mjs` and actual backup/restore parity checks.
5. With a staging owner account, search `ELEC.MOB.FEATURE.GSM`, preview an old `Phones > Feature phones > Keypad phones` category, link it, and confirm its **original UUID** and all product references are preserved. Adopt one new, nonconflicting leaf under an active industry; confirm ancestors, policy and audit records.
6. With two different staging tenant accounts, create a `Samsung` brand in both; aliases must not cross tenants. Attempt alias-to-existing-brand collision in one tenant; it must fail. Submit a merge proposal; both brands and all products must remain unchanged.
7. Create a feature-phone manufacturer model with IMEI policy and typed specs, record provenance, revise its specs, approve or reject; previous revision snapshots must be immutable. Try unknown enum, negative measurement, mismatched product family, unauthorized role and retired industry. All must fail.
8. Run frontend build and authenticated browser tests of taxonomy search, breadcrumb filtering, brand aliases/model editor and category adoption with staff permissions.
9. For rollback, **prefer rollback of code/feature exposure with the additive tables retained**. Do not roll back by dropping the newly created tables after users start writing model references; recover from a verified backup only under a tested disaster-recovery plan.
10. Deploy to production after green GitHub backend/frontend CI and staging approval. Perform read-only post-release historical audit and monitor logs for RLS, duplicate-alias, model policy and migration exceptions.

## CI commands

```bash
python3 scripts/sync_electronics_catalogue_v2.py --check
python3 scripts/sync_industry_catalogue.py --check
python3 backend/scripts/check-openapi-coverage.py
python3 backend/scripts/check-route-adapter-coverage.py
node backend/scripts/check-route-uniqueness.mjs
node backend/scripts/check-backup-inventory.mjs
cd backend && npm ci && npm test && npm run build
cd ../lexa-frontend && npm ci && npm run build
```

The live `npm ci`, full Nest build, Vite build, PostgreSQL migration and browser integration run are **not evidenced by a source-only local test**; GitHub Actions and staging must confirm them.

## Catalogue CLI

```bash
python3 scripts/plan_electronics_category_import.py --codes ELEC.MOB.FEATURE.GSM
python3 scripts/plan_electronics_category_import.py --categories-json staging-category-export.json --codes ELEC.MOB.FEATURE.GSM
```

An explicit tenant-approved `--apply` mode exists, but relies on an authenticated HTTPS API and credentials held outside the CLI in environment variables. Prefer the signed-in frontend for routine approval. The CLI never bulk-imports every leaf by default.

## Phase 1 acceptance matrix

| Gate | Local/static evidence | Staging evidence still required |
| --- | --- | --- |
| All V2 leaves resolvable | Canonical generator and 8+ Phase-1 tests | Browser + authenticated API |
| 13-industry permissions | Allowlist policy and route contract tests | Cross-role, cross-tenant HTTP/RLS |
| Duplicate brand alias/merge | SQL collision trigger, API checks, no auto-merge | Concurrent writes in PostgreSQL |
| Model and family reference | JSON schema validation and revisions tests | Actual create/revise/review via API |
| Legacy identity and edit path | Additive migration audit and no product-id rewrite | Before/after account hash reconciliation |
| Browser/public/mobile parity | Byte-matched generated contracts and hash | Built frontend, client load in staging |
| Operational readiness | CI-required source checks | GitHub green + migration/restore + browser certification |

**Reference:** `LEXA_ELECTRONICS_CATALOGUE_V2_SPECIFICATIONS.md` from the user-supplied prior implementation discussion. No claim is made that later V2 stock, checkout, warranty or finance phases are complete.
