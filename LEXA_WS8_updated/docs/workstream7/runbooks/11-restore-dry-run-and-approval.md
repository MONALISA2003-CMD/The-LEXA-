# Restore dry run and actual restore approval

**Prerequisites and permissions:** Recovery owner, two distinct approvers and isolated Neon target owner.

## Safe procedure
1. Identify the exact tenant/scope, backup manifest, target database/branch and recovery objective. Confirm the target is disposable and not production.
2. Run dry-run only. Validate manifest authentication, chunk/attachment hashes, schema compatibility, target emptiness and backup completeness.
3. Obtain independent requester, second approver and recovery-owner approval according to the restore gate. Reauthenticate and record approval evidence.
4. Enable restore only for the named isolated target and exact restore job. Keep external notifications, recurring generation and outbound processing paused.
5. After restore, relink identities, reset provider credentials, rescan attachments, reconcile journals/payments/stock/delivery remittances, then verify tenant access before any staging use.

## Diagnostic commands and queries

```text
Confirm the target branch and database name directly in Neon before starting.
SELECT count(*) FROM tenants;
Run application restore dry-run and reconciliation reports; retain their IDs and hashes.
```

## Verification

- Dry-run is clean; target matches the approved branch/database; second approval is distinct; reconciliation passes.

## Stop / rollback conditions

- Never restore to production, reuse production credentials, skip independent approval, or enable outbound processing before reconciliation. Stop on any hash/schema/identity mismatch.

## Escalation

- Escalate to named recovery owner and database owner.
