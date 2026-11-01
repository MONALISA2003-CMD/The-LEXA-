# Cross-tenant access or security incident

**Prerequisites and permissions:** Security incident commander and database owner.

## Safe procedure
1. Preserve request ID/correlation ID, actor, route, timestamp and relevant audit/Sentry evidence. Do not include raw sensitive payloads in the incident ticket.
2. Contain the path using supported feature flag/route disablement, affected account suspension or least-privilege credential rotation. Preserve forensic evidence.
3. Identify all affected tenant/branch rows and review RLS policies, FORCE RLS, role BYPASSRLS, tenant runtime role and connection context.
4. Run positive/negative tenant tests in an isolated database. Determine exposure window and notify the incident commander for legal/customer notification decisions.
5. Restore service only after independent security review, credential rotation and evidence-backed regression tests.

## Diagnostic commands and queries

```text
SELECT rolname,rolbypassrls FROM pg_roles WHERE rolname IN ('lexa_app','lexa_app_runtime');
SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public';
Run scripts/test-tenant-idor.mjs against the isolated validation database.
```

## Verification

- No runtime bypass role; policies force tenant context; adversarial cross-tenant/branch requests are denied.

## Stop / rollback conditions

- Do not destroy logs, disable RLS, share tenant data while investigating, or run invasive queries on production without incident commander approval.

## Escalation

- Escalate immediately to security incident commander, legal/privacy owner and database owner.
