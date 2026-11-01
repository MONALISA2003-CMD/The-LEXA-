# Export failed, expired or download issue

**Prerequisites and permissions:** Workspace administrator with reports/export permission.

## Safe procedure
1. Inspect export job status, snapshot watermark, manifest and artifact list. Confirm tenant and branch scope.
2. For failed exports, inspect safe error summary and retry through Operations Centre after correcting the configuration.
3. For expired signed links, request a fresh download URL after rechecking authorization. Do not extend or reuse an expired URL.
4. Verify manifest SHA-256 and row/table counts before sharing. Treat export artifacts as confidential and time-limited.
5. Clean abandoned artifacts through configured retention/lifecycle controls only after verifying no active download or legal hold.

## Diagnostic commands and queries

```text
SELECT id,status,kind,manifest,result,error,created_at,updated_at FROM platform_jobs WHERE id='<JOB_UUID>';
Check artifact manifest hashes and signed URL expiry from the application response.
```

## Verification

- A fresh signed URL is short-lived, download is authorized, and manifest checksum matches.

## Stop / rollback conditions

- Do not make R2 public, bypass branch authorization or manually extend signed URLs.

## Escalation

- Escalate data access or scope errors to security owner.
