# LEXA — Purchasing, Projects, Service, Team/Payroll, Production/Quality Release Audit

Date: 2026-11-04. Source target: `MONALISA2003-CMD/The-LEXA-` at reference `9f0b20c97d585e1f44f86bd0b7d66f4d0f57e717`. No production data was changed.

## Root cause investigated

Render `lexa-backend-api-live` logs show authenticated HTTP GET requests to `/api/v1/workspaces/.../branches/.../workstream6/projects`, `/projects/tasks`, `/support/cases`, `/people/employees`, and `/people/attendance` returning HTTP 404. A read-only Neon production check verified that the referenced tenant and branch exist and have an active membership, and the 14 relevant core tables are present. Thus the frontend messages are not evidence that the business and branch were removed. The suspected root issue is request-local tenant RLS context not being reliably present when controller subscriptions execute. The fix scopes controller observable subscriptions in `AsyncLocalStorage`, and scopes guard membership/branch/permission checks in `runWithTenantContext`, preserving tenant and branch authorization. **Only deployment plus authenticated retry can prove that the production 404s are resolved**; other causes such as database role grants, per-user branch scope, stale server deployment, or missing migration remain possible.

## Implementation included

### Purchasing and accounts payable
- Preserve existing purchasing APIs as authoritative; reject generic workflow bypasses as established by earlier release source.
- Accounts Payable displays `Unavailable` rather than invented UGX 0 balances after failed loads, exposes retry, blocks order-related actions on failed lookups, and uses compact purchasing stages on mobile.
- Applied premium Burnished Bronze (`#8F4B18`) to embedded Accounts Payable actions and headings; removed a fake preset bank account value.

### Projects, tasks, service
- Preserve dedicated indigo (`#4338CA`) project and teal (`#0F766E`) service workflows with related customer, employee, procurement, costs, activity history, and support deadlines.
- Do not render project, task, or support KPI counts while the primary API query is still unresolved or failed. Display actual request failure in the corresponding operational view.

### Team and payroll
- Applied Regal Mulberry (`#8B225A`) accent to forms, navigation, dashboard and interactions.
- Employee, shift, attendance, leave, timesheet and payroll displays include visual status distributions derived exclusively from successful authenticated API responses; do not display false zero totals when data cannot load.
- Collapsible forms improve mobile scanning; error retry invalidates scoped HR queries.
- Timesheet project and project-task fields now use authorized backend catalogues instead of typed IDs. Payroll calculation and accounting remain backed by the existing approved flows; no direct bank transfer is claimed.
- Sensitive compensation stays role-restricted in existing backend; no extra AI or sample data is introduced.

### Production and quality
- Replaced generic pages for BOMs, work orders, job cards, and quality with dedicated source-backed operational views.
- New branch-scoped GET APIs list manufacturing job cards with steps, and inspections with check results and source references. Existing backend operations handle material reservations, job-card steps, stock consumption/receipts, quality quarantine/release, and ledger entries.
- The inspection list uses the real `inspected_at` column and exposes `created_at` as the UI-compatible alias; query was checked with Neon EXPLAIN.
- Added Industrial Blaze theme (`#C2410C`, bright accent `#FF7A1A`), workflow timelines, production state metrics, status bars, and mobile layout.
- Material, warehouse, inspection-plan, order, and catalogue lookup failures block operational forms and cannot be mistaken for empty records.
- Non-staged AI features and demo values are not part of these modules.

## Validation conducted

- `npm test` in `backend`: **168 passed, 0 failed** (includes 3 new regression checks for tenant context, manufacturing/quality routing, and failure-state handling).
- `python3 backend/scripts/check-openapi-coverage.py`: **367 operations across 296 routes matched; no missing or orphan operations**.
- `python3 backend/scripts/check-route-adapter-coverage.py`: **17 remote adapters matched**.
- TypeScript parser (`typescript`): **240 TS/TSX source files, 0 syntax errors**.
- Actual frontend source-generation scripts (security, module completion, palette, TypeScript-origin fix) executed successfully without overwriting the new pages.
- Read-only Neon EXPLAIN passed for manufacturing BOM lists, work orders, job cards, quality plans and corrected inspection lists; no writes were made to Neon.
- Root-level ZIP verified for required roots/manifest, safe paths, no wrapper, no embedded ZIPs, no `node_modules`, no `.github` source overrides, no live `.env` files, and no prohibited package manifests.

## Unverified — do not treat as complete production acceptance

- Full `npm ci` / `npx prisma generate` / `npx prisma validate` / Nest production build, frontend `vitest run`, `tsc -b`, Vite build, and authenticated browser E2E test require dependency installation and/or protected credentials; local environment did not have the registry dependencies. `tsc -b` locally stops on missing `vite/client`, `vitest/globals`, and `node` type declarations. **Source parser checks do not establish TypeScript type correctness.**
- Authenticated Render/Neon access under the actual CEO session, full workforce payroll posting, serial-tracked manufacturing, contract management, supplier portal, advanced scheduling, and field-service workflows still require staging end-to-end acceptance and are not claimed fully implemented here.
- The new interceptor is a targeted fix for a suspected RLS context propagation defect. Its effect must be verified on staging before promotion, especially with Neon pooled connections and runtime role settings.
- No live GitHub `main` push, production Render deploy, Vercel release, or destructive database operation was performed for this package. Upload the archive as **one root-level ZIP** using the existing GitHub Actions import workflow, then inspect both build jobs and perform authenticated staging smoke tests.

## Required go/no-go scenarios

1. Signed-in owner opens each purchasing, projects, tasks, support, people/payroll, and manufacturing screen; no unexplained 404 or zero-as-error result.
2. Cross-tenant user and branch-restricted employee are denied unauthorized reads and writes.
3. Timesheet approval posts labour costs to the correct project, payroll run and ledger, with no duplicate lines on retry.
4. Procurement purchase request → supplier quotation → purchase order → goods receipt → supplier invoice → credit/payment reconciles.
5. BOM → work order → reservation → operation → output → quality hold/pass/fail → available inventory and ledger reconciles, including rejection and retry cases.
6. Mobile and desktop, light/dark theme and screen-reader checks pass; warnings and success statuses have meaningful contrast, not merely colour.
