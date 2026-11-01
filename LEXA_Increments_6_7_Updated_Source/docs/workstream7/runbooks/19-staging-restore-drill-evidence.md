# Staging restore drill execution and evidence

**Prerequisites and permissions:** Recovery owner, separate second approver, database owner and application owner.

## Safe procedure
1. Choose a non-production backup and an isolated disposable Neon branch/database. Record source and target IDs, schema version, backup ID, encryption key version and commit SHA.
2. Run dry-run and hash checks. Confirm target database is empty, not production, and restore executor release gate is enabled only for this one named staging target.
3. Obtain independent second approver and recovery-owner release. Pause outbound work, email, recurring invoice generation and integrations for the restored tenant.
4. Execute restore, relink user identities through the approved recovery process, reset provider credentials, rescan all attachments, then reconcile journals, invoices, receipts, credits, stock, deliveries/remittances and audit chain.
5. Run API/worker smoke tests and tenant isolation tests. Save manifest hash, logs, SQL reconciliation summaries, approver references and screenshots/IDs in the release evidence bundle.
6. Destroy the disposable target only after evidence retention policy allows it; never promote restored test identities or secrets into production.

## Diagnostic commands and queries

```text
Compare manifest table counts/checksums to restored data; inspect ledger trial balance, stock movements and attachment scan status.
Run tenant IDOR tests and selected HTTP end-to-end workflows against the isolated target.
```

## Verification

- All restore authentication/hash checks pass; reconciliation differences are zero or formally explained; independent approval evidence retained.

## Stop / rollback conditions

- Never use the production branch, run this drill without second approval, or report a restore as tested from a dry-run alone.

## Escalation

- Escalate mismatches to recovery owner and finance/security owners; block release until resolved.
