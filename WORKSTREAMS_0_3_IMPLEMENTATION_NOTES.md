# LEXA Workstreams 0–3 — deepened implementation overlay

**Delivery format:** ZIP overlay only. No GitHub writes, pull requests, Vercel deployments, Render deployments, or production Neon migrations were performed.

**Base:** `MONALISA2003-CMD/The-LEXA-` main source snapshot inspected on 30 October 2026. Extract this overlay over the matching repository root; it changes only the listed files and adds migration/code files. Keep the existing `lexa-frontend/` application intact.

**31 October deployment build repair:** The Vercel Team & Access TypeScript errors and the two Render General Ledger TypeScript errors reported after the original overlay are repaired in this ZIP. See `DEPLOYMENT_BUILD_REPAIRS_20261031.md` for the exact root causes and verification limits.

## What this increment adds

### Workstream 0 — build/release integrity

- Backend CI runs against PostgreSQL 17, installs dependencies, checks route/contract coverage, checks financial posting coverage, validates/generates Prisma, applies all migrations to an empty CI database, checks schema invariants, builds NestJS, and runs authorization tests.
- Frontend CI runs TypeScript type-check, Vitest, and production Vite build.
- Vercel rewrites route `/api/v1/health/live` and `/api/v1/health/ready` to the Render service's unprefixed health endpoints before the general `/api/v1/*` proxy.
- OpenAPI contract now covers the available backend controller methods. The current static checker reports 115 operations across 93 routes.

### Workstream 1 — tenant, role and branch access

- Adds one global NestJS authorization guard that resolves the signed session cookie, checks active workspace membership, maps routes to capabilities, and denies unsupported roles for mutations.
- Centralized role policy separates cashier, sales, warehouse/inventory operator, accountant, branch manager, manager and administrator capabilities.
- Adds `branch_memberships` with composite workspace/member and workspace/branch foreign keys.
- Adds explicit `branch_scope_mode` (`all` or `restricted`). `restricted` with an empty grant list intentionally means no branch access; `all` preserves legacy workspace-wide scope until an administrator explicitly changes it.
- Adds owner/administrator APIs and the Team & Access UI to read members, update supported roles and replace a member's branch grants.
- Core, Commerce, Receivables, Payables and Ledger routes use the same branch-access check. Workspace branch listings filter to the member's grants.

### Workstream 2 — sales, inventory and procurement transaction integrity

- Stock adjustments require an idempotency key, lock the product row, use serializable transactions, reject negative stock, and write an audit event.
- Checkout locks product rows in stable order before validating and decrementing stock.
- Payment and returns lock the sale row, recalculate outstanding/returnable quantities, and limit refunds to recorded receipts net of previous refunds.
- Sale lines and stock movements capture unit-cost snapshots so future COGS/stock valuations do not depend on the product's later-edited cost.
- Opening-stock imports and stock adjustments create balanced ledger entries.
- Sales-order reservation/fulfilment and purchase-order goods receipt use row locks and serializable transactions.
- Goods-receipt posting books accepted stock (or non-stock expense) against goods-received-not-invoiced.

### Workstream 3 — General Ledger and linked source postings

- Adds a 20-account tenant chart of control accounts, monthly accounting periods, branch-scoped journals and journal lines.
- Adds Ledger APIs and frontend screen: chart of accounts, periods, journal draft/post/reverse, trial balance, profit and loss, balance sheet and account activity.
- Posted journals are immutable; corrections use reversals. Journal-line rows can only be edited while their journal is a draft. Database triggers enforce balanced positive debit/credit totals and open accounting periods.
- Closed periods cannot be reopened or edited; periods cannot overlap. Historical periods are seeded closed, current/future periods are open, and the database auto-closes stale periods before journal posting.
- Atomic source postings are connected for nine workflows: completed sale, later sale payment, sales return/refund, stock movement, opening stock import, goods receipt, customer receipt, approved supplier invoice, and supplier payment.
- Each source journal has tenant-scoped source uniqueness to prevent duplicate posting on retries. Journals are written inside the same DB transaction as the originating workflow.
- Sales invoice and purchase invoice module routes now mount the dedicated AR/AP panels; Accounting mounts the General Ledger screen.

## Ordered Prisma migrations added

