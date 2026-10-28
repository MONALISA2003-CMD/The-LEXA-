export function createId(prefix = 'id'): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}_${uuid ?? `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createDocumentNumber(prefix: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(2, 12);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${suffix}`;
}
