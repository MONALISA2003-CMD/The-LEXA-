import {useMemo,useState,type FormEvent} from 'react';
import {useNavigate} from 'react-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {FileText,Plus,Trash2,CheckCircle2,ArrowRight,Printer} from 'lucide-react';
import {useWorkspace} from '../../app/WorkspaceContext';
import {useModuleRecordService} from '../../data/providers/ModuleRecordServiceProvider';
import {products} from '../../data/repositories';
import {apiSellingPrices} from '../../data/remote/apiSellingPrices';
import {apiCommerce} from '../../data/remote/apiCommerce';
import {formatMinorAmount,minorUnitFactor,parseMajorAmount} from '../../domain/money/money';
import type {PreviewRecord} from '../operations/moduleCatalog';
import SellingNav from './SellingNav';
import './selling-quotations.css';

type DraftLine={id:string;productId:string;quantity:string;price:string;discount:string};
const emptyLine=():DraftLine=>({id:crypto.randomUUID(),productId:'',quantity:'1',price:'',discount:'0'});
const today=()=>new Date().toISOString().slice(0,10);

export default function SellingQuotationsPage(){
 const {workspace,branch}=useWorkspace(),service=useModuleRecordService(),client=useQueryClient(),navigate=useNavigate();
 const scope={workspaceId:workspace.id,branchId:branch.id},factor=minorUnitFactor(workspace.currency);
 const quotes=useQuery({queryKey:['module-register',workspace.id,branch.id,'quotations'],
  queryFn:()=>service.list(scope,'quotations',[]),staleTime:15000});
 const customers=useQuery({queryKey:['module-register',workspace.id,branch.id,'customers'],
  queryFn:()=>service.list(scope,'customers',[]),staleTime:60000});
 const catalogue=useQuery({queryKey:['products',workspace.id],queryFn:()=>products.list({workspaceId:workspace.id,activeOnly:true})});
 const prices=useQuery({queryKey:['checkout-approved-prices',workspace.id],queryFn:()=>apiSellingPrices.active(workspace.id),staleTime:60000});
 const [customerId,setCustomerId]=useState(''),[validUntil,setValidUntil]=useState(''),[notes,setNotes]=useState('');
 const [priceListId,setPriceListId]=useState(''),[lines,setLines]=useState<DraftLine[]>([emptyLine()]);
 const [activeQuote,setActiveQuote]=useState<PreviewRecord|null>(null),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false);
 const activePriceList=prices.data?.find(x=>x.id===priceListId);
 const prepared=useMemo(()=>lines.map(l=>{
  const quantity=Number(l.quantity),discount=Number(l.discount);
  let price=0;
  try{price=parseMajorAmount(l.price||'0',workspace.currency);}catch{price=NaN;}
  const effective=Number.isFinite(price)&&Number.isFinite(discount)?Math.round(price*(100-discount)/100):NaN;
  return {productId:l.productId,quantity,unitPriceMinor:effective,lineTotalMinor:Math.round(effective*quantity)};
 }),[lines,workspace.currency]);
 const totalMinor=prepared.reduce((v,x)=>v+(Number.isFinite(x.lineTotalMinor)?x.lineTotalMinor:0),0);
 const byStatus=(status:string)=>quotes.data?.filter(x=>x.status===status).length??0;
 const changeLine=(id:string,patch:Partial<DraftLine>)=>setLines(ls=>ls.map(l=>l.id===id?{...l,...patch}:l));
 const pickProduct=(id:string,productId:string)=>{
  const product=catalogue.data?.find(x=>x.id===productId);
  const price=activePriceList?.items?.find(x=>x.productId===productId&&x.variantId===null)?.unitPriceMinor??product?.sellingPriceMinor??0;
  changeLine(id,{productId,price:String(price/factor)});
 };
 const refresh=async()=>{await Promise.all([client.invalidateQueries({queryKey:['module-register',workspace.id,branch.id,'quotations']}),client.invalidateQueries({queryKey:['commerce-sales-orders',workspace.id,branch.id]}),client.invalidateQueries({queryKey:['selling-insights',workspace.id,branch.id]})]);};
 async function save(e:FormEvent){
  e.preventDefault();
  if(!customerId){toast.error('Choose an existing customer.');return;}
  if(validUntil&&validUntil<today()){toast.error('Choose a quotation validity date that has not passed.');return;}
  if(!prepared.length||prepared.some(l=>!l.productId||!Number.isInteger(l.quantity)||l.quantity<=0||l.quantity>100000||
    !Number.isSafeInteger(l.unitPriceMinor)||l.unitPriceMinor<0||l.lineTotalMinor<0||!Number.isSafeInteger(l.lineTotalMinor))){
    toast.error('Check each product, quantity and price.');return;
  }
  if(new Set(prepared.map(l=>l.productId)).size!==prepared.length){toast.error('Combine repeated products into one quotation line.');return;}
  if(!Number.isSafeInteger(totalMinor)||totalMinor>2_000_000_000){toast.error('Quotation total exceeds the supported amount.');return;}
  const customer=customers.data?.find(x=>x.id===customerId);
  if(!customer){toast.error('The selected customer is unavailable.');return;}
  const id=crypto.randomUUID(),quoteNumber='QUO-'+id.slice(0,8).toUpperCase();
  const record={
    id,quoteNumber,status:'Draft',updatedAt:new Date().toISOString(),issueDate:today(),validUntil:validUntil||today(),
    customer:customer.name||'Customer',customerRecordId:customerId,
    itemSummary:prepared.map(l=>catalogue.data?.find(p=>p.id===l.productId)?.name??'Product').join(', '),
    quoteProductLinesJson:JSON.stringify(prepared.map(l=>({productId:l.productId,quantity:l.quantity,unitPriceMinor:l.unitPriceMinor}))),
    total:String(totalMinor/factor),totalMinor:String(totalMinor),currency:workspace.currency,
    priceListId,notes,
  } as PreviewRecord;
  setBusy(true);
  try{await service.save(scope,'quotations',record,[]);setLines([emptyLine()]);setCustomerId('');setNotes('');setValidUntil('');
   await refresh();toast.success('Quotation saved. Review it before sharing it with your customer.');}
  catch(error){toast.error(error instanceof Error?error.message:'The quotation could not be saved.');}
  finally{setBusy(false);}
 }
 async function changeStatus(record:PreviewRecord,status:'Sent'|'Accepted'|'Declined'){
  if(status==='Accepted'&&!confirmation.trim()){toast.error('Record how your customer accepted this offer.');return;}
  setBusy(true);
  try{
   await service.save(scope,'quotations',{...record,status,updatedAt:new Date().toISOString(),
    ...(status==='Accepted'?{customerAcceptanceReference:confirmation.trim(),acceptedAt:today()}:{})},[]);
   await refresh();setActiveQuote(null);setConfirmation('');
   toast.success(status==='Accepted'?'Customer acceptance recorded. You may now create a sales order.':'Quotation updated.');
  }catch(error){toast.error(error instanceof Error?error.message:'Could not update the quotation.');}
  finally{setBusy(false);}
 }
 async function createOrder(record:PreviewRecord){
  const confirmed=record.customerRecordId;
  let qlines:Array<{productId:string;quantity:number;unitPriceMinor:number}>;
  try{qlines=JSON.parse(record.quoteProductLinesJson??'[]') as typeof qlines;}catch{toast.error('Quotation product details could not be read.');return;}
  if(!confirmed){toast.error('A linked customer is required for a sales order.');return;}
  setBusy(true);
  try{
   const result=await apiCommerce.createSalesOrder(scope,{customerRecordId:confirmed,customerName:record.customer??'',sourceQuotationId:record.id,
     ...(record.validUntil?{expectedDate:record.validUntil}:{}),lines:qlines.map(l=>({productId:l.productId,quantity:l.quantity}))});
   await refresh();toast.success('Sales order created from the agreed quotation: '+result.orderNumber);
   navigate('/modules/sales-orders');
  }catch(error){toast.error(error instanceof Error?error.message:'The sales order could not be created.');}
  finally{setBusy(false);}
 }
 return <main className="page-stack selling-quote-page" data-module-accent="coral">
  <SellingNav/>
  <section className="selling-quote-stats">
   <article><span>All quotations</span><strong>{quotes.data?.length??'—'}</strong></article>
   <article><span>Waiting for customers</span><strong>{byStatus('Sent')}</strong></article>
   <article><span>Accepted</span><strong>{byStatus('Accepted')}</strong></article>
   <article><span>Declined</span><strong>{byStatus('Declined')}</strong></article>
  </section>
  <section className="section-card selling-quote-form"><header><FileText size={23}/><div><h2>Prepare a quotation</h2><p>Choose your customer, add the products and agree on prices before saving.</p></div></header>
   <form className="form-stack" onSubmit={save}>
    <div className="form-two-col">
     <label className="field-label">Customer *<select required value={customerId} onChange={e=>setCustomerId(e.target.value)}>
      <option value="">Choose customer</option>{(customers.data??[]).filter(c=>c.status==='Active').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
     </select></label>
     <label className="field-label">Valid until<input type="date" min={today()} value={validUntil} onChange={e=>setValidUntil(e.target.value)}/></label>
    </div>
    <label className="field-label">Approved pricing (optional)<select value={priceListId} onChange={e=>{
      setPriceListId(e.target.value);
      const chosen=prices.data?.find(p=>p.id===e.target.value);
      setLines(ls=>ls.map(l=>{const product=catalogue.data?.find(p=>p.id===l.productId);const price=chosen?.items?.find(i=>i.productId===l.productId&&i.variantId===null)?.unitPriceMinor??product?.sellingPriceMinor??0;return {...l,price:String(price/factor)};}));
    }}><option value="">Normal product prices</option>{(prices.data??[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <div className="selling-quote-lines"><h3>Products and agreed prices</h3>
     {lines.map((l,i)=><div className="selling-quote-line" key={l.id}>
       <label className="field-label">Product {i+1}<select required value={l.productId} onChange={e=>pickProduct(l.id,e.target.value)}>
         <option value="">Choose product</option>{(catalogue.data??[]).map(p=><option value={p.id} key={p.id}>{p.name} · {p.sku}</option>)}
       </select></label>
       <label className="field-label">Quantity<input min="1" step="1" required type="number" value={l.quantity} onChange={e=>changeLine(l.id,{quantity:e.target.value})}/></label>
       <label className="field-label">Unit price ({workspace.currency})<input min="0" step={factor===1?'1':'0.01'} type="number" required value={l.price} onChange={e=>changeLine(l.id,{price:e.target.value})}/></label>
       <label className="field-label">Discount %<input min="0" max="100" step="0.5" type="number" value={l.discount} onChange={e=>changeLine(l.id,{discount:e.target.value})}/></label>
       <button type="button" title="Remove product" aria-label="Remove product" className="button button-secondary button-small" disabled={lines.length===1} onClick={()=>setLines(ls=>ls.filter(x=>x.id!==l.id))}><Trash2 size={15}/></button>
      </div>)}
      <button type="button" className="button button-secondary button-small" onClick={()=>setLines(ls=>[...ls,emptyLine()])}><Plus size={15}/> Add another product</button>
    </div>
    <label className="field-label">Payment, delivery and warranty terms (optional)<textarea rows={3} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Offer valid for 14 days. Delivery after deposit…"/></label>
    <div className="selling-quote-submit"><div><span>Quotation total</span><strong>{formatMinorAmount(totalMinor,workspace.currency)}</strong></div><button className="button button-primary" disabled={busy} type="submit"><CheckCircle2 size={17}/> Save quotation</button></div>
    <p className="selling-footnote">A quotation is an offer, not a sale. Saving it does not reduce stock or record income. Tax details must follow your approved product/tax setup and any required URA document.</p>
   </form>
  </section>
  <section className="section-card selling-quote-form"><h2>Your quotations</h2>
   {quotes.isError&&<div className="selling-error">Your quotations could not be loaded. <button onClick={()=>void quotes.refetch()}>Try again</button></div>}
   <div className="selling-quote-list">{(quotes.data??[]).map(q=><article key={q.id}>
    <div><strong>{q.quoteNumber||'Quotation'}</strong><span>{q.customer} · {q.status}</span><small>Valid until {q.validUntil||'Not set'}</small></div>
    <strong>{formatMinorAmount(Number(q.totalMinor)||0,workspace.currency)}</strong>
    <button className="button button-secondary button-small" onClick={()=>{setActiveQuote(q);setConfirmation('')}}>Details <ArrowRight size={15}/></button>
   </article>)}</div>
   {!quotes.isLoading&&!quotes.data?.length&&<p className="selling-muted">No quotations yet. Create your first offer above.</p>}
  </section>
  {activeQuote&&<div className="selling-quote-modal" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setActiveQuote(null)}}>
    <section role="dialog" aria-modal="true" aria-label="Quotation details" className="section-card selling-quote-dialog">
     <header><div><span className="selling-eyebrow">CUSTOMER OFFER</span><h2>{activeQuote.quoteNumber}</h2><p>{activeQuote.customer} · {activeQuote.status}</p></div><button type="button" onClick={()=>setActiveQuote(null)} aria-label="Close details">×</button></header>
     <div className="selling-quote-summary"><strong>{formatMinorAmount(Number(activeQuote.totalMinor)||0,workspace.currency)}</strong><span>Valid until {activeQuote.validUntil}</span></div>
     <p className="selling-field-help">{activeQuote.notes||'No additional terms recorded.'}</p>
     {activeQuote.status==='Draft'&&<button className="button button-secondary" disabled={busy} onClick={()=>void changeStatus(activeQuote,'Sent')}>Mark as shared with customer</button>}
     {activeQuote.status==='Sent'&&<><label className="field-label">How did the customer accept? *<input value={confirmation} onChange={e=>setConfirmation(e.target.value)} placeholder="e.g. Signed quotation, customer reference, email confirmation"/></label>
      <button disabled={busy} className="button button-primary" onClick={()=>void changeStatus(activeQuote,'Accepted')}>Record customer acceptance</button>
      <button disabled={busy} className="button button-secondary" onClick={()=>void changeStatus(activeQuote,'Declined')}>Mark declined</button>
     </>}
     {activeQuote.status==='Accepted'&&<button disabled={busy} className="button button-primary" onClick={()=>void createOrder(activeQuote)}><ArrowRight size={16}/> Create real sales order</button>}
     <button type="button" className="button button-secondary" onClick={()=>window.print()}><Printer size={16}/> Print offer</button>
     <button type="button" className="button button-secondary" onClick={()=>setActiveQuote(null)}>Close</button>
    </section>
  </div>}
 </main>;
}

