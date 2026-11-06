# LEXA Account Security — Prisma P1012 repair (6 November 2026)

## Reproduced failure

GitHub Actions run [#123](https://github.com/MONALISA2003-CMD/The-LEXA-/actions/runs/42108776451), import workflow `repository-import.yml`, fails at `npx prisma generate` with 14 schema errors.

**Root cause:** six newly introduced account-security/privacy Prisma inverse relation fields were declared on `Tenant`. Their related models all have `userId` and `user User @relation(...)`, so the matching inverse fields belong on `User`. The erroneous `Tenant` fields cause six missing-opposite errors, two generated foreign-key name collision errors for invalid one-to-one relations, and six missing-opposite errors for `User`.

## Fix

Move `trustedDevices`, `loginChallenges`, `accountSecurityEvents`, `privacyPreference`, `privacyConsentEvents`, and `authenticatorCredential` from `Tenant` to `User` in `backend/prisma/schema.prisma`. No SQL, migrations, live data, primary keys or user ownership mappings are modified. Add an automated regression test at `backend/test/prisma-account-security-relations.test.mjs`.

## Verification and limitations

- The regression test passes.
- 18 Python intelligence tests pass.
- API coverage passes: 496 operations / 401 routes.
- The catalogue, business-specialty and electronics contract synchronization checks pass.
- The source-only Node test run passes 385 tests; **four additional test files require npm-installed dependencies** and cannot run in the offline local container. Run the full suite in GitHub Actions.
- `prisma generate`, `prisma validate`, NestJS build and Vite build require package dependencies not available in the local offline environment. They must pass in the source-import workflow; no claim is made here that this CI job is already green.
- The import workflow restores committed `backend/package-lock.json` and `lexa-frontend/package-lock.json` from its preserved Git history; the source ZIP intentionally omits lock files per the existing import process. Do not upload this as a nested archive.

## Safe release steps

1. Upload the new root-level ZIP (not the old `LEXA_SECURITY.zip`) to the root of `MONALISA2003-CMD/The-LEXA-` on `main`.
2. Wait for the `Refresh LEXA from a clean repository ZIP` workflow to finish. It runs `npm ci`, Prisma generate/validate, backend tests/contracts/build, frontend build, and only then commits the source tree.
3. Confirm `LEXA Backend CI` is green on the resulting source commit, confirm Vercel deployment is `READY` for that exact commit, and check the Render deploy and `/health/ready` using the connected workspace or service dashboard.
4. If any further errors surface past Prisma, diagnose that *new* error before promoting the release. Do not apply destructive database changes to resolve Prisma relationship validation.

## Provider status at repair preparation

- GitHub source import #123: FAILED (unfixed ZIP; no successful import of revised source yet).
- GitHub connected integration: `create_branch` returned 403 `Resource not accessible by integration`; direct push through the available connection was blocked.
- Vercel `lexa_review`: last observed deployment from commit `d0bbf31043a47c6c17e404e2f197e7b37b390b55` was `READY` and custom domain `lexaaamaal.com` verified, **but this is the unfixed repository commit**.
- Render: connected tooling reports no workspace selected; its deployment status has not been verified. Do not mark Render green from the frontend build.
