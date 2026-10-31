# LEXA Workstreams 0–3 — full implementation audit (2026-10-31)

## Evidence boundary

Audited the supplied source archive that includes the previous Workstreams 0–3 overlay and the fixes prompted by the Render/Vercel logs. The archive has no `.git` metadata, so the only exact source SHA evidenced by the user-provided cloud logs is `ec68f0163be1e0945f8b6da2cbb4413caa015667`. No GitHub write, production database change, production migration or deployment was performed. Existing hosted health settings, environment secrets, commit pins and live health status cannot be inspected or changed from this ZIP.

## Workstream 0 — release baseline and API contract

| Requirement | Audit status | Evidence / remaining action |
|---|---|---|
| Preserve `lexa-frontend/` structure | Implemented | Overlay preserves the existing frontend project root. |
| Render readiness route | Code implemented; hosting config unverified | `/health/ready` is unprefixed and checks PostgreSQL; set the Render dashboard path to exactly `/health/ready`. |
| Clear health semantics in OpenAPI | Implemented in this overlay | `/health` is API-prefixed; `/health/live` is liveness; `/health/ready` is database readiness and has root-server override. |
| OpenAPI exact route reconciliation | Implemented in this overlay | Checker now fails on missing controller operations and orphan contract operations; duplicate `/session` removed. |
| Commerce / AR / AP / Module Graph paths | Implemented | Controllers and frontend adapters exist; adapter wiring check added. |
| Attachment routes | Corrected to honest disabled state | Nonexistent upload/list/download paths and message attachment schema removed; UI no longer calls dead endpoints. Private server-side attachment storage is still unimplemented. Device-local photos are explicitly labelled local-only. |
| Authentication source ADR | Implemented | ADR-0001 selects the backend-owned PostgreSQL/session identity model. |
| Recovery email provider | Partial / release blocker | Code uses `PASSWORD_RESET_DELIVERY_URL` plus `FRONTEND_PUBLIC_URL`; no concrete provider or live secret configuration can be verified. |
| API contract CI | Implemented | Controller/OpenAPI exact match and adapter wiring checks in backend CI. |
| One-command local verification | Implemented | `scripts/verify-workstreams-0-3.sh`; requires disposable PostgreSQL and installed toolchains. |
| Health green, frontend/API SHAs pinned | Not verifiable here | Requires Render/Vercel dashboard evidence; only the source SHA in the supplied logs is known. |

## Workstream 1 — tenant security, identity and platform

| Requirement | Audit status | Evidence / remaining action |
|---|---|---|
| Identity/session model and one-time owner bootstrap | Implemented in code; live bootstrap secret unverified | DB sessions, hashed tokens, CSRF and bootstrap refusal after first user exist. Rotate/remove `LEXA_BOOTSTRAP_SECRET` after owner creation. |
| Role/permission and branch grants | Partial | Explicit role-to-permission policy, tenant authorization guard and branch grant model are present. Invitations and invitation acceptance workflow are not implemented. |
| Server-side list/read/write/action enforcement | Partial | Domain controllers perform tenant/membership/branch checks and global guards enforce request capabilities. A complete route-by-route negative IDOR matrix remains outstanding. |
| DTO validation / allowlists | Partial / P0 gap | Global ValidationPipe exists, but many controller payloads are `unknown` with manual parsing. Sensitive generic module writes are now blocked for invoices, payments, cash, tax, accounting, expenses, HR/payroll, assets, approvals and related registers; module-specific DTO/field allowlists for every remaining module are not complete. |
| Version/ETag concurrency | Partial | Generic module record saves and status transitions now require `If-Match`, perform version-conditional writes and record audit in the same transaction. Other mutable domain entities still need equivalent concurrency contracts. |
| Idempotency for all transactional mutations | Partial / P0 gap | Critical sale/return/payment/stock/AR/AP/ledger flows have dedupe or idempotency coverage; it is not universal for every transactional endpoint. |
| Audit events in same DB transaction | Partial | Core financial and workflow mutations audited transactionally; a full mutation-by-mutation transaction audit remains open. |
| PostgreSQL RLS | Test design added; production runtime integration not complete | CI-only harness enables policies over all tenant UUID tables and proves two-tenant read/write isolation through a NOBYPASSRLS role. Runtime request-scoped `SET LOCAL` tenant context and non-bypass runtime DB role are not yet implemented; do not enable production RLS yet. |
| Two-tenant negative tests for reads/writes/search/exports/files/approvals | Partial / P0 gap | RLS fixture test exists for a probe table; it is not a substitute for HTTP integration tests of every API and resource type. Full multi-tenant IDOR/export/file/approval tests remain outstanding. |

## Workstream 2 — catalogue, inventory and POS/sales

