# LEXA sign-in, password recovery and account security update

This ZIP is a repository-root overlay for `MONALISA2003-CMD/The-LEXA-` on `main`. It does not replace the whole repository and it does not alter existing products, workspaces or business records.

## What is included

### Frontend
- A refreshed, responsive LEXA sign-in, first-administrator setup, forgot-password and reset-password experience using the current LEXA navy/blue/cyan identity.
- Password visibility controls, mobile-friendly fields, accessible labels and a live 15-character passphrase guide.
- A new Account Security panel in Settings for changing the signed-in user's password.
- A live recovery-email configuration indicator so the interface does not claim that email recovery is ready when no sender is configured.
- `no-referrer` protection for recovery-token pages, baseline browser security headers in Vercel, and a single-page-app fallback so direct `/sign-in`, `/forgot-password`, `/reset-password` and `/onboarding` URLs load correctly.

### Backend and database
- 15-character minimum for new passwords, Unicode NFKC normalization, 1024-character maximum, no composition rules, and compatibility attempts for previously stored password hashes.
- Salted scrypt password hashes.
- Database-backed rate limits for sign-in and password-recovery requests, using the client IP resolved from the trusted Render proxy.
- Secure, hashed, one-time recovery tokens that expire after 30 minutes.
- Generic recovery responses so the public endpoint does not disclose whether an email address has an account.
- Password-change endpoint. A successful change revokes the user's other sessions and keeps the current device signed in with a rotated session token.
- Password reset revokes all current sessions and does not automatically sign the user in.
- Resend email API delivery, while retaining compatibility with the existing `PASSWORD_RESET_DELIVERY_URL` webhook contract.
- A migration adding the authentication rate-limit table.

## Important: how the backend patch is applied

GitHub has blocked direct write access for the connected integration. To avoid replacing the 140 KB core controller file in your phone-based upload workflow, this ZIP includes a deterministic build-time patcher under `backend/scripts/auth-patch/`.

The updated Dockerfile runs that patcher inside the Render image build **before** Prisma Client generation and TypeScript compilation. It checks that every expected source anchor exists exactly once and fails the build instead of silently applying a partial patch. The patch script is idempotent. It modifies only the temporary Docker build copy; the patcher and its patch snippets remain versioned in the repository so the build is repeatable.

The frontend's `prebuild` runs a similar idempotent script to insert the new Account Security panel into the existing Settings page without replacing the full page implementation.

## Apply the ZIP

1. Extract the ZIP at the repository root. Keep the `backend/` and `lexa-frontend/` folder structure intact and allow matching files to be replaced.
2. Do not upload the ZIP as a single file. Extract its contents into the existing repository.
3. Commit the overlay to `main`.
4. Render should automatically build `backend/Dockerfile`; Vercel should automatically rebuild the `lexa-frontend` project from `main`.

Your Render service is already configured with the Docker Command override empty. Keep it empty. The Dockerfile default runs `npx prisma migrate deploy` before starting the API. Do not run the migration manually.

## Render email configuration required for real password-reset email

The backend code is ready for Resend, but an email provider account and a verified sending domain are external requirements. In Render, open **LEXA BACKEND → Environment** and add:

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | Your private Resend API key. Mark it secret. Do not put it in GitHub or any `VITE_` variable. |
| `RESEND_FROM_EMAIL` | A sender on a domain verified in Resend, for example `LEXA Security <security@your-verified-domain>` (replace with your verified domain). |
| `FRONTEND_PUBLIC_URL` | `https://lexareview.vercel.app` (already configured). |

The previous `PASSWORD_RESET_DELIVERY_URL` webhook remains supported for password-reset delivery. When configured, it takes precedence over Resend for recovery messages and receives `{ email, displayName, resetUrl, expiresInMinutes }` as before.

After adding or changing Render variables, Render will redeploy the service. In **Settings → Account security**, the Password recovery status will change to configured only when a sender is actually available.

Resend setup guide: https://resend.com/docs/api-reference/emails/send-email

## First administrator setup

The Neon database was verified to contain the required `users`, `sessions` and `password_reset_tokens` tables, and it had zero user accounts when inspected. The existing one-time first-administrator route is therefore available.

1. After both deployments are green, open `https://lexareview.vercel.app/sign-in`.
2. Select **Set up the first administrator**.
3. Enter the one-time setup code supplied separately in the ChatGPT conversation, your name, your account email, and a unique passphrase of at least 15 characters.
4. After registration, LEXA signs you in and sends you to `/onboarding` to create the first business workspace.
5. Once the first admin account exists, remove `LEXA_BOOTSTRAP_SECRET` from Render Environment. The registration endpoint is already closed by the database user-count check, but removing the secret disables the bootstrap capability completely.

Do not put the bootstrap code into GitHub. Do not reuse it as your account password.

## Security behaviour

- New passwords: 15+ characters, maximum 1024; spaces and passphrases are allowed. No forced uppercase/number/symbol mix.
- Sign-in rate limit: 5 attempts per email per 15 minutes and 40 attempts per source IP per 15 minutes.
- Recovery rate limit: 3 requests per email per hour and 12 per source IP per hour.
- Recovery tokens: 32 random bytes, stored as SHA-256 hashes, single-use, 30-minute expiry.
- Session cookies: Secure, HttpOnly, SameSite=Lax, 7-day expiry. Session identifiers are not stored in localStorage.
- Password change: other active sessions are revoked; the current session is rotated.
- Password reset: all sessions are revoked; the user must sign in again.

Multi-factor authentication and passkeys are **not enabled in this release**. The Account Security panel states that explicitly rather than showing a false success state.

## Verification checklist after deployment

- Render: `/health/live` returns 200.
- Render: `/health/ready` returns 200 and reports the database as `ok`.
- Vercel proxy: `/api/v1/auth/csrf` returns 200.
- Vercel proxy: `/api/v1/auth/bootstrap/status` reports `available: true` before first registration, then `false` after the first account is created.
- Vercel proxy: `/api/v1/auth/session` returns 401 before sign-in and 200 after sign-in.
- Vercel proxy: `/api/v1/workspaces` returns 401 before sign-in and an empty list after first sign-in until a workspace is created.
- Password recovery: Settings reports delivery as configured; the forgot-password form sends a real email, and the link can be used once within 30 minutes.
- Password change: the Account Security form updates the password and signs out other active sessions.

A green deployment is not enough to certify account flows. Complete the first-admin sign-up and a real email delivery test before treating password recovery as production-ready.

## Guidance used

- NIST SP 800-63B-4 (July 2025): https://pages.nist.gov/800-63-4/sp800-63b.html
- OWASP Forgot Password Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- Resend Send Email API: https://resend.com/docs/api-reference/emails/send-email
