# Multi-business ERP — source implementation and outstanding acceptance

**Reference:** `docs/specifications/lexa-multi-business-industry-adaptive-erp.md`  
**Date:** 5 November 2026  
**Architecture:** one tenant-authoritative catalogue, inventory movement ledger, purchasing history, sales snapshots and general ledger. No second inventory/accounting system.  
**Release status:** code package ready for GitHub CI; **not** deployed or approved for business production writes. **The complete SRS has not passed its required end-to-end acceptance.**

## Implemented in this source delivery

1. **Formula and production controls:** `IndustryOperationsController` and Prisma models support draft → independent approval → completed production orders with persisted approved formula ingredients, warehouse and source-lot identity. Transactions lock and conditionally update lots, record consumption, finished batches or non-stock prepared-meal COGS, actual loss movements, audit and balanced GL journals. Duplicate completion returns the original result. Only branch-authorized lots are allowed. A quarantined perfume tester is not immediately sellable.
2. **Decants and ingredient recipes:** quantity math uses strict fixed-point decimal strings, source-lot cost allocation and source-to-output reconciliation. Existing stock cannot be duplicated as decants/finished goods. Consumption requires lot-tracked ingredients with known positive cost. **Limit:** a sealed perfume bottle counted only as a *bottle* must first have an authorized volume stock representation; directly opening a sealed bottle into millilitres is not yet a complete workflow. Production costing fails closed when its current integer-minor cost layer cannot express a value exactly.
3. **Measured stock loss:** reviewed, idempotent cut-loss records reference an actual completed lot-linked length sale, a real source lot, a second approver, a separate loss stock movement and GL journal. The original sale quantity remains unchanged. General measured sale-UoM conversion and automated cutting/waste from supplier rolls remain partially implemented.
4. **Versioned rational UoM policies:** tenant-scoped approved unit-conversion records store numerator/denominator, dimensional compatibility, real evidence and revision. They are database-immutable. **Limit:** applying the stored conversion consistently to every purchase receipt, invoice and checkout is not yet covered end to end.
5. **Business divisions:** tenant owner can define divisions and assign the primary division to real products. Checkout captures `business_division_id` on each sale line at sale time; editing assignments does not rewrite posted history. Product page exposes division management; Finance shows gross posted sale-line attribution, recorded returns and documented unknown cost. **Limit:** it does not claim final net margin or reconstruct every GL source to a division.
6. **Python intelligence:** staff initiate a warehouse demand review using authorized movement aggregates and approved lead-time/safety-stock settings. The child Python process runs without DB credentials, shell or network inputs, within a bounded time and payload, and returns validation history, baseline quality, warnings and suggested review quantities; it cannot create purchase orders or post stock. The frontend displays its provenance and approval boundary. Supplier pack size remains an explicit one-unit fallback until actual verified pack evidence is attached. No scheduled autonomous replenishment is enabled.
7. **Cross-module:** existing 13-industry/48-specialty/72-product policies, business settings, product wizard, inventory, purchasing/checkout relevance and read-only finance selection remain intact. New API routes are in the central OpenAPI contract, with tenant/branch session authorization, role checks and CSRF for POST. New authoritative tables have RLS, immutable triggers and backup inventory registrations.

### Important production safeguards

- `industryOperationsV1` is **off** unless independently authorized in a live tenant's feature overrides and a valid subscription. Formula and production approvals and stock posting require this guard. Existing stock/finance and historical electronics identities remain untouched.
- No customer or production database writes were performed by preparing this archive. The new SQL file is additive, forward-only and must be migrated by Render's normal coordinator **only after the complete CI and real staging checks pass**.
- A successful deploy or a passing unit suite alone does **not** certify financial/stock invariants. Separate approvers and real inventory evidence are necessary.

## Verification performed on this package

