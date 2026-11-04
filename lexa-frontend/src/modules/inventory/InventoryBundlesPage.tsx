
import {useMemo,useState,type FormEvent} from 'react';
import {Link} from 'react-router';
import {useQuery} from '@tanstack/react-query';
import {toast} from 'sonner';
import {useWorkspace} from '../../app/WorkspaceContext';
import {products} from '../../data/repositories';
import {apiInventoryOperations,type RawInventoryRow} from '../../data/remote/apiInventoryOperations';
import {formatMinorAmount} from '../../domain/money/money';
import {InventoryFrame,InventoryPanel,InventoryNotice,InventoryStats,InventoryTable,field,number,readable} from './InventoryFrame';
import {Boxes,Plus} from 'lucide-react';
const getLines=(x:RawInventoryRow)=>Array.isArray(x.lines)?x.lines as RawInventoryRow[]:[];
export default function InventoryBundlesPage(){
 const {workspace,branch}=useWorkspace(),scope={workspaceId:workspace.id,branchId:branch.id};
 const catalogue=useQuery({queryKey:['products',workspace.id],queryFn:()=>products.list({workspaceId:workspace.id,activeOnly:true})});
 const insights=useQuery({queryKey:['inventory-intelligence',workspace.id,branch.id],queryFn:()=>apiInventoryOperations.intelligence(scope)});
 const query=useQuery({queryKey:['manufacturing-boms',workspace.id,branch.id],queryFn:()=>apiInventoryOperations.boms(scope)});
 const [productId,setProductId]=useState(''),[component,setComponent]=useState(''),[amount,setAmount]=useState('1'),[code,setCode]=useState('');
 const [lines,setLines]=useState<Array<{productId:string;quantity:number}>>([]),[busy,setBusy]=useState(false);
 const insightMap=useMemo(()=>new Map((insights.data?.products??[]).map(p=>[p.id,p])),[insights.data]);
 const cost=lines.reduce((v,l)=>v+(insightMap.get(l.productId)?.unitCostMinor??0)*l.quantity,0);
 const available=lines.length?Math.floor(Math.min(...lines.map(l=>(insightMap.get(l.productId)?.available??0)/l.quantity))):0;
 async function save(e:FormEvent){
  e.preventDefault();
  if(!productId||!lines.length){toast.error('Choose a finished product and at least one real component.');return;}
  if(lines.some(x=>x.productId===productId)){toast.error('A finished product cannot include itself.');return;}
  setBusy(true);try{await apiInventoryOperations.createBom(scope,{productId,...(code?{bomCode:code}:{}),
    components:lines.map((x,i)=>({productId:x.productId,quantityPerOutput:x.quantity,sequence:i+1}))});
   await query.refetch();setLines([]);setCode('');toast.success('Assembly recipe saved. Create a work order before making finished units.');}
  catch(error){toast.error(error instanceof Error?error.message:'Could not save product assembly.');}finally{setBusy(false);}
 }
 const name=(id:string)=>catalogue.data?.find(p=>p.id===id)?.name??'Product';
 const finished=catalogue.data?.find(p=>p.id===productId);
 return <InventoryFrame title="Item bundles & assembly" subtitle="Define real product components and accurately account for assembled kits, gift packs and finished goods.">
  <InventoryStats cards={[{label:'Saved assembly recipes',value:query.isError?'—':query.data?.length??'—'},
    {label:'Components in new recipe',value:lines.length},{label:'Possible complete packs',value:Math.max(0,available)},
    {label:'Estimated cost per pack',value:formatMinorAmount(Math.round(cost),workspace.currency)}]}/>
  {query.isError&&<InventoryNotice retry={()=>void query.refetch()}>Saved assembly recipes could not be loaded.</InventoryNotice>}
  <InventoryPanel title="Define what goes into a finished product" subtitle="Choose each real stock item and how many units are required for one finished pack.">
   <form className="solar-form" onSubmit={e=>{void save(e)}}>
    <div className="solar-grid-two"><label>Finished product<select required value={productId} onChange={e=>setProductId(e.target.value)}>
      <option value="">Choose finished product</option>{(catalogue.data??[]).map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></label>
     <label>Assembly reference (optional)<input maxLength={60} placeholder="CLEANING-KIT-01" value={code} onChange={e=>setCode(e.target.value)}/></label></div>
    <div className="solar-item-details"><strong>Components required per unit</strong>
     {lines.map(l=><div key={l.productId} className="solar-form-row"><strong>{name(l.productId)}</strong><span>{l.quantity} units</span>
      <button type="button" className="solar-button-secondary" onClick={()=>setLines(current=>current.filter(x=>x.productId!==l.productId))}>Remove</button></div>)}
     <div className="solar-grid-two"><label>Component product<select value={component} onChange={e=>setComponent(e.target.value)}>
       <option value="">Choose component</option>{(catalogue.data??[]).filter(p=>p.id!==productId&&!lines.some(l=>l.productId===p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Quantity per finished item<input type="number" min=".001" step=".001" value={amount} onChange={e=>setAmount(e.target.value)}/></label></div>
     <button className="solar-button-secondary" type="button" disabled={!component||Number(amount)<=0} onClick={()=>{
       setLines(a=>[...a,{productId:component,quantity:Number(amount)}]);setComponent('');setAmount('1');
     }}><Plus size={15}/> Add component</button>
    </div>
    <div className="solar-grid-two"><div className="solar-chart"><strong>Proposed selling price</strong>
      <span>{finished?formatMinorAmount(finished.sellingPriceMinor,workspace.currency):'Choose finished item'}</span></div>
      <div className="solar-chart"><strong>Estimated component cost</strong><span>{formatMinorAmount(Math.round(cost),workspace.currency)}</span></div></div>
    <button className="solar-button" disabled={busy||!productId||!lines.length}><Boxes size={16}/> Save component recipe</button>
    <p className="solar-fineprint">Saving a component recipe does not move stock. Actual manufacturing or assembly must consume components and add finished stock through the authorised work-order flow. Do not sell a virtual kit as already manufactured.</p>
   </form>
  </InventoryPanel>
  <InventoryPanel title="Your assembled products" subtitle="Components, possible output using currently available stock, and the existing manufacturing approval process.">
   <InventoryTable headings={['Finished product','Recipe','Components','Possible output','Status']} rows={(query.data??[]).map(b=>{
    const components=getLines(b),qty=components.length?Math.floor(Math.min(...components.map(l=>
      (insightMap.get(String(field(l,'componentProductId','component_product_id')))?.available??0)/
      Math.max(.001,number(field(l,'quantityPerOutput','quantity_per_output')))))):0;
    return [String(field(b,'product_name')),String(field(b,'bom_code')),components.map(l=>String(l.componentName)+' × '+number(l.quantityPerOutput)).join(', '),
      Math.max(0,qty),<span className="solar-tag" key="status">{readable(b.status)}</span>];
   })} empty="No component recipes have been created yet."/>
   <div className="solar-actions"><Link to="/modules/work-orders" className="solar-button">Create assembly work order</Link>
    <Link to="/products" className="solar-button-secondary">Add a finished product</Link></div>
  </InventoryPanel>
 </InventoryFrame>;
}

