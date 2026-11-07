# LEXA validated source ZIP — operator release instructions
**Prepared 2026-11-07 | Target repository: MONALISA2003-CMD/The-LEXA-**

## Correction for GitHub Actions #170 (npm 10 dependency lock)
GitHub run [#170](https://github.com/MONALISA2003-CMD/The-LEXA-/actions/runs/42376682727)
failed before tests with `npm ci` reporting
`Missing: webpack@5.112.2 from lock file`. The original archive was
generated with npm 11; Node 22 on GitHub Actions runs npm 10, whose peer
dependency layout requires an additional nested webpack lock entry.
The backend `package-lock.json` has now been regenerated with **Node 22 +
npm 10.9.4**, without forcing upgrades, and a CI-only offline
`npm ci --dry-run` graph check was added to `scripts/validate_repository.py`.
Both backend and frontend full clean installs have been verified under npm 10.
Do not use the earlier `LEXA_GitHub_Import_Validated_2026-11-07.zip`.

As of preparing this correction, GitHub `main` contains the earlier
**failed ZIP upload** at commit `2bd5011a5a24d822eda03171fb8436ed85d3c8cf`.
Upload the new ZIP **under its new filename** as the ONLY changed file in its
own GitHub commit. Leave the old failed ZIP alone: the successful importer
removes it while replacing the tree. Avoid another concurrent push during
the import.

## What this ZIP does
The ZIP is a full source tree, with the backend and frontend at the root. The existing
GitHub workflow `.github/workflows/repository-import.yml` imports this ZIP only
when uploaded **unchanged to the root of `main`**. The ZIP contains no
`.github` folder (GitHub preserves the existing workflows), no `.git`,
`node_modules`, build outputs, nested ZIPs, or credentials.

It includes the public browser-only demo, employee/business sample views,
a deterministic sample Assistant, clearer Security copy, and the signed webhook
gateway/controller update. The webhook migration in this ZIP is **phase 1 only**:
it introduces restricted gateway *functions* without revoking direct table
permissions required by API instances that might still be running. Its tests
prove that the legacy and new callers can coexist while the API restarts.

Phase 2 webhook RLS/revocation is in
`docs/deployment/notification-webhook-rls-enforcement.sql` for manual review **later**.
It is NOT automatically executed by Prisma/Render, on purpose. Do not describe
the two webhook tables as RLS-protected before phase 2 completes.

## GitHub upload procedure
1. Verify `main` still matches the expected prior baseline and check no other
   ZIP import/push is running. Upload **this one ZIP file** to the repository
   **root directory on main**, do not extract it by hand or wrap its contents.
2. GitHub's **Refresh LEXA from a clean repository ZIP** workflow detects
   the one changed root-level ZIP, validates file paths and layout, then runs:
   `npm ci`, Prisma generate/validate, backend tests, `contract:check`,
   backend build, and `npm ci` + frontend build. It then commits the
   validated clean source back to `main` and deletes the uploaded ZIP.
3. The existing `backend-ci.yml` and `lexa-staging-e2e.yml` workflows are
   preserved, not replaced by the ZIP. Their status is NOT a substitute for
   inspecting the first import's success and the generated source commit.
4. If the import fails, inspect the failure and do NOT repeatedly upload
   different ZIPs before the previous workflow has completed.

## Live Render — configuration prerequisite
The current live `lexa-backend-api-live` service follows `main` and at
verification had **autoDeployTrigger=commit**, **no healthCheckPath**, and no
worker service. Its checked-in blueprint lists `checksPass` and
`/health/ready`, but the *live service must be configured separately*.
Before uploading, in Render:
- set auto-deploy to **after CI checks pass**, or temporarily disable it
  during the ZIP import and deploy only the validated source commit;
- configure readiness probe **`/health/ready`**;
- confirm Dockerfile `backend/Dockerfile`, Docker context repository root,
  direct `DATABASE_URL_UNPOOLED` (non-pooler), runtime pooled `DATABASE_URL`,
  DB role, Resend webhook signing secret and sender settings;
- preserve production secrets/URLs. Do not paste secrets into the ZIP.

The Docker start applies Prisma migrations before the NestJS API. Phase 1 is
backward compatible with that order. Still review deploy logs, migrations and
`/health/ready` before trusting production. Workers, durable payment-approval
email retries, mandatory admin MFA, Sentry and OTel export configuration remain
separate operational gates and are not solved merely by uploading the ZIP.

## Live Vercel — deployment checklist
Project `lexa_review` is linked to the same GitHub repository, uses Node
`22.x`, and had a READY production deployment at the previous baseline.
Verify the Vercel project still builds from **`lexa-frontend`** using
`npm ci`, `npm run build`, and output `dist`; the expected three
entries are `/lexa.html` (website), `/app.html` (authenticated customer
app), and `/demo/index.html` (browser-only demo). The
`lexa-frontend/vercel.json` rewrites proxy `/api/v1/` to the Render
API and route the canonical `/demo/` without customer API credentials.
Verify GitHub import's final source commit is the SHA Vercel deploys,
then inspect the READY status and live routes.
Note that protected `*.vercel.app` previews may require an authenticated
viewer; test on authorized domains without bypassing protection.

## Post-import smoke tests
- GitHub import workflow and the subsequent backend/browser workflows show green;
  Render deployment points to the final cleaned source commit and readiness
  reports `database: ok`.
- `https://lexaaamaal.com/` returns the public site.
- `https://lexaaamaal.com/demo/` displays the sample launch; changing
  sample business records must not affect real customer records.
- `https://lexaaamaal.com/demo/demo` redirects to `/demo/`.
- Real sign-in and protected application routes remain accessible only after auth.
- Verify webhook signature failures, legitimate signed events, replay/idempotency,
  and email delivery outcomes. Monitor Render logs for 5xx/DB failures.
- Do not initiate Phase 2 RLS until old API instances have drained and a
  responsible operator has reviewed the SQL, backup, and retry tests.

## Verification scope and remaining issues
The release ZIP is **import/build-verified**, not an unconditional guarantee of
production availability. Frontend unit tests, compiled demo E2E, nine customer
browser tests, backend Node/Python tests, contract checks, Prisma and Docker-
equivalent backend build were tested in isolated tooling. The updated npm
production audit reports **0 high/critical** (24 moderate). Browser tests
use fictional/local data and do not certify all live accounting/payroll flows.

**No production credentials, customer data, or database migration were
changed during package construction.**
