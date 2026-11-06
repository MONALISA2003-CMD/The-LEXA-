# LEXA — Dual login production recovery and safe administrator isolation

## Symptoms and scope

- Yellow Control Centre login displayed a generic **business administrator** permission error during the Cloudflare challenge.
- Standard LEXA sign-in displayed a generic server failure after Cloudflare displayed success.
- The application serves `lexaaamaal.com` from Vercel, with `/api/v1/*` rewritten to the Render API.
- The initial developer email belongs to a separate enabled private admin identity **and** an older tenant user who remains the only owner of seven business workspaces.

## Root causes / evidence

1. Vercel's production `VITE_API_BASE_URL` was `https://lexaaamaal.com`. The previous API client treated this as a cross-origin URL on preview domains and used absolute requests instead of the established same-domain `/api/v1` rewrite. That can cause browser cookie and CSRF failures. The updated resolver uses `/api/v1` when the configured API origin is the LEXA public domain.
2. LEXA's general HTTP 403 renderer replaced security and CSRF rejection messages with the inaccurate advice to ask a business administrator. The updated API client retains known server error codes, including Nest's nested `message: { code, message }` form. The private admin portal uses distinct administrator-specific wording.
3. Cloudflare Turnstile uses an action-specific (`login`) token and host verification on the backend. The updated verifier accepts the exact LEXA public hostnames by default, keeps a strict token/action/host check, returns distinguishable errors when verification is required versus unavailable, and exposes a retry button if the browser challenge fails or takes too long. **This does not bypass Turnstile.**
4. Existing browser and session cookies must be issued through the same-origin API rewrite to avoid cross-site blocking. Expired CSRF cookies are re-fetched once for 403 responses bearing `CSRF_TOKEN_INVALID`.
5. The developer's older business identity cannot yet be deleted or fully disabled without orphaning seven sole-owned workspaces. The user-facing sign-in directs the developer toward the separate admin console. The legacy main-platform sign-in is blocked as soon as all active owner memberships are safely transferred. The gate checks the resolved user email rather than the submitted identifier, so username aliases cannot bypass this policy.

The screenshots alone cannot establish a single server exception as the definitive cause of the main-platform 500 error. Production login logs did not contain a reliably correlatable request trace at the time of review; the release adds diagnostic handling and preserves per-request support IDs. The deployment and Cloudflare settings must still be verified by an end-to-end sign-in test.

## Safe deployment

1. Upload this complete ZIP to the repository root using the existing source-refresh GitHub workflow. Preserve `.github` from the repository, not inside the ZIP.
2. Ensure the full source-refresh workflow, frontend TypeScript build, backend tests, and isolated browser workflow pass for this **new** release, rather than assuming a prior green run covers it.
3. Confirm Render deploys the matching commit and Vercel's `lexa_review` project on `lexaaamaal.com` also points to that commit.
4. Check `VITE_DATA_PROVIDER=api`, `VITE_API_BASE_URL=https://lexaaamaal.com` or `/api/v1`, and a correct `VITE_TURNSTILE_SITE_KEY` on the Vercel build environment. The frontend's fallback site key exists for the old deployment but must not be treated as proof that the current Cloudflare widget belongs to this domain.
5. On Render, independently verify a matching `TURNSTILE_SECRET_KEY`, `TURNSTILE_ALLOWED_HOSTNAMES` including `lexaaamaal.com`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `AUTH_OTP_PEPPER`, and `FRONTEND_PUBLIC_URL=https://lexaaamaal.com`. Do **not** disable Cloudflare verification, bypass CSRF, or rotate existing TOTP/OTP keys without a migration plan.
6. In a fresh browser, open `/platform-admin/login`; complete the actual Turnstile challenge, sign in with the separate administrator password, then verify `/platform-admin` loads data. Use `/platform-admin/recover` only if the admin password was lost.
7. In another fresh browser, sign in to `/sign-in` with a normal business account and complete any new-browser email challenge. Both logins should work without sharing cookies or authentication identities.
8. For failures, copy the **support reference** shown on screen and check the matching Render error timestamp. The administrative login must not tell an administrator to ask a tenant business owner for access.

## Safely retiring the developer's legacy business identity

**Do not delete it yet.** The developer identity is still the sole active owner of seven workspaces. To make the email strictly admin-only without stranding those workspaces:

1. For each legacy workspace, appoint and verify a successor with a different real customer/business email; grant an owner-equivalent membership using authorized business ownership controls.
2. Verify the successor can sign in, manage the workspace and recover their own account; then revoke the developer's owner membership from that workspace.
3. Repeat for all seven workspaces. Once the developer has no remaining active owner memberships, the server's `ADMIN_ONLY_IDENTITY` gate refuses customer sign-in for that email, including username aliases.
4. Explicitly revoke legacy business sessions and remove other historical memberships only after the ownership audit. This can be planned as a separately reviewed production action. Retain business invoices, stock, customers, and audit records.

This release makes no direct production database modifications and does not change subscription billing rules.
