/** LEXA public sandbox policy. Never enable on a production customer database. */
export const DEMO_MAX_SECONDS = 2 * 60 * 60;
export const DEMO_IDLE_SECONDS = 30 * 60;
export const DEMO_MAX_PER_HOUR = 8;
export const DEMO_SAMPLE_VERSION = 1;

export function isDemoRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LEXA_RUNTIME_MODE === 'demo';
}

/** Refuse to run as a demo server unless all deployment invariants hold. */
export function validateDemoEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (!isDemoRuntime(env)) return;
  if (env.DEMO_DATABASE_NAME !== 'lexa_demo') throw new Error('Demo requires DEMO_DATABASE_NAME=lexa_demo.');
  if (env.DEMO_ORIGIN !== 'https://demo.lexaaamaal.com' && env.NODE_ENV === 'production') {
    throw new Error('Demo production origin must be https://demo.lexaaamaal.com.');
  }
  if (env.NODE_ENV === 'production' && (!env.TURNSTILE_SECRET_KEY || env.DEMO_TURNSTILE_ENFORCE !== 'true')) {
    throw new Error('Public demo must enforce Cloudflare Turnstile in production.');
  }
  if (!env.DEMO_IP_HASH_SECRET || env.DEMO_IP_HASH_SECRET.length < 32) {
    throw new Error('DEMO_IP_HASH_SECRET must contain at least 32 random characters.');
  }
  if (!env.DATABASE_URL || !env.DATABASE_URL_UNPOOLED) throw new Error('Demo requires an isolated database.');
  // Configuration failures must be fatal, not merely advisory logs.
  for (const key of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED'] as const) {
    // ProcessEnv values are string | undefined. Narrow each value locally so
    // strictNullChecks in the production NestJS build cannot accept undefined.
    const configuredUrl = env[key];
    if (typeof configuredUrl !== 'string' || !configuredUrl.trim()) {
      throw new Error(`${key} must be a PostgreSQL URL.`);
    }
    let url: URL;
    try { url = new URL(configuredUrl); } catch { throw new Error(`${key} must be a PostgreSQL URL.`); }
    if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
      throw new Error(`${key} must be a PostgreSQL URL.`);
    }
    const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (database !== 'lexa_demo') throw new Error(`${key} must point to lexa_demo, never the customer database.`);
  }
}

/** These routes are the only operations which can run outside a visitor workspace. */
export function demoRoutePolicy(method: string, rawUrl: string): 'public'|'visitor'|'blocked' {
  const path = rawUrl.split('?')[0].replace(/^\/api\/v1(?=\/)/, '');
  if (method === 'GET' && (path === '/health/live' || path === '/health/ready' || path === '/auth/csrf')) return 'public';
  if (method === 'POST' && path === '/demo/sessions') return 'public';
  if (path === '/demo/session' && method === 'GET') return 'visitor';
  if (path === '/demo/reset' && method === 'POST') return 'visitor';
  if (path === '/demo/end' && method === 'POST') return 'visitor';
  if (path === '/auth/session' && method === 'GET') return 'visitor';
  if (path === '/workspaces' && method === 'GET') return 'visitor';
  if (/^\/workspaces\/[0-9a-f-]{36}(?:\/|$)/i.test(path)) {
    // Billing, account management, email invitations, external integrations,
    // data imports, backup/restore and any live outbound service are disabled.
    if (/\/(?:platform-billing)(?:\/|$)/i.test(path)) return method === 'GET' ? 'visitor' : 'blocked';
    if (/\/(?:invitations|backup|imports|bulk-import|webhooks|integrations|export-all|email|sms|payment-gateway|attachments|object-storage|external-service|data-operations|upload|download-all|invite|staff-provisioning)(?:\/|$)/i.test(path)) return 'blocked';
    // External sends and account/security transitions are not demo transactions.
    // This applies even when a feature route lives beneath a normal workspace.
    if (/\/(?:send-email|send-sms|dispatch|external-submit|provider-sync|payment-initiate|bank-transfer|disburse|eft|mobile-money|otp|password-reset|change-password|user-management|users\/invite)(?:\/|$)/i.test(path)) return 'blocked';
    if (/\/(?:efris|tax-documents)\/(?:submit|file|transmit)(?:\/|$)/i.test(path)) return 'blocked';
    if (method === 'DELETE') return 'blocked';
    return 'visitor';
  }
  return 'blocked';
}

export function validDemoSession(expiresAt: Date, lastSeenAt: Date, endedAt: Date | null, now = new Date()): boolean {
  return !endedAt && expiresAt.getTime() > now.getTime() && lastSeenAt.getTime() + DEMO_IDLE_SECONDS * 1000 > now.getTime();
}
