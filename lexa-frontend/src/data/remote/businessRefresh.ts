import type { QueryClient } from '@tanstack/react-query';

/** Invalidate only the signed-in business' authoritative projections after a write. */
const businessProjectionPrefixes = new Set([
  'dashboard', 'dashboard-analytics', 'authoritative-reports', 'module-reports',
  'general-ledger-accounts', 'general-ledger-periods', 'general-ledger-journals',
  'general-ledger-trial-balance', 'general-ledger-profit-and-loss',
  'general-ledger-balance-sheet', 'general-ledger-source-reconciliation',
  'ap-invoices', 'ap-payments', 'ap-purchase-orders', 'ap-summary', 'ap-reconciliation',
  'ws-finance-cash', 'ws-finance-expenses', 'ws-finance-expense-categories', 'ws-finance-assets', 'ws-finance-credits',
  'ws-finance-banks', 'ws-finance-centres', 'bank-reconciliations', 'bank-statement-lines',
  'bank-ledger-lines', 'w6-payroll', 'w6-payroll-lines', 'w6-attendance', 'w6-employees',
  'w6-timesheets', 'w6-leave', 'commerce-purchase-orders', 'commerce-sales-orders',
  'module-register',
]);
const businessWidePrefixes = new Set(['general-ledger-accounts', 'general-ledger-periods']);

export function belongsToBusinessProjection(queryKey: readonly unknown[], workspaceId: string, branchId: string): boolean {
  if (typeof queryKey[0] !== 'string' || !businessProjectionPrefixes.has(queryKey[0])) return false;
  if (!queryKey.includes(workspaceId)) return false;
  return businessWidePrefixes.has(queryKey[0]) || queryKey.includes(branchId);
}

export async function refreshBusinessProjections(cache: QueryClient, workspaceId: string, branchId: string): Promise<void> {
  await cache.invalidateQueries({ predicate: ({ queryKey }) => belongsToBusinessProjection(queryKey, workspaceId, branchId) });
}
