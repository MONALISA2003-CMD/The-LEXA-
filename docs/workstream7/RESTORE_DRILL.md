# Workstream 7 staging restore drill (required before enabling restore)

**Status: NOT RUN.** No disposable Neon branch credentials or complete restore processor were available in this session. This is a procedure, not evidence of a successful drill.

1. Create an isolated Neon branch from a recent production snapshot. Never point the drill at production.
2. Deploy the same migration version as the API and worker. Verify schema integrity and migration status.
3. Create a test workspace with at least two branches, users/memberships, branch grants, representative records in every authoritative module, audit events, and several clean/quarantined file objects in the private R2 bucket.
4. Generate a backup job with a stable idempotency key. Capture a manifest containing schema version, table row counts, tenant/branch references, object keys, byte sizes, MIME types, SHA-256 hashes, and encrypted backup object references.
5. Validate every table is included; compare inventory against PostgreSQL catalog tables and an explicit allow/deny list. Confirm sessions, access grants and audit append-only history are handled according to policy.
6. Restore into a second empty staging workspace/branch namespace. Do not overwrite an existing tenant. Re-map tenant/branch/user IDs explicitly and verify all foreign keys.
7. Restore files only after verifying each manifest checksum; scan restored files before marking clean.
8. Compare per-table counts, financial control totals, inventory quantities, payroll totals, audit sequence continuity, file counts and hashes.
9. Run tenant isolation tests, API smoke tests, provider webhook dedupe tests and worker replay tests.
10. Record operator, timestamps, source snapshot, backup ID, restore ID, discrepancies, elapsed time and evidence. A second operator signs off.
11. Only after all checks pass may `PLATFORM_RESTORE_ENABLED` be considered for controlled rollout.

Acceptance: zero unexplained row/control-total differences, zero cross-tenant references, every restored file hash matches, quarantined files remain unavailable, replay is idempotent, and rollback is documented.
