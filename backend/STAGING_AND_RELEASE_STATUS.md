> **Historical snapshot notice (3 November 2026):** The deployment and Neon endpoint details in this record describe an earlier staging/release inspection. They are not the current production configuration. Use [the current production compute guide](../docs/deployment/current-compute-configuration.md) for the verified Render `1c-2g` service, Neon 0.5–2 CU endpoint and pooled/direct connection rules. Earlier references to a Free Render service, project-level Neon defaults, or URL startup-role parameters are historical and must not be used for deployment.

# LEXA Workstream 7 — Staging and Release Status

**Prepared:** 2026-11-01  
**Scope:** Increments 1–5  
**Important:** This file is an operational hand-off. It records the environment and staging changes actually verified in this implementation session. It is not a production-release sign-off.

## 1. Environment boundaries

| Resource | Identifier / URL | Status |
|---|---|---|
| Neon project | `empty-mud-76816448` | Verified |
| Production/main branch | `br-snowy-hill-ba5a9ggc` | Not changed for Increment 3–5 this session |
| Validation branch | `br-wandering-paper-ba5lkq5l` | Created from main; Increment 3–5 migrations and disposable CI fixtures applied |
| Restore-target branch | `br-crimson-art-ba94cyfl` | Created from validation before adding the two CI test tenants; contains the updated schema and database `lexa_restore_stage`; the two CI tenants are absent |
| API service | Render `srv-dbhp0f0m7kps73ffeqrg` | Existing service; latest known deployment is build-failed |
| Redis/Valkey | Render `red-dakmbe9594qs73einb2g` (`lexa-redis`) | Available, Frankfurt, Free, persistence `off`; suitable for disposable testing only |
| Vercel project | `lexa_review` / `prj_Pdbd6sJ3yPB80hMvwATxuOeS57KE` | Latest observed production-target deployment in ERROR state |
| R2 bucket | `lexa-private-platform-files` | Private, APAC/default jurisdiction; public `r2.dev` disabled; no custom public domain |

Do not point tests at `br-snowy-hill-ba5a9ggc`. The HTTP test harness has a branch/host guard for the disposable validation branch and refuses any other Neon endpoint.

## 2. Database migrations and worker role

The following migration files are applied and verified on validation branch `br-wandering-paper-ba5lkq5l`:

- `20261101120000_increment3_4_5_platform`
- `20261101130000_increment4_restore_release_control`
- `20261101140000_worker_scoped_queue_access`

The migration history rows and checksums are recorded in `_prisma_migrations` on that branch. They are not applied to production/main as part of this staging work.

The database contains durable platform job attempts/replays, event attempts/receipts/replays, versioned import templates, backup inventory decisions, restore approvals, and restore pause controls. The new tables use tenant policies / forced RLS where applicable.

The original Neon-created `lexa_worker` login was removed after a deeper check found it had `BYPASSRLS=true`; it must not be used. At the time of that staging snapshot, the worker was described as adding `options=-c role=lexa_app_runtime` to its tenant-work URL. That startup-option pattern is retired and must not be copied into live configuration. The current archive keeps the tenant-work URL pooled and applies `lexa_app_runtime` plus `app.tenant_id` transaction-locally after `BEGIN` through `backend/src/platform/tenant-pool.ts`. The no-login runtime role has `BYPASSRLS=false`; tenant context is applied before business or attachment/outbox mutations. Validation checks returned zero unscoped product/session rows, one tenant-A product with tenant-A context, and zero tenant-B product rows with tenant-A context. The discovery pool still uses the privileged `lexa_app` login and is restricted in source to queue/control metadata queries; a production hardening follow-up should replace it with narrow SECURITY DEFINER claim functions or a separately grantable NOLOGIN queue role before treating the worker database boundary as fully least-privileged.

