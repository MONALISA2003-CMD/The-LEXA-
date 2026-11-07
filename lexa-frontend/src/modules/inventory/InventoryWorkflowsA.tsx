
import {useState,type FormEvent} from 'react';
import {Link} from 'react-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {useWorkspace} from '../../app/WorkspaceContext';
import {products} from '../../data/repositories';
import {apiCatalogInventory} from '../../data/remote/apiWorkstream03';
import {packagesToBase} from '../../domain/catalog/packageQuantity';
import {apiInventoryOperations,type RawInventoryRow} from '../../data/remote/apiInventoryOperations';
import {InventoryFrame,InventoryPanel,InventoryNotice,InventoryStats,InventoryBarChart,InventoryTable,field,number,day,readable} from './InventoryFrame';
import {CheckCircle2,ClipboardCheck,Plus,ShoppingBasket} from '../../components/LexaIcon';

const recordLines=(r:RawInventoryRow|null|undefined):RawInventoryRow[]=>Array.isArray(r?.lines)?r.lines as RawInventoryRow[]:[];
function useInventoryBasics(){
 const {workspace,branch}=useWorkspace();
 const scope={workspaceId:workspace.id,branchId:branch.id};
 const wh=useQuery({queryKey:['supply-warehouses',workspace.id,branch.id],queryFn:()=>apiInventoryOperations.warehouses(scope)});
 const catalogue=useQuery({queryKey:['products',workspace.id],queryFn:()=>products.list({workspaceId:workspace.id,activeOnly:true}),staleTime:60000});
 const intelligence=useQuery({queryKey:['inventory-intelligence',workspace.id,branch.id],queryFn:()=>apiInventoryOperations.intelligence(scope),staleTime:45000});
 const cache=useQueryClient();
 const refresh=async()=>Promise.all([
   cache.invalidateQueries({queryKey:['supply-warehouses',workspace.id,branch.id]}),
   cache.invalidateQueries({queryKey:['inventory-intelligence',workspace.id,branch.id]}),
   cache.invalidateQueries({queryKey:['inventory-balances',workspace.id,branch.id]}),
   cache.invalidateQueries({queryKey:['inventory-movements',workspace.id,branch.id]}),
 ]);
 return {workspace,branch,scope,wh,catalogue,intelligence,cache,refresh};
}
function FormError({error,onRetry}:{error:boolean;onRetry:()=>void}){
 return error?<InventoryNotice retry={onRetry}>We couldn't load these business records. Your stock has not been changed.</InventoryNotice>:null;
}
function WarehouseField({rows,value,onChange,label='Storage location'}:{rows:RawInventoryRow[];value:string;onChange:(x:string)=>void;label?:string}){
 return <label>{label}<select required value={value} onChange={e=>onChange(e.target.value)}><option value="">Choose a storage location</option>
  {rows.map(w=><option key={String(w.id)} value={String(w.id)}>{String(w.name)} ({String(w.code)})</option>)}</select></label>;
}
type ReceiptCount={accepted:string;rejected:string;lot:string;expiry:string;serials:string;variantId:string;packageId:string};
export function GoodsReceivingPage(){
 const {scope,wh,catalogue,intelligence,cache,refresh}=useInventoryBasics();
 const variants=useQuery({queryKey:['all-variants',scope.workspaceId],queryFn:()=>apiCatalogInventory.allVariants(scope.workspaceId)});
 const packages=useQuery({queryKey:['all-product-packages',scope.workspaceId],queryFn:()=>apiCatalogInventory.allProductPackages(scope.workspaceId)});
 const orders=useQuery({queryKey:['supply-purchase-orders',scope.workspaceId,scope.branchId],queryFn:()=>apiInventoryOperations.purchaseOrders(scope)});
 const [poId,setPoId]=useState(''),[warehouseId,setWarehouseId]=useState(''),[receipts,setReceipts]=useState<Record<string,ReceiptCount>>({});
 const [notes,setNotes]=useState(''),[busy,setBusy]=useState(false);
 const selected=orders.data?.find(x=>x.id===poId),lines=recordLines(selected);
 const open=(orders.data??[]).filter(o=>['ordered','partially_received'].includes(String(o.status)));
 const setLine=(id:string,change:Partial<ReceiptCount>)=>setReceipts(r=>({...r,[id]:{accepted:r[id]?.accepted??'0',rejected:r[id]?.rejected??'0',lot:r[id]?.lot??'',expiry:r[id]?.expiry??'',serials:r[id]?.serials??'',variantId:r[id]?.variantId??'',packageId:r[id]?.packageId??'',...change}}));
 async function submit(e:FormEvent){
  e.preventDefault();
  if(!poId||!warehouseId){toast.error('Choose the purchase order and receiving location.');return;}
  let invalid=false;
  const payload=lines.map(l=>{
   const id=String(l.id),form=receipts[id],productId=String(field(l,'product_id','productId'));
   const product=catalogue.data?.find(p=>p.id===productId);
   const pack=(packages.data??[]).find(p=>p.id===form?.packageId&&p.productId===productId&&p.variantId===(form?.variantId||null));
   const acceptedPackages=Number(form?.accepted??0),rejectedPackages=Number(form?.rejected??0);
   let accepted:number,rejected:number;
   try{accepted=pack?packagesToBase(form?.accepted??'0',pack.unitsPerPackage,true):acceptedPackages;
       rejected=pack?packagesToBase(form?.rejected??'0',pack.unitsPerPackage,true):rejectedPackages;}
   catch(error){invalid=true;toast.error(error instanceof Error?error.message:'Invalid package conversion.');return null;}
   const outstanding=number(field(l,'quantity'))-number(field(l,'quantity_accepted','quantityAccepted'))-number(field(l,'quantity_rejected','quantityRejected'));
   if(!Number.isFinite(accepted)||!Number.isFinite(rejected)||accepted<0||rejected<0||accepted+rejected>outstanding+1e-8){invalid=true;toast.error('Accepted and rejected quantities exceed the unreceived order quantity.');return null;}
   const matches=(variants.data??[]).filter(v=>v.productId===productId);
   if(matches.length&&(!form?.variantId||!matches.some(v=>v.id===form.variantId))){invalid=true;toast.error('Choose the exact size, colour or model variant for '+(product?.name??'this product')+'.');return null;}
   if(form?.packageId&&!pack){invalid=true;toast.error('Select a package defined for this product variant.');return null;}
   const serialNumbers=(form?.serials??'').split(/[\n,]+/).map(value=>value.trim()).filter(Boolean).map(value=>{const [primary,second,...extra]=value.split('|').map(x=>x.trim());return second?{serialNumber:primary??'',imei2:second,...(extra.length?{extraImeis:extra}:{})}:primary??'';});
   if((form?.serials??'').split(/[\n,]+/).some(value=>value.split('|').length>8)){invalid=true;toast.error('Enter one device per line: IMEI 1 | optional IMEI 2 | additional assigned IMEIs.');return null;}
   if(product?.trackSerial&&accepted>0&&(!Number.isSafeInteger(accepted)||serialNumbers.length!==accepted)){
    invalid=true;toast.error('Enter one IMEI or serial per accepted physical unit of '+product.name+'.');return null;
   }
   return {purchaseOrderLineId:id,...(form?.variantId?{variantId:form.variantId}:{}),
      ...(pack?{packageId:pack.id,packagesAccepted:acceptedPackages,packagesRejected:rejectedPackages}:{quantityAccepted:accepted,quantityRejected:rejected}),
      ...(form?.lot?{batchNumber:form.lot}:{}),...(form?.expiry?{expiryDate:form.expiry}:{}),...(product?.trackSerial?{serialNumbers}:{})};
  }).filter((x):x is NonNullable<typeof x>=>x!==null).filter(x=>{
   const acceptedQuantity='packagesAccepted' in x ? x.packagesAccepted : x.quantityAccepted;
   const rejectedQuantity='packagesRejected' in x ? x.packagesRejected : x.quantityRejected;
   return Number(acceptedQuantity??0)+Number(rejectedQuantity??0)>0;
  });
  if(invalid)return;
  if(!payload.length){toast.error('Enter at least one valid received quantity.');return;}
  setBusy(true);
  try{await apiInventoryOperations.receive(scope,poId,{warehouseId,notes,lines:payload});await refresh();
   await cache.invalidateQueries({queryKey:['supply-purchase-orders',scope.workspaceId,scope.branchId]});
   setPoId('');setReceipts({});setNotes('');toast.success('Goods received. Accepted quantities have been recorded in stock.');}
  catch(error){toast.error(error instanceof Error?error.message:'Could not record the goods.');}
  finally{setBusy(false);}
 }
 return <InventoryFrame title="Goods receiving" subtitle="Check what has actually arrived before it becomes available for sale.">
  <InventoryStats cards={[{label:'Purchase orders to receive',value:orders.isError?'—':open.length},{label:'Storage locations',value:wh.data?.length??'—'},{label:'Tracked products',value:intelligence.data?.totals.products??'—'},{label:'Expiry risks',value:intelligence.data?.totals.expiryRisk??'—'}]}/>
  <FormError error={orders.isError||wh.isError} onRetry={()=>{void orders.refetch();void wh.refetch();}}/>
  <InventoryPanel title="Check a supplier delivery" subtitle="Only accepted goods increase stock. Rejected or missing goods remain visible against the supplier order.">
   <form onSubmit={e=>{try{void submit(e);}catch(error){toast.error(error instanceof Error?error.message:'Check your quantities.');}}} className="solar-form">
    <div className="solar-grid-two">
     <label>Supplier purchase order<select required value={poId} onChange={e=>{setPoId(e.target.value);setReceipts({});}}><option value="">Choose an order awaiting goods</option>
      {open.map(o=><option key={String(o.id)} value={String(o.id)}>{String(field(o,'order_number','orderNumber'))} · {String(field(o,'supplier_name','supplierName')||'Supplier')}</option>)}</select></label>
     <WarehouseField rows={wh.data??[]} value={warehouseId} onChange={setWarehouseId}/>
    </div>
    {poId&&lines.length>0&&<div className="solar-rows">{lines.map(l=>{
     const id=String(l.id),outstanding=number(l.quantity)-number(field(l,'quantity_accepted','quantityAccepted'))-number(field(l,'quantity_rejected','quantityRejected'));
     const productId=String(field(l,'product_id','productId'));
     const p=catalogue.data?.find(p=>p.id===productId);
     const choices=(variants.data??[]).filter(v=>v.productId===productId);
     const packChoices=(packages.data??[]).filter(pack=>pack.productId===productId&&pack.variantId===(receipts[id]?.variantId||null));
     const selectedPackage=packChoices.find(pack=>pack.id===receipts[id]?.packageId);
     return <article key={id}><div><strong>{String(field(l,'product_name_snapshot','productName')||p?.name||'Product')}</strong>
       <small>Ordered: {number(l.quantity)} · Still expected: {outstanding} · {p?.sku||''}</small></div>
       <div className="solar-grid-two" style={{flex:'2',minWidth:260}}>
        {choices.length>0&&<label>Actual product variant<select required value={receipts[id]?.variantId??''} onChange={e=>setLine(id,{variantId:e.target.value,packageId:''})}><option value="">Choose size, colour or model</option>{choices.map(v=><option value={v.id} key={v.id}>{v.sku}</option>)}</select></label>}
        {packChoices.length>0&&<label>Receiving unit<select value={receipts[id]?.packageId??''} onChange={e=>setLine(id,{packageId:e.target.value,accepted:'0',rejected:'0'})}><option value="">Base stock unit ({p?.unitOfMeasure??'Each'})</option>{packChoices.map(pack=><option value={pack.id} key={pack.id}>{pack.name} · {pack.unitsPerPackage} {pack.baseUnit}</option>)}</select></label>}
        {selectedPackage&&<small>Package quantities below convert exactly to base stock units. The order balance remains in base units.</small>}
        <label>{selectedPackage?'Packages accepted':'Accepted'}<input type="number" min="0" max={outstanding} step=".001" value={receipts[id]?.accepted??'0'} onChange={e=>setLine(id,{accepted:e.target.value})}/></label>
        <label>{selectedPackage?'Packages rejected':'Rejected'}<input type="number" min="0" max={outstanding} step=".001" value={receipts[id]?.rejected??'0'} onChange={e=>setLine(id,{rejected:e.target.value})}/></label>
        {p?.trackLot&&<label>Batch number<input required={number(receipts[id]?.accepted)>0} value={receipts[id]?.lot??''} onChange={e=>setLine(id,{lot:e.target.value})} placeholder="Printed lot number"/></label>}
        {p?.trackLot&&<label>Expiry date<input type="date" value={receipts[id]?.expiry??''} onChange={e=>setLine(id,{expiry:e.target.value})}/></label>}
        {p?.trackSerial&&<label>IMEI / serial numbers (one device per line; IMEI1|IMEI2 for dual SIM)<textarea required={number(receipts[id]?.accepted)>0} rows={2}
          value={receipts[id]?.serials??''} onChange={e=>setLine(id,{serials:e.target.value})}
          placeholder="One unique serial for every accepted unit"/></label>}
       </div>
      </article>;
    })}</div>}
    {poId&&!lines.length&&<p className="solar-empty">No outstanding product lines were found on this order.</p>}
    <label>Receiving notes (optional)<textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={1000} rows={2} placeholder="Condition, damaged cartons, delivery note reference"/></label>
    <button className="solar-button" disabled={busy||!poId||!lines.length}><CheckCircle2 size={17}/>{busy?'Recording…':'Confirm goods received'}</button>
   </form>
   <p className="solar-fineprint">Receiving is tied to a real purchase order and uses the same goods-receipt and finance entries as Purchasing. A receipt cannot be created twice simply by reopening its page.</p>
  </InventoryPanel>
  <InventoryPanel title="Supplier deliveries awaiting stock" subtitle="Orders already on their way to your business.">
   <InventoryTable headings={['Purchase order','Supplier','Status','Expected','Outstanding products']} rows={open.map(o=>[
     String(field(o,'order_number','orderNumber')),String(field(o,'supplier_name','supplierName')||'Supplier'),
     <span className="solar-tag" key="status">{readable(o.status)}</span>,
     day(field(o,'expected_date','expectedDate')),
     recordLines(o).filter(l=>number(l.quantity)>number(field(l,'quantity_accepted','quantityAccepted'))+number(field(l,'quantity_rejected','quantityRejected'))).length
   ])} empty="No outstanding supplier orders to receive."/>
  </InventoryPanel>
 </InventoryFrame>;
}
export function StockCountsPage(){
 const {scope,wh,catalogue,intelligence,refresh,cache}=useInventoryBasics();
 const query=useQuery({queryKey:['inventory-counts',scope.workspaceId,scope.branchId],queryFn:()=>apiInventoryOperations.counts(scope)});
 const [warehouse,setWarehouse]=useState(''),[product,setProduct]=useState(''),[quantity,setQuantity]=useState(''),[reason,setReason]=useState(''),[notes,setNotes]=useState('');
 const [busy,setBusy]=useState(false);
 const current=intelligence.data?.products.find(p=>p.id===product);
 async function create(e:FormEvent){
  e.preventDefault();if(!warehouse||!product||quantity==='')return;
  setBusy(true);
  try{await apiInventoryOperations.createCount(scope,{warehouseId:warehouse,notes,
    lines:[{productId:product,countedQuantity:Number(quantity),reason}]});
   await cache.invalidateQueries({queryKey:['inventory-counts',scope.workspaceId,scope.branchId]});
   setQuantity('');setReason('');toast.success('Physical count saved for review. Stock has not been changed yet.');
  }catch(error){toast.error(error instanceof Error?error.message:'The count could not be saved.');}finally{setBusy(false);}
 }
 async function action(id:string,state:'submit'|'review'|'approve'){
  if(state==='approve'&&!window.confirm('Approve the count difference and update actual stock and finances?'))return;
  setBusy(true);try{await apiInventoryOperations.countAction(scope,id,state);await refresh();await query.refetch();
    toast.success(state==='approve'?'Approved. Stock and applicable finance records updated.':'Stock count updated.');}
  catch(error){toast.error(error instanceof Error?error.message:'Could not update the count.');}finally{setBusy(false);}
 }
 return <InventoryFrame title="Physical stock counts" subtitle="Count what is on the shelf, investigate differences and approve corrections separately.">
  <InventoryStats cards={[{label:'Counts recorded',value:query.isError?'—':query.data?.length??'—'},{label:'Awaiting review',value:query.data?.filter(x=>x.status==='submitted').length??'—'},{label:'Awaiting approval',value:query.data?.filter(x=>x.status==='reviewed').length??'—'},{label:'Stock corrections posted',value:query.data?.filter(x=>x.status==='posted').length??'—'}]}/>
  <FormError error={query.isError} onRetry={()=>void query.refetch()}/>
  <InventoryPanel title="Start a blind stock count" subtitle="The expected quantity stays hidden while you enter your physical count.">
   <form className="solar-form" onSubmit={e=>{void create(e)}}>
    <div className="solar-grid-two"><WarehouseField rows={wh.data??[]} value={warehouse} onChange={setWarehouse}/>
      <label>Product<select required value={product} onChange={e=>setProduct(e.target.value)}><option value="">Choose product</option>
       {(catalogue.data??[]).filter(p=>p.trackStock).map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></label></div>
    <div className="solar-grid-two"><label>Units physically counted<input required type="number" min="0" step=".001" value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder="Enter the quantity you counted"/></label>
      <label>Reason for a difference (optional)<input maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Damage, missing, wrong shelf…"/></label></div>
    <label>Count notes<textarea rows={2} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Who counted; which shelf or batch was checked"/></label>
    <button className="solar-button" disabled={busy||!product||!warehouse}><ClipboardCheck size={16}/> Save physical count</button>
   </form>
   <p className="solar-fineprint">{current?'This product is tracked in your business inventory.':'Choose a product to begin.'} Stock does not change until the approved review step.</p>
  </InventoryPanel>
  <InventoryPanel title="Counts awaiting action" subtitle="Every difference is reviewed against the recorded quantity before posting.">
   <div className="solar-rows">{(query.data??[]).map(c=><article key={String(c.id)}>
    <div><strong>{String(field(c,'count_number','countNumber'))}</strong>
      <small>{readable(c.status)} · {day(field(c,'created_at','countDate'))} · {recordLines(c).length} products</small>
      {recordLines(c).map(l=><small key={String(l.id)}>Difference: {number(l.variance)} units · {catalogue.data?.find(x=>x.id===l.productId)?.name||'Product'}</small>)}
    </div>
    <div className="solar-actions"><span className="solar-tag">{readable(c.status)}</span>
     {String(c.status)==='draft'&&<button className="solar-button-secondary" disabled={busy} onClick={()=>void action(String(c.id),'submit')}>Send for review</button>}
     {String(c.status)==='submitted'&&<button className="solar-button-secondary" disabled={busy} onClick={()=>void action(String(c.id),'review')}>Review differences</button>}
     {String(c.status)==='reviewed'&&<button className="solar-button" disabled={busy} onClick={()=>void action(String(c.id),'approve')}>Approve & update stock</button>}
    </div></article>)}{!query.isLoading&&!query.data?.length&&<p className="solar-empty">No physical stock counts recorded yet.</p>}</div>
  </InventoryPanel>
 </InventoryFrame>;
}
export function BatchesPage(){
 const {scope,intelligence}=useInventoryBasics();
 const query=useQuery({queryKey:['inventory-lots',scope.workspaceId,scope.branchId],queryFn:()=>apiInventoryOperations.lots(scope)});
 const [filter,setFilter]=useState('all');
 const [selectedLot,setSelectedLot]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false);
 const records=(query.data??[]).filter(l=>{
  if(filter==='expired')return l.expiry_date&&new Date(String(l.expiry_date))<new Date();
  if(filter==='quarantined')return l.status==='quarantine'||number(l.quantity_quarantined)>0;
  if(filter==='soon')return l.expiry_date&&new Date(String(l.expiry_date)).getTime()-Date.now()<=30*86400000;
  return true;
 });
 const history=useQuery({queryKey:['inventory-lot-history',scope.workspaceId,scope.branchId,selectedLot],queryFn:()=>apiInventoryOperations.lotHistory(scope,selectedLot),enabled:!!selectedLot});
 async function lotAction(id:string,action:'quarantine'|'release'){
  if(reason.trim().length<5){toast.error('Record at least five characters explaining this stock decision.');return;}
  setBusy(true);try{await apiInventoryOperations.lotAction(scope,id,action,reason.trim());await query.refetch();setReason('');setSelectedLot('');toast.success(action==='quarantine'?'The batch is restricted from ordinary sale.':'The inspected batch is available again.');}
  catch(error){toast.error(error instanceof Error?error.message:'The batch could not be updated.');}finally{setBusy(false);}
 }
 const risk=records.filter(l=>l.expiry_date&&new Date(String(l.expiry_date)).getTime()-Date.now()<=30*86400000);
 return <InventoryFrame title="Batches, serials & expiry" subtitle="Trace products back to suppliers and keep expired or restricted goods out of normal selling.">
  <InventoryStats cards={[{label:'Tracked lots',value:query.isError?'—':query.data?.length??'—'},{label:'Expiring within 30 days',value:query.isError?'—':risk.length},{label:'Restricted stock',value:query.data?.filter(x=>number(x.quantity_quarantined)>0).length??'—'},{label:'Products with expiry risk',value:intelligence.data?.totals.expiryRisk??'—'}]}/>
  <FormError error={query.isError} onRetry={()=>void query.refetch()}/>
  <InventoryPanel title="Check batches and storage history" subtitle="Batches enter the business through an approved supplier receipt, not a free-text stock addition.">
   <div className="solar-actions"><div className="solar-tabrow" role="tablist">{[['all','All batches'],['soon','Expiry within 30 days'],['expired','Expired'],['quarantined','Restricted']] .map(([id,label])=><button key={id} role="tab" aria-selected={filter===id} onClick={()=>setFilter(id??'all')}>{label}</button>)}</div>
    <Link className="solar-button" to="/modules/receiving"><Plus size={16}/> Receive a tracked product</Link></div>
   <InventoryTable headings={['Product','Batch number','Storage area','On hand','Restricted','Expiry','Condition','Actions']} rows={records.map(l=>[
    String(field(l,'product_name')),String(l.lot_number||'—'),String(l.warehouse_name||'—'),number(l.quantity_on_hand),
    number(l.quantity_quarantined),day(l.expiry_date),
    <span className={l.status==='available'?'solar-tag':'solar-tag solar-tag-warning'} key="state">{readable(l.status)}</span>,
    <button className="solar-button-secondary" type="button" key="lot" onClick={()=>{setSelectedLot(String(l.id));setReason('')}}>Review batch</button>
   ])} empty="No matching batches or expiry records for this business."/>
   {selectedLot&&<div className="solar-panel" style={{background:'#F6FBEF'}}>
     <div className="solar-panel-header"><div><h2>Batch review · {String(query.data?.find(l=>l.id===selectedLot)?.lot_number||'Batch')}</h2>
       <p>Original stock movements and linked customer sales for this recorded batch.</p></div>
       <button className="solar-button-secondary" type="button" onClick={()=>setSelectedLot('')}>Close</button></div>
     {history.isError&&<InventoryNotice retry={()=>void history.refetch()}>Batch history could not be loaded.</InventoryNotice>}
     <InventoryTable headings={['Date','Activity','Quantity','Reference']} rows={(history.data?.movements??[]).map(m=>[
       day(m.created_at),readable(m.type),number(m.quantity_delta),String(m.source_id||m.reason||'—')
     ])} empty="No recorded stock movements for this batch."/>
     <InventoryTable headings={['Sale reference','Date','Units']} rows={(history.data?.sales??[]).map(m=>[
       String(m.receipt_number),day(m.created_at),number(m.quantity)
     ])} empty="No sales have been recorded against this batch."/>
     <label className="solar-form">Reason or inspection reference<textarea rows={2} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}
       placeholder="e.g. Packaging seal damaged; quality inspection reviewed"/></label>
     <div className="solar-actions">
       {query.data?.find(l=>l.id===selectedLot)?.status==='available'&&<button className="solar-button-secondary" disabled={busy} onClick={()=>void lotAction(selectedLot,'quarantine')}>Restrict this batch</button>}
       {query.data?.find(l=>l.id===selectedLot)?.status==='quarantine'&&<button className="solar-button" disabled={busy} onClick={()=>void lotAction(selectedLot,'release')}>Release after inspection</button>}
     </div>
    </div>}
   <p className="solar-fineprint">Use earliest-expiring available stock first when required. Items that have expired or are quarantined must not be chosen for ordinary checkout. Do not count a lot again after it has already been received.</p>
  </InventoryPanel>
  <InventoryPanel title="Closest expiry dates" subtitle="Actual batches sorted from the earliest expiry date.">
   <InventoryBarChart title="Quantity at expiry risk" data={records.filter(l=>l.expiry_date).slice(0,8).map(l=>({label:String(l.lot_number||'Lot'),value:number(l.quantity_on_hand)}))} empty="No products with recorded expiry dates."/>
  </InventoryPanel>
 </InventoryFrame>;
}
export function ReplenishmentPage(){
 const {scope,wh,catalogue,intelligence,cache}=useInventoryBasics();
 const query=useQuery({queryKey:['inventory-suggestions',scope.workspaceId,scope.branchId],queryFn:()=>apiInventoryOperations.suggestions(scope)});
 const policies=useQuery({queryKey:['inventory-policies',scope.workspaceId,scope.branchId],queryFn:()=>apiInventoryOperations.policies(scope)});
 const [warehouseId,setWarehouseId]=useState(''),[productId,setProductId]=useState(''),[safety,setSafety]=useState('0'),
  [reorder,setReorder]=useState('3'),[target,setTarget]=useState('10'),[lead,setLead]=useState('7'),[busy,setBusy]=useState(false);
 const suggestions=(query.data??[]).filter(x=>number(x.suggested_quantity)>0).sort((a,b)=>number(b.suggested_quantity)-number(a.suggested_quantity));
 async function save(e:FormEvent){
  e.preventDefault();
  if(Number(target)<Number(reorder)||Number(reorder)<Number(safety)){toast.error('Target stock must be at least the reorder point; reorder point must be at least the safety stock.');return;}
  setBusy(true);try{await apiInventoryOperations.savePolicy(scope,{warehouseId,productId,safetyStock:Number(safety),reorderPoint:Number(reorder),targetStock:Number(target),leadTimeDays:Number(lead)});
   await cache.invalidateQueries({queryKey:['inventory-suggestions',scope.workspaceId,scope.branchId]});
   await policies.refetch();toast.success('Reorder plan saved. Any buying suggestion requires a separate purchase approval.');}
  catch(error){toast.error(error instanceof Error?error.message:'Could not save reorder plan.');}finally{setBusy(false);}
 }
 return <InventoryFrame title="Reorder planning" subtitle="Know what to buy, when to buy it and why—based on current stock and recent demand.">
  <InventoryStats cards={[{label:'Products to review',value:query.isError?'—':suggestions.length},{label:'Active reorder plans',value:policies.data?.length??'—'},{label:'Products running low',value:intelligence.data?.totals.lowStock??'—'},{label:'Tracked products',value:intelligence.data?.totals.products??'—'}]}/>
  <FormError error={query.isError||policies.isError} onRetry={()=>{void query.refetch();void policies.refetch();}}/>
  <InventoryPanel title="Recommended purchases" subtitle="Calculations consider goods already in stock, reserved for customers and on order with suppliers.">
   <InventoryTable headings={['Product','Available','Already ordered','Demand/day','Suggested quantity','Supplier lead time']} rows={suggestions.map(l=>[
    String(l.product_name),Math.max(0,number(l.on_hand)-number(l.reserved)-number(l.quarantined)),
    number(l.on_order),Number(number(l.average_daily_usage).toFixed(2)),
    <strong key="suggestion" style={{color:'#507C13'}}>{number(l.suggested_quantity)}</strong>,
    String(l.lead_time_days)+' days'
   ])} empty="No purchasing suggestions yet. Set reorder plans for products you want LEXA to monitor."/>
   <div className="solar-actions"><Link to="/modules/purchase-requests" className="solar-button"><ShoppingBasket size={16}/> Prepare purchase request</Link>
    <Link to="/modules/purchases" className="solar-button-secondary">Review supplier orders</Link></div>
   <p className="solar-fineprint">Purchasing suggestions do not create supplier debts or payments. Suggested quantities are estimates; check supplier pack sizes and delivery lead times before approving an order.</p>
  </InventoryPanel>
  <div className="solar-chart-grid">
   <InventoryBarChart title="Greatest replenishment needs" data={suggestions.slice(0,8).map(l=>({label:String(l.product_name||''),value:number(l.suggested_quantity)}))}/>
   <InventoryBarChart title="Fast-moving stock (last 30 days)" data={(intelligence.data?.fastSellers??[]).slice(0,8).map(x=>({label:x.name,value:x.sold30Days}))}/>
  </div>
  <InventoryPanel title="Set when to reorder a product" subtitle="Choose a product, how long your supplier takes and your minimum and target quantities.">
   <form className="solar-form" onSubmit={e=>{void save(e)}}>
    <div className="solar-grid-two"><WarehouseField rows={wh.data??[]} value={warehouseId} onChange={setWarehouseId}/>
     <label>Product<select required value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Choose a product</option>
      {(catalogue.data??[]).filter(p=>p.trackStock).map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></label>
    </div><div className="solar-grid-two">
     <label>Safety stock<input type="number" min="0" step=".001" required value={safety} onChange={e=>setSafety(e.target.value)}/></label>
     <label>Reorder when stock reaches<input type="number" min="0" step=".001" required value={reorder} onChange={e=>setReorder(e.target.value)}/></label>
     <label>Restock up to<input type="number" min="0" step=".001" required value={target} onChange={e=>setTarget(e.target.value)}/></label>
     <label>Supplier delivery time (days)<input type="number" min="0" max="3650" step="1" required value={lead} onChange={e=>setLead(e.target.value)}/></label>
    </div><button className="solar-button" disabled={busy||!warehouseId||!productId}>Save reorder plan</button>
   </form>
  </InventoryPanel>
 </InventoryFrame>;
}

