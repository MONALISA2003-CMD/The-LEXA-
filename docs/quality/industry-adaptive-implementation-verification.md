# Multi-business adaptive ERP — implementation and release verification

**Date:** 5 November 2026  
**Source:** `docs/specifications/lexa-multi-business-industry-adaptive-erp.md`  
**Status:** Source implementation delivered for business-specialty personalization, extensible catalogue contracts, cross-module assortment focus, and isolated Python demand analytics. **Not certified as the full SRS.**

## Safety and source of truth

The single existing LEXA stock ledger, posted finance journals, sale/return identity, and canonical product keys remain authoritative. This change neither creates sample tenant stock nor changes existing sales or monetary balances. There is no second inventory database, asynchronous posting agent, or AI-driven write path. Past purchase orders, products, receipts, returns, and posted journals remain visible even when an activity is retired from new-product suggestions.

The 13 active industry codes remain unchanged, and existing electronics/phone tracking policies continue to be enforced. `scripts/industry-catalogue.v1.json` contains **72 approved product presets** (51 retained plus 21 new non-electronics families); `scripts/business-specialties.v1.json` defines **48 specialties**. Generated API and frontend contracts are synchronized with Python code generators.

## Implementation inventory

| Area | Files / behavior |
| --- | --- |
| Specialty registry | `scripts/business-specialties.v1.json`, `scripts/sync_business_specialties.py`, mirrored `business-specialties.generated.ts` |
| Catalogue rules | `scripts/industry-catalogue.v1.json`, generated manifests and policies, strict backend product/tracking validators |
| Business settings | Owner-controlled industry/specialty selection, revision and last change, stale edit protection, legacy-client preservation; `backend/src/business-setup/` and `lexa-frontend/src/modules/business-setup/` |
| Tenant history | `BusinessActivityRevision` Prisma model, additive SQL migration `20261105230000_business_activity_preferences`, forced RLS and immutable trigger; one new authoritative backup inventory entry |
| Products | Niche-first creation forms while retaining all historically authorized items |
| Inventory, purchasing, checkout | Shared presentational business-focus selector and prioritized choices; **no hidden stock** |
| Finance | Focus selector displays context but does not falsify division-level financial totals; GL remains consolidated |
| Intelligence | `backend/analytics/industry_demand.py` performs bounded Decimal-precision demand forecasting, backtesting, anomaly checks and supplier-pack rounding; no DB access, provider claims, stock writes or automated purchasing. It is a validated offline worker **not yet wired to production read APIs or scheduling** |

## Verification completed

- Node backend regression: **352 / 352 pass** (`node --experimental-strip-types --test test/*.test.mjs`).
- Python regression: **18 / 18 pass** (`python3 -B -m unittest discover -s analytics -p 'test_*.py'`).
- OpenAPI consistency: **459 operations across 371 paths**; no missing/orphan operations (no new HTTP routes introduced).
- Fastify route uniqueness: **482 registrations across 30 controllers**.
- 18 backend-backed client adapters checked; ledger posting coverage: 15 workflows.
- Authoritative backup inventory: **196 table decisions**, including the new activity revision history.
- Industry, specialty, electronics catalogue and subtype code generators: synchronized.
- Full TypeScript source syntax scan: 302 TS/TSX files, no parse errors. **This is not a dependency-backed Nest/Vite type-check or production build.**
- Isolated Neon branch `br-frosty-queen-ba5e96ee`: migration executed successfully with 2 columns, 1 tenant RLS policy with FORCE RLS, 1 immutable-history trigger and 1 backup entry. **No production schema or customer data modified.**

## Important gaps preventing full SRS acceptance

**The user's entire SRS is not implemented.** The following substantial business transactions and release certifications still require implementation, database E2E scenarios and owner review:

1. Exact-decimal UoM versioning across wholesale packs, weighed products, cloth/pipe/cable cuts and returns.
2. Perfume decant production, tester conversion, source-lot consumption, shrinkage and balanced inventory/COGS journals.
3. Recipe/ingredient BOM, restaurant POS meal consumption, bakery production yield, allergen provenance and wastage journals.
4. Complete fashion exchange, refund and exact-variant finance reversal; partial wholesale order/account receivable scenarios.
5. Full product-family policy across CSV, workers, mobile/offline and API clients, including historical data migrations.
6. Authenticated demand-snapshot endpoints, job orchestration and approval workflows for Python recommendations.
7. Immutable division attribution for every GL source, consolidated drill-down and accurate cross-division profit reports.
8. The 65 defined new multi-business acceptance scenarios, all 45 electronics scenarios, real cross-tenant RBAC/REST/E2E, full restore/checksum rehearsal, and signed production canary evidence.

