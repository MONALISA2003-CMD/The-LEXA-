# LEXA Electronics Catalogue V2 — production integration audit and high-risk returns repair

**Date:** 2026-11-05. **Source:** user's `LEXA_ELECTRONICS_CATALOGUE_V2_SPECIFICATIONS.md` v2.0.0, §§0–15, especially D-01–D-12, family tracking profiles, §7, Phase 5–9 criteria and §11. **Baseline:** GitHub `MONALISA2003-CMD/The-LEXA-` commit `53e8a739b972d823c718910542e525239e0ba674`. **Classification:** production source-alignment audit + source-level repair; **not** a certification that all PRD requirements are implemented.

## 1. Actual connected production evidence before this repair

| Area | Verified from connected provider | Limit |
|---|---|---|
| GitHub | Existing release source corresponds to commit `53e8a739b972d823c718910542e525239e0ba674`; previously verified ZIP source `backend/src/commerce/equipment-service.controller.ts` Git blob matches the live repository | This *new* repair source is not committed or deployed |
| Render | `lexa-backend-api-live`, service `srv-dbhp0f0m7kps73ffeqrg`, deployment `dep-dbm8kprm8hqs73cv29r0`, status **live**, commit `53e8a739...` | "LIVE" is not an authenticated inventory/finance test; `/health/ready` should be configured in Render's service dashboard if not present |
| Vercel | `lexa_review`, deployment `dpl_BUooMfyjgZiUNgUoiS6mrutLvytv`, **READY**, SHA `53e8a739...`; `lexaaamaal.com` verified, `www.lexaaamaal.com` verified with 308 apex redirect | READY proves a build/deployment, not a tenant's browser E2E journeys |
| Neon | Production project `empty-mud-76816448`, branch `br-snowy-hill-ba5a9ggc`, database `lexa`; migration `20261105220000_equipment_service_and_appliance_custody` successfully applied | Does not certify restored-backup checksums or business ledger integrity |
| Cloudflare | Zone `lexaaamaal.com` active, apex proxied `A 76.76.21.21`, `www` proxied CNAME `cname.vercel-dns.com`; SSL **strict**, `always_use_https=on`, minimum TLS **1.2** | Does not certify authenticated application workflows |
| Rollout | No `tenant_feature_overrides` records for `electronicsCatalogueV2`, `phoneIdentifierRegistryV2`, `accessoryFitmentV2`, `applianceFulfilmentV2`, or `equipmentServiceV2` | Feature-gated writes remain disabled by default; do not enable for live tenants without pilot authorization |

**Read-only production inventory audit:** all six queried core sale/return/serial tables exist; `serialized_sale_lines=0`, `exact_serial_return_lines=0`, `legacy_serial_returns_without_unit_evidence=0`, `quarantined_serial_units=0`, `posted_exact_unit_returns=0` at query time. These zeros mean there was no current serialized-return data to reconcile, **not** that future flow safety was tested against real transactions. No live rows, schema, flags, or DNS settings were modified.

## 2. High-severity defects found and source fixes made

**Finding R1 — wrong physical serial on partial returns.** The previous `CoreController.recordReturn` selected a sale line's first unreturned serial by array position, regardless of the physical device actually presented. A three-device laptop line could credit/restore a different device than the one returned. **Fixed:** request includes immutable selected unit IDs, quantity match, membership in original sale, duplicate/already-returned checks, branch/tenant constraints, `status='sold'` transition count check and atomic posted stock movement. No anonymous auto-selection. API declines historical sale lines with missing serial ownership evidence. Same flow covers phones, computers, TVs, network devices and appliances with `trackSerial=true`.

**Finding R2 — defective quarantine statuses.** Original returns used `quarantined`/`scrapped` despite valid unit statuses `quarantine`/`scrap`; this could abort returns at the DB constraint. **Fixed:** only valid `available`/`quarantine` serial transitions. Serialized scrap is not a one-step return disposition: first record inspected quarantine; then require a separately approved inventory write-off and GL posting. Quarantine creates physical custody/stock movement, increments physical on-hand and quarantined lot quantity, **never silently makes returned units saleable**. A missing original cost prevents a silent zero-value inventory reversal.

