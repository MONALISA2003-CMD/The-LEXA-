# LEXA Render / Neon P1002 advisory-lock recovery

## Verified production root cause

A live Neon read-only inspection found an **idle PgBouncer session holding Prisma's advisory lock 72707369**. Render reached Neon but Prisma timed out after ten seconds trying to acquire the lock. The previous Render release remained live; the newest release failed during database migration. The direct connection was already configured, so simply changing DATABASE_URL_UNPOOLED could not release the orphaned lock.

## Durable safe fix

The Render Docker command runs node scripts/migrate-with-guard.mjs before starting the API.

This script connects to the direct Neon DATABASE_URL_UNPOOLED, refuses a -pooler endpoint, and acquires a **distinct exclusive advisory lock (72707370)** for the full duration of migration recovery and Prisma migrate deploy. It waits at most 120 seconds for this independent guard. Only migration subprocesses receive PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1; the application and service environment never receive that override. Thus the stranded legacy lock does not prevent startup while two new deployments still cannot run migrations simultaneously. Failed migrations still stop deployment; the database is never reset.

## Render configuration

- backend/Dockerfile is authoritative. Keep the Render Docker Command override empty.
- DATABASE_URL_UNPOOLED must use the **direct** Neon hostname, no -pooler.
- DATABASE_URL remains the pooled URI used for normal application traffic.
- No environment-level PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK needed or recommended.
- After GitHub import, redeploy Render and confirm logs contain 'Exclusive direct-database migration guard acquired', 'Prisma migrations verified', and API startup.
- The SSL mode warning is informational and distinct from P1002. Review sslmode=verify-full separately without weakening TLS validation.

## Read-only lock diagnosis

SELECT a.pid,a.application_name,a.state,now()-a.state_change AS idle_age,l.objid,l.granted
FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
WHERE l.locktype='advisory' AND l.objid IN (72707369,72707370);

## Safety

Never run prisma migrate reset or db push on production. Never delete migration-history records or terminate a PostgreSQL session without reviewing its owner and other workloads. This hotfix changes startup orchestration, not existing business records, CEO memberships, tables or roles.

The production deployment is not confirmed fixed until the updated GitHub release has been deployed successfully and an authenticated CEO can use the application.
