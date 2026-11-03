# LEXA API foundation

This directory is the first backend scaffold for LEXA. It uses NestJS + Fastify and Prisma 7 against the new Neon PostgreSQL project. The frontend remains on Vercel; the API is intended for Render.

## Current scope

- `GET /health/live`: process liveness
- `GET /health/ready`: database readiness check without returning connection details
- Initial tenancy, membership, branch, audit and idempotency persistence models
- Production Docker build and `prisma migrate deploy`
- Exact-origin CORS configuration and request DTO validation defaults

This is an infrastructure foundation, **not a claim that all LEXA workflows are implemented**. Authentication/session recovery, authorization policies, domain modules, AI provider routing, queue workers, integrations and full OpenAPI contract coverage must be implemented and tested in later phases before production business use.

## Local setup

1. Copy `.env.example` to `.env` and set a development Neon branch URL.
2. Install dependencies with `npm install`.
3. Run `npm run db:generate`.
4. Apply the checked-in SQL migration using `npm run db:migrate:deploy`.
5. Start with `npm run start:dev`.

Production uses `DATABASE_URL` as a pooled Neon hostname (`-pooler`) for API runtime, and `DATABASE_URL_UNPOOLED` as a direct hostname (no `-pooler`) for Prisma CLI migration/status/introspection commands. Set `DATABASE_RUNTIME_ROLE=lexa_app_runtime`; the login role is `lexa_app`. Prisma and tenant-scoped worker code apply the runtime role and tenant/user/session context transaction-locally after `BEGIN`, before any tenant query. The production `lexa_app` login is a privileged `BYPASSRLS` role used only to establish the connection and for the worker queue-discovery/control-metadata path; that path must remain narrowly bounded and is a documented hardening follow-up. Tenant business data must run as `lexa_app_runtime` (`NOBYPASSRLS`). Never append `options=-c role=...` or rely on session-level tenant settings with Neon transaction pooling. Store both URLs and all credentials only in Render private environment settings. Do not commit connection strings or place database credentials in any `VITE_*` frontend variable. Exact frontend origins belong in `FRONTEND_ORIGINS`.

## Architecture guardrails

- Neon is the sole authoritative store for business records; do not duplicate ERP data in a Supabase database.
- Every endpoint that touches tenant-owned data must derive tenant membership and permissions server-side. Browser-supplied tenant/branch IDs are not authorization proof.
- Critical writes must use domain services, transactions and persisted idempotency results.
- Use `prisma migrate deploy` for deployment; it must use `DATABASE_URL_UNPOOLED` (direct/unpooled). The application process uses pooled `DATABASE_URL`. Never run `prisma migrate dev` against production.
- Do not connect the frontend to this API until authentication, authorization, CSRF/CORS and the agreed OpenAPI contract have been implemented and tested.
