# LEXA worker platform deployment

This compose stack is the reference topology, not proof of a live Render deployment.

- `api`: NestJS HTTP API.
- `worker`: separate BullMQ worker process built with `backend/Dockerfile.worker`.
- `redis`: persistent append-only Redis queue store; `noeviction` is required.
- `clamav`: private-only ClamAV daemon; only the worker can reach TCP 3310.

Create `backend/.env` from `backend/.env.example` and populate it from server-side secret management before `docker compose up`. Never commit this file or expose R2/Redis/database/backup keys through frontend build variables.

Production requirements:

1. Use a private Redis endpoint with authentication and TLS (`rediss://`), persistent storage, `noeviction`, queue-depth alerts and backups.
2. Deploy the API and worker as separate Render services from the same reviewed commit. The worker command is `node dist/src/platform/worker.js`; use the worker Dockerfile/build context `backend`.
3. Deploy ClamAV as a private service with TCP 3310 inaccessible from the public internet. Wait for virus definitions to load and verify a clean EICAR test is quarantined (the test file must never be marked clean).
4. Configure R2 S3-compatible bucket access keys with object-only access scoped to `lexa-private-platform-files`. A Cloudflare API token is not an S3 access-key/secret-key pair.
5. Configure `BACKUP_ENCRYPTION_KEY` as a base64-encoded 32-byte key in server-side secret storage. Record key version and recovery custodians separately; rotate by adding a new key version and retaining old keys for the backup retention period.
6. Configure a dedicated worker database principal with reviewed grants and a tenant-aware service-role/RLS strategy. The background scheduler is cross-tenant; do not use a general application user without reviewing its privileges.
7. Keep `PLATFORM_RESTORE_ENABLED=false` and production restore target identifiers unset until an isolated restore executor and two-person approval process have been independently tested.
8. Verify `/health/ready`, worker heartbeat, Redis persistence, ClamAV scan result, private R2 PUT/GET, queue retry and dead-letter replay before routing production work.

The current Render workspace does not yet have the LEXA Redis/worker/ClamAV services provisioned from this topology. Do not mark Increment 5 deployed until their health and security checks pass.
