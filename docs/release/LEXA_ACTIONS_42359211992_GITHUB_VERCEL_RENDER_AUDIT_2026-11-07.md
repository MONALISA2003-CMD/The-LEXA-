# LEXA — GitHub Actions 42359211992 / Vercel / Render release audit

**Date:** 2026-11-07 (EAT)  
**Release:** Corrected canonical-source ZIP, based on the previous 911-file landing, demo, admin-payment and sign-in release.  
**Production writes:** None. **Source pushed:** No. **Deploys triggered:** No.

## Evidence and exact failure

- GitHub run `42359211992`, job `128363794143`, failed in `Test and build backend` after successfully importing the ZIP, validating layout, passing 484 Node tests, 18 analytics tests, 497-operation OpenAPI coverage, 19 API adapter checks, 563 route registrations, 57 migration syntax checks and the 227-decision backup inventory.
- NestJS TypeScript compiler reported `TS2345` at `backend/src/platform-administration/platform-administration.controller.ts:408`: passing `string | null | undefined` as the approval email recipient where the helper accepts `string | null`. The frontend build was **skipped**, not passed.
- The customer-facing approval email logic is deliberately after the subscription-payment transaction commits. It must not grant access based on a payment screenshot, internal claim ID or unauthenticated link.

## Changes to source

1. Restrict email notification to the explicit `approved: true` decision, not a broad optional-property presence check; duplicate/already-approved outcomes continue to return without sending another message.
2. Normalize the optional email address using `emailRecipient ?? null` before calling the post-commit notification helper. The value is always within its declared `string | null` parameter type.
3. Update the backend payment-email security contract test to verify both the narrowed approval branch and safe optional email handling. Keep the separately typed offline-payment notification call unchanged.
4. Add a ZIP-import preflight check that rejects the exact unsafe TS2345 call pattern before it reaches GitHub; add positive and negative regression tests.
5. Preserve the LEXA public marketing homepage, `/demo/` browser-only business, 54 example registers, private application routes, approved account and payment safeguards, midnight sidebar and eleven department color mappings.

## Verified locally

- Backend Node test suite: **484 passed**.
- Backend analytics Python suite: **18 passed**.
- Repository preflight Python suite: **20 passed**.
- OpenAPI exact match: **497 operations across 402 routes**.
- Backend route uniqueness: **563 registrations across 36 controllers**.
- API adapter wiring: **19 adapters**.
- Migration syntax structural check: **57 migration files**.
- Backup inventory: **227 table decisions**.
- Palette: **11 groups and 65 navigation routes**.
- Frontend static TS/TSX syntax and relative-import audit: **248 source files, 842 imports, zero issues**.
- Frontend source-generation scripts and public/demo release rules pass; generators did not rewrite the protected UI files.
- Source ZIP importer preflight validates the built archive, including CRC and allowed paths; lockfiles are restored by the importer from Git, never included in the upload ZIP.

**Not locally verifiable:** Full backend NestJS compilation with repository-installed dependencies, frontend `tsc -b`, Vite's two-app build, full Playwright browser E2E, or customer email delivery. These must run with dependencies and credentials in GitHub/Vercel/Render.

## Live infrastructure audit (read-only)

| System | Latest observation | Limitation |
|---|---|---|
| GitHub Actions | Run 42359211992 failed TS2345; most recent related E2E skipped | Corrected ZIP not uploaded yet |
| Vercel `lexa_review` | Latest production build READY for ZIP-upload commit `0ec0aae...`; `lexaaamaal.com` and `www.lexaaamaal.com` verified | The build did not compile this corrected source because ZIP importer failed |
| Render `lexa-backend-api-live` | Most recent deploy live for ZIP-upload commit `0ec0aae...`; error-level logs for 09:00-09:50 UTC returned 0 entries | Same caveat: old imported source may still be running; HTTP readiness probe not configured |
| GitHub branch | Main still reflects the failed-upload series | No repository writes made |

### Critical Render operational configuration gap

Read-only Render service state reports:

- `autoDeployTrigger: commit`, even though `render.yaml` asks for `checksPass`.
- `healthCheckPath: ""`, even though `render.yaml` asks for `/health/ready`.

The Blueprint file does not automatically modify existing service settings. In the Render dashboard, set **Auto-Deploy = After CI checks pass** and **Health Check Path = `/health/ready`** for the existing production backend. Confirm the service is using the verified `FRONTEND_PUBLIC_URL=https://lexaaamaal.com` and a valid email-sender configuration; do not print or share secret values. Do not change database connection strings or run manual migration resolution without investigating first.

## Safe publish sequence

1. Upload **one** final ZIP to the root of GitHub `MONALISA2003-CMD/The-LEXA-`, without unzipping it. Do not separately upload any source file or `.github` folder from the archive.
2. Wait for **Refresh LEXA from a clean repository ZIP** to complete successfully; check that **both backend and frontend test/build steps** passed and the importer committed source to `main`.
3. Wait for the **LEXA isolated browser workflow tests** to pass on that new imported-source commit.
4. Check the Vercel production build for that **same imported-source SHA**, not the ZIP-upload SHA, until its status is READY.
5. Check the Render deploy for that **same imported-source SHA**, confirm service is Live, and verify `/health/ready` responds successfully.
6. Manually open `https://lexaaamaal.com/`, `/demo/` and `/sign-in` on phone and desktop; verify demo checkout, stock, finance records and reset never call the production API.
7. With a controlled **non-customer** test account and verified receipt, confirm one approval-email notification, correct secure sign-in URL, and no duplicate notifications on repeat requests. Never treat a screenshot as receipt verification.

The release is **not globally green** until these post-upload checks pass. Do not infer successful deployment from a READY/Live result on a ZIP-only commit.
