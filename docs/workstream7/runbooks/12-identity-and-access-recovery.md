# Identity and access recovery

**Prerequisites and permissions:** Workspace owner and security administrator; recovery-owner process.

## Safe procedure
1. Verify the requester using an approved out-of-band identity check. Do not rely only on the compromised session or email thread.
2. Freeze affected sessions/invitations or compromised membership using supported admin workflows. Preserve audit evidence.
3. Restore access through a second verified owner/admin, rotate reset/session secrets if compromised and require sign-in reauthentication.
4. Review tenant and branch memberships, restricted branch assignments and privileged roles. Remove unexpected grants and confirm no orphaned privileged identity remains.
5. Confirm access with the affected user and run negative tests against unrelated tenant and branch records.

## Diagnostic commands and queries

```text
SELECT user_id,status,role,branch_scope_mode FROM memberships WHERE tenant_id='<TENANT_UUID>'::uuid;
SELECT user_id,branch_id FROM branch_memberships WHERE tenant_id='<TENANT_UUID>'::uuid;
```

## Verification

- Only approved identities can authenticate; branch and tenant permissions match the recovery record; cross-tenant denial passes.

## Stop / rollback conditions

- Do not share passwords, reset links, cookies or bearer tokens. Do not assign owner role as a convenience workaround.

## Escalation

- Escalate suspected account takeover to security owner.
