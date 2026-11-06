/** LEXA platform subscriptions: business sales ledgers never participate in SaaS billing. */
export const SUBSCRIPTION_PRICE_UGX = 50_000;
export const SUBSCRIPTION_DAYS = 30;
export const SUBSCRIPTION_PERIOD_MS = SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1_000;

export type SubscriptionState = 'pending' | 'active' | 'suspended' | 'legacy' | 'archived';

export function nextPaidPeriod(now: Date, previousExpiresAt: Date | null): { startsAt: Date; endsAt: Date } {
  if (!Number.isFinite(now.getTime())) throw new Error('A valid activation time is required.');
  if (previousExpiresAt && !Number.isFinite(previousExpiresAt.getTime())) throw new Error('Invalid previous expiry.');
  const startsAt = previousExpiresAt && previousExpiresAt.getTime() > now.getTime()
    ? new Date(previousExpiresAt.getTime()) : new Date(now.getTime());
  return { startsAt, endsAt: new Date(startsAt.getTime() + SUBSCRIPTION_PERIOD_MS) };
}

export function hasOperationalAccess(status: SubscriptionState | null, expiresAt: Date | null, now = new Date()): boolean {
  if (status === 'legacy') return true;
  return status === 'active' && expiresAt instanceof Date && expiresAt.getTime() > now.getTime();
}

export function daysRemaining(expiresAt: Date | null, now = new Date()): number {
  return expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000)) : 0;
}

export function normalizedTransactionReference(value: string): string {
  return value.normalize('NFKC').trim().toUpperCase().replace(/\s+/g, ' ');
}

export function safePaymentMethod(value: unknown): string {
  if (typeof value !== 'string' || !['mtn_momo', 'airtel_money', 'bank_transfer', 'other'].includes(value)) {
    throw new Error('Choose a supported payment method.');
  }
  return value;
}
