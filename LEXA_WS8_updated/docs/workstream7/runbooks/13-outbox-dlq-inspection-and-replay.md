# Outbox dead-letter inspection and replay

**Prerequisites and permissions:** Workspace administrator/operator with event replay permission.

## Safe procedure
1. Find the source event, event type/version, tenant/branch, attempt history, payload hash, last safe error and dead-letter timestamp.
2. Confirm the event type exists in the versioned consumer registry and notification catalogue. Unknown types must remain dead-lettered.
3. Inspect whether notification rows or provider delivery rows already exist. Verify dedupe keys and any external side effect before replay.
4. After correcting the cause, replay through the audited application endpoint with a non-empty reason. Never edit source event payload to “make it work”.
5. Verify source event processed state, one recipient row per dedupe key, provider idempotency key and no duplicate business/ledger/stock effect.

## Diagnostic commands and queries

```text
SELECT id,event_type,outbox_status,attempts,dead_letter_at,last_error,next_attempt_at,correlation_id FROM module_domain_events WHERE id='<EVENT_UUID>';
SELECT consumer,payload_hash,created_at FROM platform_event_receipts WHERE event_id='<EVENT_UUID>';
SELECT event_id,attempt_no,outcome,error_code,error_message FROM platform_event_attempts WHERE event_id='<EVENT_UUID>' ORDER BY attempt_no;
```

## Verification

- Replay is audited; handler is registered; no duplicate financial, stock, notification or email effect occurs.

## Stop / rollback conditions

- Do not set outbox_status to processed manually, drop receipts, or replay unknown event types.

## Escalation

- Escalate permanent consumer bugs to engineering and suspicious payloads to security.
