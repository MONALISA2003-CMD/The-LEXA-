import { metrics, trace, SpanStatusCode } from '@opentelemetry/api';

const meter = metrics.getMeter('lexa.worker', '1.0.0');
const jobCounter = meter.createCounter('lexa.worker.jobs', { description: 'Completed or failed background jobs' });
const jobDuration = meter.createHistogram('lexa.worker.job.duration', { unit: 'ms', description: 'Background job duration' });
const boundedJobTypes = new Set(['scan-attachment','outbox-event','platform-job','notification-email','recurring-invoice']);
type OperationalSnapshot = { queueWaiting:number; queueActive:number; queueDelayed:number; queueFailed:number; oldestQueuedAgeSeconds:number; pendingAttachmentScans:number; pendingEmailDeliveries:number; recurringInvoiceFailures:number; workerHeartbeatAgeSeconds:number; redisHealthy:boolean; clamavHealthy:boolean };
let operationalSnapshot:OperationalSnapshot={queueWaiting:0,queueActive:0,queueDelayed:0,queueFailed:0,oldestQueuedAgeSeconds:0,pendingAttachmentScans:0,pendingEmailDeliveries:0,recurringInvoiceFailures:0,workerHeartbeatAgeSeconds:0,redisHealthy:false,clamavHealthy:false};
const operationalGauges:[keyof OperationalSnapshot,string,string][]=[
 ['queueWaiting','lexa.queue.waiting','Waiting BullMQ jobs'],['queueActive','lexa.queue.active','Active BullMQ jobs'],['queueDelayed','lexa.queue.delayed','Delayed BullMQ jobs'],['queueFailed','lexa.queue.failed','Failed BullMQ jobs'],['oldestQueuedAgeSeconds','lexa.queue.oldest_age_seconds','Age of the oldest queued platform job'],['pendingAttachmentScans','lexa.attachments.pending_scan','Attachments awaiting virus scanning'],['pendingEmailDeliveries','lexa.notifications.email_pending','Pending notification email deliveries'],['recurringInvoiceFailures','lexa.recurring_invoice.failures','Failed recurring invoice occurrences'],['workerHeartbeatAgeSeconds','lexa.worker.heartbeat_age_seconds','Age of the newest worker heartbeat']
];
for(const [key,name,description] of operationalGauges){const gauge=meter.createObservableGauge(name,{description});gauge.addCallback(observation=>observation.observe(Number(operationalSnapshot[key])));}
for(const [key,name,description] of [['redisHealthy','lexa.redis.healthy','Redis connectivity'],['clamavHealthy','lexa.clamav.healthy','ClamAV connectivity']] as const){const gauge=meter.createObservableGauge(name,{description});gauge.addCallback(observation=>observation.observe(operationalSnapshot[key]?1:0));}
export function updateOperationalSnapshot(snapshot:Partial<OperationalSnapshot>):void{operationalSnapshot={...operationalSnapshot,...snapshot};}

export function withWorkerSpan<T>(jobType: string, correlationId: string | undefined, work: () => Promise<T>): Promise<T> {
  const safeType = boundedJobTypes.has(jobType) ? jobType : 'other';
  const tracer = trace.getTracer('lexa.worker', '1.0.0');
  return tracer.startActiveSpan(`lexa.worker.${safeType}`, { attributes: { 'lexa.job.type': safeType, ...(correlationId ? { 'lexa.correlation_id': correlationId } : {}) } }, async (span) => {
    const started = Date.now();
    try {
      const result = await work();
      jobCounter.add(1, { job_type: safeType, outcome: 'success' });
      jobDuration.record(Date.now() - started, { job_type: safeType, outcome: 'success' });
      return result;
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error('Background job failed'));
      span.setStatus({ code: SpanStatusCode.ERROR });
      jobCounter.add(1, { job_type: safeType, outcome: 'failure' });
      jobDuration.record(Date.now() - started, { job_type: safeType, outcome: 'failure' });
      throw error;
    } finally { span.end(); }
  });
}
