/**
 * The browser demonstration uses the real LEXA route names, shared shell,
 * business-area colours and standard record-manager controls. API-only screens
 * receive sample-register views instead of making production requests.
 * The customer application never renders this component.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '../../app/WorkspaceContext';
import { getModuleDefinition } from '../operations/moduleCatalog';
import { ModuleManager } from '../operations/OperationsWorkspacePage';
import { localModuleRecordService } from '../../data/local/moduleRecords';
import { localReportsRepository } from '../../data/local/reports';
import { getBrowserDemoAnalytics } from './browserDemoAnalytics';
import type { DashboardPeriod } from '../../data/contracts/dashboardAnalytics';
import { LineTrendChart, BarBreakdownChart } from '../../components/charts/Charts';
import SampleAssistant from './SampleAssistant';
import SampleEmployment from './SampleEmployment';
import SampleBusiness from './SampleBusiness';
import './demo.css';

function money(amount: number): string {
  return new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(amount);
}

const areas = [
  { label: 'Sales', path: '/sales' },
  { label: 'Stock', path: '/inventory' },
  { label: 'Purchasing', path: '/modules/purchases' },
  { label: 'Finance', path: '/modules/finance-overview' },
  { label: 'Payroll', path: '/modules/payroll' },
  { label: 'Projects', path: '/modules/projects' },
] as const;

function SampleReports({ finance = false }: { finance?: boolean }) {
  const { workspace, branch } = useWorkspace();
  const [period, setPeriod] = useState<DashboardPeriod>('30d');
  const summary = useQuery({
    queryKey: ['browser-demo-report', workspace.id, branch.id, period],
    queryFn: async () => {
      const scope = { workspaceId: workspace.id, branchId: branch.id };
      const [snapshot, analytics, expenses, invoices, payables, payroll, purchases] = await Promise.all([
        localReportsRepository.getDashboardSnapshot(scope),
        getBrowserDemoAnalytics(workspace.id, branch.id, period),
        localModuleRecordService.list(scope, 'expenses'),
        localModuleRecordService.list(scope, 'sales-invoices'),
        localModuleRecordService.list(scope, 'purchase-invoices'),
        localModuleRecordService.list(scope, 'payroll'),
        localModuleRecordService.list(scope, 'purchases'),
      ]);
      return { snapshot, analytics, counts: { expenses: expenses.length, invoices: invoices.length, payables: payables.length, payroll: payroll.length, purchases: purchases.length } };
    },
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
  const data = summary.data;
  return <div className="page-stack lexa-browser-demo-reports" data-module-accent={finance ? 'sapphire' : 'gold'}>
    <header className="lexa-browser-demo-heading">
      <span>LEXA DEMO TRADERS · SAMPLE FIGURES</span>
      <h1>{finance ? 'Financial overview' : 'Business reports'}</h1>
      <p>{finance ? 'Recorded receipts and fictional finance registers in one view.' : 'Review the numbers behind this shop. Sales and stock figures are calculated from linked sample records.'}</p>
      <small>No external banking, tax filing or live financial postings take place in the browser demo.</small>
    </header>
    <nav className="lexa-browser-demo-periods" aria-label="Reporting period">
      {(['today','7d','30d','90d','12m'] as const).map(p => <button key={p} type="button" aria-pressed={period===p} className={period===p?'selected':''} onClick={()=>setPeriod(p)}>{({today:'Today','7d':'7 days','30d':'30 days','90d':'90 days','12m':'12 months'} as const)[p]}</button>)}
      <button type="button" onClick={()=>void summary.refetch()}>Refresh figures</button>
    </nav>
    {summary.isPending && <p role="status" className="fin-loading">Checking the sample sales and stock records…</p>}
    {summary.isError && <div className="lexa-demo-error" role="alert">The sample figures could not be opened. <button type="button" onClick={()=>void summary.refetch()}>Try again</button></div>}
    {data && <>
      <div className="lexa-browser-demo-metrics">
        <Link to="/sales"><small>Sales recorded · all time</small><strong>{money(data.snapshot.netSalesMinor)}</strong><span>{data.snapshot.saleCount} receipts →</span></Link>
        <Link to="/modules/payments"><small>Customer payments · all time</small><strong>{money(data.snapshot.recordedReceiptsMinor)}</strong><span>From linked sample receipts →</span></Link>
        <Link to="/products"><small>Products in stock catalogue</small><strong>{data.snapshot.activeProductCount}</strong><span>{data.snapshot.lowStockCount} low-stock products →</span></Link>
        <Link to="/modules/expenses"><small>Sample expense records</small><strong>{data.counts.expenses}</strong><span>Illustrative entries, not posted ledger balances →</span></Link>
      </div>
      <div className="lexa-browser-demo-chart-grid">
        <LineTrendChart title={`Sales recorded · ${period === 'today' ? 'today' : period}`} description="Calculated from fictional receipts in the chosen period" points={data.analytics.salesTrend} currencyFormatter={money}/>
        <BarBreakdownChart title="Payment methods" description="How the fictional receipts were recorded" points={data.analytics.salesByChannel} formatValue={money}/>
      </div>
      <section className="lexa-browser-demo-registers">
        <h2>Open the underlying records</h2><p>The following registers contain named fictional examples. They are not verified bank or tax records.</p>
        <div>
          <Link to="/modules/sales-invoices"><strong>Customer invoices</strong><span>{data.counts.invoices} examples →</span></Link>
          <Link to="/modules/purchase-invoices"><strong>Supplier invoices</strong><span>{data.counts.payables} examples →</span></Link>
          <Link to="/modules/purchases"><strong>Supplier orders</strong><span>{data.counts.purchases} examples →</span></Link>
          <Link to="/modules/payroll"><strong>Payroll</strong><span>{data.counts.payroll} examples →</span></Link>
          <Link to="/modules/bank-reconciliation"><strong>Bank reconciliation</strong><span>Sample register →</span></Link>
          <Link to="/inventory"><strong>Stock movements</strong><span>{data.snapshot.lowStockCount} need attention →</span></Link>
        </div>
      </section>
    </>}
    <nav aria-label="Other business areas" className="lexa-browser-demo-shortcuts">{areas.map(x=><Link key={x.path} to={x.path}>{x.label} <span aria-hidden="true">↗</span></Link>)}</nav>
  </div>;
}

function SampleSettings() {
  const { workspace, branch } = useWorkspace();
  return <div className="page-stack lexa-browser-demo-settings">
    <header className="lexa-browser-demo-heading"><span>DEMO SETTINGS</span><h1>Account & business settings</h1><p>The demo keeps the four LEXA settings groups. Sensitive account and payment controls are disabled because this is not a signed-in customer account.</p></header>
    <div className="lexa-browser-demo-settings-grid">
      <section><span>01 · BUSINESS PROFILE</span><h2>Business profile</h2><p><strong>{workspace.businessName}</strong><br/>Branch: {branch.name}<br/>Currency: {workspace.currency}</p><p>Sample business details are stored only in this browser.</p></section>
      <section><span>02 · ACCOUNT SECURITY</span><h2>Account security</h2><p>No customer password, authenticator or real account is connected to the browser demo.</p><a href="https://lexaaamaal.com/sign-in">Sign in to your own account →</a></section>
      <section><span>03 · PRIVACY PREFERENCES</span><h2>Privacy preferences</h2><p>Sample records never synchronize to LEXA's production API. Reset the demo to clear the fictional data.</p><Link to="/">Sample overview →</Link></section>
      <section><span>04 · BUSINESS TOOLS</span><h2>Business tools</h2><p>Browse purchasing, stock, accounts and people registers. Data imports and external integrations are unavailable in this sample.</p><Link to="/modules/purchases">View sample purchasing →</Link></section>
    </div>
  </div>;
}

export default function BrowserDemoAreaPage({ path }: { path: string }) {
  const { workspace, branch } = useWorkspace();
  if (path === '/reports') return <SampleReports/>;
  if (path === '/intelligence') return <SampleAssistant/>;
  if (path === '/my-employment') return <SampleEmployment/>;
  if (path === '/workspace') return <SampleBusiness/>;
  if (path === '/modules/finance-overview' || path === '/modules/finance-operations') return <SampleReports finance/>;
  if (path === '/settings' || path === '/business-setup') return <SampleSettings/>;
  const id = path === '/team' ? 'employees' : path.replace(/^\/modules\//, '').split('/')[0] ?? '';
  const module = getModuleDefinition(id);
  if (!module) return <div className="page-stack"><header className="lexa-browser-demo-heading"><span>SAMPLE BUSINESS</span><h1>This page needs a connected account</h1><p>Some administrative services cannot be simulated with browser-only records.</p></header><Link to="/">Return to business overview →</Link></div>;
  return <><div className="lexa-browser-demo-register-note" role="status">Sample {module.title.toLowerCase()} · fictional records stored in this browser. No external service is used.</div><ModuleManager key={`${workspace.id}:${branch.id}:${module.id}`} module={module}/></>;
}
