# LEXA account security and privacy — release and recovery runbook

**Scope:** NestJS account security, Cloudflare Turnstile, React account settings, Neon PostgreSQL row security, operational email delivery and cookie-consent controls. Intended for the existing Render/Vercel/Neon stack. This document describes an *implementation package*, not evidence that the configuration is live.

## Release requirements

1. **Deploy additive database migration** `20261107010000_account_security_privacy` using the project's existing Prisma migration guard and a direct migration connection. Back up and verify restore readiness before promotion. This adds the `trusted_device_id` column to existing sessions; the new backend must **not** start before the migration completes. Never reset sessions, memberships, inventory or tenants to deploy security changes.
2. Confirm a verified **production Cloudflare Turnstile sitekey** for the live frontend origin (`VITE_TURNSTILE_SITE_KEY` on Vercel) and its matching **secret** (`TURNSTILE_SECRET_KEY` on Render). Do not put the secret in Vite or Git. Set `TURNSTILE_ALLOWED_HOSTNAMES` to the exact frontend hostnames permitted to send challenges. Keep the `action` strict: `login` for sign-in and `signup` for public registration.
3. In Render, set `TURNSTILE_ENFORCE_LOGIN=true` and `TURNSTILE_ENFORCE_SIGNUP=true`, `LEXA_ENFORCE_NEW_BROWSER_VERIFICATION=true`, `AUTH_OTP_PEPPER` (32+ cryptographically random characters), and `AUTH_TOTP_ENCRYPTION_KEY` (base64-encoded 32 random bytes). The encryption key and OTP pepper must be kept in a secure secrets manager and backed up under owner-controlled recovery procedures. Distinct keys are required; never reuse database/JWT secrets.
4. Verify `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and HTTPS `FRONTEND_PUBLIC_URL`. New-browser email verification fails closed if email delivery is unavailable for email-eligible accounts. Usernames without deliverable email use enrolled authenticator MFA or the existing owner-assisted temporary-password recovery flow. There is **no** anonymous MFA bypass.
5. Verify the app is served over HTTPS and session requests successfully carry Secure, HttpOnly cookies. For cross-site frontend/backend origins, `SameSite=None; Secure` is required; for a future same-site custom API domain, review cookie settings and browser third-party-cookie restrictions rather than blindly changing production auth.
6. Deploy backend and frontend revisions together; require GitHub CI source checks, Prisma validation, TypeScript/Nest and Vite production builds, authenticated staging flows and rollback evidence. Test one new-browser sign-in through real Cloudflare siteverify and one email OTP delivery before enabling strict production enforcement.
7. Arrange legal review of the public Cookie and Privacy Policy pages (processor identity, actual support/privacy contact, retention, subprocessor list and jurisdiction). No policy page alone proves legal compliance.

## Required end-to-end journeys

- Existing account, trusted browser: correct password and verified Cloudflare challenge; successful session; historical tenant membership retained.
- New browser, email account: password plus Turnstile -> email challenge -> single-use code -> session and trusted browser; repeat token/code rejected; five wrong attempts exhausted; expiry after ten minutes.
- Authenticator account: password plus Turnstile -> TOTP code; same time step not reused. Recovery code authenticates once and is removed from stored hashes.
- Authenticator enrolment: re-enter current password -> scan/enter private key -> verify fresh TOTP -> receive eight one-time recovery codes; codes appear once and are never logged.
- Security centre: staff and owners can list and revoke only their own sessions/devices. Wrong password and cross-account IDs are denied. Revoking the current session logs out that browser.
- Password reset: revoke every existing session and trusted device, invalidate pending challenges, record immutable security event.
- Privacy preferences: optional analytics defaults to off; authenticated changes are written to `user_privacy_preferences` and append-only `privacy_consent_events`; changing an employee's choice never changes another user's preference. No optional analytics SDK is loaded by this package.
- Cloudflare outage or missing required secret: deny protected sign-in with a specific unavailable response; never fall back to unconditional approval.
- Two-account RLS: runtime role cannot read/modify another user's devices, challenges, MFA credentials or privacy preferences; history tables reject update and deletion.
- Verify login and settings forms retain CSRF guard protections. Test mobile browser and assistive technology access.

## Database safeguards and restore rules

Six new tables receive forced PostgreSQL RLS, user-owned policies, runtime-role grants and backup decisions. `login_challenges` has a separate token-hash-scoped SELECT policy allowing the anonymous pre-session token to be looked up without exposing other users' records. `account_security_events` and `privacy_consent_events` are append-only (triggers + no UPDATE/DELETE grant). Session-to-trusted-device account ownership is enforced with a PostgreSQL trigger.

- **Excluded from restore:** `trusted_devices`, `login_challenges` (previous credentials and pending challenges become invalid after recovery).
- **Authoritative / review before restoring:** `authenticator_credentials` (requires the exact encryption key), `account_security_events`, `user_privacy_preferences`, `privacy_consent_events`.
- Revoking sessions is a security operation and must not delete business/sales/inventory data.
- The existing `auth_rate_limits` table is used only via the bounded `lexa_login_rate_gate` database function by the runtime role. Do not expose raw rate-limit records through an HTTP API.

## Safe rollout and failure handling

The production backend is configured to require Turnstile and new-browser verification by default when `NODE_ENV=production` unless explicitly disabled. **Do not ship without the corresponding keys and email delivery.** Temporary opt-out flags (`TURNSTILE_ENFORCE_LOGIN=false`, `LEXA_ENFORCE_NEW_BROWSER_VERIFICATION=false`) are emergency availability measures only; they weaken protection and must be approved, time-limited, audited and re-enabled. Existing protected user accounts with enrolled TOTP still require MFA even if new-browser enforcement is temporarily disabled.

A loss of `AUTH_TOTP_ENCRYPTION_KEY` prevents decrypting existing authenticators and requires a controlled owner/account recovery process; do not silently remove MFA to restore access. Rotating the key requires a reviewed re-encryption process. A lost OTP pepper invalidates existing pending email challenges (which are short-lived). Never place OTPs, recovery codes, passwords or device credentials in logs, analytics or support tickets.

## Scope not certified by this package

Passkey/WebAuthn enrollment, enterprise federated login, bank-destination/payroll-wide step-up authorization, Cloudflare WAF deployment rules, automatic recurring risk scoring, per-jurisdiction legal approval, and full cloud provider E2E tests are not certified here. Those are distinct security changes requiring configured identity providers, hardware/browser tests, documented recovery and deployment evidence; do not treat a password-only action as equivalent to a phishing-resistant factor.
