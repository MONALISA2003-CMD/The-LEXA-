# R2 object hash mismatch or missing object

**Prerequisites and permissions:** Security/platform operator; backup owner for backup artifacts.

## Safe procedure
1. Preserve the affected object key, attachment/backup ID, expected SHA-256 and size. Capture S3 request IDs and worker logs without exposing content.
2. Prevent download/restore of the affected object. For attachments, keep status quarantined or scan_failed; for backups, mark the artifact unavailable for restore.
3. Check versioning/retention and compare the source manifest, metadata and object ETag. ETag is not a substitute for SHA-256.
4. Recover from a separately verified backup/object version. Recompute SHA-256 and size after copy; record evidence.
5. Investigate credential scope, upload completion race, object overwrite and lifecycle rules before returning service.

## Diagnostic commands and queries

```text
SELECT id,object_key,sha256,size_bytes,status FROM platform_attachments WHERE id='<ATTACHMENT_UUID>';
Inspect signed manifest checksum and recorded object metadata; do not write corrected hashes without verified source evidence.
```

## Verification

- Hash and size match an independently verified manifest; access control remains enforced.

## Stop / rollback conditions

- Do not modify expected hashes to match corrupted bytes, or restore an object with failed authentication/hash checks.

## Escalation

- Escalate to security and backup/recovery owner.
