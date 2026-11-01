# Resend bounce, complaint and webhook failure

**Prerequisites and permissions:** Email service owner and security operator.

## Safe procedure
1. Confirm sender-domain verification, sender address and API key are configured in server-side secrets. In-app notification delivery must remain independent.
2. Check delivery status and safe error code. For transient 429/5xx/network failures, allow bounded retry; permanent failures are not retried automatically.
3. For bounce/complaint, confirm provider webhook was signed, timestamp-valid and deduplicated. The recipient suppression record must be present before any later email attempt.
4. For webhook failure, check endpoint raw-body capture, `RESEND_WEBHOOK_SECRET`, server clock and provider event delivery log. Re-deliver through Resend only after signature handling is corrected.
5. Operator retry is allowed only for failed/retry_wait status after configuration correction. Bounced/complained/suppressed recipients cannot be manually forced back into sends.

## Diagnostic commands and queries

```text
SELECT id,status,attempts,max_attempts,provider_message_id,last_error_code,last_error_summary FROM notification_email_deliveries WHERE id='<DELIVERY_UUID>';
SELECT reason,created_at FROM notification_email_suppressions WHERE tenant_id='<TENANT_UUID>'::uuid AND user_id='<USER_UUID>'::uuid;
```

## Verification

- Signed webhook accepted once; invalid/stale/replayed signatures rejected; bounce/complaint suppression applied.

## Stop / rollback conditions

- Never log full email bodies, trust unsigned provider addresses/IDs, disable suppression or paste Resend secrets into ticket/chat.

## Escalation

- Escalate domain reputation issues to email owner and signature/forgery issues to security owner.
