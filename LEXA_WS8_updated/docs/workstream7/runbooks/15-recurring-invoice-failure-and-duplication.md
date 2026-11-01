# Recurring invoice failure and duplication prevention

**Prerequisites and permissions:** Finance administrator and platform operator.

## Safe procedure
1. Inspect schedule status, next run date/timezone, occurrence key, error summary, attempts and any linked invoice ID/number.
2. Check referenced customer, product and tax code still exist in the same tenant/branch. Confirm an approved tax rule is effective on the scheduled invoice date.
3. For permanent configuration/customer/tax errors, keep schedule in needs_attention, correct the source configuration and review schedule snapshot before retry.
4. Retry only the failed occurrence using the UI/action. Database uniqueness on schedule+occurrence key and invoice link must remain intact.
5. For auto-issue, reconcile the issued invoice and one balanced source journal. Draft schedules must create drafts only. Record all customer payments through normal manual receipt workflow.

## Diagnostic commands and queries

```text
SELECT id,status,next_run_date,next_run_at,issue_mode,occurrence_count,last_error_summary FROM recurring_invoice_schedules WHERE id='<SCHEDULE_UUID>';
SELECT id,occurrence_key,status,invoice_id,invoice_number,attempts,error_summary FROM recurring_invoice_occurrences WHERE schedule_id='<SCHEDULE_UUID>'::uuid ORDER BY scheduled_local_date;
SELECT id,status,source_type,source_id FROM ledger_journals WHERE source_type='recurring_invoice_issued' AND source_id='<INVOICE_UUID>';
```

## Verification

- One occurrence per schedule/date, one invoice link, at most one source journal, tax snapshot effective for invoice date.

## Stop / rollback conditions

- Do not insert invoices directly, mark invoice paid, collect payment, edit issued invoices or delete occurrence uniqueness constraints.

## Escalation

- Escalate tax/accounting differences to finance controller and job failures to platform owner.
