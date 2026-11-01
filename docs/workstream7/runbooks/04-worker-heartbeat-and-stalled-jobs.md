# Worker heartbeat and stalled jobs

**Prerequisites and permissions:** Platform operator with Operations Centre access.

## Safe procedure
1. Check the last heartbeat, worker version, queue depth, oldest queued age, active jobs and worker logs.
2. Find the exact job type and durable PostgreSQL record. Check whether a job is actively leased or has exceeded its lease/heartbeat threshold.
3. For platform jobs, use the Operations Centre retry/cancel path with an audit reason. For outbox events, inspect source event and receipt state before replay.
4. Restart one worker instance only after capturing logs and confirming no external side effect is in flight. The dispatcher should republish durable pending work.
5. Verify the job reaches a terminal success/failure state and that idempotency prevents duplicate invoice, journal, stock or receipt effects.

## Diagnostic commands and queries

```text
SELECT worker_id,status,last_seen_at,details FROM platform_worker_heartbeats ORDER BY last_seen_at DESC;
SELECT id,kind,status,attempts,max_attempts,available_at,correlation_id,error FROM platform_jobs WHERE status IN ('queued','running','failed','dead_letter') ORDER BY created_at LIMIT 100;
```

## Verification

- Heartbeat fresh, oldest job age within SLA, and no unexpected active lease remains.

## Stop / rollback conditions

- Do not replay an unknown job or delete a job row to “unstick” it. Stop if source event or financial side effect is ambiguous.

## Escalation

- Escalate to service owner with job ID, correlation ID, worker release and runbook actions.
