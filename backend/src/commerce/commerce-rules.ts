/** Pure commerce domain rules shared by API handlers and their unit tests. */
export type PaymentMethodCategory = 'cash' | 'mobile_money' | 'bank_transfer' | 'card' | 'cheque' | 'other';

export const PAYMENT_METHOD_CATEGORIES: readonly PaymentMethodCategory[] = [
  'cash', 'mobile_money', 'bank_transfer', 'card', 'cheque', 'other',
];

export function paymentCategoryFromMethod(method: string): PaymentMethodCategory {
  if (method === 'cash') return 'cash';
  if (['mobile_money', 'mtn_momo', 'airtel_money'].includes(method)) return 'mobile_money';
  if (method === 'bank_transfer') return 'bank_transfer';
  if (['card', 'card_recorded'].includes(method)) return 'card';
  if (method === 'cheque') return 'cheque';
  return 'other';
}

export const DELIVERY_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  prepared: ['assigned', 'cancelled'],
  assigned: ['picked_up', 'cancelled'],
  picked_up: ['in_transit', 'delivery_failed'],
  in_transit: ['delivered', 'delivery_failed'],
  delivery_failed: ['return_pending', 'returned', 'assigned', 'in_transit'],
  return_pending: ['returned', 'assigned'],
  returned: [],
  delivered: [],
  cancelled: [],
  // Explicit compatibility for the legacy delivery status.
  dispatched: ['in_transit', 'delivered', 'delivery_failed'],
};

export function isValidDeliveryTransition(previous: string, next: string): boolean {
  return (DELIVERY_TRANSITIONS[previous] ?? []).includes(next);
}

export function dispatchableQuantity(sold: number, reserved: number, customerReturned = 0): number {
  for (const [name, value] of [['sold', sold], ['reserved', reserved], ['customer returned', customerReturned]] as const) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} quantity must be finite and non-negative.`);
  }
  return Math.max(0, sold - reserved - customerReturned);
}

/**
 * A customer balance is the payable sale value less returns and receipts net of
 * business-recorded refunds. Rider claims are deliberately not an input.
 */
export function outstandingSaleMinor(totalMinor: number, returnedMinor: number, receiptsMinor: number, refundsMinor: number): number {
  const values = [totalMinor, returnedMinor, receiptsMinor, refundsMinor];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) throw new RangeError('Sale balance inputs must be non-negative integer minor units.');
  return Math.max(0, totalMinor - returnedMinor - receiptsMinor + refundsMinor);
}

export function remainingCollectionMinor(reportedMinor: number, remittedMinor: number, newAllocationMinor = 0): number {
  for (const value of [reportedMinor, remittedMinor, newAllocationMinor]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Collection amounts must be non-negative integer minor units.');
  }
  if (remittedMinor + newAllocationMinor > reportedMinor) throw new RangeError('Remittance allocations cannot exceed the rider-reported amount.');
  return reportedMinor - remittedMinor - newAllocationMinor;
}
