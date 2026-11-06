/** Fail-closed worker configuration and heartbeat state, independent of service wiring. */
export type WorkerSettings = Readonly<Record<string, string | undefined>>;

function validUrl(value: string | undefined, protocols: string[]): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/** Return only variable names and configuration descriptions, never secret values. */
export function workerConfigProblems(env: WorkerSettings): string[] {
  const problems: string[] = [];
  if (env.LEXA_WORKER_ENABLED !== 'true') problems.push('LEXA_WORKER_ENABLED must explicitly equal true');
  const required = [
    'REDIS_URL', 'R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY', 'CLAMAV_HOST', 'DATABASE_RUNTIME_ROLE',
    'BACKUP_ENCRYPTION_KEY', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL',
  ] as const;
  for (const key of required) if (!env[key]?.trim()) problems.push(`${key} is required`);
  if (!env.WORKER_DATABASE_URL && !env.DATABASE_URL) problems.push('WORKER_DATABASE_URL or DATABASE_URL is required');
  if (env.REDIS_URL && !validUrl(env.REDIS_URL, ['redis:', 'rediss:'])) problems.push('REDIS_URL must be a redis:// or rediss:// URL');
  for (const key of ['WORKER_DATABASE_URL','WORKER_TENANT_DATABASE_URL','DATABASE_URL'] as const) {
    const value = env[key];
    if (value && !validUrl(value, ['postgres:', 'postgresql:'])) problems.push(`${key} must be a PostgreSQL URL`);
    if (value) {
      try {
        const options = new URL(value).searchParams.get('options') || '';
        if (/(?:^|\s)(?:-c\s+)?role\s*=/i.test(options)) problems.push(`${key} must not set a startup role`);
      } catch { /* Already reported as invalid URL. */ }
    }
  }
  if (env.NODE_ENV === 'production' && env.LEXA_WORKER_DURABLE_REDIS_CONFIRMED !== 'true') {
    problems.push('LEXA_WORKER_DURABLE_REDIS_CONFIRMED must be true after verifying persistent Key Value storage');
  }
  if (env.DATABASE_RUNTIME_ROLE && env.DATABASE_RUNTIME_ROLE !== 'lexa_app_runtime') {
    problems.push('DATABASE_RUNTIME_ROLE must equal lexa_app_runtime');
  }
  const port = env.CLAMAV_PORT ? Number(env.CLAMAV_PORT) : 3310;
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('CLAMAV_PORT must be an integer TCP port');
  if (env.NODE_ENV === 'production' && env.CLAMAV_HOST && /^(127\.0\.0\.1|localhost|::1)$/.test(env.CLAMAV_HOST)) {
    problems.push('CLAMAV_HOST must point to an isolated scanner service in production');
  }
  return problems;
}

export function workerHeartbeatStatus(dependencies: {
  redisHealthy: boolean;
  clamavHealthy: boolean;
  r2Configured: boolean;
}): 'healthy' | 'degraded' {
  return dependencies.redisHealthy && dependencies.clamavHealthy && dependencies.r2Configured ? 'healthy' : 'degraded';
}
