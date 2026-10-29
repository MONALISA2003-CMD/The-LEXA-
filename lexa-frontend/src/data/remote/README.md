# LEXA REST API adapter

The REST adapter implements the same typed repository and workflow boundaries as the explicit local-development adapter. It never falls back to browser storage after a 401, network error, missing URL, malformed payload or failed write.

## Configure

Set `VITE_DATA_PROVIDER=api` and `VITE_API_BASE_URL=https://your-api-origin` in the Vercel project build environment. The client appends `/api/v1` unless the supplied base URL already ends in that path. For local-only development, create an ignored `.env.local` with `VITE_DATA_PROVIDER=local`.

All `VITE_*` values are client-visible after bundling: configure only a public API origin, never database credentials, signing keys, client secrets or privileged API tokens. Sessions should use a server-issued Secure, HttpOnly, SameSite cookie; the client uses `credentials: include`.
For cross-site deployment (for example, a `vercel.app` frontend talking to a separately hosted API), configure the session cookie as `SameSite=None; Secure`, allow the exact frontend origin in CORS, set `Access-Control-Allow-Credentials: true`, return `Vary: Origin`, and answer preflight requests for `Content-Type`, `X-CSRF-Token`, `X-Request-Id` and `Idempotency-Key`. Do not use wildcard origins with credentials. Use `SameSite=Lax` where the frontend and API are genuinely same-site.

## Contract

`openapi/backend-contract.yaml` is the versioned contract for the backend team. It describes workspace/branch access, catalogue, stock, sales, reports and generic module registers. The backend does not exist merely because this contract and adapter exist: endpoints, database migrations, sign-in/session issuance, authorization, and integration tests must be implemented server-side.

## Required server guarantees

- Authenticate each request; reject expired/absent sessions and return the standard error envelope.
- Authorize every workspace, branch, record, field and business action for the authenticated principal. Never trust IDs selected by the browser.
- Use database transactions for sale completion, payment allocation, stock changes and returns. Recompute totals and stock on the server; ignore client-trusted totals.
- Use `Idempotency-Key` for mutating business actions and store request/result associations server-side.
- Validate all input and transitions on the server, including quantity, money, currency, tax treatment, status transitions and ownership.
- Record an append-only audit trail for consequential writes. Do not claim that external transfers, EFRIS/URA submissions, email, carrier events or statutory payroll worked until those specific integrations return authoritative outcomes.
- Return JSON errors as `{ "error": { "code": "...", "message": "...", "details": {} }, "requestId": "..." }` and expose request IDs to operators/support.

Never store session bearer tokens in localStorage. Keep sensitive secrets out of Vite client environment variables. Follow OWASP API controls for object/function authorization and authentication.
