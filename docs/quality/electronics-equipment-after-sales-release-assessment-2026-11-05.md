# LEXA equipment, appliances and after-sales — implementation and release assessment

**Date:** 2026-11-05  
**Specifications:** `LEXA_ELECTRONICS_CATALOGUE_V2_SPECIFICATIONS.md`, sections 4.4–4.9, 5–9, 10 (Phases 5–9), and 11.  
**Scope:** source implementation prepared against a previously healthy Phases 1–4 baseline. **Not a production certification.**

## Binding invariants

Keep one canonical inventory and accounting ledger. Never reset historical product, SKU, lot, unit, sale, stock movement, payment or journal identifiers. Manufacturer model specification, merchant offering, sellable variant and physical unit are different. Customer-owned repairs are custody objects, not available merchant stock. A delivery-state transition never creates a stock receipt. No ordinary sales receipt implies EFRIS acceptance. Only verified compatible accessories may be recommended. Feature flags are off until staging evidence and explicit authorization are recorded.

## Implemented source changes

| Requirement | Source delivered | Remaining proof / limitation |
| --- | --- | --- |
| IT/office/network/CCTV/audio product wizards | 34 versioned subtype policies and generated Nest/browser contracts; guided subtype, verified manufacturer code, type-specific fields; server validation against the same contract; warehouse package and fitment still use Phases 1–4 engine. | Verify each subtype's manufacturer reference/real product model and browser accessibility on Android; do not infer maker specifications. |
| Laptop upgrades / used-device cost history | Work order draft + separate approval + serializable part consumption + unit configuration event + updated exact physical-unit value + balanced posting; exact-cost POS source with mixed-cost line rejection; 5-unit arithmetic regression. | Staging seeded five-laptop / SSD scenario, receipts and financial journal; independent quality inspection and supplier-cost evidence. |
| Copier meters / customer IT systems | Monotonic meter event API, separate customer-owned custody register, installation component mapping and immutable unit configuration events. | Full service interval scheduling, customer-site assets, toner fitment under actual supply and commissioned install records. |
| Appliance delivery, split AC, warranty | Subtype/serial policy, sold-serial-bound custody states, dispatch/failure/POD evidence, split-AC indoor/outdoor mapping, commissioning checklist, warranty opening from original sale. | Complete technician scheduling, warranty replacement/parts lifecycle and exact original-sale repair/reversal evidence in staging. |
| Finance integration | Exact serial receipt/upgrade cost in sale COGS, integer landed-cost allocation rule, backend report of over-collected payments and receipt movement differences, no fabricated fiscal confirmation, preserved sale snapshots and existing payment and journal engine. | Full PO↔supplier invoice↔partial receipts↔cost layers and mixed-currency reconciliation, outbox/provider payment replay tests, refund/exchange reversals and supplier return certification remain required. |
| Cross-client safeguards | Shared subtype validation in browser/API/CSV product paths, tenant/branch scopes and route role policy, RLS migrations, backup inventory registry, append-only equipment history and regression tests. | Validate XLSX/direct-worker parity, network loss, independent tenant/branch matrix, restore relation checksums and load performance with real infrastructure. |
| Staging and rollout | Read-only fail-closed evidence CLI, template with explicit independent checks, two guarded feature flags `equipmentServiceV2` and `applianceFulfilmentV2` plus existing electronics flags; no enable-by-default. | Entire Phase 9 still requires explicit signed QA/owner evidence, real staging database migration/restore, deployed SHA, live smoke tests, feature rollout, monitoring and operator authorization. |

**No claim of completed end-to-end Phases 5–9 acceptance is made.** These code foundations and safeguards are only part of that larger contract. Production must not auto-enable the new flows.

## Test and build evidence from this source preparation

- `node --experimental-strip-types --test test/*.test.mjs` from `backend`: all passing; exact pass count is in recorded final verification output, not a substitute for DB E2E.
- `npm run backup:inventory-check`: 195 decisions including all ten new tables; `node scripts/check-route-uniqueness.mjs`: 481 routes / 30 controllers.
- `npm run ledger:coverage`: existing 15 source workflow invariants passing; `npm run adapter:check`: 18 adapters; `python scripts/check-openapi-coverage.py`: 458 published OpenAPI operations, including all 16 new `/equipment` operations; no orphan or missing routes.
- `python scripts/sync_electronics_equipment_subtypes.py --check`, `python scripts/sync_electronics_catalogue_v2.py --check`, and `python scripts/sync_industry_catalogue.py --check` pass.
- Strict standalone TypeScript check of the pure subtype rules and syntax-transpile of affected TypeScript/TSX modules pass. **A dependency-complete Nest build, Vite build, Vitest/Playwright tests and Prisma generate/validate have not run in this environment** because the project's npm dependencies are not installed. Running build on GitHub is mandatory.
- New Prisma DDL has not been exercised against a fresh Neon staging branch in this source preparation; do not infer migration correctness from static checks.

