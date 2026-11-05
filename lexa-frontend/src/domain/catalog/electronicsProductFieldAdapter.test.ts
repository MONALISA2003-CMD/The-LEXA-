import { describe, expect, it } from 'vitest';
import { ELECTRONICS_V2_CONTRACT } from './electronics-catalogue-v2.generated';
import { productFieldsForFamily, mergeProductFields } from './electronicsProductFieldAdapter';
import type { ProductField } from './industryCatalog';

describe('Published electronics product fields', () => {
  it('keeps optional properties absent under strict TypeScript settings', () => {
    const policy = ELECTRONICS_V2_CONTRACT.families.find(family => family.code === 'smartphone');
    if (!policy) throw new Error('Smartphone product policy is missing.');
    const fields = productFieldsForFamily({ ...policy, enabled: true });
    const model = fields.find(field => field.key === 'model');
    const network = fields.find(field => field.key === 'networkGeneration');
    expect(model).toEqual({ key: 'model', label: 'Model', kind: 'text', required: true });
    expect(Object.hasOwn(model ?? {}, 'options')).toBe(false);
    expect(network).toMatchObject({ kind: 'select', options: ['2g', '3g', '4g', '5g'] });
    expect(fields.find(field => field.key === 'storageGb')?.label).toBe('Storage Gb (GB)');
  });

  it('merges immutable published and custom fields without duplicate keys', () => {
    const base: readonly ProductField[] = Object.freeze([
      Object.freeze({ key: 'model', label: 'Model', required: true }),
    ]);
    const custom: readonly ProductField[] = [
      { key: 'model', label: 'Overridden model' },
      { key: 'shelfLocation', label: 'Shelf location' },
    ];
    expect(mergeProductFields(base, custom)).toEqual([
      { key: 'model', label: 'Model', required: true },
      { key: 'shelfLocation', label: 'Shelf location' },
    ]);
    expect(base).toHaveLength(1);
  });
});
