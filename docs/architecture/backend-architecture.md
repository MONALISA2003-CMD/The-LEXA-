# LEXA backend architecture

**Status:** Current implementation baseline  
**Reviewed:** 2 November 2026

## Architecture overview

LEXA is a multi-tenant business management platform implemented as a modular NestJS application, backed by Neon PostgreSQL and served through the existing Render API service. The React application is deployed separately on Vercel.

```text
Browser
  └── Vercel: React + TypeScript + Vite
       └── HTTPS API requests
            └── Render: NestJS + Fastify API
                 ├── Neon PostgreSQL
                 ├── private object storage (when configured)
                 ├── transactional notifications and platform jobs
                 └── native TypeScript AI router
                      └── approved provider endpoints
```

The repository contains one frontend and one backend source tree. Domain boundaries live inside the backend package; separate runtime services are not assumed to be deployed. A worker entry point and Dockerfile are retained in the backend package for a separately reviewed deployment, but the connected Render service currently runs the API only.

## Runtime and technology choices

| Area | Current implementation | Operating rule |
|---|---|---|
| Frontend | React, TypeScript, Vite | Vercel root is `lexa-frontend`; build runs tests, TypeScript and Vite. |
| API | NestJS with Fastify | Controllers validate requests and delegate domain rules to services. |
| Database | Neon PostgreSQL | The authoritative store for ERP, identity, tenancy, audit and usage records. |
| ORM | Prisma | Production schema changes use reviewed forward migrations. |
| Authorization | Server-side tenant membership, roles, permissions and branch checks | Never trust a client-provided tenant, role or branch as proof of access. |
| Background work | BullMQ worker implementation inside the backend package | Worker execution is distinct from the currently deployed API process. |
| AI | Native TypeScript `AiRouterService` | Provider allowlist, timeouts, fallbacks, cooldowns, usage metering and read-only context. |
| Object storage | S3-compatible private storage adapter | File authorization and metadata remain in PostgreSQL; links are short-lived. |
| Observability | Structured logs, health endpoints and optional telemetry integrations | Never log credentials, access tokens or sensitive document contents. |

## Domain boundaries

The backend is organized by business capability. The main areas include identity and authorization, workspace and branch administration, catalog and inventory, sales and commerce, procurement, finance and ledgers, people and projects, notifications, platform operations, reporting and AI.

Modules own their validations and invariants. A module should not bypass another domain's service or directly mutate its tables to simulate a business transaction. Financial postings, stock movements, approvals and payment status changes must remain deterministic, auditable and idempotent.

## Data and migration policy

- Neon PostgreSQL is the only authoritative application database.
- Production is the `production` branch of the `lexa-backend` Neon project, database `lexa`.
- Prisma migration directory names are immutable identifiers recorded in `_prisma_migrations`. Do not rename, reorder, edit or remove an applied migration.
- Add schema changes as new forward migrations and deploy them through the reviewed release process.
- Never run `prisma migrate dev`, reset a database or seed demo data against production.
- Keep private file bytes in object storage and ownership, tenant scope, permissions and lifecycle metadata in PostgreSQL.

## API contract and compatibility

`lexa-frontend/openapi/backend-contract.yaml` is the shared API contract. Keep request/response shapes and existing client routes compatible unless a separately versioned migration is approved.

Some people-and-projects API paths still include the historical `/workstream6` segment. Those URLs and operation identifiers are preserved deliberately so deployed clients continue to work; source filenames, module names, documentation labels and user-facing navigation use professional domain names.

Alert rules in the production database also contain older runbook path strings. The API maps those values to the current `docs/operations/runbooks/` paths on read. The production records are not rewritten as part of repository maintenance.

## AI routing and data protection

The assistant is hosted in the existing NestJS API. It uses eligible free/developer provider endpoints configured in Render's private environment. Paid-provider routing remains disabled by default.

The router must:

- authenticate the user and enforce workspace and branch permissions;
- pass only approved, permission-filtered aggregate business facts;
- exclude raw customer/employee profiles, contact details, salaries, credentials, attachments and document contents;
- apply bounded timeouts, provider allowlists, fallback and cooldown behavior;
- record usage metadata without storing prompts or answers in the LEXA usage ledger;
- remain read-only, with no direct SQL, shell, browser or ERP write tools.

Document extraction remains disabled until a separately reviewed processing service, privacy boundary and operational deployment are approved.

## Deployment topology

| Component | Connected configuration |
|---|---|
| Frontend | Vercel project `lexa_review`; root `lexa-frontend`; Vite; output `dist`. |
| API | Render service `lexa-backend-api-live`; Dockerfile `backend/Dockerfile`; repository-root context. |
| Database | Existing Neon PostgreSQL project and production branch. |
| Provider credentials | Render private environment settings only. |

The current repository archive does not change Render environment variables, Vercel settings, database data or production deployments. Deployment state must be checked independently after a source release.

## Quality and security gates

A release should not be promoted until the following checks pass:

1. Repository structure and secret-file validation.
2. Backend unit/contract tests, Prisma client generation, API contract checks and NestJS build.
3. Frontend unit tests, TypeScript project build and Vite production bundle.
4. Tenant-isolation, branch authorization, audit, idempotency and financial integrity tests.
5. Staging migration and smoke checks against the reviewed schema.
6. Successful API and frontend deployment from the same reviewed commit.

Production database migrations must not be run concurrently by multiple service instances. Investigate an advisory-lock timeout before restarting or retrying migration deployment.

## Change control

Changes to the authoritative database, identity boundary, tenant security, public API contract, AI data policy, financial posting rules or deployment topology require a concise architecture decision record. It should capture rationale, alternatives, compatibility and migration impact, security/privacy implications, operational cost and validation plan.
