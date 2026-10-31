# 31 October 2026 — Render/Vercel build and release notes

## Reported source-level compiler errors fixed in this overlay

- Frontend `TeamAccessPanel.tsx`: removed unused `Building2` import and narrowed the optional draft object before accessing branch values in the state updater.
- Backend `general-ledger.controller.ts`: explicitly typed the journal UUID assignment boundary.
- Backend `ledger-posting.ts`: explicitly typed the raw account-query row so `accounts.map` is not implicit `any`.

## Current hosted status observed later on 31 October

The provider metadata was queried for the configured Render service `lexa-backend-api-live` and Vercel project `lexa_review`.

| Source SHA | Render | Vercel |
|---|---|---|
| `1e6ed1b9589b775e033976dc71ce6c9c8f1174d8` | `build_failed` | `ERROR` |
| `51bd9fbaeb1ad5830aecbf055491239e4ce85f45` | `live` | `READY` |

The second SHA is the latest common observed green deployment, but it predates this implementation overlay. The corrected source ZIP is not yet in GitHub and cannot be green in either provider until it is applied to a reviewed commit and built there.

## Render health configuration

The configured Render API service reported an empty `healthCheckPath` in the provider metadata. Set it to exactly `/health/ready`. Source code deliberately excludes `/health/live` and `/health/ready` from the Nest `/api/v1` prefix; readiness runs `SELECT 1` and returns 503 when PostgreSQL is unavailable.

## Why full builds remain pending here

Dependency installation repeatedly timed out in the execution container. This workspace completed the OpenAPI, adapter, ledger, authorization and TypeScript syntax gates, but did not execute complete `nest build`, Prisma CLI validation/migration tracking, frontend `tsc -b`, or `vite build`. CI workflows are configured to perform those dependency-backed gates after the ZIP is applied.

## Deployment safety

- No GitHub writes, Render deploys, Vercel deploys or production migrations were made.
- Do not set Render `DATABASE_RUNTIME_ROLE=lexa_app_runtime` until the RLS migration is applied successfully to the target database.
- Configure `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL` in Render secrets; prove recovery and invitation delivery before enabling user-facing recovery.
- Both platforms must be deployed from the exact same reviewed full SHA. Capture successful build IDs and test `/health/live` and `/health/ready` after deploy.
