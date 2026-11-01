# LEXA Workstream 7 — Increment 1 implementation report

**Prepared:** 2026-11-01  
**Scope:** Increment 1 — sales payment records and delivery/dispatch records  
**Database:** Neon project `empty-mud-76816448`, branch `br-snowy-hill-ba5a9ggc`, database `lexa`

## Delivered in source

### Sales payments

- Manual payment categories: cash, mobile money, bank transfer/deposit, card, cheque and other.
- Multiple payment allocations at checkout; credit remains an outstanding balance, not a payment method.
- Payment labels (for example, mobile-money network or bank), references, notes and reported received time.
- Actor attribution and chronological payment/refund history.
- Later instalments are appended as new receipts.
- Refund/reversal records remain distinct from receipts and can link to an original receipt.
- Customer balance and ageing/payment reporting, including method, label, branch, date and recorder dimensions.
- Cash-session and existing ledger posting paths are reused; payment/provider settlement is not externally verified.

### Delivery and dispatch

- Tenant-scoped rider and transport-agent directory, including activation/deactivation and history.
- Multiple partial dispatches from a single POS sale; multiple sale lines in one dispatch.
- Transactional quantity locking and dispatchable quantity validation, with sold-line, returned quantity and existing reservation checks.
- Delivery item snapshots preserve product name/SKU, sale-line, serial/lot/variant, quantity, selling price and cost snapshots.
- Delivery lifecycle events are append-only and idempotent. Return and reattempt transitions do not silently restock inventory.
- Separate rider collection reports and multi-method report lines; these do not count as sale receipts.
- Partial remittances and grouped allocations; only cashier-accepted value becomes a sale receipt and cash/ledger effect.
- Direct-to-business payments can be recorded against the sale and linked to a delivery separately from rider-held collections.
- Delivery dashboard, agent directory/history, dispatch detail/timeline, lifecycle controls, collection/remittance workflow and reports.
- Sales-order fulfilment now also creates the linked sale/delivery, snapshots the fulfilled items, records the initial event and uses idempotency.

## Database migrations applied

Both migrations were applied to the Neon parent branch after successful preparation and validation on temporary Neon branches:

1. `backend/prisma/migrations/20261101090000_workstream7_increment1_payments_delivery/migration.sql`
   - Extends the existing `sale_payments` ledger and `commerce_deliveries` records.
   - Creates delivery agents, item snapshots, event history, rider collection reports/lines, remittances and remittance allocations.
   - Removes the legacy one-delivery-per-fulfilment uniqueness rule while preserving legacy records and their state.
2. `backend/prisma/migrations/20261101091000_increment1_legacy_fulfilment_sale_line/migration.sql`
   - Adds tenant-safe sale-line mapping to fulfilment lines.
   - Backfills only unambiguous historical mappings and corresponding item snapshots.

The approved parent branch was checked after application: new tables, payment columns, constraints/indexes and the legacy sale-line mapping column/FK/index are present. The original Neon branch was not replaced or reset. Both migration test branches were deleted after successful application.

## Verification completed

- Backend automated tests: **44 passed, 0 failed**.
- OpenAPI/controller coverage: **264 operations across 204 routes; no missing or orphan operations**.
- Route-to-adapter coverage: **17 backend-backed domain adapters passed**.
- Ledger coverage: **9 source workflows passed**, including idempotency/balance and branch checks.
- TypeScript/TSX syntax transpilation: all changed backend/frontend source files passed.
- Read-only SQL checks against the applied Neon schema passed for dispatchable quantities (including legacy fallback), remittance allocations and payment method/recorder reporting.

## Not certified / outstanding

- A full dependency-backed Nest/Vite production build and HTTP/database end-to-end suite were not completed in this environment. Backend dependencies were not installed; the package-install attempt timed out. Syntax transpilation is not a substitute for a full compiler/build.
- The connected Neon branch currently has no sales, sales-order fulfilments or delivery records available for real-record end-to-end acceptance; query validation used an empty-tenant probe.
- Optional payment-evidence attachment is not wired into this increment because the inspected live database has no attachment metadata table. Secure generic file upload/scan/release is specified for Increment 2 and should be used rather than introducing an insecure ad-hoc upload path.
- The application source changes in this bundle have not yet been committed to the connected GitHub repository or deployed to Render/Vercel. The Neon schema migration is applied; application deployment remains separate and must follow successful CI/build validation.
- No MTN/Airtel payment API, bank verification API, card processor, courier/carrier API, GPS tracking or tax filing integration was added, per the product boundaries in the engineering specification.

## Release sequence

1. Run dependency-backed backend and frontend builds in CI.
2. Run HTTP authorization, tenant/branch isolation and transaction tests against an isolated staging DB/Redis environment.
3. Review and commit this source bundle to the LEXA repository on a dedicated increment branch.
4. Deploy to Render/Vercel staging; verify API/frontend compatibility and checkout, instalment, refund, multi-batch dispatch, collections and remittance flows.
5. Promote only after CI and staging acceptance evidence is green.
