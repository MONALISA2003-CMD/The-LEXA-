
import {useState,type FormEvent} from 'react';
import {Link} from 'react-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {useWorkspace} from '../../app/WorkspaceContext';
import {products} from '../../data/repositories';
import {BarcodeCapture} from '../../components/barcode/BarcodeCapture';
import {apiInventoryOperations,type RawInventoryRow} from '../../data/remote/apiInventoryOperations';
import {apiCommerce} from '../../data/remote/apiCommerce';
import {InventoryFrame,InventoryPanel,InventoryNotice,InventoryStats,InventoryBarChart,InventoryTable,field,number,readable} from './InventoryFrame';
import {PackageCheck,ScanBarcode} from '../../components/LexaIcon';
const rowLines=(r:RawInventoryRow)=>Array.isArray(r.lines)?r.lines as RawInventoryRow[]:[];
export default function InventoryPicklistsPage(){
 const {workspace,branch}=useWorkspace(),scope={workspaceId:workspace.id,branchId:branch.id},cache=useQueryClient();
 const query=useQuery({queryKey:['inventory-picklists',workspace.id,branch.id],queryFn:()=>apiInventoryOperations.picklists(scope)});
 const orders=useQuery({queryKey:['commerce-sales-orders',workspace.id,branch.id],queryFn:()=>apiCommerce.listSalesOrders(scope)});
 const catalogue=useQuery({queryKey:['products',workspace.id],queryFn:()=>products.list({workspaceId:workspace.id,activeOnly:true})});
 const warehouses=useQuery({queryKey:['supply-warehouses',workspace.id,branch.id],queryFn:()=>apiInventoryOperations.warehouses(scope)});
 const [warehouse,setWarehouse]=useState(''),[orderId,setOrderId]=useState(''),[product,setProduct]=useState(''),[quantity,setQuantity]=useState('1'),[busy,setBusy]=useState(false);
 const order=orders.data?.find(x=>x.id===orderId),orderLines=order?.lines??[];
 const scan=(code:string)=>{
  const p=catalogue.data?.find(p=>p.sku.toLowerCase()===code.toLowerCase()||p.barcode?.toLowerCase()===code.toLowerCase());
  if(!p){toast.error('Scanned product not found in this business.');return;}
  if(order&&!orderLines.some(l=>l.productId===p.id)){toast.error('The scanned product is not in this customer order.');return;}
  setProduct(p.id);toast.success(p.name+' selected.');
 };
 async function create(e:FormEvent){
  e.preventDefault();
  if(!warehouse||!product){toast.error('Choose a storage area and product.');return;}
  setBusy(true);try{await apiInventoryOperations.createPicklist(scope,{warehouseId:warehouse,
    ...(orderId?{sourceType:'sales-order',sourceId:orderId}:{sourceType:'manual'}),lines:[{productId:product,quantity:Number(quantity)}]});
   await query.refetch();setProduct('');setQuantity('1');toast.success('Picking task prepared. Scan and confirm when the goods are found.');}
  catch(error){toast.error(error instanceof Error?error.message:'The picking task could not be created.');}finally{setBusy(false);}
 }
 async function confirm(id:string){
  setBusy(true);
  try{await apiInventoryOperations.recordPick(scope,id,{});await query.refetch();await cache.invalidateQueries({queryKey:['inventory-intelligence',workspace.id,branch.id]});
   toast.success('Picking recorded. Goods are reserved for the order.');}
  catch(error){toast.error(error instanceof Error?error.message:'Could not confirm picked goods.');}finally{setBusy(false);}
 }
 const records=query.data??[];
 return <InventoryFrame title="Picklists & picking" subtitle="Find and verify goods for customer orders, then hand them over for packing.">
  <InventoryStats cards={[{label:'Picking tasks',value:query.isError?'—':records.length},{label:'Waiting to pick',value:records.filter(x=>x.status==='draft').length},
   {label:'Picking now',value:records.filter(x=>x.status==='picking').length},{label:'Ready for packing',value:records.filter(x=>x.status==='picked').length}]}/>
  {query.isError&&<InventoryNotice retry={()=>void query.refetch()}>Picking tasks could not be loaded.</InventoryNotice>}
  <InventoryPanel title="Prepare products for an order" subtitle="Choose a confirmed order, scan the requested product and record the quantity to pick.">
   <form className="solar-form" onSubmit={e=>{void create(e)}}>
    <div className="solar-grid-two">
     <label>Customer order<select value={orderId} onChange={e=>{setOrderId(e.target.value);setProduct('')}}><option value="">General warehouse picking task</option>
      {(orders.data??[]).filter(x=>['confirmed','partially_fulfilled'].includes(x.status)).map(x=><option key={x.id} value={x.id}>{x.orderNumber} · {x.customerName||'Customer'}</option>)}</select></label>
     <label>Pick from storage area<select required value={warehouse} onChange={e=>setWarehouse(e.target.value)}><option value="">Choose area</option>
      {(warehouses.data??[]).map(w=><option value={String(w.id)} key={String(w.id)}>{String(w.name)}</option>)}</select></label></div>
    <BarcodeCapture compact label="Scan product for this order" onCode={scan}/>
    <div className="solar-grid-two"><label>Product<select required value={product} onChange={e=>setProduct(e.target.value)}>
      <option value="">Choose a product</option>
      {(catalogue.data??[]).filter(p=>p.trackStock&&(!order||orderLines.some(l=>l.productId===p.id))).map(p=><option value={p.id} key={p.id}>{p.name} · {p.sku}</option>)}</select></label>
     <label>Quantity to pick<input type="number" min=".001" step=".001" required value={quantity}
       max={order?orderLines.find(l=>l.productId===product)?.quantity:undefined} onChange={e=>setQuantity(e.target.value)}/></label></div>
    <button className="solar-button" disabled={busy||!product||!warehouse}><ScanBarcode size={16}/> Create picking task</button>
   </form>
  </InventoryPanel>
  <InventoryPanel title="Picking progress" subtitle="The same products and reservations remain linked to their customer orders.">
   <InventoryTable headings={['Picklist','Storage area','Requested products','Progress','Next action']} rows={records.map(r=>[
    String(field(r,'picklist_number')),String(field(r,'warehouse_name')),rowLines(r).map(l=>{
     const p=catalogue.data?.find(x=>x.id===field(l,'productId','product_id'));
     return (p?.name||'Product')+' '+number(l.quantityPicked)+'/'+number(l.quantity);
    }).join(', '),<span key="state" className="solar-tag">{readable(r.status)}</span>,
    ['draft','released','picking'].includes(String(r.status))?
      <button className="solar-button-secondary" disabled={busy} key="confirm" onClick={()=>void confirm(String(r.id))}>Confirm goods picked</button>:
      String(r.status)==='picked'?<Link key="packages" to="/modules/packages" className="solar-button"><PackageCheck size={15}/> Prepare parcel</Link>:'Complete'
   ])} empty="No picking tasks have been created yet."/>
   <p className="solar-fineprint">Picking does not create a second sale or deduct stock twice. The confirmed dispatch of the original sales order records goods leaving the business.</p>
  </InventoryPanel>
  <InventoryBarChart title="Picking task workload" data={['draft','picking','picked','dispatched'].map(status=>({label:readable(status),value:records.filter(x=>x.status===status).length}))}/>
 </InventoryFrame>;
}

