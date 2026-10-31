# LEXA Workstreams 0–3 — completion implementation overlay

**Package type:** additive ZIP overlay only. Existing `lexa-frontend/` structure is retained.  
**Source baseline:** current `main` source snapshot identified in deployment metadata as `1e6ed1b9589b775e033976dc71ce6c9c8f1174d8`.  
**Production effect:** none. No GitHub write, production Neon SQL, production migration, or provider deployment was performed.

## Implemented across the stack

### Workstream 0 — contract/release
- Health routes distinguish `/health/live` from DB-aware `/health/ready`, both unprefixed.
- Exact controller/OpenAPI matching and frontend route-to-adapter checks are in CI.
- Commerce, AR, AP, Module Graph, GL, catalogue/inventory, finance and invitations routes are documented and wired.
- Duplicate session route and unsupported attachment routes/client calls are removed.
- ADR-0001 documents backend-owned identity/session source.
- One local verification command is `scripts/verify-workstreams-0-3.sh` (requires disposable PostgreSQL and installed dependencies).

### Workstream 1 — identity/tenancy/security
- Role capabilities, workspace/branch authorization, branch grants and invitations are implemented.
- Invitation links use random tokens stored as hashes, seven-day expiry, invited-email verification, idempotency, transactional membership/grant activation and audit events.
- Migration `20261030320000_platform_catalog_finance_rls` enables and forces RLS across tenant-owned tables, creates a `NOLOGIN NOBYPASSRLS` runtime role, and defines user-scoped session/reset policies.
- `PrismaService` wraps model delegates, raw SQL and interactive transactions with transaction-local tenant/user/token context.
- DTO validation, manual field allowlists, protected generic-register blocks, optimistic concurrency for generic module records, idempotency and transactional audit are implemented in the relevant core/domain flows.
- The two-tenant HTTP/IDOR harness tests two users, cross-tenant collection/direct-ID/branch denial and sale/payment/return/credit-note flows in both workspaces.

### Workstream 2 — catalogue/inventory/sales
- First-class product units, variants, tax codes/rules, price lists/items, warehouse/bin, lots/batches, serials and stock reservations are in Prisma migrations/schema and Nest APIs.
- Stock/lot reservation capacity is enforced with row locks and database trigger; stock movements remain auditable source-of-truth records.
- Checkout, receipt, return and credit-note handling preserve price/cost/tax snapshots and apply explicit restock/quarantine/scrap disposition.
- Frontend catalogue/inventory and Commerce workflow panels are wired to backend adapters.

### Workstream 3 — finance/ledger
- AR/AP panels are routed and use typed backend services.
- General Ledger supports chart of accounts, periods, journals, post/reverse, trial balance, P&L, balance sheet, account activity and branch-scoped source reconciliation.
- Nine source event families produce balanced, idempotent postings in the originating transaction.
- Cash sessions/movements/cash-ups, bank accounts/import/reconciliation, typed expenses/categories, fixed assets/depreciation, tax codes/rules and cost centres/allocations have schema, APIs and frontend operations panels.

## Migration order

The full chain is under `backend/prisma/migrations/`, with the Workstream 0–3 migrations:

1. `20261030230000_branch_scoped_authorization`
2. `20261030240000_general_ledger_foundation`
3. `20261030250000_ledger_source_postings`
4. `20261030260000_inventory_ledger_accounts`
5. `20261030270000_explicit_branch_scope_mode`
6. `20261030280000_accounting_period_integrity`
7. `20261030290000_automatic_period_rollover`
8. `20261030300000_sale_return_disposition`
9. `20261030310000_ledger_source_reconciliation`
10. `20261030320000_platform_catalog_finance_rls`

Use Prisma migration history, not hand-run DDL, for the eventual integration environment. Never use `prisma migrate dev` against production.

## Checks completed in this workspace

- `python backend/scripts/check-openapi-coverage.py`: **158 controller operations across 123 routes**, exact match.
- `python backend/scripts/check-route-adapter-coverage.py`: **16 adapters** wired.
- `node backend/scripts/verify-ledger-posting-coverage.mjs`: **9 source families** pass structural idempotency/balance/branch assertions.
- `npm test` in backend: **12/12 authorization tests passed**.
- TypeScript/TSX `transpileModule` syntax pass: **135 files, zero syntax diagnostics**.
- JSON/YAML parse and ZIP CRC checks passed.
- Isolated Neon direct checks show **41 tenant-keyed tables / 42 RLS-enabled tables**, runtime role without superuser or `BYPASSRLS`, and correct tenant/session/membership policy behavior including blocked cross-tenant writes.

## Explicitly not claimed as complete verification

- Full dependency-backed Nest build and frontend TypeScript/Vite build: not run because package installation timed out in the workspace.
- Full Prisma schema validation/generation/migration-runner execution: not run on an isolated Neon branch; prior database DDL/RLS checks used direct isolated-branch SQL.
- The two-user HTTP/IDOR and full sales-to-credit-note integration harness is included and wired to CI, but was not executed in this workspace.
- Resend code is implemented, but real `RESEND_API_KEY` and verified `RESEND_FROM_EMAIL` must be provisioned in Render and a delivery test passed. The ZIP does not invent or include credentials.
- Latest observed Render/Vercel deployments for SHA `1e6ed1b...` are failed/error; the ZIP has not been pushed. Apply it, run CI, deploy both from the exact same reviewed SHA and verify health before calling the release green.
- Expensive production backup/restore, load, cutover and rollback checks remain intentionally deferred to the final production phase.

## Local verification command

From repository root:

```bash
DATABASE_URL='postgresql://.../lexa_test?sslmode=require' bash scripts/verify-workstreams-0-3.sh
```

The database must be disposable. This sequence applies Prisma migrations, verifies schema, runs RLS SQL tests, builds Nest, runs tenant HTTP/IDOR and authorization tests, then checks/types/tests/builds the frontend. The script will fail rather than silently skip a missing gate.
