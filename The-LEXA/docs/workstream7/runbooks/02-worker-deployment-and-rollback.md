# Worker deployment and rollback

**Prerequisites and permissions:** Release operator with Render worker access and approved runtime secrets.

## Safe procedure
1. Confirm private Redis URL, worker database URL, tenant runtime role, R2 S3 keys, ClamAV host and backup key are installed as server-side secrets. Never copy secrets into GitHub, client variables or logs.
2. Build `backend/Dockerfile.worker` from the same commit/schema version as the API. Verify the image includes ClamAV and the startup wrapper.
3. Deploy a private Background Worker, not a public web service. Keep it in the API region and attach the persistent Redis instance.
4. Confirm a fresh `platform_worker_heartbeats` row, Redis queue depth, ClamAV PING/PONG and R2 configured status. Execute a harmless staging outbox and scan test.
5. Rollback by restoring the previous worker image and matching environment version. Ensure it is compatible with the current database schema before starting it.

## Diagnostic commands and queries

```text
SELECT worker_id,status,last_seen_at,details FROM platform_worker_heartbeats ORDER BY last_seen_at DESC LIMIT 10;
SELECT status,count(*) FROM platform_jobs GROUP BY status;
```

## Verification

- Worker heartbeat is current; queue consumption progresses; test scan and test object read work.

## Stop / rollback conditions

- Do not enable worker against Free non-persistent Redis for production. Stop if it connects using BYPASSRLS or if tenant runtime role is unavailable.

## Escalation

- Escalate to platform/release owner; attach worker image SHA and heartbeat evidence.
