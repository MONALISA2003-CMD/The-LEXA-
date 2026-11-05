/** A merchandising preference never grants permission to read or modify records.
 * It only controls the first view of the catalogue; the user's existing
 * permissions and the server's product policy still apply to every request.
 */
export const ALL_EXISTING_PRODUCTS = '__all_existing_products__';

export type AssortmentSpecialty = {
  code: string;
  industryCode: string;
  label: string;
  recommendedProductTypes: readonly string[];
};

export type AssortmentPolicy = {
  industries: readonly string[];
  specialties: readonly AssortmentSpecialty[];
  selectedSpecialtyCodes: readonly string[];
  allowedProductTypes?: readonly string[];
  productTypesByIndustry?: Readonly<Record<string, readonly string[]>>;
};

export type AssortmentSelection = {
  code: string;
  /** True only for an explicit request to review all authorized records. */
  allExisting: boolean;
  preferredProductTypes: ReadonlySet<string>;
  visibleIndustries: readonly string[];
};

/** Defaults to the UNION of the owner's selected businesses, never the first. */
export function resolveAssortment(policy: AssortmentPolicy, requestedCode: string | null): AssortmentSelection {
  const enabled = policy.specialties.filter(item => policy.selectedSpecialtyCodes.includes(item.code) && policy.industries.includes(item.industryCode));
  const focused = enabled.find(item => item.code === requestedCode);
  const allExisting = requestedCode === ALL_EXISTING_PRODUCTS;
  const current = focused ? [focused] : enabled;
  const codes = new Set(current.flatMap(item => [...item.recommendedProductTypes]));
  const selectedIndustries = new Set(current.map(item => item.industryCode));
  // A mixed business may omit specialties for one of its industries. Keep the
  // published families of that industry in the default view.
  const uncoveredIndustries = policy.industries.filter(industry => !selectedIndustries.has(industry));
  if (!focused) for (const industry of uncoveredIndustries) {
    for (const type of policy.productTypesByIndustry?.[industry] ?? []) codes.add(type);
  }
  if (enabled.length === 0 && policy.allowedProductTypes) {
    for (const type of policy.allowedProductTypes) codes.add(type);
  }
  codes.add('general');
  return {
    code: allExisting ? ALL_EXISTING_PRODUCTS : focused?.code ?? '',
    allExisting,
    preferredProductTypes: codes,
    visibleIndustries: focused ? [focused.industryCode] : policy.industries,
  };
}

/** Only applied to *display lists*. Never use this for transactions or auth. */
export function visibleAssortment<T>(items: readonly T[], selection: AssortmentSelection, getType: (item: T) => string | null | undefined): T[] {
  if (selection.allExisting || selection.preferredProductTypes.size === 0) return [...items];
  return items.filter(item => selection.preferredProductTypes.has(getType(item) ?? 'general'));
}