The validation branch contains two disposable fixture tenants, branches, owners, products and opening stock movements. Their stable test IDs are defined in `backend/scripts/test-tenant-idor.mjs`. The fixture seeder is idempotent for its stock movement: it checks for the existing `HTTP integration fixture` movement before inserting a new one.

## 3. HTTP / database end-to-end verification

The automated HTTP harness now exercises:

1. Two independent workspaces and authenticated sessions.
2. Own-tenant product reads and cross-tenant list/direct-ID/branch access denial.
3. POS sale completion, receipt, return and credit-note flow.
4. Delivery-agent creation, a second POS sale, dispatchable-line lookup, dispatch reservation and all delivery lifecycle transitions through delivered confirmation.

The harness is present at `backend/scripts/test-tenant-idor.mjs` and is exposed as `npm run test:tenant-http`. It has not yet been executed end-to-end because dependency-backed API compilation is not available in this environment. It is intentionally bound to the dedicated staging branch and the checked Neon host.

Run only after installing dependencies and generating Prisma client, using a **fresh connection string for `lexa` on branch `br-wandering-paper-ba5lkq5l`**:

```bash
cd backend
npm ci   # or npm install if the package lock has not yet been committed
npm run db:generate
npm run build
LEXA_TEST_BRANCH_ID=br-wandering-paper-ba5lkq5l \
LEXA_TEST_ALLOWED_DB_HOST=ep-small-feather-balf5unj-pooler.c-8.eu-central-1.aws.neon.tech \
DATABASE_URL='<validation-branch connection string>' \
npm run test:tenant-http
```

The current repository snapshot does not contain a committed npm lockfile, so `npm ci` will require a lockfile to be added first; otherwise use `npm install`, then commit the generated lockfile. The installation attempt in the current environment timed out. The HTTP suite must pass on this isolated branch before promotion.

## 4. Redis and hosted worker

The existing `lexa-redis` Render Key Value instance is Free and has persistence disabled. It is **not suitable for production BullMQ queues** because its data is lost on restart. Render documents paid Key Value persistence as disk-backed; use **Journal + Snapshot** for the worker queue. See the Render Key Value documentation: <https://render.com/docs/key-value>.

Provision a paid Render Key Value instance in Frankfurt with:

- persistence: `journal_snapshot`
- eviction policy: `noeviction`
- private/internal connection URL, with TLS as provided by Render

Then create a **Background Worker** (not a public Web Service) in the same Frankfurt region from the reviewed source, using `backend/Dockerfile.worker` as the Dockerfile and repository root as the build context. Render distinguishes background workers from web services; workers are not reachable from the public internet and are designed to fetch work from a queue. See <https://render.com/docs/service-types> and <https://render.com/docs/private-network>.

The Dockerfile installs ClamAV and runs `backend/scripts/start-worker-with-clamav.sh`. Startup refreshes signatures, starts `clamd` bound to loopback, verifies `PING/PONG`, and only then starts the BullMQ worker. `CLAMAV_HOST` is restricted to `127.0.0.1` or `localhost`. A missing scanner or a failed scanner startup prevents the worker from starting; scan errors fail closed.

Required worker-only secrets/configuration are listed in `backend/.env.worker.example`:

