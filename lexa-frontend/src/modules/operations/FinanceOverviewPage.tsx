import OperationalWorkQueue from './OperationalWorkQueue';
import { BusinessAssortmentSelector } from '../../components/business/BusinessAssortmentSelector';
import DivisionSalesSummary from './DivisionSalesSummary';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BadgeCheck, BookOpen, Landmark, RefreshCw, ShieldCheck, TrendingUp, Wallet } from '../../components/LexaIcon';
import { useWorkspace } from '../../app/WorkspaceContext';
import { apiFinanceIntelligence } from '../../data/remote/apiFinanceIntelligence';
import { apiPayables } from '../../data/remote/apiPayables';
import { apiReceivables } from '../../data/remote/apiReceivables';
import { BarBreakdownChart, LineTrendChart } from '../../components/charts/Charts';
import { formatMinorAmount, fractionDigitsForCurrency } from '../../domain/money/money';
import './finance-sapphire.css';

function money(value: string | number | null | undefined, currency: string): string {
  if (value === undefined || value === null || !Number.isSafeInteger(Number(value))) return '—';
  return formatMinorAmount(Number(value), currency);
}
function major(value: string, currency: string): number {
  const n = Number(value);
  return Number.isSafeInteger(n) ? n / 10 ** fractionDigitsForCurrency(currency) : 0;
}
function FinanceEmpty({ text }: { text: string }) {
  return <div className="fin-empty"><BookOpen size={23} /><p>{text}</p></div>;
}

