# LEXA Workstream 7 — Increments 3–5 implementation report

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
- Actual restore execution is deliberately disabled. A dependency-ordered isolated restore executor, identity relinking, financial/inventory/payment/delivery reconciliation and second-operator sign-off have not been completed.
- No isolated staging restore drill has run. Therefore Increment 4 is not complete and cannot be accepted as production-ready.
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
- Render currently has no dedicated LEXA Redis/Key Value service or worker service. A durable Redis instance and separate worker process must be provisioned and configured.
- A private ClamAV service is described in `deploy/workstream7/docker-compose.yml`, but no hosted ClamAV service is deployed or verified.
- R2 S3-compatible bucket credentials have not been installed into Render server-side secrets. A Cloudflare API token is not an R2 S3 access-key/secret-key pair; do not substitute one.
- The worker database role must be provisioned with the minimum platform/business-table grants needed for background jobs and tenant-scoped operations. The worker's cross-tenant scheduler needs an explicitly reviewed service-role/RLS strategy.
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

1. Apply and verify `20261101120000_increment3_4_5_platform` on a temporary Neon branch, then obtain approval before applying it to the intended target.
2. Install the R2 S3 access-key/secret-key pair as server-only Render secrets; configure a versioned 32-byte backup encryption key and rotation custody.
3. Provision persistent private Redis, private ClamAV and the dedicated Render worker service; verify heartbeats and scanner health.
4. Complete dependency-backed backend and frontend builds in CI; run API/worker contract tests.
5. Run staged import/export tests, real POS/delivery tests, and tenant/branch isolation tests against seeded staging fixtures.
6. Implement actual restore, complete an isolated multi-branch restore drill and second-operator review; reconcile ledger, stock, payments, delivery remittances, attachments and identity relinking.
7. Only then consider production promotion. Keep production restore disabled by default.
