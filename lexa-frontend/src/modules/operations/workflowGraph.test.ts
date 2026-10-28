import { describe, expect, it } from 'vitest';
import { MODULE_CATALOG } from './moduleCatalog';
import { getCoreScreenShortcuts, getRelatedActions, isDuplicateSensitiveHandoff, WORKFLOW_EDGES } from './workflowGraph';
import type { PreviewRecord } from './moduleCatalog';

function record(id: string, status: string, extra: Record<string, string> = {}): PreviewRecord {
  return { id, updatedAt: '2026-10-28T00:00:00.000Z', status, ...extra };
}

describe('cross-module preview workflow graph', () => {
  const ids = new Set(MODULE_CATALOG.map((module) => module.id));

  it('uses only existing module IDs and gives every module a relationship', () => {
    for (const edge of WORKFLOW_EDGES) {
      expect(ids.has(edge.sourceId), `unknown source ${edge.sourceId}`).toBe(true);
      expect(ids.has(edge.targetId), `unknown target ${edge.targetId}`).toBe(true);
      expect(edge.label.trim().length).toBeGreaterThan(0);
      expect(edge.description.trim().length).toBeGreaterThan(0);
    }
    const connected = new Set(WORKFLOW_EDGES.flatMap((edge) => [edge.sourceId, edge.targetId]));
    expect([...ids].filter((id) => !connected.has(id))).toEqual([]);
  });

  it('contains the core order-to-cash hand-offs without claiming live posting', () => {
    const edges = new Set(WORKFLOW_EDGES.map((item) => `${item.sourceId}->${item.targetId}`));
    for (const pair of [
      'customers->quotations', 'quotations->sales-orders', 'sales-orders->picklists',
      'sales-orders->sales-invoices', 'sales-invoices->payments', 'sales-invoices->sales-returns',
      'payments->bank-reconciliation',
    ]) expect(edges.has(pair), pair).toBe(true);
  });

  it('contains the purchase-to-pay and receiving/quality hand-offs', () => {
    const edges = new Set(WORKFLOW_EDGES.map((item) => `${item.sourceId}->${item.targetId}`));
    for (const pair of [
      'purchase-requests->rfqs', 'rfqs->supplier-quotes', 'supplier-quotes->purchases',
      'purchases->receiving', 'receiving->quality', 'purchases->purchase-invoices',
      'purchase-invoices->payments', 'purchase-invoices->purchase-returns',
    ]) expect(edges.has(pair), pair).toBe(true);
  });

  it('connects production, people, CRM and project workflows', () => {
    const edges = new Set(WORKFLOW_EDGES.map((item) => `${item.sourceId}->${item.targetId}`));
    for (const pair of [
      'leads->opportunities', 'opportunities->quotations', 'boms->work-orders',
      'work-orders->job-cards', 'job-cards->timesheets', 'employees->attendance',
      'attendance->payroll', 'payroll->payments', 'projects->tasks', 'projects->timesheets',
    ]) expect(edges.has(pair), pair).toBe(true);
  });

  it('gates status-sensitive actions and avoids payment hand-offs with no open amount', () => {
    expect(getRelatedActions('leads', record('L-1', 'New')).some((item) => item.targetId === 'opportunities')).toBe(false);
    expect(getRelatedActions('leads', record('L-2', 'Qualified')).some((item) => item.targetId === 'opportunities')).toBe(true);
    expect(getRelatedActions('sales-invoices', record('INV-1', 'Issued', { amountDue: '0' })).some((item) => item.targetId === 'payments')).toBe(false);
    expect(getRelatedActions('sales-invoices', record('INV-2', 'Issued', { amountDue: '12500' })).some((item) => item.targetId === 'payments')).toBe(true);
  });

  it('marks one-to-one conversions for duplicate protection without blocking legitimate repeated transactions', () => {
    expect(isDuplicateSensitiveHandoff('quotations', 'sales-orders')).toBe(true);
    expect(isDuplicateSensitiveHandoff('purchase-requests', 'rfqs')).toBe(true);
    expect(isDuplicateSensitiveHandoff('supplier-quotes', 'purchases')).toBe(true);
    expect(isDuplicateSensitiveHandoff('sales-invoices', 'payments')).toBe(false);
    expect(isDuplicateSensitiveHandoff('sales-orders', 'sales-invoices')).toBe(false);
  });

  it('provides a review-note route from each writable module', () => {
    for (const module of MODULE_CATALOG.filter((item) => item.id !== 'audit' && !item.readOnly)) {
      expect(getRelatedActions(module.id, record('SOURCE-1', 'Draft')).some((item) => item.targetId === 'audit'), module.id).toBe(true);
    }
  });
});


describe('core workflow navigation shortcuts', () => {
  it('provides existing core routes without pretending preview drafts are converted', () => {
    for (const id of ['sales-orders', 'sales-invoices', 'purchases', 'receiving', 'stock-counts', 'boms', 'team', 'accounting']) {
      const shortcuts = getCoreScreenShortcuts(id);
      expect(shortcuts.length, id).toBeGreaterThan(0);
      for (const shortcut of shortcuts) expect(['/products', '/inventory', '/checkout', '/sales', '/settings', '/modules/reports']).toContain(shortcut.path);
    }
    expect(getCoreScreenShortcuts('sales-orders').some((item) => item.path === '/checkout')).toBe(true);
  });
});
