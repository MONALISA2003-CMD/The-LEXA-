# LEXA Control Centre — production release and manual billing

**Release status:** source implementation awaiting GitHub CI, a disposable Neon migration trial, deployment and browser acceptance checks. This guide is not evidence that production is active. **No destructive migration, table reset, bulk business suspension, or new paid infrastructure is authorized.**

## Product and access

- **Public site:** `https://lexaaamaal.com/lexa` (existing marketing route; not a replacement for existing `/` workspace bookmarks).
- **Business payment/renewal:** `/subscription`, server-authorized via `/api/v1/workspaces/:workspaceId/platform-billing/*`.
- **Yellow glass administrator sign-in:** `/platform-admin/login`; existing LEXA session and verification challenge only. No separate admin password store, hard-coded access, or public enrolment.
- **Platform administrator:** `/platform-admin`, backed by `/api/v1/platform-admin/*`, separate from business owner roles.
- **One standard plan:** UGX **50,000 per exact 30 days**. Time source is the backend; no browser or scheduled task determines whether an entitlement is valid.
- **New signup:** email verified -> account and business created -> paid entitlement pending -> customer submits payment details -> independently verified admin confirmation -> atomic 30-day activation.
- **Early renewal:** add 30 days to current valid paid-through timestamp. **Late renewal:** start 30 days at approval. Duplicate claim and provider verification references do not add duplicate days.
- **Old existing businesses:** explicitly seeded as `legacy` and retain access. Transitioning to paid access requires an individually reviewed, audited super-admin action. Payment approval may not silently convert a legacy business.
- **Expired/suspended:** customer records remain untouched; business operational APIs deny reads and writes, while billing status, payment-submission and support routes remain accessible to authorized account members.
- **Payment evidence:** transaction reference and explanatory message are stored as claims. WhatsApp contact uses an outbound click-to-chat link. **Do not auto-approve screenshots/messages**. In-app image uploads are intentionally not enabled without private storage, malware scanning and tested access controls.

## Installation: no production Neon changes by this source archive alone

1. Retain a verified backup, a known-good git commit, and a rollback plan. Take a database snapshot using the provider's non-destructive snapshot operation **but do not restore onto production**. Never invoke a snapshot restore unless its semantics, target and compute migration have been reviewed.
2. On a **separate test database or isolated branch**, apply `backend/prisma/migrations/20261108100000_platform_admin_subscriptions/migration.sql` through the existing guarded migration deploy process. Confirm the schema, 8 RLS policies/groups, triggers and indexes. Validate existing tenant counts and payment flow with test identities, then discard only disposable test data by an approved procedure.
3. Confirm existing Neon `lexa_app_runtime` runtime role is configured and that backend's migration coordinator uses the direct, unpooled migration URL while normal runtime uses the pooled URL.
4. Deploy backend and frontend together through the repository's existing clean ZIP source importer. Do not reconfigure Render, Neon, Redis, R2, or the API Docker command for this feature.
5. Check `/health/live`, `/health/ready`, signup, login, the existing business flows, the `/subscription` renewal route and the restricted `/platform-admin` route. Run backend tests and the entire local-provider Playwright suite in GitHub. A green CI build **does not certify** the live payment/activation flow; test that separately with a designated, disposable account.
6. Confirm the official WhatsApp number, support phone and public billing instructions using these **optional** Render environment variable names only: `LEXA_BILLING_WHATSAPP_NUMBER`, `LEXA_BILLING_SUPPORT_PHONE`, `LEXA_BILLING_INSTRUCTIONS`. Verify values privately with the business owner; never add account numbers or secrets to the repository.
7. Enroll the first platform administrator **only after the migration and live auth are verified**. See below. Keep platform-admin privileges out of every ordinary business owner membership.

## First platform administrator — deliberate enrollment only

The application **does not** auto-promote the first signed-up customer, business owner or email address. The table `platform_admin_members` is protected by forced RLS, self-read only, and no runtime INSERT/UPDATE grant. The database owner has a narrow enrollment/revocation policy; the application runtime role cannot create platform admins.

1. Register or use a trusted **existing, verified** LEXA user. In `/account/security`, enroll a working TOTP authenticator and securely retain recovery codes. Never share that user's password or recovery code in chat.
2. Using an authorized Neon **database-owner SQL console** (not the restricted `lexa_app_runtime` login), identify the exact verified user's UUID. Confirm its authenticator credential has `enabled_at IS NOT NULL`, and explicitly review the intended account.
3. In a properly authorized and audited database-owner session, enroll only that UUID by an additive INSERT, replacing the placeholder **in your own SQL console**:

```sql
-- This inserts one role; no tables or business records are rewritten.
INSERT INTO public.platform_admin_members(user_id, role)
SELECT u.id, 'super_admin'
FROM public.users AS u
JOIN public.authenticator_credentials AS a ON a.user_id=u.id
WHERE u.id = 'REPLACE_WITH_REVIEWED_USER_UUID'::uuid
  AND a.enabled_at IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;
```

