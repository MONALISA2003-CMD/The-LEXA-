# R2 credential outage and rotation

**Prerequisites and permissions:** Cloudflare/R2 owner and Render secret editor.

## Safe procedure
1. Confirm the bucket is private, public `r2.dev` access is disabled and the S3 endpoint/region are correct.
2. Create a bucket-scoped S3 Object Read & Write credential. Capture the Access Key ID and Secret Access Key once; a Cloudflare API token is not interchangeable with S3 credentials.
3. Install the key pair only as Render server-side secrets for the API/worker services that need object access. Never commit the secret or put it in Vercel browser variables.
4. Run a staging private-object put/head/get/delete test using a dedicated test prefix and verify no anonymous read works.
5. Revoke the old credential after successful rotation. Re-run a restore-manifest object read check before resuming backups.

## Diagnostic commands and queries

```text
SELECT id,status,object_key,sha256,size_bytes FROM platform_attachments WHERE status IN ('pending_scan','clean') ORDER BY created_at DESC LIMIT 20;
```

## Verification

- A bucket-scoped S3 credential works; test objects remain private; API/worker can access only required bucket.

## Stop / rollback conditions

- Do not publish a public bucket, use broad account tokens, or paste secret keys into chat/issues/logs.

## Escalation

- Escalate to Cloudflare account owner and incident response if credential leakage is suspected.
