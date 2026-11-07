import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, Banknote, BookOpen, CalendarClock, CircleAlert, Landmark, Plus, RefreshCw, ShieldCheck } from '../../components/LexaIcon';
import { useWorkspace } from '../../app/WorkspaceContext';
import { apiFinanceOperations } from '../../data/remote/apiWorkstream03';
import { apiGeneralLedger } from '../../data/remote/apiGeneralLedger';
import { apiPayables } from '../../data/remote/apiPayables';
import { apiReceivables } from '../../data/remote/apiReceivables';
import { apiTax } from '../../data/remote/apiTax';
import { apiFinanceIntelligence } from '../../data/remote/apiFinanceIntelligence';
import { formatMinorAmount, parseMajorAmount, fractionDigitsForCurrency } from '../../domain/money/money';
import { LineTrendChart, BarBreakdownChart } from '../../components/charts/Charts';
import BankReconciliationPanel from './BankReconciliationPanel';
import ExpenseApprovalPanel from './ExpenseApprovalPanel';
import FinanceSectionNav from './FinanceSectionNav';
import './finance-sapphire.css';

type FinanceModule = 'expenses'|'cash-sessions'|'money-accounts'|'payments'|'chart-of-accounts'|'tax-codes'|'bank-reconciliation'|'assets'|'cost-centers'|'budgets';
const meta: Record<FinanceModule, {title:string;subtitle:string}> = {
  expenses:{title:'Expenses',subtitle:'Record, approve and settle operating costs.'},
  'cash-sessions':{title:'Cash sessions',subtitle:'Open, count and review cashier cash-ups.'},
  'money-accounts':{title:'Cash & money accounts',subtitle:'Bank and cash accounts mapped to the ledger.'},
  payments:{title:'Receipts & payments',subtitle:'Customer collections and supplier settlements, linked to their invoices.'},
  'chart-of-accounts':{title:'Chart of accounts',subtitle:'Account codes and posting classifications.'},
  'tax-codes':{title:'Tax codes & rules',subtitle:'Reviewed rates, tax treatments and effective dates.'},
  'bank-reconciliation':{title:'Bank reconciliation',subtitle:'Match statement transactions to posted bank ledger entries.'},
  assets:{title:'Fixed assets',subtitle:'Capitalised assets, carrying values and depreciation.'},
  'cost-centers':{title:'Cost centres',subtitle:'Department and project cost ownership.'},
  budgets:{title:'Budgets & forecasts',subtitle:'Controlled plans, posted actuals and statistical cash forecasts.'},
};
function money(value:unknown,currency:string){const amount=Number(value);return value===undefined||value===null||!Number.isSafeInteger(amount)?'—':formatMinorAmount(amount,currency);}
function input(d:FormData,key:string):string{return String(d.get(key)??'').trim();}
function positive(d:FormData,key:string,currency:string){const text=input(d,key);if(!text)throw new Error('Enter the amount.');const v=parseMajorAmount(text,currency);if(!Number.isSafeInteger(v)||v<=0)throw new Error('Enter an amount greater than zero.');return v;}
function ErrorNotice({error,onRetry}:{error:unknown;onRetry?:()=>void}){return <div className="fin-alert" role="alert"><CircleAlert size={18}/><div><strong>Financial records could not be loaded.</strong><p>{error instanceof Error?error.message:'Check your access and connection before continuing.'} No missing data is counted as zero.</p>{onRetry&&<button className="fin-btn" type="button" onClick={onRetry}><RefreshCw size={14}/> Retry</button>}</div></div>;}
function Blank({children}:{children:ReactNode}){return <div className="fin-empty"><BookOpen size={22}/><p>{children}</p></div>;}
function AmountFormButton({saving,children}:{saving:boolean;children:ReactNode}){return <button className="fin-btn fin-btn-primary" disabled={saving} type="submit">{saving?'Saving…':children}</button>;}
function Row({title,detail,amount,children}:{title:string;detail?:string;amount?:string;children?:ReactNode}){return <article className="fin-row"><div className="fin-row-main"><strong>{title}</strong>{detail&&<small>{detail}</small>}</div>{amount&&<b className="fin-row-amount">{amount}</b>}{children}</article>;}
function FormErrors({items}:{items:Array<{isError:boolean;error:unknown;refetch:()=>unknown}>}){const bad=items.filter(x=>x.isError);return bad.length?<ErrorNotice error={bad[0]?.error} onRetry={()=>{bad.forEach(q=>void q.refetch());}}/>:null;}

