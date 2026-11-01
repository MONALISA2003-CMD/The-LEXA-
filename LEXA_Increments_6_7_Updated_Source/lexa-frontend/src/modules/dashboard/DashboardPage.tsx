import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, BarChart3, Box, CalendarDays, CheckCircle2,
  CircleDollarSign, Clock3, MessageCircle, Package, RefreshCw, ShoppingBag, ShoppingCart, Users, Wallet,
} from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { reports } from '../../data/repositories';
import { apiDashboard } from '../../data/remote/apiDashboard';
import type { DashboardPeriod } from '../../data/contracts/dashboardAnalytics';
import { isApiProvider } from '../../data/remote/runtimeConfig';
import { formatMinorAmount } from '../../domain/money/money';
import { moduleAccentForPath } from '../../domain/shared/moduleAccents';
import { BarBreakdownChart, DonutBreakdownChart, LineTrendChart } from '../../components/charts/Charts';

const periodLabels: Record<DashboardPeriod, string> = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', '12m': 'Last 12 months' };
type OverviewMode = 'owner' | 'sales' | 'finance' | 'operations' | 'people';
const overviewModeLabels: Record<OverviewMode, string> = { owner: 'Business owner', sales: 'Sales & CRM', finance: 'Finance', operations: 'Operations', people: 'People & payroll' };
function categoryForKpi(key: string): OverviewMode { const keyText = key.toLocaleLowerCase(); if (/sales|revenue|lead|opportunit|conversion|customer|crm/.test(keyText)) return 'sales'; if (/cash|receipt|receivable|payable|expense|profit|margin|budget|finance|invoice|payment|balance/.test(keyText)) return 'finance'; if (/stock|inventor|warehouse|deliver|fulfil|production|quality|movement/.test(keyText)) return 'operations'; if (/employee|staff|attendance|payroll|leave|workforce|headcount/.test(keyText)) return 'people'; return 'owner'; }
const dateLabel = (timezone: string) => { try { return new Intl.DateTimeFormat('en-UG', { dateStyle: 'full', timeZone: timezone }).format(new Date()); } catch { return new Date().toLocaleDateString(); } };

