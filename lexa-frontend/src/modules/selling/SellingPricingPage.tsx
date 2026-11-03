import {useMemo,useState,type FormEvent} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {CheckCircle2,Plus,Tag,ShieldCheck,AlertTriangle} from 'lucide-react';
import {useWorkspace} from '../../app/WorkspaceContext';
import {products} from '../../data/repositories';
import {apiSellingPrices} from '../../data/remote/apiSellingPrices';
import {parseMajorAmount,formatMinorAmount} from '../../domain/money/money';
import SellingNav from './SellingNav';
import './selling-pricing.css';

export default function SellingPricingPage(){
 const {workspace}=useWorkspace();
 const client=useQueryClient();
 const lists=useQuery({queryKey:['selling-price-lists',workspace.id],queryFn:()=>apiSellingPrices.list(workspace.id)});
 const catalogue=useQuery({queryKey:['products',workspace.id],queryFn:()=>products.list({workspaceId:workspace.id,activeOnly:true})});
 const [name,setName]=useState(''),[code,setCode]=useState(''),[from,setFrom]=useState(''),[until,setUntil]=useState('');
 const [selected,setSelected]=useState(''),[productId,setProductId]=useState(''),[price,setPrice]=useState('');
 const [busy,setBusy]=useState(false);
 const activeList=useMemo(()=>lists.data?.find(l=>l.id===selected),[lists.data,selected]);
 const refresh=async()=>{await Promise.all([client.invalidateQueries({queryKey:['selling-price-lists',workspace.id]}),client.invalidateQueries({queryKey:['checkout-approved-prices',workspace.id]})]);};
 async function create(e:FormEvent){
  e.preventDefault();
  if(from&&until&&until<from){toast.error('The end date cannot come before the start date.');return;}
  setBusy(true);
  try{
   const list=await apiSellingPrices.create(workspace.id,{name:name.trim(),code:code.trim(),currency:workspace.currency,...(from?{startsAt:from}:{}),...(until?{endsAt:until}:{})});
   setName('');setCode('');setFrom('');setUntil('');setSelected(list.id);
   await refresh();toast.success('Price list created. Add products before asking the owner to approve it.');
  }catch(error){toast.error(error instanceof Error?error.message:'The price list could not be created.');}
  finally{setBusy(false);}
 }
 async function addProduct(e:FormEvent){
  e.preventDefault();if(!activeList||!productId)return;
  let amount:number;
  try{amount=parseMajorAmount(price,workspace.currency);}catch{toast.error('Enter a valid selling price.');return;}
  setBusy(true);
  try{await apiSellingPrices.addProduct(workspace.id,activeList.id,{productId,unitPriceMinor:amount});setProductId('');setPrice('');await refresh();toast.success('Product price saved.');}
  catch(error){toast.error(error instanceof Error?error.message:'Could not save this price.');}
  finally{setBusy(false);}
 }
 async function switchState(id:string,activate:boolean){
  if(!window.confirm(activate?'Approve this list for checkout and quotations?':'Stop offering these prices?'))return;
  setBusy(true);
  try{
   if(activate)await apiSellingPrices.activate(workspace.id,id);else await apiSellingPrices.deactivate(workspace.id,id);
   await refresh();toast.success(activate?'Selling prices approved and available at checkout.':'Price list withdrawn from checkout.');
  }catch(error){toast.error(error instanceof Error?error.message:'Could not change this price list.');}
  finally{setBusy(false);}
 }
 return <main className="page-stack selling-pricing-page" data-module-accent="coral">
  <SellingNav/>
  <section className="section-card selling-price-intro"><Tag size={25}/><div><h2>Selling prices your team can trust</h2><p>Prepare retail, wholesale or promotional prices. Only the business owner can approve them for checkout. Past receipts keep their original prices.</p></div></section>
  <div className="selling-price-layout">
   <section className="section-card selling-pricing-panel"><h3>Create a price list</h3>
    <form onSubmit={create} className="form-stack">
     <label className="field-label">Price list name<input required maxLength={120} placeholder="e.g. Wholesale November" value={name} onChange={e=>setName(e.target.value)}/></label>
     <label className="field-label">Short reference<input required maxLength={40} placeholder="e.g. WHOLESALE-11" value={code} onChange={e=>setCode(e.target.value)}/></label>
     <div className="form-two-col"><label className="field-label">Valid from (optional)<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="field-label">Valid until (optional)<input type="date" min={from||undefined} value={until} onChange={e=>setUntil(e.target.value)}/></label></div>
     <p className="selling-field-help">All prices use {workspace.currency}. Your normal product prices remain available when no price list is selected.</p>
     <button disabled={busy} type="submit" className="button button-primary"><Plus size={16}/> Create price list</button>
    </form>
   </section>
   <section className="section-card selling-pricing-panel"><h3>Price lists</h3>
    {lists.isLoading&&<p>Loading prices…</p>}{lists.isError&&<div className="selling-error">Could not load prices. <button onClick={()=>void lists.refetch()}>Try again</button></div>}
    {!lists.isLoading&&!lists.data?.length&&<p>No price lists yet. Create one to set special prices.</p>}
    <div className="selling-pricing-list">{(lists.data??[]).map(l=><article key={l.id} className={selected===l.id?'selected':''}>
      <button type="button" className="selling-price-select" onClick={()=>setSelected(l.id)}><strong>{l.name}</strong><small>{l.code} · {l.items?.length??0} products</small></button>
      <span className={l.active?'selling-status-active':'selling-status-draft'}>{l.active?'Approved':'Draft'}</span>
      <button disabled={busy} type="button" className="button button-secondary button-small" onClick={()=>void switchState(l.id,!l.active)}>{l.active?'Withdraw':'Approve'}</button>
     </article>)}</div>
   </section>
  </div>
  {activeList&&<section className="section-card selling-pricing-panel"><div className="selling-price-intro"><ShieldCheck size={21}/><div><h3>{activeList.name}</h3><p>{activeList.active?'Approved and available in checkout':'Draft — add product prices, then ask the CEO to approve it.'}</p></div></div>
   {!activeList.active&&<form className="selling-price-add" onSubmit={addProduct}>
    <label className="field-label">Choose product<select required value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Choose a product</option>{(catalogue.data??[]).map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></label>
    <label className="field-label">Selling price ({workspace.currency})<input required type="number" min="0" step={workspace.currency==='UGX'?'1':'0.01'} value={price} onChange={e=>setPrice(e.target.value)}/></label>
    {(()=>{const selectedProduct=catalogue.data?.find(p=>p.id===productId);return selectedProduct&&Number(price)>0&&Number(price)* (workspace.currency==='UGX'?1:100)<selectedProduct.costPriceMinor?<div className="selling-price-warning"><AlertTriangle size={16}/> This price is below the recorded cost. Review before saving.</div>:null;})()}
    <button disabled={busy||!productId} className="button button-primary" type="submit"><Plus size={15}/> Save product price</button>
   </form>}
   <div className="responsive-table-wrap"><table className="data-table"><thead><tr><th>PRODUCT</th><th>SKU</th><th>APPROVED / PROPOSED PRICE</th></tr></thead><tbody>
    {(activeList.items??[]).map((i,index)=>{const product=catalogue.data?.find(p=>p.id===i.productId);return <tr key={i.productId+'-'+index}><td>{product?.name??'Product not found'}</td><td>{product?.sku??'—'}</td><td>{formatMinorAmount(i.unitPriceMinor,workspace.currency)}</td></tr>;})}
    </tbody></table>{!activeList.items?.length&&<p className="selling-muted">No products have prices on this list yet.</p>}</div>
   <p className="selling-footnote"><CheckCircle2 size={14}/> Changes to approved prices require a new price list. Completed receipts are never rewritten.</p>
  </section>}
 </main>;
}

