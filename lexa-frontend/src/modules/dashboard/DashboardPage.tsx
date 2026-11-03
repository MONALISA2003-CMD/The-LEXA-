import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {ShieldCheck, Activity, AlertTriangle, ArrowRight, ArrowUpRight, BarChart3, Box, CalendarDays, CheckCircle2, CircleDollarSign, Clock3, Sparkles, Package, RefreshCw, ShoppingBag, ShoppingCart, Users, Wallet, } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { reports } from '../../data/repositories';
import { apiDashboard } from '../../data/remote/apiDashboard';
import { apiTeamAccess } from '../../data/remote/apiTeamAccess';
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
  const accessQuery = useQuery({ queryKey: ['business-access', workspace.id], queryFn: () => apiTeamAccess.access(workspace.id), enabled: isApiProvider });
  const canViewReports = !isApiProvider || Boolean(accessQuery.data?.permissions.includes('reports.read'));
  const canSell = !isApiProvider || Boolean(accessQuery.data?.permissions.includes('sales.write')); 
  const snapshotQuery = useQuery({ queryKey: ['dashboard', workspace.id, branch.id], queryFn: () => reports.getDashboardSnapshot({ workspaceId: workspace.id, branchId: branch.id }), enabled: canViewReports, refetchInterval: 45_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true });
  const analyticsQuery = useQuery({
    queryKey: ['dashboard-analytics', workspace.id, branch.id, period],
    queryFn: ({ signal }) => apiDashboard.getOverview(workspace.id, branch.id, period, signal),
    enabled: isApiProvider && canViewReports,
    staleTime: 15_000,
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
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
    const extra = (analytics?.kpis ?? []).map((item) => ({ key: item.key, category: categoryForKpi(item.key) === 'owner' && item.href ? categoryForKpi(item.href) : categoryForKpi(item.key), label: item.label, value: item.unit === 'currency' ? money(item.value) : item.unit === 'percent' ? `${item.value.toFixed(1)}%` : item.value.toLocaleString(undefined, { maximumFractionDigits: 1 }), note: item.description ?? (item.changePercent == null ? 'Verified business measure' : `${item.changePercent > 0 ? '+' : ''}${item.changePercent.toFixed(1)}% vs comparison`), icon: <Activity size={18}/>, accent: 'navy', href: item.href ?? '/reports' }));
    const existing = new Set(base.map(item=>item.key));
    const all = [...base, ...extra.filter(item => !existing.has(item.key))];
    return overviewMode === 'owner' ? all : all.filter((item) => item.category === overviewMode);
  }, [analytics, snapshot, workspace.currency, overviewMode, money]);

  return <div className="page-stack dashboard-page modern-overview" data-module-accent={moduleAccentForPath("/")}>
    <section className="overview-hero">
      <div className="overview-hero-copy"><div className="overview-kicker"><span /> BUSINESS OVERVIEW <i /> {dateLabel(workspace.timezone).toLocaleUpperCase()}</div>
        <h2>Your business, <span>in focus.</span></h2>
        <p>{workspace.businessName}. A decision-ready view of sales, stock, exceptions and day-to-day activity.</p>
        <div className="overview-hero-actions">{canSell && <button className="button button-white" onClick={() => navigate('/checkout')}><ShoppingCart size={16} /> New sale</button>}{canViewReports && <button className="button button-outline-light" onClick={() => navigate('/reports')}><BarChart3 size={16} /> View reports</button>}</div>
      </div>
      <div className="overview-hero-art" aria-hidden="true"><div className="overview-hero-orb"/><div className="overview-hero-grid"><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/></div><div className="overview-hero-mini overview-hero-brand-card"><span>LEXA BUSINESS WORKSPACE</span><strong>One workspace.<br/>Every workflow.</strong><small>Built for operational clarity</small></div></div>
    </section>

    <section className="overview-controls" aria-label="Overview filters"><div className="overview-context"><span className="overview-context-icon"><CalendarDays size={16}/></span><div><strong>{workspace.businessName}</strong><span>Company-wide · {workspace.currency}</span></div></div><div className="overview-control-actions"><label className="overview-period"><span>View</span><select aria-label="Overview role view" value={overviewMode} onChange={(event) => setOverviewMode(event.target.value as OverviewMode)}>{Object.entries(overviewModeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="overview-period"><span>Trend period</span><select aria-label="Overview trend period" value={period} onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}>{Object.entries(periodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="button button-secondary button-small" onClick={() => { void snapshotQuery.refetch(); if (isApiProvider) void analyticsQuery.refetch(); }} disabled={snapshotQuery.isFetching || (isApiProvider && analyticsQuery.isFetching)}><RefreshCw size={14} className={snapshotQuery.isFetching || (isApiProvider && analyticsQuery.isFetching) ? 'spin-icon' : ''}/> Refresh</button></div></section>

    {snapshotQuery.isError && <div className="inline-error" role="alert"><strong>Could not load the overview totals.</strong><span>{snapshotQuery.error instanceof Error ? snapshotQuery.error.message : 'Check the data connection and retry.'}</span><button className="button button-secondary button-small" onClick={() => void snapshotQuery.refetch()}>Retry</button></div>}

    {!accessQuery.isLoading && !canViewReports && <div className="overview-service-note"><ShieldCheck size={18}/><div><strong>Welcome to your business workspace</strong><span>Your CEO has granted access to the tasks for your role. Business-wide financial totals are reserved for authorized managers.</span></div></div>}
    {canViewReports && <section className="overview-kpi-section"><div className="overview-section-heading"><div><span className="eyebrow eyebrow-blue">PERFORMANCE SNAPSHOT</span><h3>Key business indicators</h3><p>Verified totals from your business records. Trend changes appear only when underlying data is available.</p></div></div>
      {kpis.length ? <div className="overview-kpi-grid">{kpis.map((item) => <KpiCard key={item.key} label={item.label} value={item.value} note={item.note} icon={item.icon} accent={item.accent} onClick={() => navigate(item.href)}/>)}</div> : <div className="overview-service-note"><Activity size={17}/><div><strong>No KPIs for this view yet</strong><span>No business measures are available for {overviewModeLabels[overviewMode]}. No invented values are substituted.</span></div></div>}
    </section>}

    {canViewReports && <section className="overview-section" aria-labelledby="overview-performance-title"><div className="overview-section-heading"><div><span className="eyebrow eyebrow-blue">BUSINESS PERFORMANCE</span><h3 id="overview-performance-title">Performance over time</h3><p>Compare verified results across the selected business periods.</p></div><span className="overview-freshness">{analytics?.generatedAt ? `Updated ${new Date(analytics.generatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : isApiProvider ? 'Waiting for analytics' : 'Performance summary unavailable'}</span></div>
      {analyticsQuery.isError && <div className="overview-service-note" role="status"><AlertTriangle size={17}/><div><strong>Business performance data is unavailable</strong><span>{analyticsQuery.error instanceof Error ? analyticsQuery.error.message : 'Business performance information is temporarily unavailable. Existing verified totals remain visible above.'}</span></div><button className="button button-secondary button-small" onClick={() => void analyticsQuery.refetch()}>Retry</button></div>}
      {!isApiProvider && <div className="overview-service-note"><Activity size={17}/><div><strong>Performance trends are unavailable</strong><span>Business performance trends will appear when verified records are available.</span></div></div>}
      {analyticsQuery.isLoading && <div className="overview-chart-skeletons"><div/><div/><div/></div>}
      <div className="overview-chart-grid"><LineTrendChart title="Sales trend" description={`${periodLabels[period]}${analytics?.comparisonPeriod ? ` · compared with ${analytics.comparisonPeriod}` : ''}`} points={analytics?.salesTrend ?? []} currencyFormatter={money}/><DonutBreakdownChart title="Recorded receipts by method" description="How staff recorded money received · Not gateway verification" points={analytics?.salesByChannel ?? []} centerLabel="Receipts" formatValue={money}/><BarBreakdownChart title="Stock health" description="Current products grouped by their stock status" points={analytics?.stockHealth ?? []} formatValue={(value) => value.toLocaleString()}/></div>
    </section>}

    {canViewReports && <section className="overview-lower-grid"><div className="overview-panel section-card"><div className="section-card-heading"><span className="heading-icon amber-icon"><AlertTriangle size={18}/></span><div><h3>Needs attention</h3><p>Business exceptions requiring review</p></div><span className="overview-counter">{analytics?.exceptions.length ?? 0}</span></div>{analyticsQuery.isLoading ? <div className="loading-state">Loading exceptions…</div> : !analytics?.exceptions.length ? <div className="overview-empty"><CheckCircle2 size={22}/><strong>No outstanding exceptions</strong><span>Items requiring attention will appear here when verified business information is available.</span></div> : <div className="overview-exception-list">{analytics.exceptions.slice(0, 8).map((item) => <button key={item.id} className={`overview-exception overview-severity-${item.severity}`} onClick={() => item.href && navigate(item.href)} disabled={!item.href}><span className="overview-exception-marker"/><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight size={15}/></button>)}</div>}</div></section>}

    {canViewReports && Boolean(analytics?.recentActivity?.length) && <section className="section-card"><div className="section-card-heading"><span className="heading-icon blue-icon"><Activity size={18}/></span><div><h3>Recent business activity</h3><p>Live transactions and stock movements from verified records</p></div></div><div className="overview-activity-list">{analytics?.recentActivity.slice(0,8).map(item=><button type="button" key={item.id} onClick={()=>item.href&&navigate(item.href)}><span>{item.summary}</span><time>{new Date(item.occurredAt).toLocaleString()}</time><ArrowRight size={15}/></button>)}</div></section>}

    <section className="overview-workspace-section"><div className="overview-section-heading"><div><span className="eyebrow eyebrow-blue">QUICK ACCESS</span><h3>Continue your work</h3><p>Open common workflows without cluttering the main business overview.</p></div></div><div className="overview-workflow-grid">{canSell && <WorkflowCard title="Checkout / POS" description="Scan items and record a sale" icon={<ShoppingCart size={18}/>} accent="blue" onClick={() => navigate('/checkout')}/>} {accessQuery.data?.permissions.includes('inventory.read') && <WorkflowCard title="Inventory" description="Stock levels and movements" icon={<Package size={18}/>} accent="cyan" onClick={() => navigate('/inventory')}/>} {accessQuery.data?.permissions.includes('crm.read') && <WorkflowCard title="Customers & CRM" description="Relationships and pipeline" icon={<Users size={18}/>} accent="emerald" onClick={() => navigate('/modules/customers')}/>} {canViewReports && <WorkflowCard title="Business tools" description="Capture, import and data recovery" icon={<ShoppingBag size={18}/>} accent="navy" onClick={() => navigate('/business-tools')}/>}{accessQuery.data?.permissions.includes('intelligence.read') && <WorkflowCard title="LEXA Assistant" description="Understand performance and business priorities" icon={<Sparkles size={18}/>} accent="blue" onClick={() => navigate('/intelligence')}/>}</div></section>

    {canViewReports && <section className="overview-transaction-panel section-card"><div className="section-card-heading"><span className="heading-icon blue-icon"><ShoppingBag size={18}/></span><div><h3>Recent sales</h3><p>Recent transactions saved in this business</p></div><button className="overview-heading-link" onClick={() => navigate('/sales')}>All sales <ArrowRight size={14}/></button></div>{snapshotQuery.isLoading ? <div className="loading-state">Loading recent sales…</div> : !snapshot?.recentSales.length ? <div className="overview-empty"><ShoppingBag size={22}/><strong>No sales records yet</strong><span>Once real transactions are recorded, they will appear here.</span><button className="button button-primary button-small" onClick={() => navigate('/checkout')}>Start a sale <ArrowRight size={14}/></button></div> : <div className="overview-transaction-table"><div className="overview-transaction-head"><span>Receipt / customer</span><span>Date</span><span>Value</span><span>Status</span></div>{snapshot.recentSales.slice(0, 6).map((sale) => <button key={sale.id} className="overview-transaction-row" onClick={() => navigate(`/sales/${sale.id}`)}><span><strong>{sale.receiptNumber}</strong><small>{sale.customerName || 'Walk-in customer'}</small></span><span>{new Date(sale.createdAt).toLocaleDateString()}</span><strong>{formatMinorAmount(sale.totalMinor, workspace.currency)}</strong><span className="status-pill status-good">Recorded</span></button>)}</div>}</section>}

    <section className="overview-integrity-note"><CheckCircle2 size={16}/><p><strong>Trustworthy figures by design.</strong> Overview totals come from your business records. Figures that are not yet available are left unreported rather than estimated.</p></section>
  </div>;
}

function KpiCard({ label, value, note, icon, accent, onClick }: { label: string; value: string; note: string; icon: ReactNode; accent: string; onClick: () => void }) {
  return <button type="button" className={`overview-kpi-card overview-accent-${accent}`} onClick={onClick}><span className="overview-kpi-top"><span>{label}</span><i>{icon}</i></span><strong className="overview-kpi-value">{value}</strong><span className="overview-kpi-note">{note}</span><span className="overview-kpi-link">View details <ArrowUpRight size={13}/></span></button>;
}
function WorkflowCard({ title, description, icon, accent, onClick }: { title: string; description: string; icon: ReactNode; accent: string; onClick: () => void }) {
  return <button type="button" className={`overview-workflow-card overview-accent-${accent}`} onClick={onClick}><i>{icon}</i><span><strong>{title}</strong><small>{description}</small></span><ArrowRight size={15}/></button>;
}
