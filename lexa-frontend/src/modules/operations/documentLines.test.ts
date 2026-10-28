import { describe, expect, it } from 'vitest';
import { calculateRecord, validateRecord, type FormValues } from './previewRules';
import {
  documentLineSubtotal, readDocumentLines, syncDocumentLines, validateDocumentLines,
} from './documentLines';

describe('multi-line sales and purchasing documents', () => {
  it('calculates a document subtotal as the sum of all line quantities times unit values', () => {
    const values: FormValues = {
      customer: 'A customer', quantity: '1', unitPrice: '0', discountPercent: '10',
      taxTreatment: 'Standard rated', taxRate: '18', status: 'Draft',
    };
    const lines = [
      { id: 'line-1', description: 'Rice 5kg', quantity: '2', unitAmount: '1000' },
      { id: 'line-2', description: 'Cooking oil', quantity: '3', unitAmount: '2500' },
    ];
    const synced = syncDocumentLines('quotations', values, lines);
    expect(Number(synced.quantity)).toBe(5);
    expect(synced.itemSummary).toBe('Rice 5kg; Cooking oil');
    expect(documentLineSubtotal(lines)).toBe(9500);
    const record = calculateRecord('quotations', synced, 'QUO-MULTI');
    expect(Number(record.subtotal)).toBe(9500);
    expect(Number(record.discountAmount)).toBe(950);
    expect(Number(record.taxAmount)).toBe(1539);
    expect(Number(record.total)).toBe(10089);
    expect(validateRecord('quotations', synced, record)).toBeNull();
  });

  it('uses purchasing line costs instead of the weighted average price for purchase totals', () => {
    const values = syncDocumentLines('purchases', {
      supplier: 'A supplier', taxTreatment: 'Zero-rated', taxRate: '0', amountPaid: '0', status: 'Draft',
    }, [
      { id: 'a', description: 'Carton', quantity: '10', unitAmount: '3200' },
      { id: 'b', description: 'Tape', quantity: '4', unitAmount: '1500' },
    ]);
    const record = calculateRecord('purchases', values, 'PO-MULTI');
    expect(Number(record.subtotal)).toBe(38000);
    expect(Number(record.total)).toBe(38000);
    expect(Number(record.amountDue)).toBe(38000);
  });

  it('supports old single-line records and normalizes them into the new editing shape', () => {
    const oldRecord: FormValues = { itemSummary: 'Legacy stock', quantity: '4', unitPrice: '1250', status: 'Draft' };
    expect(readDocumentLines('quotations', oldRecord)).toEqual([
      { id: 'line-1', description: 'Legacy stock', quantity: '4', unitAmount: '1250' },
    ]);
    const synced = syncDocumentLines('quotations', oldRecord, readDocumentLines('quotations', oldRecord));
    expect(JSON.parse(synced.lineItemsJson ?? '[]')).toHaveLength(1);
    expect(Number(calculateRecord('quotations', synced).subtotal)).toBe(5000);
  });

  it('rejects missing descriptions, zero quantities and malformed line amounts', () => {
    expect(validateDocumentLines('sales-invoices', { lineItemsJson: '[]' })).toMatch(/at least one/i);
    expect(validateDocumentLines('sales-invoices', { lineItemsJson: JSON.stringify([{ id: '1', description: '', quantity: '1', unitAmount: '10' }]) })).toMatch(/description/i);
    expect(validateDocumentLines('sales-invoices', { lineItemsJson: JSON.stringify([{ id: '1', description: 'Rice', quantity: '0', unitAmount: '10' }]) })).toMatch(/quantity/i);
    expect(validateDocumentLines('sales-invoices', { lineItemsJson: JSON.stringify([{ id: '1', description: 'Rice', quantity: '1', unitAmount: '-1' }]) })).toMatch(/cannot be negative/i);
  });
});
