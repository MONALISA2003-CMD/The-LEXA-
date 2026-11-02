# ClamAV and attachment scanning

**Prerequisites and permissions:** Security/platform operator; access to worker logs and private R2 bucket.

## Safe procedure
1. Check worker heartbeat detail `clamav`, scanner process health, signature update logs and pending_scan/scan_failed backlog.
2. If ClamAV is unavailable, leave uploads quarantined and downloads denied. Restore the scanner or deploy a corrected worker image.
3. Run the scanner protocol health probe, then use the controlled EICAR test file in staging only to verify infected-file quarantine. Confirm a harmless clean test file is promoted to its immutable clean key.
4. For backlog, verify Redis and worker concurrency before replaying scan jobs. Do not manually set a record to clean.
5. After recovery, verify size and SHA-256 checks, scan engine and scan timestamp for test artifacts; quarantine infected content and follow incident procedure.

## Diagnostic commands and queries

```text
SELECT status,count(*),min(created_at) AS oldest FROM platform_attachments GROUP BY status ORDER BY status;
SELECT id,status,scan_engine,scan_metadata,sha256,size_bytes FROM platform_attachments WHERE status IN ('pending_scan','scan_failed','quarantined') ORDER BY created_at LIMIT 50;
```

## Verification

- ClamAV PING/PONG succeeds; clean/infected fixtures yield expected states; no pending file is served.

## Stop / rollback conditions

- Never bypass scanning, mark objects clean by SQL, download quarantined files, or disable fail-closed behavior.

## Escalation

- Escalate malware findings to security owner and operational backlog to platform owner.