## Phase 9 certification scenario register

| Scope | Required staged evidence | State |
| --- | --- | --- |
| E2E-009 | Receive 5 laptop serials, install SSD into exactly one, reconcile part lot, exact journal, COGS, unchanged other four | **PENDING** |
| E2E-010/013/014 | TV printer/toner and CCTV serial/fitment/installation; no installed available unit | **PENDING** |
| E2E-015/016/017 | 3 fridges, exact serial reservation/dispatch/POD, split AC dual units, blender qty stock | **PENDING** |
| E2E-020/021/022 | Customer repair custody; partial PO and landed-cost; exchange and tax/COGS reversals | **PENDING** |
| E2E-024/025 | 500-row bad import prevention and restored relational checksums including unit, kit and finance | **PENDING** |
| NEG-001–020 | Direct REST/CSV/worker/browser bypass attempts, concurrency, branch leak and payment replay | **PENDING** |
| §11.3 | All roles, two tenants/two branches, stale auth, CSRF and offline replay | **PENDING** |
| §11.5 | p95 product query and IMEI lookup, 1,000-unit scan, 100 simultaneous last-unit reservations, keyboard/screen-reader/mobile | **PENDING** |

## Controlled release sequence

1. Start from a SHA-pinned Git branch; run generated-contract checks, `npm test`, `npm run build`, frontend `npm test` and `npm run build`; inspect all failures.
2. On an **isolated Neon branch** restored from a recent backup, run the full ordered Prisma migrations, Prisma `migrate status`, new RLS policy tests as `lexa_app_runtime`, and seeded exact-serial and ledger scenarios. Verify no migration ambiguity, FK mismatch or invalid enum before production.
3. Compare backup and restored inventory identities, costs, serial identifiers, ledger totals, attachments/object storage checksums and relational foreign keys. Record immutable evidence references.
4. Record stage and internal-test workspace Git SHA, frontend/backend build SHAs, Prisma migration head and evidence for *every* Phase 9 check in `docs/quality/electronics-v2-staging-evidence.template.json` copied into a review-only evidence file. Run `npm run release:electronics-gate -- <evidence.json>`; a missing field **must exit nonzero**.
5. Require explicit owner approval separate from the engineering artifact; never auto-promote to production. Enable `equipmentServiceV2` and `applianceFulfilmentV2` **only** on an internal test tenant via an authorized feature override, then opt-in pilot and allowlisted tenants after monitoring acceptance.
6. During controlled rollout watch API 409/403/5xx, duplicate IMEI, stock-vs-ledger value and quantity drift, negative/over-reserved units, unusual margins, quarantines, delivery mismatches, journal imbalance, payment dedupe and restore health. Halt flags on invariant failures. Never delete posted sales, receipts or replay provider payments without idempotent confirmation.

## Rollback and incident handling

- If a *feature* invariant fails: turn off the affected tenant feature flag through audited owner permissions. This stops new writes; the historical data stays in place.
- If a migration fails: stop startup as the current deployment does; investigate the failed migration record and partial schema. Never edit a migration already applied in production, force `migrate resolve --applied`, or rerun a destructive SQL patch without staging preflight.
- If a posted sale/payment/stock value diverges: pause affected writes, preserve audit and event history, reconcile exact source IDs and post an approved compensating journal; never directly rewrite historical receipts or physical-unit identities.
- If restoration cannot prove all authoritative tables/attachments and FKs, do not promote the restore. Recover on an isolated branch and compare checksums first.
- Release engineering and business owner must separately approve production promotion. This package includes **no approval, signature or live smoke-test results**.

## Known implementation gaps requiring follow-up

1. New `/equipment` OpenAPI paths and TypeScript adapter are published and coverage-checked, but the complete signed generated-client/E2E contract for every external/worker client remains to be certified.
2. Full warranty service-parts consumption, claims decision/replacement, supplier returns, multi-currency cost layer integration, payment/outbox consumers and financial reversals are not exhaustively implemented/certified by this package.
3. Client-specific XLSX/worker implementations and cross-device E2E, performance benchmarks, service attachment/tech assignments, full disaster recovery rehearsal are pending.
4. Actual checked-in deployment Git SHA and production migration head must be captured *after* CI green and staging/production deploy; this source archive is not a deployment record.
5. A production feature flag must stay disabled while any item above can affect posted inventory, payment or sale correctness.
