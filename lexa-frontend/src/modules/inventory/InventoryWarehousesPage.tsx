
import {useState,type FormEvent} from 'react';
import {useQuery} from '@tanstack/react-query';
import {toast} from 'sonner';
import {useWorkspace} from '../../app/WorkspaceContext';
import {apiCatalogInventory} from '../../data/remote/apiWorkstream03';
import {apiInventoryOperations} from '../../data/remote/apiInventoryOperations';
import {InventoryFrame,InventoryPanel,InventoryNotice,InventoryStats,InventoryTable} from './InventoryFrame';
import {Plus} from '../../components/LexaIcon';
export default function InventoryWarehousesPage(){
 const {workspace,branch}=useWorkspace(),scope={workspaceId:workspace.id,branchId:branch.id};
 const wh=useQuery({queryKey:['supply-warehouses',workspace.id,branch.id],queryFn:()=>apiInventoryOperations.warehouses(scope)});
 const intel=useQuery({queryKey:['inventory-intelligence',workspace.id,branch.id],queryFn:()=>apiInventoryOperations.intelligence(scope)});
 const [code,setCode]=useState(''),[name,setName]=useState(''),[selected,setSelected]=useState(''),[binCode,setBinCode]=useState(''),[binName,setBinName]=useState(''),[busy,setBusy]=useState(false);
 const bins=useQuery({queryKey:['storage-bins',workspace.id,branch.id,selected],queryFn:()=>apiCatalogInventory.bins(workspace.id,branch.id,selected),enabled:!!selected});
 async function add(e:FormEvent){
  e.preventDefault();setBusy(true);try{await apiInventoryOperations.createWarehouse(scope,{code:code.toUpperCase(),name});
   await wh.refetch();setCode('');setName('');toast.success('Storage area added to this business.');}
   catch(error){toast.error(error instanceof Error?error.message:'Could not add storage area.');}finally{setBusy(false);}
 }
 async function addBin(e:FormEvent){
  e.preventDefault();setBusy(true);try{await apiCatalogInventory.createBin(workspace.id,branch.id,selected,{code:binCode.toUpperCase(),name:binName});
   await bins.refetch();setBinCode('');setBinName('');toast.success('Shelf added successfully.');}
   catch(error){toast.error(error instanceof Error?error.message:'Could not add shelf.');}finally{setBusy(false);}
 }
 return <InventoryFrame title="Warehouses & shelves" subtitle="Know exactly where each product belongs inside your existing business.">
  <InventoryStats cards={[{label:'Your business',value:workspace.businessName},{label:'Storage areas',value:wh.isError?'—':wh.data?.length??'—'},{label:'Products in stock',value:intel.data?.totals.products??'—'},{label:'Units available',value:intel.data?.totals.available??'—'}]}/>
  {wh.isError&&<InventoryNotice retry={()=>void wh.refetch()}>Storage locations could not be loaded.</InventoryNotice>}
  <InventoryPanel title="Your internal storage areas" subtitle="Shop floor, back storeroom, receiving and returns are part of one business.">
   <div className="solar-rows">{(wh.data??[]).map(w=><article key={String(w.id)}><div>
    <strong>{String(w.name)}</strong><small>{String(w.code)} · {branch.name}</small></div>
    <button className="solar-button-secondary" onClick={()=>setSelected(String(w.id))}>View shelves</button>
   </article>)}{!wh.isLoading&&!wh.data?.length&&<p className="solar-empty">Create a storage area to organise your inventory.</p>}</div>
   <form className="solar-form" onSubmit={e=>{void add(e)}}><div className="solar-grid-two">
    <label>Location code<input required maxLength={30} value={code} onChange={e=>setCode(e.target.value)} placeholder="BACKSTORE"/></label>
    <label>Location name<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="Back storeroom"/></label>
    </div><button className="solar-button" disabled={busy}><Plus size={16}/> Add storage area</button></form>
  </InventoryPanel>
  {selected&&<InventoryPanel title={'Shelves · '+String(wh.data?.find(w=>w.id===selected)?.name??'Storage area')} subtitle="Give every rack and shelf a recognisable reference.">
   {bins.isError&&<InventoryNotice retry={()=>void bins.refetch()}>Shelf information could not be loaded.</InventoryNotice>}
   <InventoryTable headings={['Shelf code','Location description']} rows={(bins.data??[]).map(b=>[String(b.code),String(b.name)])} empty="No shelves have been added here."/>
   <form className="solar-form" onSubmit={e=>{void addBin(e)}}><div className="solar-grid-two">
    <label>Shelf or bin code<input required maxLength={30} value={binCode} onChange={e=>setBinCode(e.target.value)} placeholder="RACK-B3"/></label>
    <label>Location description<input required maxLength={100} value={binName} onChange={e=>setBinName(e.target.value)} placeholder="Rack B, shelf 3"/></label>
   </div><button className="solar-button" disabled={busy}><Plus size={16}/> Add shelf</button></form>
  </InventoryPanel>}
 </InventoryFrame>;
}

