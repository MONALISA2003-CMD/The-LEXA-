# LEXA GitHub Actions / Render / Vercel exact-unit checkout repair — 2026-11-05

## Incident and observed evidence

- **Workflow:** `.github/workflows/repository-import.yml` — *Refresh LEXA from a clean repository ZIP*.
- **GitHub Actions:** run `42046196447`, job `127309683030`, failed at `Test and build backend`. Its ZIP import, clean-source layout, `npm ci`, `npx prisma generate`, `npx prisma validate`, **344/344 Node backend tests** and `npm run contract:check` passed; `npm run build` failed at TypeScript `TS2345`. The frontend build and Git source commit were skipped.
- **Exact compiler failure:** `backend/src/core/core.controller.ts:1654` passed database results shaped as `{serialNumber:string}[]` into `orderedSaleSerialNumbers`, which requires `{id:string,serialNumber:string}[]`. The helper requires canonical unit IDs so that unordered `IN (...)` query results never misalign a sale's unit IDs with displayed serial numbers.
- **Render:** at audit time the service `lexa-backend-api-live` reported `live`, deployment `dep-dbm97ibm8hqs73d00n5g`, Git SHA `5af4222f247d02d26a114b3bbf896a7075dbe95c`. It was not running the rejected ZIP because the importer never committed that source. The sampled Render window 2026-11-05 14:30–15:00 UTC returned zero `error`-severity logs. `autoDeploy` was `yes`, but service `healthCheckPath` was blank.
- **Vercel:** `lexa_review`, deployment `dpl_9uQVScgSgTMd7w9NXNjqsu8u1N96`, `READY` at the same Git SHA; build log reported completion and a non-blocking oversized JavaScript chunk warning. The verified custom domain is `lexaaamaal.com`.
- **Neon:** production's `20261105220000_equipment_service_and_appliance_custody` migration was applied. No database migration is needed for this repair. No production writes performed here.

## Code repair

In `backend/src/core/core.controller.ts`, the exact-unit lookup now selects **both** `id:true` and `serialNumber:true`. Do not replace the strict `orderedSaleSerialNumbers` helper or rely on Postgres `IN (...)` query order. The regression test `backend/test/exact-serial-return-regression.test.mjs` now asserts the Prisma select projection contains both canonical identity and physical serial. All existing return-safety tests remain intact.

This repair changes **only** the checkout query projection and its regression guard, plus this audit document. No sales records, inventory, tenant identities, tax journals, RLS, SQL migrations, product policies or frontend files were changed.

## CI requirements, in execution order

1. Upload **exactly one** new clean root-level ZIP. Its contents must be flat repository-root `backend/`, `lexa-frontend/`, `scripts/`, `docs/` plus allowlisted root files; no outer wrapper, `.github/`, `node_modules/`, `dist/`, hidden secrets, symlinks, nested ZIPs or extra package manifests.
2. The importer checks out `main`, unpacks this ZIP and retains `.github/` and Git metadata.
3. `python3 scripts/clean_repository.py` restores the **previously committed npm lockfiles from `HEAD`**; `python3 scripts/validate_repository.py` enforces the lockfile and source-layout contract. The ZIP deliberately excludes lockfiles, as did the prior accepted source ZIP; never replace a true lockfile with a synthetic stub.
4. Backend: `npm ci`, `npx prisma generate`, `npx prisma validate`, `npm test`, `npm run contract:check`, `npm run build`. The Nest TypeScript compilation is the previously failed gate; **all must pass**.
5. Frontend: `npm ci`, `npm run build` (prebuild includes catalogue sync verification, frontend Vitest; build includes `tsc -b` and Vite production bundling).
6. Only after both builds pass does the workflow commit a replacement source tree and push to `main`. Render/Vercel then build that new exact Git SHA independently.

## Render requirements

- Render service Docker context must be repository root `.` and file `backend/Dockerfile`; that Dockerfile copies the verified backend package lock and uses `npm ci`, generates Prisma and compiles Nest.
- Startup executes `node scripts/migrate-with-guard.mjs` before the API starts. The deployment uses the existing database configuration, and the existing migration head is already applied; there is no new migration in this repair.
- The repository Blueprint's DB-aware `healthCheckPath` is `/health/ready`, but the live Render service setting remained empty during the audit. Configure it in Render after verifying that this endpoint is reachable and genuinely checks the database; do not blind-update service settings or secrets. The blank path does not itself mean the existing deployment failed (it was live).
- Verify the new deployment is `live`, its exact Git SHA matches the workflow's source commit, startup shows no failed migrations and `/health/ready` passes. Confirm no runtime error spike after rollout.

## Vercel requirements

- Project `lexa_review` builds `lexa-frontend/` from GitHub `main` with Node 22. The project must run `npm ci` from the committed frontend lockfile and `npm run build`, including Vitest, TypeScript build and Vite.
- Keep current `lexa-frontend/vercel.json` API rewrites to the Render backend and verify domain `lexaaamaal.com` points to the new READY production deployment. `READY` on the earlier SHA does not establish that the new source built.

## Verification performed on this exact repair

- Backend Node tests: **344 / 344 passed**. Targeted exact-unit tests: **6 / 6 passed**.
- Catalogue and OpenAPI: 13 industries; 282 category nodes; 52 published family policies; 459 operations across 371 routes; 18 backend-backed adapters. All synchronized.
- Fastify route uniqueness: 482 registrations across 30 controllers. Backup inventory: 195 table decisions. Ledger coverage: 15 workflows. All passed.
- This environment's npm registry DNS lookup failed `EAI_AGAIN`. Thus `npm ci`, full Nest `nest build`, frontend Vitest and `tsc -b && vite build` **could not be rerun locally**. The previous hosted workflow log is authoritative for its single compiler diagnostic; the next hosted CI run is the required final build confirmation.
- Frontend code and production DB schema are intentionally unchanged by this repair.

## Required completion evidence

Record the new GitHub Actions URL and green conclusion; new committed source SHA; Render deployment ID/commit and `live` status, migration log and readiness probe; Vercel READY production deployment SHA and tested domain. A failed historical workflow run is immutable: **a new run for this new ZIP must be green**. Do not enable gated electronics equipment or appliance writes without the full staging and finance acceptance checks specified by the PRD.
