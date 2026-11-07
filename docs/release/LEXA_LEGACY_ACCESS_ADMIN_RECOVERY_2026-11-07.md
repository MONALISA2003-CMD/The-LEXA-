# LEXA legacy access and admin console recovery
Date: 2026-11-07

## Scope
- Fixed platform administrative record UUID parsing. Prior 8-4-4-13 matcher rejected legitimate canonical 8-4-4-4-12 UUIDs, causing `Invalid record identifier` on admin account details, payment actions, suspensions and restores.
- Added a dedicated platform-record-id utility and regression tests; also corrected the same invalid UUID expression in logistics package handling.
- Made business/user account management controls usable on narrow mobile screens. Business cards have Manage, Verify payment (where eligible), Suspend, Reinstate, Archive, Restore based on status and admin role. Individual user cards have audited Suspend/Reinstate for super administrators. All management actions open an existing confirmation panel rather than silently mutating accounts.
- Directed browser API requests on the canonical Vercel LEXA domains through the project's `/api/v1` first-party rewrite. This is intended to prevent cross-site cookie/session/CSRF issues on mobile browsers. It is a mitigation, **not a confirmed diagnosis** of the login 403.
- Improved business sign-in error messaging to distinguish security verification failures from authorization to edit business records and to retain support/request identifiers.

## Entitlements and payment
- Existing businesses already marked `legacy` continue to operate without a paid period. Do not mass-update or downgrade them.
- Newly registered businesses are `pending` until approved payment. The verified payment flow remains UGX 50,000 for 30 days.
- Suspensions, archiving, recovery and payment actions are restricted to authorized platform roles and generate audit entries. Admin access does not bypass payment or create an unverified receipt.

## Verification performed
- Neon production database was **inspected read-only**: 10/10 businesses had `legacy` subscriptions; the screenshot owner was an `ACTIVE` owner in a `legacy` workspace. No production user, tenant, membership or subscription was changed.
- Full backend test run from `backend/` with TypeScript available to pre-existing test scripts: **439 tests passed, 0 failed**.
- Focused account-admin and subscription test suite: **16 passed, 0 failed**.
- Modified frontend TypeScript/TSX syntax was parsed successfully, but full frontend dependency-based build and manual browser login have NOT been performed.

## To release safely
1. Make a backup/snapshot of the Neon production branch. Verify the 10 legacy subscriptions remain legacy; do not reset active memberships.
2. Deploy **backend** changes to Render first. Confirm migration state and that `/api/v1/platform-admin/businesses/:tenantId` accepts valid account IDs for authorized admins.
3. Deploy **frontend** to Vercel `lexa_review`, preserving Vercel rewrite `/api/v1/:path*` to the correct Render backend. Check request routing and cookie security at the public custom domain.
4. Sign into an existing legacy owner account on mobile using legitimate credentials, and sign into the platform-admin console. Test Details, suspension/reinstate, archive/restore confirmation and user access controls on a test tenant.
5. In a staging tenant, test new registration -> pending/paywall -> payment claim -> verified approval -> active 30-day period. Confirm existing legacy tenants bypass billing and suspended/archived tenants do not.
6. If login still returns 403, investigate the **structured API error code** and `X-Request-Id`, origin/cookies, CSRF and Cloudflare Turnstile verification, not the subscription data. Do NOT disable auth, bypass CSRF or grant paid access to “fix” a sign-in error.

## Deployment limitation at handoff
The connected GitHub integration rejected a write (HTTP 403 `Resource not accessible by integration`). Render requires user confirmation of the workspace before its connected tools can select it. The updated source is packaged for deployment, but no backend/frontend production release was performed.
