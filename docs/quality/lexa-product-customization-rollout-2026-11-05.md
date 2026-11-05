# LEXA product customization and inventory experience — release 2026-11-05

## Scope and intent

This source update retains LEXA's **13 supported industries**, the established business/branch/tenant boundaries and all existing product, variant, serial, lot, purchase, sale and ledger record IDs. It modifies user interfaces, catalogue policies, and a new atomic variant API. It does **not** reset business data, create fake stock, alter financial transaction history or silently deploy to production.

## Implemented

1. **Guided product setup:** Three stages: identify and classify; set prices, units and tracking; then configure variants, packages and individual serials. Newly saved products continue directly to the third stage. Existing records may be edited through the same guided flow.
2. **Industry-aware category builder:** Add up to 25 custom fields (text, non-negative number, dropdown), choose if each is required, define valid choices, and inherit fields through the category hierarchy. Leaf category definitions override parent ones. Required, numeric and select constraints are enforced at the backend, not only by the browser. Existing products with unchanged policy/attributes retain a compatibility path for historical custom fields.
3. **Bulk sellable variants:** Generate deterministic SKU matrices (size × colour, storage × condition and other dimensions) from the active product template, preview the whole matrix and adjust individual SKUs and per-variant cost/selling prices. `POST /workspaces/:workspaceId/products/:productId/variants/bulk` validates every item, locks the product and writes rows/audits in one serializable transaction. The single-variant endpoint delegates to the same server check, preventing client bypass. API contract updated.
4. **Device scanner reuse:** Scan primary and optional secondary IMEIs (or manufacturer serials) from camera, picture or code. Existing server-side identifier checks apply; no placeholder codes are generated.
5. **Inventory drill-down:** The Inventory page can inspect branch product balances, variation balances, available non-expired batches, and available serial/IMEI units. Opening-stock scan resolves variant SKU/barcode as well as parent product. These are read-only views; they do not change stock.
6. **Replenishment handoff:** Low-stock alerts provide navigation into reorder planning and purchase requests. They do not automatically order stock or fabricate supplier commitments.
7. **Legacy backup protection:** The outdated ten-table v1 backup/export/restore paths fail closed where rich catalogue or inventory records exist. The v1 mapper preserves category hierarchy/schema and product tracking metadata for simple legacy records. Modern businesses must use the authoritative encrypted full backup and reviewed isolated restore process.

## Validation completed on source

- **256/256 backend regression tests passed** (including six new focused product experience tests).
- **399 OpenAPI operations / 322 routes** matched exactly; route-to-adapter coverage passed.
- **422 Fastify registrations across 27 controllers**, no duplicate routes.
- **15 ledger workflow checks** and **170 backup inventory decisions** passed.
- **269 backend/frontend TypeScript source files parse**, with **812 relative imports resolved**.
- Standalone strict `tsc` checks passed for the pure variant-matrix helper and backend category/policy modules.

## Release gates not yet completed

- Full dependency-backed NestJS and Vite builds in GitHub Actions (the local container cannot install the project's full npm dependencies).
- Authenticated mobile/browser walkthroughs, two-tenant permission isolation, batch/serial concurrent receiving, detailed purchasing / sales / returns / accounting reconciliation, and all 13 vertical real-business scenarios on staging.
- Database-backed proof that the legacy backup guard and new variant-batch transaction operate correctly under concurrent transactions.
- Actual production update: GitHub Git-object writes are rejected with 403 `Resource not accessible by integration`; no production push was performed.

## Deployment and safety procedure

1. Take a full managed PostgreSQL/Neon backup and verify its restore procedure, including variants, lots and unit identifiers. The legacy workspace backup endpoint may now reject rich-stock businesses by design.
2. Upload **only** `LEXA_13_INDUSTRY_PRODUCT_INVENTORY_UX_UPGRADE_20261105.zip` to the root of `main` using GitHub's **Add file → Upload files**. Do not delete any older ZIP as part of that commit. The ZIP importer requires one newly changed root-level archive.
3. Require the refreshed-source GitHub Actions job to pass backend unit tests, API contracts, backend Nest build, frontend Vitest and Vite build, and the final source commit. Do not treat ZIP-upload commit as the built source revision.
4. Confirm Render and the frontend hosting platform point to the **imported source commit**. Verify `/health/ready` and public sign-in, then test within an isolated staging/test business using staff roles and real signed-in browser sessions.
5. Test at least the following: phone IMEI receiving/sale/return, boutique size-colour matrix and exact SKU deductions, supermarket packs and batch alerts, bakery ingredient/finished-product ledgers, and a mixed business. Continue with remaining nine industry packs, access controls, costs, receipt snapshots and recovery.
6. If any gate fails, do not advance production. Roll back to a verified prior source deployment and database snapshot where needed; never delete or silently recreate historical product identifiers.

## Known scope boundaries

This update improves catalogue creation and inventory discovery, **not** an automatic purchase-order creation service, a new measured-quantity sales engine, or an exhaustive implementation of every physical transaction and industry-specific operational journey. Existing receiving/ledger/finance modules remain in place and still require real-account E2E verification. Production readiness is not certified by local tests alone.
