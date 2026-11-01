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

Production requires `DATABASE_URL` to be stored as a Render secret/environment variable. Do not commit connection strings or place database credentials in any `VITE_*` frontend variable. Exact frontend origins belong in `FRONTEND_ORIGINS`.

## Architecture guardrails

- Neon is the sole authoritative store for business records; do not duplicate ERP data in a Supabase database.
- Every endpoint that touches tenant-owned data must derive tenant membership and permissions server-side. Browser-supplied tenant/branch IDs are not authorization proof.
- Critical writes must use domain services, transactions and persisted idempotency results.
- Use `prisma migrate deploy` for deployment; never run `prisma migrate dev` against production.
- Do not connect the frontend to this API until authentication, authorization, CSRF/CORS and the agreed OpenAPI contract have been implemented and tested.
