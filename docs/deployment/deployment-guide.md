# Deployment guide

## Frontend — Vercel

- Project: `lexa_review`
- Root directory: `lexa-frontend`
- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- API rewrites: `lexa-frontend/vercel.json` routes API traffic to the existing Render service.

The frontend is a separate deployment; do not put backend credentials in `VITE_*` variables.

## Backend — Render

- Service: `lexa-backend-api-live` (`srv-dbhp0f0m7kps73ffeqrg`)
- Repository/branch: `MONALISA2003-CMD/The-LEXA-`, `main`
- Runtime: Docker
- Dockerfile: `backend/Dockerfile`
- Docker context: repository root (`.`)
- Region: Frankfurt
- Instances: 1
- Current compute plan: `1c-2g` (1 vCPU / 2 GB RAM)
- Price reference: approximately $25/month
- Auto deploy: enabled for commits to `main`
- Service URL: <https://lexa-backend-api-live.onrender.com>

`render.yaml` expresses the same current `plan: 1c-2g`. Do not change it to `starter` or a Free plan. The legacy API `buildPlan` field is not the current compute plan. See the [current compute configuration](current-compute-configuration.md) for the verified provider identifiers and distinctions.

The health-check path is intentionally omitted from the Blueprint for now. `/health/ready` exists in the backend, but the deployed endpoint must return HTTP 200 before configuring Render to use it. Do not point Render at an unverified health path.

Keep the existing service. Merge any later environment-variable changes into its private settings; never replace all variables with a partial list. This archive does not change Render settings, read or replace `DATABASE_URL`, or trigger a deploy.

## Database — Neon PostgreSQL

- Project: `lexa-backend` (`empty-mud-76816448`)
- Subscription: Neon Launch (`launch_v3`)
- PostgreSQL: 17
- Region: AWS `eu-central-1` (Frankfurt)
- Production branch: `production` (`br-snowy-hill-ba5a9ggc`)
- Read/write endpoint: `ep-patient-wind-badv5z3m`
- Production compute: minimum 0.5 CU, maximum 2 CU, active, suspend timeout `-1` (always on)
- Connection pooler: enabled, transaction mode

The project-level defaults of 0.25–8 CU and suspend timeout 0 are not the production endpoint configuration.

### Connection requirements

Use the Neon pooled hostname (contains `-pooler`) for application runtime and transaction-scoped tenant work:

- `DATABASE_URL` — pooled runtime connection with login role `lexa_app`.
- `WORKER_DATABASE_URL` — pooled queue-metadata connection if the separate worker is provisioned.
- `WORKER_TENANT_DATABASE_URL` — pooled tenant-work connection if the separate worker is provisioned.

Use a direct, unpooled hostname (without `-pooler`) for Prisma CLI schema operations:

- `DATABASE_URL_UNPOOLED` — direct connection used by `prisma migrate deploy`, migration status and introspection.

Set `DATABASE_RUNTIME_ROLE=lexa_app_runtime`. The application and tenant-scoped worker queries apply the role inside a transaction with `SELECT set_config('role', ..., true)` before applying tenant/user/session context. This is transaction-local and is reset automatically at commit or rollback. Do not add `options=-c role=lexa_app_runtime` to any connection URL; Neon PgBouncer transaction mode rejects it. Session-level tenant settings (`set_config(..., false)`) are not safe on pooled transactions.

The production login role is `lexa_app`; the application runtime role is `lexa_app_runtime`. A read-only production check confirmed `lexa_app` is `BYPASSRLS=true`, while `lexa_app_runtime` is `NOLOGIN NOBYPASSRLS` and is granted to the login role. Runtime role grants and RLS policies must remain in place. The separate worker queue-discovery connection still uses the privileged login for narrowly scoped queue/control metadata only; this is a known hardening follow-up and must not be expanded to business-domain data. The archive contains placeholders only and never includes a live database password or connection string.

## Cost model (estimates, not fixed charges)

Neon Launch compute is priced at the current reference rate of $0.106 per CU-hour. At 730 hours, constant 0.5 CU is approximately $38.69/month and constant 2 CU approximately $154.76/month. With the Render backend reference of $25/month, the corresponding compute baselines are approximately $63.69 and $179.76/month. Actual autoscaling consumption varies; storage (currently listed separately at $0.35/GB-month) and other usage are additional. See [Neon pricing](https://neon.com/pricing) and [Render pricing](https://render.com/pricing).

## Runtime environment variables

Required for the backend's production database and role handling:

- `DATABASE_URL` (pooled runtime URL)
- `DATABASE_URL_UNPOOLED` (direct migration URL)
- `DATABASE_RUNTIME_ROLE=lexa_app_runtime`
- `NODE_ENV=production`
- `PORT`
- `FRONTEND_ORIGINS`

Review the `.env.example` files for the names of optional AI, observability and worker variables. Put real values in provider-private environment settings only. Never add secrets to this archive, Git, CI logs or frontend variables.

## Migration and release safety

Production migrations are immutable history. Apply reviewed forward migrations only through the approved release process. Do not rename or edit an applied migration directory, do not run `prisma migrate dev` against production, and do not run concurrent migration processes from multiple service instances. The production Docker startup runs the existing migration-recovery check and then `prisma migrate deploy` using `DATABASE_URL_UNPOOLED`.

No migrations or database data changes are performed by archive validation. The 30 checked-in migration directories and current Prisma schema are preserved.

## Repository-import ZIP

Keep `.github/workflows/backend-ci.yml` in the GitHub repository. Exclude `.github/` completely from the source-import ZIP because the import workflow rejects it. The manifest and `scripts/check_repository_layout.py` verify that the workflow is accounted for as a GitHub-side requirement.
