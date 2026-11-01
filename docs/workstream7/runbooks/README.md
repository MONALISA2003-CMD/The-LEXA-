# Workstream 7 operational runbooks

Runbooks are operator procedures, not proof that the underlying service has been deployed or exercised. Use a staging target first and retain command output, commit SHA, job IDs and approval references in the release evidence bundle.

- [API deployment and rollback](01-api-deployment-and-rollback.md)
- [Worker deployment and rollback](02-worker-deployment-and-rollback.md)
- [Redis outage and recovery](03-redis-outage-and-recovery.md)
- [Worker heartbeat and stalled jobs](04-worker-heartbeat-and-stalled-jobs.md)
- [ClamAV and attachment scanning](05-clamav-and-attachment-scanning.md)
- [R2 credential outage and rotation](06-r2-credentials-and-rotation.md)
- [R2 object hash mismatch or missing object](07-r2-object-hash-mismatch.md)
- [Import failed, partial, retry or cancel](08-import-failed-partial-retry-cancel.md)
- [Export failed, expired or download issue](09-export-failed-expired-download.md)
- [Backup failure, key or hash verification](10-backup-failure-and-verification.md)
- [Restore dry run and actual restore approval](11-restore-dry-run-and-approval.md)
- [Identity and access recovery](12-identity-and-access-recovery.md)
- [Outbox dead-letter inspection and replay](13-outbox-dlq-inspection-and-replay.md)
- [Resend bounce, complaint and webhook failure](14-resend-bounce-complaint-and-webhook.md)
- [Recurring invoice failure and duplication prevention](15-recurring-invoice-failure-and-duplication.md)
- [Database migration failure, rollback or forward fix](16-database-migration-failure-and-forward-fix.md)
- [Cross-tenant access or security incident](17-cross-tenant-or-security-incident.md)
- [Compromised server-side secret rotation](18-server-secret-compromise-and-rotation.md)
- [Staging restore drill execution and evidence](19-staging-restore-drill-evidence.md)

## Release note

Do not promote Increment 6/7 to production until dependency-backed backend/frontend builds, HTTP/database E2E, signed Resend webhook integration, worker/R2/ClamAV tests, migration upgrade/fresh-install validation, and an isolated actual restore drill have passed. The currently validated Neon staging branch includes historical Increment 6/7 migration records whose source files were absent from the supplied ZIP; the new `20261101170000_increment6_7_runtime_hardening` migration is a forward-only recovery/hardening migration. Never edit historical applied checksums or apply this migration to production merely because it exists.

See [`backend/INCREMENT_6_7_IMPLEMENTATION_STATUS.md`](../../../backend/INCREMENT_6_7_IMPLEMENTATION_STATUS.md) for the implementation inventory, verified source checks, live dependency blockers and release sequence.