function CashSessions() {
  const {workspace,branch}=useWorkspace();const w=workspace.id,b=branch.id,currency=workspace.currency||'UGX';const qc=useQueryClient();
  const cash=useQuery({queryKey:['ws-finance-cash',w,b],queryFn:()=>apiFinanceOperations.cashSessions(w,b),staleTime:20000});
  const ups=useQuery({queryKey:['ws-finance-cashups',w,b],queryFn:()=>apiFinanceOperations.cashUps(w,b),staleTime:20000});
  const [opening,setOpening]=useState('');const [counted,setCounted]=useState<Record<string,string>>({});
  const refresh=async()=>{await Promise.all([qc.invalidateQueries({queryKey:['ws-finance-cash',w,b]}),qc.invalidateQueries({queryKey:['ws-finance-cashups',w,b]})]);};
  const action=useMutation({mutationFn:async(fn:()=>Promise<unknown>)=>fn(),onSuccess:async()=>{toast.success('Cash session updated');await refresh();},onError:e=>toast.error(e instanceof Error?e.message:'Cash session could not be updated')});
  return <div className="fin-stack">
    <FormErrors items={[cash,ups]}/>
    <section className="fin-panel"><div className="fin-heading-row"><div><h2>Current cash sessions</h2><p>Opening and counted cash must reflect actual physical cash.</p></div><Banknote size={21}/></div>
      <details className="fin-form-reveal"><summary><Plus size={15}/> Open cash session</summary><form className="fin-fields" onSubmit={e=>{e.preventDefault();try{const n=parseMajorAmount(opening,currency);if(!opening.trim()||n<0)throw new Error('Enter the actual opening float.');action.mutate(()=>apiFinanceOperations.openCashSession(w,b,n));setOpening('');}catch(error){toast.error(error instanceof Error?error.message:'Invalid opening float');}}}><label>Opening cash ({currency})<input required type="number" min="0" step={fractionDigitsForCurrency(currency)===0?'1':'0.01'} value={opening} onChange={e=>setOpening(e.target.value)}/></label><AmountFormButton saving={action.isPending}>Open session</AmountFormButton></form></details>
      {cash.isPending?<p className="fin-loading">Loading cash sessions…</p>:cash.isError?null:cash.data?.length?cash.data.map(x=>{const id=String(x.id);return <Row key={id} title={String(x.sessionNumber??'Cash session')} detail={`${String(x.status)} · ${String(x.openedAt??'')}`} amount={money(x.expectedClosingMinor??x.openingFloatMinor,currency)}>{x.status==='open'&&<form className="fin-mini-form" onSubmit={e=>{e.preventDefault();try{const text=counted[id]??'';if(!text.trim())throw new Error('Enter the counted cash.');action.mutate(()=>apiFinanceOperations.closeCashSession(w,b,id,parseMajorAmount(text,currency)));}catch(error){toast.error(error instanceof Error?error.message:'Invalid cash count');}}}><label>Counted closing cash<input type="number" required min="0" step={fractionDigitsForCurrency(currency)===0?'1':'0.01'} value={counted[id]??''} onChange={e=>setCounted(prev=>({...prev,[id]:e.target.value}))}/></label><button className="fin-btn" disabled={action.isPending}>Close session</button></form>}</Row>}):<Blank>No cash sessions have been recorded for this branch.</Blank>}
    </section>
    <section className="fin-panel"><h2>Cash-up approval queue</h2><p>Review cash differences before posting an adjustment to the ledger.</p>
      {ups.isPending?<p className="fin-loading">Loading cash-ups…</p>:ups.isError?null:ups.data?.length?ups.data.map(x=><Row key={String(x.id)} title={`Cash-up · ${String(x.status)}`} detail={`Expected ${money(x.expectedMinor,currency)} · Counted ${money(x.countedMinor,currency)}`} amount={`Variance ${money(x.varianceMinor,currency)}`}>{x.status==='pending'&&<button className="fin-btn" type="button" disabled={action.isPending} onClick={()=>action.mutate(()=>apiFinanceOperations.postCashUp(w,b,String(x.id)))}>Approve cash-up</button>}</Row>):<Blank>No cash-ups are awaiting review.</Blank>}
    </section>
  </div>;
}

