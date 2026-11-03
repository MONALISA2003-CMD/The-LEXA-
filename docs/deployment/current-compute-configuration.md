# Current production compute and database configuration

**Configuration date:** 3 November 2026  
**Scope:** deployment configuration and operational documentation only. Render and Neon endpoint metadata were read from the connected providers on 3 November 2026. The production runtime-role membership and RLS migration status were also checked with a read-only query. No provider configuration, secret or production data was changed. This document does not claim that this source archive has been committed or deployed.

## Render backend

| Setting | Production value |
|---|---|
| Service | `lexa-backend-api-live` |
| Service ID | `srv-dbhp0f0m7kps73ffeqrg` |
| Workspace ID | `tea-d9cssgflk1mc73br1cp0` |
| Repository | `MONALISA2003-CMD/The-LEXA-` |
| Branch | `main` |
| Runtime | Docker |
| Dockerfile | `backend/Dockerfile` |
| Docker build context | repository root (`.`) |
| Region | Frankfurt (`frankfurt`) |
| Instances | 1 |
| Compute plan | `1c-2g` |
| Compute allocation | 1 vCPU / 2 GB RAM |
| Compute price reference | approximately $25/month |
| Auto deploy | enabled on commits to `main` |
| Service URL | <https://lexa-backend-api-live.onrender.com> |