| Requirement | Audit status | Evidence / remaining action |
|---|---|---|
| Products/categories as first-class entities | Implemented | Prisma models and APIs exist. |
| Units, variants, tax rules, price lists and product snapshots | Partial / P0 gap | Product unit is currently text; full unit catalogue, variants, reusable tax-rule engine and price lists are not implemented. Sale lines hold price/cost snapshots, but no complete versioned tax/price snapshot model. |
| Warehouse/location/bin and batch/serial inventory | Partial / P0 gap | Branch stock movements exist as auditable source of truth; dedicated warehouses, bins, lots/batches, serials, expiry tracking and transfers are not fully modelled. Goods receipt stores batch/expiry data as line content, not an inventory lot subledger. |
| Commerce order/fulfilment/receiving/PO/delivery screens | Implemented to current scope | Commerce backend controller and API adapter/page exist; validate on live two-user devices before acceptance. |
| POS split payment, sale detail, returns and credit notes | Partial | POS supports payments, sale detail, returns, customer receipts and credit liabilities. Complete credit-note issuance and tax treatment need a typed credit-note workflow. |
| Stock reservation, concurrency and overselling prevention | Partial | Stock checks/locking exist in core sale workflows; full reservations against all Commerce/POS paths and cross-device race integration tests remain required. |
| Receipt-only stock increases and return disposition | Improved in this overlay | Return lines now persist `restock`, `quarantine` or `scrap`; only restock adds saleable stock and reverses COGS/inventory. A physical quarantine location and inspection/release workflow remain unimplemented. |
| Product → stock → sale → payment → return → dashboard reconciliation after refresh/two devices | Not fully proven | Core data path is connected; full browser/database end-to-end tests on two concurrent users/devices have not been run. |

## Workstream 3 — AR/AP and General Ledger

| Requirement | Audit status | Evidence / remaining action |
|---|---|---|
| Mount AR/AP panels and route them | Implemented | API adapters, routes and workspace panels are present. |
| Sales invoices only through AR; supplier invoices only through AP | Partial | Typed AR/AP APIs and generic invoice write blocks exist. Additional generic-module and external import paths need negative testing. |
| Reviewed source changes / isolated Neon test | Partial evidence | Reviewed local Prisma/schema/migration diffs and applied the latest additive ledger-source DDL to the non-primary, non-default Neon validation branch `br-polished-sound-bad926f2`; column, validated check constraint, index and allowed-value check verified. This was direct SQL, not `prisma migrate deploy`, so Prisma migration-history execution remains unverified. The production parent branch was not modified. |
| Nine source events into balanced GL journals | Implemented to listed scope | Automated coverage script reports 9 event workflows. A new branch-scoped report now compares eligible source records to their journals and flags missing, unposted and unbalanced postings; see the scope limitation below. |
| Periods, journal immutability, reversals, TB, P&L, BS | Implemented to current scope | Schema triggers and controller/page exist; CI DB verification covers core invariants. |
| Money accounts, cash sessions/cash-ups, bank reconciliation, expenses, fixed assets, tax codes, cost centres | Not implemented end-to-end / P0 gap | Cash-ups remain manual summary records; Business Tools tax profile is descriptive configuration; no complete bank reconciliation, expense posting, fixed asset lifecycle/depreciation, tax-code engine or cost-centre ledger segmentation. Generic writes to sensitive projections are now blocked until typed workflows exist. |
| Source-to-ledger reconciliation | Partial / implemented for 9 automated sources | Branch-scoped API + General Ledger UI now match eligible sales, POS receipts, returns, tracked stock adjustments, opening stock imports, goods receipts, AR receipts, approved supplier invoices and supplier payments to source-keyed journals; reports missing, unposted, unbalanced, debit-value-mismatch and orphan source journals. Expected debit values are derived for these nine sources. It does not cover manually prepared journals and not-yet-implemented finance modules. |

## Changes implemented in this audit overlay

1. Removed duplicate `GET /session`, keeping `GET /auth/session` canonical.
2. Made OpenAPI coverage exact in both directions (no missing active controller routes and no orphan documented routes).
3. Removed fake attachment endpoints and client upload/download calls; documented local-only capture behavior.
4. Added a shared API-adapter coverage gate for 14 backend-backed frontend adapters (including Commerce, sales, AR/AP, GL, collaboration, dashboard and search).
5. Added optimistic concurrency for generic module-record create/update/status and transactional audit for those writes; client includes `If-Match`.
6. Disabled dangerous unversioned collection-wide generic replacement/clear and blocked generic edits to sensitive workflow-owned registers.
7. Added per-return-line `restock` / `quarantine` / `scrap` disposition; only restock increases available stock.
8. Added a disposable CI RLS test harness and documented why production RLS must not yet be enabled. Corrected fixture seeding so the probe is seeded before FORCE RLS.
9. Added ADR-0001 for the identity source, deployment health-check instructions, and a one-command verification script.
10. Added a sale-payment source-origin column with conservative legacy backfill and a DB constraint; connected the source-reconciliation endpoint, frontend adapter and GL report UI. The schema verifier now checks this column and constraint.
11. Disabled client-side bulk replace/reset calls for generic module records because the server intentionally rejects those unsafe generic writes.
12. Extended return handling to persist `restock`, `quarantine` or `scrap`; only explicit `restock` creates saleable stock.

## Stop/go decision before Workstream 4

**STOP: do not start Workstream 4 yet.** This source snapshot is materially deeper, but the P0 acceptance criteria are not all met. Release gates still include: apply and verify the latest migration through Prisma migrate on an isolated Neon branch; run full Nest build and frontend TypeScript/build; execute two-tenant HTTP/IDOR and branch-role tests across all sensitive routes; integrate production runtime RLS tenant context safely and test it with a non-bypass DB role; implement invitations; finish missing inventory master data, bin/batch/serial/expiry and reservation/lot models; connect the missing finance subledgers and extend source-to-ledger reconciliation across every typed subledger and manually prepared journal source; configure and prove recovery email delivery; and capture green Render/Vercel deployments pinned to the same reviewed commit. The new `20261030310000_ledger_source_reconciliation` migration still needs `prisma migrate deploy` validation on a disposable Neon branch (its exact DDL has already succeeded there through Neon SQL).
