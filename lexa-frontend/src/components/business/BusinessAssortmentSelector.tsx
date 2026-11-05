import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { apiCatalogInventory } from '../../data/remote/apiWorkstream03';
import { dataProviderMode } from '../../data/remote/runtimeConfig';
import { ALL_EXISTING_PRODUCTS, resolveAssortment, visibleAssortment } from '../../domain/catalog/businessAssortmentRules';
import './business-assortment.css';

const FOCUS_CHANGED = 'lexa:business-assortment-changed';
const sessionKey = (workspaceId: string) => `lexa:business-assortment:${workspaceId}`;

function savedFocus(workspaceId: string): string | null {
  try { return window.sessionStorage.getItem(sessionKey(workspaceId)); } catch { return null; }
}

/** All components use the same owner-selected context, even when a staff member
 * changes pages. The setting is only a view preference and cannot authorize API
 * requests or change stock, posted invoices or historical receipts.
 */
export function useBusinessAssortment(workspaceId: string) {
  const [stored, setStored] = useState<string | null>(() => savedFocus(workspaceId));
  const config = useQuery({
    queryKey: ['industry-catalogue', workspaceId],
    queryFn: () => apiCatalogInventory.industryConfig(workspaceId),
    enabled: dataProviderMode === 'api' && Boolean(workspaceId),
    staleTime: 30_000,
    retry: 1,
  });
  useEffect(() => {
    const update = () => setStored(savedFocus(workspaceId));
    update();
    window.addEventListener(FOCUS_CHANGED, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(FOCUS_CHANGED, update);
      window.removeEventListener('storage', update);
    };
  }, [workspaceId]);

  const enabledSpecialties = useMemo(() => {
    const available = config.data?.availableSpecialties ?? [];
    const selected = new Set(config.data?.subActivityCodes ?? []);
    return available.filter(item => selected.has(item.code));
  }, [config.data?.availableSpecialties, config.data?.subActivityCodes]);

  const selection = useMemo(() => resolveAssortment({
    industries: config.data?.industries ?? [],
    specialties: config.data?.availableSpecialties ?? [],
    selectedSpecialtyCodes: config.data?.subActivityCodes ?? [],
    allowedProductTypes: Object.keys(config.data?.productPolicies ?? {}),
    productTypesByIndustry: Object.fromEntries((config.data?.industries ?? []).map(industry => [industry,
      Object.entries(config.data?.productPolicies ?? {}).filter(([, policy]) =>
        Array.isArray((policy as {industries?:unknown}).industries) &&
        ((policy as {industries:string[]}).industries).includes(industry)).map(([code]) => code)])),
  }, stored), [config.data, stored]);

  const focus = enabledSpecialties.find(item => item.code === selection.code) ?? null;
  const setFocus = (code: string) => {
    if (code && code !== ALL_EXISTING_PRODUCTS && !enabledSpecialties.some(item => item.code === code)) return;
    try { window.sessionStorage.setItem(sessionKey(workspaceId), code); } catch { /* Preferences must not block business activity. */ }
    setStored(code);
    window.dispatchEvent(new Event(FOCUS_CHANGED));
  };
  function filter<T>(items: readonly T[], productType: (item: T) => string | null | undefined): T[] {
    // If the account configuration cannot be loaded, do not misrepresent the
    // missing projection as an empty business or conceal existing transactions.
    return !config.data ? [...items] : visibleAssortment(items, selection, productType);
  }
  function prioritise<T>(items: readonly T[], productType: (item: T) => string | null | undefined): T[] {
    if (!config.data) return [...items];
    const preferred = selection.preferredProductTypes;
    return items.map((item, index) => ({ item, index, rank: preferred.has(productType(item) ?? 'general') ? 0 : 1 }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index).map(row => row.item);
  }
  return {
    config, enabledSpecialties, selectedCode: selection.code, focus, setFocus,
    filter, prioritise, allExisting: selection.allExisting, visibleIndustries: selection.visibleIndustries,
    preferredProductTypes: selection.preferredProductTypes,
  };
}

export function BusinessAssortmentSelector({ workspaceId, context }: { workspaceId: string; context: 'workspace' | 'products' | 'purchasing' | 'inventory' | 'checkout' | 'finance' }) {
  const { config, enabledSpecialties, selectedCode, setFocus, focus, allExisting } = useBusinessAssortment(workspaceId);
  if (dataProviderMode !== 'api') return null;
  if (config.isLoading) return <span className="lexa-assortment-status">Loading business activities…</span>;
  if (config.isError) return <span className="lexa-assortment-status" role="status">Business activities could not be loaded. <Link to="/business-setup">Review setup</Link></span>;
  if (!config.data?.industries.length) return null;
  return <section className="lexa-assortment" aria-label="Selected business activities">
    <label htmlFor={`lexa-assortment-${context}`}>Working with</label>
    <select id={`lexa-assortment-${context}`} value={selectedCode} onChange={event => setFocus(event.target.value)}>
      <option value="">All selected businesses</option>
      {enabledSpecialties.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
      <option value={ALL_EXISTING_PRODUCTS}>Search all existing products</option>
    </select>
    <small>{context === 'finance'
      ? 'Financial totals include all activities. Division reports use posted transaction assignments.'
      : allExisting ? 'All authorized products are visible, including historical items.'
      : focus ? `${focus.label} products appear here. Other records are available through search.`
      : enabledSpecialties.length > 1 ? `${enabledSpecialties.length} selected specialties. Only their products are shown here.`
      : 'Products relevant to your selected businesses are shown here.'}</small>
  </section>;
}
