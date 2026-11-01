import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const storage = new AsyncLocalStorage<{ correlationId: string }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function correlationIdFromHeader(value: unknown): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'string' && UUID.test(candidate) ? candidate : randomUUID();
}
export function runWithCorrelationId<T>(correlationId: string, work: () => T): T {
  return storage.run({ correlationId }, work);
}
export function currentCorrelationId(): string | undefined { return storage.getStore()?.correlationId; }
