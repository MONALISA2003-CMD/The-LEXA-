/** Strict, canonical RFC 4122 UUID validation for platform account operations. */
export const PLATFORM_RECORD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPlatformRecordId(value: unknown): value is string {
  return typeof value === 'string' && PLATFORM_RECORD_ID_PATTERN.test(value);
}
