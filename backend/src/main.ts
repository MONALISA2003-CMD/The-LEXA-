import { validateDemoEnvironment } from './demo/demo-policy';
import './observability';
import rawBody from 'fastify-raw-body';
import 'reflect-metadata';
import { PrismaService } from './prisma/prisma.service';
import { observedClientIp, safeClientLabel, authenticatedSessionHash } from './platform-administration/platform-activity-policy';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  validateDemoEnvironment();
  const webhookBodyLimitBytes = 1024 * 1024;
  const apiBodyLimitBytes = 8 * 1024 * 1024;
  // Never trust arbitrary forwarded IP headers. Operators may explicitly provide
  // verified proxy CIDR ranges; otherwise request.ip is the direct peer (often a proxy).
  const trustedProxyCidrs = (process.env.LEXA_TRUSTED_PROXY_CIDRS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (trustedProxyCidrs.some(cidr => /^(?:0\.0\.0\.0\/0|::\/0|\*|true|all)$/i.test(cidr))) {
    throw new Error('LEXA_TRUSTED_PROXY_CIDRS must contain only verified, restricted proxy network ranges.');
  }
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true, bodyLimit: apiBodyLimitBytes,
      trustProxy: trustedProxyCidrs.length ? trustedProxyCidrs : false }),
  );
  // Operations diagnostics: disclose configuration presence only, never secrets.
  const loginVerificationRequired = process.env.TURNSTILE_ENFORCE_LOGIN === 'true'
    || (process.env.NODE_ENV === 'production' && process.env.TURNSTILE_ENFORCE_LOGIN !== 'false');
  if (loginVerificationRequired && !process.env.TURNSTILE_SECRET_KEY) {
    app.getHttpAdapter().getInstance().log.error('LEXA_AUTH_CONFIG: Turnstile login verification is enabled without a Siteverify secret.');
  }
  const browserVerificationRequired = process.env.LEXA_ENFORCE_NEW_BROWSER_VERIFICATION === 'true'
    || (process.env.NODE_ENV === 'production' && process.env.LEXA_ENFORCE_NEW_BROWSER_VERIFICATION !== 'false');
  if (browserVerificationRequired && (!process.env.AUTH_OTP_PEPPER || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)) {
    app.getHttpAdapter().getInstance().log.warn('LEXA_AUTH_CONFIG: Browser verification requires AUTH_OTP_PEPPER and the two Resend email settings.');
  }
  const activityDb = app.get(PrismaService);
  // Only completed, successful, authenticated workspace requests count as activity.
  // Upsert at most once per 15 seconds per user/business, or when their IP changes.
  // A login alone must never activate a subscription or bypass its authorization guard.
  app.getHttpAdapter().getInstance().addHook('onResponse', async (request, reply) => {
    try {
      if (reply.statusCode >= 400) return;
      const path = request.url.split('?')[0] ?? '';
      if (!/^\/api\/v1\/workspaces\/[0-9a-f-]{36}(?:\/|$)/i.test(path)) return;
      const tenantId = path.split('/')[4];
      if (!tenantId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(tenantId)) return;
      const tokenHash = authenticatedSessionHash(request.headers.cookie);
      if (!tokenHash) return;
      const session = await activityDb.runWithTenantContext({ sessionTokenHash: tokenHash }, () =>
        activityDb.session.findFirst({ where: { tokenHash, expiresAt: { gt: new Date() } }, select: { userId: true } }));
      if (!session) return;
      const ip = observedClientIp(request.ip);
      const label = safeClientLabel(request.headers['user-agent']);
      const isAccountAccess = new RegExp(`^/api/v1/workspaces/${tenantId}(?:/platform-billing(?:/.*)?|/access|/branches)?$`).test(path);
      const activityKind = isAccountAccess ? 'account_access' : 'business_operation';
      await activityDb.runWithTenantContext({ tenantId, userId: session.userId }, () => activityDb.$executeRaw`
        INSERT INTO platform_account_activity(tenant_id,user_id,last_seen_at,observed_ip,client_label,last_activity_kind)
        VALUES(${tenantId}::uuid,${session.userId}::uuid,now(),${ip}::inet,${label},${activityKind})
        ON CONFLICT(tenant_id,user_id) DO UPDATE SET
          previous_ip=CASE WHEN platform_account_activity.observed_ip IS DISTINCT FROM EXCLUDED.observed_ip
            THEN platform_account_activity.observed_ip ELSE platform_account_activity.previous_ip END,
          ip_changed_at=CASE WHEN platform_account_activity.observed_ip IS DISTINCT FROM EXCLUDED.observed_ip
            THEN now() ELSE platform_account_activity.ip_changed_at END,
          observed_ip=EXCLUDED.observed_ip,client_label=EXCLUDED.client_label,
          last_activity_kind=EXCLUDED.last_activity_kind,last_seen_at=now(),request_count=platform_account_activity.request_count+1
        WHERE platform_account_activity.last_seen_at<now()-interval '15 seconds'
           OR platform_account_activity.observed_ip IS DISTINCT FROM EXCLUDED.observed_ip`);
    } catch (error) {
      // Diagnostics must never change the outcome of a successful business request.
      app.getHttpAdapter().getInstance().log.warn({ error }, 'Activity observation unavailable');
    }
  });

  // Capture a UTF-8 copy only for the Resend webhook. Do not use encoding:false:
  // fastify-raw-body then registers another application/json parser, colliding
  // with the parser Nest's Fastify adapter installs during app.init(). The
  // controller converts this route-scoped string back to a Buffer for Svix.
  // Fastify's bodyLimit bounds both the raw-body reader and JSON parser.
  await app.register(rawBody, {
    field: 'rawBody',
    global: false,
    routes: ['/api/v1/webhooks/resend'],
    encoding: 'utf8',
    runFirst: true,
  });
  // Fastify's raw-body reader and JSON parser both honour request.routeOptions.bodyLimit.
  // Keep ordinary JSON routes and the webhook at 1 MiB; only the internally
  // authenticated document extractor accepts a 5 MiB file plus base64 JSON overhead.
  app.getHttpAdapter().getInstance().addHook('onRoute', (routeOptions) => {
    const routePath = routeOptions.path;
    routeOptions.bodyLimit = routePath === '/api/v1/workspaces/:workspaceId/branches/:branchId/intelligence/extract'
      ? apiBodyLimitBytes
      : webhookBodyLimitBytes;
  });
  await app.register(helmet);
  const allowedOrigins = (process.env.FRONTEND_ORIGINS ?? 'http://localhost:5173,https://lexaaamaal.com,https://www.lexaaamaal.com,https://app.lexaaamaal.com,https://lexareview.vercel.app')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'Idempotency-Key', 'If-Match', 'X-Request-ID'],
    exposedHeaders: ['ETag', 'X-Request-ID'],
  });

  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  app.enableShutdownHooks();

  const port = Number.parseInt(process.env.PORT ?? '10000', 10);
  await app.listen({ port, host: '0.0.0.0' });
}

void bootstrap();
