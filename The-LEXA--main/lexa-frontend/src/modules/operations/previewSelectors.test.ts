import { describe, expect, it } from 'vitest';
import { getModuleDefinition } from './moduleCatalog';
import { filterPreviewRecords, paginatePreviewRecords } from './previewSelectors';

const invoices = getModuleDefinition('sales-invoices');
if (!invoices) throw new Error('sales-invoices test module is missing');

describe('preview register filters and pagination', () => {
  it('filters by text and status without changing source records', () => {
    const source = invoices.initial;
    const filtered = filterPreviewRecords(source, invoices, { search: 'Nakasero', status: 'Paid' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.customer).toBe('Nakasero Foods');
    expect(source).toHaveLength(2);
  });

  it('honours inclusive from/to date boundaries', () => {
    const filtered = filterPreviewRecords(invoices.initial, invoices, { dateFrom: '2026-10-23', dateTo: '2026-10-23' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.invoiceNumber).toBe('INV-2026-103');
  });

  it('sorts newest date first and paginates defensively', () => {
    const filtered = filterPreviewRecords(invoices.initial, invoices);
    expect(filtered[0]?.invoiceNumber).toBe('INV-2026-104');
    expect(paginatePreviewRecords(filtered, 1, 1)).toHaveLength(1);
    expect(paginatePreviewRecords(filtered, 500, 1)).toHaveLength(0);
    expect(paginatePreviewRecords(filtered, 0, 0)).toHaveLength(1);
  });
});
