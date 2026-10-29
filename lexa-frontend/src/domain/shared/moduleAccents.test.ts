import { describe, expect, it } from 'vitest';
import { EXISTING_MODULE_LINKS, MODULE_CATALOG, PHASE_TWO_LINKS } from '../../modules/operations/moduleCatalog';
import { MODULE_ACCENTS_BY_PATH, moduleAccentForGroup, moduleAccentForPath, type ModuleAccentKey } from './moduleAccents';
const allowed: ModuleAccentKey[] = ['navy','blue','cyan','emerald','gold','orange'];
describe('LEXA module accents', () => {
  it('covers every existing and Phase 2 directory link', () => { for (const link of [...EXISTING_MODULE_LINKS, ...PHASE_TWO_LINKS]) expect(MODULE_ACCENTS_BY_PATH[link.to], link.to).toBeDefined(); });
  it('covers every operational catalogue module', () => { for (const module of MODULE_CATALOG) expect(MODULE_ACCENTS_BY_PATH['/modules/' + module.id], module.id).toBeDefined(); });
  it('uses only approved accents', () => { for (const [path, accent] of Object.entries(MODULE_ACCENTS_BY_PATH)) expect(allowed, path).toContain(accent); });
  it('assigns semantic colours to representative families', () => { expect(moduleAccentForPath('/checkout')).toBe('blue'); expect(moduleAccentForPath('/modules/receiving')).toBe('cyan'); expect(moduleAccentForPath('/modules/purchases')).toBe('orange'); expect(moduleAccentForPath('/modules/accounting')).toBe('gold'); expect(moduleAccentForPath('/modules/leads')).toBe('emerald'); expect(moduleAccentForPath('/modules/recurring-invoices')).toBe('gold'); expect(moduleAccentForPath('/business-tools')).toBe('cyan'); });
  it('keeps manufacturing registers in the cyan module family', () => { expect(moduleAccentForPath('/modules/boms')).toBe('cyan'); expect(moduleAccentForPath('/modules/job-cards')).toBe('cyan'); expect(moduleAccentForGroup('MANUFACTURING')).toBe('cyan'); });
  it('uses explicit group metadata and a safe default', () => { expect(moduleAccentForGroup('CRM & GROWTH')).toBe('emerald'); expect(moduleAccentForGroup('CRM')).toBe('emerald'); expect(moduleAccentForGroup('MANUFACTURING')).toBe('cyan'); expect(moduleAccentForGroup('PROCUREMENT')).toBe('orange'); expect(moduleAccentForGroup('FINANCE')).toBe('gold'); expect(moduleAccentForGroup('INTEGRATION & CONTROL')).toBe('cyan'); expect(moduleAccentForGroup('unknown group')).toBe('navy'); expect(moduleAccentForPath('/modules/not-real')).toBe('navy'); });
});
