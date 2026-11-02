# API deployment and rollback

**Prerequisites and permissions:** Release operator; approved change and previous healthy deployment available.

## Safe procedure
1. Confirm the release commit, dependency lockfile, migration diff, test evidence, health URL and rollback target. Confirm the API and worker schema compatibility matrix.
2. Build the backend image from the approved repository root and tag it with the immutable commit SHA. Do not use `latest` as the only rollback reference.
3. Deploy to the isolated staging service first. Confirm `/health/live` and `/health/ready`, API contract checks, authenticated workspace read, and one non-financial write/read smoke test.
4. Promote only after the release owner approves the change window. Watch error rate, latency, database connections and Sentry for at least the agreed observation window.
5. For rollback, deploy the exact previous image and restore its environment-variable version. Keep schema changes backward compatible; use a forward fix for irreversible migrations.

## Diagnostic commands and queries

```text
GET /health/live
GET /health/ready
SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 10;
```

## Verification

- Health/readiness return success; release SHA is visible; smoke test and tenant isolation checks pass.

## Stop / rollback conditions

- Stop promotion if readiness fails, schema is incompatible, financial invariants fail, or cross-tenant access is suspected. Do not delete data or reverse an applied migration casually.

## Escalation

- Escalate to release owner and database owner; link deployment ID, commit SHA, Sentry issue and rollback decision.