function MoneyAccounts(){
  const {workspace,branch}=useWorkspace();const w=workspace.id,b=branch.id;const qc=useQueryClient();
  const banks=useQuery({queryKey:['ws-finance-banks',w,b],queryFn:()=>apiFinanceOperations.bankAccounts(w,b),staleTime:45000});
  const accounts=useQuery({queryKey:['general-ledger-accounts',w],queryFn:()=>apiGeneralLedger.accounts({workspaceId:w,branchId:b}),staleTime:60000});
  const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;const d=new FormData(form);setBusy(true);try{await apiFinanceOperations.createBankAccount(w,b,{accountName:input(d,'accountName'),bankName:input(d,'bankName'),accountNumberMasked:input(d,'accountNumberMasked'),currency:input(d,'currency'),...(input(d,'ledgerAccountId')?{ledgerAccountId:input(d,'ledgerAccountId')}:{})});toast.success('Bank account added');form.reset();await qc.invalidateQueries({queryKey:['ws-finance-banks',w,b]});}catch(err){toast.error(err instanceof Error?err.message:'Bank account could not be created');}finally{setBusy(false);}}
  return <div className="fin-stack"><FormErrors items={[banks,accounts]}/><section className="fin-panel"><h2>Bank and clearing accounts</h2><p>Account balances come from posted journals and reconciliation, not manually edited figures.</p>
    <details className="fin-form-reveal"><summary><Plus size={15}/> Add verified bank account</summary><form className="fin-fields fin-form-grid" onSubmit={e=>void submit(e)}><label>Account display name<input name="accountName" maxLength={100} required/></label><label>Bank / institution<input name="bankName" maxLength={100} required/></label><label>Masked account reference<input name="accountNumberMasked" maxLength={40} placeholder="•••• 1234" required/></label><label>Currency<select name="currency" defaultValue={workspace.currency||'UGX'}><option value="UGX">UGX</option><option value="USD">USD</option><option value="KES">KES</option></select></label><label>Control ledger account<select name="ledgerAccountId" defaultValue=""><option value="">Unmapped — reconcile later</option>{(accounts.data??[]).filter(a=>a.accountType==='asset'&&a.isActive).map(a=><option key={a.id} value={a.id}>{a.accountCode} · {a.accountName}</option>)}</select></label><AmountFormButton saving={busy}>Add account</AmountFormButton></form></details>
    {banks.isPending?<p className="fin-loading">Loading money accounts…</p>:banks.isError?null:banks.data?.length?banks.data.map(row=><Row key={String(row.id)} title={String(row.accountName)} detail={`${String(row.bankName)} · ${String(row.accountNumberMasked)} · ${String(row.currency)}`} amount={row.ledgerAccountId?'Ledger mapped':'Awaiting ledger mapping'}/>):<Blank>No bank accounts are configured for this branch. Bank balances cannot be shown until verified accounts and posted entries exist.</Blank>}
    <p className="fin-footnote"><Link to="/modules/accounting">Review cash and bank ledger activity <ArrowRight size={14}/></Link></p>
  </section></div>;
}

