# LEXA Workstream 7 — Increment 6/7 implementation handoff

**Source package date:** 2026-11-01  
**Scope:** Increment 6 (business notifications and recurring invoices) and Increment 7 (observability, Operations Centre, alerts, migration/release validation and runbooks).

## Source implementation

### Increment 6

- Versioned, allowlisted business-event catalogue for POS, receipts, customer credit, overdue reminders, refunds, delivery/rider events, import/export, backup/restore, recurring invoices, attachment scanning and worker incidents.
- Transactional-outbox notification fanout. It stores one deduplicated notification per authorised recipient, checks tenant membership and branch scope, uses static notification content, and does not put raw event payloads or customer/financial values into email templates.
- In-app notification centre API and UI: branch-scoped inbox, unread count, cursor pagination, type/date/unread filters, mark one/all read, channel preferences and permission-checked navigation to the underlying record.
- Resend delivery worker with server-only credentials, configurable verified sender, escaped template values, provider idempotency key, bounded retry, safe error summaries and persisted delivery state.
- Signed Resend webhook receiver using Svix headers, exact raw body, signature/timestamp validation, provider-event deduplication, minimal evidence storage, delivery-state mapping and bounce/complaint suppression. Unknown events are retained without changing business records.
- Recurring-invoice API and UI: create/edit/preview/list, weekly/monthly/quarterly/annual/custom cadence, local timezone/run time, month-end anchor clamping, due terms, end/max occurrences, notification recipients, pause/resume/cancel, occurrence history and failure retry.
- Idempotent occurrence worker. Each schedule/date has a unique occurrence; invoice snapshots preserve line/tax values, tax is resolved from the approved effective rule on the scheduled date, and administrator-enabled auto-issue posts the balanced AR/revenue/tax journal in the same DB transaction. Draft is the default. No payment collection or payment-provider integration was introduced.

### Increment 7

- Sentry SDK setup for API and worker, release/environment metadata and scrubbing for credentials, request data, email/phone patterns and sensitive context. It remains optional in local development.
- OpenTelemetry Node SDK, HTTP/PostgreSQL auto-instrumentation, OTLP trace/metric export, correlation IDs and worker spans/counters/histograms. Worker metrics include bounded job-type labels and operational gauges for Redis queue depth, oldest queued age, scan backlog, email backlog, recurring failures and heartbeat age.
- Administrator-only Operations Centre API and UI: API/database status, worker heartbeat, Redis/ClamAV state, queue/outbox, scan backlog, email and recurring invoice failures, backup/restore job dates, incidents, acknowledge/resolve, failed-email retry and configurable alert rule severity/enabled/threshold/cooldown/runbook.
- Tenant-scoped alert rules/incidents with fingerprints, repeat-count aggregation and outbox notification when a new incident opens. Seeded rules cover worker/Redis availability, dead-letter/outbox delay, queue age, import/export stalls, scan backlog, ClamAV, email, recurring invoice and backup age.
- Forward-only, idempotent Increment 6/7 recovery/hardening migration at `prisma/migrations/20261101170000_increment6_7_runtime_hardening/`. It ensures notification/recurring/alert objects, indexes, RLS policies/runtime grants, invoice-occurrence links and correlation-ID triggers exist. It also seeds default tenant alert rules.
- Nineteen operator runbooks are included in `docs/workstream7/runbooks/README.md` for the required deployment, queue, scanner, R2, import/export, backup/restore, access, security, Resend, recurring invoice, migration and restore-drill procedures.

## Local source validation performed

| Check | Result |
|---|---:|
| Backend unit tests (`node --experimental-strip-types --test test/*.test.mjs`) | **74 passed, 0 failed** |
| TypeScript/TSX syntax transpilation | **175 files, 0 syntax errors** |
| Backup table inventory | **154 decisions / 137 discovered references covered** |
| OpenAPI and route coverage | **296 operations / 235 routes, exact match** |
| Route-to-adapter coverage | **17/17 adapters passed** |
| Ledger workflow coverage | **9/9 workflows passed** |

