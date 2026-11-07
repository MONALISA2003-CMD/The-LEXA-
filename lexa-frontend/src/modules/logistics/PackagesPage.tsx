
import {useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {Box,Boxes,CheckCircle2,Package,PackageCheck,Printer,ScanBarcode,ShieldCheck,XCircle} from '../../components/LexaIcon';
import JsBarcode from 'jsbarcode';
import {useWorkspace} from '../../app/WorkspaceContext';
import {apiCommerce} from '../../data/remote/apiCommerce';
import {apiLogisticsPackages,type LogisticsPackage} from '../../data/remote/apiLogisticsPackages';
import {products} from '../../data/repositories';
import {BarcodeCapture} from '../../components/barcode/BarcodeCapture';
import LogisticsHeader from './LogisticsHeader';
import './logistics-violet.css';
import './packages.css';

function PackingSlip({pkg,business,timezone}:{pkg:LogisticsPackage;business:string;timezone:string}){
 const barcode=useRef<SVGSVGElement>(null);
 useEffect(()=>{if(barcode.current)JsBarcode(barcode.current,pkg.packageNumber,{format:'CODE128',lineColor:'#1d2042',width:1.5,height:56,fontSize:11,displayValue:true,margin:0});},[pkg.packageNumber]);
 return <article className="package-print-target" aria-label="Packing slip">
  <header><strong>{business}</strong><small>PACKING SLIP · CUSTOMER GOODS</small></header>
  <div className="package-print-code"><svg ref={barcode} role="img" aria-label={'Parcel barcode '+pkg.packageNumber}/></div>
  <div className="package-print-row"><span>Package</span><b>{pkg.packageNumber}</b></div>
  <div className="package-print-row"><span>Order</span><b>{pkg.orderNumber}</b></div>
  <div className="package-print-row"><span>Packed on</span><b>{new Date(pkg.packedAt).toLocaleString('en-UG',{timeZone:timezone})}</b></div>
  <div className="package-print-row"><span>Customer</span><b>{pkg.customerName||'Customer'}</b></div>
  <div className="package-print-row"><span>Recipient</span><b>{pkg.recipientName||pkg.customerName||'Customer'}</b></div>
  {pkg.recipientPhone&&<div className="package-print-row"><span>Phone</span><b>{pkg.recipientPhone}</b></div>}
  {pkg.deliveryAddress&&<div className="package-print-row"><span>Destination</span><b>{pkg.deliveryAddress}</b></div>}
  <table><thead><tr><th>Item</th><th>SKU</th><th>Qty</th></tr></thead>
   <tbody>{pkg.lines.map(item=><tr key={item.id}><td>{item.productName}</td><td>{item.sku}</td><td>{item.quantity}</td></tr>)}</tbody>
  </table>
  <div className="package-print-row"><span>Number of items</span><b>{pkg.lines.reduce((v,l)=>v+l.quantity,0)}</b></div>
  {pkg.weightKg!==null&&<div className="package-print-row"><span>Weight</span><b>{pkg.weightKg} kg</b></div>}
  {pkg.handlingNotes&&<p>Handling: {pkg.handlingNotes}</p>}
  {pkg.sealNumber&&<div className="package-print-row"><span>Seal reference</span><b>{pkg.sealNumber}</b></div>}
  <footer>Checked and packed by {business} · Please confirm items at delivery.</footer>
 </article>;
}
const goodStatuses=['confirmed','partially_fulfilled'];
export default function PackagesPage(){
 const {workspace,branch}=useWorkspace(),client=useQueryClient();
 const scope={workspaceId:workspace.id,branchId:branch.id};
 const packages=useQuery({queryKey:['logistics-packages',workspace.id,branch.id],queryFn:()=>apiLogisticsPackages.list(scope),staleTime:20000});
 const orders=useQuery({queryKey:['commerce-sales-orders',workspace.id,branch.id],queryFn:()=>apiCommerce.listSalesOrders(scope),staleTime:20000});
 const catalogue=useQuery({queryKey:['products',workspace.id],queryFn:()=>products.list({workspaceId:workspace.id,activeOnly:true}),staleTime:60000});
 const [orderId,setOrderId]=useState(''),[quantities,setQuantities]=useState<Record<string,string>>({});
 const [recipient,setRecipient]=useState(''),[phone,setPhone]=useState(''),[address,setAddress]=useState('');
 const [weight,setWeight]=useState(''),[length,setLength]=useState(''),[width,setWidth]=useState(''),[height,setHeight]=useState('');
 const [handling,setHandling]=useState(''),[seal,setSeal]=useState('');
 const [busy,setBusy]=useState(false),[selected,setSelected]=useState<LogisticsPackage|null>(null);
 const [search,setSearch]=useState('');
 const selectedOrder=orders.data?.find(o=>o.id===orderId);
 const active=(packages.data??[]).filter(p=>!['cancelled','delivered','returned','dispatched'].includes(p.status));
 const remaining=useMemo(()=>{
  const pending=new Map<string,number>();
  for(const pkg of active.filter(p=>p.orderId===orderId)){
   for(const line of pkg.lines)pending.set(line.orderLineId,(pending.get(line.orderLineId)??0)+line.quantity);
  }
  return (selectedOrder?.lines??[]).map(l=>({...l,remaining:Math.max(0,l.quantity-(l.quantityFulfilled??0)-(pending.get(l.id??'')??0))}));
 },[selectedOrder,active,orderId]);
 const shown=(packages.data??[]).filter(p=>(p.packageNumber+' '+p.orderNumber+' '+p.customerName+' '+p.status).toLowerCase().includes(search.toLowerCase()));
 const refresh=async()=>{await Promise.all([client.invalidateQueries({queryKey:['logistics-packages',workspace.id,branch.id]}),
  client.invalidateQueries({queryKey:['commerce-sales-orders',workspace.id,branch.id]}),
  client.invalidateQueries({queryKey:['module-register',workspace.id,branch.id,'packages']})]);};
 function selectOrder(value:string){setOrderId(value);setQuantities({});const o=orders.data?.find(x=>x.id===value);
  setRecipient(o?.customerName??'');setAddress(o?.deliveryAddress??'');}
 function scan(code:string){
  const found=remaining.find(l=>{
   const p=catalogue.data?.find(x=>x.id===l.productId);
   return l.sku.toUpperCase()===code.toUpperCase()||p?.barcode?.toUpperCase()===code.toUpperCase()||p?.sku?.toUpperCase()===code.toUpperCase();
  });
  if(!found){toast.error('This barcode is not in the selected order.');return;}
  const cur=Number(quantities[found.id??'']??0);
  if(cur+1>found.remaining){toast.error('All available units of this product are already packed.');return;}
  setQuantities(q=>({...q,[found.id??'']:String(cur+1)}));toast.success(found.productName+' added to the parcel.');
 }
 const validateNumber=(value:string,label:string)=>{if(!value.trim())return undefined;const n=Number(value);
  if(!Number.isFinite(n)||n<0||n>1000000)throw new Error('Enter a valid '+label+'.');
  return n;
 };
 async function create(e:FormEvent){
  e.preventDefault();
  if(!selectedOrder)return;
  const lines=remaining.filter(l=>Number(quantities[l.id??'']??0)>0).map(l=>({orderLineId:l.id??'',quantity:Number(quantities[l.id??''])}));
  if(!lines.length){toast.error('Scan or enter at least one item to pack.');return;}
  if(lines.some(l=>!Number.isFinite(l.quantity)||l.quantity<=0||l.quantity> (remaining.find(x=>x.id===l.orderLineId)?.remaining??0))){
   toast.error('Packed quantities cannot exceed the order balance.');return;
  }
  setBusy(true);
  try{
   const pkg=await apiLogisticsPackages.create(scope,{orderId:selectedOrder.id,recipientName:recipient.trim(),recipientPhone:phone.trim(),deliveryAddress:address.trim(),
     weightKg:validateNumber(weight,'weight'),lengthCm:validateNumber(length,'length'),widthCm:validateNumber(width,'width'),heightCm:validateNumber(height,'height'),
     handlingNotes:handling.trim(),sealNumber:seal.trim(),lines});
   await refresh();setQuantities({});setWeight('');setLength('');setWidth('');setHeight('');setHandling('');setSeal('');
   setSelected(pkg);toast.success('Package created. Review it and seal it when packed correctly.');
  }catch(error){toast.error(error instanceof Error?error.message:'The package could not be created.');}
  finally{setBusy(false);}
 }
 async function sealPackage(pkg:LogisticsPackage){
  if(!window.confirm('Are the goods checked and the parcel securely packed?'))return;
  setBusy(true);try{const next=await apiLogisticsPackages.seal(scope,pkg.id);await refresh();setSelected(next);toast.success('Package sealed and ready to dispatch.');}
  catch(error){toast.error(error instanceof Error?error.message:'Could not seal this package.');}finally{setBusy(false);}
 }
 async function cancelPackage(pkg:LogisticsPackage){
  const reason=window.prompt('Why is this package being cancelled?');
  if(!reason?.trim())return;
  setBusy(true);try{await apiLogisticsPackages.cancel(scope,pkg.id,reason.trim());await refresh();setSelected(null);toast.success('Package cancelled. Its quantities are available for repacking.');}
  catch(error){toast.error(error instanceof Error?error.message:'Could not cancel this package.');}finally{setBusy(false);}
 }
 const stats=[
  {label:'Packed, awaiting seal',value:(packages.data??[]).filter(p=>p.status==='packed').length},
  {label:'Ready for dispatch',value:(packages.data??[]).filter(p=>p.status==='sealed').length},
  {label:'On the way',value:(packages.data??[]).filter(p=>p.status==='dispatched').length},
  {label:'Delivered',value:(packages.data??[]).filter(p=>p.status==='delivered').length},
 ];
 return <main className="page-stack logistics-page" data-module-accent="violet">
  <LogisticsHeader active="packages"/>
  <section className="logistics-stats">{stats.map(x=><article key={x.label}><span>{x.label}</span><strong>{packages.isError?'—':x.value}</strong></article>)}</section>
  {packages.isError&&<div className="logistics-error" role="alert">We couldn't load your packages. Your records have not changed. <button onClick={()=>void packages.refetch()}>Try again</button></div>}
  <section className="logistics-panel">
   <div className="logistics-section-heading"><div><span className="logistics-eyebrow">PACKING WORKSTATION</span><h2>Prepare a parcel</h2><p>Choose an order, scan the goods and confirm the quantities before sealing.</p></div><PackageCheck size={29}/></div>
   {orders.isError&&<div className="logistics-error">Sales orders could not be loaded. <button onClick={()=>void orders.refetch()}>Retry</button></div>}
   <form onSubmit={create} className="logistics-form">
    <label className="field-label">Confirmed customer order<select required value={orderId} onChange={e=>selectOrder(e.target.value)}>
     <option value="">Choose a sales order</option>{(orders.data??[]).filter(o=>goodStatuses.includes(o.status)).map(o=><option key={o.id} value={o.id}>{o.orderNumber} · {o.customerName||'Customer'}</option>)}
    </select></label>
    {!selectedOrder&&!orders.isLoading&&<p className="logistics-help">Only confirmed orders with goods left to send can be packed. Confirm an order in Sales Orders first.</p>}
    {selectedOrder&&<>
     <div className="logistics-scan"><div className="logistics-scan-title"><ScanBarcode size={17}/><strong>Scan the products into this parcel</strong></div><BarcodeCapture label="Scan an ordered product" compact onCode={scan}/></div>
     <div className="logistics-items">{remaining.map(line=><label key={line.id} className="logistics-item">
       <div><strong>{line.productName}</strong><small>SKU {line.sku} · {line.remaining} remaining to pack</small></div>
       <input aria-label={'Pack quantity for '+line.productName} type="number" min="0" max={line.remaining} step="0.001"
        value={quantities[line.id??'']??'0'} onChange={e=>setQuantities(q=>({...q,[line.id??'']:e.target.value}))}/>
     </label>)}</div>
     <div className="logistics-grid-two">
      <label className="field-label">Recipient name<input value={recipient} maxLength={160} onChange={e=>setRecipient(e.target.value)}/></label>
      <label className="field-label">Recipient phone<input type="tel" value={phone} maxLength={80} onChange={e=>setPhone(e.target.value)} placeholder="+256…"/></label>
     </div>
     <label className="field-label">Delivery address / landmark<input value={address} maxLength={500} onChange={e=>setAddress(e.target.value)} placeholder="Town, area, stage or known landmark"/></label>
     <div className="logistics-grid-four">
      <label className="field-label">Weight (kg)<input type="number" min="0" step="0.001" value={weight} onChange={e=>setWeight(e.target.value)}/></label>
      <label className="field-label">Length (cm)<input type="number" min="0" step="0.01" value={length} onChange={e=>setLength(e.target.value)}/></label>
      <label className="field-label">Width (cm)<input type="number" min="0" step="0.01" value={width} onChange={e=>setWidth(e.target.value)}/></label>
      <label className="field-label">Height (cm)<input type="number" min="0" step="0.01" value={height} onChange={e=>setHeight(e.target.value)}/></label>
     </div>
     <label className="field-label">Fragile items / special care<textarea maxLength={500} rows={2} value={handling} onChange={e=>setHandling(e.target.value)} placeholder="e.g. Glass bottles. Keep upright."/></label>
     <label className="field-label">Seal reference (optional)<input maxLength={100} value={seal} onChange={e=>setSeal(e.target.value)} placeholder="Number on the security seal"/></label>
     <button type="submit" className="logistics-primary" disabled={busy||!remaining.some(l=>l.remaining>0)}><Package size={17}/> {busy?'Saving…':'Create package & print slip'}</button>
     <p className="logistics-help"><ShieldCheck size={15}/> Packing reserves space in a parcel. Stock changes only when the sales order is dispatched. A package never creates a second sale.</p>
    </>}
   </form>
  </section>
  <section className="logistics-panel">
   <div className="logistics-section-heading"><div><span className="logistics-eyebrow">PARCEL REGISTER</span><h2>Packages & their progress</h2></div><Boxes size={25}/></div>
   <label className="logistics-search"><Box size={17}/><input aria-label="Find package" placeholder="Search package, order or customer" value={search} onChange={e=>setSearch(e.target.value)}/></label>
   {packages.isLoading&&<p>Loading packages…</p>}
   {!packages.isLoading&&!shown.length&&<p className="logistics-empty">No packages to show. Pack an order to see it here.</p>}
   <div className="logistics-package-list">{shown.map(pkg=><article key={pkg.id} className="logistics-package-card">
    <div><strong>{pkg.packageNumber}</strong><span>{pkg.orderNumber} · {pkg.customerName||'Customer'}</span><small>{pkg.lines.map(l=>l.productName+' × '+l.quantity).join(', ')}</small></div>
    <span className={'logistics-status logistics-status-'+pkg.status}>{pkg.status.replaceAll('_',' ')}</span>
    <button type="button" className="logistics-quiet" onClick={()=>setSelected(pkg)}>View & print</button>
   </article>)}</div>
  </section>
  {selected&&<div className="logistics-dialog-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}>
   <section role="dialog" aria-label={'Package '+selected.packageNumber} aria-modal="true" className="logistics-dialog">
    <div className="logistics-dialog-heading"><div><span className="logistics-eyebrow">PACKING SLIP</span><h2>{selected.packageNumber}</h2></div><button type="button" aria-label="Close" onClick={()=>setSelected(null)}><XCircle size={21}/></button></div>
    <PackingSlip pkg={selected} business={workspace.businessName} timezone={workspace.timezone}/>
    <div className="logistics-dialog-actions">
     <button type="button" className="logistics-primary" onClick={()=>window.print()}><Printer size={17}/> Print / save PDF</button>
     {selected.status==='packed'&&<button type="button" disabled={busy} className="logistics-secondary" onClick={()=>void sealPackage(selected)}><CheckCircle2 size={16}/> Confirm sealed</button>}
     {['packed','sealed'].includes(selected.status)&&<button type="button" disabled={busy} className="logistics-secondary" onClick={()=>void cancelPackage(selected)}>Cancel this package</button>}
    </div>
   </section>
  </div>}
 </main>;
}

