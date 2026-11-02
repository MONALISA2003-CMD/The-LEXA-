# Imports, Backups and Platform Operations Implementation

**Status:** source implementation and automated source checks completed; live migration, hosted worker dependencies, full dependency-backed builds, end-to-end tests, and restore drill are still release blockers. No production promotion was performed.

## Increment 3 — staged imports and exports

Implemented in `backend/src/platform` and `lexa-frontend/src/modules/operations/ImportExportCentrePage.tsx`:

- CSV-only ingestion with 25 MiB cap, UTF-8 validation, conservative delimiter detection, quoted-field parsing, BOM handling, SHA-256 source verification, and server-side clean-attachment requirement.
- Versioned importer templates for products, categories, product variants, customers, suppliers, warehouses, and storage bins. Opening stock remains outside generic import and must use a stock-opening/reconciliation workflow. Tax rule/rate changes are not accepted through generic import.
- Source-to-domain column mapping, explicit static defaults, row/column validation, duplicate source identifier detection, tenant/branch foreign-reference checks, create/update previews, before/after values, preview hash, and downloadable formula-safe CSV errors.
- Preview writes only staging/job rows. Apply requires an administrator and exact preview hash. Up to 1,000 valid rows apply in one transaction; larger imports require explicit checkpointed partial-apply opt-in. Each applied row is idempotently upserted and audited. Worker checkpoints permit retry without duplicate source records.
- Exports support CSV, JSONL.GZ and ZIP (ZIP is capped at 100 MiB). Exports use repeatable-read snapshots, keyset pagination, tenant/branch scope, date filters on supported tables, secret-column exclusions, formula-safe CSV and a manifest. Export artifacts are private and downloads use 60-second signed URLs with audit events.
- Import/export centre screen, template download, column mapping, validation preview, approval, progress and private artifact download.

Known Increment 3 limits:
- XLSX is not enabled; only CSV is accepted.
- Tax code/rule imports are deliberately withheld from generic import to prevent unapproved tax-rate changes.
- Opening stock remains a dedicated reconciliation workflow and is not accepted by the generic importer.
- Generic PDF exports are not implemented; PDF remains reserved for supported human-readable reports.
- Workspace ZIP exports are capped at 100 MiB; use JSONL.GZ for larger exports.

## Increment 4 — backup inventory, encryption and restore controls

Implemented:

- `backend/backup/authoritative-inventory.json` contains 143 authoritative/reconstructed/excluded table decisions.
- `backend/scripts/check-backup-inventory.py` discovers Prisma-mapped models and raw SQL migration table references; build fails if a discovered table has no inventory decision.
- Backup worker uses a repeatable-read, read-only PostgreSQL snapshot, keyset pagination in bounded 500-row chunks, AES-256-GCM encryption with a unique 96-bit nonce per object, authentication tags, SHA-256 checksums, versioned manifest, key-version marker and private R2 storage.
- Tenant-specific scope adapters include workspace root, tenant/branch tables, user identity references selected through tenant membership, and related job/event attempts. Secrets, sessions, password reset tokens and provider credentials are excluded.
- Clean, quarantined and pending-scan attachment objects are copied into encrypted backup objects after source checksum/size verification. Restore metadata explicitly requires rescanning.
- Restore dry-run verifies manifest authentication, chunk and attachment hashes, row counts, target schema presence and empty-workspace condition without writing data. It requires an explicitly configured isolated target and denies configured production project/branch identifiers.

Known Increment 4 blockers:
- The actual restore executor is now implemented in source behind `PLATFORM_RESTORE_ENABLED=false`, with non-production target matching, a distinct second approver and recovery-owner release, reauthentication, provider credential reset, attachment rescanning, and outbound/recurring pause controls.
- No isolated staging restore drill has run. Reconciliation coverage and restore execution remain unaccepted until that drill passes.
- Backup encryption key, key custody, rotation and recovery must be configured in server-side secret management. The key must never be stored in the backup archive or frontend.
- Backup object retention, legal holds and lifecycle policy still require operator configuration.

