# LEXA deployment build repair record — 1 November 2026

## Newly surfaced failures — commit `72e82ddbe73150d85a4be2d371df9afb6de82fb4`

### Vercel `lexa_review`

The Vercel log shows that `npm install` and all four prebuild steps completed, but `npm test` stopped the build before `tsc -b` or `vite build`. One new regression test failed because `localSalesWorkflow.getPaymentReport()` queried `returns` by the Dexie compound key `[workspaceId+branchId]`, while the v1 `returns` store only declared `[workspaceId+saleId]`.

**Repair:** `lexa-frontend/src/data/local/database.ts` now retains the complete v1 schema and adds a v2 schema migration that creates `[workspaceId+branchId]` on `returns`. Existing return rows are retained while IndexedDB builds the additional index during normal Dexie upgrade. A new migration regression test constructs a v1 database with a stored return, opens it through the current schema, and verifies that the return remains queryable through the new compound index. The payment-report test now records a real partial return and checks gross sales, returns, net sales, receipts and remaining credit.

### Render `lexa-backend-api-live`

The Render log stopped at `RUN npm install` because `backend/package.json` requested `@fastify/raw-body@^5.0.0`, which returns npm 404. The actual Fastify raw-body plugin is published as `fastify-raw-body`; its v5.0.0 release explicitly supports Fastify v5.

**Repair:** the backend dependency is now `fastify-raw-body@^5.0.0`; `backend/src/main.ts` and the webhook controller import/use that package. Raw-body capture is limited to `/api/v1/webhooks/resend` rather than duplicating request bodies on every API route. The 1 MiB maximum is set as Fastify's `bodyLimit`, which is the option the raw-body plugin reads from the route configuration; the unsupported `limit` plugin option was removed. The controller uses the package's `FastifyRequest.rawBody` type augmentation and still rejects a missing or oversized buffer before signature verification. A backend contract test now guards the package name, Fastify 5 route scope, body limit and typed access against regression.

## Earlier Vercel errors — deployment `dpl_AUiD1EnwcYJLNss9p7zPfcpbLvYJ`

The earlier Vercel log showed 97 tests passing before `tsc -b` failed on three issues:

- `SalesWorkflow.getPaymentReport` was missing from the local workflow implementation.
- `setPreviewRows` was declared but unused.
- `setReviewNotes` was declared but unused.

Those issues remain repaired: the local payment/credit report is implemented, the import preview loads rows through the authenticated preview-row endpoint, and reviewer notes are editable and passed to the independent reviewer API. The palette prebuild's `/operations` route-coverage error is also fixed.

## Earlier Render TypeScript errors — deployment `dep-dbjibr2qphnc73e1vqfg`

The earlier Nest build identified these source errors, which remain repaired:

- An undeclared `sha` reference in import preview now uses the existing SHA-256 `hash` helper.
- The mapped import row explicitly includes its optional `before` snapshot.
- A ZIP-only branch no longer compares a narrowed `'zip'` value to `'csv'`; JSONL archive members receive a static `.jsonl` name.
- Restore validation uses explicit `string` sets/arrays.
- Download URL callback parameters have explicit types.
- The restore dependency graph guards optional `Map.get` values before mutating sets.
- `validateMappedRows` preserves the discriminated action union instead of widening to `string`.
- The accounting period query uses Prisma's `startsOn` field, not the nonexistent `startDate` field.

## Verification evidence and limits

Passed in this runtime:

- Backend test suite: **75 passed / 0 failed**.
- Frontend TypeScript/TSX syntax transpilation: **126 files / 0 syntax errors**.
- Backend TypeScript syntax transpilation: **50 files / 0 syntax errors**.
- Backup inventory: **154 table decisions / 137 discovered schema and migration references covered**.
- OpenAPI coverage: **296 operations / 235 routes exact match**.
- Route-to-adapter coverage: **17/17**.
- Ledger workflow coverage: **9/9**.
- Frontend auth, module-completion, palette/route-coverage and build-origin prebuild scripts executed successfully.
- Static checks confirm that no `@fastify/raw-body` dependency or obsolete raw-body `limit` option remains.

Not verified in this runtime:

- The new Vitest database-upgrade and revised sales-report tests were not executed locally because `vitest`, `dexie` and `fake-indexeddb` are not installed in this workspace.
- Full frontend `npm test`, `tsc -b` and `vite build` were not run.
- Full backend dependency installation and Nest build were not run. The npm metadata probe timed out because this runtime cannot resolve/reach the npm registry; the earlier failed install log identifies the invalid package name as the direct Render cause.
- `verify-schema-integrity.mjs` could not run because `pg` is not installed.
- No live Vercel or Render redeploy, Playwright/E2E test, database migration against staging/production, Resend delivery/webhook, worker/Redis/ClamAV/R2, telemetry export or restore drill was performed.

The supplied hosted logs are for commit `72e82dd...` and are the source evidence for the two newest fixes. The earlier hosted logs are for commit `e8cff2f...`. This archive contains the source repairs, but it is **not yet a verified green hosted build**. The next required confirmation is a Vercel build completing `npm test`, `tsc -b` and `vite build`, and a Render build completing npm install, Prisma generation and `nest build`.