These are source/unit/contract/inventory checks. They are not dependency-backed backend/frontend builds and are not HTTP/database end-to-end tests.

## Live/staging facts and release blockers

- The named Neon validation branch already has successful migration-history rows for `20261101150000_increment6_notifications_recurring_invoices` and `20261101160000_increment7_observability_alerts`, with checksums `605b6f7a853b33073680d33974cadff04e48131b519ac2e2d152d695f1e4b7ba` and `f1c5d07f3dc23f7d330d9a14fa7176998a5512945e035b8473ea2bba99a717e3`. Those original migration source files were absent from the supplied ZIP/repository snapshot. The new `20261101170000` migration is a forward-only recovery/hardening migration; its source has **not** been applied or validated by a fresh `prisma migrate deploy` in this handoff.
- Neon production branch `br-snowy-hill-ba5a9ggc` was not modified. The validation and restore-target branches were not modified in this implementation turn either. Do not apply the migration to production.
- Render API `lexa-backend-api-live` remains a Free web service using the repository-root `backend/Dockerfile`. Recent auto-deploys from the archive-extraction commits failed. A separate worker has not been deployed.
- Render `lexa-redis` is Free with persistence disabled. It is not suitable as the production durable queue. A paid persistent Redis/Key Value service is still required.
- Worker runtime still needs server-side R2 S3 Access Key ID/Secret Access Key, persistent Redis URL, database URLs/roles, ClamAV host, backup encryption key/custody and app release variables. The R2 bucket-scoped credential has not been installed into Render. ClamAV is in the worker container recipe but is not hosted/live-verified.
- Resend needs `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, and a sender address/domain verified in Resend. No email delivery or signed webhook was live-tested. The example sender is intentionally blank.
- Production Sentry DSN and OTLP collector endpoints have not been configured/verified. When production policy requires these, set `OBSERVABILITY_REQUIRED_IN_PRODUCTION=true` so readiness reports missing configuration.
- Vercel access to the named team/project returned 403/authorization failure. Vercel was not inspected further or modified.
- GitHub branch creation was denied by the active connector (403), so no branch, commit, PR or main-branch write was made. This handoff ZIP is the updated source package.
- Dependency installation previously timed out. Full `npm install`, backend `nest build`, frontend `tsc -b && vite build`, frontend unit tests and Playwright are therefore still required in CI/staging.
- The HTTP/database E2E harness has not been run. Cross-system acceptance scenarios (POS/delivery, imports/exports, notification/webhook, recurring invoice, Sentry/OTel trace, alert and worker-failure recovery) remain unaccepted until they run against isolated staging services.
- No actual encrypted backup restore drill has been performed. The restore executor remains disabled by default; the isolated restore target is not evidence of a completed restore.

## Required next release sequence

1. Reconcile the two missing historical Increment 6/7 migration source files/checksums with the Neon validation migration history. Do not rewrite applied migration checksums. Review the `20261101170000` SQL against both an empty database and the existing validation branch.
2. Install the dependencies in CI; run backend and frontend production builds, frontend unit tests, backend tests, Prisma validate/generate/migrate status, inventory/route/ledger checks and contract checks.
3. Apply the reviewed forward migration only to the disposable validation branch. Check RLS, grants, schema consistency and upgrade/fresh-install compatibility.
4. Provision paid persistent Render Redis and deploy the API/worker from the authoritative source root. Install R2 S3 credentials, ClamAV, backup key/custody, database roles, Resend, Sentry and OTLP secrets in server-side secret storage.
5. Run the real HTTP/database integration suite with isolated Neon, Redis, R2 prefix and ClamAV. Verify signed webhook/replay behaviour, duplicate worker runs, recurring invoice ledger idempotency, alert acknowledgement and cross-tenant/branch denial.
6. Create an encrypted staging backup, execute the isolated restore drill with the required second approver/recovery owner, verify ledger/stock/payments/attachments/identity and retain evidence.
7. Only after all gates pass, prepare a reviewed production migration/deployment plan and explicit production release approval.