function ReceiptsPayments(){
  const {workspace,branch}=useWorkspace();const scope={workspaceId:workspace.id,branchId:branch.id};const currency=workspace.currency||'UGX';
  const receipts=useQuery({queryKey:['finance-customer-receipts',scope.workspaceId,scope.branchId],queryFn:()=>apiReceivables.listReceipts(scope),staleTime:30000});
  const payments=useQuery({queryKey:['finance-supplier-payments',scope.workspaceId,scope.branchId],queryFn:()=>apiPayables.payments(scope),staleTime:30000});
  return <div className="fin-stack"><FormErrors items={[receipts,payments]}/><div className="fin-dashboard-grid"><section className="fin-panel"><div className="fin-heading-row"><div><h2>Customer receipts</h2><p>Recorded payments allocated to customer invoices.</p></div><Link to="/modules/sales-invoices" className="fin-btn">Receive payment <ArrowRight size={14}/></Link></div>
    {receipts.isPending?<p className="fin-loading">Loading receipts…</p>:receipts.isError?null:receipts.data.length?receipts.data.map(r=><Row key={r.id} title={r.receiptNumber} detail={`${r.customerName} · ${r.paymentDate} · ${r.method}`} amount={money(r.amountMinor,currency)}/>):<Blank>No customer payments recorded yet.</Blank>}</section>
    <section className="fin-panel"><div className="fin-heading-row"><div><h2>Supplier payments</h2><p>Settlements allocated to approved supplier bills.</p></div><Link to="/modules/purchase-invoices" className="fin-btn">Record payment <ArrowRight size={14}/></Link></div>
    {payments.isPending?<p className="fin-loading">Loading payments…</p>:payments.isError?null:payments.data.length?payments.data.map(p=><Row key={p.id} title={p.paymentNumber} detail={`${p.supplierName} · ${p.paymentDate} · ${p.method}`} amount={money(p.amountMinor,p.currency||currency)}/>):<Blank>No supplier payments recorded yet.</Blank>}</section></div>
    <section className="fin-panel fin-safety"><ShieldCheck size={18}/><p>Recording a receipt or supplier settlement updates the relevant invoice and posted ledger. LEXA does not initiate a bank or mobile-money transfer.</p></section>
  </div>;
}

