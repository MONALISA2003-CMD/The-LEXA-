import type { PaymentInput, SaleItemInput } from '../shared/types';
import { assertNonNegativeSafeInteger } from '../money/money';

export function normalizeSaleItems(items: SaleItemInput[]): SaleItemInput[] {
  if (items.length === 0) throw new Error('Add at least one item to the sale.');
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!item.productId) throw new Error('A selected product is missing its identifier.');
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new Error('Every sale quantity must be a positive whole number.');
    const quantity = (quantities.get(item.productId) ?? 0) + item.quantity;
    if (!Number.isSafeInteger(quantity)) throw new Error('The total quantity is too large.');
    quantities.set(item.productId, quantity);
  }
  return [...quantities.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

export function validatePaymentAllocations(payments: PaymentInput[], saleTotalMinor: number): PaymentInput[] {
  assertNonNegativeSafeInteger(saleTotalMinor, 'Sale total');
  let allocated = 0;
  const normalized: PaymentInput[] = [];
  for (const payment of payments) {
    assertNonNegativeSafeInteger(payment.amountMinor, 'Payment amount');
    allocated += payment.amountMinor;
    if (!Number.isSafeInteger(allocated)) throw new Error('Payment total is too large.');
    if (payment.amountMinor > 0) {
      normalized.push({
        method: payment.method,
        amountMinor: payment.amountMinor,
        ...(payment.reference?.trim() ? { reference: payment.reference.trim() } : {}),
      });
    }
  }
  if (allocated > saleTotalMinor) throw new Error('Recorded payments cannot exceed the sale total.');
  return normalized;
}

export function remainingReturnableQuantity(soldQuantity: number, alreadyReturnedQuantity: number): number {
  if (!Number.isSafeInteger(soldQuantity) || !Number.isSafeInteger(alreadyReturnedQuantity)) throw new Error('Return quantities must be whole numbers.');
  return Math.max(0, soldQuantity - alreadyReturnedQuantity);
}

export function calculateSaleTotal(lines: { quantity: number; unitPriceMinor: number }[]): number {
  const total = lines.reduce((sum, line) => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) throw new Error('Sale quantities must be positive whole numbers.');
    assertNonNegativeSafeInteger(line.unitPriceMinor, 'Selling price');
    const lineTotal = line.quantity * line.unitPriceMinor;
    if (!Number.isSafeInteger(lineTotal)) throw new Error('Line total is too large.');
    const next = sum + lineTotal;
    if (!Number.isSafeInteger(next)) throw new Error('Sale total is too large.');
    return next;
  }, 0);
  return total;
}
