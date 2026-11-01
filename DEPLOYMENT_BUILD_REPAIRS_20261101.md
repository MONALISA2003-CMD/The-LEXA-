# LEXA deployment build repair record — 1 November 2026

## Incident scope and source history

Reviewed the hosted failures across commits `e8cff2f`, `72e82dd` and `34b0a58`. The GitHub comparison confirms that `34b0a58` is two commits ahead of `72e82dd` and that the current deployed source contains the previous Dexie migration and Fastify package-name corrections. The newest logs are for `34b0a58`.

## Full failure chronology

### Earlier Vercel failure — commit `e8cff2f`

The original Vercel deployment passed its existing 97 tests but failed at TypeScript checking:

- `SalesWorkflow.getPaymentReport` was missing from the local workflow implementation.
- `setPreviewRows` and `setReviewNotes` were declared but unused.
- The palette prebuild did not cover the `/operations` route.

**Status:** these source defects were repaired in the previous handoff. The later `34b0a58` log confirms that the prebuild now completes and the frontend test suite passes.

### Earlier Render build failures — commit `e8cff2f`

Nest compilation originally failed on the import/restore typing issues and the Prisma accounting-period field mismatch:

- An undeclared `sha` reference in import preview now uses the existing SHA-256 `hash` helper.
- The mapped import row explicitly includes its optional `before` snapshot.
- A ZIP-only branch no longer compares a narrowed `'zip'` value to `'csv'`; JSONL archive members receive a static `.jsonl` name.
- Restore validation uses explicit `string` sets/arrays.
- Download URL callback parameters have explicit types.
- The restore dependency graph guards optional `Map.get` values before mutating sets.
- `validateMappedRows` preserves the discriminated action union instead of widening to `string`.
- The accounting-period query uses Prisma's `startsOn` field, not the nonexistent `startDate` field.

**Status:** the current Render log confirms that Prisma generation, the backup inventory check and `nest build` all pass.

### Vercel prebuild regression — commit `72e82dd`

The new payment/credit report queried the Dexie `returns` table by `[workspaceId+branchId]`, but the v1 store did not define that compound index.

**Repair:** `lexa-frontend/src/data/local/database.ts` now adds a Dexie v2 schema migration that creates the missing index without deleting existing return records. A migration test opens a v1 database containing a return and verifies it remains queryable. The report test also exercises a partial return.

**Hosted confirmation:** the Vercel log for `34b0a58` now passes all **99 tests across 23 files**, including `database.test.ts` and `sales-workflow.test.ts`.

### Render package-install 404 — commit `72e82dd`

The backend manifest requested `@fastify/raw-body@^5.0.0`, which npm cannot resolve. The actual plugin package is `fastify-raw-body`; v5 supports Fastify 5.

**Repair:** the manifest and imports use `fastify-raw-body@^5.0.0`, with route-specific raw-body capture for `/api/v1/webhooks/resend` and a 1 MiB body limit.

**Hosted confirmation:** the `34b0a58` Render log shows `npm install` succeeded (778 packages added), Prisma Client generation succeeded, and the backend Nest build completed.

### Current Vercel TypeScript failure — commit `34b0a58`

Vercel now reaches `tsc -b` after passing prebuild and tests. TypeScript reports four diagnostics in two files:

1. `InboxPage.tsx`: the filter object explicitly sets optional `cursor`, `type`, `from` and `to` properties to `undefined`. With `exactOptionalPropertyTypes`, those properties must be omitted when absent.
2. `RecurringInvoicesPage.tsx`: a derived `selected` variable is unused (`TS6133`).
3. `RecurringInvoicesPage.tsx`: optional `productId` and `taxCodeId` properties are assigned `undefined` instead of being removed.

**Repair:** `InboxPage` now conditionally spreads only defined filter properties. The unused derived value was removed. A dedicated line-field updater deletes optional `productId`/`taxCodeId` keys when their inputs are cleared, rather than persisting explicit `undefined` values. This follows TypeScript's documented exact-optional semantics.

### Current Render startup crash — commit `34b0a58`

Render successfully installs packages, generates Prisma Client, passes `npm run build`, and enters the deploy/start phase. The deployed process then crashes with:

`FastifyError: Content type parser 'application/json' already present. (FST_ERR_CTP_ALREADY_PRESENT)`

**Root cause confirmed against source:** `fastify-raw-body` v5 calls `fastify.addContentTypeParser('application/json', ...)` whenever `encoding: false` is configured. Nest's Fastify adapter independently registers its built-in JSON parser during `app.init()`. The plugin's custom parser is therefore registered first and Nest's parser collides at startup. This matches the exact stack trace in the Render log.