export default function DashboardPage() {
  const { workspace, branch } = useWorkspace();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<DashboardPeriod>('30d');
  const [overviewMode, setOverviewMode] = useState<OverviewMode>('owner');
  const snapshotQuery = useQuery({ queryKey: ['dashboard', workspace.id, branch.id], queryFn: () => reports.getDashboardSnapshot({ workspaceId: workspace.id, branchId: branch.id }) });
  const analyticsQuery = useQuery({
    queryKey: ['dashboard-analytics', workspace.id, branch.id, period],
    queryFn: ({ signal }) => apiDashboard.getOverview(workspace.id, branch.id, period, signal),
    enabled: isApiProvider,
    staleTime: 60_000,
    retry: 1,
  });
  const snapshot = snapshotQuery.data;
  const analytics = analyticsQuery.data;
  const money = (value: number) => new Intl.NumberFormat('en-UG', { style: 'currency', currency: workspace.currency, maximumFractionDigits: workspace.currency === 'UGX' ? 0 : 2 }).format(value);
  const kpis = useMemo(() => {
    const base = [
      { key: 'net-sales', category: 'sales' as OverviewMode, label: 'Net sales', value: snapshot ? formatMinorAmount(snapshot.netSalesMinor, workspace.currency) : '—', note: 'Sales less recorded returns', icon: <CircleDollarSign size={18}/>, accent: 'blue', href: '/sales' },
      { key: 'recorded-receipts', category: 'finance' as OverviewMode, label: 'Receipts recorded', value: snapshot ? formatMinorAmount(snapshot.recordedReceiptsMinor, workspace.currency) : '—', note: 'Payments marked received', icon: <Wallet size={18}/>, accent: 'emerald', href: '/modules/payments' },
      { key: 'outstanding-estimate', category: 'finance' as OverviewMode, label: 'Outstanding estimate', value: snapshot ? formatMinorAmount(snapshot.outstandingMinor, workspace.currency) : '—', note: 'Recorded sales/payment estimate', icon: <Clock3 size={18}/>, accent: 'gold', href: '/modules/sales-invoices' },
      { key: 'units-on-hand', category: 'operations' as OverviewMode, label: 'Units on hand', value: snapshot ? snapshot.itemsInStock.toLocaleString() : '—', note: 'From stock movement history', icon: <Box size={18}/>, accent: 'cyan', href: '/inventory' },
      { key: 'low-stock', category: 'operations' as OverviewMode, label: 'Low-stock products', value: snapshot ? snapshot.lowStockCount.toLocaleString() : '—', note: 'At or below reorder level', icon: <AlertTriangle size={18}/>, accent: snapshot?.lowStockCount ? 'orange' : 'emerald', href: '/inventory' },
    ];
    const extra = (analytics?.kpis ?? []).map((item) => ({ key: item.key, category: categoryForKpi(item.key) === 'owner' && item.href ? categoryForKpi(item.href) : categoryForKpi(item.key), label: item.label, value: item.unit === 'currency' ? money(item.value) : item.unit === 'percent' ? `${item.value.toFixed(1)}%` : item.value.toLocaleString(undefined, { maximumFractionDigits: 1 }), note: item.description ?? (item.changePercent == null ? 'Backend-calculated metric' : `${item.changePercent > 0 ? '+' : ''}${item.changePercent.toFixed(1)}% vs comparison`), icon: <Activity size={18}/>, accent: 'navy', href: item.href ?? '/modules/reports' }));
    const all = [...base, ...extra];
    return overviewMode === 'owner' ? all : all.filter((item) => item.category === overviewMode);
  }, [analytics, snapshot, workspace.currency, overviewMode, money]);

  return <div className="page-stack dashboard-page modern-overview" data-module-accent={moduleAccentForPath("/")}>
    <section className="overview-hero">
      <div className="overview-hero-copy"><div className="overview-kicker"><span /> BUSINESS OVERVIEW <i /> {dateLabel(workspace.timezone).toLocaleUpperCase()}</div>
        <h2>Your business, <span>in focus.</span></h2>
        <p>{workspace.businessName} <span className="overview-hero-separator">/</span> {branch.name}. A decision-ready view of sales, stock, exceptions and day-to-day activity.</p>
        <div className="overview-hero-actions"><button className="button button-white" onClick={() => navigate('/checkout')}><ShoppingCart size={16} /> New sale</button><button className="button button-outline-light" onClick={() => navigate('/modules/reports')}><BarChart3 size={16} /> View analytics</button></div>
      </div>
      <div className="overview-hero-art" aria-hidden="true"><div className="overview-hero-orb"/><div className="overview-hero-grid"><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/></div><div className="overview-hero-mini overview-hero-brand-card"><span>LEXA BUSINESS SYSTEM</span><strong>One workspace.<br/>Every workflow.</strong><small>Built for operational clarity</small></div></div>
    </section>

    <section className="overview-controls" aria-label="Overview filters"><div className="overview-context"><span className="overview-context-icon"><CalendarDays size={16}/></span><div><strong>{branch.name}</strong><span>{workspace.businessName} · {workspace.currency}</span></div></div><div className="overview-control-actions"><label className="overview-period"><span>View</span><select aria-label="Overview role view" value={overviewMode} onChange={(event) => setOverviewMode(event.target.value as OverviewMode)}>{Object.entries(overviewModeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="overview-period"><span>Trend period</span><select aria-label="Overview trend period" value={period} onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}>{Object.entries(periodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="button button-secondary button-small" onClick={() => { void snapshotQuery.refetch(); if (isApiProvider) void analyticsQuery.refetch(); }} disabled={snapshotQuery.isFetching || (isApiProvider && analyticsQuery.isFetching)}><RefreshCw size={14} className={snapshotQuery.isFetching || (isApiProvider && analyticsQuery.isFetching) ? 'spin-icon' : ''}/> Refresh</button><button className="button button-secondary button-small" onClick={() => navigate('/modules/reports')}><ArrowUpRight size={14}/> Reports</button></div></section>

    {snapshotQuery.isError && <div className="inline-error" role="alert"><strong>Could not load the overview totals.</strong><span>{snapshotQuery.error instanceof Error ? snapshotQuery.error.message : 'Check the data connection and retry.'}</span><button className="button button-secondary button-small" onClick={() => void snapshotQuery.refetch()}>Retry</button></div>}

    <section className="overview-kpi-section"><div className="overview-section-heading"><div><span className="eyebrow eyebrow-blue">PERFORMANCE SNAPSHOT</span><h3>Key business indicators</h3><p>Current totals from the active workspace and branch. Trend changes are shown only when supplied by the analytics service.</p></div><button className="overview-heading-link" onClick={() => navigate('/modules/reports')}>Explore reports <ArrowRight size={15}/></button></div>
      {kpis.length ? <div className="overview-kpi-grid">{kpis.map((item) => <KpiCard key={item.key} label={item.label} value={item.value} note={item.note} icon={item.icon} accent={item.accent} onClick={() => navigate(item.href)}/>)}</div> : <div className="overview-service-note"><Activity size={17}/><div><strong>No KPIs for this view yet</strong><span>The analytics backend has not returned any measures for {overviewModeLabels[overviewMode]}. No invented values are substituted.</span></div></div>}
    </section>

    <section className="overview-section" aria-labelledby="overview-performance-title"><div className="overview-section-heading"><div><span className="eyebrow eyebrow-blue">BUSINESS PERFORMANCE</span><h3 id="overview-performance-title">Performance over time</h3><p>Comparison period is returned by the backend; no synthetic chart values are generated.</p></div><span className="overview-freshness">{analytics?.generatedAt ? `Updated ${new Date(analytics.generatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : isApiProvider ? 'Waiting for analytics' : 'Local analytics unavailable'}</span></div>
      {analyticsQuery.isError && <div className="overview-service-note" role="status"><AlertTriangle size={17}/><div><strong>Analytics service not connected</strong><span>{analyticsQuery.error instanceof Error ? analyticsQuery.error.message : 'The overview analytics endpoint is unavailable. Existing verified totals remain visible above.'}</span></div><button className="button button-secondary button-small" onClick={() => void analyticsQuery.refetch()}>Retry</button></div>}
      {!isApiProvider && <div className="overview-service-note"><Activity size={17}/><div><strong>Charts require the analytics service</strong><span>Only saved local transactions are available in local mode. Connect the backend analytics endpoint to show complete trends and comparison periods.</span></div></div>}
      {analyticsQuery.isLoading && <div className="overview-chart-skeletons"><div/><div/><div/></div>}
      <div className="overview-chart-grid"><LineTrendChart title="Sales trend" description={`${periodLabels[period]}${analytics?.comparisonPeriod ? ` · compared with ${analytics.comparisonPeriod}` : ''}`} points={analytics?.salesTrend ?? []} currencyFormatter={money}/><DonutBreakdownChart title="Sales mix" description="Breakdown from recorded sales channels" points={analytics?.salesByChannel ?? []} centerLabel="Sales" formatValue={money}/><BarBreakdownChart title="Stock health" description="Current products grouped by their stock status" points={analytics?.stockHealth ?? []} formatValue={(value) => value.toLocaleString()}/></div>
    </section>

    <section className="overview-lower-grid"><div className="overview-panel section-card"><div className="section-card-heading"><span className="heading-icon amber-icon"><AlertTriangle size={18}/></span><div><h3>Needs attention</h3><p>Exceptions that require a real operational action</p></div><span className="overview-counter">{analytics?.exceptions.length ?? 0}</span></div>{analyticsQuery.isLoading ? <div className="loading-state">Loading exceptions…</div> : !analytics?.exceptions.length ? <div className="overview-empty"><CheckCircle2 size={22}/><strong>No exceptions supplied</strong><span>When connected, alerts will come from actual business rules and records.</span></div> : <div className="overview-exception-list">{analytics.exceptions.slice(0, 8).map((item) => <button key={item.id} className={`overview-exception overview-severity-${item.severity}`} onClick={() => item.href && navigate(item.href)} disabled={!item.href}><span className="overview-exception-marker"/><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight size={15}/></button>)}</div>}<button className="overview-panel-footer" onClick={() => navigate('/inbox?tab=tasks')}>Open tasks and approvals <ArrowRight size={14}/></button></div>
      <div className="overview-panel section-card"><div className="section-card-heading"><span className="heading-icon blue-icon"><Activity size={18}/></span><div><h3>Business activity</h3><p>Recent events from the active workspace</p></div><button className="icon-button" title="Open activity log" aria-label="Open activity log" onClick={() => navigate('/inbox?tab=activity')}><ArrowUpRight size={16}/></button></div>{analyticsQuery.isLoading ? <div className="loading-state">Loading activity…</div> : !analytics?.recentActivity.length ? <div className="overview-empty"><Activity size={22}/><strong>No activity feed available</strong><span>Connected business events will appear here. No sample events are shown.</span></div> : <div className="overview-activity-list">{analytics.recentActivity.slice(0, 7).map((item) => <button key={item.id} className="overview-activity-item" onClick={() => item.href && navigate(item.href)} disabled={!item.href}><span className="overview-activity-dot"/><span><strong>{item.summary}</strong><small>{item.actorName ? `${item.actorName} · ` : ''}{new Date(item.occurredAt).toLocaleString()}</small></span><ArrowRight size={14}/></button>)}</div>}<button className="overview-panel-footer" onClick={() => navigate('/inbox?tab=activity')}>View activity log <ArrowRight size={14}/></button></div>
    </section>

    <section className="overview-workspace-section"><div className="overview-section-heading"><div><span className="eyebrow eyebrow-blue">QUICK ACCESS</span><h3>Continue your work</h3><p>Open common workflows without cluttering the main business overview.</p></div><button className="overview-heading-link" onClick={() => navigate('/modules')}>All modules <ArrowRight size={15}/></button></div><div className="overview-workflow-grid"><WorkflowCard title="Checkout / POS" description="Scan items and record a sale" icon={<ShoppingCart size={18}/>} accent="blue" onClick={() => navigate('/checkout')}/><WorkflowCard title="Inventory" description="Stock levels and movements" icon={<Package size={18}/>} accent="cyan" onClick={() => navigate('/inventory')}/><WorkflowCard title="Inbox" description="Messages, tasks and approvals" icon={<MessageCircle size={18}/>} accent="emerald" onClick={() => navigate('/inbox')}/><WorkflowCard title="Reports & analytics" description="Detailed performance and exports" icon={<BarChart3 size={18}/>} accent="gold" onClick={() => navigate('/modules/reports')}/><WorkflowCard title="Customers & CRM" description="Relationships and pipeline" icon={<Users size={18}/>} accent="emerald" onClick={() => navigate('/modules/customers')}/><WorkflowCard title="Business tools" description="Capture, import and data recovery" icon={<ShoppingBag size={18}/>} accent="navy" onClick={() => navigate('/business-tools')}/></div></section>

    <section className="overview-transaction-panel section-card"><div className="section-card-heading"><span className="heading-icon blue-icon"><ShoppingBag size={18}/></span><div><h3>Recent sales</h3><p>Latest transactions saved to the active branch</p></div><button className="overview-heading-link" onClick={() => navigate('/sales')}>All sales <ArrowRight size={14}/></button></div>{snapshotQuery.isLoading ? <div className="loading-state">Loading recent sales…</div> : !snapshot?.recentSales.length ? <div className="overview-empty"><ShoppingBag size={22}/><strong>No sales records yet</strong><span>Once real transactions are recorded, they will appear here.</span><button className="button button-primary button-small" onClick={() => navigate('/checkout')}>Start a sale <ArrowRight size={14}/></button></div> : <div className="overview-transaction-table"><div className="overview-transaction-head"><span>Receipt / customer</span><span>Date</span><span>Value</span><span>Status</span></div>{snapshot.recentSales.slice(0, 6).map((sale) => <button key={sale.id} className="overview-transaction-row" onClick={() => navigate(`/sales/${sale.id}`)}><span><strong>{sale.receiptNumber}</strong><small>{sale.customerName || 'Walk-in customer'}</small></span><span>{new Date(sale.createdAt).toLocaleDateString()}</span><strong>{formatMinorAmount(sale.totalMinor, workspace.currency)}</strong><span className="status-pill status-good">Recorded</span></button>)}</div>}</section>

    <section className="overview-integrity-note"><CheckCircle2 size={16}/><p><strong>Trustworthy figures by design.</strong> Overview totals are read from the selected provider. Analytics trends, comparisons, exceptions and activity require backend-calculated data; unavailable values are not replaced with fabricated figures.</p></section>
  </div>;
}

function KpiCard({ label, value, note, icon, accent, onClick }: { label: string; value: string; note: string; icon: ReactNode; accent: string; onClick: () => void }) {
  return <button type="button" className={`overview-kpi-card overview-accent-${accent}`} onClick={onClick}><span className="overview-kpi-top"><span>{label}</span><i>{icon}</i></span><strong className="overview-kpi-value">{value}</strong><span className="overview-kpi-note">{note}</span><span className="overview-kpi-link">View details <ArrowUpRight size={13}/></span></button>;
}
function WorkflowCard({ title, description, icon, accent, onClick }: { title: string; description: string; icon: ReactNode; accent: string; onClick: () => void }) {
  return <button type="button" className={`overview-workflow-card overview-accent-${accent}`} onClick={onClick}><i>{icon}</i><span><strong>{title}</strong><small>{description}</small></span><ArrowRight size={15}/></button>;
}
