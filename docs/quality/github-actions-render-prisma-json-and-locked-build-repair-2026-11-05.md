# LEXA source-refresh / Render incident and repair — 5 November 2026

## Scope and evidence

Affected GitHub workflow: `Refresh LEXA from a clean repository ZIP`, run `42036319180`, job `127275315817`; checkout before import: `c4d2e94a8b838a99ec83f41b87efe913774697ca`. The job imported the 708-file Phase 5–9 source ZIP, passed repository layout and all **332/332** backend tests plus catalogue/API checks, then failed in `nest build` with two TypeScript diagnostics at `backend/src/commerce/equipment-service.controller.ts:182`. The frontend and source-commit steps were therefore **skipped**. This incident is **not** evidence of a frontend build failure or a production database failure for the new equipment migration.

### Exact compiler failure

`Prisma.JsonValue` read from `work.beforeSpecs` and `work.afterSpecs` is not assignable to `Prisma.InputJsonValue` on `equipmentUnitConfigurationEvent.create()`: read JSON types permit a top-level `null`, whereas Prisma write JSON requires an explicitly typed non-null JSON document or null sentinel. Simply suppressing TypeScript with `any` would hide malformed historical values.

**Repair:** New `backend/src/catalog/equipment-json-snapshot.ts` validates each historical configuration is a non-null JSON object and returns `Prisma.InputJsonObject`. The equipment controller calls it separately for prior/configured snapshots and maps malformed legacy values to a conflict, preserving nested nulls and refusing to manufacture replacement specifications. `backend/test/equipment-json-snapshot-regression.test.mjs` tests the data-preserving behavior and negative cases.

### What the actual GitHub workflow requires

Read from `.github/workflows/repository-import.yml` on `main`:

1. Commit **one new root-level ZIP** (or use `workflow_dispatch` with one root archive name). The ZIP must contain only canonical `backend/`, `lexa-frontend/`, `docs/`, `scripts/` and allowlisted root files, with exactly two `package.json` manifests; no wrapper folder, `.github/`, lockfile, nested archives, `node_modules`, build artifacts, symlinks or secrets.
2. `python3 scripts/clean_repository.py` restores exact committed npm v3 lockfiles from the repository's Git tree. `python3 scripts/validate_repository.py` checks the canonical layout. Never solve CI by deleting those locked dependencies or changing the workflow from inside the ZIP.
3. From `backend/`: `npm ci --no-audit --no-fund`, `npx prisma generate`, `npx prisma validate`, `npm test`, `npm run contract:check`, `npm run build`. The independent `.github/workflows/backend-ci.yml` also validates Prisma and Nest build after a source commit.
4. From `lexa-frontend/`: `npm ci --no-audit --no-fund`, `npm run build` (its `prebuild` enforces catalogue synchronization, rewrites, Vitest, then `tsc -b && vite build`).
5. **Only after all those checks pass**, the workflow commits the replaced source tree to `main`, which triggers Render/Vercel deploys. A failed ZIP import alone does not deploy the replacement source.

### Render build and startup requirements

Connected Render service `lexa-backend-api-live` reads the repository root with `backend/Dockerfile`; its last checked deploy on the preceding upload commit was `LIVE`, **not** the blocked Phase 5–9 code. The logs from that deployment show Prisma found **47** existing migrations, no pending migration, and the guarded startup completed. No application errors were returned for that deploy window. Those observations are limited to the previous source.

**Repair:** `backend/Dockerfile` now copies both `backend/package.json` and **the committed verified** `backend/package-lock.json` and executes `npm ci --no-audit --no-fund`, matching GitHub CI's exact transitive dependencies. This avoids `npm install` resolving different semver releases during the production Docker image build. `backend/Dockerfile.worker` also uses `npm ci`. After successful source-import commit, the verified lockfiles exist in the repository even though they are deliberately absent from the uploaded ZIP.