**Finding R3 — unordered checkout identifier snapshot.** A Prisma `findMany` SQL `IN` result is not required to preserve the caller's selected serial-ID order. The original checkout snapshot wrote returned serial labels by result order and could misalign the number displayed to the unit referenced by the sale. **Fixed:** `orderedSaleSerialNumbers` constructs the immutable receipt snapshot from the selected unit-ID order using a server-owned map, with fail-closed missing/duplicate cases. For old sales, `getSale` preserves the original receipt snapshot *as originally posted* but also provides a new explicitly paired `serialUnitEvidence` derived from current authorized physical unit records. The return scanner maps using these **verified ID–serial pairs**, never the potentially unordered historical receipt labels.

**Finding R4 — REST caller could forge a checkbox and selected ID.** `physicalSerialScanned:true` alone is not evidence of the scanned identifier. **Fixed:** raw physical manufacturer-serial scans are carried with the return, and the API rechecks every scan against the actual tenant- and branch-scoped inventory-serial row for the selected sale unit. Wrong serial → conflict; mismatch quantity → conflict; condition notes and inspection flag required. This is a controlled scan claim, not independent proof of device authenticity or ownership.

**Finding R5 — cross-module discoverability.** A staff member viewing a sold serialized unit had to manually copy IDs between the sale and equipment service screen. **Fixed:** each sale line can open a unit-specific inventory/service history, passing only opaque internal UUIDs in the URL. The equipment workbench preselects the matched physical unit and original sale line. No IMEI or raw serial is put in the link. Normal branch auth and feature guards remain authoritative.

**Touched source:** `backend/src/core/core.controller.ts`, `backend/src/commerce/exact-serial-return.ts` (new), `backend/test/exact-serial-return-regression.test.mjs` (new), `lexa-frontend/src/domain/sales/serialReturn.ts` (new), `serialReturn.test.ts` (new), `lexa-frontend/src/domain/shared/types.ts`, `lexa-frontend/src/modules/sales/SaleDetailPage.tsx`, `lexa-frontend/src/modules/inventory/InventoryPage.tsx`, `EquipmentServicePanel.tsx`. Original customer IDs, posted receipts and stock records are untouched; this source package introduces **no database migration**.

## 3. PRD requirement-to-source/production gap register

Legend: **present in source** = relevant implementation exists, **partially implemented** = significant source plus gaps, **unverified** = no complete live or staging proof. Not every implemented screen is enabled for customers.

| Scope | Observed source capabilities | Gap / release condition |
|---|---|---|
| 0–2 taxonomy/model/product rules | 13 industries preserved; 282 category nodes/221 leaves, 52 family policies; 34 additional equipment subtypes, generated backend/frontend policy; product/variant/brand modules | Real verified manufacturer model data/provenance, all field-level restrictions, complete legacy alias/dual-read acceptance, every import pathway need functional proofs |
| 3 IMEI/serial receiving | Serial/IMEI registry, scan/lookup, tenant uniqueness, accepted receipt ledger, inspection tests | Full 1..N IMEI, partial receipt, quarantine and concurrent receiving tests on actual PostgreSQL via authenticated REST/UI not independently certified |
| 4 packages/fitment/bundles | Typed approved accessory compatibility, package conversion, bundle inventory operations, backend rules | Genuine printer toner/charger manufacturer compatibility evidence, cross-category fitment performance, complete bundle disassembly + finance reversal E2E remain unverified |
| 5 computers/office | Typed computer/network/office/AV policies, per-unit upgrade work orders, exact parts cost and approved journal, copier meters, serial sell-through/ageing/margin reporting | Five serialized laptops plus exact SSD journal acceptance on staging; verified manufacturer model codes; full installation assets and upgrade Q/A still need proof |
| 6 appliances/after-sales | Appliance subtype rules, serial-linked delivery states/POD, split AC installed-unit mappings, warranty case creation, separately scoped customer repair custody | Complete warranty adjudication/claim lifecycle, repair parts posting, technician assignment/commissioning, failed-delivery compensation, warranty replacement/GL reversal and three-fridge exact-unit E2E not fully implemented/certified |
| 7 purchase/finance | Existing PO/receipt/stock posting, POS idempotency and exact serial costs, tax/COGS journals, limited reconciliation and refund linkage | Full PO ↔ supplier invoice ↔ partial receipt ↔ FX landed cost reconciliation, provider payment saga, exchange/refund/write-off GL reconciliation and authorized EFRIS implementation require integration plus independent finance sign-off |
| 8 other modules and clients | Product/catalogue policy shared across backend and frontend, REST adapters/OpenAPI, source restrictions on legacy Commerce paths, tenant RLS, authoritative inventory backup register, **this repair connects sales/returns with inventory unit history** | Authenticated browser/REST/CSV/XLSX/worker matrix, permission and PII redaction matrix, 1,000-unit/scanner concurrency/performance, actual DB+object backup restore and checksums not yet certified |
| 9 release/aftercare | Five guarded flags, release evidence gate requiring 25 E2E+20 negative scenarios and role/restore approval | **Not complete:** true staging E2E results, real restored-backup report, all role tests, owner sign-off and controlled pilot are missing; do NOT enable new writes or claim Phase 9 accepted |

