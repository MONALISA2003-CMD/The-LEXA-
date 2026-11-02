# Database migration failure, rollback or forward fix

**Prerequisites and permissions:** Database owner and release owner; disposable/staging branch preferred.

## Safe procedure
1. Capture the migration ID, expected SHA-256 checksum, actual `_prisma_migrations` row, SQL error and target branch before changing anything.
2. Run migration status and schema validation on an isolated clone. Inspect the SQL and all destructive operations. Check whether a migration partially committed.
3. Never edit an applied migration file or force a checksum update. Do not blindly run `migrate resolve --applied` or `--rolled-back`.
4. For a safe uncommitted failure, follow Prisma recovery procedure on disposable validation first. Prefer a new forward-only migration for corrections to already-applied work.
5. Validate fresh install and upgrade from production-like legacy rows, then run schema integrity, route/adapter coverage, tests and API/worker compatibility checks.

## Diagnostic commands and queries

```text
npx prisma migrate status
SELECT migration_name,checksum,started_at,finished_at,rolled_back_at,logs FROM _prisma_migrations ORDER BY started_at DESC LIMIT 20;
npx prisma validate
npm run db:verify
```

## Verification

- Migration checksums match source; fresh and upgrade paths both pass; referential integrity and ledger coverage pass.

## Stop / rollback conditions

- Do not run migrations on production during this runbook, edit an applied migration, or execute destructive SQL without explicit release approval and verified backup.

## Escalation

- Escalate to database owner; include migration checksum and branch ID.