## Increment 5 — durable jobs, outbox, retries and dead letters

Implemented in source:

- Dedicated worker entry point and worker Dockerfile, separate from API process.
- BullMQ queue backed by Redis, durable PostgreSQL `platform_jobs`, checkpoints, heartbeat, attempt history, max attempts, next-available timestamp, worker version and result manifest.
- Typed handlers for staged imports, exports, backups and restore dry-runs.
- Exponential backoff with jitter and bounded one-hour delay; permanent failures go to dead-letter state. Job retry requires administrator permission and an audit reason.
- Outbox claim uses `FOR UPDATE SKIP LOCKED`, two-minute leases, attempt history, next-attempt time, a known-event consumer registry and idempotent event receipts. Unknown event types are not acknowledged; they dead-letter. Administrator replay requires a reason and is audited.
- Graceful worker shutdown, readiness/degraded heartbeat and bounded queue dispatch batches.
- Worker requires private Redis, R2 server credentials, private ClamAV and a worker database connection; it fails closed if required configuration is absent.

Known Increment 5 blockers:
- Render has an existing Free `lexa-redis` Key Value instance, but persistence is `off`; a paid persistent Key Value instance and separate worker process are still required.
- ClamAV is now embedded in `backend/Dockerfile.worker` and bound to loopback, but the worker/scanner container is not deployed or verified in Render.
- R2 S3-compatible bucket credentials have not been installed into Render server-side secrets. A Cloudflare API token is not an R2 S3 access-key/secret-key pair; do not substitute one.
- Worker source uses a server-only queue discovery pool and a separate tenant-work pool that forces `role=lexa_app_runtime` (`BYPASSRLS=false`) with tenant context. The queue discovery connection is still the privileged `lexa_app` login and is a production hardening item; it must be replaced with narrow queue-claim functions or a separately grantable queue role before final security acceptance.
- The outbox consumer currently writes durable internal event receipts; external notifications/provider delivery handlers are not included in this increment's verified runtime.

## Source verification

- Backend source tests: **61 passed, 0 failed**.
- OpenAPI: **291 operations across 230 routes**, exact route match.
- Route-to-adapter coverage: **17 adapters passed**.
- Ledger workflow coverage: **9 workflows passed**.
- Backup inventory CI check: **143 decisions; 125 discovered Prisma/raw-SQL table references covered**.
- Changed TypeScript/TSX files passed TypeScript syntax transpilation.

Full dependency-backed backend/frontend builds were not completed: dependency installation timed out in this environment. No HTTP/database end-to-end import, export, POS, delivery, worker, backup or restore tests were run against a staging deployment. The new migration has not been applied to Neon. The source has not been pushed to GitHub and Render/Vercel have not been rebuilt from it.

## Required release sequence

1. Re-run `prisma migrate status` against the isolated validation branch and verify all Increment 3–5 migration checksums. Production/main remains unchanged.
2. Revoke the unused one-time R2 token, create a fresh bucket-scoped S3 credential, and install its Access Key ID/Secret Access Key as private Render secrets; configure a versioned 32-byte backup encryption key and recovery custody.
3. Provision paid persistent Render Key Value, deploy `backend/Dockerfile.worker` as a private Background Worker in Frankfurt, and verify worker heartbeats plus ClamAV PING/PONG and clean/infected scan outcomes.
4. Complete dependency-backed backend and frontend builds in CI; run API/worker contract tests.
5. Run `npm run test:tenant-http` on the checked validation branch; verify staged import/export, POS, delivery, and cross-tenant/branch denial.
6. Create a completed encrypted backup, run restore dry-run and actual restore only on `br-crimson-art-ba94cyfl` / `lexa_restore_stage`, then complete a second-operator review and reconcile ledger, stock, payments, delivery remittances, attachment hashes/rescans and identity relinking.
7. Only then consider production promotion. Keep production restore disabled by default.

---

## Staging follow-up — 2026-11-01 (current authoritative status)

