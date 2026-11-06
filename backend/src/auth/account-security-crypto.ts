import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** All browser credentials and login challenge tokens are opaque, high-entropy secrets. */
export function secretToken(): string { return randomBytes(32).toString('base64url'); }
export function tokenDigest(value: string): string { return createHash('sha256').update(value).digest('hex'); }
export function equalDigest(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Low-entropy emailed codes MUST be keyed; a database dump must not allow offline guessing. */
export function emailCodeDigest(code: string, pepper: string): string {
  if (pepper.length < 32) throw new Error('AUTH_OTP_PEPPER must contain at least 32 characters.');
  return createHmac('sha256', pepper).update(code, 'utf8').digest('hex');
}
export function newEmailCode(): string { return String(randomBytes(4).readUInt32BE(0) % 100_000_000).padStart(8, '0'); }

/** RFC 6238 TOTP; 30-second SHA1/6-digit codes are supported by standard authenticator apps. */
export const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function encodeBase32(bytes: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += BASE32[(value >>> (bits -= 5)) & 31]; }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}
export function decodeBase32(text: string): Buffer {
  if (!/^[A-Z2-7]+$/.test(text) || text.length < 16) throw new Error('INVALID_AUTHENTICATOR_SECRET');
  let bits = 0, value = 0; const bytes: number[] = [];
  for (const character of text) {
    value = (value << 5) | BASE32.indexOf(character); bits += 5;
    if (bits >= 8) bytes.push((value >>> (bits -= 8)) & 255);
  }
  return Buffer.from(bytes);
}
export function newAuthenticatorSecret(): string { return encodeBase32(randomBytes(20)); }
export function totpAt(secret: string, step: number): string {
  if (!Number.isSafeInteger(step) || step < 0) throw new Error('INVALID_TIME_STEP');
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 15;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
export function validTotpStep(secret: string, code: string, now = Date.now(), lastUsedStep = -1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const step = Math.floor(now / 30_000);
  for (const candidate of [step - 1, step, step + 1]) {
    if (candidate <= lastUsedStep || candidate < 0) continue;
    if (equalDigest(totpAt(secret, candidate), code)) return candidate;
  }
  return null;
}
export function encryptAuthenticatorSecret(secret: string, rawKey: string): string {
  const key = Buffer.from(rawKey, 'base64');
  if (key.length !== 32) throw new Error('AUTH_TOTP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ciphertext.toString('base64url')}`;
}
export function decryptAuthenticatorSecret(encoded: string, rawKey: string): string {
  const key = Buffer.from(rawKey, 'base64');
  if (key.length !== 32) throw new Error('AUTH_TOTP_ENCRYPTION_KEY missing or invalid.');
  const parts = encoded.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('AUTHENTICATOR_SECRET_FORMAT_INVALID');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1]!, 'base64url'));
  decipher.setAuthTag(Buffer.from(parts[2]!, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(parts[3]!, 'base64url')), decipher.final()]).toString('utf8');
}
export function recoveryCode(): string { return randomBytes(12).toString('base64url').toUpperCase(); }
export function safeBrowserLabel(userAgent: unknown): string {
  if (typeof userAgent !== 'string') return 'Unidentified browser';
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : 'Browser';
  const operatingSystem = /Android/i.test(userAgent) ? 'Android' : /iPhone|iPad/i.test(userAgent) ? 'iOS'
    : /Windows/i.test(userAgent) ? 'Windows' : /Mac OS X/i.test(userAgent) ? 'macOS' : /Linux/i.test(userAgent) ? 'Linux' : 'Unknown device';
  return `${browser} on ${operatingSystem}`; // No fingerprint, raw user agent, or IP is stored.
}
export function cookieFromHeader(raw: string | undefined, name: string): string | undefined {
  for (const item of (raw ?? '').split(';')) {
    const at = item.indexOf('=');
    if (at >= 0 && item.slice(0, at).trim() === name) {
      try { return decodeURIComponent(item.slice(at + 1).trim()); } catch { return undefined; }
    }
  }
  return undefined;
}