1. `20261030230000_branch_scoped_authorization`
2. `20261030240000_general_ledger_foundation`
3. `20261030250000_ledger_source_postings`
4. `20261030260000_inventory_ledger_accounts`
5. `20261030270000_explicit_branch_scope_mode`
6. `20261030280000_accounting_period_integrity`
7. `20261030290000_automatic_period_rollover`

Run these only through the reviewed Prisma migration workflow. Do not manually run SQL against production and do not run `prisma migrate dev` against production.

## Verification performed

### Local code checks

- `node --test backend/test/*.test.mjs`: **12/12 role/authorization policy tests passed**.
- `python backend/scripts/check-openapi-coverage.py`: **115 controller operations across 93 routes**.
- `node backend/scripts/verify-ledger-posting-coverage.mjs`: **9 source workflows**, idempotency/balance invariants, and branch checks passed.
- Global TypeScript `transpileModule` syntax pass: **128 `.ts`/`.tsx` source files**, no syntax diagnostics.
- JSON/YAML parsing passed for backend/frontend package manifests, `lexa-frontend/vercel.json`, both GitHub Actions workflows, and the OpenAPI contract.

### Isolated Neon validation

The SQL equivalent of the migrations was applied to isolated Neon test branch `br-polished-sound-bad926f2` (`codex-workstreams-0-3-clean-validation`), cloned from production branch `br-snowy-hill-ba5a9ggc`. Production was not modified.

Verified on that test branch:

- 5 new core tables for branch grants and General Ledger are present.
- `branch_scope_mode`, sale cost snapshot and stock cost snapshot columns exist.
- All 3 ledger/accounting integrity triggers are enabled.
- 20 system accounts exist for the test tenant.
- 60 historical periods are closed, 25 current/forward periods remain open, and there are no open historical periods.
- Restricted branch scope with no grants returns zero branches; adding one grant gives exactly one branch.
- A balanced 2,500-minor-unit journal posted successfully; a posted-journal edit was rejected by the database.
- Attempting to post into a closed historical period was rejected by the database.

The test branch was validated using SQL directly through Neon MCP, not by `prisma migrate deploy`; CI must still prove Prisma's migration-tracking path from an empty PostgreSQL 17 database.

## What is not yet verified or fully delivered

- Full dependency-backed Nest build, Prisma validate/generate/migrate run, full frontend typecheck/build and Playwright/browser E2E were **not run locally**. `npm install` timed out in the available execution window. The CI workflows in this overlay are intended to run these full gates once the ZIP is applied to the repository.
- No real deployed API end-to-end run has been made with authenticated browser sessions or two independent tenants.
- PostgreSQL RLS is still disabled. This increment uses mandatory application-layer tenant/branch authorization and composite foreign keys; RLS remains a separately designed and tested defence-in-depth task before a production security claim.
- General Ledger source posting is now linked to core sales, inventory, purchase receiving, AR and AP. It is **not yet an exhaustive subledger** for expenses, payroll, tax-authority submissions, bank reconciliation, fixed-asset depreciation or all generic registers. Those require their own domain services and reconciliation rules.
- Historical cost snapshots default to zero for pre-existing rows; the migration does not invent historical cost using today's product costs. Historical COGS/inventory valuation needs a reviewed opening-balance/stock-cost conversion.
- Attachment storage, asynchronous workers, full SaaS usage/billing, AI provider gateway and non-core module domain models are outside Workstreams 0–3.

## Apply and validate the overlay

1. Back up your local repository checkout and confirm it matches the inspected main snapshot.
2. Extract `LEXA_Workstreams_0_3_Audit_Implementation_Overlay.zip` at the repository root, preserving directory paths. This refreshed overlay includes the prior deployment TypeScript fixes plus all changes in this audit increment.
3. Review `git diff` locally. Do not overwrite unrelated changes made after the inspected snapshot.
4. Backend checks:

   ```bash
   cd backend
   npm install --no-audit --no-fund
   npm run contract:check
   npm run ledger:coverage
   npx prisma validate
   npx prisma generate
   npx prisma migrate deploy
   npm run db:verify
   npm run build
   npm test
   ```

5. Frontend checks:

   ```bash
   cd lexa-frontend
   npm install --no-audit --no-fund
   npm run typecheck
   npm test
   npm run build
   ```

6. Review every migration and CI result before preparing a production release. Back up production and prove restore in a non-production environment before release. The Render startup command runs `prisma migrate deploy`; only a reviewed deployment should cause production migrations to apply.

## Release acceptance gates

