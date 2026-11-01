# Import failed, partial, retry or cancel

**Prerequisites and permissions:** Workspace administrator with import approval and audit permissions.

## Safe procedure
1. Inspect the import job, preview hash, rejected row count, apply checkpoints and source file checksum.
2. Confirm the job is in a retryable state and its original preview/approval still applies. Re-run validation if mappings or source content changed.
3. Retry only through the application endpoint using a recorded reason. The row idempotency key must prevent duplicate records.
4. For partial imports, inspect the exact committed checkpoint and reconcile affected domain records before continuing. Cancel only a queued/running job using its supported cancel path.
5. Re-download the error CSV and verify formula escaping, row counts and audit evidence.

## Diagnostic commands and queries

```text
SELECT id,kind,status,attempts,max_attempts,checkpoint,result,error FROM platform_jobs WHERE id='<JOB_UUID>';
SELECT status,count(*) FROM platform_import_rows WHERE job_id='<JOB_UUID>'::uuid GROUP BY status;
```

## Verification

- Expected valid rows are applied once; rejected rows remain visible; audit and checkpoint evidence is complete.

## Stop / rollback conditions

- Do not rerun SQL inserts manually, skip approval, replace preview hash, or claim a partial import is atomic.

## Escalation

- Escalate data mapping issues to business owner and worker failures to platform owner.