- Backend: **364/364** Node tests passed using the local source test runtime (not a full Nest dependency-backed build).
- Python: **18/18** unittest cases passed, plus actual Node-to-Python worker execution/rejection tests in the 364 backend cases.
- OpenAPI: **480** operations across **387** routes matched the Nest controller declarations; route uniqueness passed across **503** registrations / **31** controllers.
- Backup: **204** table decisions and source ledger coverage (15 workflows) passed; generated industry, electronics and specialties contracts synchronized.
- TypeScript syntax: **310** TS/TSX source files parsed with no syntax diagnostics. This is not a strict Prisma-generated type-check.
- Neon staging read-only schema inspection confirmed legacy tenant-specific composite keys, backup columns and the runtime database role exist. **The new SQL migration itself has not been executed on an isolated clone**, and the 65 business scenarios, 45 electronics scenarios, browser journeys, tenant-isolation matrix and disaster-restore rehearsal remain unverified.
- **Cannot yet confirm:** GitHub `npm ci`/Prisma generate+validate/Nest build/frontend Vitest+Vite build, runtime route smoke, Render+Vercel new SHA, migrations on staging and controlled production rollout. The package requires those gates.

## Requirements traceability — all tracked SRS requirements

Statuses below distinguish implementation present in reviewed source from full business acceptance; no row is treated as production-certified.

