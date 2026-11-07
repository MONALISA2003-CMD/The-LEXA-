import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ClipboardCheck, RefreshCw } from '../../components/LexaIcon';
import { useWorkspace } from '../../app/WorkspaceContext';
import { isApiProvider } from '../../data/remote/runtimeConfig';
import { apiOperationalAdvice, type OperationalArea } from '../../data/remote/apiOperationalAdvice';
import './operational-work-queue.css';

type Props = { areas?: readonly OperationalArea[]; compact?: boolean; maxItems?: number };
const AREA_LABELS: Record<OperationalArea, string> = {
  inventory: 'Inventory', purchasing: 'Purchasing', finance: 'Finance',
  sales: 'Sales', fulfilment: 'Delivery', production: 'Production',
};
/** A read-only work list. Actual operations take place in the destination module with normal approval controls. */
export default function OperationalWorkQueue({ areas, compact = false, maxItems = 8 }: Props) {
  const {workspace, branch} = useWorkspace();
  const [selectedArea, setSelectedArea] = useState<OperationalArea | ''>('');
  const query = useQuery({
    queryKey: ['operational-advice', workspace.id, branch.id],
    queryFn: ({signal}) => apiOperationalAdvice.list(workspace.id, branch.id, signal),
    enabled: isApiProvider,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const items = useMemo(() => (query.data?.items ?? []).filter(item =>
    (!areas || areas.includes(item.area)) && (!selectedArea || item.area === selectedArea)), [query.data, areas, selectedArea]);
  const availableAreas = useMemo(() => [...new Set((query.data?.items ?? []).filter(item => !areas || areas.includes(item.area)).map(item => item.area))], [query.data, areas]);
  if (!isApiProvider) return null;
  return <section className={`lexa-work-queue section-card${compact ? ' lexa-work-queue-compact' : ''}`} aria-labelledby={`operational-work-title-${compact ? 'small' : 'full'}`}>
    <header className="lexa-work-queue-heading">
      <div><h3 id={`operational-work-title-${compact ? 'small' : 'full'}`}>Today's work</h3>
        <p>Reviews drawn from recorded stock, orders, invoices and deliveries.</p></div>
      <button type="button" className="button button-secondary button-small" onClick={() => void query.refetch()} disabled={query.isFetching} aria-label="Refresh today's work"><RefreshCw size={15}/><span>Refresh</span></button>
    </header>
    {query.isLoading && <p role="status" className="lexa-work-queue-state">Checking records requiring attention…</p>}
    {query.isError && <p role="alert" className="lexa-work-queue-state">Today's work could not be loaded. Your existing records are unaffected. Use Refresh to try again.</p>}
    {query.data && <>
      {availableAreas.length > 1 && !areas && <label className="lexa-work-queue-filter">Business area
        <select value={selectedArea} onChange={event => setSelectedArea(event.target.value as OperationalArea | '')}>
          <option value="">All areas</option>{availableAreas.map(area => <option key={area} value={area}>{AREA_LABELS[area]}</option>)}
        </select></label>}
      {!items.length && <div className="lexa-work-queue-empty"><ClipboardCheck size={21}/><span>No items were flagged by the checks available to your role.</span></div>}
      {!!items.length && <div className="lexa-work-queue-list">{items.slice(0, maxItems).map(item => <article className="lexa-work-queue-item" key={item.id}>
        <span className={`lexa-work-priority lexa-work-priority-${item.priority}`}>{item.priority}</span>
        <div className="lexa-work-queue-content"><strong>{item.title}</strong><p>{item.detail}</p>
          <small>{AREA_LABELS[item.area]} · {item.count} recorded · Rule-based review</small></div>
        <Link to={item.href} aria-label={`${item.actionLabel}: ${item.title}`}>{item.actionLabel}<ArrowRight size={15}/></Link>
      </article>)}</div>}
      <footer className="lexa-work-queue-footer"><span>Checked {new Date(query.data.generatedAt).toLocaleString()}</span><span>Suggestions do not change stock or accounts.</span></footer>
    </>}
  </section>;
}
