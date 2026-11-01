# LEXA — Increment 1–7 source handoff

This package contains the canonical application source for the current LEXA workstream. It is packaged for extraction at the Git repository root; `backend/`, `lexa-frontend/`, `.github/`, `docs/`, `deploy/` and `scripts/` are at the archive top level.

- Implementation/release status: `backend/INCREMENT_6_7_IMPLEMENTATION_STATUS.md`
- Deployment build repair record: `DEPLOYMENT_BUILD_REPAIRS_20261101.md`
- Increment 6/7 operator runbooks: `docs/workstream7/runbooks/README.md`
- Verification results: `VALIDATION_RESULTS_20261101.txt`

The archive includes the Dexie v2 compound-index migration, the corrected `fastify-raw-body` package, the reported Vercel exact-optional TypeScript repairs, and the Render Fastify/Nest duplicate JSON-parser startup repair. The latest supplied Vercel log passed 99/99 tests before type-checking; the latest Render log passed install, Prisma generation and Nest compilation before runtime startup. The newest fixes have not yet been redeployed, so hosted green status is not claimed. See `DEPLOYMENT_BUILD_REPAIRS_20261101.md` for incident chronology, upstream root-cause research, security warnings, migration status and remaining release gates.
