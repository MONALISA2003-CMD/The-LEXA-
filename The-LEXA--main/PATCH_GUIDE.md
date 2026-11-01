# LEXA backend integration — consolidated patch (including Render build fix)

This is the consolidated source overlay for the existing repository:

- GitHub repository: `MONALISA2003-CMD/The-LEXA-`
- Branch: `main`
- Render project: **LEXA BACKEND**
- Render web service: `lexa-backend-api-live`
- Render service ID: `srv-dbhp0f0m7kps73ffeqrg`
- Render API origin: `https://lexa-backend-api-live.onrender.com`
- Vercel project: **LEXA Review**
- Frontend URL: `https://lexareview.vercel.app`

**This ZIP is a source patch, not a deployment.** It contains the full earlier integration overlay plus the fix for the strict TypeScript build error reported by Render at `backend/src/core/core.controller.ts:198` (`TS2532`, possibly undefined `maximumFractionDigits`).

## 1. Apply the ZIP to GitHub

1. Download and extract this ZIP at the **root** of `MONALISA2003-CMD/The-LEXA-`, on branch `main`.
2. Allow the included `backend/` and `lexa-frontend/` folders to merge into the existing folders and replace matching files.
3. Keep all files that are not in this ZIP. Do not delete products, data, or unrelated project files.
4. Commit the extracted changes to `main` (suggested message: `Apply consolidated LEXA API patch and Render build fix`).

Do not upload the ZIP itself as one repository file. Extract its contents first.

## 2. Render settings — exact service

Open the service: `https://dashboard.render.com/web/srv-dbhp0f0m7kps73ffeqrg`

The service is configured for:

- Repository: `MONALISA2003-CMD/The-LEXA-`
- Branch: `main`
- Dockerfile path: `backend/Dockerfile`
- Docker context: `.`
- Region: Frankfurt

**Required manual setting:** under Settings → Build & Deploy, clear the custom **Docker Command** override currently set to:

`node dist/src/main.js`

Save the Docker Command as blank / unset. The `backend/Dockerfile` included here has the required default command:

`npx prisma migrate deploy && node dist/src/main.js`

The override must be cleared; otherwise it bypasses the migration command in the Dockerfile.

### Render environment variables

The Render service environment was updated on 30 October 2026 to set:

- `NODE_ENV=production`
- `FRONTEND_ORIGINS=https://lexareview.vercel.app`
- `LEXA_BOOTSTRAP_SECRET` (private one-time first-administrator setup secret)

Keep the existing `DATABASE_URL` unchanged. Do not paste database credentials into GitHub or any `VITE_*` variable. Do not add `LEXA_BOOTSTRAP_SECRET` to Vercel or commit it to the repository.

The existing Render service automatically deploys when a new commit reaches `main`; do not manually trigger another deploy immediately after the push unless auto-deploy does not start.

## 3. Vercel configuration

The Vercel project settings have already been updated:

- Root directory: `lexa-frontend`
- Framework: Vite
- Node version: `22.x`
- `VITE_DATA_PROVIDER=api`
- `VITE_API_BASE_URL=https://lexareview.vercel.app`

`lexa-frontend/vercel.json` routes `/api/v1/*` through the same-origin Render API proxy. Vercel production deployment `dpl_3BmEHectfypoUAt41ovHNo26XuvK` reached **READY** on 30 October 2026. Once the consolidated ZIP is committed, Vercel should automatically create a new production deployment from that commit.

## 4. Verify after the commit

Check the Render deployment for the new `main` commit. The build must complete successfully, and the service must become `live`.

Then verify:

- `https://lexa-backend-api-live.onrender.com/health/live` → HTTP 200
- `https://lexa-backend-api-live.onrender.com/health/ready` → HTTP 200 with `database: ok`
- `https://lexareview.vercel.app/api/v1/workspaces` → must no longer return `Cannot GET /api/v1/workspaces` (an authentication response may be expected before login)
- `https://lexareview.vercel.app/sign-in` loads and can request the backend API

The current live API still returned 404 for `/api/v1/workspaces` before this consolidated patch is deployed. Do not treat the existing healthy health checks as proof that the new API routes are deployed.

## 5. First administrator and scope

After the API is live, open `https://lexareview.vercel.app/sign-in`. The one-time first-administrator setup should be available only while the database has no users and the bootstrap secret is configured. Create the first administrator, then create the initial business workspace through onboarding.

Password reset email delivery remains unavailable until `PASSWORD_RESET_DELIVERY_URL` is configured to a trusted HTTPS delivery endpoint. Attachment storage, payment processors, tax-authority/EFRIS submissions, and certified statutory accounting/payroll reporting are outside this patch. Generic module reports are operational summaries, not certified statutory reports.

## 6. What this ZIP includes

It includes the earlier API foundation (Prisma schema and migration, authentication/session and first-admin setup, workspace and branch routes, catalogue, inventory, sales, payments and returns, dashboard and operational module endpoints, auth frontend wiring, and Vercel proxy) plus the Render TypeScript build correction in `backend/src/core/core.controller.ts`.

A successful TypeScript correction does not itself prove every business workflow is production-validated. Check the actual Render build/migration output and exercise the workflows before entering live business records.
