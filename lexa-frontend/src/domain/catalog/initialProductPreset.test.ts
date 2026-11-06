import { describe, expect, it } from 'vitest';
import { initialProductPreset, validateProductDraft, presetFor } from './industryCatalog';

describe('new product defaults', () => {
  it('starts a business with no selected industry on a valid generic product', () => {
    const preset = initialProductPreset([], []);
    expect(preset.key).toBe('general');
    expect(preset.stock).toBeDefined();
    expect(validateProductDraft(preset.key, {}, { trackStock: true, trackLot: false, trackSerial: false }, [])).toEqual([]);
  });

  it('keeps the approved general template available as a fallback', () => {
    expect(initialProductPreset([], ['unknown-specialty']).key).toBe('general');
    expect(presetFor('general').key).toBe('general');
  });

  it('can still prefer a configured industry-specific template', () => {
    const preset = initialProductPreset(['mobile_phones'], []);
    expect(preset.key).not.toBe('general');
    expect(preset.industries).toContain('mobile_phones');
  });
});
