# LEXA frontend completion and backend handoff

## Delivered in this release

- Rebuilt Overview structure with workspace/branch context, period selector, owner/sales/finance/operations/people views, current saved-record KPIs, backend-calculated trend and comparison charts, sales-channel mix, stock-health breakdown, exception list, business activity, recent transactions, and clear unavailable/empty states.
- Added reusable SVG visualisations with accessible labels, tabular value disclosure, empty states, comparison series, and safe handling of missing values. No demo chart points are generated.
- Added Inbox & Collaboration with direct/group/record-linked conversations, message search, attachments, reactions, tasks with list/calendar views, approval decisions, notifications, and server-attributed activity history.
- Added a contextual conversation panel inside module record details and sale details.
- Added a notification unread badge in the global application shell, periodic refresh for collaboration/notifications, and Ctrl/Cmd+K global search.
- Added a reusable barcode capture control for checkout, product setup, stock movement, and relevant operational module registers. Camera support falls back to manual/hardware scanner input when browser decoding is not available.
- Applied the shared data-table pattern to product, sales, inventory balance/movement, task and activity lists, including sort, pagination, column visibility, row selection and CSV export.
- Added persisted per-browser saved views for operational module filters.
- Expanded `openapi/backend-contract.yaml` for the features above. The OpenAPI file is the frontend/backend agreement; it is not an implementation of the server.

## Production configuration

Set `VITE_DATA_PROVIDER=api` and `VITE_API_BASE_URL` to the real API origin in the deployment environment. Vite exposes `VITE_*` values to the browser, so do not put secrets in them. Authentication, authorization and all sensitive business rules must stay server-side.

## Backend endpoints needed by this UI

- `GET /workspaces/{workspaceId}/branches/{branchId}/analytics/overview?period=...&compare=true` for trend points, previous-period data, KPI comparisons, channel mix, stock health, exceptions and activity.
- `GET /workspaces/{workspaceId}/search?q=...&branchId=...&limit=...` for permission-filtered global search results with internal LEXA route destinations.
- Inbox threads/messages, linked record references, message attachments, emoji reactions and read markers under `/workspaces/{workspaceId}/inbox/...`.
- Task list/create/status update, pending approvals/decision, notifications/read markers, and server-attributed activity endpoints under `/workspaces/{workspaceId}/...`.
- The existing attachment upload/download contract for secure message files. Downloads must be permission checked and should use authenticated or expiring URLs.

## Server-side requirements

- Authenticate every request; validate workspace, branch, record, conversation, attachment and participant access on every endpoint.
- Enforce CSRF protections for cookie-authenticated mutations, validate idempotency keys, and keep a durable audit trail for sensitive operations.
- Validate all payloads, prevent duplicate/unauthorised reactions and messages, limit message/file sizes, scan uploaded files according to the deployment's security policy, and generate safe internal search destinations.
- Compute accounting/stock/analytics figures from authoritative saved records. Never trust the browser to authorise a transition, post a journal, approve a request, or derive the final financial truth.
- Optional server-sent events or WebSocket delivery can improve chat/notification latency; the current UI also uses bounded polling so it can work with a REST backend first.

## Verification status

Static verification in the build workspace: TypeScript/TSX transpile syntax and relative imports pass; CSS parses; OpenAPI YAML parses with unique operation IDs and no missing component references; all 56 catalogue modules have empty initial record arrays; build generators ran successfully and are intended to remain idempotent.

The dependency installation timed out in the available environment. Therefore a full `tsc -b`, Vitest, Vite production build and browser end-to-end run were not completed here. Run those checks in CI after extraction and before considering the release end-to-end verified. No production backend has been provisioned by this frontend release.
