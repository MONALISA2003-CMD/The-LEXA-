import { describe, expect, it } from 'vitest';
import { createPreviewDataService } from './previewDataService';
import { buildPreviewReportSnapshot, getPreviewDateRange, loadPreviewReportSnapshot, REPORT_NAMES, REPORT_PERIODS } from './previewReports';
import { MODULE_CATALOG, getModuleDefinition } from '../../modules/operations/moduleCatalog';
import type { PreviewRecord } from '../../modules/operations/moduleCatalog';

const fixedNow = new Date('2026-10-28T12:00:00.000Z');

describe('preview report calculations and scope', () => {
  it('builds inclusive rolling periods without inventing scaled totals', () => {
    expect(getPreviewDateRange('Today', fixedNow)).toEqual({ from: '2026-10-28', to: '2026-10-28' });
    expect(getPreviewDateRange('Last 7 days', fixedNow)).toEqual({ from: '2026-10-22', to: '2026-10-28' });
    expect(getPreviewDateRange('Year to date', fixedNow)).toEqual({ from: '2026-01-01', to: '2026-10-28' });
    expect(getPreviewDateRange('Next 7 days', fixedNow)).toEqual({ from: '2026-10-28', to: '2026-11-03' });
    expect(getPreviewDateRange('Next 30 days', fixedNow)).toEqual({ from: '2026-10-28', to: '2026-11-26' });
  });

  it('derives invoice totals from the input preview records and filters by period', () => {
    const invoiceModule = getModuleDefinition('sales-invoices');
    if (!invoiceModule) throw new Error('sales-invoices test fixture is missing');
    const invoices: PreviewRecord[] = [
      { id: 'I-1', updatedAt: '2026-10-28T00:00:00.000Z', status: 'Issued', issueDate: '2026-10-28', total: '1000', amountDue: '500', taxAmount: '180' },
      { id: 'I-2', updatedAt: '2026-07-01T00:00:00.000Z', status: 'Issued', issueDate: '2026-07-01', total: '9000', amountDue: '9000', taxAmount: '1620' },
    ];
    const base = buildPreviewReportSnapshot({ 'sales-invoices': invoices }, 'Sales & receipts', 'Today', 'UGX', fixedNow);
    expect(base.entries.find((entry) => entry.label === 'Invoice totals')?.value).toBe(1000);
    expect(base.entries.find((entry) => entry.label === 'Net sales estimate')?.value).toBe(1000);
    expect(base.filteredRecordCounts['sales-invoices']).toBe(1);
    const changed = buildPreviewReportSnapshot({ 'sales-invoices': [{ ...invoices[0]!, total: '1200' }] }, 'Sales & receipts', 'Today', 'UGX', fixedNow);
    expect(changed.entries.find((entry) => entry.label === 'Invoice totals')?.value).toBe(1200);
  });

  it('has a builder for every report selector option and every period selector option', () => {
    for (const module of MODULE_CATALOG) expect(module.id).toBeTruthy();
    expect(REPORT_PERIODS).toContain('Next 30 days');
    for (const name of REPORT_NAMES) {
      const snapshot = buildPreviewReportSnapshot({}, name, 'Last 30 days', 'UGX', fixedNow);
      expect(snapshot.report).toBe(name);
      expect(Array.isArray(snapshot.entries)).toBe(true);
      expect(snapshot.interpretationNote.length).toBeGreaterThan(0);
    }
    const report = buildPreviewReportSnapshot({}, 'Integration health', 'Last 30 days', 'UGX', fixedNow);
    expect(report.entries.map((entry) => entry.label)).toContain('Integration errors');
    expect(report.interpretationNote).toMatch(/No credentials/);
  });

  it('loads every preview module through the injectable service without merging core product records', async () => {
    const service = createPreviewDataService({ storage: null });
    const snapshot = await loadPreviewReportSnapshot(service, { workspaceId: 'ws-test', branchId: 'br-test' }, 'Master-data coverage', 'Last 30 days', 'UGX', fixedNow);
    expect(snapshot.persistenceMode).toBe('memory-only');
    expect(snapshot.filteredRecordCounts['products']).toBeUndefined();
    expect(snapshot.entries.find((entry) => entry.label === 'CRM contacts on file')?.value).toBe(getModuleDefinition('contacts')?.initial.length);
  });

  it('keeps older unpaid invoices in ageing calculations and excludes draft invoices from sales', () => {
    const source: PreviewRecord[] = [
      { id: 'old-open', updatedAt: '2026-01-01T00:00:00.000Z', status: 'Issued', issueDate: '2026-01-01', dueDate: '2026-01-15', total: '1000', amountDue: '1000', taxAmount: '180' },
      { id: 'draft', updatedAt: '2026-10-28T00:00:00.000Z', status: 'Draft', issueDate: '2026-10-28', dueDate: '2026-11-27', total: '5000', amountDue: '5000', taxAmount: '900' },
    ];
    const sales = buildPreviewReportSnapshot({ 'sales-invoices': source }, 'Sales & receipts', 'Last 7 days', 'UGX', fixedNow);
    expect(sales.entries.find((entry) => entry.label === 'Invoice totals')?.value).toBe(0);
    const ageing = buildPreviewReportSnapshot({ 'sales-invoices': source }, 'Receivables ageing', 'Last 7 days', 'UGX', fixedNow);
    expect(ageing.entries.find((entry) => entry.label === '61+ days overdue')?.value).toBe(1000);
  });
});
