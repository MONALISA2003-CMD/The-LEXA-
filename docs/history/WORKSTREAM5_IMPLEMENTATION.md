# LEXA Workstream 5 — Procurement, Warehouse & Manufacturing

This increment extends the existing multi-tenant NestJS API and PostgreSQL schema. It intentionally reuses LEXA's purchase-order, goods-receipt, Accounts Payable, stock-reservation, stock-movement and General Ledger foundations rather than creating parallel inventory or payables ledgers.

## API surface

All operations are scoped under:

`/workspaces/:workspaceId/branches/:branchId/supply-chain`

The backend controller and OpenAPI contract cover 53 Workstream 5 operations across:

- **Procurement:** suppliers; purchase requests and lines; submission and decisions; RFQs and invitations; supplier quotation submission/comparison; awards, approval rules and decisions; conversion to existing purchase orders; goods receipts; supplier returns and debit/credit notes.
- **Warehouse:** warehouses; transfers, dispatch and receipt; count sessions, review and approval; replenishment policies/suggestions; picklists, location-aware reservations/picking, packages, packing slips and dispatch.
- **Manufacturing:** BOMs and component lines; work orders and material reservations; job cards/steps; issue/consume components; output receipt; material cost and WIP accounting.
- **Quality and traceability:** inspection plans/results/decisions; lots, serial numbers, expiry/manufacture dates, supplier/receipt/work-order provenance, quarantine and authorized release.

## End-to-end workflow

1. Create a purchase request with item quantities and required delivery date.
2. Submit it and record the configured approval decision.
3. Issue an RFQ to invited suppliers. Capture quotations in the RFQ currency, price, lead time, delivery terms and validity.
4. Compare quotations, make an award and obtain the required approval.
5. Convert the approved award into an existing LEXA purchase order with request/RFQ/award references.
6. Receive the PO into the existing goods-receipt tables. Accepted quantity creates lots/serials and stock-ledger movements; the receipt posts inventory against goods-received-not-invoiced (GRNI).
7. Use the existing Accounts Payable supplier-invoice matching and payment workflow against the PO/receipt.
8. Transfer, count, replenish, pick, pack, dispatch or return goods using auditable stock movements and reservations.
9. Reserve BOM components, record production job steps and component consumption, receive finished goods into stock, then inspect, quarantine or release output.

## Ledger treatment

- **Purchase receipt:** debit inventory; credit GRNI.
- **Supplier return dispatch:** debit Accounts Payable; credit inventory, with a supplier debit-note record.
- **Stock-count increase:** debit inventory; credit inventory adjustment gain.
- **Stock-count decrease:** debit inventory shrinkage; credit inventory.
- **Production issue:** debit work in progress; credit inventory.
- **Production receipt:** debit finished-goods inventory; credit work in progress, using recorded material cost.

Stock-affecting writes execute with their domain records, reservation changes, lot/serial status updates, stock movements and journals in database transactions. Serial-tracked operations record serial-level movements. Idempotent source postings and branch/tenant scoping reuse the existing LEXA ledger conventions.

## Important files

- `backend/src/supply-chain/supply-chain.controller.ts` — Workstream 5 application endpoints and transactional orchestration.
- `backend/src/authorization/role-policy.ts` — scoped access policy for procurement, inventory, approval, manufacturing and quality actions.
- `backend/prisma/migrations/20261031170000_workstream5_procurement_warehouse_manufacturing/migration.sql` — new relational tables, indexes, constraints, tenant RLS policies and lot/serial extensions.
- `backend/prisma/schema.prisma` — stock-movement enum extension.
- `backend/src/general-ledger/ledger-posting.ts` — WIP and supplier-return ledger accounts.
- `backend/src/finance/finance-operations.controller.ts` — fixes the existing `AccountingPeriod.startsOn` TypeScript build error.
- `lexa-frontend/openapi/backend-contract.yaml` — client-facing API contract.

## Verification performed

- `npm test`: **13/13 passing**.
- `npm run contract:check`: **214 operations across 167 routes**, no missing/orphan OpenAPI operations; 16 backend adapters wired.
- `npm run ledger:coverage`: passed for 9 source workflows, idempotency/balance invariants and branch checks.
- TypeScript transpilation checks passed for Workstream 5 controller, finance controller, role policy and app module.
- Standalone strict type-check harness for the Workstream 5 controller passed.

A full Nest build and Prisma/PostgreSQL migration validation were not run in this working copy because backend dependencies were not installed successfully in this environment. Production Neon has not been modified by this increment.

## Release sequence

1. Review and merge the source and migration into the connected GitHub repository.
2. Confirm the pending historical migrations in the repo are intended for the current production DB, then run `npm ci`, `npm run db:validate`, `npm run db:migrate:deploy`, `npm run build`, and tests in CI/staging.
3. Deploy the matching backend build to Render and verify `/health` plus the end-to-end PR → RFQ → award → PO → receipt → AP invoice/payment scenario.
4. Deploy the matching frontend contract/build to Vercel after the backend is healthy.

Render is currently configured for automatic deployment on pushes to `main`, so a merge/push will trigger its build automatically. Do not deploy this migration against production until the release checks above pass.