- `REDIS_URL`
- `WORKER_DATABASE_URL` as a server-only queue-discovery connection for the LEXA worker; do not configure it in the API or frontend
- `WORKER_TENANT_DATABASE_URL` as a server-only pooled Neon connection (hostname contains `-pooler`); do not append a role startup option. Current worker source applies `DATABASE_RUNTIME_ROLE=lexa_app_runtime` and tenant context transaction-locally after `BEGIN`.
- `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- `CLAMAV_HOST=127.0.0.1`, `CLAMAV_PORT=3310`
- `BACKUP_ENCRYPTION_KEY`, `BACKUP_KEY_VERSION`
- `APP_VERSION`
- restore target variables only for a staging restore drill; `PLATFORM_RESTORE_ENABLED=false` by default

Never place R2 or backup encryption secrets in frontend/Vercel public variables or in this ZIP.

## 5. R2 S3 credentials and private storage

The existing R2 bucket is private and the browser CORS policy is limited to the LEXA Vercel origins. A Cloudflare R2 bucket-scoped Object Read & Write token was created during this session, but the one-time secret was not installed into Render because the Render secret-update action was blocked. Treat that token as **not deployed**; revoke it and create a fresh bucket-specific R2 S3 token from the Cloudflare dashboard so both values can be copied securely once.

Cloudflare's R2 docs state that the S3 Access Key ID is the R2 token ID and the Secret Access Key is the SHA-256 hash of the token `value`; the dashboard flow provides the corresponding credentials and warns that the secret cannot be viewed again. Use the dashboard-generated Access Key ID and Secret Access Key, rather than copying an ordinary Cloudflare API token into AWS SDK fields:

- <https://developers.cloudflare.com/r2/api/tokens/>
- <https://developers.cloudflare.com/r2/get-started/s3/>

Recommended credential settings: Object Read & Write, limited to `lexa-private-platform-files` only, with an expiry/rotation policy. Add them to the Render API and worker services' private server-side environment settings. Do not put them in source control.

## 6. Isolated backup/restore drill

A separate Neon branch `br-crimson-art-ba94cyfl` was created from the validation branch before the disposable HTTP tenants were added. It contains the schema and the dedicated database `lexa_restore_stage`. The two CI tenants are absent from that target, which was verified by a read query. This is a clean target for the **staging** restore drill, not a production database.

The source restore path requires all of the following before actual restore can run:

1. `PLATFORM_RESTORE_ENABLED=true` on the isolated restore runner only.
2. `RESTORE_TARGET_PROJECT_ID=empty-mud-76816448` and `RESTORE_TARGET_BRANCH_ID=br-crimson-art-ba94cyfl`.
3. `RESTORE_TARGET_DATABASE_URL` for `lexa_restore_stage` on that target branch.
4. `PRODUCTION_NEON_PROJECT_ID` / `PRODUCTION_NEON_BRANCH_ID` set so the runner can reject them.
5. A valid independent backup encryption key and an actual completed encrypted backup with its R2 artifacts.
6. A requester, a different second approver and a separate recovery-owner release actor; each step requires the typed confirmation phrase and is audited.

Restore verifies the encrypted manifest and object hashes, checks target schema and target-tenant emptiness, restores users without old password hashes/sessions/reset tokens, disables provider credentials for reconnection, restores attachment objects to new private keys and rescans them, then leaves notifications/recurring work paused until the final release action. It fails closed on missing schema, failed integrity checks, unresolved dependency order or scanner failure.

**The actual restore drill has not been run.** It cannot pass until R2 credentials are installed, a verified encrypted backup exists, a scanner worker is running, and the isolated restore worker has its target connection. The production restore feature must remain disabled.

## 7. Current checks

Source checks last run in this worktree:

- Backend source tests: 64 passing.
- OpenAPI contract coverage: 296 operations across 235 routes; no missing/orphan operations.
- Adapter checks: 17/17.
- Ledger workflow checks: 9/9.
- Backup inventory gate: 144 table decisions; 126 discoverable schema/migration references.
- Changed TypeScript/TSX syntax transpilation: no syntax errors.

These are source/unit/contract checks, **not** full dependency-backed builds or live HTTP E2E results. Full dependency installation timed out; no full Nest/Prisma compile is claimed.

## 8. Deployment / source hand-off

GitHub source writes were rejected by the connected GitHub integration. No push or commit was made. The complete source ZIP is the delivery fallback.

The current Render backend deployment and Vercel `lexa_review` deployment are not green. No new deployment was made from this worktree because its source is not on the connected GitHub `main` branch, and the current build failures must be resolved on the reviewed source before any production promotion. Do not interpret this runbook or the validation branch as a production release.
