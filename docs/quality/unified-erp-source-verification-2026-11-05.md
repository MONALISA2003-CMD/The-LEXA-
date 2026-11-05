# LEXA — Unified ERP source verification and release constraints

**Reviewed:** 5 November 2026  
**Normative requirements:** `docs/specifications/lexa-multi-business-industry-adaptive-erp.md` (66 requirement IDs; 65 multi-business positive/negative journeys) and `docs/specifications/lexa-electronics-catalogue-v2.md` (25 E2E plus 20 negative scenarios).  
**Source delivery:** Complete canonical repository source archive, excluding GitHub workflow files, generated output, dependency directories, lockfiles restored from Git by the repository-import workflow, and secrets.  
**Release classification:** Development implementation and regression verification; **NOT** certified implementation of every requirement, production approval, or proof of the newly compiled Nest and Vite releases.

## Implemented corrections and additions in this delivery

| Domain | Implementation | Invariant |
|---|---|---|
| API authentication | `backend/src/commerce/industry-operations.controller.ts` uses raw session-token SHA-256, distinct from JSON request hashes | Actual LEXA login sessions work with protected production operations; replayed requests retain body-bound hashes |
| Inventory expiry | `backend/src/commerce/business-calendar.ts` is used for production ingredient lots, warranty part issues, serialized returns, and inventory analytics dates | Each tenant's IANA business time zone determines the day; a batch remains valid on its printed expiry date but not the day after |
| Exact physical-unit returns | `backend/src/commerce/serialized-sale-cost.ts` and `backend/src/core/core.controller.ts` validate **original sale movement** cost for each serial | Wrong, duplicate, missing, or mismatched sale-unit evidence blocks stock and finance reversal; per-unit cost is not taken from today's SKU or stock price |
| Warranty decisions | `backend/src/commerce/warranty-workflow.ts` and `equipment-service.controller.ts` enforce inspection, second-person coverage decision, evidence, state transitions, guarded repairs and exact sold-device identity | Manufacturer responsibility and rejected claims cannot charge ordinary merchant warranty stock; replacement postings remain blocked until proper physical/financial chain is implemented |
| Warranty stock and finance | Protected warranty part-issue endpoint consumes an accepted, positive-cost **lot-backed non-serialized** spare part and creates source movement plus matching warranty expense / inventory journal in one serializable transaction | No duplicate posting on idempotent replay; zero-cost/expired/foreign/insufficient lots fail closed; arbitrary unverified stock is not issued |
| Warranty history | New `equipment_warranty_events` and `equipment_warranty_parts` tables; Prisma, immutable PostgreSQL triggers, forced RLS, app-role grants, audit events and backup registration | Posted coverage evidence, repair parts and source finance IDs cannot be edited or deleted |
| Claim duplicate protection | Creation locks the actual unit and reuses identical active claims, rejecting a competing unresolved claim | Concurrent requests do not create parallel active claims for a single device |
| Frontend | `lexa-frontend/src/modules/inventory/WarrantyCasePanel.tsx` and `apiEquipmentService.ts` provide unit-scoped claim decisions, inspection timeline and stocked repair-part issue | Source warehouse, part variant, actual accepted lot and evidence must be selected; protected operations are not shown when tenant flags are disabled |

Existing work retained without rewrite: 13 industries, business sub-activities, 72 product presets, canonical product/variant/stock identifiers, industry personalization, purchasing/sales UI context, versioned formulas, approved production/batch/decant postings, verified measured-loss postings, division attribution, exact serial registry, accessory fitment, appliance fulfilment, production stock/GL and bounded Python demand recommendations.

## Verification actually performed

- **381/381 backend Node regression tests:** passed (new session, serialized return cost, time-zone, warranty policy and stock-posting regression tests included).
- **18/18 Python unittest cases:** passed, including production stock/demand analytics tests.
- **OpenAPI:** 484 operation declarations across 390 paths/HTTP method combinations match all controller methods; 18 domain client adapters checked.
- **Fastify:** 507 route registrations across 31 controllers, no uniqueness collisions.
- **Stock/finance checks:** 15 ledger source workflows; 206 backup inventory table decisions including both new warranty tables.
- **Source contract generation:** industry, specialties, electronics category/subtype contract checks passed.
- **TypeScript syntax:** 314 TS and TSX source files parsed successfully (not a full dependency-backed semantic typecheck).
- **Isolated Neon staging:** the new warranty evidence migration operations executed successfully as a transaction on branch `br-frosty-queen-ba5e96ee`; both tables verified to have `ENABLE`+`FORCE ROW LEVEL SECURITY`, one tenant policy each and append-only triggers. **No production schema or business records were modified.**

## Still required before claims of full SRS completion

The source package **does not yet meet** the full operational definition of done for both SRS documents. Specifically missing or not fully certified:

1. **Multi-business purchasing and finance:** supplier invoice/PO/receipt three-way matching, approved FX and landed-cost allocation, cost layers on every received pack/UoM, provider-confirmed settlement and financial reversal/repair across every path.
2. **Sales and inventory:** a single atomic fashion SKU exchange with linked sales, taxes, returns and journals; complete sold-vs-returned physical disposition; generalized measured-UoM sale and receipt conversion across every SKU, branch and import client.
3. **Food and beauty:** server-driven prepared-order ingredient consumption from the actual POS completion event (not merely manually approved production), entire sealed-bottle-to-millilitre decant lifecycle, source tester conversion/disposal, full batch/recall propagation and allergen provenance.
4. **Electronics service:** approved exact replacement unit with original-return and replacement-finance chain; manufacturer reimbursement, service labour and purchase invoice FX reconciliation; technician repair lifecycle and full installed-system custody reversal.
5. **Business support packs:** complete staff workflow and financial settlement for customer-owned repair jobs, rentals, education service deferrals, consignment and custom family publication across all clients.
6. **Production proof:** Prisma validate/generate, full Nest production TS compilation, frontend Vitest/TypeScript/Vite build, real PostgreSQL integration with two tenants, migration/rollback, 65 multi-business scenarios, 45 electronics acceptance scenarios, payments, backup/restore and authenticated browser E2E; GitHub source-import success and new matching Render/Vercel SHA.

**Release policy:** Keep `industryOperationsV1`, `equipmentServiceV2`, `applianceFulfilmentV2` and the companion electronics write flags disabled in production until the required financial, privacy, security and operational acceptance has been independently completed and approved. Migration success and a green unit suite **alone** do not justify enabling them. For details of previously implemented and still outstanding requirements, consult `docs/quality/industry-operations-implementation-evidence.md` and `docs/quality/industry-adaptive-implementation-verification.md`.

## Import and deployment instructions

1. Upload the clean **root-level ZIP** through `.github/workflows/repository-import.yml`. Do not extract it into a wrapper directory, manually replace `.github`, or include dependency trees or `package-lock.json` in the upload.
2. GitHub Actions imports the source, restores the committed dependency lockfiles, runs backend `npm ci`, Prisma generate and validate, Node/Python tests, OpenAPI contracts and Nest build, then frontend `npm ci`, frontend build and source commit. **Check its exact run and commit before declaring CI green.**
3. Compare Render's new deployment commit to Vercel's production commit and to the new GitHub source commit. Confirm migrations, health, feature flags and API/SPA browser smoke.
4. Finish authenticated two-tenant stock/finance tests, staging backup/restore, payment provider state tests, then authorize flags per tenant. Neither this document nor the archive performs automatic rollout.