**Rollout:** feature-specific production write paths must not be enabled on the basis of syntax/source tests. Import ZIP into `.github/workflows/repository-import.yml`; the workflow reinstalls committed npm lockfiles, generates Prisma, validates and builds both apps. Render's automatic deployment runs Prisma migrations; Vercel must deploy the same resulting Git SHA. Capture full build, migration, smoke, restore, and reconciliation evidence before explicitly enabling any unsafe business workflows.

## SRS requirement-by-requirement status

“Partially implemented” may refer to pre-existing electronics or shared ERP source, not new functionality added in this update. **Neither partial nor source-foundation rows represent completed authenticated staging acceptance.**

| Requirement | Current assessment | Contract |
| --- | --- | --- |
| `REQ-SET-001` | Source foundation implemented; formal E2E pending | Multi-select exactly supported active industries, preserve legacy codes for reads. |
| `REQ-SET-002` | Partially implemented; integration or E2E pending | Versioned owner settings, branch/division contexts and impact review. |
| `REQ-SET-003` | Partially implemented; integration or E2E pending | Removing a choice must not delete/hide historical outstanding operations. |
| `REQ-SET-004` | Partially implemented; integration or E2E pending | One pack policy must power all supported client interfaces. |
| `REQ-SET-005` | Source foundation implemented; formal E2E pending | Owner-selected sub-activity niches filter suggestions (boutique ≠ perfumes), without granting new industry permissions or hiding historical records. |
| `REQ-CAT-001` | Partially implemented; integration or E2E pending | Canonical categories, family codes and aliases remain stable. |
| `REQ-CAT-002` | Partially implemented; integration or E2E pending | Product/variant identity and SKU/barcode uniqueness per approved scope. |
| `REQ-CAT-003` | Partially implemented; integration or E2E pending | Typed required fields and variant axes at appropriate workflow stage. |
| `REQ-CAT-004` | Partially implemented; integration or E2E pending | Attribute provenance and no fabricated verification. |
| `REQ-CAT-005` | Partially implemented; integration or E2E pending | Existing electronics family policies retain stronger identity constraints. |
| `REQ-INV-001` | Partially implemented; integration or E2E pending | Single authoritative tenant-wide inventory engine and movement history. |
| `REQ-INV-002` | Partially implemented; integration or E2E pending | Multiple UoMs with immutable exact rational conversion versions. |
| `REQ-INV-003` | Partially implemented; integration or E2E pending | Transactional ATP/reservations under concurrent customers. |
| `REQ-INV-004` | Partially implemented; integration or E2E pending | LOT/serial/IMEI and inventory custody policies enforced by server/DB. |
| `REQ-INV-005` | Partially implemented; integration or E2E pending | Expiry/quarantine/recall must block all sales channels. |
| `REQ-INV-006` | Partially implemented; integration or E2E pending | All count, scrap, transfer and return adjustments reference approved source docs. |
| `REQ-INV-007` | Not yet end-to-end implemented | No double count for source and transformed/bundled material. |
| `REQ-INV-008` | Partially implemented; integration or E2E pending | Serial/IMEI and precise return identity retained even after catalog changes. |
| `REQ-PRC-001` | Partially implemented; integration or E2E pending | PO/receipts enforce product policy, UoM, supplier, cost and idempotency. |
| `REQ-PRC-002` | Partially implemented; integration or E2E pending | Partial receipt never posts ordered-but-unaccepted stock. |
| `REQ-PRC-003` | Not yet end-to-end implemented | Purchase invoice/AP/FX/landed cost tie to accepted receipt and valuation. |
| `REQ-SAL-001` | Partially implemented; integration or E2E pending | POS sells exact variant, lot/serial, quantity and snapshot. |
| `REQ-SAL-002` | Partially implemented; integration or E2E pending | Refund/exchange posts linked physical and financial dispositions. |
| `REQ-SAL-003` | Partially implemented; integration or E2E pending | Provider-confirmed payments and tax/fiscal status, never invented success. |
| `REQ-SAL-004` | Partially implemented; integration or E2E pending | Existing sale and receipt snapshots do not change after product policy edits. |
| `REQ-BEA-001` | Partially implemented; integration or E2E pending | Fragrance variants by commercial concentration/size, not arbitrary stock duplication. |
| `REQ-BEA-002` | Not yet end-to-end implemented | Decants reconcile volume, actual costs, source lot, wastage and destination. |
| `REQ-BEA-003` | Not yet end-to-end implemented | Tester stock conversion requires audit and excludes normal saleable ATP. |
| `REQ-BEA-004` | Partially implemented; integration or E2E pending | Actual cosmetic lot/expiry/label evidence is respected; unknown remains unknown. |
| `REQ-FAS-001` | Partially implemented; integration or E2E pending | Fashion size/colour/fit variants have independent stock SKU/cost. |
| `REQ-FAS-002` | Not yet end-to-end implemented | Exchanges link original and replacement SKU and journals correctly. |
| `REQ-FAS-003` | Not yet end-to-end implemented | Fabric cut quantities/waste reconcile source roll. |
| `REQ-RET-001` | Partially implemented; integration or E2E pending | Carton/each and weighted sale units do not multiply physical stock. |
| `REQ-RET-002` | Partially implemented; integration or E2E pending | Perishable/recall lot rules fail closed across clients. |
| `REQ-WHO-001` | Partially implemented; integration or E2E pending | Wholesale purchasing, customer tiers, partial fulfilment and AR reuse canonical models. |
| `REQ-HOS-001` | Not yet end-to-end implemented | Recipe component consumption per actual prepared sale happens exactly once. |
| `REQ-HOS-002` | Not yet end-to-end implemented | Allergens and substitutions rely on reviewed component evidence. |
| `REQ-BAK-001` | Not yet end-to-end implemented | Production consumes actual ingredients and receives only actual finished batch/yield. |
| `REQ-BAK-002` | Not yet end-to-end implemented | Custom-order deposits and revenue recognition obey approved accounting policy. |
| `REQ-HAR-001` | Partially implemented; integration or E2E pending | Hardware measured/cut stock exact by base dimensions. |
| `REQ-HAR-002` | Not yet end-to-end implemented | Cross-dimensional conversions need product-specific approved factors. |
| `REQ-HAR-003` | Not yet end-to-end implemented | Damaged supplied units quarantine and reconcile. |
| `REQ-HOM-001` | Partially implemented; integration or E2E pending | Large goods delivery links actual sold identity and controlled dispatch/reverse. |
| `REQ-REP-001` | Partially implemented; integration or E2E pending | Customer-owned repair assets never become shop saleable stock. |
| `REQ-REP-002` | Not yet end-to-end implemented | Repair part and service cost/labour revenue have auditable job linkage. |
| `REQ-EDU-001` | Partially implemented; integration or E2E pending | Book edition/ISBN and uniform variants remain distinct. |
| `REQ-EDU-002` | Partially implemented; integration or E2E pending | Training/tuition services have no fake stock, support invoicing and privacy. |
| `REQ-OTH-001` | Partially implemented; integration or E2E pending | Typed versioned custom family cannot bypass stock/security/finance invariants. |
| `REQ-FIN-001` | Partially implemented; integration or E2E pending | All stock, receipt, sale, return, waste and production postings balance GL. |
| `REQ-FIN-002` | Not yet end-to-end implemented | Currency conversion is sourced, dated, precision-correct and reversible. |
| `REQ-FIN-003` | Partially implemented; integration or E2E pending | Unknown costs and unresolved payments are exceptions, not 0 or settled. |
| `REQ-FIN-004` | Not yet end-to-end implemented | Division reporting allocates every sale once; consolidated equals unique posted source. |
| `REQ-API-001` | Partially implemented; integration or E2E pending | All clients (browser, REST, CSV, worker) use same server policy and IDs. |
| `REQ-API-002` | Partially implemented; integration or E2E pending | Every non-idempotent operation has dedupe/optimistic lock semantics. |
| `REQ-API-003` | Partially implemented; integration or E2E pending | OpenAPI and generated clients reflect real routes and status codes. |
| `REQ-SEC-001` | Partially implemented; integration or E2E pending | Tenant/branch RLS and RBAC disallow cross-tenant reads/writes. |
| `REQ-SEC-002` | Partially implemented; integration or E2E pending | Untrusted product data and AI content cannot execute privileged operations. |
| `REQ-SEC-003` | Partially implemented; integration or E2E pending | Sensitive identifiers and customer data are redacted from logs/exports by policy. |
| `REQ-INT-001` | Partially implemented; integration or E2E pending | Native AI router remains read-only, grounded and aggregate-only. |
| `REQ-INT-002` | Partially implemented; integration or E2E pending | Python analytics bounded, schema-validated, non-authoritative, with fallback. |
| `REQ-INT-003` | Partially implemented; integration or E2E pending | Predictions show model/version/window/evidence, uncertainty and approval boundary. |
| `REQ-INT-004` | Partially implemented; integration or E2E pending | Forecasting improves measured baseline or automatically falls back. |
| `REQ-OPS-001` | Partially implemented; integration or E2E pending | Backups, migrations and restores preserve all canonical IDs and relationships. |
| `REQ-OPS-002` | Partially implemented; integration or E2E pending | Production requires green CI, staging E2E and signed rollout. |
| `REQ-OPS-003` | Partially implemented; integration or E2E pending | Pack flags default off until real evidence; enable per tenant. |
| `REQ-OPS-004` | Partially implemented; integration or E2E pending | Render/Vercel/Neon exact SHA and schema migration head match approved release. |
