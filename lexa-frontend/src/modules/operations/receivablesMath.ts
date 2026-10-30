export type ReceivablesStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'void';
export type AgeingBucket = 'current' | 'days1to30' | 'days31to60' | 'days61to90' | 'over90';

export function outstandingMinor(totalMinor: number, receivedMinor: number): number {
  if (!Number.isSafeInteger(totalMinor) || !Number.isSafeInteger(receivedMinor)) throw new Error('Invoice amounts must be safe whole minor units.');
  if (totalMinor < 0 || receivedMinor < 0) throw new Error('Invoice amounts cannot be negative.');
  return Math.max(0, totalMinor - receivedMinor);
}

export function receivablesStatus(totalMinor: number, receivedMinor: number, dueDate: string, asOfDate: string): ReceivablesStatus {
  const balance = outstandingMinor(totalMinor, receivedMinor);
  if (balance === 0) return 'paid';
  if (dueDate < asOfDate) return 'overdue';
  return receivedMinor > 0 ? 'partially_paid' : 'issued';
}

export function ageingBucket(dueDate: string, asOfDate: string): AgeingBucket {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw new Error('Ageing dates must use YYYY-MM-DD.');
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const asOf = Date.parse(`${asOfDate}T00:00:00Z`);
  if (!Number.isFinite(due) || !Number.isFinite(asOf)) throw new Error('Ageing dates must be valid calendar dates.');
  const daysOverdue = Math.max(0, Math.floor((asOf - due) / 86_400_000));
  if (daysOverdue === 0) return 'current';
  if (daysOverdue <= 30) return 'days1to30';
  if (daysOverdue <= 60) return 'days31to60';
  if (daysOverdue <= 90) return 'days61to90';
  return 'over90';
}
