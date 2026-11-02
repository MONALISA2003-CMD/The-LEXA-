# LEXA Handoff — Single-Service AI Architecture

Source package: LEXA full repository with Workstream 7 build repairs, Workstream 8 reporting/SaaS foundations, and the single-service NestJS AI router.

## Main entry points

- `REPORTING_AND_SAAS_IMPLEMENTATION_20261101.md` — scope, architecture, tests and deployment boundaries.
- `AI_ROUTER_RENDER_CONFIGURATION_20261101.md` — exact environment variable names and Render setup.
- `SINGLE_SERVICE_AI_REDESIGN_20261101.md` — architecture decision and rollout notes.
- `render.yaml` — one existing Render web service only; no extra paid services.
- `backend/src/workstream8/ai-router.service.ts` — native provider router and fallback policy.
- `backend/src/workstream8/workstream8.controller.ts` — tenant/branch authorization, plan entitlements, aggregate data scope and AI usage ledger.
- `backend/prisma/migrations/20261101180000_workstream8_saas_ai_reporting/migration.sql` — additive SaaS/usage/support schema migration.

## Keep the guarantees

1. Core LEXA must not require an AI provider to start or run normal workflows.
2. One assistant serves business-owner workflows. There is no separate public-help and business-AI mode in the frontend.
3. Only permission-filtered aggregate facts may be sent to providers; no individual customer/employee records, contact details, salaries, credentials or uploaded documents.
4. No model tools or write permissions. No AI-created transaction, payment, approval, user or accounting entry.
5. Tenant AI usage is reserved in a database transaction before provider calls and stored without prompt/response/file content.
6. Paid provider routing is not implemented in this development build. OpenAI and the second Gemini credential remain stored but unused.
7. Document extraction is disabled in this phase; it will be added after the one-service router is validated.
8. Additive migration only. Preserve Workstream 7 migration history and data.

## Validation boundary

The native router unit tests and Render Blueprint shape are validated locally. Full dependency-backed Nest/Vite builds, live provider smoke tests, hosted Render deployment of this exact source package, Vercel build and the Workstream 8 migration on staging/production Neon are not yet verified. Do not call AI responses live until the source package is applied and the deployment health checks pass.
