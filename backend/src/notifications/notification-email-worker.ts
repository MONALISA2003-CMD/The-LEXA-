import { createHash } from 'node:crypto';
import type { Pool } from 'pg';

function escaped(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
function cleanErrorCode(status?: number): string { return status ? `RESEND_HTTP_${status}` : 'RESEND_NETWORK_ERROR'; }

/** Claims and delivers one durable notification email. All retries are bounded in PostgreSQL. */
export async function processNotificationEmail(pool: Pool, tenantId: string, deliveryId: string): Promise<void> {
  const client = await pool.connect();
  let row: any;
  let attempt = 0;
  let released = false;
  const releaseClient = async () => { if (released) return; released = true; client.release(); };
  try {
    // The supplied tenant-scoped pool applies role and tenant settings after BEGIN.
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT d.*,n.title,n.body,n.href,n.event_type,n.safe_payload
         FROM notification_email_deliveries d
         JOIN business_notifications n ON n.id=d.notification_id AND n.tenant_id=d.tenant_id
        WHERE d.id=$1::uuid AND d.tenant_id=$2::uuid FOR UPDATE OF d`,
      [deliveryId, tenantId],
    );
    row = result.rows[0];
    if (!row || !['pending', 'retry_wait'].includes(String(row.status)) || new Date(row.next_attempt_at).getTime() > Date.now()) {
      await client.query('COMMIT'); await releaseClient(); return;
    }
    const suppression = await client.query(
      `SELECT 1 FROM notification_email_suppressions WHERE tenant_id=$1::uuid AND user_id=$2::uuid AND recipient_hash=$3 LIMIT 1`,
      [tenantId, row.recipient_user_id, createHash('sha256').update(String(row.recipient_email).trim().toLowerCase()).digest('hex')],
    );
    if (suppression.rowCount) {
      await client.query("UPDATE notification_email_deliveries SET status='suppressed',updated_at=now() WHERE id=$1::uuid AND tenant_id=$2::uuid", [deliveryId, tenantId]);
      await client.query('COMMIT'); await releaseClient(); return;
    }
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      await client.query("UPDATE notification_email_deliveries SET status='failed',last_error_code='EMAIL_NOT_CONFIGURED',last_error_summary='Resend credentials or sender are not configured.',updated_at=now() WHERE id=$1::uuid AND tenant_id=$2::uuid", [deliveryId, tenantId]);
      await client.query('COMMIT'); await releaseClient(); return;
    }
    attempt = Number(row.attempts) + 1;
    await client.query("UPDATE notification_email_deliveries SET status='sending',attempts=$3,attempted_at=now(),updated_at=now() WHERE id=$1::uuid AND tenant_id=$2::uuid", [deliveryId, tenantId, attempt]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    await releaseClient();
    throw error;
  }
  try {
    const base = (process.env.FRONTEND_PUBLIC_URL || '').replace(/\/+$/, '');
    const href = base && typeof row.href === 'string' && row.href.startsWith('/') && !row.href.startsWith('//') ? `${base}${row.href}` : undefined;
    const title = String(row.title).slice(0, 180);
    const body = String(row.body).slice(0, 1200);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json', 'Idempotency-Key': String(row.idempotency_key) },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to: [String(row.recipient_email)],
        subject: `LEXA: ${title}`,
        text: `${body}${href ? `\n\nOpen in LEXA: ${href}` : ''}`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#152033"><h2>${escaped(title)}</h2><p>${escaped(body)}</p>${href ? `<p><a href="${escaped(href)}">Open in LEXA</a></p>` : ''}</div>`,
      }),
      signal: AbortSignal.timeout(12000),
    });
    const payload = await response.json().catch(() => ({})) as any;
    if (!response.ok) {
      const transient = response.status === 429 || response.status >= 500;
      const permanent = !transient;
      const maxAttempts = Number(row.max_attempts);
      const dead = permanent || attempt >= maxAttempts;
      const delayMs = Math.min(3600000, 5000 * 2 ** Math.max(0, attempt - 1));
      await client.query("UPDATE notification_email_deliveries SET status=$3,last_error_code=$4,last_error_summary=$5,next_attempt_at=now()+($6::text||' milliseconds')::interval,updated_at=now() WHERE id=$1::uuid AND tenant_id=$2::uuid", [deliveryId, tenantId, dead ? 'failed' : 'retry_wait', cleanErrorCode(response.status), `Resend delivery request failed (HTTP ${response.status}).`, delayMs]);
      return;
    }
    const messageId = typeof payload.id === 'string' ? payload.id : null;
    if (!messageId) throw new Error('Resend returned a success response without a provider message ID.');
    await client.query("UPDATE notification_email_deliveries SET status='sent',provider_message_id=$3,sent_at=now(),last_error_code=NULL,last_error_summary=NULL,updated_at=now() WHERE id=$1::uuid AND tenant_id=$2::uuid", [deliveryId, tenantId, messageId]);
    if (messageId) {
      await client.query(
        `INSERT INTO notification_email_webhook_routes(provider_message_id,tenant_id,delivery_id,created_at)
         VALUES($1,$2::uuid,$3::uuid,now()) ON CONFLICT(provider_message_id) DO NOTHING`,
        [messageId, tenantId, deliveryId],
      );
    }
  } catch (error) {
    const permanent = !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL;
    const dead = permanent || attempt >= Number(row?.max_attempts ?? 5);
    const delayMs = Math.min(3600000, 5000 * 2 ** Math.max(0, attempt - 1));
    await client.query(
      `UPDATE notification_email_deliveries SET status=$3,last_error_code=$4,last_error_summary=$5,
        next_attempt_at=now()+($6::text||' milliseconds')::interval,updated_at=now()
       WHERE id=$1::uuid AND tenant_id=$2::uuid`,
      [deliveryId, tenantId, dead ? 'failed' : 'retry_wait', 'RESEND_NETWORK_ERROR', 'The email provider could not be reached.', delayMs],
    );
  } finally {
    await releaseClient();
  }
}
