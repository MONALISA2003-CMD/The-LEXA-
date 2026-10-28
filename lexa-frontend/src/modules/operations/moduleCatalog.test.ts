import { describe, expect, it } from 'vitest';
import { EXISTING_MODULE_LINKS, MODULE_CATALOG, PHASE_TWO_LINKS, getModuleDefinition } from './moduleCatalog';

describe('LEXA Phase 2 module map', () => {
  it('has unique module IDs and unique form field keys within each module', () => {
    const ids = MODULE_CATALOG.map((module) => module.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const module of MODULE_CATALOG) {
      const keys = module.fields.map((field) => field.key);
      expect(new Set(keys).size, `${module.id} has duplicate form fields`).toBe(keys.length);
      if (module.readOnly) expect(module.fields).toHaveLength(0);
      else expect(module.fields.length, `${module.id} has no data-entry fields`).toBeGreaterThan(0);
      expect(module.columns.length, `${module.id} has no register columns`).toBeGreaterThan(0);
      expect(module.initial.every((record) => Boolean(record.id && record.status && record.updatedAt))).toBe(true);
    }
  });

  it('resolves every module-directory link to a registered route or the report centre', () => {
    for (const link of PHASE_TWO_LINKS) {
      const id = link.to.split('/').filter(Boolean).at(-1);
      if (id === 'reports') expect(link.to).toBe('/modules/reports');
      else expect(getModuleDefinition(id)).toBeDefined();
    }
    expect(EXISTING_MODULE_LINKS.length).toBeGreaterThan(0);
  });
});
