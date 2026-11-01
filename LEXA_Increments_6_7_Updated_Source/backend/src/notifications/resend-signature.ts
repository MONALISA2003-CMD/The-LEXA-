import { createHmac, timingSafeEqual } from 'node:crypto';

/** Resend's Svix-compatible v1 signature over `${id}.${timestamp}.${rawBody}`. */
export function verifyResendWebhookSignature(
  rawBody: Buffer,
  id: string,
  timestamp: string,
  signatureHeader: string,
  secret: string,
  nowSeconds = Date.now() / 1000,
): boolean {
  if (!id || !/^\d+$/.test(timestamp) || !signatureHeader) return false;
  const issuedAt = Number(timestamp);
  if (!Number.isFinite(issuedAt) || Math.abs(nowSeconds - issuedAt) > 300) return false;
  const rawSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let key: Buffer;
  try { key = Buffer.from(rawSecret, 'base64'); } catch { return false; }
  if (!key.length) return false;
  const signed = `${id}.${timestamp}.${rawBody.toString('utf8')}`;
  const expected = createHmac('sha256', key).update(signed).digest();
  return signatureHeader.split(' ').some((entry) => {
    const [version, value] = entry.split(',', 2);
    if (version !== 'v1' || !value) return false;
    try {
      const candidate = Buffer.from(value, 'base64');
      return candidate.length === expected.length && timingSafeEqual(candidate, expected);
    } catch { return false; }
  });
}
