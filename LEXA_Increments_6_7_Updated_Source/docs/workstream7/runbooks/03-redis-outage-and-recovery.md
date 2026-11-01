# Redis outage and recovery

**Prerequisites and permissions:** Platform operator with Render Key Value and worker access.

## Safe procedure
1. Confirm the Redis instance state, region, plan and persistence mode in Render. Check API and worker logs before restarting.
2. If Redis is unavailable, do not assume BullMQ queue state is durable. The PostgreSQL platform jobs and transactional outbox remain the durable source of work.
3. Restore the Redis instance or provision a replacement persistent instance. Rotate the Redis password if compromise is suspected; update both API/worker secrets atomically.
4. Restart the worker only after TCP/TLS authentication and queue connectivity are confirmed. Let the durable PostgreSQL dispatcher repopulate pending jobs.
5. Compare PostgreSQL job/outbox counts with BullMQ queue state, replay only through audited application controls, and inspect duplicate financial/stock effects.

## Diagnostic commands and queries

```text
SELECT status,count(*) FROM platform_jobs GROUP BY status;
SELECT outbox_status,count(*) FROM module_domain_events GROUP BY outbox_status;
SELECT count(*) AS stale_jobs FROM platform_jobs WHERE status IN ('queued','failed') AND available_at<now()-interval '10 minutes';
```

## Verification

- Redis is reachable with authentication; worker heartbeat fresh; durable pending items drain; no duplicate financial effects.

## Stop / rollback conditions

- Do not FLUSHDB, delete queue keys, change job IDs, or run destructive Redis commands. Do not use the existing Free instance with persistence off for production.

## Escalation

- Escalate to Render owner and database owner; record outage interval and recovery evidence.
