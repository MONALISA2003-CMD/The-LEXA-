# LEXA backend architecture

**Reviewed:** 3 November 2026

## Architecture overview

LEXA is a multi-tenant business management platform implemented as a modular NestJS application, backed by Neon PostgreSQL and served through the existing Render API service. The React application is deployed separately on Vercel.

```text
Browser -> Vercel React/Vite -> Render NestJS/Fastify API -> Neon PostgreSQL
                                                  |-> private object storage (when configured)
                                                  |-> notifications and platform jobs
                                                  `-> native TypeScript AI router -> approved providers
```

The repository contains one frontend and one backend source tree. Domain boundaries live inside the backend package. A worker entry point and Dockerfile are retained for a separately reviewed deployment, but the connected Render service currently runs the API only.

## Runtime choices

| Area | Current implementation | Operating rule |
|---|---|---|
| Frontend | React, TypeScript, Vite | Vercel root `lexa-frontend`; tests, TypeScript and Vite build. |
| API | NestJS with Fastify | Controllers validate requests and delegate domain rules. |
| Database | Neon PostgreSQL | Authoritative store for ERP, tenancy, audit and usage records. |
| ORM | Prisma | Production schema changes use reviewed forward migrations. |
| Authorization | Server-side tenant, membership, role and branch checks | Never trust client-supplied tenant or role as authorization. |
| Background work | BullMQ worker implementation in backend package | Distinct from the currently deployed API process. |
| AI | Native TypeScript router | Provider allowlist, bounded timeouts, fallbacks, cooldowns and usage metering. |
| Storage | S3-compatible private storage adapter | Metadata and access policy remain in PostgreSQL. |

## Data and migration policy

- Neon PostgreSQL is the only authoritative application database.
- Production is the `production` branch of the `lexa-backend` Neon project, database `lexa`; PostgreSQL 17 in AWS `eu-central-1` (Frankfurt).
- The production endpoint scales from 0.5 to 2 CU, remains active with suspend timeout `-1`, and has PgBouncer transaction pooling enabled. Project-level 0.25–8 CU defaults are not endpoint settings.
- Use pooled `DATABASE_URL` (hostname includes `-pooler`) for API runtime and direct `DATABASE_URL_UNPOOLED` for Prisma CLI migrations. `DATABASE_RUNTIME_ROLE=lexa_app_runtime` is applied transaction-locally after `BEGIN`.
- Prisma migration directory names are immutable once applied and recorded in `_prisma_migrations`.
- Add schema changes as new forward migrations; never reset, rename or edit applied migrations.
- Never run `prisma migrate dev` or seed demo data against production.
- File bytes belong in private object storage; ownership, tenant scope, permissions and lifecycle metadata remain in PostgreSQL.

## Multi-tenant security

The authenticated user, active workspace, branch scope and permissions are derived and verified server-side. Every business read and write must be tenant- and resource-scoped. Keep database credentials least-privileged and preserve transaction-local RLS context. Negative cross-tenant and branch-authorization tests are release gates.

## AI routing and data protection

The assistant runs in the existing NestJS API. Only approved, permission-filtered aggregate facts may be sent to providers. Exclude raw customer/employee profiles, contact details, salaries, credentials, attachments and document contents. The router is read-only and must not create transactions, approvals, payments or accounting entries. Paid-provider routing remains disabled by default.

## Deployment topology

| Component | Connected configuration |
|---|---|
| Frontend | Vercel `lexa_review`, root `lexa-frontend`, Vite, output `dist`. |
| API | Render `lexa-backend-api-live`, plan `1c-2g` (1 vCPU / 2 GB), one Frankfurt instance; Dockerfile `backend/Dockerfile`, repository-root context. |
| Database | Neon Launch, PostgreSQL 17, production branch, 0.5–2 CU autoscaling, always-on endpoint and transaction pooler. |
| Secrets | Provider private environment settings only. |

A source archive does not change provider configuration or deploy code. Verify both deployments independently after a release.
