# LEXA release readiness and production configuration

**Configuration snapshot:** 3 November 2026  
**Repository:** `MONALISA2003-CMD/The-LEXA-`  
**Branch:** `main`

This archive update aligns source configuration and operating documentation with the Render and Neon settings supplied as directly verified on 3 November 2026. It is not a GitHub commit, provider configuration change, production deployment or database operation. Vercel and worker deployment details are not reverified by this compute-plan archive update.

## Current Render configuration

- Service: `lexa-backend-api-live` (`srv-dbhp0f0m7kps73ffeqrg`), workspace `tea-d9cssgflk1mc73br1cp0`.
- Repository/branch: `MONALISA2003-CMD/The-LEXA-`, `main`.
- Docker runtime; Dockerfile `backend/Dockerfile`; build context `.`; Frankfurt region; one instance.
- Current compute plan: `1c-2g`, 1 vCPU / 2 GB RAM; price reference approximately $25/month.
- Auto deploy enabled on commits; service URL <https://lexa-backend-api-live.onrender.com>.
- `render.yaml` now uses the current supported Blueprint plan value `1c-2g`, explicitly selects `main`, retains Docker path/context and configures one instance.
- No `healthCheckPath` is set in the Blueprint. `/health/ready` exists in source, but this archive operation did not verify a production HTTP 200 response; configure it only after successful post-deploy verification.

Do not interpret the legacy Render API `buildPlan: starter` field as the current compute allocation. The currently verified service allocation is 1 CPU / 2 GB RAM.

## Current Neon configuration

- Project `lexa-backend` (`empty-mud-76816448`), Neon Launch (`launch_v3`), PostgreSQL 17, AWS `eu-central-1` (Frankfurt).
- Production branch `production` (`br-snowy-hill-ba5a9ggc`); read/write endpoint `ep-patient-wind-badv5z3m`.
- Endpoint autoscaling minimum 0.5 CU and maximum 2 CU; state Active; suspend timeout `-1` (always on); PgBouncer connection pooler enabled in transaction mode.
- Project defaults of 0.25 CU minimum, 8 CU maximum and suspend timeout 0 are distinct project defaults, not the production endpoint configuration.

### Current cost estimates

Neon Launch compute reference: $0.106/CU-hour. At 730 hours, constant 0.5 CU is an estimated $38.69/month; constant 2 CU is an estimated $154.76/month. With Render's $25/month compute reference, the corresponding compute baselines are about $63.69/month and $179.76/month. These are estimates, not fixed subscription charges. Actual compute varies with autoscaling usage; storage and other usage are additional (Neon currently lists storage separately at $0.35/GB-month). See [Neon pricing](https://neon.com/pricing) and [Render pricing](https://render.com/pricing).

## Prisma and Neon runtime-role correction

The backend API uses the Neon pooled `DATABASE_URL` with login role `lexa_app`; it switches to `lexa_app_runtime` with transaction-local `set_config('role', ..., true)` inside each interactive Prisma transaction before applying tenant, user, session-token, reset-token and correlation context. `DATABASE_RUNTIME_ROLE` is validated against the approved role name and is required in production.

The worker's tenant-scoped database paths use the same runtime role and tenant context transaction-locally after `BEGIN`, including standalone SQL statements wrapped in short transactions. Session-level tenant state and the startup `options=-c role=...` option have been removed from these pooled paths. The transaction-local settings reset automatically on commit/rollback. A read-only check on the production Neon branch confirmed `lexa_app` is a login role with `BYPASSRLS=true`, `lexa_app_runtime` is `NOLOGIN NOBYPASSRLS`, the login role is a member of the runtime role, and the RLS migration is applied. The worker queue-discovery pool deliberately remains on the privileged login for a narrow queue/control-metadata path; it is a known hardening follow-up and must not be used for business-domain reads/writes. Replace it with constrained claim functions or a dedicated non-bypass queue role before considering the worker control plane fully least-privileged.

Connection variables are deliberately separated:

- `DATABASE_URL`: pooled host (contains `-pooler`) for application runtime.
- `DATABASE_URL_UNPOOLED`: direct host (no `-pooler`) for Prisma CLI migrations/status/introspection.
- `WORKER_DATABASE_URL` and `WORKER_TENANT_DATABASE_URL`: pooled worker connections when a worker is separately deployed.

`backend/prisma.config.ts` selects `DATABASE_URL_UNPOOLED` for production CLI commands. It allows the existing synthetic CI/build `DATABASE_URL` fallback only outside production; production fails explicitly when a direct URL is missing. No real connection strings or secrets are included.

## Source and migration integrity

- Prisma schema was not changed.
- All 30 existing Prisma migration directories are preserved; no migration files were rewritten or applied.
- No database reset, seed, truncate, SQL mutation, connection-string retrieval or production data operation was performed.
- Authentication, authorization, payments, orders, customer, admin and frontend application modules were not intentionally redesigned.

## ZIP import and repository requirements

- Source ZIP root is the repository root; no nested repository copy is added.
- `.github/` is excluded from the source-import ZIP because the import workflow rejects it.
- `.github/workflows/backend-ci.yml` remains a GitHub repository requirement and is recorded in `REPOSITORY_LAYOUT_MANIFEST.json`; this archive operation does not delete or alter GitHub workflow files.
- Exactly two application `package.json` manifests are expected: `backend/package.json` and `lexa-frontend/package.json`.

## Release gates not satisfied by archive validation alone

1. Apply the source archive through the authorised GitHub review/commit process, preserving the existing workflow in the repository.
2. Confirm the GitHub workflow has the production-independent test URL variables it needs for Prisma validation; CI-only config may use synthetic placeholders, while production migrations must use `DATABASE_URL_UNPOOLED`.
3. Install dependencies and run backend tests/build, Prisma generate/validate, and frontend production build in the release environment.
4. Deploy the reviewed commit to Render and confirm the API starts with pooled `DATABASE_URL`, direct `DATABASE_URL_UNPOOLED`, and `DATABASE_RUNTIME_ROLE=lexa_app_runtime` set in private environment settings. The role membership and RLS migration were read-only verified on the production Neon branch on 3 November 2026.
5. Verify `/health/live` and `/health/ready` on the deployed service; only then configure the Render health check to `/health/ready`.
6. Confirm frontend/API signed-in smoke tests, tenant/RLS tests and operational monitoring after deployment.
7. Separately provision and verify persistent Redis, R2 access, ClamAV, worker credentials and any independently deployed worker before enabling worker processing.

This archive workflow does not deploy the application and does not apply any production migration.