## 4. Reproducible validation run for this new source

- `cd backend && npm test`: **344/344** backend tests passed, including new exact-serial returns, wrong-scanned-ID rejection, `orderedSaleSerialNumbers`, snapshot/branch protections, serialized quarantine/stock movement contract and frontend-integration source guards. Node 22 TypeScript strip support used locally.
- `python3 -B scripts/sync_industry_catalogue.py --check`: passed.
- `python3 -B scripts/sync_electronics_catalogue_v2.py --check`: passed, **282 nodes/221 leaves/52 family policies**.
- `python3 -B scripts/sync_electronics_equipment_subtypes.py --check`: passed.
- `python3 -B backend/scripts/check-openapi-coverage.py`: passed, **459 operations / 371 routes**.
- `python3 -B backend/scripts/check-route-adapter-coverage.py`: passed, **18** domain adapters.
- `node backend/scripts/check-route-uniqueness.mjs`: passed, **482** routes / 30 controllers.
- `node backend/scripts/check-backup-inventory.mjs`: passed, **195** inventory decisions.
- `node backend/scripts/verify-ledger-posting-coverage.mjs`: passed, **15** workflows.
- Strict TypeScript compilation and independent Node assertions of new dependency-free frontend/server return helpers: passed, including deliberately reversed database result order.
- `typescript.createSourceFile` syntax parse of backend and frontend TS/TSX: **299** files, **0** syntax errors.
- Fresh clean-ZIP extraction and source-import layout check: required before release, record separately in the packaging log.

**Not locally run and not claimed:** real dependency-backed Nest production build (`npm ci && prisma generate && nest build`), full Vitest/`tsc -b`/Vite build, authenticated full client E2E and PostgreSQL transactions for this exact source revision. Offline npm dependencies unavailable in the current container; previous successful Vercel/Render builds concern Git commit `53e8...` **without** these return fixes. The new source can only be promoted after a new GitHub source-refresh workflow reports both builds green, followed by matching Render/Vercel SHA and safe staging tests.

## 5. Release procedure — no production business changes during this audit

1. Upload **exactly one new root-level clean-source ZIP**, preserving `.github` workflows and committed lockfiles. Follow `.github/workflows/repository-import.yml`: safe ZIP/layout → `npm ci` → `prisma generate/validate` → backend tests/OpenAPI/Nest → frontend prebuild/Vitest/TypeScript/Vite → clean-source commit.
2. Require GitHub Actions fully green. Resolve any **real compiler errors** before a deployment, not by weakening TypeScript or skipping tests. Separate backend CI should also pass.
3. Require Render `LIVE` and Vercel `READY` for the **same newly committed SHA** and a working database-backed `/health/ready` probe; verify the production migration head does not diverge. Confirm Cloudflare stays active, SSL strict, HTTPS enforced and both domains verified.
4. On an **isolated, seeded Neon staging branch with representative anonymized backup** perform all §11 E2E-001..025 and NEG-001..020 scenarios, six actor roles across two tenants/two branches, API/browser/import worker routes, concurrency and stock/finance journal reconciliation. Record evidence for each and demonstrate backup + objects restore checksums.
5. Obtain explicit release owner authorization before enabling the five V2 flags for any internal test workspace, then an opt-in pilot, then additional tenants. Stop on stock/finance invariant failures, disable flags without rewriting posted receipts and never replay uncertain provider payments.

**Final assurance level:** exact-serial and cross-module source defects fixed and 344 backend tests passing; **complete PRD compliance / new-source production deployment / Phase 9 certification not established**. The existing production stack was aligned on the previously green commit when audited, not on this unshipped patch.
