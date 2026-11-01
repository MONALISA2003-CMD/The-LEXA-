# LEXA Backend Commencement & End-to-End Integration Handoff

**Document status:** IMPLEMENTATION HANDOFF — v1.0  
**Prepared:** 29 October 2026  
**Repository:** [MONALISA2003-CMD/The-LEXA-](https://github.com/MONALISA2003-CMD/The-LEXA-)  
**Frontend:** [lexareview.vercel.app](https://lexareview.vercel.app/)  
**Frontend root:** `lexa-frontend/`  
**Authoritative architecture baseline:** [`BACKEND.md`](../BACKEND.md)  
**Current API contract:** `lexa-frontend/openapi/backend-contract.yaml`

---

## 1. Mission and implementation goal

Build the real LEXA backend and database **against the frontend that already exists**. The goal is not to build a second prototype, replace the frontend, or create a collection of disconnected CRUD pages. The goal is an integrated multi-tenant ERP SaaS in which every visible business module reads and writes authoritative server data, respects the current workspace and branch, enforces server-side access rules, and participates in the correct cross-module business workflows.

This handoff is the detailed build map. Read it together with `BACKEND.md`; if a choice is already locked in `BACKEND.md`, that decision takes precedence. Any material deviation needs a documented Architecture Decision Record (ADR).

### Definition of backend-connected

A module is **not complete** merely because its endpoint returns HTTP 200 or its screen renders. For each workflow, completion means:

1. The authenticated user is identified by the server.
2. Workspace/tenant, branch, record, field and action access are verified server-side.
3. DTO/input and state-transition validation run server-side.
4. Data is persisted to PostgreSQL and returned in the documented contract shape.
5. Related business changes happen in one transaction where consistency requires it.
6. Audit and notification/outbox records are created when appropriate.
7. The frontend refreshes from the canonical server response and handles loading, empty, success, conflict, unauthorized and failure states.
8. Automated tests cover both successful and forbidden/invalid paths.
9. A deployed end-to-end test proves the flow against the real API and database.

**Do not describe the system as production-ready until these criteria pass for the core sales/inventory/finance flows and the production build is green.**

---

## 2. What currently exists and what must still be built

The current repository is a React 19 + TypeScript + Vite application under `lexa-frontend/`. It includes TanStack Query, explicit repository/data-provider boundaries, a REST client, auth screens, shared domain types, 57 operational register definitions, an OpenAPI contract, and adapters for core records, sales workflows, analytics, reports, inbox/collaboration, global search and Business Tools.

Relevant frontend source locations:

- `lexa-frontend/src/app/` — routing, app shell, providers and workspace/branch context.
- `lexa-frontend/src/domain/` — shared business types and client-side money/inventory/sales helpers. These improve UX; backend validation remains authoritative.
- `lexa-frontend/src/data/contracts/` — frontend repository and workflow interfaces.
- `lexa-frontend/src/data/remote/` — API client and endpoint adapters.
- `lexa-frontend/src/data/repositories/` and `src/data/providers/` — explicit provider selection.
- `lexa-frontend/src/data/local/` — device-local development implementation; not shared production storage.
- `lexa-frontend/src/data/mock/` — historical compatibility names and tests; these are not an approved source of live business data.
- `lexa-frontend/src/modules/` — visible core screens and operational modules.
- `lexa-frontend/openapi/backend-contract.yaml` — API contract baseline.
- `lexa-frontend/docs/FRONTEND-COMPLETION-AND-BACKEND-HANDOFF.md` and `lexa-frontend/research/FRONTEND_BACKEND_READINESS.md` — existing frontend handoff/readiness documents.

### Existing frontend adapters to implement against

| Adapter / interface | Frontend responsibility | Backend responsibility |
|---|---|---|
| `src/data/remote/apiClient.ts` | Common HTTP requests, request IDs, timeouts, CSRF header, credentials and error parsing | Match the contract’s error envelope, session cookie, CSRF lifecycle, CORS and status codes |
| `apiAuth.ts` | Login, session, logout, password recovery/reset | Identity integration, secure sessions, single-use reset tokens and generic recovery responses |
| `apiRepositories.ts` | Workspace/branch, product/category, inventory, sales, dashboard snapshot access | Real database-backed repositories and tenant-scoped access |
| `apiSalesWorkflow.ts` | Complete sale, receive payment and record return | Atomic and idempotent transaction workflows; canonical server totals |
| `apiDashboard.ts` | Dashboard analytics | Server-calculated KPIs/trends/breakdowns from authoritative records |
| `apiModuleRecords.ts` | Generic operational register CRUD/status flow | Generic records for lightweight modules; first-class domain services for important transactions |
| `apiModuleReports.ts` | Module-specific report snapshots | Query/report services that calculate from persisted records and ledger/source data |
| `apiCollaboration.ts` | Threads, messages, reactions, read markers, tasks, approvals, notifications, activity | Authenticated real-time/REST collaboration, auditing and delivery tracking |
| `apiGlobalSearch.ts` | Permission-filtered global search and internal routes | Scoped search; only return records the user may access and safe internal destinations |
| `apiBusinessTools.ts` | Tax profile, cash-ups, attachments, CSV imports and backup/restore | Real validation, private file storage, transactional import/restore, audit and retention policy |
| `MODULE_CATALOG` + `OperationsWorkspacePage.tsx` | 57 configurable operational register screens | Domain mapping, field validation, relationships and a safe generic-record bridge where suitable |

### Important status boundary

The GitHub workflow that extracts ZIP archives only proves that extraction succeeded. A green Vercel check is only the result for the particular deployment/commit checked. Neither proves that backend services exist or every frontend-to-backend workflow passes. The latest repository snapshot inspected during preparation had commit `e68dc5e98bb56c1d8794180a824c0f3688783de9`; re-check the current branch and deployment before executing releases. The frontend build/type-check/test suite must be run again in CI after the readiness patch is applied and after subsequent changes.

---

## 3. Architecture and deployment rules

Use the locked stack in `BACKEND.md`:

- **API:** NestJS + TypeScript + Fastify adapter, under `/api/v1`.
- **Database:** Neon PostgreSQL — the single authoritative source for business data.
- **ORM/migrations:** Prisma, with reviewed migrations and `prisma migrate deploy` in release execution.
- **Authentication:** use Supabase Auth if retained in the project; verify tokens on the backend. Do not create a second competing identity system without an ADR.
- **Authorization:** server-side tenant-aware RBAC plus resource-level checks on every request.
- **Background jobs:** Redis + BullMQ, in a separately configured worker process.
- **Multi-provider AI:** LEXA AI orchestration module + LiteLLM gateway, with free-tier and paid providers controlled by policy.
- **Private files:** S3-compatible object storage (Cloudflare R2 is the current candidate); PostgreSQL stores ownership/metadata, not file bytes.
- **Observability:** structured logs, request/correlation IDs, OpenTelemetry and Sentry/equivalent.
- **Frontend:** remain on Vercel; preserve the existing `lexa-frontend/` tree and current navigation.

### Suggested backend directory

Create backend code in a clearly separated `backend/` directory or a separate backend repository if deployment settings make that necessary. Do not place backend implementation in the frontend `src/` folder.

```text
backend/
  src/
    main.ts
    app.module.ts
    common/
      auth/
      authorization/
      tenant-context/
      validation/
      errors/
      logging/
      idempotency/
      audit/
      outbox/
    modules/
      identity/
      workspaces/
      branches/
      memberships/
      saas-admin/
      catalog/
      pricing/
      crm/
      sales/
      inventory/
      procurement/
      finance/
      people/
      projects/
      collaboration/
      files/
      search/
      reports/
      integrations/
      ai/
      platform-operations/
    workers/
      worker.main.ts
      queues/
      processors/
  prisma/
    schema.prisma
    migrations/
  test/
    unit/
    integration/
    e2e/
  openapi/
  .env.example
  package.json
```

Keep controllers thin: **controller → DTO/schema validation → authentication/authorization → application service → domain invariants → repository/Prisma → PostgreSQL**. Use provider adapters for third parties. A module must not bypass another module's service by writing directly to its tables.

### Environment layout

Create separate development, staging and production configurations. Keep real values only in Render/Vercel/Neon/Supabase/provider secret stores. Keep `.env.example` to variable names and safe placeholder values. Frontend `VITE_*` variables are public browser values; never put database credentials or AI keys in them.

Backend configuration will need (names may be adjusted to match the deployment platform):

- `NODE_ENV`, `PORT`, `APP_ORIGIN`, `API_BASE_PATH=/api/v1`
- `DATABASE_URL`, `DIRECT_DATABASE_URL` (if required for Prisma migrations by the chosen Neon configuration)
- Supabase project/auth verification configuration
- `REDIS_URL`
- private object-storage endpoint/bucket/region/access credentials
- AI gateway URL/credentials and LEXA-specific provider policy configuration
- mail provider, observability DSN and allowed frontend origins
- all secrets scoped separately for development, staging and production

Do not invent or commit secret values. The production frontend should use `VITE_DATA_PROVIDER=api` and `VITE_API_BASE_URL` set to the real public API origin. A deployment without a real API URL must show an unavailable/configuration state rather than fabricate records or success.

---

## 4. Tenancy, identity, and authorization model

The current frontend names the tenant/company root a **workspace** and passes `workspaceId` through repository contracts. Preserve that vocabulary in the v1 API. In the database, treat `workspaces` as the tenant boundary for v1; do not add a second redundant tenant/company root unless future business requirements demand it.

### Minimum identity/tenancy entities

- `users` or an equivalent application profile mapped to the external identity-provider user ID.
- `workspaces` (tenant/company settings, base currency, timezone, locale, settings, state, plan reference).
- `branches` (`workspace_id`, name/address/timezone/active state).
- `workspace_memberships` (user ID, workspace ID, status, invitation metadata).
- `roles`, `permissions`, `role_permissions`, `membership_roles` (or a role assignment model with explicit permissions).
- Optional `branch_memberships`/scope grants where users can only access selected branches.
- `sessions` only if LEXA is responsible for maintaining application sessions; otherwise rely on the selected identity provider and its token/session lifecycle.
- `plan_entitlements`, `usage_events`, `audit_events`, `idempotency_records`, `outbox_events`.

### Mandatory authorization rules

1. Never trust a `workspaceId`, `branchId`, `userId`, role, permission or ownership claim merely because it came from the browser. Resolve identity from the verified session/JWT, then prove membership and requested scope.
2. Apply authorization to reads as well as writes; a hidden button is not security.
3. Every tenant-owned business table should have `workspace_id`; branch-owned records also have `branch_id` where applicable. Enforce foreign-key consistency so records cannot reference a branch belonging to another workspace.
4. Scope repository queries by the authenticated workspace and allowed branches. Consider PostgreSQL Row-Level Security as defense-in-depth, but do not pretend RLS is active until policies and pooled connection/session context are tested.
5. Use field-level authorization for payroll, bank/payment details, tax identity data, HR cases, AI settings, API integrations and privileged administration.
6. For missing/unauthorized resources, choose a consistent non-disclosing response policy to avoid cross-tenant ID enumeration.
7. Audit membership/role changes, exports, restores, approvals, financial posting, payments/refunds, inventory adjustment, tax submissions, AI tool actions and administrative actions.

### Auth flow required by the current frontend

1. Frontend calls `GET /api/v1/auth/csrf` before an unsafe request when the configured client requires it.
2. `POST /api/v1/auth/login` validates credentials via the chosen identity system, establishes the agreed session/cookie strategy, and returns the documented `Session` JSON without exposing cookie/session secrets.
3. `GET /api/v1/auth/session` returns the authenticated user plus tenant memberships/capabilities needed by the UI. Make this the **canonical** session endpoint. The current OpenAPI also declares `/session`; resolve/remove that duplicate before implementation or explicitly deprecate it.
4. Workspace/branch listing is limited to memberships and grants.
5. Logout invalidates the session according to the identity architecture and expires the cookie.
6. Forgot password returns a generic accepted response whether or not the email exists. Reset tokens are short-lived, single-use and stored only in safe hashed form if LEXA manages them.
7. Rate-limit login, recovery, invitation, verification and sensitive administrative routes. Enforce password/MFA policy at the identity boundary.

Use secure cookies appropriate to the frontend/API site relationship (`HttpOnly`, `Secure`, correct `SameSite` setting), exact-origin credentialed CORS, `Vary: Origin`, CSRF controls for cookie-authenticated mutations, and no wildcard origin with credentials. Verify these settings with deployed-browser tests, not just unit tests.

---

## 5. Database design and integrity rules

Design the schema from the actual business entities and transactions, not from the UI form alone. A generic key/value record is useful for flexible operational registers but is not sufficient as the accounting or transaction ledger.

### Shared columns/policies

Where appropriate, records should include:

- UUID primary key.
- `workspace_id` and optionally `branch_id`.
- `created_at`, `updated_at`, `created_by`, `updated_by`.
- state/status fields constrained by domain transition rules.
- version/optimistic concurrency token for editable documents where concurrent edits can overwrite each other.
- unique constraints scoped to workspace (for example SKU, customer code, invoice number).
- foreign keys for domain relationships and indexes that match real access patterns.

Use UTC timestamps in storage and explicit timezone preferences for display/scheduling. Store dates where the business concept is a date rather than an instant. Use explicit currency codes. For money, follow the existing shared contract/`src/domain/money/money.ts`: values named `*Minor` must be integer minor currency units; unit quantities/rates requiring fractional precision should use exact decimal types. Use `NUMERIC`/Prisma Decimal for decimal quantities or exact decimal rates where required, never JS/PostgreSQL binary float as the source of accounting truth. Document rounding at each calculation boundary.

### Core table families (baseline, not a final exhaustive schema)

| Domain | Main relational entities | Integrity rule |
|---|---|---|
| Tenant/access | workspace, branch, membership, role, permission, invitations, entitlements | All records belong to a valid workspace; branch must belong to that workspace |
| Catalog | category, product/service, SKU/barcode, unit, price list, price-list item, tax code, product-tax rule, item bundle, BOM | SKU/barcode unique within configured scope; active/inactive and tax snapshot rules enforced |
| Inventory | warehouse/location, stock movement, stock balance projection, transfer, transfer line, stock count/session/line, reservation, batch/serial, reorder policy | Stock movement is the auditable source of movement history; no balance changes without a movement/transaction |
| Sales | customer/account, quotation/line, sales order/line, invoice/line, sale/line, payment, payment allocation, return/return line, credit note, delivery, package, picklist | Header totals recalculated server-side; payment allocation cannot exceed allowed balance; returns cannot exceed eligible quantities |
| Procurement | supplier/account, purchase request/line, RFQ, supplier quote/line, purchase order/line, goods receipt/line, supplier invoice/line, purchase return/debit note | Receipt and payable are separate facts; a PO does not itself add stock or pay a supplier |
| Finance | chart of accounts, journal, journal line, payment/settlement, cash session/cash movement, cash-up, expense, bank statement, reconciliation match, fixed asset/depreciation, cost centre, budget | Posted journals and history are immutable; corrections use reversals/adjustments, not destructive edits |
| CRM/support | contact, customer/supplier party links, lead, campaign, opportunity, sales-team/territory, support case | Conversion preserves identity/history and links new records; do not duplicate a customer on every converted lead |
| People/projects | employee, shift, attendance entry, leave request, timesheet, payroll run/line, project, task, job card, work order, quality inspection | Sensitive HR/payroll data needs narrow permissions; approved payroll creates reviewed finance postings |
| Collaboration | thread, participant, message, message attachment, reaction, read marker, task, approval instance/decision, notification, activity event | Actor is always server-attributed; permissions also apply to linked records/attachments |
| SaaS/platform | plan, entitlement, subscription reference, usage event, AI provider/model config, webhook endpoint/delivery, integration connection, idempotency record, outbox event, audit event | Tenant usage is server-metered; webhook/job handlers are idempotent; secrets are encrypted and never returned |
| Files/search | attachment metadata, object key, extraction job, search document/chunk, embedding/vector | Private object keys are never public; enforce tenant/record permissions before serving or retrieving content |

### Transaction-critical patterns

- **Inventory:** store append-only stock movements; maintain a balance projection atomically in the same database transaction or derive balances by a tested query. A sale/receipt/transfer/return must write the relevant movements consistently. Use locking/version checks for concurrent reservation/stock changes.
- **Sales/payment:** completion validates product status, server-side prices/discounts/tax rules, stock policy, and payment amounts; creates canonical sale + lines + payment records + inventory effect and any ledger/outbox records atomically. The browser-calculated total is display-only.
- **Finance:** draft journals can be edited by authorized roles; posted journals cannot be rewritten. Correct by reversal/adjustment with links and audit.
- **Event delivery:** use a transactional outbox for messages/notifications/webhooks triggered by a transaction. A queue may deliver more than once; handlers must be idempotent.
- **Idempotency:** store key, user/tenant, action, request hash and canonical response/result for consequential mutations. Reuse with a different request body must conflict. Enforce idempotency at the server, not merely by generating a random key in React.
- **Imports/backups:** stage and validate first; show a preview/errors; commit atomically or provide a clearly documented partial-import contract. Restore must be privileged, version-checked, transactional, audited and protected from oversized/untrusted payloads.
- **External payments/tax authority:** a record marked “recorded externally” is not proof that a transfer or statutory submission succeeded. External calls need provider reference/status and reconciliation. Never fake success.

---

## 6. API contract rules and immediate alignment tasks

Keep `lexa-frontend/openapi/backend-contract.yaml` as the shared contract baseline. It currently describes 51 paths and approximately 64 operations. Use `/api/v1` and documented schemas. Do not write server endpoints from memory when a frontend adapter already specifies the expected path/body/response.

### Contract cleanup before the first backend release

1. Keep `GET /auth/session` canonical and remove or explicitly deprecate duplicate `GET /session`.
2. Review the generic module-record collection `PUT` semantics. The contract describes version/ETag protection for replacement, but the existing frontend adapter does not currently supply an ETag/version. Either add optimistic concurrency to the adapter/contract or make a clearly documented server-side transaction/version rule before enabling whole-collection replacement. Never permit an ordinary end-user action to silently overwrite the whole collection.
3. Ensure generic module-record mutations return consistent shapes. Current adapter refetches collection after save/status changes; document that behavior or change it deliberately with contract tests.
4. Reconcile the dashboard snapshot route (`/workspaces/{workspaceId}/branches/{branchId}/dashboard`) with the analytics overview route (`.../analytics/overview`). They serve different contracts today; document which frontend widgets use which route and avoid a third duplicate calculation path.
5. Ensure error envelope, 204 response handling, list envelopes (`[]` versus `{ items: [] }`), date/time format, currencies, amount units, optional/null fields, and pagination rules are consistent. Client adapters currently accept some arrays and `{ items: [] }`; choose canonical response formats in the contract and test them.
6. Check all operation IDs are unique and all referenced schemas/parameters exist as part of CI.
7. The contract is an API agreement, not proof a route is implemented. Add an automated test that compares implemented NestJS routes with OpenAPI operations.

### Core currently described route groups

- Health/readiness: `/health`
- Auth: `/auth/csrf`, `/auth/session`, `/auth/login`, `/auth/logout`, `/auth/password/forgot`, `/auth/password/reset`
- Workspace/branches: `/workspaces`, `/workspaces/{workspaceId}`, `/workspaces/{workspaceId}/branches`
- Catalog: products, product detail, categories
- Inventory: branch movements and balances
- Sales: list/detail, complete-sale workflow, payment, return
- Dashboard/reporting: dashboard snapshot, analytics overview, module report
- Operational registers: `/workspaces/{workspaceId}/branches/{branchId}/modules/{moduleId}/records` and record/status paths
- Business Tools: snapshot, tax profile, cash-ups, compliance notes, attachments, product/stock CSV imports, backup/restore
- Search: workspace global search
- Collaboration: inbox threads/messages/reactions/read markers, tasks, approvals, notifications and activity

The frontend uses more than those path names: compare every adapter with OpenAPI during Phase 0. Add paths/schemas deliberately as a compatibility change rather than allowing accidental route drift.

---

## 7. Core frontend screen-by-screen integration

| Frontend screen / route | Frontend files | Required backend connections | End-to-end acceptance |
|---|---|---|---|
| Sign in `/sign-in` | `src/modules/auth/AuthPage.tsx`, `src/data/remote/apiAuth.ts` | Identity provider, session/token verification, session/cookie issuance and session response | Valid login succeeds; invalid/locked user is rejected; session survives refresh; no credential stored in localStorage |
| Forgot password `/forgot-password` | same auth files | Rate-limited recovery; email provider; generic response; token lifecycle | Existing and non-existing email reveal no account existence; only single-use unexpired token works |
| Reset password `/reset-password` | same auth files | Token verification, password policy, revoke relevant sessions according to policy | Missing/expired/reused token rejected; success allows new login; token never logged or persisted in browser storage |
| Onboarding `/onboarding` | `src/modules/onboarding/OnboardingPage.tsx` | Current user, workspace creation, first branch creation and initial membership/owner role in one transaction | Workspace + main branch + owner membership are created once; retry does not duplicate them |
| Workspace `/workspace` and shell scope | `WorkspacePage.tsx`, `WorkspaceContext.tsx`, `AppShell.tsx` | Authorized workspace/branch listing, creation/update, active scope | User sees only authorized scopes; switching branch refreshes every branch-scoped query; cross-tenant IDs are denied |
| Overview `/` | `DashboardPage.tsx`, `apiDashboard.ts`, reports repository | Server analytics, dashboard snapshot, source coverage and exception links | KPIs reconcile to sales/inventory/finance records and display proper empty/unavailable states |
| Products `/products` | `ProductsPage.tsx`, `apiRepositories.ts` | Product/category CRUD, SKU/barcode uniqueness, pricing/tax/stock policy | Product create/edit and barcode lookup persist; invalid/duplicate SKU rejected; downstream selectors see it |
| Inventory `/inventory` | `InventoryPage.tsx`, `apiRepositories.ts` | Stock movement/adjustment, balance projection, product/branch scope | Adjustment creates movement and updates balance in same transaction; concurrent updates cannot lose stock |
| Checkout `/checkout` | `CheckoutPage.tsx`, `apiSalesWorkflow.ts` | Product/prices, stock availability, sale completion, payments, inventory and accounting/outbox | Split payment and stock effects persist once; server totals override browser totals; retry does not duplicate sale |
| Sales list `/sales` | `SalesPage.tsx`, sales repository | Paginated/filterable sales and branch/workspace scopes | Every listed sale matches stored canonical transaction; search/date filters don't widen authorization |
| Sale detail `/sales/:saleId` | `SaleDetailPage.tsx`, sales workflow | Sale header/lines, payment, returns/refunds, linked thread and audit | Add payment/return validates outstanding/returnable quantities and updates finance/inventory as defined |
| Generic operational register `/modules/:moduleId` | `OperationsWorkspacePage.tsx`, `moduleCatalog.ts`, `apiModuleRecords.ts` | Generic record list/create/update/status, server schema and transition permissions; first-class service for critical domains | Empty collection renders empty state; server rejects invalid fields/status; unauthorized module actions fail; relationships are real IDs, not free-text only where control matters |
| All modules `/modules` | same operations workspace | Registry of supported modules, features/entitlements and permissions | Visibility may follow entitlements, but server still authorizes every request |
| Inbox `/inbox` | `InboxPage.tsx`, `apiCollaboration.ts` | Threads/participants/messages, tasks, approvals, notifications, activity, attachments | Messages/read state synchronize across users; participant and record permissions are enforced; unread badge reconciles |
| Business Tools `/business-tools` | `BusinessToolsPage.tsx`, `apiBusinessTools.ts` | Tax profile, cash-up, private attachments, imports, export/backup/restore, compliance notes | Import validation is previewed; restore is audited and privileged; attachments use scoped/time-limited access; no local backup is treated as server backup |
| Settings `/settings` | `SettingsPage.tsx`, workspace/product/sales adapters and auth APIs | Business preferences, workspace/branch settings, current session/capabilities, user profile/security preferences | Persisted settings load from server; security and access changes are authorized/audited; UI-only theme preferences remain client preferences if desired |
| Global search (Ctrl/Cmd+K) | `src/components/GlobalSearch.tsx`, `apiGlobalSearch.ts` | Permission-filtered search over authorized business domains with internal routes | Results do not leak cross-tenant records; each destination opens the correct authorized record |
| Record conversation panel | `src/components/inbox/RecordConversationPanel.tsx` | Record-linked thread, participant policy, attachments | Only authorized users/participants can read/write context; linked record deletion/archive follows documented policy |
| Data tables and saved views | `StandardDataTable.tsx` and module screens | Server pagination/filter/sort for large lists; saved-view storage per user/workspace | Pagination/sort values are validated on server; saved views do not bypass record permissions |
| Charts | `components/charts/Charts.tsx` | Server-provided series/breakdowns | No chart synthesizes business data; zero-data state differs from unavailable/error state |
| Barcode capture | `components/barcode/BarcodeCapture.tsx` + product/checkout/inventory screens | Resolve barcode to product in authorized workspace/branch | Unknown barcode gives honest not-found flow; matched product is fetched from server; barcode scan never invents a product |

### Frontend behavior requirements common to every screen

- Use stable TanStack Query keys containing workspace/branch identifiers for scoped data. Invalidate related queries after successful writes.
- Treat API response values as canonical; local calculations are previews only where the workflow contract permits them.
- API errors must not silently write to IndexedDB/localStorage. Device-local mode is development-only and must be explicit.
- Show loading, no records yet, no search results, permission denied, stale/conflict, backend unavailable and mutation failure as different states.
- Do not show “success” until the server confirms the write. Do not treat a queued external action as completed until its provider confirms completion.
- On a workspace/branch switch, ensure stale query results from the prior scope cannot remain visible as if they belonged to the new scope.

---

## 8. Operational catalog: every module and its relationships

The frontend's current `src/modules/operations/moduleCatalog.ts` defines **57 operational register modules**. The generic register UI makes the module visible, but the backend must own field validation, record relationships, state transitions, business rules and any downstream side effects. For important documents/transactions, use typed first-class entities and services; the generic record endpoint should be a lightweight bridge, not a replacement for the sales ledger, stock ledger, accounting ledger, payroll or security tables.

### 8.1 CRM, customers and selling

| Module ID / frontend label | Authoritative backend model / API behavior | Upstream dependencies | Downstream effects and inter-module links |
|---|---|---|---|
| `contacts` — Contacts & addresses | Contact/person/address records with workspace ownership and party links | Workspace; optional lead/customer/supplier origin | Link to customer, supplier, lead, campaign, support case and sales records; avoid duplicate contact entities during conversion |
| `leads` — Leads & prospect tracking | CRM lead, source, owner, qualification and conversion history | Contacts, campaigns, sales team/territory | Qualify → opportunity; convert to customer/contact with source retained; may spawn tasks/follow-up notifications; does not create revenue |
| `opportunities` — CRM opportunities | Opportunity, stage history, owner, expected value/date | Lead/contact/customer and sales-team membership | Can produce quotation or sales order; forecasting aggregates separately from booked sales; never count as realized revenue |
| `customers` — Customers | Customer/account, billing profile, terms, credit-limit policy and opening balance reconciliation | Contact and validated workspace/customer number | Quotes, orders, invoices, payments, returns/credit notes, support, customer statements and reports; compute receivable from posted documents/payments, not a free-text balance field |
| `sales-teams` — Sales team & territories | Sales teams, territory rules and user/employee assignment | Employees/memberships and workspace | Assign lead/opportunity/customer ownership, filter sales reports and enforce assignment visibility where policy requires it |
| `campaigns` — Campaigns & acquisition | Campaign, source, dates, channel, budget and attribution | Contacts/leads and user/team permissions | Lead source attribution and CRM analytics; consent/preferences must govern outreach; do not claim campaign email was sent without a provider event |
| `quotations` — Quotations | Quote header/lines, version, validity, price and tax snapshots | Customer, products/services, price lists, tax codes and salesperson | Accepted quote can convert once into an order; preserve source/line references; declined/expired quote does not reserve/ship stock or post revenue |
| `sales-orders` — Sales orders | Order header/lines, fulfillment state, promised dates and version | Customer, accepted quote (optional), product/pricing/tax | Creates authorized fulfillment/picklist/delivery/invoice flow; any reservation must be an explicit stock reservation, not assumed on draft |
| `sales-invoices` — Sales invoices | Invoice/line, issued/due state, immutable issue snapshot, credit/payment allocations | Customer, sales order/delivery/sale, tax codes, pricing | Creates AR/ledger/tax-document workflow on issue; receipts allocate to invoice; returns create credit notes; overdue status is derived from due date/open balance |
| `sales-returns` — Sales returns & credit notes | Return authorization, return lines, condition/restock decision, credit note/refund | Original sale/invoice/line, customer, stock/batch information | Validate remaining returnable quantity; approved restock creates inventory movement; credit/refund updates AR/cash/ledger; never silently refund money or re-add unusable stock |
| `recurring-invoices` — Recurring billing schedules | Recurrence rule, next run, line template, idempotency/run history | Customer, product/service, tax and terms | Scheduler creates invoice drafts/issued invoices according to policy; each period is idempotent; payment collection is separate and not implied |
| `price-lists` — Price lists & pricing | Price list, effective dates, customer/channel scope, currency and rules | Products/services, workspace currency and customer segments | Quote/order/checkout price preview; backend recalculates/validates at transaction time; save the applied price snapshot on issued/posted documents |

### 8.2 Procurement and suppliers

| Module ID / frontend label | Authoritative backend model / API behavior | Upstream dependencies | Downstream effects and inter-module links |
|---|---|---|---|
| `suppliers` — Suppliers | Supplier/account, tax/contact data, payment terms and opening payable reconciliation | Contacts and workspace | Purchase requests/RFQs/quotes/orders, receiving, supplier invoices, payments, supplier returns, AP statements and supplier performance reports |
| `purchase-requests` — Purchase requests | Request header/lines, requester, reason, budget reference and approval state | Replenishment, work orders, stock/forecast, cost centre/project | Approved request may create RFQ or PO; it does not increase inventory or create a payable |
| `rfqs` — Requests for quotation | RFQ, invited suppliers, deadline, scope and responses | Purchase request, supplier and catalog items | Receives supplier quotes; records who was invited/responded; no PO is created until a documented selection/approval |
| `supplier-quotes` — Supplier quotations | Supplier quotation and price/lead-time/terms per line | RFQ, supplier, product/service | Compare quote responses and select award; selected quotation can create PO with source references |
| `purchases` — Purchase orders | PO header/lines, currency, supplier terms, approval and receiving state | Supplier, purchase request/RFQ/quote, product, budget/approval | Goods receipt adds physical stock only after receipt is recorded; supplier invoice creates AP; cancellation/revision respects already received quantities |
| `receiving` — Goods receiving | Goods receipt and receipt lines, accepted/rejected qty, receipt discrepancy | PO, supplier, warehouse/location, product, batch/serial and quality rules | Accepted goods create stock movements/batch records atomically; discrepancy creates review/task; later supplier invoice references receipt/PO (3-way match where enabled) |
| `purchase-invoices` — Supplier invoices | Supplier bill/lines, invoice reference, due date, matched receipts and taxes | Supplier, PO, goods receipt, tax codes, cost centre | Approved bill creates AP and journal entries; payments allocate to the bill; mismatches require hold/approval, not silent posting |
| `purchase-returns` — Supplier returns & debit notes | Return-to-supplier authorization, return lines and debit-note state | Received stock/batch, supplier bill/receipt and reason | Approved outbound movement lowers available stock; supplier credit/debit balance and finance event are linked; prevent return of already shipped/returned quantities |
| `replenishment` — Reorder planning | Reorder parameters, safety stock, lead time, preferred supplier and recommendation snapshot | Inventory balances, reservations, sales demand, supplier/product lead times | Creates draft purchase request(s) for review; no auto-purchase or stock mutation without configured, authorized workflow |

### 8.3 Catalog, inventory, warehouse and operations

| Module ID / frontend label | Authoritative backend model / API behavior | Upstream dependencies | Downstream effects and inter-module links |
|---|---|---|---|
| Core `products` screen — Products | Product/service, SKU/barcode, unit, cost/selling price fields, track-stock policy and threshold | Categories, tax codes, price lists, suppliers and workspace settings | Available to quote/sale/purchase/order/stock/production/report/search; updates must not rewrite historical transaction snapshots |
| Core `inventory` screen — Stock & movements | Stock movement ledger + balance projection by product, branch/location and batch where applicable | Product, branch/warehouse, receiving, sales, returns, counts, transfers, work orders | All stock-changing modules call one inventory domain service; no direct balance overwrite outside controlled initialization/repair |
| `warehouses` — Warehouses & locations | Warehouse/storage locations/bins with branch and operating status | Workspace/branch and user grants | Used by receiving, picklists, stock transfer/count, batch/serial, production and fulfillment; validate that source/destination belong to permitted workspace |
| `stock-counts` — Stock counts | Count session, blind/expected quantities, count lines, review and variance approval | Warehouse/location, product, batch/serial and current snapshot | Approved variances post explicit stock adjustment movements; preserve count evidence; do not edit opening balances to hide variances |
| `stock-transfers` — Stock transfers | Transfer header/lines, source/destination, in-transit/received state | Source/destination warehouses, product/batch and transfer permissions | Dispatch reduces source available/on-hand according to policy; receipt increases destination; in-transit stock is represented explicitly; both legs reconcile to a single transfer ID |
| `batches` — Batch, serial & expiry tracking | Lot/batch/serial entities, expiration/production dates, quality/recall state | Receiving, product, work order/job card, warehouse | Allocate stock by batch/serial according to configured picking/valuation policy; expired/quarantined batches are not saleable; trace recall links through sales/receiving |
| `item-bundles` — Item bundles & composite items | Bundle definition/components, quantities, bundle type and version | Catalog components, units, tax/price rule | Checkout/order validates components; if inventory is component-based, sale consumes components atomically; virtual bundles and preassembled kits must have explicitly different rules |
| `picklists` — Warehouse picklists | Pick tasks, order lines, picked quantities, bin/batch selections and picker | Sales order, warehouse, product and stock reservations | Completes fulfillment staging; picking alone must not imply customer delivery/payment; dispatch/delivery posts the corresponding stock transition |
| `deliveries` — Deliveries & fulfilment | Delivery/dispatch, shipment lines, carrier/tracking and proof-of-delivery state | Sales order/invoice, packages and picklists | Dispatch updates fulfillment and stock according to policy; delivery confirmation updates order state; carrier integration status must be factual and retryable |
| `packages` — Packages & packing slips | Package/packing list, package lines, dimensions/weights/tracking | Picked order/delivery and product/package rules | Connects shipment to actual ordered quantities; supports labels and delivery tracking when carrier adapter exists; must never create fake carrier references |
| `boms` — Bills of materials / recipes | Versioned BOM/recipe, component quantities/yield/scrap rules | Product components, units, approved revisions | Work orders consume components and produce finished goods; historical work order must keep its BOM revision snapshot |
| `work-orders` — Production & assembly orders | Production order, planned/actual output, components, waste and status | BOM, material availability, warehouse, quality rules | Reserve/consume raw materials, create job cards, route inspection and post finished goods only after the defined completion/quality gate |
| `job-cards` — Production job cards | Operation-level work, assignee, time and completion/defect details | Work order, employee, skills/permissions, quality | Adds production time/cost and operation history; a completed card does not itself post finished stock unless work-order completion rule commits it |
| `quality` — Quality inspections | Inspection plan/result, acceptance/rejection, nonconformance and disposition | Receiving, batches, work orders, returned goods | Accepted stock may be released; rejected stock quarantined/returned/scrapped via controlled movement; quality decision is auditable and can block sale/production completion |

### 8.4 Finance, tax and cash

| Module ID / frontend label | Authoritative backend model / API behavior | Upstream dependencies | Downstream effects and inter-module links |
|---|---|---|---|
| `expenses` — Expenses | Expense claim/record, receipt attachment, category, employee, approval and settlement | Employee/user, cost centre/project, money account, approval policy | Approval/settlement can create payable/payment and journal entries; duplicate receipts/claims need review; an expense's approval and payment are different states |
| `money-accounts` — Money accounts | Cash/bank/mobile-money clearing/payment accounts and reconciliation settings | Workspace currency, branch, permissions and account mapping | Receives payment allocations, cash-session summaries, expense payments and bank matches; real transfer is only confirmed by an external provider/bank integration |
| `payments` — Receipts & payments | Payment/receipt record, allocations, method, provider reference, status and refunds | Sale/invoice/supplier bill/expense, cash/bank account | Allocates money to specific open balances; unallocated deposits remain unapplied; avoid double-posting from both payment event and bank import |
| `cash-sessions` — POS sessions & cash-up | Open/close session, cashier, opening float, cash movements, expected/count cash, variance | User/branch, checkout sales and cash payment methods | Session totals must reconcile from completed POS sales/refunds and recorded cash movements; cash-up variance requires review and, if approved, a controlled adjustment |
| `accounting` — Accounting journals | Journal header/lines, source reference, posting state, reversal link | Chart of accounts, source sales/purchases/payments/expenses/payroll/assets/tax rules | Posted debit/credit lines balance; source transactions create postings via application services; corrections create linked reversals/adjustments, not mutation of posted history |
| `chart-of-accounts` — Chart of accounts | Account hierarchy, type, posting restrictions and effective state | Workspace/finance configuration | Used by all journal rules, reporting and cost-centre mappings; prevent deletion/disablement of accounts with posted historical entries |
| `tax-codes` — Tax codes & rules | Versioned tax code/rate/treatment, effective dates, jurisdiction and verification/source metadata | Workspace tax profile, product/service and transaction date | Used by quote/order/invoice/purchase line calculations; store tax calculation snapshot at posting; never assume tax rates or threshold from a demo default |
| `tax-documents` — Tax documents & EFRIS | Tax submission document, status transitions, request/response references and retries | Issued invoice/credit note, tax profile, verified EFRIS integration settings | Connects to external authority through a provider adapter; submission must have genuine external reference/result; queued, failed, accepted and rejected are distinct |
| `bank-reconciliation` — Bank reconciliation | Statement/import lines, match allocations, period lock and discrepancy | Money accounts, payments, receipts, fees and ledger | Matched items reconcile once; unmatched/duplicate items remain visible; approved adjustment creates a journal entry and audit event |
| `assets` — Fixed assets | Asset register, cost, acquisition, useful life/residual value, depreciation schedule and disposal | Purchase invoice/payment, account mapping and cost centre | Capitalization and depreciation create controlled journal postings; disposal links to proceeds/gain/loss; changing configuration must not rewrite previously posted depreciation |
| `cost-centers` — Cost centres | Cost-centre hierarchy, owners and active dates | Workspace, department/project and accounts | Tagged expenses, payroll, purchase and project costs roll into reports/budgets; enforce valid active IDs on posting |
| `budgets` — Budgets & forecasts | Budget versions by period/account/cost centre and approval state | Chart of accounts, cost centres, sales/expense forecast inputs | Actuals come from posted ledger/source facts; variance reports compare approved budgets with actuals; AI forecasts are advisory and labeled as such |
| `recurring-invoices` — Recurring billing schedules | Recurrence template, schedule, next due date and run history | Customers, products/services, price/tax profile and invoice terms | Worker generates invoice drafts/issues under tenant rules; unique period/run key prevents duplicates; payment processor is separate |

### 8.5 People, projects, workflow and platform control

| Module ID / frontend label | Authoritative backend model / API behavior | Upstream dependencies | Downstream effects and inter-module links |
|---|---|---|---|
| `employees` — Employees & HR directory | Employee profile, department, employment state, pay group and permitted contact details | Workspace, HR roles and optionally identity-user link | Attendance, leave, timesheets, job cards and payroll; employee record is not automatically a login account; tightly restrict PII |
| `attendance` — Attendance & shifts | Shift schedules, check-in/out, adjustment request, absence and approval | Employee, branch/shift/calendar and permission policy | Feeds timesheet/payroll calculations; approved corrections retain before/after audit; never calculate statutory payroll from unapproved attendance |
| `leave` — Leave requests | Leave balances/policy, request, approval, dates and return-to-work state | Employee, manager/approval rules, schedule | Blocks/adjusts attendance and payroll inputs according to policy; prevents overlapping or invalid leave; approval produces notification/task events |
| `payroll` — Payroll runs | Payroll run/line, salary components, deductions, tax/social contribution rules and lock state | Employee, attendance, leave, timesheets/approved variable pay, finance mapping | Requires restricted approval; finalization posts reviewed ledger entries/payables; payment confirmation separate from calculation; preserve payroll-period snapshot and access logs |
| `projects` — Projects & cost tracking | Project, customer, dates, budget, manager and status | Customer, employees, cost centre and sales contracts | Tasks/timesheets/costs/expenses and project billing; project margin comes from posted income/cost, not just entered estimates |
| `timesheets` — Timesheets & billable time | Time entries, approvals, billable/nonbillable state and rate snapshot | Employee, project, job card, task and period | Approved hours can feed payroll/job cost/customer billing; lock approved periods and prevent duplicate invoicing of the same time entry |
| `tasks` — Tasks & work queue | Task, assignee, due date, priority, linked object and completion history | Any authorized source module, user/employee and approval/workflow policy | Task changes create audit/notifications; completing a task must not automatically imply the linked document's business state unless a defined workflow command does so |
| `support` — Customer support cases | Case, requester/customer, category, severity, assignment, state and SLA | Customer/contact, invoice/order/sale, attachments and messages | Can spawn task/approval, notify agents and link to CRM; any refund/credit/stock action must go through the underlying sales/finance service |
| `team` — Team & access | Membership, role assignment, invitations, branch grants and active state | Identity provider user and workspace/branch | Controls UI capability and API authorization; role change audited; revocation takes effect server-side and must not depend on re-login alone where feasible |
| `integrations` — Integration status | Integration config/status, encrypted credential reference, webhook endpoints/delivery events and health | Workspace admin permissions, secret store and provider adapters | Drives inbound/outbound events for tax, messaging, carrier, payments/imports; credential plaintext is never returned; retries/dead-letter events are visible |
| `audit` — Activity & audit log | Read-only view over append-only audit events | All modules' mutation services and system/worker actions | Supports investigations and accountable reporting; actor/action/time/target/result/correlation IDs retained by policy; never permit editing audit rows via generic CRUD |
| `reports` — Reports & analytics | Report definitions, saved parameters and server-side aggregate/read models | Sales, inventory, procurement, finance, CRM, HR, workflow events and permissions | All totals derive from canonical sources and report scope; show period/timezone, source coverage, generated time and limitations; no client-generated demo data or AI-invented values |

### 8.6 Core visible flows not counted in the 57 register catalog

- **Checkout/POS** uses the product catalog, price/tax rules, inventory availability/reservation, customer (optional), sale completion, payment allocation, stock ledger, accounting and cash session. It must call the same server sale service as any other channel.
- **Product screen** is a first-class catalog client; it supplies the identifiers referenced by inventory, purchasing, BOMs, price lists, sales and search.
- **Inventory screen** is a view of movements and balances; it must not own a parallel stock number separate from receiving, sales, transfers and production.
- **Sales list/detail** reads the same sale/payment/return entities produced by POS and invoice workflows.
- **Dashboard** is a derived analytics view; do not create an independently editable set of dashboard totals.
- **Inbox/collaboration** provides contextual comms, tasks, approvals and notifications for other modules; source document authorization still applies.
- **Business Tools** exposes safe operational tools over authoritative APIs. Local browser backup and server backup are not the same capability.
- **Settings** owns tenant preferences/security/profile settings only; it must not circumvent the workspace, membership, role, or audit services.

---

## 9. Cross-module end-to-end workflows

These journeys define how modules must interconnect. Build and test the entire journey, not only each endpoint in isolation.

### Journey A — New tenant → branch → user access

1. User signs in/validates identity or completes account setup via the identity provider.
2. Onboarding creates workspace, initial branch and owner membership/role atomically or through a recoverable idempotent onboarding workflow.
3. The app shell fetches only workspaces and branches the user can access.
4. Owner invites team members, assigns role and branch scope.
5. Invitation acceptance creates membership; permission checks are enforced at the backend and not inferred from frontend navigation.
6. Audit records capture workspace creation, invitation and role changes.

### Journey B — Supplier → procurement → receipt → supplier bill → payment

1. Maintain supplier and product/supplier SKU/terms.
2. Replenishment or a user creates a purchase request based on stock, future demand or manual need.
3. Approval policy decides if it requires an approver; optional RFQ captures multiple supplier quotes.
4. Selected quote/request creates a purchase order with source references, currency, prices and expected date.
5. Goods receiving records accepted, rejected and discrepancy quantities per warehouse/batch; accepted stock movements and receipt header commit together.
6. Supplier bill is matched to the PO and receipt (amount/quantity/tax variance rules); approved bill creates AP and controlled journal postings.
7. Payment records allocate to the supplier bill and selected money account; actual external transfer state is tracked separately.
8. Bank reconciliation matches statement line to payment; reports show stock, AP and cash/ledger effects without double counting.

### Journey C — Catalog → quote → order → fulfilment → invoice → receipt

1. Product, active selling price, unit and tax rules exist.
2. CRM contact/lead becomes a customer or links to an existing customer; duplication checks preserve source history.
3. Quote saves immutable applied pricing/tax snapshot and line references. Accepted quote converts once to an order.
4. Order can create a stock reservation/picklist if policy requires it. Picking selects available warehouse quantities and batches.
5. Package/delivery records the actual quantities dispatched and carrier/provider state.
6. Invoice issue creates receivable and tax/ledger events using server-calculated totals and the approved tax profile.
7. Payment is allocated to invoice(s); an unapplied receipt remains unapplied until allocation.
8. Customer balance, aging, bank reconciliation and dashboard derive from authoritative documents and payment allocations.

### Journey D — POS checkout with split payment

1. Scan barcode or search and load the active product from the backend.
2. The backend validates price/tax rule and inventory/stock policy at commit time; frontend totals are indicative only.
3. Submit `completeSale` with an idempotency key and payment allocation intent.
4. Server validates workspace/branch/permissions, stock availability, quantities, price/tax, discounts, payments and rounding.
5. In one transaction create sale + sale lines + payment records + stock movement/balance update + account/ledger/outbox records required by policy.
6. Return canonical sale ID, receipt number, totals and payment status; frontend invalidates checkout, inventory, sales, report and dashboard queries.
7. Replayed identical idempotency key returns the original result; changed request with same key conflicts.
8. Cash payment belongs to cash session/cash movement; mobile money/card marked “recorded externally” remains a recorded payment method, not a claim that LEXA executed the transfer.

### Journey E — Sale return / refund

1. Load original sale lines, existing returns and refundable/returnable quantity.
2. Validate returned quantities, reason, condition and whether goods can be restocked.
3. Approval policy runs for threshold/risk/role cases.
4. The backend creates return and credit/refund records; inventory movement and finance allocation are transactionally linked when applicable.
5. Mark refund as requested/recorded/settled only according to actual payment-provider state.
6. Update receivable/refund, stock, ledger, customer history, activity, alerts and reports; preserve original sale and audit history.

### Journey F — Stock count, transfer and reorder

- Count sessions snapshot expected stock; captured counts are reviewed; approved differences create inventory adjustments.
- Transfers have source, destination, dispatch and receipt legs with an in-transit state; a transfer cannot make stock appear at the destination before receipt confirmation.
- Replenishment computes suggestions from actual stock, reservations, reorder rules and supplier lead times; it creates draft purchase requests, not unapproved purchase orders.
- Sales, receiving, production, returns and transfers all call the same inventory domain service and balance logic.

### Journey G — Manufacturing / assembly

1. Approved BOM version defines components/yield/scrap and unit conversions.
2. Create work order; confirm material availability, reservations and planned output.
3. Job cards track operations, assigned employees and actual time.
4. Component consumption, wastage and quality holds are recorded.
5. Quality pass/release gates determine if finished goods can be completed; failed lots are quarantined/reworked/scrapped by explicit action.
6. Completion posts raw material consumption and finished-goods stock movements atomically; actual costs feed cost centres/projects/accounting according to approved policy.

### Journey H — HR / leave / attendance / payroll

1. Employee profile is created with access restrictions; account access is separately granted where required.
2. Shifts and attendance capture exceptions; leave request passes the approval workflow and updates available dates/balance.
3. Approved time/attendance/leave/variable pay feeds a draft payroll run.
4. Payroll calculations use deterministic, legally reviewed rules; AI does not decide statutory deductions or make final payroll calculations.
5. Authorized reviewer approves and locks payroll; postings/payables are written with audit; disbursement is a separate payment/settlement step.
6. Payroll data is only accessible to specifically permitted users and cannot leak into ordinary search/AI prompts.

### Journey I — Expenses / fixed assets / accounting / bank reconciliation

1. Expense with receipt is submitted and approved; fixed-asset purchase follows capitalization policy when applicable.
2. Approved source transaction calls finance posting service with explicit account/cost-centre mapping.
3. Journal lines balance and journal references the source transaction/idempotency key.
4. Bank statement import creates statement lines; matching links each line to payments/receipts once.
5. Unmatched entries and differences require review; approved adjustments create journal records.
6. Posted finance records are immutable; correction uses a linked reversing entry.
7. Reports calculate actual balances and variances from posted data, with period lock and reconciliation coverage displayed.

### Journey J — Collaboration, approvals and audit

1. A source module creates a task/approval/notification/outbox event in the same transaction as the business change when appropriate.
2. Inbox shows only threads/tasks/approvals/notifications the user is authorized to see.
3. Decision endpoint validates approver, decision policy and current source state; simultaneous decisions use concurrency control.
4. Decision creates audit event and notification; any actual business state transition occurs through the owning domain service.
5. Linked message attachments are stored privately and authorized against both thread and linked record policy.
6. Activity shows server-attributed facts; browser-submitted `actorName` is never authoritative.

### Journey K — AI assistant over business data

1. Request passes authentication, workspace/branch scope and entitlement/usage limits.
2. The AI module classifies task sensitivity and capabilities and checks tenant provider policy.
3. Retrieval uses authorized DB/search results; rows/chunks are filtered for tenant/user permissions before content reaches a provider.
4. Router selects an eligible model from free-tier and paid candidates. Free usage is not assumed unlimited, permanent, or acceptable for confidential data.
5. Responses that contain structured output are schema-validated; calculations come from deterministic business services.
6. Read-only tools are preferred initially. A proposed write returns a preview; execution requires explicit confirmation and a second authorization/business-validation check.
7. Every call records provider/model, latency, usage, estimated/reconciled cost, outcome, fallback and correlation ID. Do not log raw sensitive prompts by default.
8. Provider outage/budget exhaustion returns a truthful limitation or uses an allowed fallback; never silently violate tenant privacy policy or paid budget.

---

## 10. AI integration contract and provider-independent design

AI is mandatory, but provider keys and selection must be hidden behind LEXA's backend. No frontend module may call Gemini, OpenAI, Groq, Cerebras, Cloudflare, Anthropic or OpenRouter directly.

### Backend AI interfaces

Implement a LEXA-owned interface independent of vendor SDKs, conceptually:

- `generateText(taskProfile, input, context)`
- `generateStructured(taskProfile, input, schema, context)`
- `embedDocuments(items, context)` only when embeddings are needed
- `retrieveAuthorizedContext(query, workspaceId, userId, filters)`
- `executeApprovedTool(toolName, validatedArgs, actorContext)`
- `getAiUsage(workspaceId, period)`
- `updateTenantAiPolicy(workspaceId, policy)` with admin authorization

Names can differ, but all LEXA features use the same central orchestration/policy path.

### Provider/model registry fields

Track provider/model ID, enabled state, supported capabilities (structured outputs, tool calling, vision, streaming, embeddings), context/output limits, free/paid/tenant-key class, region, latency/availability, quotas, data-class eligibility, current terms-review date, retry policy, cost configuration and health/cooldown state.

Candidate providers include Gemini free/paid tiers, Groq, Cerebras, Cloudflare Workers AI, eligible OpenRouter free models, OpenAI paid API, Anthropic paid API, and optionally approved self-hosted models. Every candidate needs an explicit capability/terms test before it is enabled; a name in the registry is not proof of availability or privacy suitability.

### Routing order (policy-based, not “free at any cost”)

1. Authenticate the user and derive tenant scope.
2. Classify task type, required capability, data sensitivity and risk.
3. Check workspace AI feature entitlement, provider allowlist, privacy rules and remaining budget.
4. Pick the best eligible model under quality, latency, quota and cost policy.
5. Apply bounded timeout/retry/fallback and output limits.
6. Validate output and any tool arguments.
7. Meter usage and record the result/trace.

Never silently switch to paid usage once the tenant's approved budget is exhausted. Never send sensitive data to a free-tier provider unless that exact provider/model/configuration and tenant policy explicitly permit it. Paid does not automatically mean privacy-approved. AI access to finance, HR, payroll, customers, documents and support is permission-filtered.

### Suggested AI rollout

1. Read-only reports/explanations using deterministic server-side aggregates.
2. Redacted document summaries and extraction with human review.
3. Tenant-scoped semantic search on permission-filtered content.
4. Forecast/reorder recommendations with data source and uncertainty display.
5. Draft business actions with preview and human confirmation.
6. Multi-step agents only after AI tool authorization, evaluation, audit, budget enforcement and durable job recovery are tested.

---

## 11. SaaS platform capabilities to build alongside ERP modules

These are backend capabilities shared by modules, not ad hoc frontend conditionals:

- **Workspace lifecycle:** create, suspend, close, archive, export, retention and tenant deletion workflow.
- **Membership/access:** invitations, roles, branch scope, revocation, optional MFA requirements and audited administration.
- **Plans/entitlements:** plan catalog, trial state, enabled modules, quotas, seat counts, storage, API, AI and import/export usage. A payment processor is intentionally abstracted until market/settlement requirements are confirmed.
- **Usage metering:** authoritative per-workspace usage events with idempotent recording for AI requests, files, jobs and any billable limits.
- **Feature flags:** safe staged rollout and tenant-level feature enablement; feature flags never replace backend authorization.
- **Notifications:** in-app plus provider adapters for email/SMS/push; store delivery status, retries and failures.
- **Webhooks/integrations:** signed inbound events, outgoing delivery history, retries, idempotency, replay controls and dead-letter handling.
- **Imports/exports:** background jobs with validation, progress, results, cancellation policy and audit records.
- **File/document management:** private access, size/type constraints, scanning policy, retention, signed URLs and metadata permissions.
- **Observability/operations:** health and readiness, request traces, queue health, spend/usage metrics, alerts, support tooling and incidents.
- **Data portability:** authorized exports, retention policy, privacy requests, deletion/archival and restore drills.

Do not claim any of these complete simply because a link or card is visible in the frontend.

---

## 12. Background jobs and events

Use BullMQ for ordinary retryable work: email/notification delivery, import/export, report snapshots, scheduled recurring invoices, AI document extraction, AI long-running analysis and webhook dispatch. Each job needs a timeout, bounded retry/backoff, idempotent handler, correlation ID, tenant scope, observable terminal failure and replay policy.

Use a transactional outbox when a committed business transaction must later publish a notification, integration event or queue job. Write the business rows and outbox row in the same PostgreSQL transaction. A worker claims/delivers the outbox event and marks status; duplicate delivery must be safe.

Do not route consistency-critical effects only through a delayed worker. The core sale transaction must atomically persist the sale/payment/stock movements/required ledger reference. Notification/email/AI narration can be asynchronous. A user-facing status must distinguish “created,” “processing,” “failed,” “accepted by provider” and “completed.”

Temporal is not required for the first backend version; add it only if multi-day workflows, compensation and long-running orchestration cannot be made sufficiently reliable with the current job model.

---

## 13. Standard API response and pagination policy

Finalize these details in OpenAPI before backend integration tests:

- Use consistent `application/json` envelopes. Choose one canonical list shape—prefer `{ items, nextCursor, total? }` for large/paginated collections—and avoid endpoint-by-endpoint accidental variation. If the current frontend expects a raw array, document it or adapt it explicitly with a compatibility test.
- Standard error shape should align with the existing client parser, e.g. `{ "error": { "code": "...", "message": "...", "details": {} }, "requestId": "..." }`.
- Include safe request ID in error/success metadata or response headers; never expose stack traces or secret/provider payloads.
- Use 400 for invalid input, 401 for no/invalid authentication, 403 for explicitly denied actions where resource enumeration is acceptable, 404 where non-disclosure is required, 409 for state/idempotency/version conflicts, 422 only if consistently adopted, 429 for quotas/rate limits, and 5xx for server/provider outage.
- Standardize timestamp format (ISO 8601 UTC), date-only fields, currency fields, minor units, optional versus explicit `null`, maximum page sizes and filter/sort allowlists.
- Use ETag/version fields for concurrent edits of quotations, orders, invoices, stock counts, payroll runs and any collection replacement.
- Add OpenAPI request/response examples generated from real DTO/domain shapes—not demo business records.

---

## 14. Testing plan and release gates

### Phase 0 — Stabilize contract and frontend first

- [ ] Read current `BACKEND.md`, this handoff and frontend readiness docs.
- [ ] Confirm current `main` commit and the exact ZIP patch already applied; do not layer stale patches over newer code blindly.
- [ ] Re-run `npm ci` (or the project's approved install command), `npm run typecheck`, `npm test`, `npm run build`, `npm run lint` and `npm run test:e2e` where dependencies/browser are available.
- [ ] Resolve all compiler failures without disabling strict TypeScript or hiding unused/optional fields.
- [ ] Resolve OpenAPI duplicate session route; check route/adapter alignment, schema refs, operation IDs, status codes and error envelope.
- [ ] Review generic `replace` safety and add ETag/version support or remove/disable bulk replacement for ordinary users.
- [ ] Freeze the initial contract version and add a contract check in CI.

### Phase 1 — Backend foundation

- [ ] Scaffold NestJS/Fastify API and separate worker entry point.
- [ ] Configure environment validation, structured logging, safe errors, OpenAPI generation/validation and `/health`/readiness.
- [ ] Configure Prisma and Neon PostgreSQL; create first migrations and a reproducible local test DB workflow.
- [ ] Implement verified identity, workspace/branch scope, memberships, RBAC, invitations and tenant isolation tests.
- [ ] Implement CSRF/session/CORS behavior exactly for production frontend origin.
- [ ] Implement audit-event, idempotency-record and transactional-outbox primitives.
- [ ] Test auth/recovery/rate-limits with deployed configuration.

### Phase 2 — Core catalog, stock and sales

- [ ] Product/category creation/update with SKU/barcode and scoped uniqueness.
- [ ] Inventory movement + balance model and stock concurrency tests.
- [ ] Atomic sale completion and split payments; canonical receipt; idempotency.
- [ ] Payment allocation, sale detail, returns/credit notes and refund/stock policies.
- [ ] Workspace/branch-scoped dashboard and core report endpoints.
- [ ] End-to-end tests for checkout, payment, inventory, reports and tenant isolation.

### Phase 3 — Business registers and transactional domains

- [ ] Build procurement/receiving/supplier bill workflows.
- [ ] Build customer/invoice/AR and supplier/AP with payment allocation.
- [ ] Build finance accounts, journal posting/reversals and bank reconciliation.
- [ ] Implement each generic module record contract for lightweight modules.
- [ ] Convert transaction-critical modules from free-form registers to first-class schemas/services as listed in Section 8.
- [ ] Build warehouse, production/quality, CRM, people/payroll and projects in dependency order.

### Phase 4 — Collaboration, Business Tools and SaaS operations

- [ ] Inbox messages/attachments/read state/notifications/task/approval and activity persistence.
- [ ] Approval transitions that call owning module service instead of generic status flips.
- [ ] Private file storage, import staging/validation, export jobs and secure backup/restore.
- [ ] Integration/webhook adapters, event retries, SaaS entitlements and usage metering.
- [ ] Smoke tests against the real deployed backend with at least two test tenants and multiple roles.

### Phase 5 — Multi-provider AI

- [ ] Central AI interface + provider registry + LiteLLM gateway.
- [ ] Data-class policy, per-tenant provider allowlist, free/paid quota rules and budget limits.
- [ ] Provider timeout/rate-limit/fallback/circuit-breaker tests.
- [ ] AI usage metering, safe logs, quality evaluation and spend monitoring.
- [ ] Read-only business explanation and document summarization first; tool actions only with preview/confirmation.
- [ ] Verify that disallowed data never reaches a provider during red-team/negative tests.

### Phase 6 — Production hardening

- [ ] Tenant-isolation/IDOR/property-level access tests on all endpoint families.
- [ ] Concurrency, idempotency replay, transaction rollback and migration recovery tests.
- [ ] Security scan, secret scan, dependency check, rate-limit and abuse testing.
- [ ] Restore a database backup and private file backup in a non-production environment.
- [ ] Test queue failure/dead-letter/replay, external provider outages and billing/AI budget exhaustion.
- [ ] Confirm API and worker health, tracing, alerts, runbooks and incident ownership.

### Required E2E test matrix

| Test journey | Must prove |
|---|---|
| Tenant isolation | Tenant A cannot read, search, update, export, attach to or infer Tenant B records even when the IDs are known |
| Role authorization | Read, create, approve, post, refund, export and admin actions vary by server permissions, not just UI visibility |
| Product → checkout | Product/barcode resolves from DB; correct stock/price/tax; sale is persisted exactly once |
| Split payments → money account | Payment allocations sum to the valid amount, outstanding balance is correct, cash/mobile/bank records are not falsely marked settled |
| Sale → stock → dashboard | Movement/balance and report metrics reconcile to source records after refresh and from another user/device |
| Return → refund → stock | Cannot return too many units; restock decision and payment/credit state propagate correctly |
| Procurement → receiving → AP | PO does not itself raise stock; accepted receipt raises stock; approved invoice creates AP; payment and bank reconciliation work once |
| Journal posting | Journal balances, posting is immutable, reversal is traceable and report totals reconcile |
| Workspace switch | Queries from the prior branch/workspace are invalidated or hidden; no cached data leaks into new scope |
| Inbox/approval | Only participants/authorized approvers can read/decide; decision changes source document through its owning service |
| File upload/download | Unauthorized user cannot retrieve by guessing ID; signed URL is short-lived; oversized or invalid file is rejected |
| Import/restore | Malformed input is rejected; preview reports errors; successful apply is audited/idempotent; restore cannot cross tenants |
| AI policy and spend | Denied data/provider combination is blocked; free-quota exhaustion behaves safely; paid spend cap cannot be bypassed by fallback |
| Provider outage | AI unavailable/queued/fallback state is honest; backend business transaction is not duplicated by a provider retry |

---

## 15. Implementation order by dependency (do not build randomly)

1. Auth/workspace/branch/membership/permissions/audit/idempotency.
2. Product/category/unit/tax/pricing base tables.
3. Inventory locations, movement ledger, balances, batches and reservations.
4. Customers, suppliers and source/contact relationships.
5. Sale completion, payment allocation, return/credit/refund.
6. Procurement request/RFQ/quote/PO/receipt/supplier bill/payment.
7. Finance chart/account/journal/cash session/bank reconciliation/expenses/assets/budgets.
8. Quotes/orders/invoices/delivery/picklists/packages/recurring invoices.
9. CRM leads/opportunities/campaigns/sales teams and support.
10. BOM/work order/job card/quality production and inventory consumption.
11. Employees/attendance/leave/timesheets/payroll with restricted roles.
12. Tasks/approvals/inbox/notifications/activity, files/imports/exports/integrations.
13. Reports/search/dashboard derived from authoritative sources.
14. SaaS plans/entitlements/usage metering and tenant AI configuration.
15. AI provider gateway, retrieval, read-only assistance, then controlled tools.

This is a dependency order, not a claim that all modules must wait until the very end to have a screen. Build each service behind its contract and test cross-module workflows as soon as its dependencies are present.

---

## 16. Non-negotiable build rules

- Do not rebuild or reorganize the frontend for convenience; preserve `lexa-frontend/` and its routes/adapters unless a proven contract mismatch requires a small intentional change.
- Do not remove modules or products/features just because they do not yet have a dedicated backend table.
- Do not seed fake/demo business data in development/prod migrations. Test fixtures belong in test-only setup and isolated test DBs.
- Do not make browser-local storage a fallback for failed production API calls.
- Do not give AI direct SQL/database access or allow it to bypass domain services.
- Do not store API/provider keys in frontend bundles or return integration secrets to the UI.
- Do not let one module write around another module's business invariants.
- Do not edit/delete posted financial history or audit history through generic CRUD.
- Do not equate recorded external payments with successful money transfer.
- Do not equate a tax document existing with acceptance by a tax authority.
- Do not automatically switch from disallowed free AI to paid AI in a way that violates privacy policy or the tenant's spending cap.
- Do not alter `.github/workflows/extract-frontend.yml` to work around missing workflow permission. Keep authorized pipeline files intact.
- Do not declare ready based only on GitHub ZIP extraction or a single green deployment check; run all relevant gates and deployed E2E tests.

---

## 17. Who owns what

| Concern | Owner / source of truth |
|---|---|
| Visible layout, routing and interaction states | Existing React frontend |
| API shapes, path, DTO and response contract | `openapi/backend-contract.yaml` plus contract tests |
| Identity proof and session validity | Supabase Auth (if retained) / approved identity provider, verified by backend |
| Authorization/tenant access | Backend authorization service; optionally reinforced by tested PostgreSQL RLS |
| Business records, stock movements, payments, ledgers, settings and audit | Neon PostgreSQL through backend application services |
| File bytes | Private object storage, with authorization metadata in PostgreSQL |
| Queued work/retries | Redis + BullMQ and worker processes |
| AI model access/routing/budgets | LEXA AI orchestration + LiteLLM; tenant usage ledger stored in PostgreSQL |
| External provider status | Provider adapter plus persisted request/reference/status and reconciliation |
| Production deploy/runtime configuration | Vercel for frontend, backend API/worker host, Neon, Supabase and provider secret stores |

---

## 18. Final acceptance checklist — before calling the backend started successfully

- [ ] `BACKEND.md` and this handoff are in the repository as the authoritative implementation documents.
- [ ] Current frontend branch/commit is confirmed; stale ZIP patches are not layered blindly.
- [ ] Frontend `typecheck`, tests, production build and relevant browser E2E are green.
- [ ] OpenAPI duplicates/mismatches are resolved; contract check is part of CI.
- [ ] Backend API and worker are scaffolded with validated configuration, health/readiness, logging, migrations and CI.
- [ ] Auth, workspace/branch context, roles and tenant-isolation tests pass.
- [ ] Product → inventory → checkout → payment → return flows round-trip against PostgreSQL and reconcile.
- [ ] Procurement/receiving/AP and finance posting/reconciliation work end to end.
- [ ] All visible module screens have an explicit integration state: live endpoint, domain model, permissions, dependencies and acceptance test; no module is silently left mocked.
- [ ] Business Tools, backup/restore, files, collaboration, audit, search and reports have real persistence and authorization.
- [ ] Multi-provider AI is behind a backend policy/gateway, with privacy, quota, budget, fallback and tool-action tests.
- [ ] The deployed frontend and API work together from a real browser, with exact-origin CORS/cookies and no secrets in client assets.

**Final status statement:** This file is a build handoff, not proof that any backend endpoint or database migration has already been implemented. Start with Phase 0, then build the backend in the dependency order above. A module is complete only when the full E2E acceptance path and security tests pass.
