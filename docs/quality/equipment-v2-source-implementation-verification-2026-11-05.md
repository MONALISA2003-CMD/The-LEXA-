# LEXA equipment and after-sales V2 — source implementation and verification

**Review date:** 2026-11-05. **Basis:** `docs/specifications/lexa-electronics-catalogue-v2.md`, especially §§4.4–4.9, 5–11.  
**Release classification:** candidate source implementation; **NOT a Phase 9 sign-off or a certified live launch**.

## Delivered and tested in the source

- Versioned typed policies and guided input for 34 computer, printer, office, network, security, AV, kitchen and major-appliance subtypes. The frontend generator and API validator consume the same contract, and the original 13 business industries remain unchanged.
- Guarded physical-unit upgrade work orders with a separate approver, persistent pending-order list, inspected before/after configuration, exact part SKU and warehouse/lot selection, actual parts issue, exact unit-cost increase, immutable configuration events and balanced journal posting in one serializable transaction.
- Sale-linked physical-unit delivery status and proof events, split-system component identity, commissioning requirements, original-sale warranty intake, copier service-meter history, and **customer-owned repair custody that never creates merchant saleable stock**.
- Server-enforced tenant/branch permission checks, additive FK-constrained schema, tenant RLS, and immutable event triggers. The new equipment write features are **disabled unless an explicit active tenant override exists**.
- Extended product-level serial ageing, sell-through and posted margin reporting. A missing actual sale cost now produces an explicit unknown-margin result instead of artificially inflated profit; cancelled/uncompleted sales are excluded from those margin calculations.
- Legacy Commerce purchase/sales-order routes now reject serialized, lot-tracked and actively variant-configured products that the old route cannot represent accurately. Users must use canonical identity-aware workflows; nothing is silently posted as a product-level quantity.
- Signed-evidence **intake gate** that blocks a release without all 25 E2E and 20 adversarial §11 scenarios, six role groups, two tenants/two branches, concurrency/performance measurements, independently linked QA evidence and owner review. A JSON assertion is **not itself a cryptographic signature or production authorization**.

## Reproducible source checks

Run from the clean repository root (with CI-provided Node dependencies for complete builds):

```bash
python scripts/sync_industry_catalogue.py --check
python scripts/sync_electronics_catalogue_v2.py --check
python scripts/sync_electronics_equipment_subtypes.py --check
cd backend
npm test
python scripts/check-openapi-coverage.py
python scripts/check-route-adapter-coverage.py
node scripts/check-route-uniqueness.mjs
node scripts/check-backup-inventory.mjs
node scripts/verify-ledger-posting-coverage.mjs
```

Observed locally: **332/332** backend tests passing; **459** OpenAPI operations across **371** documented paths; **482** route registrations across **30** controllers; **18** client adapters; **195** authoritative-backup inventory table decisions; **15** legacy ledger workflows; all three catalogue generation checks passed. Global TypeScript type-check of the dependency-free subtype contracts and syntax-transpile of affected TS/TSX files passed.

**Neon isolated schema test:** On staging branch `br-frosty-queen-ba5e96ee` (forked from production on 2026-11-05), executed all **24 SQL statements** of `20261105220000_equipment_service_and_appliance_custody/migration.sql` in one transaction successfully. Read-only post-check: **10** new tables, **10** RLS policies, **10** FORCE RLS tables, **10** authoritative backup table entries and **3** immutable event triggers. This was a staging SQL execution—not an execution of `prisma migrate deploy` or a production schema change. Do not assume RLS role E2E, migration replay under Prisma, or restores are proven.

## Not yet certified, or still missing the full requested behaviour

| PRD area | Source status | Remaining critical certification / implementation |
| --- | --- | --- |
| Phase 5 — IT & service | Typed subtypes, exact upgrade journal and history, pending review screen, meter intake and partial reports implemented | True manufacturer-master verified specs, technician execution/QA lifecycle, asset-site ledger/reporting and five-real-serial staged journal/COGS case |
| Phase 6 — appliances & warranty | Appliance subtypes, sold-unit dispatch/POD evidence, component mapping and initial warranty intake | Full warranty claim decisions/service-parts/replacement ledger, technician scheduling, failed-delivery remediation and exact three-fridge/split-AC staged tests |
| Phase 7 — finance | Canonical POS exact-unit COGS, atomic upgrade journal, limited inventory/payment exception queries, landed-cost allocation helper and fail-closed fiscal confirmation policy | Complete PO↔invoice↔receipt mixed-currency allocation, external payment saga/outbox consumers, refund/exchange/warranty replacement/assembly reversals, tax/EFRIS authorization and finance sign-off |
| Phase 8 — every client and recovery | Shared subtype validation, legacy path restrictions, additive RLS, backup inventory declarations, OpenAPI route coverage and evidence requirements | Live REST/browser/CSV/XLSX/worker equivalence, tenant-role matrix, 1,000-unit scanner tests, multi-branch concurrency, timed search, actual restore/checksum/object backup and payment replay tests |
| Phase 9 — deployment | Release flags, staging-evidence template, fail-closed 45-scenario intake check, rollback steps | Signed QA/owner evidence, migration-deploy rehearsal, live smoke on test tenant, monitoring thresholds and explicit go/no-go authorization. **No production enablement** |

The test count above is **source regression evidence**, not proof that all acceptance criteria are implemented or passed. A complete dependency-backed backend Nest build, Prisma generate/validate, frontend `tsc -b`/Vite build, browser Vitest/Playwright, and actual multi-tenant SQL/restore tests must be run in CI and staging. This runtime did not have the project's npm packages installed.

## Safe deployment guidance

1. Import the clean repository ZIP; preserve `.github` workflows and established lockfile generation in the destination repository's import pipeline. Do **not** upload this report or package as a replacement for production database backups.
2. Require green source contract checks and backend/frontend production builds. Run Prisma migrations on isolated staging from a validated backup, and compare migration checksums and schema/role grants.
3. Run **all** section 11 scenarios using synthetic staging tenants. Record scenario-by-scenario evidence, the exact deployed Git SHA, application build SHAs, RLS actor matrix, inventory/GL reports and restore checksums. Use `npm run release:electronics-gate -- <evidence.json>` only after independent verification.
4. Keep `equipmentServiceV2` and `applianceFulfilmentV2` off for active tenants until the owner explicitly authorizes pilot promotion. On any stock, financial or privacy invariant failure, stop new feature writes and preserve posted history; do not replay non-idempotent payments or overwrite old serial/sale evidence.
