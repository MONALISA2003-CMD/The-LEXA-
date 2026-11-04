/** Explicit LEXA module accent metadata; never inferred from URL substrings. */
export type ModuleAccentKey = 'navy' | 'blue' | 'cyan' | 'emerald' | 'gold' | 'orange' | 'coral' | 'violet' | 'volt' | 'bronze' | 'indigo' | 'teal' | 'sapphire' | 'mulberry' | 'industrial';
const forPaths = (accent: ModuleAccentKey, paths: string[]) => Object.fromEntries(paths.map((path) => [path, accent])) as Record<string, ModuleAccentKey>;
export const MODULE_ACCENTS_BY_PATH: Readonly<Record<string, ModuleAccentKey>> = Object.freeze({
  ...forPaths('navy', ['/', '/workspace', '/my-employment', '/business-setup', '/modules', '/modules/', '/team', '/settings', '/modules/team', '/operations']),
  ...forPaths('blue', ['/intelligence']),
  ...forPaths('gold', ['/reports', '/modules/reports']),
  ...forPaths('cyan', ['/business-tools']),
  ...forPaths('coral', ['/checkout', '/sales', '/modules/sales-orders', '/modules/sales-invoices', '/modules/quotations', '/modules/price-lists', '/modules/sales-returns']),
  ...forPaths('emerald', ['/modules/leads', '/modules/opportunities', '/modules/contacts', '/modules/campaigns', '/modules/sales-teams', '/modules/customers', ]),
  ...forPaths('volt', ['/products', '/inventory', '/modules/receiving', '/modules/stock-counts', '/modules/stock-transfers', '/modules/warehouses', '/modules/picklists', '/modules/item-bundles', '/modules/batches', '/modules/replenishment']),
  ...forPaths('industrial', ['/modules/work-orders', '/modules/boms', '/modules/job-cards', '/modules/quality']),
  ...forPaths('mulberry', ['/modules/employees', '/modules/attendance', '/modules/payroll', '/modules/leave', '/modules/timesheets']),
  ...forPaths('violet', ['/modules/deliveries', '/modules/packages']),
  ...forPaths('indigo', ['/modules/projects', '/modules/tasks']),
  ...forPaths('teal', ['/modules/support']),
  ...forPaths('bronze', ['/modules/purchase-requests', '/modules/rfqs', '/modules/supplier-quotes', '/modules/suppliers', '/modules/purchases', '/modules/purchase-invoices', '/modules/purchase-returns']),
  ...forPaths('sapphire', ['/modules/finance-overview', '/modules/finance-operations', '/modules/cash-sessions', '/modules/expenses', '/modules/money-accounts', '/modules/payments', '/modules/accounting', '/modules/chart-of-accounts', '/modules/tax-codes', '/modules/bank-reconciliation', '/modules/assets', '/modules/cost-centers', '/modules/budgets', '/modules/tax-documents', '/modules/recurring-invoices']),
});
export const MODULE_ACCENTS_BY_GROUP: Readonly<Record<string, ModuleAccentKey>> = Object.freeze({
  WORKSPACE:'navy','BUSINESS REPORTS & ADVICE':'gold','CUSTOMERS & GROWTH':'emerald','PURCHASING':'bronze','TEAM & PAYROLL':'mulberry','PRODUCTION & QUALITY':'industrial','PROJECTS & SERVICE':'indigo',CRM:'emerald','CRM & GROWTH':'emerald',SELLING:'coral',INVENTORY:'volt',LOGISTICS:'violet',PROCUREMENT:'bronze',FINANCE:'sapphire','PEOPLE & PAYROLL':'mulberry',INSIGHTS:'gold',ADMINISTRATION:'navy',MANUFACTURING:'industrial',
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
