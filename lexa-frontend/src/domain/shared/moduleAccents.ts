/** Explicit LEXA module accent metadata; never inferred from URL substrings. */
export type ModuleAccentKey = 'navy' | 'blue' | 'cyan' | 'emerald' | 'gold' | 'orange';
const forPaths = (accent: ModuleAccentKey, paths: string[]) => Object.fromEntries(paths.map((path) => [path, accent])) as Record<string, ModuleAccentKey>;
export const MODULE_ACCENTS_BY_PATH: Readonly<Record<string, ModuleAccentKey>> = Object.freeze({
  ...forPaths('navy', ['/', '/workspace', '/modules', '/modules/', '/settings', '/modules/projects', '/modules/team', '/modules/audit']),
  ...forPaths('cyan', ['/business-tools']),
  ...forPaths('blue', ['/checkout', '/sales', '/modules/sales-orders', '/modules/sales-invoices', '/modules/quotations', '/modules/price-lists', '/modules/sales-returns', '/modules/cash-sessions']),
  ...forPaths('emerald', ['/modules/leads', '/modules/opportunities', '/modules/contacts', '/modules/campaigns', '/modules/sales-teams', '/modules/customers', '/modules/employees', '/modules/attendance', '/modules/payroll', '/modules/leave', '/modules/timesheets', '/modules/support']),
  ...forPaths('cyan', ['/products', '/inventory', '/modules/receiving', '/modules/stock-counts', '/modules/stock-transfers', '/modules/warehouses', '/modules/picklists', '/modules/item-bundles', '/modules/work-orders', '/modules/boms', '/modules/job-cards', '/modules/quality', '/modules/batches', '/modules/replenishment', '/modules/deliveries', '/modules/packages', '/modules/tasks', '/modules/integrations']),
  ...forPaths('orange', ['/modules/purchase-requests', '/modules/rfqs', '/modules/supplier-quotes', '/modules/suppliers', '/modules/purchases', '/modules/purchase-invoices', '/modules/purchase-returns']),
  ...forPaths('gold', ['/modules/expenses', '/modules/money-accounts', '/modules/payments', '/modules/accounting', '/modules/chart-of-accounts', '/modules/tax-codes', '/modules/bank-reconciliation', '/modules/assets', '/modules/cost-centers', '/modules/budgets', '/modules/tax-documents', '/modules/reports', '/modules/recurring-invoices']),
});
export const MODULE_ACCENTS_BY_GROUP: Readonly<Record<string, ModuleAccentKey>> = Object.freeze({
  WORKSPACE:'navy',CRM:'emerald','CRM & GROWTH':'emerald',SELLING:'blue',INVENTORY:'cyan',LOGISTICS:'cyan',PROCUREMENT:'orange',FINANCE:'gold','PEOPLE & PAYROLL':'emerald','INTEGRATION & CONTROL':'cyan',INSIGHTS:'gold',ADMINISTRATION:'navy',MANUFACTURING:'cyan',
});
export function moduleAccentForPath(path: string): ModuleAccentKey {
  const pathname = path.split(/[?#]/, 1)[0]?.replace(new RegExp('/+$'), '') || '/';
  const exact = MODULE_ACCENTS_BY_PATH[pathname];
  if (exact) return exact;
  let matchedPath = '';
  let matchedAccent: ModuleAccentKey | undefined;
  for (const [configuredPath, accent] of Object.entries(MODULE_ACCENTS_BY_PATH)) {
    if (configuredPath === '/' || !pathname.startsWith(configuredPath + '/')) continue;
    if (configuredPath.length > matchedPath.length) {
      matchedPath = configuredPath;
      matchedAccent = accent;
    }
  }
  return matchedAccent ?? 'navy';
}
export function moduleAccentForGroup(group: string): ModuleAccentKey { return MODULE_ACCENTS_BY_GROUP[group.trim().toUpperCase()] ?? 'navy'; }
