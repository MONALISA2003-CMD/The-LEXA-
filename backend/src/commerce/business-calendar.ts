/** Resolve expiry and inventory as-of dates in the tenant's configured time zone.
 * UTC dates from PostgreSQL date columns are calendar labels, not instants in
 * the cashier's or server's local time zone.
 */
export function businessCalendarDate(timeZone: string, at: Date = new Date()): string {
  if (!timeZone || !Number.isFinite(at.getTime())) throw new RangeError('A valid business time zone and date are required.');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(at);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  if (!/^\d{4}$/.test(values.year ?? '') || !/^\d{2}$/.test(values.month ?? '') || !/^\d{2}$/.test(values.day ?? '')) {
    throw new RangeError('Unable to resolve the business calendar date.');
  }
  return `${values.year}-${values.month}-${values.day}`;
}

/** Date-only expiry is valid through the end of the printed local expiry day. */
export function inventoryLotExpired(expiryDate: Date | null | undefined, businessDay: string): boolean {
  if (!expiryDate) return false;
  if (!Number.isFinite(expiryDate.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(businessDay)) {
    throw new RangeError('Expiry and business-day evidence must be valid.');
  }
  return expiryDate.toISOString().slice(0, 10) < businessDay;
}
