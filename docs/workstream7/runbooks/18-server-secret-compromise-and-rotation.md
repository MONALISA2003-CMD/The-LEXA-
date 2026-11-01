# Compromised server-side secret rotation

**Prerequisites and permissions:** Security owner and service owners for affected provider.

## Safe procedure
1. Identify the secret type and scope: database, Redis, R2 S3, Resend, Sentry, OTLP, backup encryption key or session signing/reset key.
2. Create a replacement with the narrowest required scope. Store it only in approved secret management and document version/owner/rotation date without copying the value into evidence.
3. Update the affected Render/API/worker secret references during an approved change window. Verify service health and a harmless provider connectivity test.
4. Revoke the old credential and inspect provider audit logs, unexpected sends, object operations and database logins from the suspected exposure window.
5. For backup encryption key rotation, preserve old key recovery custody and validate decryptability of retained backups before decommissioning old key material.

## Diagnostic commands and queries

```text
Review provider audit activity and recent login/use history. Confirm no old secret remains in service environments.
```

## Verification

- New credential works; old credential revoked; affected services healthy; forensic review recorded.

## Stop / rollback conditions

- Do not reveal secret values, reuse a leaked key, store keys in ZIP/GitHub, or discard an old backup key before retention expiry and recovery proof.

## Escalation

- Escalate to security owner and credential provider support if unrecognized activity appears.
