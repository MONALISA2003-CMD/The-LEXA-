import {useState} from 'react';
import {Link} from 'react-router';
import {useQuery} from '@tanstack/react-query';
import {ArrowUpRight,RotateCcw,Search,ShieldCheck} from 'lucide-react';
import {useWorkspace} from '../../app/WorkspaceContext';
import {sales} from '../../data/repositories';
import {apiSellingInsights} from '../../data/remote/apiSellingInsights';
import {formatMinorAmount} from '../../domain/money/money';
import type {Sale} from '../../domain/shared/types';
import SellingNav from './SellingNav';
import './selling-returns.css';

export default function SellingReturnsPage(){
 const {workspace,branch}=useWorkspace();
 const [search,setSearch]=useState('');
 const recent=useQuery({queryKey:['sales',workspace.id],queryFn:()=>sales.list({workspaceId:workspace.id,limit:500}),staleTime:45000});
 const results=useQuery({queryKey:['selling-sale-search',workspace.id,branch.id,search.trim()],
   queryFn:()=>apiSellingInsights.lookup(workspace.id,branch.id,search.trim()),enabled:search.trim().length>=3,retry:1});
 const summary=useQuery({queryKey:['selling-insights',workspace.id,branch.id],queryFn:()=>apiSellingInsights.get(workspace.id,branch.id),staleTime:60000});
 const visible:Sale[]=search.trim().length>=3?(results.data??[]):(recent.data??[]).filter(row=>row.branchId===branch.id).slice(0,20);
 return <main className="page-stack selling-returns-page" data-module-accent="coral">
  <SellingNav/>
  <section className="section-card selling-return-head"><div><span className="selling-eyebrow">RETURNS & REFUNDS</span><h2>Start with the original receipt</h2><p>Choose the sale, inspect the returned items and record the right refund or customer credit. The original sale remains in your records.</p></div><RotateCcw size={31}/></section>
  <section className="selling-return-stats">
   <article><span>Returned this month</span><strong>{summary.data?formatMinorAmount(summary.data.totals.returnedMinor,workspace.currency):'—'}</strong></article>
   <article><span>Refunds recorded</span><strong>{summary.data?formatMinorAmount(summary.data.totals.refundMinor,workspace.currency):'—'}</strong></article>
   <article><span>Recorded reasons</span><strong>{summary.data?summary.data.returnReasons.length:'—'}</strong></article>
  </section>
  <section className="section-card selling-return-panel"><h3>Find a sale to return</h3>
   <label className="selling-return-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Receipt number, customer name or phone" aria-label="Search for an original sale"/></label>
   <p className="selling-field-help">Search at least three characters to find older receipts. For a recent sale, choose from the list below.</p>
   {(results.isError||recent.isError)&&<div className="selling-error">Receipts could not be loaded. Please try again. <button onClick={()=>void (search.trim().length>=3?results.refetch():recent.refetch())}>Retry</button></div>}
   {(results.isFetching&&search.trim().length>=3||recent.isLoading)&&<p>Looking up sales…</p>}
   <div className="selling-return-list">
     {visible.map(s=><Link key={s.id} to={'/sales/'+encodeURIComponent(s.id)}>
       <div><strong>{s.receiptNumber}</strong><small>{s.customerName||'Walk-in customer'} · {new Date(s.createdAt).toLocaleDateString('en-UG')}</small></div>
       <strong>{formatMinorAmount(s.totalMinor,workspace.currency)}</strong><ArrowUpRight size={17}/>
     </Link>)}
   </div>
   {!visible.length&&!results.isFetching&&!recent.isLoading&&<p className="selling-muted">{search?'No matching sale found. Check the receipt number.':'No completed sales to show.'}</p>}
  </section>
  <section className="section-card selling-return-panel"><h3>Why customers returned items</h3>
   <p className="selling-field-help">Recorded reasons for the current reporting period—not estimates.</p>
   {summary.isError&&<div className="selling-error">Return trends could not be loaded. <button onClick={()=>void summary.refetch()}>Try again</button></div>}
   <div className="selling-return-reasons">{(summary.data?.returnReasons??[]).map(row=><div key={row.reason}>
      <span>{row.reason}</span><strong>{row.count} returns</strong><span>{formatMinorAmount(row.amountMinor,workspace.currency)}</span>
    </div>)}{!summary.isLoading&&!summary.data?.returnReasons.length&&<p>No returns were recorded for this period.</p>}</div>
   <div className="selling-return-safety"><ShieldCheck size={17}/><span>Resellable items go back to available stock only when accepted. Damaged goods remain separated. Every refund links to its original payment and sale.</span></div>
  </section>
 </main>;
}

