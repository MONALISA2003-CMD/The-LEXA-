import { describe, expect, it } from 'vitest';
import { formatMinorAmount, minorUnitFactor, parseMajorAmount } from './money';

describe('currency-safe money helpers', () => {
  it('uses whole shillings for UGX', () => {
    expect(minorUnitFactor('UGX')).toBe(1);
    expect(parseMajorAmount('12500', 'UGX')).toBe(12500);
    expect(formatMinorAmount(12500, 'UGX')).toContain('12,500');
  });

  it('stores USD as integer cents', () => {
    expect(minorUnitFactor('USD')).toBe(100);
    expect(parseMajorAmount('12.34', 'USD')).toBe(1234);
    expect(formatMinorAmount(1234, 'USD')).toContain('12.34');
  });

  it('rejects negative and invalid amounts', () => {
    expect(() => parseMajorAmount('-1', 'UGX')).toThrow(/non-negative/);
    expect(() => parseMajorAmount('not money', 'UGX')).toThrow(/valid/);
  });
});
