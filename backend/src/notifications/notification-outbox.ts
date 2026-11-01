import { createHash, randomUUID } from 'node:crypto';
import { NOTIFICATION_CATALOGUE, notificationHref } from './event-catalogue';

function sha256(value: string): string { return createHash('sha256').update(value.trim().toLowerCase()).digest('hex'); }

/** Runs inside the tenant-scoped worker connection. Only static catalogue text and opaque record IDs are persisted. */
export async function publishNotificationForEvent(db: any, event: any): Promise<void> {
  const type = String(event.event_type);
  let branchId = event.branch_id ? String(event.branch_id) : '';
  if (!branchId) {
    const branch = await db.query(`SELECT id::text FROM branches WHERE tenant_id=$1::uuid ORDER BY created_at,id LIMIT 1`, [event.tenant_id]);
    branchId = String(branch.rows[0]?.id ?? '');
  }
  if (!branchId) return;
  const definition = NOTIFICATION_CATALOGUE[type];
  if (!definition) throw Object.assign(new Error(`No notification definition for event type ${type}.`), { permanent: true });
  const recipients = await db.query(
    `SELECT m.user_id::text AS user_id, u.email, m.role
       FROM memberships m JOIN users u ON u.id=m.user_id
      WHERE m.tenant_id=$1::uuid AND m.status='ACTIVE'
        AND (m.user_id=$2::uuid OR (m.role=ANY($3::text[]) AND
             (m.branch_scope_mode <> 'restricted' OR EXISTS (
               SELECT 1 FROM branch_memberships bm WHERE bm.tenant_id=m.tenant_id
                 AND bm.user_id=m.user_id AND bm.branch_id=$4::uuid)))
        OR (m.user_id=ANY($5::uuid[]) AND
             (m.branch_scope_mode <> 'restricted' OR EXISTS (
               SELECT 1 FROM branch_memberships bm WHERE bm.tenant_id=m.tenant_id
                 AND bm.user_id=m.user_id AND bm.branch_id=$4::uuid))))
      ORDER BY m.user_id`,
    [event.tenant_id, event.actor_user_id || null, [...definition.audienceRoles], branchId, Array.isArray(event.payload?.notificationUserIds) ? event.payload.notificationUserIds.filter((id: unknown)=>typeof id==='string' && /^[0-9a-f-]{36}$/i.test(id)) : []],
  );
  const href = notificationHref(type, event.record_id);
  const safePayload = JSON.stringify({ eventType: type, eventVersion: 1, sourceEventId: String(event.id) });
  for (const recipient of recipients.rows) {
    const preferences = await db.query(
      `SELECT channel, enabled FROM notification_preferences
        WHERE tenant_id=$1::uuid AND user_id=$2::uuid AND event_type=$3`,
      [event.tenant_id, recipient.user_id, type],
    );
    const enabled = new Map<string, boolean>(preferences.rows.map((item: any) => [String(item.channel), item.enabled === true]));
    const inAppEnabled = enabled.has('in_app') ? enabled.get('in_app') === true : true;
    const emailEnabled = enabled.has('email') ? enabled.get('email') === true : true;
    // Persist one channel-independent source record per recipient. In-app preferences
    // control visibility only; turning in-app off must not block transactional email.
    const inserted = await db.query(
      `INSERT INTO business_notifications
        (id,tenant_id,branch_id,recipient_user_id,source_event_id,event_type,event_version,title,body,
         entity_module,entity_record_id,href,safe_payload,dedupe_key,visible_in_app,expires_at)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,1,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,now()+interval '180 days')
       ON CONFLICT (tenant_id,recipient_user_id,dedupe_key) DO NOTHING RETURNING id::text`,
      [randomUUID(), event.tenant_id, branchId, recipient.user_id, event.id, type,
       definition.title, definition.body, definition.entityModule || null, event.record_id || null,
       href || null, safePayload, `${event.id}:${recipient.user_id}:notification`, inAppEnabled],
    );
    let notificationId = inserted.rows[0]?.id;
    if (!notificationId) {
      const existing = await db.query(
        `SELECT id::text FROM business_notifications WHERE tenant_id=$1::uuid AND recipient_user_id=$2::uuid AND dedupe_key=$3 LIMIT 1`,
        [event.tenant_id, recipient.user_id, `${event.id}:${recipient.user_id}:notification`],
      );
      notificationId = existing.rows[0]?.id;
    }
    if (emailEnabled && notificationId && typeof recipient.email === 'string' && recipient.email.includes('@')) {
      const emailHash = sha256(recipient.email);
      const suppression = await db.query(
        `SELECT 1 FROM notification_email_suppressions WHERE tenant_id=$1::uuid AND user_id=$2::uuid AND recipient_hash=$3 LIMIT 1`,
        [event.tenant_id, recipient.user_id, emailHash],
      );
      if (!suppression.rowCount) {
        await db.query(
          `INSERT INTO notification_email_deliveries
            (id,tenant_id,branch_id,recipient_user_id,notification_id,source_event_id,template_key,template_version,
             recipient_email,status,attempts,max_attempts,idempotency_key,next_attempt_at)
           VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,'business_event',1,$7,'pending',0,5,$8,now())
           ON CONFLICT (tenant_id,notification_id) DO NOTHING`,
          [randomUUID(), event.tenant_id, branchId, recipient.user_id, notificationId, event.id,
           recipient.email, `lexa-notification-${event.id}-${recipient.user_id}`],
        );
      }
    }
  }
}
