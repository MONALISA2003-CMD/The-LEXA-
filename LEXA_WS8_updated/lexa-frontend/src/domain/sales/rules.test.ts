import { describe, expect, it } from 'vitest';
import { calculateSaleTotal, normalizeSaleItems, remainingReturnableQuantity, validatePaymentAllocations } from './rules';

describe('sales domain rules', () => {
  it('combines duplicate cart lines while preserving quantity totals', () => {
    expect(normalizeSaleItems([{ productId: 'p1', quantity: 1 }, { productId: 'p1', quantity: 2 }]))
      .toEqual([{ productId: 'p1', quantity: 3 }]);
  });

  it('calculates line totals using integer amounts', () => {
    expect(calculateSaleTotal([{ quantity: 3, unitPriceMinor: 1250 }, { quantity: 2, unitPriceMinor: 500 }])).toBe(4750);
  });

  it('rejects payments greater than the sale total', () => {
    expect(() => validatePaymentAllocations([{ method: 'cash', amountMinor: 101 }], 100)).toThrow(/cannot exceed/);
  });

  it('limits returns to the quantity that remains returnable', () => {
    expect(remainingReturnableQuantity(5, 2)).toBe(3);
    expect(remainingReturnableQuantity(5, 8)).toBe(0);
  });
});
