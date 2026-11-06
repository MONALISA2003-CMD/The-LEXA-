import { isIP } from 'node:net';
import { createHash } from 'node:crypto';

/**
 * Only server-observed socket IPs are accepted. Fastify trustProxy is opt-in and
 * restricted to operator-configured proxy IP/CIDR ranges at startup.
 * Never authorize a user solely from an IP address.
 */
export function observedClientIp(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return isIP(value) ? value : null;
}

export function safeClientLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  return raw.replace(/[\r\n\t\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 160) || null;
}

export function authenticatedSessionHash(cookieHeader: string | undefined): string | null {
  const encoded = (cookieHeader ?? '').split(';').map(x => x.trim()).find(x => x.startsWith('lexa_session='))?.slice(13);
  if (!encoded || encoded.length > 512) return null;
  try {
    const value = decodeURIComponent(encoded);
    return value ? createHash('sha256').update(value).digest('hex') : null;
  } catch { return null; }
}

export function recentActivity(lastSeen: string | Date | null, now = new Date()): boolean {
  if (!lastSeen) return false;
  const elapsed = now.getTime() - new Date(lastSeen).getTime();
  return elapsed >= 0 && elapsed < 5 * 60_000;
}