| Requirement | Source status | Remaining evidence / work |
|---|---|---|
| `REQ-SET-001` | Existing / partial platform implementation; acceptance pending | MB-001,035, NEG-001; independent cross-client/tenant verification |
| `REQ-SET-002` | New guarded source implementation; acceptance pending | MB-002,003,039; real PostgreSQL, authenticated REST, frontend and ledger/restore verification |
| `REQ-SET-003` | Existing / partial platform implementation; acceptance pending | MB-003,040; independent cross-client/tenant verification |
| `REQ-SET-004` | Existing / partial platform implementation; acceptance pending | MB-030,036; independent cross-client/tenant verification |
| `REQ-SET-005` | Existing / partial platform implementation; acceptance pending | MB-001,002,008; independent cross-client/tenant verification |
| `REQ-CAT-001` | Existing / partial platform implementation; acceptance pending | MB-003,040; independent cross-client/tenant verification |
| `REQ-CAT-002` | Existing / partial platform implementation; acceptance pending | MB-008, NEG-002/003; independent cross-client/tenant verification |
| `REQ-CAT-003` | Existing / partial platform implementation; acceptance pending | All pack creation cases; independent cross-client/tenant verification |
| `REQ-CAT-004` | Existing / partial platform implementation; acceptance pending | NEG-023; independent cross-client/tenant verification |
| `REQ-CAT-005` | Existing / partial platform implementation; acceptance pending | MB-029 + Electronics V2; independent cross-client/tenant verification |
| `REQ-INV-001` | Existing / partial platform implementation; acceptance pending | MB-002,031,033; independent cross-client/tenant verification |
| `REQ-INV-002` | New guarded source implementation; acceptance pending | MB-010..015,021..022; real PostgreSQL, authenticated REST, frontend and ledger/restore verification |
| `REQ-INV-003` | Existing / partial platform implementation; acceptance pending | MB-024, NEG-025; independent cross-client/tenant verification |
| `REQ-INV-004` | Existing / partial platform implementation; acceptance pending | MB-007,025,029; independent cross-client/tenant verification |
| `REQ-INV-005` | Existing / partial platform implementation; acceptance pending | MB-007,013, NEG-006; independent cross-client/tenant verification |
| `REQ-INV-006` | New guarded source implementation; acceptance pending | MB-023,031, NEG-008; real PostgreSQL, authenticated REST, frontend and ledger/restore verification |
| `REQ-INV-007` | New guarded source implementation; acceptance pending | MB-005,006,019; real PostgreSQL, authenticated REST, frontend and ledger/restore verification |
| `REQ-INV-008` | Existing / partial platform implementation; acceptance pending | MB-029 + Electronics V2; independent cross-client/tenant verification |
| `REQ-PRC-001` | Existing / partial platform implementation; acceptance pending | MB-014,030; independent cross-client/tenant verification |
| `REQ-PRC-002` | Existing / partial platform implementation; acceptance pending | MB-014, NEG-022; independent cross-client/tenant verification |
| `REQ-PRC-003` | Incomplete — business workflow or certification remains | MB-014,015,033; complete transaction / security / finance integration |
| `REQ-SAL-001` | Existing / partial platform implementation; acceptance pending | MB-004,008,011,029; independent cross-client/tenant verification |
| `REQ-SAL-002` | Incomplete — business workflow or certification remains | MB-009, NEG-008; complete transaction / security / finance integration |
| `REQ-SAL-003` | Existing / partial platform implementation; acceptance pending | MB-032, NEG-013; independent cross-client/tenant verification |
| `REQ-SAL-004` | Existing / partial platform implementation; acceptance pending | MB-040; independent cross-client/tenant verification |
| `REQ-BEA-001` | Existing / partial platform implementation; acceptance pending | MB-004; independent cross-client/tenant verification |
| `REQ-BEA-002` | New guarded source implementation; acceptance pending | MB-005, NEG-010; real PostgreSQL, authenticated REST, frontend and ledger/restore verification |
| `REQ-BEA-003` | New guarded source implementation; acceptance pending | MB-006; real PostgreSQL, authenticated REST, frontend and ledger/restore verification |
| `REQ-BEA-004` | Existing / partial platform implementation; acceptance pending | MB-007, NEG-023; independent cross-client/tenant verification |
| `REQ-FAS-001` | Existing / partial platform implementation; acceptance pending | MB-008; independent cross-client/tenant verification |
| `REQ-FAS-002` | Incomplete — business workflow or certification remains | MB-009; complete transaction / security / finance integration |
| `REQ-FAS-003` | New guarded source implementation; acceptance pending | MB-010; real PostgreSQL, authenticated REST, frontend and ledger/restore verification |
| `REQ-RET-001` | Incomplete — business workflow or certification remains | MB-011,012; complete transaction / security / finance integration |
| `REQ-RET-002` | Existing / partial platform implementation; acceptance pending | MB-013, NEG-006; independent cross-client/tenant verification |
| `REQ-WHO-001` | Incomplete — business workflow or certification remains | MB-014,015; complete transaction / security / finance integration |
| `REQ-HOS-001` | New guarded source implementation; acceptance pending | MB-016,017; real PostgreSQL, authenticated REST, frontend and ledger/restore verification |
| `REQ-HOS-002` | Incomplete — business workflow or certification remains | MB-018; complete transaction / security / finance integration |
| `REQ-BAK-001` | New guarded source implementation; acceptance pending | MB-019; real PostgreSQL, authenticated REST, frontend and ledger/restore verification |
| `REQ-BAK-002` | Incomplete — business workflow or certification remains | MB-020; complete transaction / security / finance integration |
| `REQ-HAR-001` | New guarded source implementation; acceptance pending | MB-021; real PostgreSQL, authenticated REST, frontend and ledger/restore verification |
| `REQ-HAR-002` | Incomplete — business workflow or certification remains | MB-022, NEG-011; complete transaction / security / finance integration |
| `REQ-HAR-003` | Incomplete — business workflow or certification remains | MB-023; complete transaction / security / finance integration |
| `REQ-HOM-001` | Existing / partial platform implementation; acceptance pending | MB-024; independent cross-client/tenant verification |
| `REQ-REP-001` | Existing / partial platform implementation; acceptance pending | MB-025, NEG-012; independent cross-client/tenant verification |
| `REQ-REP-002` | Incomplete — business workflow or certification remains | MB-025; complete transaction / security / finance integration |
| `REQ-EDU-001` | Existing / partial platform implementation; acceptance pending | MB-026; independent cross-client/tenant verification |
| `REQ-EDU-002` | Existing / partial platform implementation; acceptance pending | MB-027; independent cross-client/tenant verification |
| `REQ-OTH-001` | Existing / partial platform implementation; acceptance pending | MB-028, NEG-014; independent cross-client/tenant verification |
| `REQ-FIN-001` | New guarded source implementation; acceptance pending | MB-033; real PostgreSQL, authenticated REST, frontend and ledger/restore verification |
| `REQ-FIN-002` | Incomplete — business workflow or certification remains | MB-014,033, NEG-007; complete transaction / security / finance integration |
| `REQ-FIN-003` | Existing / partial platform implementation; acceptance pending | MB-033,032; independent cross-client/tenant verification |
| `REQ-FIN-004` | New guarded source implementation; acceptance pending | MB-002,033; real PostgreSQL, authenticated REST, frontend and ledger/restore verification |
| `REQ-API-001` | Incomplete — business workflow or certification remains | MB-030,036; complete transaction / security / finance integration |
| `REQ-API-002` | New guarded source implementation; acceptance pending | MB-032,039, NEG-010/022; real PostgreSQL, authenticated REST, frontend and ledger/restore verification |
| `REQ-API-003` | New guarded source implementation; acceptance pending | Route/OpenAPI coverage + MB-036; real PostgreSQL, authenticated REST, frontend and ledger/restore verification |
| `REQ-SEC-001` | Existing / partial platform implementation; acceptance pending | NEG-015/016, role matrix; independent cross-client/tenant verification |
| `REQ-SEC-002` | Existing / partial platform implementation; acceptance pending | NEG-014,017,024; independent cross-client/tenant verification |
| `REQ-SEC-003` | Existing / partial platform implementation; acceptance pending | Two-tenant/role export tests; independent cross-client/tenant verification |
| `REQ-INT-001` | Existing / partial platform implementation; acceptance pending | MB-037, NEG-017; independent cross-client/tenant verification |
| `REQ-INT-002` | New guarded source implementation; acceptance pending | MB-038, NEG-018; real PostgreSQL, authenticated REST, frontend and ledger/restore verification |
| `REQ-INT-003` | New guarded source implementation; acceptance pending | MB-037; real PostgreSQL, authenticated REST, frontend and ledger/restore verification |
| `REQ-INT-004` | Existing / partial platform implementation; acceptance pending | Offline backtests and §28; independent cross-client/tenant verification |
| `REQ-OPS-001` | Incomplete — business workflow or certification remains | MB-034, NEG-020; complete transaction / security / finance integration |
| `REQ-OPS-002` | Incomplete — business workflow or certification remains | §25/30 checklist; complete transaction / security / finance integration |
| `REQ-OPS-003` | Existing / partial platform implementation; acceptance pending | Staged rollout audit; independent cross-client/tenant verification |
| `REQ-OPS-004` | Incomplete — business workflow or certification remains | Production evidence record; complete transaction / security / finance integration |


