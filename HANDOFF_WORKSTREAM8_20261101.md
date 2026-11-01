# LEXA Workstream 8 handoff

Source package: LEXA full repository with Workstream 7 build repairs and Workstream 8 reporting/SaaS/Intelligence implementation.

## Main entry points

- `WORKSTREAM8_IMPLEMENTATION_20261101.md` — delivered scope, architecture, tests and deployment boundaries.
- `WORKSTREAM8_RENDER_KEYS_20261101.md` — exact third-party keys to obtain and Render activation sequence.
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

Backend tests, Python tests, static TypeScript/TSX transpilation, Python compilation, YAML parsing, backup inventory, OpenAPI coverage, adapter coverage and ledger coverage pass in the repair workspace. The full dependency-backed Vite/Nest builds, hosted provider calls, Render Blueprint sync, private service deployment and Workstream 8 database migration on a staging or production Neon database have not yet been run.