The Blueprint `plan` value is `1c-2g`. This is the current supported Render Blueprint plan identifier for the 1 CPU / 2 GB tier. Do not substitute the legacy API `buildPlan: starter` field: that field is not the actual compute allocation and Starter's historical resource size is smaller. Render's current compute-plan and Blueprint references are [Compute Plans](https://render.com/docs/compute-plans), [Blueprint Specification](https://render.com/docs/blueprint-spec), and [Pricing](https://render.com/pricing).

`render.yaml` intentionally does not set `healthCheckPath`. The API source implements `/health/ready`, and `/health/live`, but this archive operation did not verify a successful HTTP 200 response from the deployed production readiness endpoint. Set the Render health-check path to `/health/ready` only after the deployed service returns HTTP 200 consistently.

The Vercel frontend remains a separate deployment. The current backend service is the API service; the worker source entry point is not evidence of a separately deployed worker.

## Neon PostgreSQL production project and endpoint

| Setting | Production value |
|---|---|
| Project | `lexa-backend` |
| Project ID | `empty-mud-76816448` |
| Subscription | Neon Launch (`launch_v3`) |
| PostgreSQL | 17 |
| Region | AWS `eu-central-1` (Frankfurt) |
| Production branch | `production` |
| Branch ID | `br-snowy-hill-ba5a9ggc` |
| Production read/write endpoint | `ep-patient-wind-badv5z3m` |
| Minimum autoscaling | 0.5 CU |
| Maximum autoscaling | 2 CU |
| Compute state | Active |
| Suspend timeout | `-1` (always on; no automatic scale-to-zero) |
| Connection pooler | Enabled |
| Pooler mode | Transaction |

The endpoint autoscaling range is 0.5–2 CU and is always on. Do not describe it as a 0.25 CU endpoint or as an endpoint that automatically suspends. Neon project-level defaults separately report a 0.25 CU minimum, 8 CU maximum and `suspend_timeout_seconds=0`; these are project defaults, not the production endpoint's configured values.

### Runtime and migration connection strings

Neon provides both a normal direct endpoint hostname and a pooled hostname. The pooled hostname contains `-pooler`; the direct hostname does not. The production endpoint's provider-returned hosts are:

- Direct host: `ep-patient-wind-badv5z3m.c-8.eu-central-1.aws.neon.tech`
- Pooled host: `ep-patient-wind-badv5z3m-pooler.c-8.eu-central-1.aws.neon.tech`

These are hostnames only, not connection strings. Do not copy credentials or a real connection string into this project archive.

| Variable | Host type | Intended use |
|---|---|---|
| `DATABASE_URL` | Pooled (`-pooler`) | API runtime and Prisma adapter queries |
| `DATABASE_URL_UNPOOLED` | Direct (no `-pooler`) | Prisma CLI migrations, migration status and introspection |
| `WORKER_DATABASE_URL` | Pooled | Server-side queue metadata/discovery connection for the optional worker |
| `WORKER_TENANT_DATABASE_URL` | Pooled | Tenant-scoped worker reads/writes |
| `RESTORE_TARGET_DATABASE_URL` | Target-specific, isolated endpoint | Only the separately provisioned restore target; never the production URL |

`DATABASE_URL` uses login role `lexa_app`; the backend switches to `lexa_app_runtime` within each interactive transaction. `DATABASE_RUNTIME_ROLE` must be `lexa_app_runtime` in production. The role setting is applied with transaction-local PostgreSQL configuration before tenant/user/session context. Tenant-scoped worker operations use the same ordering and transaction-local settings.

Do not append `options=-c role=lexa_app_runtime` to a Neon connection URL. PgBouncer transaction mode does not accept that startup parameter. Do not use session-level `SET` or session-scoped `set_config(..., false)` for tenant context on the pooled connection; apply context inside a transaction with `set_config(..., true)`.

A read-only production-branch role/migration check on 3 November 2026 confirmed the `lexa_app` login role is non-superuser with `BYPASSRLS=true`, the `lexa_app_runtime` role is `NOLOGIN` and `NOBYPASSRLS`, `lexa_app` is a member of the runtime role, and migration `20261030320000_platform_catalog_finance_rls` is applied. This is production branch metadata verification only; no business data was queried or changed. The API and tenant-scoped worker transactions must switch to the runtime role before tenant data access. The separate worker queue-discovery connection still uses the privileged login role for cross-tenant queue/control metadata; keep that use narrowly bounded and do not use it for business-domain reads or writes. Replacing that control-plane access with narrow `SECURITY DEFINER` queue-claim functions or a dedicated non-bypass queue role remains a hardening follow-up, not part of this archive-only change.

Neon's current guidance recommends pooled connections for application traffic and a direct connection for Prisma migrations. See [Connect from Prisma to Neon](https://neon.com/docs/guides/prisma), [Schema migrations with Prisma](https://neon.com/docs/guides/prisma-migrations), and [Connection pooling](https://neon.com/docs/connect/connection-pooling).

## Compute cost estimates

The current Neon Launch compute reference is **$0.106 per CU-hour**. These are illustrative usage estimates at a constant compute size for 730 hours; they are not fixed subscription charges. Actual monthly usage varies with time at each autoscaled size. Storage and other usage are additional; the current pricing page lists storage separately at $0.35/GB-month.

| Scenario | Neon compute estimate | Render backend reference | Combined compute baseline |
|---|---:|---:|---:|
| Constant 0.5 CU for 730 hours | $38.69/month | $25.00/month | **$63.69/month** |
| Constant 2 CU for 730 hours | $154.76/month | $25.00/month | **$179.76/month** |

Formula: `CU × 730 hours × $0.106`. The lower estimate assumes compute remains at the minimum 0.5 CU for all 730 hours; the upper estimate assumes 2 CU for all 730 hours. They are not minimum/maximum monthly bills or guarantees. Review the [Neon pricing page](https://neon.com/pricing) for current usage rates and billing details.

## Production environment variables

Store secrets only in provider-side private environment settings. The repository contains placeholder examples, never live credentials.

Required connection/security settings for the API:

- `DATABASE_URL` — pooled Neon PostgreSQL connection string; no startup role parameter.
- `DATABASE_URL_UNPOOLED` — direct Neon PostgreSQL connection string for production Prisma CLI migration commands.
- `DATABASE_RUNTIME_ROLE=lexa_app_runtime` — approved least-privilege transaction role; login role is `lexa_app`.
- `NODE_ENV=production` and `PORT` — application runtime mode and Render-provided/listening port.
- `FRONTEND_ORIGINS` — allowed frontend origin(s).

The complete optional provider/worker variables are documented by name in `backend/.env.example` and `backend/.env.worker.example`. Do not invent, copy, or publish secret values. A worker requires its own server-side Redis, database, object-storage, scanner and backup-key configuration; its source code does not mean a Render worker service is deployed.

## Deployment and safety boundaries

- Render auto-deploys the `main` branch when the reviewed commit lands. This archive does not commit code or trigger a deployment.
- Keep the root Docker build context and `backend/Dockerfile` path unchanged.
- The Docker startup runs the existing failed-migration recovery check and then `prisma migrate deploy`. Production Prisma CLI uses `DATABASE_URL_UNPOOLED`; API runtime uses pooled `DATABASE_URL`.
- Never run migrations, reset, seed, truncate or modify production data as part of ZIP preparation or validation.
- The 30 existing Prisma migration directories are preserved byte-for-byte. This archive does not alter the Prisma schema or migrations.
- The health-check path remains unset in the Blueprint until `/health/ready` has been verified healthy on the deployed backend.
- `.github/` is excluded from repository-import ZIPs. Keep `.github/workflows/backend-ci.yml` in the GitHub repository; its retention requirement is recorded in `REPOSITORY_LAYOUT_MANIFEST.json`.
