import type { Pool } from 'pg';
import { withTenantTransactionPool } from '../platform/tenant-pool';

/** Evaluate tenant-configured operational rules; fingerprints keep repeated ticks in one incident. */
export async function evaluateOperationalAlerts(pool:Pool):Promise<void>{
  const rules=await pool.query(`SELECT r.*,t.id::text AS tenant_id FROM platform_alert_rules r JOIN tenants t ON t.id=r.tenant_id WHERE r.enabled=true ORDER BY r.tenant_id,r.rule_key LIMIT 500`);
  for(const rule of rules.rows){
    const tenantId=String(rule.tenant_id);const db=await withTenantTransactionPool(pool,tenantId).connect();
    try{
      const threshold=rule.threshold&&typeof rule.threshold==='object'?rule.threshold:{};const minCount=Number(threshold.minCount??1);const maxAgeSeconds=Number(threshold.maxAgeSeconds??900);
      let value=0;let summary='';let evidence:any={};
      switch(String(rule.rule_key)){
        case 'queue.dead_letter': {const q=await db.query("SELECT count(*)::int AS n,min(created_at) AS oldest FROM platform_jobs WHERE tenant_id=$1::uuid AND status='dead_letter'",[tenantId]);value=Number(q.rows[0].n);evidence={count:value,oldest:q.rows[0].oldest};summary=`${value} platform job(s) are in the dead-letter queue.`;break;}
        case 'redis.unavailable': {const q=await db.query("SELECT details FROM platform_worker_heartbeats ORDER BY last_seen_at DESC LIMIT 1");const healthy=q.rows[0]?.details?.redis==='ok';value=healthy?0:1;evidence={redis:healthy?'ok':'unavailable'};summary='The background worker is not reporting a healthy Redis connection.';break;}
        case 'queue.oldest': {const q=await db.query("SELECT count(*)::int AS n,min(created_at) AS oldest FROM platform_jobs WHERE tenant_id=$1::uuid AND status IN ('queued','retry_wait')",[tenantId]);const oldest=q.rows[0].oldest?new Date(q.rows[0].oldest).getTime():0;value=oldest&&Date.now()-oldest>maxAgeSeconds*1000?1:0;evidence={queued:Number(q.rows[0].n),oldest:q.rows[0].oldest,maxAgeSeconds};summary='The oldest queued platform job has exceeded its configured service window.';break;}
        case 'import_export.stalled': {const q=await db.query("SELECT count(*)::int AS n,min(created_at) AS oldest FROM platform_jobs WHERE tenant_id=$1::uuid AND kind IN ('import','export') AND status IN ('queued','running','retry_wait','failed') AND created_at<now()-($2::text||' seconds')::interval",[tenantId,maxAgeSeconds]);value=Number(q.rows[0].n);evidence={stalled:value,oldest:q.rows[0].oldest,maxAgeSeconds};summary=`${value} import or export job(s) exceeded the configured processing window.`;break;}
        case 'worker.stale': {const q=await db.query("SELECT count(*)::int AS n,max(last_seen_at) AS last_seen FROM platform_worker_heartbeats WHERE last_seen_at>now()-($1::text||' seconds')::interval",[maxAgeSeconds]);const active=Number(q.rows[0].n);value=active===0?1:0;evidence={activeHeartbeats:active,lastSeen:q.rows[0].last_seen};summary='No worker heartbeat has been received within the configured interval.';break;}
        case 'outbox.oldest': {const q=await db.query("SELECT count(*)::int AS n,min(created_at) AS oldest FROM module_domain_events WHERE tenant_id=$1::uuid AND outbox_status IN ('pending','failed') AND dead_letter_at IS NULL",[tenantId]);value=Number(q.rows[0].n);const oldest=q.rows[0].oldest?new Date(q.rows[0].oldest).getTime():0;const aged=oldest>0&&Date.now()-oldest>maxAgeSeconds*1000;evidence={count:value,oldest:q.rows[0].oldest,ageThresholdSeconds:maxAgeSeconds};value=aged?Math.max(value,1):0;summary='The oldest transactional outbox event exceeds its processing threshold.';break;}
        case 'attachment.scan_backlog': {const q=await db.query("SELECT count(*)::int AS n,min(created_at) AS oldest FROM platform_attachments WHERE tenant_id=$1::uuid AND status='pending_scan'",[tenantId]);value=Number(q.rows[0].n);evidence={count:value,oldest:q.rows[0].oldest};summary=`${value} attachment(s) are awaiting security scanning.`;break;}
        case 'clamav.unavailable': {const q=await db.query("SELECT details FROM platform_worker_heartbeats ORDER BY last_seen_at DESC LIMIT 1");const healthy=q.rows[0]?.details?.clamav==='ok';value=healthy?0:1;evidence={clamav:healthy?'ok':'unavailable'};summary='The worker ClamAV scanner is not reporting a healthy PING/PONG response.';break;}
        case 'notification.email_failure': {const q=await db.query("SELECT count(*)::int AS n FROM notification_email_deliveries WHERE tenant_id=$1::uuid AND status IN ('failed','bounced','complained')",[tenantId]);value=Number(q.rows[0].n);evidence={failedDeliveries:value};summary=`${value} notification email delivery issue(s) require review.`;break;}
        case 'recurring_invoice.failure': {const q=await db.query("SELECT count(*)::int AS n FROM recurring_invoice_occurrences WHERE tenant_id=$1::uuid AND status='failed'",[tenantId]);value=Number(q.rows[0].n);evidence={failedOccurrences:value};summary=`${value} recurring invoice occurrence(s) failed.`;break;}
        case 'backup.stale': {const hours=Number(threshold.maxAgeHours??24);const q=await db.query("SELECT max(created_at) AS last_success FROM platform_jobs WHERE tenant_id=$1::uuid AND kind='backup' AND status='ready'",[tenantId]);const last=q.rows[0].last_success;const stale=!last||Date.now()-new Date(last).getTime()>hours*3600000;value=stale?1:0;evidence={lastSuccessfulBackup:last,maxAgeHours:hours};summary='The most recent successful backup is older than the configured retention target.';break;}
        default: continue;
      }
      const active=value>=minCount;
      const fingerprint=`${tenantId}:${String(rule.rule_key)}`;
      if(active){
        const incident=await db.query(`INSERT INTO platform_alert_incidents(id,tenant_id,branch_id,rule_id,fingerprint,rule_key,severity,status,title,summary,evidence,occurrence_count,first_seen_at,last_seen_at,last_notification_at,created_at,updated_at)
          VALUES(gen_random_uuid(),$1::uuid,NULL,$2::uuid,$3,$4,$5,'open',$6,$7,$8::jsonb,1,now(),now(),now(),now(),now())
          ON CONFLICT(tenant_id,fingerprint) WHERE status IN ('open','acknowledged')
          DO UPDATE SET occurrence_count=platform_alert_incidents.occurrence_count+1,last_seen_at=now(),summary=EXCLUDED.summary,evidence=EXCLUDED.evidence,updated_at=now()
          RETURNING id::text,(xmax=0) AS created`,
          [tenantId,rule.id,fingerprint,rule.rule_key,rule.severity,rule.title,summary,JSON.stringify(evidence)]);
        if(incident.rows[0]?.created){
          const actor=await db.query("SELECT created_by_user_id FROM platform_alert_rules WHERE id=$1::uuid AND tenant_id=$2::uuid",[rule.id,tenantId]);
          await db.query(`INSERT INTO module_domain_events(id,tenant_id,branch_id,module_id,record_id,event_type,payload,dedupe_key,actor_user_id)
            VALUES(gen_random_uuid(),$1::uuid,NULL,'operations',$2,'worker.queue.incident',$3::jsonb,$4,$5::uuid)
            ON CONFLICT(tenant_id,dedupe_key) DO NOTHING`,[tenantId,incident.rows[0].id,JSON.stringify({ruleKey:rule.rule_key,severity:rule.severity,title:rule.title}),`operational-alert:${incident.rows[0].id}`,actor.rows[0]?.created_by_user_id||null]);
        }
      }else{
        await db.query("UPDATE platform_alert_incidents SET status='resolved',resolved_at=now(),updated_at=now() WHERE tenant_id=$1::uuid AND fingerprint=$2 AND status IN ('open','acknowledged')",[tenantId,fingerprint]);
      }
    }catch(error){console.error('Operational alert evaluation failed:',String((error as any)?.message||'unknown error').slice(0,200));}
    finally{db.release();}
  }
}