function ChartAccounts(){
  const {workspace,branch}=useWorkspace();const [search,setSearch]=useState('');
  const query=useQuery({queryKey:['general-ledger-accounts',workspace.id],queryFn:()=>apiGeneralLedger.accounts({workspaceId:workspace.id,branchId:branch.id}),staleTime:60000});
  const data=(query.data??[]).filter(a=>`${a.accountCode} ${a.accountName} ${a.accountType}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <section className="fin-panel"><div className="fin-heading-row"><div><h2>Ledger accounts</h2><p>System accounts and approved business-specific accounts.</p></div><Link className="fin-btn" to="/modules/accounting">Manage accounts <ArrowRight size={15}/></Link></div>
    <ErrorNoticeIf query={query}/><label className="fin-search">Search account<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Code, name or classification"/></label>
    {query.isSuccess?data.length?<div className="fin-table-scroll"><table className="fin-table"><thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Normal balance</th><th>Status</th></tr></thead><tbody>{data.map(a=><tr key={a.id}><td>{a.accountCode}</td><td>{a.accountName}</td><td>{a.accountType}</td><td>{a.normalBalance}</td><td>{a.isActive?'Active':'Archived'}</td></tr>)}</tbody></table></div>:<Blank>No accounts match the current search.</Blank>:query.isPending?<p className="fin-loading">Loading accounts…</p>:null}
  </section>;
}
function ErrorNoticeIf({query}:{query:{isError:boolean;error:unknown;refetch:()=>unknown}}){return query.isError?<ErrorNotice error={query.error} onRetry={()=>void query.refetch()}/>:null;}

function CostCentres(){
  const {workspace,branch}=useWorkspace();const w=workspace.id,b=branch.id;const qc=useQueryClient();
  const centres=useQuery({queryKey:['ws-finance-centres',w,b],queryFn:()=>apiFinanceOperations.costCentres(w,b),staleTime:60000});
  const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;const d=new FormData(form);setBusy(true);try{await apiFinanceOperations.createCostCentre(w,b,{code:input(d,'code').toUpperCase(),name:input(d,'name'),...(input(d,'parentId')?{parentId:input(d,'parentId')}:{})});toast.success('Cost centre created');form.reset();await qc.invalidateQueries({queryKey:['ws-finance-centres',w,b]});}catch(err){toast.error(err instanceof Error?err.message:'Could not create cost centre');}finally{setBusy(false);}}
  return <section className="fin-panel"><h2>Cost-centre hierarchy</h2><p>Use defined cost centres to allocate posted expenses and manage approved budgets.</p><ErrorNoticeIf query={centres}/>
    <details className="fin-form-reveal"><summary><Plus size={15}/> New cost centre</summary><form className="fin-fields fin-form-grid" onSubmit={e=>void submit(e)}><label>Code<input required name="code" maxLength={30}/></label><label>Name<input required name="name" maxLength={100}/></label><label>Parent<select name="parentId" defaultValue=""><option value="">Top level</option>{(centres.data??[]).map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.code)} · {String(c.name)}</option>)}</select></label><AmountFormButton saving={busy}>Create cost centre</AmountFormButton></form></details>
    {centres.isSuccess?centres.data.length?centres.data.map(c=><Row key={String(c.id)} title={`${String(c.code)} · ${String(c.name)}`} detail={c.parentId?'Sub-centre':'Top-level cost centre'}/>):<Blank>No cost centres have been created for this business.</Blank>:centres.isPending?<p className="fin-loading">Loading cost centres…</p>:null}
    <div className="fin-footnote"><Link to="/modules/budgets">Review cost-centre budgets <ArrowRight size={14}/></Link></div>
  </section>;
}

function FixedAssets(){
  const {workspace,branch}=useWorkspace();const w=workspace.id,b=branch.id,currency=workspace.currency||'UGX';const qc=useQueryClient();
  const assets=useQuery({queryKey:['ws-finance-assets',w,b],queryFn:()=>apiFinanceOperations.fixedAssets(w,b),staleTime:40000});
  const accounts=useQuery({queryKey:['general-ledger-accounts',w],queryFn:()=>apiGeneralLedger.accounts({workspaceId:w,branchId:b}),staleTime:60000});
  const periods=useQuery({queryKey:['general-ledger-periods',w],queryFn:()=>apiGeneralLedger.periods({workspaceId:w,branchId:b}),staleTime:60000});
  const [busy,setBusy]=useState(false);const [periodSelection,setPeriodSelection]=useState<Record<string,string>>({});
  async function save(work:()=>Promise<unknown>,message:string){setBusy(true);try{await work();toast.success(message);await qc.invalidateQueries({queryKey:['ws-finance-assets',w,b]});await qc.invalidateQueries({queryKey:['finance-overview',w,b]});}catch(err){toast.error(err instanceof Error?err.message:'Asset action was not completed');}finally{setBusy(false);}}
  const system=(key:string)=>accounts.data?.find(a=>a.isActive&&a.systemKey===key)?.id;
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=e.currentTarget;const d=new FormData(f);try{
    const assetAccountId=system('fixed_asset_cost'),depreciationAccountId=system('depreciation_expense'),accumulatedAccountId=system('accumulated_depreciation');
    if(!assetAccountId||!depreciationAccountId||!accumulatedAccountId)throw new Error('Set up the required fixed-asset ledger accounts first.');
    const cost=positive(d,'cost',currency),residual=parseMajorAmount(input(d,'residual')||'0',currency),months=Number(input(d,'months'));
    if(!Number.isInteger(months)||months<1||months>1200||residual>cost)throw new Error('Review useful life and residual value.');
    await save(()=>apiFinanceOperations.createFixedAsset(w,b,{assetNumber:input(d,'assetNumber'),name:input(d,'name'),acquisitionDate:input(d,'date'),acquisitionCostMinor:cost,residualValueMinor:residual,usefulLifeMonths:months,assetAccountId,depreciationAccountId,accumulatedAccountId}),'Asset registered and acquisition posted');f.reset();
  }catch(err){toast.error(err instanceof Error?err.message:'Invalid asset details');}}
  return <div className="fin-stack"><FormErrors items={[assets,accounts,periods]}/><section className="fin-panel"><h2>Fixed-asset register</h2><p>Acquisitions and depreciation post to the ledger. Only record an asset purchase after verifying its source documentation.</p>
    <details className="fin-form-reveal"><summary><Plus size={15}/> Register purchased asset</summary><form className="fin-fields fin-form-grid" onSubmit={e=>void submit(e)}><label>Asset tag<input required name="assetNumber" maxLength={60}/></label><label>Asset name<input required name="name" maxLength={150}/></label><label>Acquisition date<input required type="date" name="date"/></label><label>Acquisition cost ({currency})<input required name="cost" type="number" min="1" step={fractionDigitsForCurrency(currency)===0?'1':'0.01'}/></label><label>Residual value ({currency})<input name="residual" type="number" min="0" step={fractionDigitsForCurrency(currency)===0?'1':'0.01'} defaultValue="0"/></label><label>Useful life (months)<input name="months" type="number" min="1" max="1200" required/></label><AmountFormButton saving={busy}>Register acquisition</AmountFormButton></form></details>
    {assets.isPending?<p className="fin-loading">Loading assets…</p>:assets.isError?null:assets.data?.length?assets.data.map(asset=>{const id=String(asset.id);return <Row key={id} title={`${String(asset.assetNumber)} · ${String(asset.name)}`} detail={`${String(asset.status)} · ${String(asset.acquisitionDate??'')}`} amount={money(Number(asset.acquisitionCostMinor??0)-Number(asset.accumulatedDepreciationMinor??0),currency)}>{asset.status==='active'&&<form className="fin-mini-form" onSubmit={e=>{e.preventDefault();const periodId=periodSelection[id];if(periodId)void save(()=>apiFinanceOperations.depreciateFixedAsset(w,b,id,periodId),'Depreciation posted');}}><label>Depreciation period<select required value={periodSelection[id]??''} onChange={e=>setPeriodSelection(prev=>({...prev,[id]:e.target.value}))}><option value="">Select open period</option>{(periods.data??[]).filter(p=>p.status==='open').map(p=><option key={p.id} value={p.id}>{p.periodKey}</option>)}</select></label><button className="fin-btn" disabled={busy||!periodSelection[id]}>Post depreciation</button></form>}</Row>}):<Blank>No fixed assets have been recorded for this branch.</Blank>}
  </section></div>;
}

function TaxCodes(){
  const {workspace,branch}=useWorkspace();const w=workspace.id,b=branch.id;
  const codes=useQuery({queryKey:['tax-codes',w,b],queryFn:()=>apiTax.codes(w,b),staleTime:60000});
  const summary=useQuery({queryKey:['tax-summary',w,b],queryFn:()=>apiTax.summary(w,b),staleTime:30000});
  return <div className="fin-stack"><FormErrors items={[codes,summary]}/><section className="fin-panel"><div className="fin-heading-row"><div><h2>Approved tax configuration</h2><p>Transaction tax treatment is determined by effective, reviewed rule versions—not manually entered estimates.</p></div><Link to="/modules/tax-documents" className="fin-btn">Regulatory references <ArrowRight size={14}/></Link></div>
    {codes.isPending?<p className="fin-loading">Loading tax codes…</p>:codes.isError?null:codes.data?.length?<div className="fin-table-scroll"><table className="fin-table"><thead><tr><th>Code</th><th>Treatment</th><th>Rate</th><th>Approval</th></tr></thead><tbody>{codes.data.map(c=><tr key={c.id}><td>{c.code}</td><td>{c.name}</td><td>{(c.rateBasisPoints/100).toLocaleString(undefined,{maximumFractionDigits:2})}%</td><td>{c.ruleStatus??'Not yet reviewed'}</td></tr>)}</tbody></table></div>:<Blank>No verified tax codes have been configured.</Blank>}
  </section><section className="fin-panel"><h2>Recorded tax by code</h2><p>Actual tax amounts from transactions, where recorded.</p>{summary.isSuccess&&summary.data.length?<BarBreakdownChart title="Tax amounts" points={summary.data.map(r=>({label:r.taxCode,value:r.taxMinor}))} formatValue={n=>money(n,workspace.currency||'UGX')}/>:summary.isPending?<p className="fin-loading">Loading tax totals…</p>:summary.isError?null:<Blank>No taxable transactions have been recorded.</Blank>}</section><TaxEducation/></div>;
}

function TaxEducation(){return <section className="fin-panel fin-tax-guidance"><div className="fin-heading-row"><div><h2>Uganda tax & EFRIS guidance</h2><p>Regulatory reference only · Updated October 2026 · No live URA connection</p></div><ShieldCheck size={21}/></div>
    <div className="fin-education-grid"><article><strong>VAT registration</strong><p>URA's notice published 30 October 2026 confirms an annual VAT registration threshold of UGX 300 million, effective 1 July 2026. The standard VAT rate remains 18% on standard-rated supplies.</p></article><article><strong>EFRIS</strong><p>EFRIS is URA's electronic fiscal receipting and invoicing system. It is not an extra tax. VAT-registered businesses and designated sectors must comply with their applicable invoicing obligations.</p></article><article><strong>Other business taxes</strong><p>Corporate income tax, withholding tax, presumptive tax and PAYE depend on the taxpayer and transaction. Apply only approved, effective rule versions; consult URA for eligibility and filing requirements.</p></article></div>
    <p className="fin-footnote">LEXA does not submit documents to URA or generate official fiscal verification codes. <a href="https://ura.go.ug/en/" target="_blank" rel="noopener noreferrer">Uganda Revenue Authority <ArrowRight size={14}/></a></p>
  </section>;}

function Budgets(){
  const {workspace,branch}=useWorkspace();const w=workspace.id,b=branch.id,currency=workspace.currency||'UGX';const qc=useQueryClient();
  const budgets=useQuery({queryKey:['finance-budgets',w,b],queryFn:()=>apiFinanceIntelligence.budgets(w,b),staleTime:25000});
  const centres=useQuery({queryKey:['ws-finance-centres',w,b],queryFn:()=>apiFinanceOperations.costCentres(w,b),staleTime:60000});
  const periods=useQuery({queryKey:['general-ledger-periods',w],queryFn:()=>apiGeneralLedger.periods({workspaceId:w,branchId:b}),staleTime:60000});
  const [forecastEnabled,setForecastEnabled]=useState(false);
  const forecast=useQuery({queryKey:['finance-python-cash-forecast',w,b],queryFn:()=>apiFinanceIntelligence.cashForecast(w,b),staleTime:60000,enabled:forecastEnabled,retry:0});
  const change=useMutation({mutationFn:async(fn:()=>Promise<unknown>)=>fn(),onSuccess:async()=>{toast.success('Budget updated');await qc.invalidateQueries({queryKey:['finance-budgets',w,b]});},onError:e=>toast.error(e instanceof Error?e.message:'Budget action failed')});
  async function add(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;const d=new FormData(form);try{const plannedMinor=positive(d,'planned',currency);await change.mutateAsync(()=>apiFinanceIntelligence.createBudget(w,b,{costCentreId:input(d,'costCentre'),accountingPeriodId:input(d,'period'),plannedMinor}));form.reset();}catch(err){if(!(err instanceof Error)||!err.message.includes('Budget'))toast.error(err instanceof Error?err.message:'Invalid budget details');}}
  return <div className="fin-stack"><FormErrors items={[budgets,centres,periods]}/><section className="fin-panel"><h2>Cost-centre budgets</h2><p>Planned amounts require independent approval. Actual spending comes from posted cost-centre allocations; purchase commitments are not yet available.</p>
    <details className="fin-form-reveal"><summary><Plus size={15}/> New budget plan</summary><form className="fin-fields fin-form-grid" onSubmit={e=>void add(e)}><label>Cost centre<select name="costCentre" required defaultValue=""><option value="">Select cost centre</option>{(centres.data??[]).map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.code)} · {String(c.name)}</option>)}</select></label><label>Accounting period<select name="period" required defaultValue=""><option value="">Select open period</option>{(periods.data??[]).filter(p=>p.status==='open').map(p=><option key={p.id} value={p.id}>{p.periodKey}</option>)}</select></label><label>Planned amount ({currency})<input name="planned" type="number" required min="1" step={fractionDigitsForCurrency(currency)===0?'1':'0.01'}/></label><AmountFormButton saving={change.isPending}>Save draft budget</AmountFormButton></form></details>
    {budgets.isPending?<p className="fin-loading">Loading budgets…</p>:budgets.isError?null:budgets.data?.length?budgets.data.map(x=><Row key={x.id} title={`${x.costCentreName} · ${x.periodKey}`} detail={`${x.status.replaceAll('_',' ')} · Planned ${money(x.plannedMinor,currency)} · Actual ${money(x.actualMinor,currency)} · Commitments unavailable`} amount={money(Number(x.plannedMinor)-Number(x.actualMinor),currency)}>{x.status==='draft'&&<button className="fin-btn" disabled={change.isPending} onClick={()=>change.mutate(()=>apiFinanceIntelligence.submitBudget(w,b,x.id))}>Submit for approval</button>}{x.status==='submitted'&&<button className="fin-btn" disabled={change.isPending} onClick={()=>change.mutate(()=>apiFinanceIntelligence.approveBudget(w,b,x.id))}>Approve plan</button>}</Row>):<Blank>No cost-centre budgets have been created. Create a real cost centre before setting a plan.</Blank>}
    {budgets.isSuccess&&budgets.data.some(x=>x.status==='approved')&&<BarBreakdownChart title="Posted spending on approved cost centres" points={budgets.data.filter(x=>x.status==='approved').map(x=>({label:`${x.costCentreName} · ${x.periodKey}`,value:Number(x.actualMinor)}))} formatValue={n=>money(n,currency)}/>}
  </section><section className="fin-panel"><div className="fin-heading-row"><div><h2>Cash-flow analysis</h2><p>Read-only Python analysis of posted cash and bank ledger totals.</p></div><button type="button" className="fin-btn" onClick={()=>setForecastEnabled(true)} disabled={forecast.isFetching}><CalendarClock size={15}/>{forecastEnabled?'Recalculate forecast':'Analyse posted history'}</button></div>
    {!forecastEnabled?<Blank>Run the analysis once real cash movements have been posted. No sample financial data is used.</Blank>:forecast.isPending?<p className="fin-loading">Calculating forecast from recorded transactions…</p>:forecast.isError?<ErrorNotice error={forecast.error} onRetry={()=>void forecast.refetch()}/>:forecast.data?.forecast.length?<><LineTrendChart title="Projected net monthly cash movement" description="Three-month weighted moving-average estimate" points={forecast.data.forecast.map(x=>({label:x.month,value:x.netMinor/10**fractionDigitsForCurrency(currency)}))} currencyFormatter={n=>money(Math.round(n*10**fractionDigitsForCurrency(currency)),currency)}/><p className="fin-footnote">{forecast.data.disclaimer} · Generated {new Date(forecast.data.generatedAt).toLocaleString()}</p></>:<Blank>{forecast.data?.disclaimer??'No verified history is available yet.'}</Blank>}
  </section></div>;
}

export default function FinanceWorkspacePage({moduleId}:{moduleId:FinanceModule}){
  const {branch}=useWorkspace();const m=meta[moduleId];
  return <main className="fin-page" data-module-accent="sapphire"><header className="fin-module-header"><div><Link to="/modules/finance-overview" className="fin-back"><Landmark size={15}/> Finance overview <ArrowRight size={13}/></Link><h1>{m.title}</h1><p>{m.subtitle} · {branch.name}</p></div><span className="fin-module-security"><ShieldCheck size={15}/> Business data only</span></header>
    <FinanceSectionNav/>
    {moduleId==='expenses'&&<ExpenseApprovalPanel/>}
    {moduleId==='cash-sessions'&&<CashSessions/>}
    {moduleId==='money-accounts'&&<MoneyAccounts/>}
    {moduleId==='payments'&&<ReceiptsPayments/>}
    {moduleId==='chart-of-accounts'&&<ChartAccounts/>}
    {moduleId==='tax-codes'&&<TaxCodes/>}
    {moduleId==='bank-reconciliation'&&<BankReconciliationPanel/>}
    {moduleId==='assets'&&<FixedAssets/>}
    {moduleId==='cost-centers'&&<CostCentres/>}
    {moduleId==='budgets'&&<Budgets/>}
    <footer className="fin-timestamp">All financial records are scoped to the active business and branch. Unavailable data is never substituted with demo transactions.</footer>
  </main>;
}
