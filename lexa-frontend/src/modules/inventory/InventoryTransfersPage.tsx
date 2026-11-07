
import {useState,type FormEvent} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {useWorkspace} from '../../app/WorkspaceContext';
import {products} from '../../data/repositories';
import {apiCatalogInventory} from '../../data/remote/apiWorkstream03';
import {apiInventoryOperations,type RawInventoryRow} from '../../data/remote/apiInventoryOperations';
import {InventoryFrame,InventoryPanel,InventoryNotice,InventoryStats,InventoryBarChart,InventoryTable,field,number,readable} from './InventoryFrame';
import {ArrowLeftRight} from '../../components/LexaIcon';
const lines=(r:RawInventoryRow)=>Array.isArray(r.lines)?r.lines as RawInventoryRow[]:[];
export default function InventoryTransfersPage(){
 const {workspace,branch}=useWorkspace(),scope={workspaceId:workspace.id,branchId:branch.id},cache=useQueryClient();
 const wh=useQuery({queryKey:['supply-warehouses',workspace.id,branch.id],queryFn:()=>apiInventoryOperations.warehouses(scope)});
 const productsQuery=useQuery({queryKey:['products',workspace.id],queryFn:()=>products.list({workspaceId:workspace.id,activeOnly:true})});
 const variants=useQuery({queryKey:['all-variants',workspace.id],queryFn:()=>apiCatalogInventory.allVariants(workspace.id)});
 const lots=useQuery({queryKey:['inventory-lots',workspace.id,branch.id],queryFn:()=>apiInventoryOperations.lots(scope)});
 const transfers=useQuery({queryKey:['inventory-transfers',workspace.id,branch.id],queryFn:()=>apiInventoryOperations.transfers(scope)});
 const [source,setSource]=useState(''),[destination,setDestination]=useState(''),[productId,setProductId]=useState(''),[qty,setQty]=useState('1'),
  [lot,setLot]=useState(''),[variantId,setVariantId]=useState(''),[serials,setSerials]=useState(''),[notes,setNotes]=useState(''),[busy,setBusy]=useState(false);
 const product=productsQuery.data?.find(p=>p.id===productId);
 const productVariants=(variants.data??[]).filter(v=>v.productId===productId);
 const refresh=async()=>Promise.all([transfers.refetch(),cache.invalidateQueries({queryKey:['inventory-intelligence',workspace.id,branch.id]}),
  cache.invalidateQueries({queryKey:['inventory-balances',workspace.id,branch.id]}),lots.refetch()]);
 async function create(e:FormEvent){
  e.preventDefault();if(source===destination){toast.error('Choose different source and destination storage areas.');return;}
  setBusy(true);try{await apiInventoryOperations.createTransfer(scope,{sourceWarehouseId:source,destinationWarehouseId:destination,notes,
   lines:[{productId,quantity:Number(qty),...(variantId?{variantId}:{}),...(lot?{lotId:lot}:{}),...(product?.trackSerial?{serialNumbers:serials.split(/[,\n]/).map(x=>x.trim()).filter(Boolean)}:{})}]});
   await refresh();setQty('1');setNotes('');setLot('');toast.success('Transfer prepared. Dispatch and receipt are confirmed separately.');}
   catch(error){toast.error(error instanceof Error?error.message:'The transfer could not be prepared.');}finally{setBusy(false);}
 }
 async function action(r:RawInventoryRow,type:'dispatch'|'receive'){
  if(type==='dispatch'&&!window.confirm('Confirm the goods left their current storage area?'))return;
  setBusy(true);try{await apiInventoryOperations.transferAction(scope,String(r.id),type,
    type==='receive'?{lines:lines(r).filter(l=>number(field(l,'quantity_dispatched','quantityDispatched'))>number(field(l,'quantity_received','quantityReceived')))
     .map(l=>({lineId:l.id,quantityReceived:number(field(l,'quantity_dispatched','quantityDispatched'))-number(field(l,'quantity_received','quantityReceived'))}))}:{});
   await refresh();toast.success(type==='dispatch'?'Goods dispatched. Awaiting receipt.':'Goods received at their destination.');}
   catch(error){toast.error(error instanceof Error?error.message:'The transfer could not be updated.');}finally{setBusy(false);}
 }
 const list=transfers.data??[];
 return <InventoryFrame title="Stock transfers" subtitle="Move goods between storage areas without adding extra stock to your business.">
  <InventoryStats cards={[{label:'Recorded transfers',value:transfers.isError?'—':list.length},{label:'Awaiting dispatch',value:list.filter(x=>x.status==='draft').length},{label:'Goods on their way',value:list.filter(x=>x.status==='dispatched').length},{label:'Partially received',value:list.filter(x=>x.status==='partially_received').length}]}/>
  {transfers.isError&&<InventoryNotice retry={()=>void transfers.refetch()}>Transfers could not be loaded. Your stock has not been changed.</InventoryNotice>}
  <InventoryPanel title="Prepare an internal stock transfer" subtitle="Shop floor, back storeroom and returns are storage areas—not new business workspaces.">
   <form className="solar-form" onSubmit={e=>{void create(e)}}>
    <div className="solar-grid-two">{[['Send from',source,setSource],['Receive at',destination,setDestination]].map(([label,value,setter])=>
      <label key={String(label)}>{String(label)}<select required value={value as string} onChange={e=>(setter as (v:string)=>void)(e.target.value)}>
       <option value="">Choose storage area</option>{(wh.data??[]).map(w=><option key={String(w.id)} value={String(w.id)}>{String(w.name)}</option>)}</select></label>)}</div>
    <div className="solar-grid-two"><label>Product<select required value={productId} onChange={e=>{setProductId(e.target.value);setLot('');setVariantId('');}}>
      <option value="">Choose product</option>{(productsQuery.data??[]).filter(p=>p.trackStock).map(p=><option value={p.id} key={p.id}>{p.name} · {p.sku}</option>)}</select></label>
     <label>Quantity to move<input required type="number" min=".001" step=".001" value={qty} onChange={e=>setQty(e.target.value)}/></label></div>
    {productVariants.length>0&&<label>Product variant<select required value={variantId} onChange={e=>{setVariantId(e.target.value);setLot('');}}><option value="">Select size, colour or model</option>{productVariants.map(v=><option key={v.id} value={v.id}>{v.sku}</option>)}</select></label>}
    {product?.trackLot&&<label>Batch to move<select required value={lot} onChange={e=>setLot(e.target.value)}><option value="">Choose available batch</option>
     {(lots.data??[]).filter(l=>l.product_id===productId&&l.warehouse_id===source&&l.status==='available'&&(l.variant_id??null)===(variantId||null)).map(l=><option key={String(l.id)} value={String(l.id)}>{String(l.lot_number)}</option>)}</select></label>}
    {product?.trackSerial&&<label>Serial numbers (one per unit, separated by commas)<textarea rows={2} value={serials} onChange={e=>setSerials(e.target.value)}/></label>}
    <label>Why are these goods moving?<textarea rows={2} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Restock the sales floor"/></label>
    <button className="solar-button" disabled={busy||!source||!destination||source===destination||!productId}><ArrowLeftRight size={16}/> Prepare transfer</button>
   </form>
  </InventoryPanel>
  <InventoryPanel title="Goods on the move" subtitle="Confirm both dispatch and arrival to keep quantities accurate.">
   <InventoryTable headings={['Transfer','From','To','Items','Status','Next action']} rows={list.map(r=>[
    String(field(r,'transfer_number')),String(field(r,'source_warehouse')),String(field(r,'destination_warehouse')),
    lines(r).map(l=>String(field(l,'quantity'))).join(', '),readable(r.status),
    r.status==='draft'?<button key="dispatch" disabled={busy} className="solar-button-secondary" onClick={()=>void action(r,'dispatch')}>Dispatch</button>:
    ['dispatched','partially_received'].includes(String(r.status))?<button key="receive" disabled={busy} className="solar-button" onClick={()=>void action(r,'receive')}>Confirm arrival</button>:'Completed'
   ])} empty="No internal transfers have been recorded."/>
  </InventoryPanel>
  <InventoryBarChart title="Transfer workload" data={['draft','dispatched','partially_received','received'].map(x=>({label:readable(x),value:list.filter(r=>r.status===x).length}))}/>
 </InventoryFrame>;
}