Render startup must then: generate Prisma client; pass the same Nest build; obtain a direct Neon migration advisory lock via `scripts/migrate-with-guard.mjs`; run `prisma migrate deploy` without resetting existing data; start the API. The proposed next migration is `20261105220000_equipment_service_and_appliance_custody`. It was exercised in a **separate Neon staging branch**: 10 additive tables, 10 FORCE RLS policies, 10 backup register entries, and three append-only triggers were confirmed. None of these new tables was present in production at last inspection. This is NOT an authorization to apply the migration to live tenants.

**Existing live configuration drift:** Render's service API showed `healthCheckPath` **empty** even though `render.yaml` correctly declares `/health/ready`, and the Nest controller implements that route with a database probe (`SELECT 1`). The available connected Render tool has no service health-check edit action. In the Render service dashboard, set **Health Check Path** to `/health/ready` after verifying the endpoint, or reconcile the service with its Render Blueprint. Do not confuse an open listening port with readiness. The `pg-connection-string` SSL-mode notice is a warning, not a migration or build failure; review TLS URL settings with credentials held only in Render/Neon.

### Checks run against this repair

- Backend suite: **338/338 passed** using local Node 22 + installed TypeScript compiler. Tests include snapshot JSON preservation, fail-closed invalid configurations, pinned Render dependency graph, and readiness source contract.
- API contract: **459 operations across 371 routes**, no missing/orphan operations; **18** backend-backed frontend adapters.
- Fastify route uniqueness: **482** registrations across 30 controllers.
- Backup inventory: **195** table decisions; ledger coverage: **15** source workflows.
- Industry, Electronics V2 and equipment subtype catalogue generator sync checks: passed.
- Product wizard snapshots and source-import layout checks: passed.
- TypeScript/TSX syntax parsing: **296** source files with zero parse errors.
- Frontend prebuild's non-test source transforms: passed with **zero file changes**.
- Prisma JSON read/write type guard: passed a strict isolated TypeScript compatibility fixture. This is **not** a substitute for compiling the real generated Prisma client.
- Connected Vercel `lexa_review`: latest observed upload-commit deployment `READY`, but the blocked Phase 5–9 source was not imported/deployed. This does not certify the next Vite build.
- Full `npm ci`, Prisma generation/validation, `nest build`, Vitest, `tsc -b`, Vite build, production migration, tenant E2E, and production readiness HTTP response are **not locally certified**: this execution environment cannot resolve npm registry (`EAI_AGAIN`). GitHub CI and Render must complete those real checks.

### Controlled deployment and stop conditions

1. Upload **only** the supplied new clean repository ZIP as a single newly changed root-level archive to `main`. Do **not** upload `.github/` or overwrite/delete the existing root source manually. Do **not** replace the previous failed ZIP's contents and reuse old results.
2. Require the repository-import job to finish with successful backend and frontend builds and a bot source commit. Verify the exact new Git commit SHA and independent `LEXA Backend CI` status.
3. Monitor Render's next deployment. Require a successful Docker build, Prisma migration count increasing from 47 to 48 (if no other migration was added), no P3018/P3009, a healthy `/health/ready` probe, and an actually `LIVE` deploy of **that same new source SHA**. Do not run `prisma migrate reset`, `db push`, or force-resolve an unknown failed production migration.
4. Check Vercel's next deployment is `READY` for that same source SHA; run authorization-aware smoke checks on a staging workspace and verify tenant flags are disabled for non-pilot businesses.
5. Phase 9 certification remains a separate, mandatory gate: restore drill, exact serial and finance reconciliation, live tenant/role matrix, E2E scenarios, and explicit owner approval. Do not turn on equipment-service or appliance-fulfilment flags by default.

**Status at report creation:** Source repaired and source-level checks green; new GitHub job, Render deploy of new source, Vercel deploy of new source and production migration unverified. No production database changes were made by this repair.
