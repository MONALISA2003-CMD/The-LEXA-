import { moduleAccentForPath } from '../../domain/shared/moduleAccents';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, ReceiptText, Search } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { sales } from '../../data/repositories';
import { formatMinorAmount } from '../../domain/money/money';
import type { Sale } from '../../domain/shared/types';
import { StandardDataTable, type DataTableColumn } from '../../components/tables/StandardDataTable';

export default function SalesPage() {
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const salesQuery = useQuery({ queryKey: ['sales', workspace.id], queryFn: () => sales.list({ workspaceId: workspace.id, limit: 500 }) });
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (salesQuery.data ?? []).filter((sale) => {
      const matchesText = !needle || sale.receiptNumber.toLocaleLowerCase().includes(needle) || (sale.customerName ?? '').toLocaleLowerCase().includes(needle);
      const saleDate = sale.createdAt.slice(0, 10);
      const matchesFrom = !dateFrom || saleDate >= dateFrom;
      const matchesTo = !dateTo || saleDate <= dateTo;
      return matchesText && matchesFrom && matchesTo;
    });
  }, [salesQuery.data, search, dateFrom, dateTo]);
  const totalSales = filtered.reduce((sum, sale) => sum + sale.totalMinor, 0);
  const invalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const saleColumns: DataTableColumn<Sale>[] = [
    { key: 'receiptNumber', header: 'Receipt', cell: (sale) => <strong className="receipt-number">{sale.receiptNumber}</strong>, sortValue: (sale) => sale.receiptNumber },
    { key: 'createdAt', header: 'Date & time', cell: (sale) => new Date(sale.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }), sortValue: (sale) => sale.createdAt },
    { key: 'customerName', header: 'Customer', cell: (sale) => sale.customerName || <span className="muted-text">Walk-in customer</span>, sortValue: (sale) => sale.customerName ?? 'Walk-in customer' },
    { key: 'status', header: 'Status', cell: () => <span className="status-pill status-good">Completed</span>, sortValue: (sale) => sale.status },
    { key: 'totalMinor', header: 'Total', align: 'end', cell: (sale) => <span className="amount-cell">{formatMinorAmount(sale.totalMinor, workspace.currency)}</span>, sortValue: (sale) => sale.totalMinor, exportValue: (sale) => formatMinorAmount(sale.totalMinor, workspace.currency) },
    { key: 'actions', header: 'Open', cell: (sale) => <button type="button" className="icon-button table-action" aria-label={`View receipt ${sale.receiptNumber}`} onClick={() => navigate(`/sales/${sale.id}`)}><ArrowUpRight size={16} /></button>, exportValue: (sale) => sale.id },
  ];

  return (
    <div className="page-stack" data-module-accent={moduleAccentForPath("/sales")}>
      <div className="page-heading-row"><div><div className="eyebrow eyebrow-blue">TRANSACTION HISTORY</div><h2>Sales & receipts</h2><p>Every sale links to the items, recorded payments, stock movements and any returns.</p></div><button className="button button-primary" onClick={() => navigate('/checkout')}><ReceiptText size={17} /> New sale</button></div>
      <div className="metric-strip three-metrics"><div className="mini-metric"><span>Matching sales</span><strong>{filtered.length.toLocaleString()}</strong><small>Within the current filters</small></div><div className="mini-metric"><span>Filtered gross value</span><strong>{formatMinorAmount(totalSales, workspace.currency)}</strong><small>Before recorded returns</small></div><div className="mini-metric"><span>Latest matching receipt</span><strong className="metric-receipt">{filtered[0]?.receiptNumber ?? '—'}</strong><small>Most recent in this view</small></div></div>
      {invalidDateRange && <div className="inline-warning" role="alert">The start date must be on or before the end date.</div>}
      <section className="section-card table-card"><div className="table-toolbar sales-table-toolbar"><div><h3>Sales history</h3><p>{filtered.length} matching {filtered.length === 1 ? 'sale' : 'sales'} · {formatMinorAmount(totalSales, workspace.currency)} in filtered gross sales</p></div><div className="sales-table-filters"><label className="search-field"><Search size={16} /><input aria-label="Search sales" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search receipt or customer" /></label><label className="field-label sales-date-filter"><span>From</span><input aria-label="Sales from date" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label className="field-label sales-date-filter"><span>To</span><input aria-label="Sales to date" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>{(search || dateFrom || dateTo) && <button type="button" className="button button-secondary button-small" onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); }}>Clear filters</button>}</div></div>
        {salesQuery.isError ? <div className="inline-error" role="alert"><strong>Could not load sales history.</strong><span>{salesQuery.error instanceof Error ? salesQuery.error.message : 'Try again.'}</span><button className="button button-secondary button-small" onClick={() => void salesQuery.refetch()}>Retry</button></div> : salesQuery.isLoading ? <div className="loading-state">Loading sales…</div> : filtered.length === 0 ? <div className="empty-state"><div className="empty-icon"><ReceiptText size={22} /></div><h3>{search || dateFrom || dateTo ? 'No matching sales' : 'No sales have been recorded'}</h3><p>{search || dateFrom || dateTo ? 'Try a different search or widen the date range.' : 'Your completed sales will appear here together with their receipt details and payment records.'}</p>{!(search || dateFrom || dateTo) && <button className="button button-primary" onClick={() => navigate('/checkout')}>Start a sale <ArrowUpRight size={16} /></button>}</div> : <StandardDataTable rows={filtered} columns={saleColumns} enableSearch={false} rowLabel="sales" emptyTitle="No sales have been recorded" emptyDescription="Completed sales will appear here." />}
      </section>
      <p className="page-footnote">Sales are not deleted from this interface. Returns are recorded as linked reversal records so the original transaction remains traceable.</p>
    </div>
  );
}
