# LEXA production sign-in repair — administrator and customer portals

**Scope:** Existing Vercel frontend + Render API + Neon. No new server, no automatic database mutation, and no changes to payment or subscription entitlements.

## Symptoms and verified findings

- Administrator login showed an ambiguous 403 permission message after Cloudflare Turnstile.
- Customer business login showed a generic server error after Turnstile.
- Both failed attempts preceded their respective database password-check rate-limit gates in the diagnostic window. This is evidence to investigate request verification, **not** proof that the submitted passwords were correct or the root cause was definitively identified.
- GitHub source-refresh #145 and isolated-browser tests #15 had succeeded. Render deployed commit `26b933c5444112e8fd1c92009c2cddb7f35e9b6b` and Vercel's `lexa_review` deployment was READY when inspected.
- The production database contained an enabled independent platform-admin identity for the designated developer email. Administrator enrollment was **not** the cause of the displayed lack-of-permission wording.
- That same email remains the only active owner for **seven** existing business workspaces. It is not safe to delete its customer identity or revoke all its business access before those workspaces have an authorized replacement owner.

## Implementation

1. First-party API base URL: canonical `https://lexaaamaal.com` API configuration maps to `/api/v1` so CSRF and session cookies stay on the currently opened frontend origin, including through Vercel rewrites. Existing configured non-canonical API endpoints remain configurable.
2. Explicit Cloudflare Siteverify hostnames: `lexaaamaal.com` and `www.lexaaamaal.com` are always allowed. An optional comma-separated `TURNSTILE_ALLOWED_HOSTNAMES` may add only valid hostname strings; the token must still pass Cloudflare Siteverify and match the configured action.
3. Separate safe HTTP statuses and diagnostic error codes for missing/invalid Turnstile challenges versus verifier outages; verification remains **fail-closed**. No bypass option is introduced for production accounts.
4. Mobile-friendly Turnstile retry when the challenge widget stalls or errors, without submitting an unverified token.
5. Independent private-admin error messaging (no confusing business-admin permission wording).
6. CSRF failure logging records only the route, never cookie contents, tokens, account names, or passwords.
7. Login errors display an opaque request reference when one is available to facilitate support diagnostics. A request ID is not an authentication or recovery credential.
8. Developer business-login separation is enforced only after remaining owner memberships are deliberately transferred. This preserves current business data and owner control.

## Release procedure

1. Upload the complete root-level ZIP to the repository. The GitHub ZIP importer retains `.github` workflow definitions and repository metadata and restores lockfiles through its verified process.
2. Require a **new green** source-refresh job and browser workflow. Do not reuse #145/#15 as evidence for this updated package.
3. Confirm Vercel's `lexa_review` project deployment is READY and assigned to `lexaaamaal.com`, and the Render `lexa-backend-api-live` deployment is live at the same new commit.
4. On the canonical domain, test `/api/v1/auth/csrf` as a read-only GET in the browser; then open `/platform-admin/login` and `/sign-in` in a fresh mobile browser session.
5. Complete Turnstile. If it fails, retry with the on-screen challenge control and record the **support reference** shown with the error; use Render request logs to correlate the reference.
6. Sign in with the separately created private administrator password at `/platform-admin/login`; don't use the customer account password. Validate both the active admin dashboard and logout. The customer user should sign in with its own credentials at `/sign-in`.
7. Confirm the admin dashboard still has five-seat permissions, payment verification is admin-controlled, and new businesses remain payment-pending.
8. Only when replacement owner(s) have been explicitly approved and verified for the seven workspaces, transfer owner roles and revoke the developer's old customer sessions before finalizing the developer email as admin-only. Never delete customer data or ownership records without an authorized migration and recovery plan.

## Emergency rollback

Re-deploy the last known-good frontend/backend commit if login regression persists; do not roll back an already applied additive Neon schema without an authorized recovery plan. Preserve request correlation, screenshots with passwords obscured, and Render log timestamps. Keep Turnstile protections enabled unless a security-approved alternative has been prepared.

## Verification boundary

Local checks cover backend business policies, frontend source syntax, route uniqueness and prebuild code generation. Only a live end-to-end browser test can confirm the real Cloudflare site key, deployed secret, domain cookies, and email challenge behavior.
