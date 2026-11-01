import { apiClient } from './apiClient';
const enc = (value: string) => encodeURIComponent(value);
export interface GlobalSearchResult { id: string; type: string; label: string; description?: string; href: string; reference?: string; }
export const apiGlobalSearch = {
  async search(workspaceId: string, branchId: string, query: string): Promise<GlobalSearchResult[]> {
    const result = await apiClient.get<unknown>(`/workspaces/${enc(workspaceId)}/search`, { branchId, q: query.trim(), limit: 20 });
    const items = Array.isArray(result) ? result : result && typeof result === 'object' && Array.isArray((result as { items?: unknown }).items) ? (result as { items: unknown[] }).items : null;
    if (!items) throw new Error('The backend returned an invalid global search result.');
    for (const item of items) if (!item || typeof item !== 'object' || typeof (item as GlobalSearchResult).id !== 'string' || typeof (item as GlobalSearchResult).label !== 'string' || typeof (item as GlobalSearchResult).href !== 'string') throw new Error('Global search returned a result without its required identifier, label or destination.'); else { const href = (item as GlobalSearchResult).href; if (!href.startsWith('/') || href.startsWith('//') || href.includes('\\')) throw new Error('Global search returned an unsafe destination. The backend must return an internal LEXA route.'); }
    return items as GlobalSearchResult[];
  },
};