4. Verify the row and sign in through `/platform-admin/login` to `/platform-admin`. Verify a normal business owner gets HTTP 403 at every platform-admin API. For emergencies, revoke the admin role from the privileged owner console; **do not** revoke an ordinary user's business membership to remove platform permissions.
5. **Security limitation:** this source requires an *enrolled* authenticator to access platform administration. It does **not** implement a fresh TOTP step-up challenge before every payment approval; plan that hardening before delegating billing to multiple administrators.

## Operational payment verification

- Customer enters reference or message for the exact UGX 50,000 charge. The server saves a pending claim but does not activate paid access.
- Billing manager/super admin independently inspects the **actual receiving bank or mobile-money transaction** and enters that provider's verified reference.
- `Confirm payment & activate` writes in one serializable transaction: approved claim, unique subscription period, expiry timestamp and audit event.
- A second approval of the same claim is idempotent. Reusing one verified provider reference across claims is rejected by a unique index.
- A missing or unverified payment must remain pending/rejected; no operator may use a fake payment reference to enable an account.
- Notifications are primarily **in-app while the console is open** (minute refresh); a separate always-on queue/worker is not used or represented as operational on current hosting plans.

## Health, monitoring and limitations

`/platform-admin/health` exposes database/API request health and subscription review backlog, along with correctly labeled `not_connected` Vercel/Render provider metrics and `disabled` worker/scanner state. It does not claim that external provider metrics are live without authenticated integration. Existing tenant-specific operational alerts remain isolated from this platform console. Support cases and incident register are tracked on the platform; billing dashboard may auto-refresh while visible.

External offline monitoring, direct WhatsApp inbox ingestion, uploaded screenshot verification, automatic provider-confirmed payment approval, refunds, recurring automatic bank collection, dedicated worker/scanner and payment gateway are **not included** in this budget-constrained release.

## Failure and recovery

- Failed migration: stop release, preserve original production database and inspect Prisma migration status. Do **not** run `prisma migrate reset` or recreate the database.
- Signup blocked after deploy: investigate missing migration/runtime grants first; do not bypass the subscription guard in production.
- Duplicate reference or disputed claim: leave account pending; review immutable audit trail, and resolve through a separate reviewed correction process.
- Expired customer: users can sign in to billing and support; renew without rewriting customer invoices, stock or ledgers.
- Revenue reporting counts *verified subscription periods* only, not customer POS sales. Refund adjustments are not yet modeled and must be handled with a separate audited process.
- Workspace backups deliberately exclude platform subscription and platform-admin tables; only reviewed, full-database recovery snapshots may restore these platform-owned records.

## Yellow command centre UX / reporting (November 2026)

- Dedicated yellow and champagne glassmorphism surfaces are scoped to **platform administrator** routes. They do not change the business workspace or `/subscription` customer design.
- Login uses `apiAuth.signIn` and `apiAuth.verifySignIn`, including the existing Cloudflare Turnstile login challenge if configured. It then checks `/platform-admin/profile`; only authorized platform roles proceed. A successful normal business sign-in does not confer platform privileges.
- Roles without financial permissions see only their authorized sections. A platform operations manager opens Health, not the financial Overview. Revenue, cash collection, and payments are not disclosed through the Overview API to operations-only or support-only accounts.
- Revenue is a server-sourced collection record. The chart supports 7/30/60 Kampala calendar-day filters, collections/payment-count switching, and on-demand sanitized CSV export. Projected amounts are **illustrative**, not recognized cash or invoiced revenue.
- Health indicators display the supported checks and high-priority recommendations. External Render/Vercel metrics remain `not_connected` until verified connections exist. No fabricated 100% health score, worker heartbeats, or fake monitoring statuses.
- Supports reduced-motion and transparent-glass fallbacks, responsive layout, keyboard focus states, and readable dark-on-yellow text. The goal is WCAG 2.2 AA-level contrast for ordinary text; production accessibility tests must still be completed.

### Release checks for the admin redesign

1. Existing GitHub source-refresh, backend/frontend builds, and full local-provider browser suite remain required. Verify `/platform-admin/login` renders without a session; it must not expose an account list.
2. Sign in with a normal business-owner identity. Its `/platform-admin/profile`, `/overview`, `/businesses`, `/payments`, `/revenue` and `/health` requests must return unauthorized/forbidden, even if the frontend is bypassed.
3. Sign in with a correctly enrolled platform admin and complete any required email/TOTP challenge; verify the admin console loads and the new UI reflects actual data only.
4. Verify `operations_manager` cannot fetch financial Overview, payment details, or revenue; `billing_manager` cannot grant super-admin roles or read privileged system settings; `support_agent` cannot approve a payment.
5. Test critical incident states, unconnected provider indicators, payment idempotency, renewal dates and 7/30/60-day revenue charts. Verify exported CSV does not contain confidential tenant ERP transactions.
6. Test keyboard operation, narrow/mobile widths, dark text contrast against glass backgrounds, and reduced-motion display.
7. No Neon production reset/restore/branch switch, paid worker, paid scanner, Redis upgrade, extra hosting plan, or external API integration is authorized by this frontend-only change and authorization tightening.
