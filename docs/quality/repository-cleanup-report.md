# Repository cleanup report

**Prepared:** 2 November 2026  
**Source:** uploaded repository archive, cross-checked against GitHub `main`, Vercel, Render and Neon.

## Canonical structure

The repository now has one authoritative frontend and backend:

- `backend/` — NestJS API, Prisma schema and production migrations, domain modules, worker implementation, contract/security tests.
- `lexa-frontend/` — React, TypeScript and Vite application, API adapters, OpenAPI contract and browser tests.
- `docs/` — architecture, deployment, design, security, operations and release-quality guidance.
- `scripts/` — repository cleanup and structural validation.
- `.github/workflows/` — application CI and canonical source archive replacement.

Nested repository exports, duplicate app trees, old patch bundles, obsolete project handoffs, the unused Python/LiteLLM service and the unused multi-service deployment reference stack were removed. The source archive is built from repository-root files and contains no wrapper directory.

## Source improvements

- Normalized business-domain source names for AI, people and projects, commerce and finance, operations and module workspaces.
- Renamed old phase-prefixed CSS classes and removed phase-labelled frontend file names.
- Renamed backend test files and business-rule files to describe their domain purpose.
- Consolidated operating guides into `docs/` and used stable professional runbook names.
- Added a compatibility mapping for legacy runbook paths stored in Neon; production rows remain unchanged.
- Corrected the reports module accent metadata and added a review-only bank-reconciliation handoff to accounting.
- Kept the AI router inside the active NestJS API; removed the unused Python/LiteLLM service copy.
- Retained empty initial data behavior and the tests that guard against seeding demo records.

## Production compatibility exceptions

The 30 applied Prisma migration directories retain their exact existing identifiers. Neon records those names in `_prisma_migrations`; renaming or removing them would break migration history. They are the only active filesystem names that still contain historical phase/increment/workstream terms.

The established people-and-projects API path segment `/workstream6` also remains in the controller, contract and authorization policy so existing clients are not broken. Source filenames, module names, navigation and documentation use the professional `people-projects` terminology.

## Validation

- Repository layout validation: passed.
- Backend tests: **84 passed, 0 failed**.
- OpenAPI exact-match check: **296 operations across 235 routes**, no missing or orphan operations.
- Route-to-adapter check: **18 backend-backed domain adapters** connected to the shared API client.
- Backup inventory check: passed for 161 table decisions.
- ZIP integrity and archive structure are checked when the final archive is generated.

## Checks not completed locally

The backend NestJS build could not run in this workspace because dependencies are not installed (`nest: not found`). The frontend dependency installation previously timed out, so its updated 99-test suite and full TypeScript/Vite build could not be rerun locally. The two failures observed in the latest Vercel build have been corrected in source, but remain awaiting CI verification.

The latest Render build compiled the Docker image and NestJS app, but startup failed when Prisma could not obtain the PostgreSQL advisory migration lock (`P1002`, 10-second timeout). The latest Vercel production deployment also failed its two frontend tests; the previous READY deployment remained live during inspection.

## Production safety

No Neon production data, schema, migration ledger, Render environment variables, Render service settings, Vercel settings or production deployments were changed while preparing this package. This archive has not been committed to GitHub. The repository replacement workflow is included for controlled use after its workflow file has been installed with GitHub's required workflow permission.
