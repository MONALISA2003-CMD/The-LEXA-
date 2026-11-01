import './observability';
import rawBody from 'fastify-raw-body';
import 'reflect-metadata';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const webhookBodyLimitBytes = 1024 * 1024;
  const apiBodyLimitBytes = 8 * 1024 * 1024;
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true, bodyLimit: apiBodyLimitBytes }),
  );

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
  const allowedOrigins = (process.env.FRONTEND_ORIGINS ?? 'http://localhost:5173,https://lexareview.vercel.app')
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
