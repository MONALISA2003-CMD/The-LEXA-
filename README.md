# LEXA — Increment 1–7 source handoff

This package contains the canonical application source for the current LEXA workstream. It is packaged for extraction at the Git repository root; `backend/`, `lexa-frontend/`, `.github/`, `docs/`, `deploy/` and `scripts/` are at the archive top level.

- Implementation/release status: `backend/INCREMENT_6_7_IMPLEMENTATION_STATUS.md`
- Deployment build repair record: `DEPLOYMENT_BUILD_REPAIRS_20261101.md`
- Increment 6/7 operator runbooks: `docs/workstream7/runbooks/README.md`
- Verification results: `VALIDATION_RESULTS_20261101.txt`

The archive includes the fixes for the new 1 November 2026 Vercel IndexedDB-index test failure and Render's invalid raw-body dependency, along with the earlier Vercel TypeScript and Render Nest build repairs. This is a source-repaired handoff; hosted green status must still be confirmed after committing and building the resulting source. See the deployment repair record for the exact validation boundary and release gates.
