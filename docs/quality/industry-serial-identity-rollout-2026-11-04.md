# LEXA 13-industry inventory — Phase B1 fix, deployment and next stages

**Date:** 4 November 2026  
**State:** Local source checks passed; full GitHub CI, production migration and live checkout remain to be verified.

## A. Repaired failure

`lexa-frontend/src/modules/products/AdaptiveProductFields.tsx` mixed two field shapes: a `ProductField` supporting optional `required` and a saved category field without that property. Under `exactOptionalPropertyTypes`, reading `field.required` was a compile-time error. The merged field list is now explicitly `ProductField[]`, with category-only fields normalized as `required:false`. Template-required fields keep their validation. The JSX category form no longer nests a label inside another label. This preserves compiler strictness and the existing category editor behavior.

## B1. Inventory identity implemented in this package

1. `backend/src/catalog/serial-identity.ts`: pure check-digit/serial validation. Phone templates require 15-digit Luhn-valid IMEIs for the primary and optional secondary identifiers. Other serialized appliances use their real manufacturer serial. All serial registration APIs validate independently of the browser.
2. `backend/prisma/migrations/20261104180000_serial_identity_enforcement/migration.sql`: additive normalized lookup indexes and a tenant-scoped trigger prevent **new** cross-slot identifier collisions. A tenant advisory transaction lock serializes concurrent claims to the same business's identifier namespace, including workers and direct SQL writes. No historic product, stock, sales or identifier row is deleted.
3. Corrected legacy lot-capacity function to allow `lot_id=NULL` for products where a separate stock lot is not required. Lot-bound registration still locks the received lot and checks capacity.
4. Backend serial API rejects fractional lot receipts for serialized products, corrects active-status spelling (`quarantine`, not `quarantined`), handles uniqueness collisions with HTTP 409, and captures a second phone IMEI in both registration paths.
5. New branch/tenant-scoped `GET /api/v1/workspaces/:workspaceId/branches/:branchId/inventory/serials/lookup?identifier=...` resolves either position to one physical unit; ambiguous historic collisions return 409 instead of arbitrarily choosing a unit.
6. Checkout barcode/IMEI scanning selects the precise available physical unit, variant, and lot; duplicate selection and cross-branch stock are rejected. Receipts continue to preserve the historical serial snapshot shape; no existing records are rewritten.
7. Frontend registration inputs adapt to IMEI-tracked phones or serial-tracked electronics without blocking ordinary product edits.

## CI / release gates

- ✅ Backend unit/static regression suite: **232 passed**.
- ✅ Controller route uniqueness: **418 registrations / 27 controllers**.
- ✅ OpenAPI and controller operations agree: **395 operations / 319 routes**.
- ✅ Frontend adapter contract: **17 adapters**; 13-industry contract synchronized.
- ✅ Strict standalone TypeScript field-compatibility fixture and pure serial module type-check with system TypeScript compiler; 264 frontend/backend TS/TSX files parse.
- ⏳ Full frontend `npm ci && npm run build` and backend `prisma generate && nest build` require the dependency-backed GitHub workflow (not possible on the isolated local npm cache).
- ⏳ Actual PostgreSQL migration, concurrency under two real DB sessions, branch-scoped HTTP checkout smoke tests, backup/recovery rehearsal, and live Render verification.

### Deployment sequence

1. Upload the **new root-level ZIP only** into `main` of MONALISA2003-CMD/The-LEXA-. Do not delete another ZIP in the same commit. The importer expects one newly changed ZIP per push and replaces source only after validation.
2. Confirm GitHub Actions importer passes backend tests, Prisma validation, Nest compilation, frontend tests, and `tsc -b && vite build`.
3. Before the database migration, **take a production DB backup** and run the read-only duplicate-identifier query in `docs/operations/runbooks/serial-identity-enforcement.md` on a staging copy.
4. Rehearse the additive trigger/index migration on a Neon/PostgreSQL branch using the actual runtime role; test concurrent same-tenant IMEI1/IMEI2 inserts, different-tenant reuse, standalone serials with null lot, lot capacity, read isolation and existing stock balances.
5. Apply migrations through the authenticated deploy process. Watch Render logs and `/health/ready`; verify app startup and an actual authorized checkout scan for an existing device.
6. Refresh frontend deployment: the frontend uses the new serial/IMEI lookup and must not be ahead of an older backend API.
7. Retain prior deployment and backup for rollback; never remove historic rows or migration history.

## B2 / C / D: remaining engineering (not claimed implemented)

- **B2 — Full identity registry:** Design normalized per-unit identifier records with tenant constraints and historical collision resolution; connect sale returns, device warranty and repair history without fabricating IMEIs. Formalize serial status transitions, warehouse/lot invariants and high-concurrency benchmarks.
- **C — End-to-end stock integrity:** Enforce physical identity during purchase receiving, interbranch transfer, pick/pack/dispatch, returns and adjustments; prohibit selling, moving or reserving the same unit twice. Add base-unit/carton conversions and cost reconciliation for wholesale/hardware.
- **D — 13 industry experiences:** Product/model wizards for phones/electronics, fashion matrix, supermarket/wholesale packaging, bakery lot freshness, hardware measured units, cosmetics, repairs, books/education; the industry selection must remain a backend-enforced policy, not merely a UI preset.
- **E — Every module/client:** Generate OpenAPI SDKs and cross-client tests, reconcile inventory/sales/accounting/AI reporting against product→variant→lot→physical-unit identities. Test mixed-industry businesses, tenants, branches and employee roles.

**Known limitation:** The migration blocks new duplicate identifiers but intentionally does not rewrite existing collisions or historical receipt snapshots. An already-colliding legacy business needs manual reconciliation; the lookup endpoint refuses ambiguous matches. A successful source build is not certification of production readiness.
