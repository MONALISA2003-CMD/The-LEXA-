import {useMemo,useState,type FormEvent} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {useWorkspace} from '../../app/WorkspaceContext';
import {dataProviderMode} from '../../data/remote/runtimeConfig';
import {apiIndustryOperations} from '../../data/remote/apiIndustryOperations';
import type {Product} from '../../domain/shared/types';

/** A primary merchandising division is captured on each subsequent sale line.
 * Historical sale lines are not reclassified by editing a product assignment. */
export default function ProductDivisionsPanel({products}:{products:readonly Product[]}){
 const {workspace,branch}=useWorkspace();const qc=useQueryClient();
 const w=workspace.id,b=branch.id,connected=dataProviderMode==='api';
 const divisions=useQuery({queryKey:['business-divisions',w,b],queryFn:()=>apiIndustryOperations.divisions(w,b),enabled:connected,retry:0});
 const assignments=useQuery({queryKey:['product-division-assignments',w,b],queryFn:()=>apiIndustryOperations.divisionAssignments(w,b),enabled:connected,retry:0});
 const [divisionCode,setDivisionCode]=useState('');const [divisionName,setDivisionName]=useState('');
 const [productId,setProductId]=useState('');const [targetDivision,setTargetDivision]=useState('');const [busy,setBusy]=useState(false);
 const primary=useMemo(()=>new Map((assignments.data??[]).map(x=>[x.productId,x.divisionId])),[assignments.data]);
 const selectedProduct=products.find(p=>p.id===productId);
 const selectedName=divisions.data?.find(d=>d.id===primary.get(productId))?.name;
 async function refresh(){await Promise.all([qc.invalidateQueries({queryKey:['business-divisions',w,b]}),qc.invalidateQueries({queryKey:['product-division-assignments',w,b]})]);}
 async function create(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);try{
  await apiIndustryOperations.createDivision(w,b,{code:divisionCode.trim().toLowerCase(),name:divisionName.trim()});
  setDivisionCode('');setDivisionName('');await refresh();toast.success('Division saved');
 }catch(error){toast.error(error instanceof Error?error.message:'Division was not saved.');}finally{setBusy(false);}}
 async function assign(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!productId||!targetDivision)return;setBusy(true);try{
  await apiIndustryOperations.assignDivision(w,b,targetDivision,productId);await refresh();toast.success('Product division updated');
 }catch(error){toast.error(error instanceof Error?error.message:'Product division was not updated.');}finally{setBusy(false);}}
 if(!connected)return null;
 return <section className="section-card" aria-label="Business divisions">
  <details>
   <summary><strong>Business divisions</strong> <span className="field-help">Sales allocation and product ownership</span></summary>
   <p className="field-help">A division identifies which area of the business sold a product. New sales record the assignment at checkout; previous receipts and accounts are not changed.</p>
   {divisions.isError||assignments.isError?<p role="alert">Division records are unavailable. Check your access to this branch before editing.</p>:<>
    <form className="form-stack" onSubmit={e=>void create(e)}>
     <div className="form-two-col"><label className="field-label">Division code<input required pattern="[a-z][a-z0-9_]{1,47}" maxLength={48} value={divisionCode} onChange={e=>setDivisionCode(e.target.value.toLowerCase())} placeholder="e.g. fragrance_retail"/></label>
     <label className="field-label">Division name<input required maxLength={120} value={divisionName} onChange={e=>setDivisionName(e.target.value)} placeholder="Fragrance retail"/></label></div>
     <button className="button button-secondary" disabled={busy} type="submit">Add division</button>
    </form>
    <form className="form-stack" onSubmit={e=>void assign(e)}>
     <div className="form-two-col"><label className="field-label">Product<select required value={productId} onChange={e=>{setProductId(e.target.value);setTargetDivision(primary.get(e.target.value)??'');}}><option value="">Choose an existing product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></label>
     <label className="field-label">Primary business division<select required value={targetDivision} onChange={e=>setTargetDivision(e.target.value)}><option value="">Choose a division</option>{(divisions.data??[]).filter(d=>d.active).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label></div>
     {selectedProduct&&<small className="field-help">Current assignment: {selectedName??'Unassigned'}. Changing it affects future sales only.</small>}
     <button className="button button-primary" type="submit" disabled={busy||!productId||!targetDivision}>Assign product</button>
    </form>
   </>}
  </details>
 </section>;
}
