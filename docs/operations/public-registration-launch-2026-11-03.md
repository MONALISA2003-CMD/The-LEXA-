# LEXA production release — public signup, verification, invitations, premium auth

## Release scope

- Public `/create-account` page from the login screen, **independent** of the one-time `/first-admin-setup` bootstrap.
- POST `/api/v1/auth/signup`: 15+ character password, hashed pending credential, one-time verification token via Resend, 24-hour expiry, per-email 120-second cooldown, anti-account-enumeration response.
- POST `/api/v1/auth/signup/verify`: token consumption and creation of a new PostgreSQL user, separate tenant, active owner membership, and `MAIN` branch in one serializable transaction. New tenant gets the existing default starter subscription trigger.
- POST `/api/v1/auth/invitations/preview`, `/join`, `/accept`: existing or new employees accept a seven-day one-time email invite into an exact business, role and branch scope. Existing active memberships are not overwritten.
- New premium `/verify-email` page requires an explicit click before consuming a one-time token, preventing automatic link scanners from creating an account.
- Strict RLS on pending signup verification table and scope propagated transaction-locally through Prisma.
- Resend integration reuses `sendTransactionalEmail()`; no API token or sender secret is committed.

## Production preflight

1. Verify Resend sender domain **lexaaamaal.com** or an appropriately verified subdomain; obtain DKIM/SPF/MX records from Resend and set them through Cloudflare DNS as directed by Resend. Do not guess those values. The ChatGPT source/deployment connector does not automatically grant the application permission to send mail.
2. Render **lexa-backend-api-live** must have `RESEND_API_KEY` (secret) and `RESEND_FROM_EMAIL` (verified sender, for example `LEXA <noreply@lexaaamaal.com>` only after verification) and `FRONTEND_PUBLIC_URL=https://lexaaamaal.com` in its runtime environment. A Render Blueprint declaration with `sync:false` does **not** populate an existing running service automatically.
3. Keep `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `DATABASE_RUNTIME_ROLE=lexa_app_runtime`, and existing production secrets. Do not reset or recreate Neon production.
4. Confirm the Vercel production frontend uses `VITE_API_BASE_URL=https://lexaaamaal.com` and `VITE_DATA_PROVIDER=api` and has same-origin API proxy rules; this was previously configured live.
5. Cloudflare DNS apex and www are already proxied, Full (strict) TLS and HTTPS are on. An auth rate-limit rule limits bursts on selected POST paths to 8 requests per 10 seconds per IP/colo; it does not replace backend rate limits or CAPTCHA/Turnstile protection.

## Deployment

Upload the **complete source ZIP**, not this markdown, to the root of `MONALISA2003-CMD/The-LEXA-` on `main` using **Add file → Upload files**. The GitHub `.github/workflows/repository-import.yml` workflow triggers on root `*.zip`, validates the archive, generates Prisma client, runs all tests and builds, and only then commits the source. Do not upload a ZIP containing `.github/`. The workflow and Git metadata remain in the GitHub repository unchanged.

The commit triggers the existing Render and Vercel integrations. Render's Docker start sequence runs `prisma migrate deploy` before serving traffic. Verify the backend deploy and migration are READY before testing new signup; wait for Vercel build READY (no automatic success assumption).

## Acceptance checks

- GET `/api/v1/health/live` returns status `ok`; GET `/api/v1/health/ready` says database `ok`.
- Visit `/sign-in`: **Create account** is visible. `/first-admin-setup` remains unavailable while an admin exists.
- Submit a **test email you own** through `/create-account`. You should receive a branded Resend email; open it and click **Verify my email and create account**. Ensure login session exists and new business/branch opens.
- Open another incognito browser: no signed-in session; no access to other businesses. `GET /api/v1/workspaces` without session must return 401.
- Invite a distinct test email through a business administrator's team UI and accept as a new employee; verify only invited business/role/branch are visible. Repeat with an existing account. Ensure token reuse is denied.
- Confirm expired tokens fail, invalid passwords fail, duplicate email does not enumerate account existence, first-admin bootstrap remains closed.
- Check Cloudflare Security Events and Render logs after release for 4xx/5xx spikes. Treat unverified Resend delivery as a blocker for public signup readiness.

## Rollback

- Revert the frontend deployment and Render app version independently if needed. The new migration is **additive**: do not drop the new table or reset Neon data on rollback.
- If Resend or mail configuration is not ready, signup returns HTTP 503 instead of falsely claiming verification was emailed; existing users can still sign in.
- Do not decommission Vercel, Render or Neon as part of this release. Cloudflare currently protects the proxied public hostnames while application hosting remains at Vercel/Render.

## Validation performed before archive

- `node --experimental-strip-types --test test/*.test.mjs`: 110/110 passed.
- `python3 backend/scripts/check-openapi-coverage.py`: 306 operations, 243 routes.
- `python3 backend/scripts/check-route-adapter-coverage.py`: 17 adapters.
- `node backend/scripts/check-backup-inventory.mjs`: 162 decisions.
- `python3 scripts/validate_repository.py` and `python3 scripts/check_repository_layout.py`: passed.
- Full `npm ci`, Prisma generation/validation, Nest build and Vite production build still **require the GitHub CI run**, because this file workspace lacks the npm registry/dependency cache.