## Specific high-priority unfinished requirements

These cannot be honestly marked complete by adding a form or by static tests:

- **Fashion exchange / credit note:** one atomic, identifiable exchange from the original sold size/colour to the replacement size/colour, with posted tax and cost reversal, payment delta and exact stock disposition; concurrent/duplicate refund tests.
- **Restaurant and bakery certification:** verified allergen provenance, component substitution approval, portion/sale event reconciliation, finished-goods yield variance and custom-cake customer deposits as liabilities until approved revenue recognition.
- **Wholesale and retail UoM integration:** end-to-end versioned carton/piece and measured weight/length conversion applied at PO, receiving, POS, supplier invoice, refund, stock ledger, stock valuation and regulatory import paths; no client/import bypass.
- **Decant source transformation:** real sealed bottle opening, split-volume source custody, atomizer/packaging costs and 100mL→40mL/3mL waste/57mL residual acceptance with actual Neon and GL journal reconciliation.
- **Hardware and tax:** cross-dimensional, product-evidence-approved mass↔length/area conversions, damaged material quarantine, Uganda-compliant tax/fiscal configuration and proof of provider-authorized payment/EFRIS state.
- **Finance:** full source-to-ledger division allocations, refunds and inventory valuation reconciled into a truthful margin; documented multi-currency FX source and rate, AP/AR/GRNI and returns.
- **API/client scope:** CSV import preview/revalidate/apply, offline scanner conflict resolution, background job deduplication, RBAC with two tenants/branches, signed policy publication and restoration of new relations.
- **Full release:** every relevant `E2E-MB-001…065`, negatives, Electronics V2 25+20 journeys, actual signed pilot checks, backup/restore, schema migration, application build, rendering, cost and approvals.

## Next release sequence

1. Keep production flags disabled and preserve historical IDs, paid sales, inventory and journals.
2. Use root-level ZIP with `.github` excluded in `.github/workflows/repository-import.yml`. This workflow restores Git-tracked npm lockfiles and validates both builds before committing source.
3. On a fresh non-production Neon clone of approved source schema, run `prisma migrate deploy`, `prisma validate`, test RLS/tenant separation, triggers, source-lot quantities, immutable formula changes, second-approver conflicts, and Python execution limits.
4. Run authenticated full-stack family journeys through Products → PO → receiving → Inventory → approved production → sale → return → GL → reports and restore a complete backup to a separate environment.
5. Verify GitHub source commit equals Render and Vercel production SHA, health/readiness checks, and migration head. Observe errors and stock/GL reconciliation before explicitly enabling any industry pack for a pilot.

**No production launch authorization is implied by this document.**
