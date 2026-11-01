# LEXA Workstreams 0–3 — implementation handoff

## Scope delivered in this patch

### Workstream 0 — platform and release foundation
- Backend CI now validates Prisma, generates the client, applies the complete migration chain to an ephemeral PostgreSQL 17 service, builds the API, and runs authorization tests.
- Frontend CI now runs TypeScript, unit tests, and a production Vite build.
- Vercel proxy rewrites now route the version-prefixed health URLs to the backend's deliberately unprefixed health endpoints.
- OpenAPI has been extended for branch grants and General Ledger APIs.

### Workstream 1 — access and database controls
- Added a global tenant-aware authorization guard and explicit role-to-permission map.
- Unknown roles fail closed for writes.
- Added per-user branch grants. Owners/administrators remain tenant-wide; every other role needs an explicit branch grant before accessing branch-scoped routes.
- Added owner/admin endpoints to read and replace a member's branch grants, with validation and audit events.
- Added `branch_memberships` migration with composite tenant/branch/member foreign keys.

### Workstream 2 — sales, stock, and procurement integrity
- Inventory adjustments now require an idempotency key, use a serializable transaction, lock the product row, and return a retryable conflict on serialization failure.
- Sales completion locks all affected products in stable order before stock validation.
- Sale payment and return flows lock the sale row to serialize outstanding-balance and return-quantity checks.
- Refunds are limited to recorded receipts net of prior refunds.
- Opening-stock imports and goods receipts lock affected products before posting stock movements.
- Sales-order confirmation and fulfilment lock product rows in stable order before reservations and dispatch.

### Workstream 3 — finance and General Ledger foundation
- Added a tenant-scoped chart of accounts, accounting periods, journals, and journal lines.
- Seeded a 12-account starter chart and 12 open monthly periods for existing tenants; new tenants receive these defaults when the ledger account/period endpoints are first read.
- Journal posting is double-entry: positive debits must equal positive credits.
- Posted journals and their lines are immutable; corrections are made through reversal journals.
- Added account, period, journal, post, reverse, trial-balance, and account-activity endpoints.
- Added a frontend API adapter for the new ledger endpoints.

## Migrations

1. `20261030230000_branch_scoped_authorization`
2. `20261030240000_general_ledger_foundation`

Deploy through the existing Render Docker startup command (`prisma migrate deploy`) only after CI passes. Do not use `prisma migrate dev` on production.

## Validation completed

- 9 role/route authorization policy tests pass using Node's test runner.
- All 15 backend TypeScript source files transpile without syntax diagnostics.
- OpenAPI YAML, both GitHub Actions workflow YAML files, and `vercel.json` parse successfully.
- Both migrations were applied to the isolated Neon branch `br-noisy-star-ba2qgcwb`, not production.
- Isolated Neon checks confirmed 12 seeded accounts, 12 open periods, and successful balanced journal posting and reversal.
- An attempted update to a posted journal was rejected by the database immutability trigger.

## Not yet complete / release blockers

- Full `npm install`, Prisma validation/generation, Nest build, and full frontend build could not be run in this environment because dependency installation timed out.
- GitHub connector write access returned HTTP 403 when creating the implementation branch, so no commit or pull request was pushed.
- The isolated Neon branch has the schema applied directly for validation; the actual Prisma migration-tracking flow must be validated by the new CI job before promotion.
- The General Ledger is not yet automatically fed by every sales, AR, AP, expense, tax, and inventory source transaction. Do not represent it as a fully integrated accounting subledger until deterministic posting mappings and reconciliation tests are completed.
- The branch-grant UI still needs to be wired into the existing Team & Access screen; the API is ready.
- Database Row-Level Security remains a separate follow-up. Application-layer tenant/branch checks are enforced by this patch, but PostgreSQL RLS has not been enabled.

## Production rollout checklist

- [ ] Restore GitHub write permission or push this patch through an authorized developer account.
- [ ] Review CI results, including the empty-PostgreSQL migration run.
- [ ] Verify the Render service has the expected `DATABASE_URL` and startup migration command.
- [ ] Take and verify a restorable production backup.
- [ ] Apply migrations through the controlled Render release.
- [ ] Verify `/health/ready`, `/api/v1/health`, `/api/v1/health/live`, and `/api/v1/health/ready`.
- [ ] Test owner, accountant, cashier, inventory operator, read-only, and unassigned branch access using non-production users.
- [ ] Wire Team & Access branch grants in the frontend before enabling non-admin team access.
- [ ] Integrate and reconcile source postings for sales, receivables, payables, expenses, tax, and inventory before enabling financial reporting as authoritative.
