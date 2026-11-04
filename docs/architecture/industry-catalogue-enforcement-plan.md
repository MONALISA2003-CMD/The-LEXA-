# LEXA: 13-industry catalogue, hierarchy and whole-platform enforcement

**Implementation status: source changes prepared for CI; not a live production rollout.**

## Goal and invariants

One tenant-owned product catalogue is the **only authoritative product identity** for all 13 supported industries. Every client (web UI, backend API client, employee portal, import worker, future mobile client) must honour server-defined product types, mandatory field rules and tracking policies. Finance, sales, purchasing, receiving, transfers, returns, warranties and reporting must refer to the same product/variant/lot/serial identities; they must not create shadow stock records or infer identity from a product name. No existing product, stock, order, receipt, invoice, ledger or business is deleted to retire an industry. Existing identifiers remain stable, including legacy product types and original sale snapshots.

Supported industries (`scripts/industry-catalogue.v1.json`, schema v1): retail_trade, wholesale_distribution, electronics, mobile_phones, fashion_beauty, perfumes_cosmetics, food_hospitality, bakery, construction, household_goods, repair_services, education, other.

**Retired forever as new industry choices:** agriculture, healthcare, manufacturing, logistics_transport, professional_services. Existing transactions stay. Shared features such as purchase orders, stock handling, recipe and delivery workflows remain available to the supported businesses that need them. Do not drop historic database tables or rewrite applied migrations.

## Versioned contract and rollout in this package (phase A)

1. **Single source of truth.** `scripts/industry-catalogue.v1.json` defines 13 industries, 34 product policies, category tree suggestions (105 leaf paths), required attributes, stock modes and variant dimensions. `scripts/sync_industry_catalogue.py` emits a backend TS contract plus matching backend/frontend JSON copies. CI `contract:check`, frontend `prebuild`, and repository validator reject divergence.
2. **Account setup.** The owner sees only supported industry and business-model choices. Backend `selectIndustries` rejects retired codes or unrecognized codes, including calls from other clients. Existing profiles with retired selections normalize to surviving selections, or `other`, without losing business history. The new additive migration updates the stored selection columns.
3. **Shared client API.** Tenant-member-scoped `GET /api/v1/workspaces/:workspaceId/catalog/industry-config` provides active industries, version, allowed policies and recommended category paths; the front end compares versions before a write. New mobile, partner and employee clients should use this API, not hard-code a separate list. All mutations are still validated independently on the server.
4. **Product API.** New products require a supported product type, matching an active industry or `general`. Product attributes, required fields, select options, numeric fields, lot/serial/stock modes are validated server-side in the core product API. Retired legacy product types can continue to be read and edited in-place but cannot be assigned to new products. Stock modes are not merely client-side checkbox settings.
5. **Categories.** A new tenant-scoped `POST /api/v1/workspaces/:workspaceId/categories/ensure-path` creates a selected industry path on demand. The migration enables the same subcategory name under different parents and still rejects sibling collisions, including root names. The API uses tenant ownership and audit events. No artificial products or stock are seeded.
6. **Variants.** REST and staged import validate actual variant dimensions against the parent's product type. Each variant has its own SKU, price and stock identity. Physical IMEI/serials remain recorded separately at receiving (not invented during product creation).
7. **Frontend.** Product creation uses allowed templates, required-field labels, category path suggestions, stock-policy defaults and locked mandatory tracking flags. Backend-configured industries are available to authorized staff too, not only the business owner. Local preview product repository carries the same type/attribute/tracking properties and validates chosen presets. Existing products and their IDs remain intact.
8. **Imports.** Staged CSV product template v2 requires `product_type` and validates `attributes_json` plus stock/lot/serial policy on preview *and* apply. Variants validate parent type and dimensions. The older Business Tools direct product CSV path now requires `productType`, supports `attributesJson`, and enforces the same backend policy. Root-only category name lookups avoid ambiguous nested category paths. Opening-stock imports and import of historical sales remain separate for safety.

## Cross-module adoption matrix and remaining gates

| Module / client | Already wired or protected by phase A | Required before claiming complete industry experience |
| --- | --- | --- |
| Business onboarding / owner settings | 13 active codes with backend validation, old profiles preserved | Owner-facing reclassification assistant for retired-only tenants, bulk reclassification log |
| Products / categories / variants | Shared policy, server validation, nested recommended paths, variant integrity | Guided brand/model selection; complete maker/category pack QA |
| Warehouses, stock counts, picklists | Existing stock references product, variant, lot or unit | Integration tests for every stock movement type, partial units and cross-branch concurrency |
| Purchasing / receiving | Existing lot and serial receiving infrastructure; mandated tracking flags | Receive workflow must reject unregistered serial/IMEI or required batch, and reconcile SKU/variant with purchase line |
| Checkout, sale returns, receipts | Existing sale lines reference product/variant/lot/serial and store snapshots | End-to-end serial/lot selection, returns of exact sold unit, cross-branch concurrency, tax rounding |
| Restaurant and bakery workflows | Industry templates for meals, ingredients, bread and bakery batches | Real recipe/BOM ingredient consumption and spoilage with a posted stock journal (not manufacturing industry) |
| Repair jobs and warranty | `spare_part` and services templates continue | Link customer-owned device IDs, repair parts and return disposition without confusing customer assets with shop inventory |
| Invoicing, wholesale pricing, finance and GL | Stable product identity and existing ledger postings retained | Full cost valuation, pack conversions, purchase/sale reconciliation, multi-currency price list validation |
| Logistics features embedded in supported businesses | Existing package/delivery features retained | Make shipped parcel, reservation and dispatch use exact variant/serial/lot ID, preserve route logs |
| Customer growth, projects and collaboration | Existing module records are unchanged; they reference existing catalogue/sales | Replace free-text product relationships where relevant with referenced product/variant IDs, enforce permissions |
| Dashboards, AI and reports | APIs can read canonical product types | Industry-specific dashboards, audit-safe aggregation, batch expiries, serial profitability and stock aging |
| Search, scanning, barcode/POS | Existing SKU/variant/barcode lookup, camera scanning | GS1 barcode parsing, IMEI check digit, GTIN disambiguation and duplicate identifier indexes |
| Import / export / backups | Import rules and contract checks added; no historical deletion | Backup/restore round-trip tests for categories/attributes, variants, units, lot/serial metadata, tenant and branch scope |
| Future mobile and external API clients | `GET industry-config`; backend write enforcement applies | Version negotiation, auto-generated OpenAPI SDKs, cross-client contract test harness |

