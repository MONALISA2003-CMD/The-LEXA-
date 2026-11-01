# LEXA Backend-Build Readiness Gate

**Review date:** 2026-10-29  
**Repository:** `MONALISA2003-CMD/The-LEXA-`  
**Frontend root:** `lexa-frontend/`  
**Architecture authority:** repository-root `BACKEND.md` (LEXA Backend Architecture Lock v1.0)

## Executive status

LEXA has a strong backend-integration foundation and is ready to begin **backend scaffolding and contract-driven implementation**. It is **not yet end-to-end connected**: this repository contains the frontend, API adapters and OpenAPI agreement, but not a deployed NestJS API, database migrations or configured production backend.

The latest observed `main` tree was commit `e68dc5e98bb56c1d8794180a824c0f3688783de9`. The GitHub Vercel status for that commit was `success`. The latest `LEXA ZIP Extractor` run was successful, but that workflow only extracts ZIP contents; it is not an application test suite. Always use a fresh production build after uploading this patch.

## What is already prepared

- React + TypeScript + Vite frontend remains under `lexa-frontend/`; this patch does not reorganize it.
- `openapi/backend-contract.yaml` defines the versioned `/api/v1` API contract.
- Shared REST client and typed adapters exist for authentication, workspaces, catalogue, inventory, sales workflows, reporting, dashboard analytics, generic module registers, collaboration, search and Business Tools.
- Production API errors do not silently fall back to IndexedDB or localStorage.
- Auth pages call API methods and do not persist passwords or password-reset tokens in browser storage.
- Request IDs, bounded request timeouts, CSRF headers, credentialed requests and idempotency headers are already part of the API client pattern.
- Initial module registers are intended to start empty. The `src/data/mock/` directory consists of compatibility shims and test files; it must not be treated as a production fixture or seed source.
- `src/data/remote/runtimeConfig.ts` is hardened in this patch so that production builds **always select the API provider**, even if a stale `VITE_DATA_PROVIDER=local` value is present. Device-only storage remains available for development only.

## Contract and domain rules that backend implementation must preserve

1. **Single source of business truth:** PostgreSQL is authoritative. Browser storage is not a server cache and must never be treated as synchronized production data.
2. **Tenant/branch authorization:** every request checks the authenticated user's access to each workspace, branch, record, file, thread, task and requested action. IDs supplied by the browser are never authorization proof.
3. **Domain-owned validation:** generic module records are suitable only for allowed operational registers. The backend must validate allowed module IDs and module-specific fields against server-owned schemas. Do not let `additionalProperties` become permission to persist arbitrary JSON.
4. **Dedicated transactional services:** sales completion, receipts/payments, returns/refunds, stock movements/transfers, accounting postings, payroll and regulatory submissions must use dedicated domain services with transactions, audited transitions and deterministic calculations. AI and generic CRUD screens must not bypass those services.
5. **Idempotency:** persist idempotency-key/result associations on critical writes. A timeout is an unknown outcome, not proof the operation failed. Before exposing retry-sensitive writes, ensure retries reuse the same logical operation key or the server provides a reliable business-operation deduplication strategy.
6. **Optimistic concurrency:** the OpenAPI document describes version/ETag protection for collection replacement, but the current generic-register adapter does not expose an ETag/version token and the current UI does not call that method. Do not enable bulk replacement until the client and contract explicitly define and test the concurrency token. Normal current UI flows save one record or update a status.
7. **Canonical session route:** the frontend calls `GET /auth/session`. The contract also contains a duplicate `GET /session` entry; use `/auth/session` as canonical and remove or explicitly alias the duplicate before generating server routes/clients.
8. **No fake integration success:** imports, backup/restore, notifications, attachments, external tax/e-invoice submissions, payments and carrier/email integrations must report authoritative server/provider outcomes. A front-end success toast is not proof of a remote transaction.

## Backend scaffold target

Add the backend as a separate top-level `backend/` directory; do not move the existing frontend. Follow `BACKEND.md` for NestJS + Fastify, Prisma + Neon PostgreSQL, tenant-aware authorization, Redis/BullMQ, a provider-independent multi-provider AI gateway, private object storage and observability. Run API and worker processes separately where needed while keeping the domain code in a modular monolith initially.

The API must implement the existing OpenAPI contract and tests must verify response envelopes, error codes, status codes, authentication, CSRF, idempotency and tenant scoping. Any contract change must update this file, the frontend adapters and contract tests together.

## Required production configuration

Frontend / Vercel:

- `VITE_DATA_PROVIDER=api` (production code now forces API mode regardless of this value, but keep the variable explicit for clarity).
- `VITE_API_BASE_URL=https://<actual-api-origin>` — a public origin only. The frontend appends `/api/v1` unless that suffix is already present.
- Never place database URLs, service-role keys, provider API keys, signing keys or other secrets in any `VITE_*` variable.

Backend / API and worker environment must be configured separately for the database, authentication verification, session/cookie signing, CORS/CSRF, Redis, object storage, email delivery, observability, and AI gateway/providers. Secrets must be stored in the server deployment environment, never in this repository or the browser bundle.

For a cross-origin cookie session, configure the exact frontend origin in CORS, credentials, `Vary: Origin`, secure cookies and CSRF validation. Never use wildcard CORS with credentials.

## Acceptance checklist before marking backend integration ready

- [ ] `BACKEND.md` is present at repository root and treated as the architecture baseline.
- [ ] The canonical OpenAPI session route and generic collection concurrency semantics are resolved before endpoint generation.
- [ ] Production Vercel environment has the real API origin; no secrets are exposed in `VITE_*` values.
- [ ] Backend health and database-readiness checks pass; authentication/session and password recovery are implemented.
- [ ] Tenant and branch isolation tests cover cross-tenant IDOR and forbidden function/record access.
- [ ] Workspace/branch, product, stock, sale, payment, return and report flows round-trip to the authoritative database.
- [ ] Generic operational registers have server-owned allowed-module schemas and field validation.
- [ ] AI requests pass through the policy-controlled provider gateway; tenant privacy, free-tier restrictions, provider quotas and paid budgets are enforced server-side.
- [ ] Integration tests cover duplicate idempotency keys, concurrency/race conditions, transaction rollback, CSRF failure, timeout/unknown outcomes and audit events.
- [ ] CI passes lint, TypeScript typecheck, unit tests, OpenAPI validation, production build and applicable end-to-end tests.
- [ ] A deployed smoke test proves an API failure cannot create a local duplicate or misleading success state.

## Validation boundary

This is a repository inspection/handoff document, not a claim that a backend exists. The container used for this review could not clone GitHub because DNS/network access was unavailable, so a new local `npm install`, full test run and fresh Vercel deployment were not executed in this environment. The repository's current GitHub Vercel status was successful at the time inspected. The new runtime-mode helper has focused Vitest coverage; that coverage must be confirmed by the next deployment CI run.
