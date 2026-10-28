import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, ReceiptText, Search } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { sales } from '../../data/repositories';
import { formatMinorAmount } from '../../domain/money/money';

export default function SalesPage() {
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const salesQuery = useQuery({ queryKey: ['sales', workspace.id], queryFn: () => sales.list({ workspaceId: workspace.id, limit: 500 }) });
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (salesQuery.data ?? []).filter((sale) => !needle || sale.receiptNumber.toLocaleLowerCase().includes(needle) || sale.customerName?.toLocaleLowerCase().includes(needle));
  }, [salesQuery.data, search]);
  const totalSales = (salesQuery.data ?? []).reduce((sum, sale) => sum + sale.totalMinor, 0);

  return (
    <div className="page-stack">
      <div className="page-heading-row"><div><div className="eyebrow eyebrow-blue">TRANSACTION HISTORY</div><h2>Sales & receipts</h2><p>Every sale links to the items, recorded payments, stock movements and any returns.</p></div><button className="button button-primary" onClick={() => navigate('/checkout')}><ReceiptText size={17} /> New sale</button></div>
      <div className="metric-strip three-metrics"><div className="mini-metric"><span>Completed sales</span><strong>{salesQuery.data?.length ?? '—'}</strong><small>Recorded locally</small></div><div className="mini-metric"><span>Gross sale value</span><strong>{formatMinorAmount(totalSales, workspace.currency)}</strong><small>Before recorded returns</small></div><div className="mini-metric"><span>Latest receipt</span><strong className="metric-receipt">{salesQuery.data?.[0]?.receiptNumber ?? '—'}</strong><small>Most recent saved sale</small></div></div>
      <section className="section-card table-card"><div className="table-toolbar"><div><h3>Sales history</h3><p>{filtered.length} matching {filtered.length === 1 ? 'sale' : 'sales'}</p></div><label className="search-field"><Search size={16} /><input aria-label="Search sales" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search receipt or customer" /></label></div>
        {salesQuery.isLoading ? <div className="loading-state">Loading sales…</div> : filtered.length === 0 ? <div className="empty-state"><div className="empty-icon"><ReceiptText size={22} /></div><h3>{search ? 'No matching sales' : 'No sales have been recorded'}</h3><p>{search ? 'Try searching by the receipt number or customer name.' : 'Your completed sales will appear here together with their receipt details and payment records.'}</p>{!search && <button className="button button-primary" onClick={() => navigate('/checkout')}>Start a sale <ArrowUpRight size={16} /></button>}</div> : <div className="responsive-table-wrap"><table className="data-table"><thead><tr><th>RECEIPT</th><th>DATE & TIME</th><th>CUSTOMER</th><th>STATUS</th><th>TOTAL</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{filtered.map((sale) => <tr key={sale.id} className="clickable-row" onClick={() => navigate(`/sales/${sale.id}`)}><td><strong className="receipt-number">{sale.receiptNumber}</strong></td><td className="date-cell">{new Date(sale.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</td><td>{sale.customerName || <span className="muted-text">Walk-in customer</span>}</td><td><span className="status-pill status-good">Completed</span></td><td className="amount-cell">{formatMinorAmount(sale.totalMinor, workspace.currency)}</td><td><button className="icon-button table-action" aria-label={`View receipt ${sale.receiptNumber}`} onClick={(event) => { event.stopPropagation(); navigate(`/sales/${sale.id}`); }}><ArrowUpRight size={16} /></button></td></tr>)}</tbody></table></div>}
      </section>
      <p className="page-footnote">Sales are not deleted from this interface. Returns are recorded as linked reversal records so the original transaction remains traceable.</p>
    </div>
  );
}
