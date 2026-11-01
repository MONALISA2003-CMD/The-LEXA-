import * as Sentry from '@sentry/node';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const release = process.env.APP_VERSION || process.env.RENDER_GIT_COMMIT || 'local';
const environment = process.env.NODE_ENV || 'development';
const sensitiveKey = /(password|secret|token|cookie|authorization|api.?key|access.?key|private.?key|email|phone|address|payload|attachment|payment.?reference|customer.?name)/i;
function scrubText(value:string):string{return value.replace(/Bearer\s+[^\s]+/gi,'Bearer [REDACTED]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[EMAIL]').replace(/\+?\d[\d\s().-]{7,}\d/g,'[PHONE]').replace(/(api[_-]?key|secret|token)=([^&\s]+)/gi,'$1=[REDACTED]');}
function scrub(value: unknown, depth=0): unknown {
  if (depth>7) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0,50).map(item=>scrub(item,depth+1));
  if (value && typeof value==='object') {
    const result:Record<string,unknown>={};
    for(const [key,item] of Object.entries(value as Record<string,unknown>)) result[key]=sensitiveKey.test(key)?'[redacted]':scrub(item,depth+1);
    return result;
  }
  if(typeof value==='string') {const text=scrubText(value);return text.length>1000?`${text.slice(0,1000)}…`:text;}
  return value;
}

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment,
    release,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        event.request.headers = scrub(event.request.headers) as Record<string,string>;
        event.request.url = event.request.url?.split('?')[0];
      }
      if (event.user) delete event.user;
      if (event.message) event.message = scrubText(event.message);
      if (event.exception?.values) event.exception.values = event.exception.values.map(value => ({ ...value, value:value.value ? scrubText(value.value) : value.value }));
      if (event.extra) event.extra = scrub(event.extra) as Record<string,unknown>;
      if (event.contexts) event.contexts = scrub(event.contexts) as typeof event.contexts;
      if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map((crumb) => ({ ...crumb, data: crumb.data ? scrub(crumb.data) as Record<string,unknown> : undefined }));
      return event;
    },
  });
}

const endpoint=(process.env.OTEL_EXPORTER_OTLP_ENDPOINT||'').replace(/\/+$/,'');
let otel:NodeSDK|undefined;
if(endpoint){
  otel=new NodeSDK({
    resource:resourceFromAttributes({'service.name':process.env.OTEL_SERVICE_NAME||'lexa-api','service.version':release,'deployment.environment':environment}),
    traceExporter:new OTLPTraceExporter({url:process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT||`${endpoint}/v1/traces`}),
    metricReader:new PeriodicExportingMetricReader({exporter:new OTLPMetricExporter({url:process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT||`${endpoint}/v1/metrics`}),exportIntervalMillis:30000}),
    instrumentations:[getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs':{enabled:false},
      '@opentelemetry/instrumentation-dns':{enabled:false},
      '@opentelemetry/instrumentation-http':{enabled:true},
      '@opentelemetry/instrumentation-pg':{enabled:true},
    })],
  });
  try { otel.start(); } catch (error) { console.error('OpenTelemetry startup failed:',error instanceof Error?error.message:'unknown error'); }
}

export async function shutdownObservability():Promise<void>{
  await otel?.shutdown().catch(()=>undefined);
  await Sentry.close(2000).catch(()=>undefined);
}
