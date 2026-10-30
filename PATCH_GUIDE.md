# LEXA backend integration patch

Overlay for the confirmed GitHub repository **`MONALISA2003-CMD/The-LEXA-`**, branch **`main`**. The Render project is named **LEXA BACKEND**; the service to use is **`lexa-backend-api-live`** (`https://lexa-backend-api-live.onrender.com`). The Vercel frontend project is **LEXA Review** (`https://lexareview.vercel.app/`).

**This ZIP is source code, not a deployment.** The connected GitHub integration denied direct writes with HTTP 403, so the overlay must be committed to `main` before Render/Vercel can build the changes. Do not extract it into a different repository.

## Included files

- `backend/Dockerfile` — installs OpenSSL for Prisma and runs the production migration command before starting NestJS.
- `backend/prisma/schema.prisma` and `backend/prisma/migrations/20261029195000_api_foundation/migration.sql` — adds account sessions/reset tokens, product catalogue/categories, module records, stock movements, sales, payments, returns and the workspace fields required by the frontend.
- `backend/src/app.module.ts`, `backend/src/health/health.controller.ts`, `backend/src/core/core.controller.ts`, `backend/src/core/csrf.guard.ts` — authentication bootstrap, cookie sessions, CSRF, workspace/branch CRUD, product/category CRUD, inventory, sales/payment/returns, dashboard/analytics, generic module records and reports, business-tools snapshots/tax profile/cash-ups/compliance notes, inbox/tasks/approvals/notifications/activity, global search, CSV imports and workspace backup/restore.
- `lexa-frontend/src/data/remote/apiAuth.ts`, `lexa-frontend/src/modules/auth/AuthPage.tsx`, `lexa-frontend/src/app/router.tsx` — first-administrator setup route that is available only while the database has no users.
- `lexa-frontend/vercel.json` — proxies `/api/v1/*` through the same Vercel origin to Render. This avoids relying on third-party cookies between `vercel.app` and `onrender.com` in browsers that restrict cross-site cookies.

## Apply and deploy

1. Extract this ZIP at the **repository root** so the included `backend/` and `lexa-frontend/` paths overlay the current files. Keep every file not included in this patch.
2. Commit the changes to `main` in `MONALISA2003-CMD/The-LEXA-` (or use the existing ZIP-extractor workflow and commit its extracted files).
3. In the Render project **LEXA BACKEND**, open the service **`lexa-backend-api-live`** and clear its **Docker Command override**. The current override `node dist/src/main.js` skips database migrations. Once cleared, the Dockerfile default will run `npx prisma migrate deploy && node dist/src/main.js`.
4. In Render, keep `DATABASE_URL` as the Neon connection string, `FRONTEND_ORIGINS=https://lexareview.vercel.app`, and `NODE_ENV=production`. Also configure `LEXA_BOOTSTRAP_SECRET` as a strong one-time setup code (at least 32 random characters). Use a code you choose and can keep private; do not put it in Vercel environment variables or commit it to Git. Do not expose database credentials in any `VITE_*` variable.
5. Let Render deploy the committed `main` revision. Confirm `https://lexa-backend-api-live.onrender.com/health/live` and `/health/ready` return 200.
6. After the commit containing `lexa-frontend/vercel.json` is deployed to Vercel, update `VITE_API_BASE_URL` in the **LEXA Review** Vercel project to **`https://lexareview.vercel.app`** (not the Render hostname), keep `VITE_DATA_PROVIDER=api`, then trigger a production redeploy. The Vercel rewrite will proxy `/api/v1/*` to Render and keep session cookies first-party.
7. Open `https://lexareview.vercel.app/sign-in`. The **first administrator setup** link should appear only when the database is empty and `LEXA_BOOTSTRAP_SECRET` is configured. Enter that one-time code on `/create-account` to create the first admin, then create the business workspace at `/onboarding`.

## Important configuration / limits

- The Neon database currently has zero users. First-account creation is one-time and closes once the first user exists; it is not public account registration.
- Password recovery is fail-closed until `PASSWORD_RESET_DELIVERY_URL` is configured to a trusted **HTTPS** delivery webhook. The webhook must accept POST JSON `{ "email", "displayName", "resetUrl", "expiresInMinutes" }` and send the link. `FRONTEND_PUBLIC_URL` defaults to `https://lexareview.vercel.app`. Do not point it at an untrusted endpoint.
- Attachment upload/download and external file storage are **not implemented** in this patch. Message attachments are rejected. Payment gateways, tax authority/EFRIS submissions, official compliance determinations and full statutory payroll/accounting integrations are not implemented.
- The module-record service persists operational register records in PostgreSQL; report snapshots are generic record-based summaries and are **not certified accounting or statutory reports**. Some richer business integrations and contract routes still require separate implementation and integration tests.
- The live Render service is currently healthy and connected to Neon, but until this source overlay is committed and deployed, the live API still returns 404 for frontend-required endpoints such as `/api/v1/auth/csrf` and `/api/v1/workspaces`.
- Validation performed on this overlay includes a TypeScript syntax transpile and a stubbed TypeScript check. A full build and Prisma schema validation could not be run without installing the repository's actual dependencies. Verify the build and migrations in the Render deploy logs before using real business records.
