> **Historical snapshot notice (3 November 2026):** The deployment details later in this file are a 1 November 2026 handoff snapshot and are not current provider settings. Current Render and Neon compute, database endpoint, connection pooling, role and cost configuration is recorded in [the current production compute guide](../docs/deployment/current-compute-configuration.md). The historical Free/Starter and endpoint-default statements below are retained only to explain the earlier build/deployment history.

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

## Deployment-log repairs applied on 2026-11-01

The source in this handoff incorporates the current Render and Vercel build-log findings, in addition to Increments 6 and 7:

- **Render / `platform-jobs.ts`:** the import-preview hash now uses the existing SHA-256 helper; the typed mapped-import row exposes its optional `before` snapshot; ZIP table members are named as JSONL because ZIP export stores JSONL rows; restore dependency ordering now safely handles optional map lookups; and restore target table collections are explicitly typed as `string[]`.
- **Render / `platform.controller.ts`:** the download URL result mapping has explicit callback parameter types, removing strict-mode implicit-`any` errors.
- **Render / `finance-operations.controller.ts`:** fixed-asset depreciation reads `AccountingPeriod.startsOn`, matching the Prisma model (not the nonexistent `startDate`).
- **Backend import contracts:** `validateMappedRows` now explicitly types the action discriminator so its return value satisfies `MappedImportRow` under strict TypeScript.
- **Vercel / `sales-workflow.ts`:** implemented the required local `getPaymentReport` workflow with date filters, receipts/refunds, return-adjusted receivables, ageing buckets and a clear local-only assurance statement.
- **Vercel / `ImportExportCentrePage.tsx`:** import preview rows load through the authorised `jobs/:jobId/import-rows` endpoint for newly generated and previously selected preview jobs.
- **Vercel / `TaxDocumentsPage.tsx`:** reviewer notes are now an editable, length-bounded field that is passed to the independent approval endpoint.
- **Vercel / LEXA palette prebuild:** added an explicit navy accent for `/operations`; all existing module IDs and sidebar routes are covered by the palette validation gate.

The frontend scripts `apply_auth_security_ui.mjs`, `complete_modules.py`, `apply_lexa_palette.py` and `fix_build_origin.py` were executed against this source. The palette script initially exposed the missing `/operations` accent; the mapping was added and the script then passed.

## Historical deployment inspection (snapshot of 1 November 2026)

- **Vercel:** team access is now authorised. Project `lexa_review` (`prj_Pdbd6sJ3yPB80hMvwATxuOeS57KE`) uses Vite and Node 22.x. The latest deployment for commit `e8cff2f` is in `ERROR` at `buildStep` with `lint_or_type_error`. Its logs show all 97 existing frontend tests pass (22 test files), followed by the three strict TypeScript errors addressed above. SSO protection is enabled for deployment aliases.
- **Render:** `lexa-backend-api-live` (`srv-dbhp0f0m7kps73ffeqrg`) watches `main`, uses the repository-root `backend/Dockerfile`, and has automatic deploy on commit. Latest deploy `dep-dbjibr2qphnc73e1vqfg` for `e8cff2f` failed during `nest build` with seven source typing errors addressed above. This is a Free web service; it has no health-check path configured and it does not include a deployed worker.
- The source ZIP is a handoff for upload/extraction at the repository root. **No GitHub branch, commit, PR, hosted redeploy, database migration or production setting was changed by this repair.**

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
- Vercel project access has since been authorised and the latest deployment/logs inspected. The project remains on a failed deployment until the repaired root-level source is extracted and a new commit is built.
- GitHub repository source was inspected read-only. No branch, commit, PR or main-branch write was made during this repair; the updated source is delivered as a root-level handoff ZIP.
- The local runtime has no usable project dependencies: the frontend `npm test` attempt stops because `vitest` is not installed, no usable npm cache is present, and DNS resolution for `registry.npmjs.org` fails. Full frontend `tsc -b && vite build`, full backend `nest build`, and the new frontend payment-report test still require a dependency-enabled CI/staging runner.
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
