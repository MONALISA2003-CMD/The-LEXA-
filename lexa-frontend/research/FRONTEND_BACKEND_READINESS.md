# LEXA Frontend / Backend Readiness Review

## Scope and conclusion

This pass prepares the frontend to talk to a real, versioned API. It removes built-in sample register rows, separates local-development adapters from production API mode, adds typed REST adapters, an OpenAPI contract, request/error handling, cookie-session auth screens, backend status feedback and no-fallback semantics. This repository still contains no deployed backend implementation. A frontend-only patch cannot prove end-to-end business flows until a server implementing the contract is configured and exercised.

## Findings addressed

- **Data authority:** production defaults to the API provider; a network error, 401, malformed response or absent API URL does not silently route business writes to browser storage. Local IndexedDB/localStorage is explicitly device-only development mode.
- **No seeded business rows:** module catalogue definitions start empty. New forms do not prefill invented customers, quantities, amounts or tax rates. Verified records must come from an API response or be entered by an authorized user. Existing device-local data is not assumed to have synchronized to the server.
- **Provider consistency:** workspace, product, inventory, sale, dashboard, module-register, report and Business Tools pathways have explicit API/local boundaries. API mode does not record a fake local audit event as if it were server-side.
- **Authentication:** sign-in, sign-out and password recovery/reset call the real API adapter. Credentials and reset tokens are not persisted in localStorage. Expired sessions are surfaced, not hidden.
- **Operational behavior:** requests include request IDs, bounded timeouts, credentialed sessions, CSRF token headers for unsafe methods and idempotency keys for selected consequential writes. Errors are surfaced with retry guidance.
- **Contract-first integration:** `openapi/backend-contract.yaml` defines versioned API paths, schemas, status/error behavior and workspace/branch-scoped record operations. The server must still implement these contracts.
- **Tax/compliance caution:** tax thresholds have no invented default values. User-entered threshold values are configuration aids, not an official legal determination or a tax submission.

## Benchmark principles applied

The implementation follows common production-client patterns: one API client and typed repository boundaries rather than fetch logic scattered through UI pages; contract-defined routes and payloads; cookie-based session handling instead of browser-persisted bearer tokens; visible loading/error states; idempotency for retried business writes; and explicit server-side authorization expectations. The server must follow OWASP API security controls for object/function authorization, authentication and property-level access.

Vite exposes `VITE_*` values in built client assets. Only a public API base URL belongs in those variables; database passwords, signing keys and privileged credentials must remain server-side.

## Backend implementation requirements

1. Implement every route in the OpenAPI document and return the documented schemas/envelopes.
2. Persist data in a real database and apply authenticated workspace/branch/object authorization on every request. Never rely on hidden UI buttons for access control.
3. Use database transactions and recompute prices, stock, totals, receivables and refunds server-side. A UI status change must not imply a posted ledger entry or external transfer.
4. Configure CORS for the exact production frontend origin. For cross-site cookie deployments use `SameSite=None; Secure`, credentialed CORS and CSRF validation; do not combine wildcard origins and credentials.
5. Implement password reset with short-lived, single-use tokens and generic public responses that do not disclose whether an email exists; rate-limit authentication and recovery endpoints.
6. Make imports/backups validated and bounded. Restore must be transactional, authorized and audited; attachment download must enforce object permissions and avoid public storage URLs.
7. Add server integration tests for unauthorized access, cross-tenant IDOR, malformed input, race conditions, duplicate idempotency keys, transaction rollback, CSRF failure, timeout/error envelopes and backup restore.

## Acceptance checklist before calling LEXA end-to-end ready

- [ ] Set Vercel `VITE_DATA_PROVIDER=api` and the actual public `VITE_API_BASE_URL`.
- [ ] Backend health and authenticated session tests pass in the deployed environment.
- [ ] Workspace creation, branch selection, product CRUD, stock movement, sale completion, split payments and returns round-trip to the database.
- [ ] Module register create/edit/status operations round-trip across devices/users with correct authorization.
- [ ] Reports match server-authoritative records; no client-generated totals are treated as statutory/accounting records.
- [ ] Business Tools uploads, imports, cash-ups and backup/restore are permission-checked and audited on the server.
- [ ] `npm run typecheck`, `npm test`, `npm run build` and browser E2E tests pass in CI with installed dependencies.
- [ ] Deployed smoke tests confirm failed API calls never create local duplicates or show misleading success states.

## Validation performed for this frontend-only patch

Static TypeScript/TSX transpilation, Python source syntax, OpenAPI YAML/structure/path-parameter checks, API route-to-contract checks, generator rerun/idempotency checks and ZIP integrity checks are performed where reported in the release handoff. The full semantic TypeScript check, Vitest, production build and browser E2E suite require project dependencies; they are not represented as passing unless run in CI. Backend end-to-end acceptance remains blocked until an API server exists and is configured.
