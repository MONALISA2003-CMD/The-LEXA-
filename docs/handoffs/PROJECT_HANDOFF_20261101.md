# LEXA root-level source handoff — Increments 1–7 and deeper deployment repairs

This ZIP is structured for extraction at the **repository root**: `backend/`, `lexa-frontend/`, `.github/`, `docs/`, `deploy/` and `scripts/` are at the archive's top level. Do not extract it inside another `LEXA_...` folder. The package excludes real secrets, dependencies and generated build outputs.

Read `../deployment/BUILD_REPAIRS_20261101.md` for the complete incident chronology, root-cause research, exact fixes, operational warnings and remaining validation limits. Read `backend/INCREMENT_6_7_IMPLEMENTATION_STATUS.md` for the full feature inventory and `docs/workstream7/runbooks/README.md` for operational runbooks.

## Repairs for the latest `34b0a58` deployment logs

- Vercel now passes its prebuild and **99/99 tests**. Fixed the subsequent strict TypeScript errors: optional notification filters are omitted when absent; the unused recurring-invoice selection variable is removed; cleared optional product/tax-code IDs are deleted instead of being assigned `undefined` under `exactOptionalPropertyTypes`.
- Render dependency installation and Nest compilation were already successful. Startup failed because `fastify-raw-body` with `encoding:false` registers a second `application/json` parser before Nest registers its own. Raw-body capture stays route-scoped but now uses UTF-8 string mode; the controller converts that capture to a `Buffer` before Svix verification.
- Added backend regression coverage for UTF-8 raw-body normalization and the valid Fastify 5 plugin configuration.
- Updated the sample Neon URL to explicit `sslmode=verify-full`; the live Render secret must be updated separately. No production environment secret is embedded here.

## Validation

- Backend automated tests: **76 passed, 0 failed**.
- Frontend and backend source syntax checks: current-file counts and results are in `VALIDATION_RESULTS_20261101.txt`.
- Backup inventory: **154 decisions / 137 discovered references covered**.
- OpenAPI coverage: **296 operations / 235 routes**.
- Route-to-adapter coverage: **17/17**.
- Ledger workflow coverage: **9/9**.
- Frontend prebuild scripts and a focused strict TypeScript check for the reported optional-property patterns passed.
- Hosted evidence: Vercel's provided log confirms 99/99 frontend tests passed before the earlier TypeScript errors. Render's provided log confirms `npm install`, Prisma generation, backup inventory check, Nest compile and four migrations succeeded before application startup crashed.

## Remaining items — do not treat as green

The full frontend `tsc -b`/Vite build and actual Nest/Fastify startup have not been rerun with installed dependencies in this workspace. Verify both hosted deployments after applying this package. The Render log also reported **51 npm vulnerabilities (including 5 high)** and transitive deprecation warnings. No lockfiles or full `npm audit --json` output exist in this repository snapshot, so those findings are documented but not falsely marked fixed. Generate lockfiles and triage the exact advisories in a network-enabled environment; avoid `npm audit fix --force` without compatibility review.

Render's four successful Neon migrations are already applied. **Do not reset or roll them back** because of the application startup crash. The SSL warning is non-fatal; update the live `DATABASE_URL` query parameter to explicit `sslmode=verify-full` separately if it currently uses `require`, `prefer` or `verify-ca`.

The ZIP is source-repaired and backend-unit-tested, but **not yet confirmed green by a new hosted Vercel build and Render startup/health check**.
