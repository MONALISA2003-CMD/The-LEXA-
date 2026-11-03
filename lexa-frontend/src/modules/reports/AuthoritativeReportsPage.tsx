import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { AlertCircle, BarChart3, CheckCircle2, RefreshCw, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { apiReports } from '../../data/remote/apiReports';
import { isApiProvider } from '../../data/remote/runtimeConfig';
import { moduleAccentForPath } from '../../domain/shared/moduleAccents';

function minorScale(currency: string): number {
  if (['BIF','CLP','DJF','GNF','ISK','JPY','KMF','KRW','PYG','RWF','UGX','UYI','VND','VUV','XAF','XOF','XPF'].includes(currency.toUpperCase())) return 1;
  if (['BHD','IQD','JOD','KWD','LYD','OMR','TND'].includes(currency.toUpperCase())) return 1000;
  return 100;
}
function money(value: number, currency: string): string {
  try { return new Intl.NumberFormat('en-UG', { style: 'currency', currency, maximumFractionDigits: minorScale(currency) === 1 ? 0 : minorScale(currency) === 1000 ? 3 : 2 }).format(value / minorScale(currency)); }
  catch { return `${currency} ${(value / minorScale(currency)).toLocaleString()}`; }
}
function amount(value?: number, currency = 'UGX'): string { return money(value ?? 0, currency); }
function Stat({ label, value, detail }: { label: string; value: string; detail?: string | undefined }) {
  return <div className="overview-stat-card"><small>{label}</small><strong>{value}</strong>{detail && <span>{detail}</span>}</div>;
}
function Reconciliation({ title, value, currency }: { title: string; value: { glControlBalanceMinor: number; subledgerBalanceMinor: number; differenceMinor: number; status: 'matched' | 'review' }; currency: string }) {
  const matched = value.status === 'matched';
  return <div className="section-card">
    <div className="section-card-heading"><div><h3>{title}</h3><p>Posted control account compared with the live operational subledger</p></div><span className={`status-pill ${matched ? 'status-good' : 'status-warning'}`}>{matched ? 'Matched' : 'Review'}</span></div>
    <div className="overview-workflow-grid">
      <Stat label="GL control account" value={money(value.glControlBalanceMinor, currency)}/>
      <Stat label="Operational subledger" value={money(value.subledgerBalanceMinor, currency)}/>
      <Stat label="Difference" value={money(value.differenceMinor, currency)} detail={matched ? 'No difference detected' : 'Investigate unposted, duplicated or misallocated entries'}/>
    </div>
  </div>;
}

export default function AuthoritativeReportsPage() {
  const { workspace, branch } = useWorkspace();
  const navigate = useNavigate();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const query = useQuery({ queryKey: ['authoritative-reports', workspace.id, branch.id, from, to], queryFn: () => apiReports.authoritative(workspace.id, branch.id, from || undefined, to || undefined), enabled: isApiProvider && (!from || !to || from <= to), retry: false, staleTime: 15_000, refetchInterval: 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true });
  const report = query.data;
  const generatedAt = useMemo(() => report?.generatedAt ? new Date(report.generatedAt).toLocaleString() : '', [report?.generatedAt]);
  const currency = report?.currency ?? workspace.currency ?? 'UGX';

  return <main className="page-stack" data-module-accent={moduleAccentForPath('/reports')}>
    <header className="page-heading-row"><div><div className="eyebrow eyebrow-blue">BUSINESS PERFORMANCE</div><h2>Authoritative reports</h2><p>Sales, stock, receivables, payables and posted-ledger figures from LEXA's source records.</p></div><div className="page-heading-actions"><button className="button button-secondary button-small" onClick={() => navigate(`/intelligence?scope=overview&question=${encodeURIComponent('Explain the main business results and areas that need management attention in this report.')}`)}><Sparkles size={14}/> Ask LEXA to explain</button><button className="button button-secondary button-small" onClick={() => void query.refetch()} disabled={!isApiProvider || query.isFetching}><RefreshCw size={14}/> Refresh</button></div></header>
    {!isApiProvider && <section className="overview-service-note"><AlertCircle size={18}/><div><strong>Connect to LEXA</strong><span>Authoritative reports use tenant-protected operational and posted-ledger data. Local-only data is not presented as a server-verified report.</span></div></section>}
    <section className="section-card"><div className="section-card-heading"><div><h3>Reporting period</h3><p>Sales and returns are flows. Stock, AR/AP and GL control balances are current snapshots.</p></div><BarChart3 size={18}/></div>
      <div className="form-grid"><label>From<input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)}/></label><label>To<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)}/></label></div>
      {from && to && from > to && <div className="inline-error" role="alert">The start date must not be after the end date.</div>}
    </section>
    {query.isLoading && <div className="loading-state">Preparing source-ledger reports…</div>}
    {query.isError && <section className="inline-error" role="alert"><strong>Reports could not be loaded.</strong><span>{query.error instanceof Error ? query.error.message : 'The request could not be completed.'}</span><button className="button button-secondary button-small" onClick={() => void query.refetch()}>Retry</button></section>}
    {report && <>
      <section className="section-card"><div className="section-card-heading"><div><h3>Sales performance</h3><p>Completed sales and recorded returns in the selected period</p></div><Wallet size={18}/></div>
        <div className="overview-workflow-grid">
          <Stat label="Completed sales" value={report.sales.count.toLocaleString()}/>
          <Stat label="Gross sales" value={amount(report.sales.grossMinor, currency)}/>
          <Stat label="Returns" value={amount(report.sales.returnsMinor, currency)} detail={`${report.sales.returnsCount.toLocaleString()} recorded returns`}/>
          <Stat label="Net sales" value={amount(report.sales.netSalesMinor, currency)}/>
          <Stat label="Receipts" value={amount(report.sales.receiptsMinor, currency)}/>
          <Stat label="Refunds" value={amount(report.sales.refundsMinor, currency)}/>
        </div>
      </section>
      <section className="section-card"><div className="section-card-heading"><div><h3>Inventory position</h3><p>Current branch stock quantities and cost valuation</p></div><BarChart3 size={18}/></div>
        <div className="overview-workflow-grid"><Stat label="Products with stock" value={report.inventory.productsWithStock.toLocaleString()}/><Stat label="Units on hand" value={report.inventory.netUnits.toLocaleString(undefined,{maximumFractionDigits:3})}/><Stat label="Inventory cost reference" value={report.inventory.inventoryCostMinor === null ? 'Restricted' : amount(report.inventory.inventoryCostMinor,currency)} detail={report.inventory.inventoryCostMinor === null ? 'Finance permission required' : undefined}/><Stat label="At / below reorder" value={report.inventory.atOrBelowReorder.toLocaleString()}/></div><small>{report.inventory.valuationBasis}</small>
      </section>
      {report.receivables && <Reconciliation title="Accounts receivable reconciliation" value={report.receivables.reconciliation} currency={currency}/>}
      {report.receivables && <section className="section-card"><div className="section-card-heading"><div><h3>Customer receivables</h3><p>Current issued customer invoices after all recorded receipt allocations</p></div></div><div className="overview-workflow-grid"><Stat label="Open / issued invoice records" value={report.receivables.invoiceCount.toLocaleString()}/><Stat label="Outstanding" value={amount(report.receivables.outstandingMinor,currency)}/><Stat label="Overdue" value={amount(report.receivables.overdueMinor,currency)} detail={`${report.receivables.overdueCount.toLocaleString()} invoices`}/><Stat label="Receipts allocated" value={amount(report.receivables.appliedMinor,currency)}/></div><small>{report.receivables.balanceBasis}</small></section>}
      {report.payables && <Reconciliation title="Accounts payable reconciliation" value={report.payables.reconciliation} currency={currency}/>}
      {report.payables && <section className="section-card"><div className="section-card-heading"><div><h3>Supplier payables</h3><p>Current approved supplier bills after recorded payment allocations</p></div></div><div className="overview-workflow-grid"><Stat label="Approved bill records" value={report.payables.billCount.toLocaleString()}/><Stat label="Outstanding" value={amount(report.payables.outstandingMinor,currency)}/><Stat label="Overdue" value={amount(report.payables.overdueMinor,currency)} detail={`${report.payables.overdueCount.toLocaleString()} bills`}/><Stat label="Payments allocated" value={amount(report.payables.appliedMinor,currency)}/></div><small>{report.payables.balanceBasis}</small></section>}
      {report.generalLedger && <section className="section-card"><div className="section-card-heading"><div><h3>General ledger integrity</h3><p>Posted journals only; current branch balance checks</p></div><span className={`status-pill ${report.generalLedger.trialBalanceDifferenceMinor===0?'status-good':'status-warning'}`}>{report.generalLedger.trialBalanceDifferenceMinor===0?'Balanced':'Review'}</span></div><div className="overview-workflow-grid"><Stat label="Posted journals" value={report.generalLedger.postedJournals.toLocaleString()}/><Stat label="Revenue" value={amount(report.generalLedger.revenueMinor,currency)}/><Stat label="Expenses" value={amount(report.generalLedger.expenseMinor,currency)}/><Stat label="Trial balance difference" value={amount(report.generalLedger.trialBalanceDifferenceMinor,currency)}/></div><small>{report.generalLedger.balanceBasis} Inventory GL reference difference: {amount(report.generalLedger.inventoryValuationReferenceDifferenceMinor,currency)}. This comparison is indicative, not a historical cost-layer reconciliation.</small></section>}
      {report.crm && <section className="section-card"><div className="section-card-heading"><div><h3>Customer relationships</h3><p>CRM counts only; no customer information is exposed in this summary</p></div></div><div className="overview-workflow-grid"><Stat label="Customer records" value={report.crm.customerRecords.toLocaleString()}/><Stat label="Leads" value={report.crm.leads.toLocaleString()}/><Stat label="Opportunities" value={report.crm.opportunities.toLocaleString()}/></div></section>}
      {report.people && <section className="section-card"><div className="section-card-heading"><div><h3>Workforce overview</h3><p>Permission-scoped people counts; no employee names or compensation details</p></div><ShieldCheck size={18}/></div><div className="overview-workflow-grid"><Stat label="Active employees" value={report.people.activeEmployees.toLocaleString()}/><Stat label="Employee records" value={report.people.employeeRecords.toLocaleString()}/><Stat label="Attendance records" value={report.people.attendanceRecords.toLocaleString()}/><Stat label="Present records" value={report.people.presentRecords.toLocaleString()}/></div></section>}
      <section className="section-card"><div className="section-card-heading"><div><h3>Source & assurance</h3><p>{report.assurance}</p></div><CheckCircle2 size={18}/></div><ul>{report.sourceNotes.map((note) => <li key={note}>{note}</li>)}</ul><small>Branch: {branch.name} · Currency: {currency} · Time zone: {report.timezone} · Generated: {generatedAt}</small></section>
    </>}
  </main>;
}