export default function FinanceOverviewPage() {
  const { workspace, branch } = useWorkspace();
  const w = workspace.id; const b = branch.id; const currency = workspace.currency || 'UGX';
  const overview = useQuery({ queryKey: ['finance-overview',w,b], queryFn:()=>apiFinanceIntelligence.overview(w,b), staleTime:30_000, refetchInterval:45_000, retry:1 });
  const receivables = useQuery({ queryKey:['finance-ar-summary',w,b], queryFn:()=>apiReceivables.summary({workspaceId:w,branchId:b}), staleTime:30_000, refetchInterval:45_000, retry:1 });
  const payables = useQuery({ queryKey:['finance-ap-summary',w,b], queryFn:()=>apiPayables.summary({workspaceId:w,branchId:b}), staleTime:30_000, refetchInterval:45_000, retry:1 });
  const hasError = overview.isError || receivables.isError || payables.isError;
  const hasActivity = overview.data?.hasActivity === true;
  const months = useMemo(() => overview.data?.monthly ?? [], [overview.data?.monthly]);
  const ytd = useMemo(() => {
    const year = String(new Date().getFullYear());
    return months.filter(x=>x.month.startsWith(year)).reduce((a,x)=>({ revenue:a.revenue+Number(x.revenueMinor),expense:a.expense+Number(x.expenseMinor) }),{ revenue:0,expense:0 });
  },[months]);
  const hasRevenue = months.some(m=>Number(m.revenueMinor)!==0 || Number(m.expenseMinor)!==0);
  const hasCash = months.some(m=>Number(m.inflowMinor)!==0 || Number(m.outflowMinor)!==0);
  const complete = overview.isSuccess && receivables.isSuccess && payables.isSuccess;
  const refresh = () => void Promise.all([overview.refetch(),receivables.refetch(),payables.refetch()]);
  return <main className="fin-page" data-module-accent="sapphire">
    <header className="fin-hero">
      <div className="fin-hero-copy"><div className="fin-overline"><Landmark size={16}/> LEXA FINANCE</div><h1>Financial overview</h1>
        <p>{workspace.businessName} · {branch.name} · {currency}</p><span className="fin-hero-sub">Posted entries and verified balances only. No estimated or demonstration transactions.</span></div>
      <div className="fin-hero-actions"><span className="fin-secure"><ShieldCheck size={15}/> Scoped to this business and branch</span><button className="fin-btn fin-btn-light" onClick={refresh} type="button"><RefreshCw size={15}/> Refresh</button></div>
    </header>
    <BusinessAssortmentSelector workspaceId={workspace.id} context="finance"/>
    <OperationalWorkQueue areas={['finance']} compact maxItems={5}/>
    {hasError&&<section className="fin-alert" role="alert"><strong>Some financial reports could not be loaded.</strong><p>Unavailable figures are not treated as zero. Check your access or connection and retry.</p><button type="button" onClick={refresh} className="fin-btn">Retry reports</button></section>}
    {overview.isPending&&<div className="fin-loader" role="status">Loading posted accounting totals…</div>}
    <div className="fin-metrics">
      <article className="fin-metric"><span><TrendingUp size={16}/> Revenue · year to date</span><strong>{overview.isSuccess&&hasActivity?money(ytd.revenue,currency):overview.isPending?'Loading…':'—'}</strong><small>{hasActivity?'Posted sales and other revenue':'No posted ledger activity'}</small></article>
      <article className="fin-metric"><span><Wallet size={16}/> Cash and bank ledger</span><strong>{overview.isSuccess&&hasActivity?money(overview.data.recordedCashBalanceMinor,currency):overview.isPending?'Loading…':'—'}</strong><small>Book balance, not a verified bank statement</small></article>
      <article className="fin-metric"><span><ArrowRight size={16}/> Customer receivables</span><strong>{receivables.isSuccess?money(receivables.data.outstandingMinor,currency):receivables.isPending?'Loading…':'Unavailable'}</strong><small>{receivables.isSuccess?`${receivables.data.openCount} open invoices`:'Accounts-receivable data not verified'}</small></article>
      <article className="fin-metric"><span><BadgeCheck size={16}/> Supplier payables</span><strong>{payables.isSuccess?money(payables.data.outstandingMinor,currency):payables.isPending?'Loading…':'Unavailable'}</strong><small>{payables.isSuccess?`${payables.data.openCount} open bills`:'Accounts-payable data not verified'}</small></article>
    </div>
    {complete&&!hasActivity&&receivables.data.invoiceCount===0&&payables.data.invoiceCount===0&&<section className="fin-first-use"><div className="fin-first-icon"><Landmark size={22}/></div><div><h2>Your financial ledger is ready</h2><p>No financial transactions have been posted for this business and branch. Set up the required accounts, then record sales, supplier bills or expenses through their operational workflows.</p><div className="fin-links"><Link to="/modules/chart-of-accounts">Review chart of accounts <ArrowRight size={14}/></Link><Link to="/modules/money-accounts">Configure bank accounts <ArrowRight size={14}/></Link></div></div></section>}
    <section className="fin-dashboard-grid">
      <div className="fin-panel"><h2>Revenue and expenses</h2><p>Monthly totals from posted ledger lines</p>
        {overview.isError?<FinanceEmpty text="Ledger trend unavailable."/>:hasRevenue?<LineTrendChart title="Posted activity" points={months.map(x=>({label:x.month.slice(5),value:major(x.revenueMinor,currency),comparisonValue:major(x.expenseMinor,currency)}))} comparisonLabel="Expenses" currencyFormatter={n=>money(Math.round(n*10**fractionDigitsForCurrency(currency)),currency)}/>:<FinanceEmpty text="Revenue and expense history will appear after the first posting."/>}</div>
      <div className="fin-panel"><h2>Cash movement</h2><p>Posted cash and bank account entries</p>
        {overview.isError?<FinanceEmpty text="Cash movement unavailable."/>:hasCash?<BarBreakdownChart title="Cash received by month" points={months.map(x=>({label:x.month,value:major(x.inflowMinor,currency)}))} formatValue={n=>money(Math.round(n*10**fractionDigitsForCurrency(currency)),currency)}/>:<FinanceEmpty text="Cash movement will appear when payments are posted."/>}</div>
    </section>
    <section className="fin-panel"><div className="fin-heading-row"><div><h2>Financial controls</h2><p>Move from source documents to approved, auditable accounting entries.</p></div></div>
      <div className="fin-action-grid">
        <Link to="/modules/accounting"><BookOpen size={20}/><strong>General ledger</strong><small>Journals, trial balance and period controls</small><ArrowRight size={16}/></Link>
        <Link to="/modules/bank-reconciliation"><Landmark size={20}/><strong>Bank reconciliation</strong><small>Import and match verified bank statement lines</small><ArrowRight size={16}/></Link>
        <Link to="/modules/budgets"><TrendingUp size={20}/><strong>Budgets and forecasts</strong><small>Approved plans and posted cost-centre spending</small><ArrowRight size={16}/></Link>
        <Link to="/modules/tax-documents"><ShieldCheck size={20}/><strong>Tax & EFRIS guidance</strong><small>Reviewed regulations and supporting documents</small><ArrowRight size={16}/></Link>
      </div>
    </section>
    <DivisionSalesSummary/>
    <footer className="fin-timestamp">{overview.data?.generatedAt?`Posted ledger refreshed ${new Date(overview.data.generatedAt).toLocaleString()}`:'No verified ledger refresh yet'} · Amounts are scoped to {branch.name}.</footer>
  </main>;
}
