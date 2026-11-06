# LEXA platform worker: controlled production rollout

## Safety boundary

The existing Render web service `lexa-backend-api-live` must not be recreated, renamed,
or replaced. The worker is a **new** private background worker in Frankfurt, using
`docs/deployment/render-worker.yaml`, which is deliberately separate from the API
`render.yaml`. It must **not** run Prisma migrations; the API deployment remains the
single controlled migration coordinator. No production data needs to be reset.

## Dependency checks before enabling the worker

1. Verify the LEXA Neon production database (`lexa-backend`, production branch) has
   no unresolved `_prisma_migrations`, and `lexa_app_runtime` retains `NOBYPASSRLS`.
   Run the read-only SQL audit in `docs/operations/runbooks/LEXA_RELEASE_SQL_AUDIT.sql`
   via a database admin connection; never export user rows to logs.
2. Upgrade the **existing** Render Key Value instance `lexa-redis` from Free to a
   durable paid plan and turn on Journal + Snapshot. **Upgrading Free or changing
   persistence from Off loses its current in-memory contents.** Only perform that
   during an approved maintenance window after auditing/replaying durable queue
   state from Neon; do not create a second queue endpoint by accident. Render
   charges for the paid Key Value instance.
3. Provision a private ClamAV daemon in the same private network. Confirm `zPING`
   returns `PONG`, signature updates work, and infected samples are blocked;
   do not use a public ClamAV port or disable scan-on-upload.
4. Existing R2 buckets `lexa-private-platform-files` and `lexa-staging-private-files`
   were observed on 6 November 2026, with public r2.dev disabled and no custom
   public domains. Verify the account/access keys, object versioning
   and least-privilege permissions, and perform one quarantined-file scan, clean
   object copy and deletion test **in an isolated test bucket**.
5. Set the worker's private Render environment variables without putting secrets
   in Git. Use pooled Neon DB URLs without `options=-c role=...`. Confirm the
   runtime role is exactly `lexa_app_runtime` and the worker has required grants.
6. Verify Resend sending configuration; keep tenant email notifications disabled
   until preview email and suppression tests pass.
7. Create a **new standalone Blueprint** using the YAML above in `My Workspace`,
   `autoSync=false` and `existingResources=create_new`; inspect the plan and monthly
   cost before approving. `LEXA_WORKER_ENABLED=false` and `LEXA_WORKER_DURABLE_REDIS_CONFIRMED=false` ensure it fails closed until
   configuration is complete; enabling it should be the final approved action.
8. First enable on a disposable staging database/queue and confirm Redis queue
   reception, worker heartbeats within 60 seconds, retries, quarantined malware,
   duplicate task idempotency and graceful SIGTERM. Only then connect to production.
9. In production, verify `platform_worker_heartbeats.status='healthy'`, outbox
   counters and queue oldest age. Confirm the heartbeat becomes `degraded` when
   the scanner is unavailable; pending file scans must **not** be marked clean.

## Existing-API follow-up

The `render.yaml` source includes `healthCheckPath: /health/ready`, but live Render
settings previously returned an empty health-check path. In the existing API
service's Settings, set that value and verify deployments fail readiness when
Neon is unreachable. Never run destructive health probes.

## Recovery

If the worker produces incidents or repeated retries, set `LEXA_WORKER_ENABLED=false`
and redeploy/stop **only the worker**, leaving API + Neon untouched. Inspect
`platform_jobs`, `module_domain_events`, and `notification_email_deliveries`
with read-only queries, correct the cause, then resume from persistent IDs.
Never use `prisma migrate reset`, truncate business tables, or replay email
without idempotency verification.
