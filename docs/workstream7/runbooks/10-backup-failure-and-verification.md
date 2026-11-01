# Backup failure, key or hash verification

**Prerequisites and permissions:** Backup owner and recovery owner.

## Safe procedure
1. Check latest successful backup per tenant/scope, backup job state, object manifest version, encryption key version and error summary.
2. Confirm the server-side backup encryption key is available through approved secret management and its 32-byte decoded length matches the configured contract.
3. For a failed backup, inspect the unsupported table/keyset adapter error. Do not add a broad SELECT that bypasses tenant scope.
4. Retry the backup after correcting the missing adapter or R2 credential. Verify authenticated manifest, per-chunk AES-GCM tags, size and SHA-256.
5. Keep key custody/recovery evidence separate from backup artifacts. Rotate keys only with an approved re-encryption/recovery plan.

## Diagnostic commands and queries

```text
SELECT id,status,kind,attempts,error,manifest,result,created_at FROM platform_jobs WHERE kind='backup' ORDER BY created_at DESC LIMIT 20;
Check backup manifest key version, chunk count and SHA-256 from the verification tool.
```

## Verification

- A full backup is readable/authenticated and all expected tenant tables/attachments are represented.

## Stop / rollback conditions

- Do not store the key in the archive, disable authentication, or delete the last known-good backup.

## Escalation

- Escalate to backup owner and recovery owner.
