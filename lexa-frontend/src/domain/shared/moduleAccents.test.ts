import { describe, expect, it } from 'vitest';
import { EXISTING_MODULE_LINKS, MODULE_CATALOG, PHASE_TWO_LINKS } from '../../modules/operations/moduleCatalog';
import { MODULE_ACCENTS_BY_PATH, moduleAccentForGroup, moduleAccentForPath, type ModuleAccentKey } from './moduleAccents';
const allowed: ModuleAccentKey[] = ['navy','blue','cyan','emerald','gold','orange','coral','violet','volt','bronze','indigo','teal','sapphire','mulberry','industrial'];
describe('LEXA module accents', () => {
  it('covers every business navigation link', () => { for (const link of [...EXISTING_MODULE_LINKS, ...PHASE_TWO_LINKS]) expect(MODULE_ACCENTS_BY_PATH[link.to], link.to).toBeDefined(); });
  it('covers account protection routes explicitly', () => { for (const route of ['/settings/security', '/settings/privacy']) { expect(MODULE_ACCENTS_BY_PATH[route], route).toBe('navy'); expect(moduleAccentForPath(route)).toBe('navy'); } });
  it('covers every operational catalogue module', () => { for (const module of MODULE_CATALOG) expect(MODULE_ACCENTS_BY_PATH['/modules/' + module.id], module.id).toBeDefined(); });
  it('ships operational modules without preloaded demo records', () => { for (const module of MODULE_CATALOG) expect(module.initial, module.id).toEqual([]); });
  it('uses only approved accents', () => { for (const [path, accent] of Object.entries(MODULE_ACCENTS_BY_PATH)) expect(allowed, path).toContain(accent); });
  it('assigns semantic colours to representative families', () => { expect(moduleAccentForPath('/checkout')).toBe('coral'); expect(moduleAccentForPath('/modules/receiving')).toBe('volt'); expect(moduleAccentForPath('/modules/purchases')).toBe('bronze'); expect(moduleAccentForPath('/modules/projects')).toBe('indigo'); expect(moduleAccentForPath('/modules/tasks')).toBe('indigo'); expect(moduleAccentForPath('/modules/support')).toBe('indigo'); expect(moduleAccentForPath('/modules/accounting')).toBe('sapphire'); expect(moduleAccentForPath('/modules/leads')).toBe('emerald'); expect(moduleAccentForPath('/modules/recurring-invoices')).toBe('sapphire'); expect(moduleAccentForPath('/business-tools')).toBe('navy'); });
  it('keeps manufacturing registers in the industrial module family', () => { expect(moduleAccentForPath('/modules/boms')).toBe('industrial'); expect(moduleAccentForPath('/modules/job-cards')).toBe('industrial'); expect(moduleAccentForGroup('MANUFACTURING')).toBe('industrial'); });
  it('normalises and carries module accents into nested routes', () => { expect(moduleAccentForPath('/modules/purchases/PO-2026-001')).toBe('bronze'); expect(moduleAccentForPath('/modules/reports/monthly?period=month')).toBe('gold'); expect(moduleAccentForPath('/products/sku-1/')).toBe('volt'); expect(moduleAccentForPath('/checkout?mode=quick')).toBe('coral'); expect(moduleAccentForPath('/modules/not-real/detail')).toBe('navy'); });
  it('uses explicit group metadata and a safe default', () => { expect(moduleAccentForGroup('CRM & GROWTH')).toBe('emerald'); expect(moduleAccentForGroup('CRM')).toBe('emerald'); expect(moduleAccentForGroup('MANUFACTURING')).toBe('industrial'); expect(moduleAccentForGroup('PROCUREMENT')).toBe('bronze'); expect(moduleAccentForGroup('FINANCE')).toBe('sapphire'); expect(moduleAccentForGroup('unknown group')).toBe('navy'); expect(moduleAccentForPath('/modules/not-real')).toBe('navy'); expect(moduleAccentForPath('/operations')).toBe('navy'); expect(moduleAccentForPath('/intelligence')).toBe('gold'); expect(moduleAccentForPath('/reports')).toBe('gold'); });
  it('keeps every department route on its own group colour, including every finance module', () => {
    const groups: ReadonlyArray<readonly [string, ModuleAccentKey, readonly string[]]> = [
      ['WORKSPACE', 'navy', ['/', '/workspace', '/business-setup', '/settings', '/team']],
      ['BUSINESS REPORTS & ADVICE', 'gold', ['/reports', '/intelligence']],
      ['CUSTOMERS & GROWTH', 'emerald', ['/modules/customers', '/modules/leads', '/modules/opportunities', '/modules/contacts', '/modules/campaigns', '/modules/sales-teams']],
      ['SELLING', 'coral', ['/checkout', '/sales', '/modules/sales-orders', '/modules/sales-invoices', '/modules/sales-returns', '/modules/quotations', '/modules/price-lists']],
      ['INVENTORY', 'volt', ['/products', '/inventory', '/modules/receiving', '/modules/stock-counts', '/modules/batches', '/modules/replenishment', '/modules/stock-transfers', '/modules/warehouses', '/modules/picklists', '/modules/item-bundles']],
      ['LOGISTICS', 'violet', ['/modules/deliveries', '/modules/packages']],
      ['PURCHASING', 'bronze', ['/modules/purchase-requests', '/modules/rfqs', '/modules/supplier-quotes', '/modules/suppliers', '/modules/purchases', '/modules/purchase-returns', '/modules/purchase-invoices']],
      ['FINANCE', 'sapphire', ['/modules/finance-overview', '/modules/finance-operations', '/modules/expenses', '/modules/cash-sessions', '/modules/money-accounts', '/modules/payments', '/modules/accounting', '/modules/chart-of-accounts', '/modules/tax-codes', '/modules/bank-reconciliation', '/modules/assets', '/modules/cost-centers', '/modules/budgets', '/modules/recurring-invoices', '/modules/tax-documents']],
      ['TEAM & PAYROLL', 'mulberry', ['/modules/employees', '/modules/attendance', '/modules/shifts', '/modules/leave', '/modules/timesheets', '/modules/payroll']],
      ['PRODUCTION & QUALITY', 'industrial', ['/modules/work-orders', '/modules/boms', '/modules/job-cards', '/modules/quality']],
      ['PROJECTS & SERVICE', 'indigo', ['/modules/projects', '/modules/tasks', '/modules/support']],
    ];
    expect(groups).toHaveLength(11);
    for (const [group, expected, paths] of groups) {
      expect(moduleAccentForGroup(group), group).toBe(expected);
      for (const path of paths) {
        expect(moduleAccentForPath(path), path).toBe(expected);
        expect(moduleAccentForPath(`${path === '/' ? '' : path}/record-1?view=detail`), path).toBe(expected);
      }
    }
  });

});
