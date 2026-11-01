# LEXA Workstream 8 handoff

Source package: LEXA full repository with Workstream 7 build repairs and Workstream 8 reporting/SaaS/Intelligence implementation.

## Main entry points

- `WORKSTREAM8_IMPLEMENTATION_20261101.md` — delivered scope, architecture, tests and deployment boundaries.
- `WORKSTREAM8_RENDER_KEYS_20261101.md` — exact non-secret variable names and Render activation sequence.
- `docs/workstream8/RENDER_BLUEPRINT_AND_AI_ACTIVATION.md` — corrected first-sync order, secret-group lifecycle and frontend readiness behaviour.
- `scripts/validate_workstream8_render.py` — checks Blueprint private-service types, empty provider group, fail-closed readiness flags and absence of secret-like literals.
- `services/intelligence/README.md` — Python and LiteLLM data classification/provider/security guide.
- `render.yaml` — two private services plus wiring for the existing backend; requires Blueprint sync and provider secrets.
- `backend/prisma/migrations/20261101180000_workstream8_saas_ai_reporting/migration.sql` — additive SaaS/usage/support schema migration.

## Keep the guarantees

1. Core LEXA must not require Python, LiteLLM, Redis or an AI provider to start and run normal workflows.
2. Public/free pool: generic product help only, never tenant records.
3. Paid pool: only permission-filtered, scope-filtered aggregate summaries from typed source records and posted ledgers.
4. No model tools or write permissions. No AI-created transaction, payment, approval, user or accounting entry.
5. Tenant AI usage is reserved in a database transaction before provider calls and stored without prompt/response/file content.
6. Document extraction is local and returns untrusted text for review; it is not submitted to a model or persisted by the intelligence service.
7. Additive migration only. Preserve Workstream 7 migration history and data.

## Validation boundary

The previous backend regression suite passed 80/80. The updated Python Intelligence suite passes 13/13, Python compilation passes, LiteLLM/Render YAML parses, and `scripts/validate_workstream8_render.py` passes. Static TypeScript/TSX transpilation and frontend prebuild scripts were previously run in the repair workspace; a new Vite production build has not been run because frontend dependencies are not installed in this workspace. The current Vercel `lexa_review` production deployment for commit `68d48284ac8231a1a69ded9bd31434ab2e0f96cb` reports `lint_or_type_error` (`npm run build` exited with 2). Render Blueprint sync, private service deployment, provider calls and the Workstream 8 migration on staging/production Neon have not been run. No provider credentials are included in this package.