**Repair:** keep the Fastify v5 plugin and the route allowlist, but configure `encoding: 'utf8'`. In this mode the plugin captures the route-scoped raw body through its `preParsing` hook without installing an extra JSON parser. Nest 11.2.5's route-path factory applies the global `api/v1` prefix before Fastify receives the route, so `/api/v1/webhooks/resend` is the correct route-filter entry. The webhook controller now normalizes the plugin's `string | Buffer` capture into a `Buffer` before checking the size and verifying the Svix signature. A regression test verifies UTF-8 round-tripping (including non-ASCII text) and the active plugin configuration.

The built-in Nest `rawBody: true` option is also documented for Fastify, but it captures bodies globally. The chosen Fastify plugin keeps the raw-body copy limited to the webhook route and avoids that memory overhead.

## Non-blocking warnings and operational follow-ups

### npm dependency audit

The Render install reported **51 vulnerabilities (1 low, 45 moderate, 5 high)** and deprecation warnings for `cron-parser@4.9.0`, OpenTelemetry trace/Jaeger packages and `uuid@9`. These warnings did not stop installation or compilation. The GitHub tree at `34b0a58` contains no npm lockfile for either app, so the exact resolved dependency tree and package-by-package audit report are not preserved in source. Do not run `npm audit fix --force` blindly: it may introduce incompatible major upgrades. Generate and commit lockfiles in a network-enabled environment, capture `npm audit --json` for frontend and backend separately, then update only affected direct/transitive dependencies and run both full builds/tests. This report does not claim the 51 advisories have been remediated.

### PostgreSQL SSL mode warning

The Render log warns that the installed `pg-connection-string`/`pg` release currently treats `prefer`, `require` and `verify-ca` as aliases for `verify-full`, but a future major release will change those semantics. This was not the startup cause. The safe example config now uses `sslmode=verify-full`, which explicitly preserves hostname verification. Update Render's `DATABASE_URL` separately by changing only the SSL query parameter and preserving its Neon host, credentials and other options; the live secret was not changed in this package.

### Port and migration observations

- `No open ports detected` occurred after the Node process crashed before `app.listen()` completed. The source already binds to `0.0.0.0` on `process.env.PORT`; re-check port detection after the parser fix is deployed.
- The Render log shows 29 migrations found, four migrations applied successfully (`20261101120000`, `20261101130000`, `20261101140000`, `20261101170000`), followed by `No pending migrations`. Do not roll these migrations back or reset the Neon database as a response to this application startup error.
- Render's free-instance spin-down message is an availability/latency notice, not a failed build.
- The Render dashboard's `Build not found` text is a dashboard/build-history lookup message and is not the logged container failure.

## Validation evidence from this repair workspace

Passed:

- Backend automated tests: **76 passed / 0 failed** (includes a raw-body UTF-8 regression test and route/plugin configuration checks).
- Frontend TypeScript/TSX syntax transpilation: run against the current source after the fixes; results are in `VALIDATION_RESULTS_20261101.txt`.
- Backend TypeScript syntax transpilation: run against the current source after the fixes; results are in `VALIDATION_RESULTS_20261101.txt`.
- Backup inventory: **154 table decisions / 137 discovered schema and migration references covered**.
- OpenAPI coverage: **296 operations / 235 routes exact match**.
- Route-to-adapter coverage: **17/17**.
- Ledger workflow coverage: **9/9**.
- Frontend auth, module-completion, palette/route-coverage and build-origin prebuild scripts: run after changes; results are in `VALIDATION_RESULTS_20261101.txt`.
- Focused strict TypeScript check of exact-optional query construction and optional line-field deletion: run after changes; results are in `VALIDATION_RESULTS_20261101.txt`.

Not verified here:

- Full frontend `npm test`, `tsc -b` and `vite build`; dependencies are absent locally.
- Full backend dependency install, Nest build and actual Render process startup; dependencies are absent locally and this runtime cannot resolve `registry.npmjs.org`.
- Live Fastify/Nest integration smoke test, live Vercel/Render redeploy, Playwright/E2E, external webhook delivery, worker/Redis/ClamAV/R2, telemetry export, or restore drill.
- Package-by-package triage/remediation of the 51 npm audit advisories; the Render log did not include the audit JSON and the repository has no lockfiles.

The fixes are source- and unit-tested where stated, but this archive is **not yet a verified green hosted deployment**. Final confirmation requires a new Vercel build completing tests, TypeScript and Vite, and a new Render deploy starting successfully, binding its port and passing health checks. Existing Neon migrations must remain applied.
