# LEXA — Increment 1–7 source handoff

This package contains the canonical application source for the current LEXA workstream. It is packaged for extraction at the Git repository root; `backend/`, `lexa-frontend/`, `.github/`, `docs/`, `deploy/` and `scripts/` are at the archive top level.

- Implementation/release status: `backend/INCREMENT_6_7_IMPLEMENTATION_STATUS.md`
- Deployment build repair record: `DEPLOYMENT_BUILD_REPAIRS_20261101.md`
- Increment 6/7 operator runbooks: `docs/workstream7/runbooks/README.md`
- Verification results: `VALIDATION_RESULTS_20261101.txt`

The archive includes the Dexie v2 compound-index migration, the corrected `fastify-raw-body` package, the reported Vercel exact-optional TypeScript repairs, and the Render Fastify/Nest duplicate JSON-parser startup repair. The latest supplied Vercel log passed 99/99 tests before type-checking; the latest Render log passed install, Prisma generation and Nest compilation before runtime startup. The newest fixes have not yet been redeployed, so hosted green status is not claimed. See `DEPLOYMENT_BUILD_REPAIRS_20261101.md` for incident chronology, upstream root-cause research, security warnings, migration status and remaining release gates.


## Workstream 8 — Reporting, SaaS controls & Intelligence

The first Workstream 8 implementation slice is documented in [WORKSTREAM8_IMPLEMENTATION_20261101.md](WORKSTREAM8_IMPLEMENTATION_20261101.md). It adds source-ledger reporting, tenant plan/feature/usage controls, and a single-service AI router in the existing NestJS backend. The current development deployment uses only `lexa-backend-api-live`; it does not create private LiteLLM or Python services. Provider keys are entered in that service's Render Environment settings and are never committed to Git. See [WORKSTREAM8_RENDER_KEYS_20261101.md](WORKSTREAM8_RENDER_KEYS_20261101.md). The migration is additive and must be applied only after the backend release; no Workstream 7 migration should be rolled back.
