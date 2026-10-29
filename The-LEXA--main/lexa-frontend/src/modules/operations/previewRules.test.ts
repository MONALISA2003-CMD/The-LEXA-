import { describe, expect, it } from 'vitest';
import { calculateRecord, effectiveTaxRate, nextStatus, safeNumber, validateRecord, type FormValues } from './previewRules';

const base = { status: 'Draft' };

describe('preview business calculations', () => {
  it('calculates quotation subtotal, discount, tax and total from the same rule source used by save', () => {
    const values: FormValues = { ...base, customer: 'Example Customer', quantity: '10', unitPrice: '20000', discountPercent: '10', taxTreatment: 'Standard rated', taxRate: '18' };
    const record = calculateRecord('quotations', values, 'QUO-TEST');
    expect(Number(record.subtotal)).toBe(200000);
    expect(Number(record.discountAmount)).toBe(20000);
    expect(Number(record.taxAmount)).toBe(32400);
    expect(Number(record.total)).toBe(212400);
    expect(validateRecord('quotations', values, record)).toBeNull();
  });

  it('applies zero tax to exempt and zero-rated preview treatments', () => {
    expect(effectiveTaxRate({ taxTreatment: 'Exempt', taxRate: '18' })).toBe(0);
    expect(effectiveTaxRate({ taxTreatment: 'Zero-rated', taxRate: '18' })).toBe(0);
    expect(effectiveTaxRate({ taxTreatment: 'Standard rated', taxRate: '18' })).toBe(18);
  });

  it('calculates sales-invoice balance due and prevents over-receipt', () => {
    const values: FormValues = { ...base, customer: 'Customer', quantity: '2', unitPrice: '50000', taxRate: '18', taxTreatment: 'Standard rated', amountReceived: '59000' };
    const record = calculateRecord('sales-invoices', values, 'INV-TEST');
    expect(Number(record.total)).toBe(118000);
    expect(Number(record.amountDue)).toBe(59000);
    expect(validateRecord('sales-invoices', values, record)).toBeNull();
    expect(validateRecord('sales-invoices', { ...values, amountReceived: '118001' }, record)).toMatch(/greater than the calculated invoice total/i);
  });

  it('calculates supplier bill due without allowing negative payable totals', () => {
    const values: FormValues = { ...base, supplier: 'Supplier', quantity: '4', unitCost: '25000', taxRate: '0', taxTreatment: 'Zero-rated', amountPaid: '200000' };
    const record = calculateRecord('purchase-invoices', values, 'BILL-TEST');
    expect(Number(record.total)).toBe(100000);
    expect(Number(record.amountDue)).toBe(0);
    expect(validateRecord('purchase-invoices', values, record)).toMatch(/cannot be greater than the calculated purchase total/i);
  });

  it('derives stock-count variance and rejects impossible receiving quantities', () => {
    const count = calculateRecord('stock-counts', { expectedQuantity: '25', countedQuantity: '21', status: 'Draft' }, 'CNT-TEST');
    expect(Number(count.variance)).toBe(-4);
    const receiving: FormValues = { orderedQuantity: '10', acceptedQuantity: '8', rejectedQuantity: '3', status: 'Draft' };
    expect(validateRecord('receiving', receiving, calculateRecord('receiving', receiving))).toMatch(/cannot exceed the ordered quantity/i);
  });

  it('calculates attendance and asset estimates without floating-point display drift', () => {
    const attendance = calculateRecord('attendance', { clockIn: '09:00', clockOut: '17:30', breakMinutes: '30', status: 'Pending' }, 'ATT-TEST');
    expect(Number(attendance.workedHours)).toBe(8);
    const asset = calculateRecord('assets', { cost: '1000000', residualValue: '100000', usefulLifeYears: '5', accumulatedDepreciation: '180000', status: 'Active' }, 'AST-TEST');
    expect(Number(asset.annualDepreciation)).toBe(180000);
    expect(Number(asset.carryingValue)).toBe(820000);
  });

  it('validates journals and stock transfer source/destination requirements', () => {
    expect(validateRecord('accounting', { amount: '15000', debitAccount: 'Cash', creditAccount: 'Cash' }, calculateRecord('accounting', { amount: '15000', debitAccount: 'Cash', creditAccount: 'Cash' }))).toMatch(/different debit and credit accounts/i);
    expect(validateRecord('stock-transfers', { quantity: '1', fromBranch: 'Main', toBranch: ' main ' }, calculateRecord('stock-transfers', { quantity: '1', fromBranch: 'Main', toBranch: ' main ' }))).toMatch(/must be different/i);
    expect(validateRecord('stock-transfers', { quantity: '1', fromBranch: ' ', toBranch: 'Main' }, calculateRecord('stock-transfers', { quantity: '1', fromBranch: ' ', toBranch: 'Main' }))).toMatch(/enter both/i);
  });

  it('rejects invalid percentages, date ordering and negative payroll deductions', () => {
    expect(validateRecord('quotations', { quantity: '1', unitPrice: '10', discountPercent: '101', taxRate: '18', issueDate: '2026-10-28', validUntil: '2026-10-29' }, calculateRecord('quotations', {}))).toMatch(/discount cannot exceed/i);
    expect(validateRecord('quotations', { quantity: '1', unitPrice: '10', discountPercent: '0', taxRate: '18', issueDate: '2026-10-29', validUntil: '2026-10-28' }, calculateRecord('quotations', {}))).toMatch(/validity date cannot be earlier/i);
    expect(validateRecord('payroll', { employeeCount: '1', grossPay: '100000', deductions: '101000', periodStart: '2026-10-01', periodEnd: '2026-10-31' }, calculateRecord('payroll', {}))).toMatch(/deductions cannot exceed gross pay/i);
  });

  it('exposes safe numeric parsing and finite status transitions', () => {
    expect(safeNumber(' 1,250.50 ')).toBe(1250.5);
    expect(safeNumber('not a number')).toBe(0);
    expect(nextStatus('quotations', 'Draft')).toBe('Sent');
    expect(nextStatus('quotations', 'Expired')).toBeUndefined();
    expect(nextStatus('sales-orders', 'Fulfilled')).toBe('Invoiced');
  });
});
