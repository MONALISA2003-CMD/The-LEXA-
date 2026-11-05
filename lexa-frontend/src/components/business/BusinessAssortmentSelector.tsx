import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiCatalogInventory } from '../../data/remote/apiWorkstream03';
import { dataProviderMode } from '../../data/remote/runtimeConfig';
import './business-assortment.css';

const FOCUS_CHANGED = 'lexa:business-assortment-changed';
const sessionKey = (workspaceId: string) => `lexa:business-assortment:${workspaceId}`;

function savedFocus(workspaceId: string): string | null {
  try { return window.sessionStorage.getItem(sessionKey(workspaceId)); } catch { return null; }
}

/** A staff member's focus is presentation-only; it is not a tenant permission. */
export function useBusinessAssortment(workspaceId: string) {
  const [stored, setStored] = useState<string | null>(() => savedFocus(workspaceId));
  const config = useQuery({
    queryKey: ['industry-catalogue', workspaceId],
    queryFn: () => apiCatalogInventory.industryConfig(workspaceId),
    enabled: dataProviderMode === 'api',
    staleTime: 120_000,
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
  // Legacy businesses without specialties have no forced activity filter.
  const selectedCode = stored === null ? (enabledSpecialties[0]?.code ?? '') : stored;
  const focus = enabledSpecialties.find(item => item.code === selectedCode) ?? null;
  const preferred = useMemo(() => new Set(focus?.recommendedProductTypes ?? []), [focus]);

  const setFocus = (code: string) => {
    if (code && !enabledSpecialties.some(item => item.code === code)) return;
    try { window.sessionStorage.setItem(sessionKey(workspaceId), code); } catch { /* Viewing still works if storage is disabled. */ }
    setStored(code);
    window.dispatchEvent(new Event(FOCUS_CHANGED));
  };
  /** Preferred items appear first. Existing authorised products are never hidden or made unsellable. */
  function prioritise<T>(items: readonly T[], productType: (item: T) => string | null | undefined): T[] {
    if (!focus) return [...items];
    return items.map((item, index) => ({ item, index, rank: preferred.has(productType(item) ?? '') ? 0 : 1 }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index).map(row => row.item);
  }
  return { config, enabledSpecialties, selectedCode: focus ? focus.code : '', focus, setFocus, prioritise };
}

export function BusinessAssortmentSelector({ workspaceId, context }: { workspaceId: string; context: 'products' | 'purchasing' | 'inventory' | 'checkout' | 'finance' }) {
  const { enabledSpecialties, selectedCode, setFocus, focus } = useBusinessAssortment(workspaceId);
  if (!enabledSpecialties.length) return null;
  return <section className="lexa-assortment" aria-label="Business product focus">
    <label htmlFor={`lexa-assortment-${context}`}>Business focus</label>
    <select id={`lexa-assortment-${context}`} value={selectedCode} onChange={event => setFocus(event.target.value)}>
      <option value="">Entire catalogue</option>
      {enabledSpecialties.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
    </select>
    <small>{context === 'finance'
      ? 'Accounting totals remain consolidated. Reporting by activity requires separately attributed transactions.'
      : focus ? `Showing ${focus.label.toLowerCase()} first. Other authorised products remain searchable.` : 'All authorised products remain available.'}</small>
  </section>;
}