This section supersedes earlier counts and staging statements above.

### Neon validation branch

- Production/main `br-snowy-hill-ba5a9ggc` was not changed for Increments 3–5.
- Validation branch `br-wandering-paper-ba5lkq5l` has the Increment 3–5 platform schema, restore controls, worker access grants and two disposable HTTP fixture tenants with products and stock.
- The migration history includes `20261101120000_increment3_4_5_platform`, `20261101130000_increment4_restore_release_control`, and `20261101140000_worker_scoped_queue_access` with checksums matching the current migration source.
- Separate restore-target branch `br-crimson-art-ba94cyfl` contains the schema and `lexa_restore_stage`, but not the two new CI tenants. It is isolated from main.

### Worker RLS hardening

- The first Neon-managed `lexa_worker` login was found to have `BYPASSRLS=true`; it was deleted from the validation branch and is not used by the worker.
- The worker now uses separate connection pools: a private queue-discovery connection and a tenant-work connection which sets `options=-c role=lexa_app_runtime`. The no-login runtime role has `BYPASSRLS=false`; every tenant operation sets `app.tenant_id` first.
- Validation queries confirmed zero unscoped product/session rows, one product in tenant A with tenant A context, and zero tenant B product rows under tenant A context.
- The queue-discovery connection is still a privileged server-only `lexa_app` login used only for bounded platform job/attachment/outbox metadata projections and job claim. This remains a hardening item: before production, replace it with narrow database claim functions or an independently grantable NOLOGIN queue role. Never expose this connection to API request handlers or clients.

### ClamAV and document scanning

- The worker Dockerfile now installs ClamAV and starts `clamd` bound to loopback before starting the worker. Startup refreshes the signature database and waits for PING/PONG; it fails closed when signatures or scanner startup fail.
- The ClamAV INSTREAM command now sends an actual NUL terminator. Tests cover clean, infected, unavailable and timeout responses.
- The hosted worker/scanner are not yet deployed, so live R2 upload-to-scan-to-download verification remains a release-phase test.

### R2 credential status

- R2 remains private with public `r2.dev` disabled, no custom public domain and CORS restricted to the LEXA Vercel origins.
- A bucket-scoped token was created, but its one-time S3 secret was not installed into Render. Treat it as unused; revoke it and create a fresh R2 S3 Object Read & Write credential scoped only to `lexa-private-platform-files`. Store the S3 Access Key ID and Secret Access Key in private Render secrets only. Cloudflare's R2 docs explain that the token ID maps to the S3 Access Key ID and the SHA-256 hash of the token value maps to the S3 Secret Access Key; the secret cannot be retrieved again after the initial creation screen.

### Restore

- The source now includes an actual restore executor behind `PLATFORM_RESTORE_ENABLED=false` by default, with exact non-production target checks, requester/second-approver/recovery-owner separation, encryption/hash checks, target emptiness, ordered inserts, identity reauthentication, provider credential reset, attachment re-scan, ledger balance check and paused outbound/recurring work.
- The target branch and database are provisioned and schema-checked. No backup artifact was restored; no actual restore drill has run. The backup exporter intentionally fails closed when it encounters a table without a verified tenant-specific keyset adapter or dependency plan.

### Current source checks

- Backend tests: **64 passed, 0 failed**.
- OpenAPI: **296 operations across 235 routes**, exact route match.
- Adapter checks: **17/17**.
- Ledger workflow checks: **9/9**.
- Backup inventory: **144 table decisions; 126 discovered schema/migration references**.
- TypeScript/TSX syntax transpilation: **155 files, 0 syntax errors**.

These are source/unit/contract/inventory checks, not full dependency-backed builds. The HTTP harness is prepared and bound to the dedicated validation branch, but it has not run because dependencies/build artifacts are not available in this environment. GitHub source writes remain blocked; the complete ZIP is the hand-off. Render Redis remains Free with persistence off, no worker is deployed, and the current Render/Vercel deployments have not been rebuilt from this source and are not confirmed green.