- All CI checks and migrations pass from an empty PostgreSQL 17 database.
- Two test tenants and multiple roles pass tenant/branch IDOR tests.
- Product → stock → checkout → split payment → return/refund reconciles between sales, stock movements, cash/AR and the ledger.
- Purchase order → receipt → supplier invoice → payment reconciles between inventory, GRNI, AP and cash/bank.
- Manual journal posting, reversal and period close pass both positive and negative tests.
- `/health/live`, `/health/ready`, `/api/v1/health`, CSRF, login/session, core CRUD, and cross-module journeys pass against a staged deployment.
- Backup/restore and migration rollback/recovery procedures are exercised in a non-production clone.

**Status:** this is a deeper implementation overlay and isolated schema validation result—not a production deployment or a claim that every ERP module is complete.


## Audit increment (2026-10-31)

See `WORKSTREAMS_0_3_AUDIT_MATRIX.md` for the full requirement-by-requirement status. This increment adds optimistic version checks for generic module records, return disposition, exact OpenAPI checks, attachment-route cleanup, domain adapter checks, and a disposable-CI RLS design test. It does not claim that runtime RLS, recovery email provider configuration, invitations, missing stock master data, or the remaining finance subledgers are complete.


## Audit increment (2026-10-31 — source reconciliation and integration hardening)

- Added `sale_payments.ledger_source` and migration `20261030310000_ledger_source_reconciliation`. Legacy origins are backfilled only where AR allocation or an existing journal proves the source; ambiguous old payments remain NULL.
- Added `GET /workspaces/:workspaceId/branches/:branchId/ledger/reports/source-reconciliation`, backed by branch-scoped source queries for the nine currently automated source workflows. It reports missing journals, non-posted journals, unbalanced posted journals, mismatched expected debit values and orphan journals.
- Added the typed `apiGeneralLedger.sourceReconciliation` adapter and mounted the report in the General Ledger page. The report expressly states its nine-source scope and does not claim full monetary subledger reconciliation.
- Updated `backend/scripts/verify-schema-integrity.mjs` to require `sale_payments.ledger_source` and its check constraint.
- Expanded `backend/scripts/check-route-adapter-coverage.py` to verify 14 backend-backed frontend adapters. Generic module bulk replace/reset methods now fail locally instead of sending requests the server rejects.
- RLS harness fixture seeding now occurs before FORCE RLS. The harness remains disposable-CI-only; it is not runtime RLS activation.

### Checks run in this audit increment

- `node --experimental-strip-types --test backend/test/*.test.mjs`: **12/12 passed** against the current TypeScript authorization source.
- `python backend/scripts/check-openapi-coverage.py`: **115 controller operations across 93 routes**, exact match.
- `python backend/scripts/check-route-adapter-coverage.py`: **14 adapters passed**.
- `node backend/scripts/verify-ledger-posting-coverage.mjs`: **9 source workflows passed**.
- TypeScript/TSX syntax transpilation: **128 files, 0 syntax diagnostics**.
- OpenAPI and CI YAML, package manifests and Vercel JSON parsed successfully; Python compile and the one-command shell script syntax check passed.

Full Nest build, frontend `tsc -b`/Vite build, Prisma validation/migration deployment and PostgreSQL RLS execution remain unrun in this container because dependencies and PostgreSQL tooling are unavailable. Do not treat syntax transpilation as a substitute for those checks.


### Latest isolated Neon DDL check

The additive SQL in `20261030310000_ledger_source_reconciliation` was applied to validation branch `br-polished-sound-bad926f2` in project `empty-mud-76816448` (branch name `codex-workstreams-0-3-clean-validation`). Neon confirmed that the new column exists, the check constraint is validated, the index exists, and there are no values outside the permitted source set. That branch is non-primary and non-default; its parent production branch was not changed. This was direct DDL execution, **not** Prisma migration-runner validation; CI still must prove migration history and `prisma migrate deploy` on a fresh PostgreSQL database.

The exact nine-source reconciliation SELECT set was also run against the isolated Neon validation branch after applying the two preceding additive migrations (`sale_return_lines.disposition` and `sale_payments.ledger_source`). PostgreSQL accepted all nine query shapes and returned zero eligible source rows in that branch. The join between audit-event text resource IDs and UUID stock-movement IDs was corrected to compare text representations after a real-schema type check. This proves query parsing against the schema, not the presence of populated end-to-end business transactions.
