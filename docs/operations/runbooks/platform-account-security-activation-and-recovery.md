# LEXA — Platform Account Activation, Activity Monitoring and Recovery

**Release:** 2026-11-06 · **Source-only package** · **No production migration executed**

## Scope and pricing

- Only an explicitly enrolled platform Super Admin or Billing Manager can confirm payment and activate a new paid business subscription. Every new signup and business-creation route creates `platform_subscriptions.status='pending'`. The server's `SubscriptionAccessGuard` checks both GET and write business operations; the frontend is not the enforcement boundary.
- The subscription amount is **UGX 50,000**, providing exactly **30 × 24 hours** of entitlement. Approving a verified payment activates or extends by 30 days atomically. An existing paid period is never shortened by an early renewal.
- Existing customers grandfathered as `legacy` during the original platform-billing migration retain access until the Super Admin performs an explicit, recorded enrollment change. Do not transition customer accounts without notice.
- Admins may review customer-submitted payments in the payment inbox, or use **Business accounts → Record verified payment & activate** when a payment was made through WhatsApp/offline. A transaction screenshot or text alone is not verification. Check the official receiving account and enter its confirmed provider receipt reference.

## Admin-only account actions

| Action | Who | Effect |
| --- | --- | --- |
| Activate / renew using a verified payment | Super Admin or Billing Manager | Adds exactly 30 paid days and records an immutable receipt and audit entry |
| Suspend | Super Admin | Stops business operations immediately without deleting records or paid time |
| Reactivate from suspension | Super Admin | Restores only previously permitted legacy or still-valid paid access |
| Delete / archive | Super Admin | Requires exact business name, written reason and explicit confirmation; sets `archived` and blocks operations |
| Restore archive | Super Admin | Restores prior controls, including suspension or expired-payment restrictions |
| Transition protected legacy account to paid | Super Admin | Separate deliberate audited action; no auto-lockout of existing customers |

**Deletion is reversible archive, not hard deletion.** ERP data, identity, receipts, invoices, stock movements, journals, account history and audit events remain intact. Permanent deletion would require a separate legal/privacy and retention review, tested backup/restore procedure, and an explicitly authorised data-erasure workflow—not a dashboard button.

## Secure administrator password recovery

Use `https://lexaaamaal.com/platform-admin/recover`. The page uses the existing LEXA email password-reset endpoint with 30-minute single-use links and a generic request response. A successful password reset revokes active sessions, trusted browsers, and login challenges. Recovery does not enroll a new platform administrator, remove authenticator MFA, or bypass the code challenge. If an authenticator is lost, use a previously issued recovery code or an independently verified support/recovery procedure, not a shared emergency password.

## Activity, IP addresses and monitoring

`/platform-admin` → **Live account activity** shows recent authenticated business requests with business/user identity, subscription state, observed network IP, prior observed IP (if changed), timestamp, browser label and recent activity status. The UI polls every **15 seconds while the browser tab is visible**. This is *polling*, not an always-on backend alert-delivery service; it cannot notify the administrator if the tab is closed, the API is unavailable, or the network is disconnected.

The API classifies completed requests as account/billing access or business operations to flag operations that appear after a restriction/expiry. These are review signals rather than a verified security incident. The API observes activity only after a successful (<400 status) workspace request with a real valid session and active membership. It stores one snapshot per business/user and updates that snapshot no more often than once every 15 seconds unless the IP changes. Normal requests are not given any extra privileges; this register never causes activation. Each IP is validated with Node's IP parser and sourced only from the address reported by Fastify. **Do not trust arbitrary `X-Forwarded-For` headers.** By default Fastify uses the actual peer, which may be a Vercel/Render proxy rather than the end user. A source-verified proxy CIDR list can be configured explicitly using `LEXA_TRUSTED_PROXY_CIDRS`; never set `trustProxy: true` globally, never assume the number of proxy hops is secure, and never make access decisions on an IP alone.

An IP change can happen because of mobile networks, carrier-grade NAT, office VPNs or proxies. Treat it as a *review signal*, not proof of fraud. The dashboard restricts the activity register to Super Admins, Operations Managers and Auditors. Store no session tokens, passwords, OTPs or detailed ERP payloads. The table is a last-seen snapshot, not an exhaustive timeline, and is excluded from tenant restores. A formal retention schedule and data-protection review should be finalized before enabling widespread production monitoring.

## Deployment and rollback gate

1. Verify the currently green GitHub revision and take/verify a Neon restore point using the current backup runbook. Test the additive migration on an isolated copy before making any production changes.
2. Apply migrations in order with the existing guarded deploy mechanism. New schema migration: `20261109100000_platform_account_activity_controls`. Its operations add a new table and extra subscription columns/check; it does not physically delete tenant/business rows.
3. Verify the application runtime role has `SELECT, INSERT, UPDATE` on the new activity table and only explicitly enrolled billing-role principals may modify paid entitlements. Do not manually grant broad cross-tenant membership privileges.
4. Log in at `/platform-admin/login`, confirm MFA, test the yellow `/platform-admin/recover` flow using a controlled test admin, then test account activation/expiry, paid renewal, suspension, archive, restoration, directory access and IP views with isolated test users.
5. Review the in-app operational console and `/platform-admin/activity` while signed in as a test customer. Use the same verified IP/source caveats above; check that staff-support and business owners cannot view platform activity.
6. Run the full GitHub source import, backend/frontend build, migrations on a staging data copy, isolated browser tests, access isolation and payment-duplicate tests. **A source-only ZIP is not proof that production migration or end-to-end tests passed.**
7. To roll back application code, deploy the prior green commit. Prefer retaining additive platform schema and preserved account data; never drop subscription, invoice, receipt, activity or audit tables to roll back the UI.

## No new paid infrastructure

Uses the existing Vercel frontend, Render API, Neon database and LEXA transactional email integration. There is no new dedicated Redis, monitoring server or payment gateway required. The console does not claim to provide unattended 24-hour push alerts without a separate verified notification channel.
