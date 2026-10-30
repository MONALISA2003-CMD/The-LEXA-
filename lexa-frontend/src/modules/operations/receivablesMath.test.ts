import { describe, expect, it } from 'vitest';
import { ageingBucket, outstandingMinor, receivablesStatus } from './receivablesMath';

describe('accounts receivable calculations', () => {
  it('calculates outstanding value without allowing a negative balance', () => {
    expect(outstandingMinor(125_000, 25_000)).toBe(100_000);
    expect(outstandingMinor(125_000, 150_000)).toBe(0);
  });

  it('derives draft-independent invoice states from paid value and due date', () => {
    expect(receivablesStatus(100_000, 0, '2026-10-31', '2026-10-30')).toBe('issued');
    expect(receivablesStatus(100_000, 40_000, '2026-10-31', '2026-10-30')).toBe('partially_paid');
    expect(receivablesStatus(100_000, 100_000, '2026-10-01', '2026-10-30')).toBe('paid');
    expect(receivablesStatus(100_000, 0, '2026-10-01', '2026-10-30')).toBe('overdue');
  });

  it('places due balances into the correct ageing bucket', () => {
    expect(ageingBucket('2026-10-30', '2026-10-30')).toBe('current');
    expect(ageingBucket('2026-10-01', '2026-10-30')).toBe('days1to30');
    expect(ageingBucket('2026-08-31', '2026-10-30')).toBe('days31to60');
    expect(ageingBucket('2026-08-01', '2026-10-30')).toBe('days61to90');
    expect(ageingBucket('2026-06-01', '2026-10-30')).toBe('over90');
  });
});
