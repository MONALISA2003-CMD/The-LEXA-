# LEXA Render + Vercel build repair — 31 October 2026

## Base

Prepared against the current repository source referenced by the supplied Render/Vercel build logs (`main`, short SHA `2d95c05`). The overlay contains only the files changed for these build blockers. Extract at the repository root, preserving the folder paths.

## Root causes and corrections

### Render

The Dockerfile ran `scripts/apply-auth-security-patch.mjs` after copying the backend. That script relied on exact text anchors from an older `core.controller.ts`. The current controller had already been modified: its Nest import included `Headers`, the login handler established workspace context, and password recovery already used the Resend email adapter. The import anchor no longer matched, so the build aborted before Prisma generation or Nest compilation.

Correction: authentication/security controls are now versioned in `backend/src/core/core.controller.ts`, `backend/src/main.ts`, and `backend/prisma/schema.prisma`. The Dockerfile no longer rewrites source during image build. It copies the reviewed source, generates Prisma Client, and compiles it. The `AuthRateLimit` Prisma model corresponds to the existing `20261030130000_auth_security_controls` migration. Proxy awareness remains enabled in the Fastify adapter.

### Vercel

`apiClient.ts` passed `headers: undefined` to an optional `RequestInit`-derived property. With `exactOptionalPropertyTypes: true`, an omitted optional property and an explicit `undefined` are different types.

Correction: `put` and `patch` now spread `{ headers }` only when headers were provided. The file passes a standalone strict TypeScript check with `exactOptionalPropertyTypes` enabled.

## Additional consistency repairs

- Added `/auth/recovery/status` to the OpenAPI contract, which is implemented by the API.
- Updated the password reset contract minimum length to 15 to match the source policy.
- Unified password reset and security-notification sender configuration on `RESEND_API_KEY` + `RESEND_FROM_EMAIL`.
- Updated `AUTH_SETUP_GUIDE.md` to use the actual sender environment variable name.

## Checks performed in this environment

- Auth security source patch applied and repeated safely (two successful no-op/idempotence runs after source was updated).
- Frontend API client + runtime config strict type check passed with `exactOptionalPropertyTypes`.
- TypeScript/TSX syntax transpilation: 135 files, zero syntax diagnostics.
- OpenAPI route inventory: 159 operations across 124 routes, exact match.
- Route-to-adapter coverage: 16 adapters passed.
- Backend authorization tests: 12/12 passed (`node --experimental-strip-types --test backend/test/*.test.mjs`).
- Ledger coverage: nine source workflows passed.

## Not verified here

A complete `npm install` timed out in this local container. Therefore I could not run dependency-backed `nest build`, `npx prisma generate/validate`, frontend `tsc -b`, `vite build`, or a full Render/Vercel deployment on this source. The supplied logs show Vercel's unit tests passed (97 tests) before the two reported strict TypeScript errors; this patch addresses those errors. Render did not reach Prisma generation or Nest compilation because the patch script failed first.

No GitHub files were written and no Render/Vercel deployment was triggered by this repair. To verify cloud status, apply this overlay to the repository root and let the connected `main` deployments build the same commit. Render's service health-check path should separately be set to `/health/ready` in service settings; the build log alone cannot confirm readiness.

## Render runtime configuration

Use a least-privileged PostgreSQL role that has the grants from the RLS migration, and configure `DATABASE_RUNTIME_ROLE` only after that role exists. For recovery/invitation email delivery, configure `RESEND_API_KEY`, a verified `RESEND_FROM_EMAIL`, and `FRONTEND_PUBLIC_URL` in Render secrets/environment. Do not put Resend credentials in Vercel `VITE_*` variables.
