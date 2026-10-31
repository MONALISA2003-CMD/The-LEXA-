# LEXA Workstreams 0–3 — implementation and release audit

**Audit date:** 31 October 2026  
**Source baseline:** latest observed `main` source SHA `1e6ed1b9589b775e033976dc71ce6c9c8f1174d8` (from current Render/Vercel deployment metadata).  
**Delivery model:** source ZIP overlay only. No GitHub write, production database mutation, production migration, or deployment was performed.

## Executive decision

The source implementation for the requested Workstream 0–3 scope is now materially complete and connected across Nest controllers, Prisma schema/migrations, OpenAPI, frontend adapters and frontend panels. The code includes RLS, invitations, catalogue/inventory controls, credit notes, finance operations, and a two-tenant HTTP integration harness.

**This ZIP is a reviewed implementation package, not proof of production readiness.** The expensive final gates intentionally deferred are: Prisma migration-runner execution against an isolated Neon clone, dependency-backed Nest/frontend builds, running the full tenant HTTP/IDOR workflow against a disposable populated database, live Resend delivery verification, and production-scale release/backup/restore checks. Render/Vercel are not green on the latest observed commit; the ZIP has not been pushed/deployed.

## Workstream 0 — release baseline and API contract

| Requirement | Status | Evidence / boundary |
|---|---|---|
| Preserve `lexa-frontend/` | Implemented | Existing application root and scripts are preserved. |
| Health semantics | Implemented in source | `/health/live` is liveness; `/health/ready` performs a DB check and returns 503 on failure; both are excluded from `/api/v1`. |
| Render health path | Source instruction ready; remote setting pending | Set the existing Render API service health path to `/health/ready`. The Render service configuration queried on 31 Oct still reported an empty `healthCheckPath`. |
| OpenAPI/controller reconciliation | Implemented | Exact matching gate reports **158 operations across 123 routes**, with no missing controller operations and no orphan contract operations. |
| Commerce/AR/AP/Module Graph/GL/finance/catalog/invitations | Implemented in source | Controllers and OpenAPI paths are registered; adapter coverage gate reports **16 backend-backed adapters** wired to the shared API client. |
| Duplicate session/attachment endpoints | Corrected | Canonical auth session route retained; nonexistent attachment endpoints and client upload/download calls removed. Local-only device capture is identified honestly. |
| Auth-source ADR | Implemented | ADR-0001 selects backend-owned PostgreSQL users, hashed sessions and recovery tokens. |
| Recovery email | Provider adapter implemented; live configuration pending | Resend adapter uses `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and `FRONTEND_PUBLIC_URL`. A real key, verified sender domain and successful delivered test message are external prerequisites; no secret was invented or set. |
| API contract/adapter CI | Implemented | Backend CI runs both exact OpenAPI and route-adapter gates. |
| One-command verification | Implemented | `scripts/verify-workstreams-0-3.sh` runs contract, adapter, ledger, Prisma, migrate, schema, RLS, backend, tenant HTTP and frontend gates against disposable services. |

## Workstream 1 — tenant security, identity and platform

| Requirement | Status | Evidence / boundary |
|---|---|---|
| Identity/session and bootstrap | Implemented in source | Backend-owned identity, hashed session cookie, CSRF protection, rate limiting, and one-time owner bootstrap controls. Remove/rotate bootstrap secret after owner creation. |
| Roles and permissions | Implemented in source | Central role-to-capability policy and global Nest guard. Unknown write roles fail closed. |
| Branch grants | Implemented in source | Tenant-scoped branch membership table, `all`/`restricted` modes, and empty restricted grants deny all branches. |
| Invitations | Implemented in source | Admin-only create/list, idempotency payload hash, expiring random token stored hashed, invitation email, invited-email check, transactional membership/branch grant acceptance and audit. |
| Tenant RLS | Implemented in migration/runtime wrapper | Migration `20261030320000_platform_catalog_finance_rls` creates a `NOLOGIN NOBYPASSRLS` role, forces RLS on tenant-owned tables, and installs special membership/session/reset policies. `PrismaService` wraps every model/raw query and transaction in transaction-local GUC context. |
| Runtime RLS on isolated Neon branch | Verified directly | On `br-polished-sound-bad926f2`: **41 tenant-keyed tables**, **42 RLS-enabled tables**, runtime role not superuser and not `BYPASSRLS`; membership (2), session (4), reset-token (4) policy sets present. Cross-tenant product read/insert/update and cross-tenant membership write were denied under the runtime role; own workspace membership and exact presented-token lookup remained available. |
| DTO and field allowlists | Implemented for workflow-owned routes; remaining coverage is guarded | Global `ValidationPipe` uses whitelist/forbid-non-whitelisted. Typed catalogue/finance/invitation APIs validate fields manually; generic module writes block protected finance, HR/payroll, approvals, asset and related registers. Remaining generic modules fail closed rather than granting sensitive write paths. |
| Concurrency/idempotency/audit | Implemented for core transactional workflows; not claimed universal for every future domain | Critical sales, payment, returns, stock, AR/AP, journals, invitations, cash movements, expenses, bank imports and generic module records include conditional writes/idempotency checks and transactionally written audit events. |
| HTTP/IDOR negative suite | Implemented as a repeatable CI harness; not run in this environment | `backend/scripts/test-tenant-idor.mjs` starts the built Nest API with the runtime role, seeds two workspaces/two users, verifies cross-tenant collection/direct-ID/branch denial and exercises sale → payment → return → credit note in both workspaces. Run through `npm run test:tenant-http` against a disposable database. |

## Workstream 2 — catalogue, inventory, POS and sales

| Requirement | Status | Evidence / boundary |
|---|---|---|
| Products/categories first-class | Implemented | Existing product/category entities retained. |
| Units and variants | Implemented | Typed units of measure and product variants with SKU/barcode/attributes and separate costs/prices. |
| Tax and price lists | Implemented | Effective-dated tax codes/rules; price lists/items; sale line stores tax rate/code, price-list, variant, unit and cost/price snapshots. |
| Warehouses/bins | Implemented | Branch-scoped warehouses and typed storage bins including receiving/quarantine/scrap/dispatch. |
| Lots/batches/serials | Implemented | Inventory lots with expiry, quantity/cost/status; serial tracking linked to lot; database capacity guard and movement metadata. |
| Reservations | Implemented | Tenant/branch/product/warehouse/lot-scoped reservations with idempotency, row locking and lot reserved-quantity trigger. |
| Commerce screens/services | Implemented in source | Sales orders, fulfilment, receiving, purchase orders, deliveries and stock reservation paths are connected to Commerce APIs. |
| POS payments, returns and credit notes | Implemented in source | Shared sales domain, split payments, transactional return disposition and typed credit-note issuance; only restock disposition increases available stock. |
| Overselling and source-of-truth stock | Implemented to current scope | Stock moves remain auditable; checkout/reservation/receipt paths lock relevant rows and validate remaining quantities. |
| Two-user/browser round-trip | Test harness included; execution deferred | Automated HTTP suite exercises both tenant round-trips, but browser/device concurrency and full populated database runs remain a final validation gate. |

## Workstream 3 — receivables, payables and General Ledger

| Requirement | Status | Evidence / boundary |
|---|---|---|
| AR/AP panel routes | Implemented | Dedicated panels and adapters are mounted in the Operations workspace. |
| Typed invoice ownership | Implemented to current controller scope | Sale invoices are handled by AR; supplier invoices by AP. Generic module writes are blocked for those workflow-owned registers. |
| General Ledger | Implemented | Chart of accounts, periods, journals, reversals, trial balance, P&L, balance sheet, account activity and source reconciliation API/UI. |
| Source postings | Implemented for nine event families | Sale complete/payment/return, stock movement/opening stock, goods receipt, AR receipt, AP invoice approval and AP supplier payment. Coverage gate verifies idempotency/balance/branch invariants. |
| Posting control | Implemented in schema | Posted journals immutable; draft-line-only editing; open-period validation, non-overlapping periods, automatic period rollover. |
| Cash sessions/cash-ups | Implemented | Open/close sessions, idempotent cash movements, count/variance and cash-up posting path. |
| Bank reconciliation | Implemented | Bank account, statement import with duplicate external IDs, statement/reconciliation matches and balance validation. |
| Typed expenses | Implemented | Categories, tax and cost-centre fields, approval/payment lifecycle and ledger posting. |
| Fixed assets | Implemented | Asset register, acquisition/depreciation accounts, per-period depreciation and journal path. |
| Tax codes/rules | Implemented | Tax code and effective tax-rule APIs with sale line tax snapshots. |
| Cost centres | Implemented | Tenant-scoped parent hierarchy and journal-line allocations. |
| Source-to-ledger reconciliation | Implemented for nine automatic source families | Branch-scoped report identifies missing, unposted, unbalanced, amount-mismatched and orphan source journals. It is not an all-ledger external audit of manual journals or tax authority filings. |

## Automated evidence from this workspace

- OpenAPI exact match: **158 operations / 123 routes**.
- Frontend route-to-adapter check: **16 domain adapters**.
- Ledger source coverage: **9 source workflow families**.
- Authorization tests: **12/12 passed**.
- TypeScript/TSX syntax transpilation: **135 files, 0 syntax diagnostics**.
- JSON/YAML and ZIP integrity checks: passed.
- Full dependency-backed Nest/Prisma/Vite builds were **not run** because `npm install` timed out in the execution environment. Syntax transpilation does not establish a clean `tsc -b` or Nest build.

## Neon / Render / Vercel status observed on 31 October 2026

- Neon: production branch `br-snowy-hill-ba5a9ggc` reported `ready`; isolated validation branch `br-polished-sound-bad926f2` reported `ready`. No production SQL was run. The Prisma migration runner has not yet applied the full migration chain on the isolated branch.
- Render: service `lexa-backend-api-live` auto-deploys from `main`; latest observed deployment for `1e6ed1b9589b775e033976dc71ce6c9c8f1174d8` was `build_failed`. The previous common SHA `51bd9fbaeb1ad5830aecbf055491239e4ce85f45` was `live`. Its Render health-check path was blank when queried.
- Vercel: project `lexa_review`; latest production deployment for the same `1e6ed1b...` SHA was `ERROR`; previous common SHA `51bd9f...` was `READY`.
- The corrected ZIP has not been pushed to GitHub or deployed. It cannot turn Render/Vercel green until applied, reviewed and built on both providers. Configure Render `/health/ready`, verify Resend secrets/sender and confirm both platforms report the same full reviewed SHA before release.

## Final-phase gates (intentionally deferred)

1. Run `npx prisma validate`, `npx prisma generate`, and **`npx prisma migrate deploy`** on a fresh isolated Neon branch using the actual migration runner. Then run `npm run db:verify` and `psql ... -f backend/scripts/test-tenant-rls.sql`.
2. Run full backend `npm run build`, `npm run test:tenant-http`, and `npm test`; run frontend `npm run typecheck`, `npm test`, and `npm run build` in CI or a dependency-complete local environment.
3. Supply a real Resend key and verified sender domain in Render secrets and deliver a password-recovery and invitation test email.
4. Set Render health check to `/health/ready`; ensure the API service uses `DATABASE_RUNTIME_ROLE=lexa_app_runtime` only after the new RLS migration is present.
5. Push/deploy the exact same reviewed full SHA to Render and Vercel; capture successful build/deployment IDs and live `/health/live` and `/health/ready` responses.
6. Reserve production backup/restore proof, data migration review, throughput/concurrency load, observability and cutover/rollback checks for the final production phase.

**Do not begin Workstream 4 until the final-phase gates above are green.**
