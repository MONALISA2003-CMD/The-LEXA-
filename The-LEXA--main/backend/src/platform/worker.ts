import 'dotenv/config';
import { randomUUID, createHash } from 'node:crypto';
import { Pool } from 'pg';
import { Queue, Worker, QueueEvents } from 'bullmq';
import { S3Client, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Socket } from 'node:net';

const redisUrl=process.env.REDIS_URL;if(!redisUrl)throw new Error('REDIS_URL is required for the platform worker.');
const requiredWorkerEnv=['R2_ACCOUNT_ID','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','CLAMAV_HOST'];const missingWorkerEnv=requiredWorkerEnv.filter((name)=>!process.env[name]);if(missingWorkerEnv.length)throw new Error(`Platform worker refuses to start; missing required server-side configuration: ${missingWorkerEnv.join(', ')}`);if(!process.env.WORKER_DATABASE_URL&&!process.env.DATABASE_URL)throw new Error('WORKER_DATABASE_URL or DATABASE_URL is required for the platform worker.');
const redis=new URL(redisUrl);const connection={host:redis.hostname,port:Number(redis.port||6379),username:decodeURIComponent(redis.username),password:decodeURIComponent(redis.password),...(redis.protocol==='rediss:'?{tls:{}}:{}),maxRetriesPerRequest:null as null};
const pool=new Pool({connectionString:process.env.WORKER_DATABASE_URL||process.env.DATABASE_URL,max:5});
const queue=new Queue('lexa-platform',{connection});
const workerId=`lexa-worker-${process.env.RENDER_INSTANCE_ID||randomUUID()}`;
const r2=()=>new S3Client({region:'auto',endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID!,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY!}});
class InfectedFileError extends Error {}
async function clamdScan(data:Buffer):Promise<void>{const host=process.env.CLAMAV_HOST;if(!host)throw new Error('CLAMAV_HOST is required; scan fails closed.');await new Promise<void>((resolve,reject)=>{const socket=new Socket();let response='';socket.setTimeout(120000);socket.connect(Number(process.env.CLAMAV_PORT||3310),host,()=>{socket.write('zINSTREAM\0');for(let i=0;i<data.length;i+=64*1024){const chunk=data.subarray(i,i+64*1024);const len=Buffer.alloc(4);len.writeUInt32BE(chunk.length);socket.write(Buffer.concat([len,chunk]));}socket.write(Buffer.alloc(4));});socket.on('data',b=>{response+=b.toString();if(response.includes('\0')||response.includes('\n')){socket.destroy();if(/: OK/.test(response))resolve();else if(/FOUND/.test(response))reject(new InfectedFileError(`ClamAV detected malware: ${response.slice(0,200)}`));else reject(new Error(`ClamAV scan failed: ${response.slice(0,200)}`));}});socket.on('timeout',()=>{socket.destroy();reject(new Error('ClamAV scan timed out.'));});socket.on('error',reject);});}
async function scanAttachment(id:string){
 const q=await pool.query('SELECT * FROM platform_attachments WHERE id=$1 AND status=$2',[id,'pending_scan']);const f=q.rows[0];if(!f)return;
 const bucket=process.env.R2_BUCKET;if(!bucket)throw new Error('R2_BUCKET is required for attachment scanning.');
 const obj=await r2().send(new GetObjectCommand({Bucket:bucket,Key:f.object_key}));const bytes=Buffer.from(await obj.Body!.transformToByteArray());
 if(bytes.length!==Number(f.size_bytes)||createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw new Error('File size or SHA-256 verification failed.');
 await clamdScan(bytes);
 // A clean object is moved to an immutable clean namespace; its quarantine key is never reused.
 const cleanKey=`clean/${randomUUID()}`;
 await r2().send(new CopyObjectCommand({Bucket:bucket,Key:cleanKey,CopySource:`${bucket}/${encodeURIComponent(f.object_key).replace(/%2F/g,'/')}`,MetadataDirective:'COPY',CopySourceIfMatch:f.object_etag}));
 const updated=await pool.query("UPDATE platform_attachments SET status='clean',object_key=$2,scan_engine='clamav',scan_metadata=scan_metadata||jsonb_build_object('clamav','clean'),scanned_at=now(),updated_at=now() WHERE id=$1 AND status='pending_scan' RETURNING id",[id,cleanKey]);
 if(!updated.rowCount){await r2().send(new DeleteObjectCommand({Bucket:bucket,Key:cleanKey}));return;}
 await r2().send(new DeleteObjectCommand({Bucket:bucket,Key:f.object_key}));
}
async function processOutbox(id:string){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const q=await client.query("SELECT * FROM module_domain_events WHERE id=$1 AND outbox_status IN ('pending','failed') FOR UPDATE SKIP LOCKED",[id]);
    const event=q.rows[0];
    if(!event){await client.query('COMMIT');return;}
    const type=String(event.event_type||'');
    // Increment 1 persists these business facts in the transactional event stream.
    // Increment 6 attaches notification delivery to this same stream; this handler
    // acknowledges the durable event without pretending an email/SMS was sent.
    const durableBusinessEvents=new Set([
      'sale.completed','sale.payment.received','sale.return.recorded','sale.payment.direct_receipt_recorded',
      'delivery.dispatch.created','delivery.lifecycle.changed','delivery.collection.reported','delivery.remittance.accepted',
    ]);
    if(type!=='attachment.scan.requested'&&!durableBusinessEvents.has(type)){
      const msg=`No registered idempotent handler for outbox event ${type}; retained for dead-letter/replay after handler deployment.`;
      await client.query("UPDATE module_domain_events SET outbox_status='failed',attempts=attempts+1,last_error=$2 WHERE id=$1",[id,msg]);
      await client.query('COMMIT');
      throw new Error(msg);
    }
    await client.query("UPDATE module_domain_events SET outbox_status='processed',processed_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1",[id]);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();}
}
async function processJob(id:string){const q=await pool.query("UPDATE platform_jobs SET status='running',attempts=attempts+1,updated_at=now() WHERE id=$1 AND status IN ('queued','failed') RETURNING *",[id]);const j=q.rows[0];if(!j)return;if(j.kind==='export'||j.kind==='backup'||j.kind==='import'){throw new Error(`${j.kind} job requires the corresponding typed job adapter; job retained for safe retry.`);}await pool.query("UPDATE platform_jobs SET status='ready',progress=100,finished_at=now(),updated_at=now() WHERE id=$1",[id]);}
const worker=new Worker('lexa-platform',async job=>{if(job.name==='scan-attachment')return scanAttachment(String(job.data.attachmentId));if(job.name==='outbox-event')return processOutbox(String(job.data.eventId));if(job.name==='platform-job')return processJob(String(job.data.jobId));}, {connection,concurrency:4});
worker.on('failed',async(job,err)=>{if(!job)return;const id=String(job.data?.jobId||job.data?.attachmentId||job.data?.eventId||'');if(job.name==='platform-job'&&id)await pool.query("UPDATE platform_jobs SET status=CASE WHEN attempts>=max_attempts THEN 'dead_letter' ELSE 'failed' END,error=$2,updated_at=now() WHERE id=$1",[id,err.message]).catch(()=>{});if(job.name==='scan-attachment'&&id)await pool.query("UPDATE platform_attachments SET status=$2,scan_engine=$3,scan_metadata=scan_metadata||jsonb_build_object('error',$4),updated_at=now() WHERE id=$1",[id,err instanceof InfectedFileError?'quarantined':'scan_failed',err instanceof InfectedFileError?'clamav-infected':'clamav-error',err.message.slice(0,300)]).catch(()=>{});});
async function tick(){await pool.query("INSERT INTO platform_worker_heartbeats(worker_id,status,queues,last_seen_at,details) VALUES($1,'healthy','[\"lexa-platform\"]',now(),'{}') ON CONFLICT(worker_id) DO UPDATE SET status='healthy',last_seen_at=now()",[workerId]);const expired=await pool.query("SELECT id,object_key FROM platform_attachments WHERE status='pending_upload' AND upload_expires_at<now() ORDER BY created_at LIMIT 100");for(const f of expired.rows){await r2().send(new DeleteObjectCommand({Bucket:process.env.R2_BUCKET,Key:f.object_key})).catch(()=>{});await pool.query("UPDATE platform_attachments SET status='deleted',retention_state='deleted',deleted_at=now(),updated_at=now() WHERE id=$1 AND status='pending_upload'",[f.id]);}const attachments=await pool.query("SELECT id FROM platform_attachments WHERE status='pending_scan' ORDER BY created_at LIMIT 25");for(const a of attachments.rows)await queue.add('scan-attachment',{attachmentId:a.id},{jobId:`scan-${a.id}`,attempts:5,backoff:{type:'exponential',delay:5000},removeOnComplete:1000});const events=await pool.query("SELECT id FROM module_domain_events WHERE outbox_status IN ('pending','failed') AND attempts<8 ORDER BY created_at LIMIT 100");for(const e of events.rows)await queue.add('outbox-event',{eventId:e.id},{jobId:`outbox-${e.id}-${Date.now()}`,attempts:5,backoff:{type:'exponential',delay:3000},removeOnComplete:1000});const jobs=await pool.query("SELECT id FROM platform_jobs WHERE status IN ('queued','failed') AND attempts<max_attempts ORDER BY created_at LIMIT 25");for(const j of jobs.rows)await queue.add('platform-job',{jobId:j.id},{jobId:`platform-${j.id}`,attempts:5,backoff:{type:'exponential',delay:5000},removeOnComplete:1000});}
void tick().then(()=>setInterval(()=>void tick().catch(e=>console.error('worker tick failed',e)),10000));
process.on('SIGTERM',async()=>{await worker.close();await queue.close();await pool.end();process.exit(0);});
console.log(`LEXA platform worker ${workerId} started`);
