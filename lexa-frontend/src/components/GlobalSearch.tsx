import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Search, X } from 'lucide-react';
import { useWorkspace } from '../app/WorkspaceContext';
import { isApiProvider } from '../data/remote/runtimeConfig';
import { apiGlobalSearch } from '../data/remote/apiGlobalSearch';

export default function GlobalSearch() {
  const { workspace, branch } = useWorkspace();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const clean = query.trim();
  const searchQuery = useQuery({ queryKey: ['global-search', workspace.id, branch.id, clean], queryFn: () => apiGlobalSearch.search(workspace.id, branch.id, clean), enabled: isApiProvider && clean.length >= 2, staleTime: 15_000, retry: false });
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen(true); document.getElementById('lexa-global-search')?.focus(); } }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, []);
  function selectResult(href: string) { setOpen(false); setQuery(''); navigate(href); }
  return <div className="lexa-global-search"><label className="lexa-global-search-field"><Search size={16}/><span className="sr-only">Search all business records</span><input id="lexa-global-search" value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === 'Enter' && searchQuery.data?.[0]) selectResult(searchQuery.data[0].href); }} placeholder="Search records, SKUs, receipts…" autoComplete="off"/><kbd>Ctrl K</kbd>{query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(''); setOpen(true); }}><X size={14}/></button>}</label>
    {open && (clean.length > 0) && <><button type="button" className="lexa-search-dismiss" aria-label="Close search results" onClick={() => setOpen(false)}/><section className="lexa-global-search-results" aria-label="Global search results"><div className="lexa-global-search-results-title"><span>Search results</span><button onClick={() => setOpen(false)} aria-label="Close search results"><X size={14}/></button></div>
      {!isApiProvider ? <div className="lexa-global-search-state">Global search across workspaces requires the backend search endpoint. Local mode is not indexed across all modules.</div> : clean.length < 2 ? <div className="lexa-global-search-state">Type at least two characters to search authorized records.</div> : searchQuery.isLoading ? <div className="lexa-global-search-state">Searching authorized business records…</div> : searchQuery.isError ? <div className="lexa-global-search-state">Search is unavailable. {searchQuery.error instanceof Error ? searchQuery.error.message : 'Check the backend connection.'}</div> : !(searchQuery.data ?? []).length ? <div className="lexa-global-search-state">No matching records found.</div> : <div className="lexa-global-search-list">{searchQuery.data?.map((result) => <button key={`${result.type}-${result.id}`} onClick={() => selectResult(result.href)}><span className="lexa-search-result-kind">{result.type.replaceAll('_', ' ')}</span><span className="lexa-search-result-main"><strong>{result.label}</strong><small>{result.description || result.reference || 'Open record'}</small></span><ArrowUpRight size={15}/></button>)}</div>}
      <div className="lexa-global-search-footnote">Results must be filtered by your workspace, branch and permissions on the server.</div></section></>}
  </div>;
}
