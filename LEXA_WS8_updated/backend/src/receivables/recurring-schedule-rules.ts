export type RecurrenceFrequency = 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'custom';
export type RecurrenceIntervalUnit = 'day' | 'week' | 'month' | 'year';

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError('Date must use YYYY-MM-DD.');
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new RangeError('Date is not a valid calendar date.');
  return d;
}
function formatDate(d: Date): string { return d.toISOString().slice(0, 10); }
function daysInMonth(year: number, monthIndex: number): number { return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate(); }

/** Month-end policy: anchor to the configured day, clamped to the last valid day of each target month. */
export function nextRecurringDate(input: {
  currentDate: string; frequency: RecurrenceFrequency; anchorDay: number;
  intervalCount?: number; intervalUnit?: RecurrenceIntervalUnit | null;
}): string {
  const current = parseDate(input.currentDate);
  const count = input.intervalCount ?? 1;
  if (!Number.isInteger(count) || count < 1 || count > 120) throw new RangeError('Interval count must be between 1 and 120.');
  const anchor = Math.max(1, Math.min(31, Math.trunc(input.anchorDay)));
  if (input.frequency === 'weekly') return formatDate(new Date(current.getTime() + 7 * count * 86400000));
  if (input.frequency === 'monthly' || input.frequency === 'quarterly' || input.frequency === 'annual' || (input.frequency === 'custom' && (input.intervalUnit === 'month' || input.intervalUnit === 'year'))) {
    const months = input.frequency === 'monthly' ? count : input.frequency === 'quarterly' ? 3 * count : input.frequency === 'annual' ? 12 * count : input.intervalUnit === 'year' ? 12 * count : count;
    const monthIndex = current.getUTCMonth() + months;
    const year = current.getUTCFullYear() + Math.floor(monthIndex / 12);
    const month = ((monthIndex % 12) + 12) % 12;
    return formatDate(new Date(Date.UTC(year, month, Math.min(anchor, daysInMonth(year, month)))));
  }
  if (input.frequency === 'custom' && input.intervalUnit === 'week') return formatDate(new Date(current.getTime() + 7 * count * 86400000));
  if (input.frequency === 'custom' && input.intervalUnit === 'day') return formatDate(new Date(current.getTime() + count * 86400000));
  throw new RangeError('Unsupported recurrence frequency or custom interval unit.');
}

export function addCalendarDays(value: string, days: number): string {
  if (!Number.isInteger(days) || days < 0 || days > 3650) throw new RangeError('Due days are invalid.');
  return formatDate(new Date(parseDate(value).getTime() + days * 86400000));
}

export function occurrenceKey(value: string): string {
  parseDate(value);
  return value;
}