**Not yet done:** complete end-to-end integration of every module; serial/IMEI cross-slot uniqueness; actual stock-unit package conversions; FEFO, weighted costing and recipes; verified migration on a real Postgres clone; full dependency-backed frontend+backend builds; live deployment. These are mandatory follow-up gates, not claims that this ZIP already makes the entire business vertical-specific.

## Phased implementation plan (ship in guarded increments)

**B. Inventory identity and traceability.** Extend canonical product > variant > package > stock lot > serialized unit relationships; add a separately indexed identifier table for IMEI1/IMEI2/serial with type-specific normalized validation and strict uniqueness per tenant. Preserve original identifiers on receipts, returns and warranties. Test duplicate serials across secondary fields, same product in two branches, and concurrent last-unit sale. Keep quantity on-hand derived from authoritative movements, not editable UI counters.

**C. Purchase, receiving and stock movement enforcement.** Require variant/lot/serial policies at receiving and stock movement API boundaries, not in browser forms only. Atomic transfer/receive/return with source document, audit, tenant/branch scope and idempotency. Introduce cartons/pack-size conversions with exact rational ratios and clear base unit for inventory. Restrict inappropriate fractional quantities; separate scrap/spoilage from sale return.

**D. 13 personalized industry journeys.** Release guided phone (IMEIs, device condition, warranty), electronics (serials/specs), fashion (size x colour matrix), supermarket (scanning/pack/expiry), wholesale (carton conversions/pricing), bakery/restaurant (recipe, ingredient consumption, batch, waste), cosmetics (shade/lot), hardware (dimensions/units), household (size/capacity), repairs (parts/device warranty), education (ISBN/edition/level) and other (custom schema) experiences. Ensure multi-industry mixed tenants can run multiple packs without duplicate stock ledgers.

**E. Cross-module contracts.** Every business transaction references catalog IDs and uses one stock transaction service; enforce same rules in APIs for inventory, picklists, procurement, sales, returns, repair, logistics features, reporting and import. Add E2E matrix for multiple tenants, branches, industry packs and employee roles; verify every integration records the correct product variant, unit, lot or serialized unit.

**F. Safety, migrations and go-live.** Snapshot production DB, rehearse on separate database branch, run additive migrations under controlled deploy, verify existing accounts/stock/journals/receipts, test tenant RLS, validate backup/restore, then green GitHub Actions with backend + frontend builds and live Render/Vercel smoke tests. Roll back application if any check fails; avoid destructive rollback to historical records.

## Release acceptance criteria

- [ ] All checks and builds green with dependency installation (`npm ci`, Prisma generate, Prisma validate, Nest build, Vite build, all tests).
- [ ] Migration rehearsal on Neon/Postgres staging and recorded backup restore.
- [ ] New business cannot choose any retired code via web, REST or import. Existing retired-only business remains usable and safely maps to `other`.
- [ ] One business can create phone and perfume products using correct tracking. Unsupported type or missing required field rejected in **server** API and import worker, not only client.
- [ ] Tenant A cannot access or mutate Tenant B's products/categories/serials. Employees respect scoped write permissions.
- [ ] Products, attributes, variants, serials and lots survive backup and restore; all receipts/GL/stock IDs unchanged.
- [ ] Serialized phone receiving, partial multi-unit checkout, last-unit sale conflict, return-to-stock vs quarantine, warehouse transfer and serial warranty search tested end to end.
- [ ] Clothing size/colour stock matrix tested; supermarket carton-to-each and bakery batch/expiry tests before releasing corresponding advanced UI.
- [ ] POS, procurement, inventory and reporting totals reconcile with authoritative stock movements and ledgers.
- [ ] Both web and mobile/other API client contracts tested against manifest version.

## Source stewardship

Do not edit generated industry files; change the `scripts/industry-catalogue.v1.json` manifest and run `python3 scripts/sync_industry_catalogue.py`. Do not change previous applied SQL migrations. Keep every new `catalogue schemaVersion` additive and support older clients safely through explicit compatibility/error handling. A green source build is **not** proof that all production data, permissions and third-party clients are migrated.
