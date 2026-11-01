import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Banknote, Building2, CircleAlert, RefreshCw, ShieldCheck } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { apiFinanceOperations } from '../../data/remote/apiWorkstream03';
import './workstream-finance.css';

function amount(value: unknown, currency: string) { const n = Number(value ?? 0); try { return new Intl.NumberFormat('en-UG',{style:'currency',currency,maximumFractionDigits:currency==='UGX'?0:2}).format(n/100); } catch { return `${currency} ${(n/100).toLocaleString()}`; } }

export default function FinanceOperationsPanel() {
  const { workspace, branch } = useWorkspace();
  const cache = useQueryClient();
  const [floatValue, setFloatValue] = useState('0');
  const [counted, setCounted] = useState<Record<string,string>>({});
  const keys = { cash:['ws-finance-cash',workspace.id,branch.id], expenses:['ws-finance-expenses',workspace.id,branch.id], assets:['ws-finance-assets',workspace.id,branch.id], credits:['ws-finance-credits',workspace.id,branch.id], banks:['ws-finance-banks',workspace.id,branch.id], centres:['ws-finance-centres',workspace.id,branch.id] };
  const cash = useQuery({queryKey:keys.cash,queryFn:()=>apiFinanceOperations.cashSessions(workspace.id,branch.id)});
  const expenses = useQuery({queryKey:keys.expenses,queryFn:()=>apiFinanceOperations.expenses(workspace.id,branch.id)});
  const assets = useQuery({queryKey:keys.assets,queryFn:()=>apiFinanceOperations.fixedAssets(workspace.id,branch.id)});
  const credits = useQuery({queryKey:keys.credits,queryFn:()=>apiFinanceOperations.creditNotes(workspace.id,branch.id)});
  const banks = useQuery({queryKey:keys.banks,queryFn:()=>apiFinanceOperations.bankAccounts(workspace.id,branch.id)});
  const centres = useQuery({queryKey:keys.centres,queryFn:()=>apiFinanceOperations.costCentres(workspace.id,branch.id)});
  async function refresh() { await Promise.all(Object.values(keys).map(queryKey=>cache.invalidateQueries({queryKey}))); }
  const open = useMutation({mutationFn:()=>apiFinanceOperations.openCashSession(workspace.id,branch.id,Math.round(Number(floatValue)*100)),onSuccess:async()=>{toast.success('Cash session opened');await refresh();},onError:(e)=>toast.error(e instanceof Error?e.message:'Could not open cash session')});
  const close = useMutation({mutationFn:({id,value}:{id:string;value:number})=>apiFinanceOperations.closeCashSession(workspace.id,branch.id,id,value),onSuccess:async()=>{toast.success('Cash session closed and cash-up prepared');await refresh();},onError:(e)=>toast.error(e instanceof Error?e.message:'Could not close cash session')});
  const currency = workspace.currency || 'UGX';
  const error = [cash,expenses,assets,credits,banks,centres].find(q=>q.isError)?.error;
  return <main className="ws-finance-page">
    <header className="ws-finance-header"><div><span>FINANCE OPERATIONS</span><h2>Cash, controls & fixed assets</h2><p>Branch: {branch.name}. These operational records are stored in PostgreSQL and linked to the finance ledger.</p></div><button type="button" onClick={()=>void refresh()}><RefreshCw size={15}/> Refresh</button></header>
    <div className="ws-finance-note"><ShieldCheck size={18}/><div><strong>Tenant and branch scoped</strong><p>Records are loaded from the active workspace and branch. Mutations are protected by server-side permissions, CSRF checks and idempotency keys.</p></div></div>
    {error && <div className="ws-finance-error"><CircleAlert size={16}/>{error instanceof Error?error.message:'Some finance data could not be loaded.'}</div>}
    <section className="ws-finance-card"><div className="ws-finance-card-head"><div><h3>Cash sessions & cash-ups</h3><p>Opening float, movements, counted closing balance and variance.</p></div><Banknote size={20}/></div>
      <form className="ws-finance-inline-form" onSubmit={e=>{e.preventDefault();open.mutate();}}><label>Opening float ({currency})<input type="number" min="0" step="0.01" value={floatValue} onChange={e=>setFloatValue(e.target.value)}/></label><button disabled={open.isPending} type="submit">{open.isPending?'Opening…':'Open cash session'}</button></form>
      {cash.isLoading?<p>Loading cash sessions…</p>:<div className="ws-finance-list">{(cash.data??[]).map(row=>{const id=String(row.id);return <article key={id}><div><strong>{String(row.sessionNumber??id)}</strong><small>{String(row.status)} · opened {String(row.openedAt??'')}</small><span>Expected: {amount(row.expectedClosingMinor??row.openingFloatMinor,currency)}</span></div>{row.status==='open'&&<form onSubmit={e=>{e.preventDefault();close.mutate({id,value:Math.round(Number(counted[id]??'0')*100)});}}><label>Counted close<input type="number" min="0" step="0.01" value={counted[id]??''} onChange={e=>setCounted(v=>({...v,[id]:e.target.value}))} required/></label><button disabled={close.isPending} type="submit">Close & cash-up</button></form>}</article>;})}{!cash.data?.length&&<p>No cash sessions recorded for this branch.</p>}</div>}
    </section>
    <div className="ws-finance-grid">
      <section className="ws-finance-card"><div className="ws-finance-card-head"><div><h3>Expenses</h3><p>Approved expenses create ledger journals.</p></div></div><div className="ws-finance-list">{(expenses.data??[]).map(row=><article key={String(row.id)}><div><strong>{String(row.description??row.expenseNumber)}</strong><small>{String(row.status)} · {String(row.expenseDate??'')}</small><span>{amount(row.totalMinor,currency)}</span></div></article>)}{!expenses.data?.length&&<p>No expenses recorded.</p>}</div></section>
      <section className="ws-finance-card"><div className="ws-finance-card-head"><div><h3>Fixed assets</h3><p>Asset register and straight-line depreciation.</p></div></div><div className="ws-finance-list">{(assets.data??[]).map(row=><article key={String(row.id)}><div><strong>{String(row.name)}</strong><small>{String(row.assetNumber)} · {String(row.status)}</small><span>{amount(row.acquisitionCostMinor,currency)}</span></div></article>)}{!assets.data?.length&&<p>No fixed assets recorded.</p>}</div></section>
      <section className="ws-finance-card"><div className="ws-finance-card-head"><div><h3>Credit notes</h3><p>Issued against accepted sales returns.</p></div></div><div className="ws-finance-list">{(credits.data??[]).map(row=><article key={String(row.id)}><div><strong>{String(row.creditNoteNumber)}</strong><small>{String(row.status)} · {String(row.reason??'')}</small><span>{amount(row.totalMinor,currency)}</span></div></article>)}{!credits.data?.length&&<p>No credit notes recorded.</p>}</div></section>
      <section className="ws-finance-card"><div className="ws-finance-card-head"><div><h3>Bank accounts</h3><p>Configured bank accounts for reconciliation.</p></div><Building2 size={20}/></div><div className="ws-finance-list">{(banks.data??[]).map(row=><article key={String(row.id)}><div><strong>{String(row.name)}</strong><small>{String(row.accountNumberMasked??row.bankName??'')}</small><span>{String(row.currency??currency)} · {String(row.status??'active')}</span></div></article>)}{!banks.data?.length&&<p>No bank accounts configured.</p>}</div></section>
      <section className="ws-finance-card"><div className="ws-finance-card-head"><div><h3>Cost centres</h3><p>Dimensions available for operational allocations.</p></div></div><div className="ws-finance-list">{(centres.data??[]).map(row=><article key={String(row.id)}><div><strong>{String(row.name)}</strong><small>{String(row.code)}</small></div></article>)}{!centres.data?.length&&<p>No cost centres configured.</p>}</div></section>
    </div>
  </main>;
}
