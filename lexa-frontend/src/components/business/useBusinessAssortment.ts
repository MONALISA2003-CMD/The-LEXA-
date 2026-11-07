import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiCatalogInventory } from '../../data/remote/apiWorkstream03';
import { dataProviderMode } from '../../data/remote/runtimeConfig';
import { ALL_EXISTING_PRODUCTS, resolveAssortment } from '../../domain/catalog/businessAssortmentRules';

/** All authorized products remain visible. Business type config still drives product fields and defaults.
 * The old 'Working with' selector is deliberately removed, including its hidden saved filter.
 */
export function useBusinessAssortment(workspaceId: string) {
  const config = useQuery({
    queryKey: ['industry-catalogue', workspaceId],
    queryFn: () => apiCatalogInventory.industryConfig(workspaceId),
    enabled: dataProviderMode === 'api' && Boolean(workspaceId),
    staleTime: 30_000,
    retry: 1,
  });
  const selection = useMemo(() => resolveAssortment({
    industries: config.data?.industries ?? [],
    specialties: config.data?.availableSpecialties ?? [],
    selectedSpecialtyCodes: config.data?.subActivityCodes ?? [],
    allowedProductTypes: Object.keys(config.data?.productPolicies ?? {}),
    productTypesByIndustry: Object.fromEntries((config.data?.industries ?? []).map(industry => [industry,
      Object.entries(config.data?.productPolicies ?? {}).filter(([,policy]) =>
        Array.isArray((policy as {industries?:unknown}).industries) &&
        (policy as {industries:string[]}).industries.includes(industry)).map(([code]) => code)])),
  }, ALL_EXISTING_PRODUCTS), [config.data]);
  function filter<T>(items: readonly T[], _productType: (item:T) => string | null | undefined): T[] { return [...items]; }
  function prioritise<T>(items: readonly T[], productType: (item:T)=> string | null | undefined): T[] {
    const preferred = selection.preferredProductTypes;
    return items.map((item,index)=>({item,index,rank:preferred.has(productType(item)??'general')?0:1}))
      .sort((a,b)=>a.rank-b.rank||a.index-b.index).map(row=>row.item);
  }
  return {
    config, focus: null as { code: string } | null, selectedCode: selection.code,
    enabledSpecialties: config.data?.availableSpecialties ?? [],
    filter, prioritise, allExisting:true, visibleIndustries:selection.visibleIndustries,
    preferredProductTypes:selection.preferredProductTypes,
  };
}
