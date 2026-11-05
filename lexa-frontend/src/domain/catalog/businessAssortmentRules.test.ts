import { describe, expect, it } from 'vitest';
import { ALL_EXISTING_PRODUCTS, resolveAssortment, visibleAssortment } from './businessAssortmentRules';

const specialties = [
  { code: 'fashion.boutique', industryCode: 'fashion_beauty', label: 'Clothing boutique', recommendedProductTypes: ['clothing', 'footwear'] },
  { code: 'beauty.fragrance_shop', industryCode: 'perfumes_cosmetics', label: 'Perfume shop', recommendedProductTypes: ['perfume', 'fragrance_oil'] },
  { code: 'mobile.handsets', industryCode: 'mobile_phones', label: 'Phones', recommendedProductTypes: ['smartphone'] },
];
const products = [
  { id: 'dress', type: 'clothing' },
  { id: 'perfume', type: 'perfume' },
  { id: 'phone', type: 'smartphone' },
  { id: 'old', type: 'retired_type' },
];

describe('owner-selected business assortments', () => {
  const policy = { industries: ['fashion_beauty', 'perfumes_cosmetics'], specialties, selectedSpecialtyCodes: ['fashion.boutique', 'beauty.fragrance_shop'] };
  it('defaults to every selected business, never the first selection', () => {
    const focus = resolveAssortment(policy, null);
    expect(focus.code).toBe('');
    expect(visibleAssortment(products, focus, item => item.type).map(item => item.id)).toEqual(['dress', 'perfume']);
  });
  it('narrows to a single selected specialty without granting unrelated access', () => {
    const focus = resolveAssortment(policy, 'fashion.boutique');
    expect(visibleAssortment(products, focus, item => item.type).map(item => item.id)).toEqual(['dress']);
  });
  it('does not accept a focus from an unselected specialty', () => {
    const focus = resolveAssortment(policy, 'mobile.handsets');
    expect(focus.code).toBe('');
    expect(visibleAssortment(products, focus, item => item.type)).toHaveLength(2);
  });
  it('explicitly allows searching existing items without deleting or mutating them', () => {
    const focus = resolveAssortment(policy, ALL_EXISTING_PRODUCTS);
    expect(visibleAssortment(products, focus, item => item.type)).toEqual(products);
  });
  it('uses enabled industry families for legacy accounts with no specialty selection', () => {
    const focus = resolveAssortment({ industries: ['fashion_beauty'], specialties, selectedSpecialtyCodes: [], allowedProductTypes: ['clothing', 'footwear', 'bag', 'general'] }, null);
    expect(focus.preferredProductTypes.has('clothing')).toBe(true);
    expect(focus.preferredProductTypes.has('smartphone')).toBe(false);
  });
});
