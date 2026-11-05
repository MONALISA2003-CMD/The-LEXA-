import {useMemo,useRef,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {apiEquipmentService,type WarrantyCaseStatus,type WarrantyCoverageDecision} from '../../data/remote/apiEquipmentService';
import {apiCatalogInventory} from '../../data/remote/apiWorkstream03';
import type {Product} from '../../domain/shared/types';

type Props={workspaceId:string;branchId:string;unitId:string;products:readonly Product[]};
const transitions:Record<WarrantyCaseStatus,readonly WarrantyCaseStatus[]>={
 opened:['inspecting'],inspecting:['repair_approved','rejected'],repair_approved:['repairing'],repairing:['closed'],rejected:['closed'],replaced:[],closed:[],
};
const coverageOptions:readonly {value:WarrantyCoverageDecision;label:string}[]=[
 {value:'seller_warranty',label:'Seller warranty'},{value:'goodwill',label:'Reviewed goodwill repair'},
 {value:'manufacturer_warranty',label:'Manufacturer responsibility'},
 {value:'out_of_warranty',label:'Outside documented coverage'},{value:'not_covered',label:'Excluded by reviewed terms'},
];

/** Inspect and record claims on an actual sold unit. Stock moves only through
 * the approved part-issue endpoint, never from changing claim status.
 */
export default function WarrantyCasePanel({workspaceId,branchId,unitId,products}:Props){
 const client=useQueryClient();
 const [caseId,setCaseId]=useState('');
 const [nextStatus,setNextStatus]=useState<WarrantyCaseStatus>('inspecting');
 const [evidenceReference,setEvidenceReference]=useState('');
 const [notes,setNotes]=useState('');
 const [coverage,setCoverage]=useState<WarrantyCoverageDecision>('seller_warranty');
 const [productId,setProductId]=useState('');
 const [variantId,setVariantId]=useState('');
 const [warehouseId,setWarehouseId]=useState('');
 const [lotId,setLotId]=useState('');
 const [partQuantity,setPartQuantity]=useState('1');
 const [partEvidence,setPartEvidence]=useState('');
 const partRequestKey=useRef(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `warranty-${Date.now()}-${Math.random().toString(36).slice(2)}`);
 const cases=useQuery({queryKey:['equipment-warranty-cases',workspaceId,branchId],queryFn:()=>apiEquipmentService.warrantyCases(workspaceId,branchId),enabled:Boolean(unitId),retry:false});
 const chosen=useMemo(()=>cases.data?.find(row=>row.id===caseId&&row.serialId===unitId),[cases.data,caseId,unitId]);
 const detail=useQuery({queryKey:['equipment-warranty-detail',workspaceId,branchId,caseId],queryFn:()=>apiEquipmentService.warrantyDetail(workspaceId,branchId,caseId),enabled:Boolean(chosen),retry:false});
 const warehouses=useQuery({queryKey:['equipment-warehouses',workspaceId,branchId],queryFn:()=>apiCatalogInventory.warehouses(workspaceId,branchId),enabled:Boolean(chosen?.status==='repairing'),retry:1});
 const variants=useQuery({queryKey:['warranty-part-variants',workspaceId,productId],queryFn:()=>apiCatalogInventory.variants(workspaceId,productId),enabled:Boolean(productId),retry:1});
 const lots=useQuery({queryKey:['warranty-part-lots',workspaceId,branchId,productId,variantId],queryFn:()=>apiCatalogInventory.availableLots(workspaceId,branchId,productId,variantId||undefined),enabled:Boolean(productId&&warehouseId),retry:1});
 const candidates=products.filter(p=>p.active&&p.trackStock&&p.trackLot&&!p.trackSerial);
 const allowedNext=chosen?transitions[chosen.status]:[];
 const changeStatus=useMutation({mutationFn:()=>{
  if(!chosen||!allowedNext.includes(nextStatus))throw new Error('Select an available claim decision.');
  return apiEquipmentService.transitionWarranty(workspaceId,branchId,chosen.id,{
   nextStatus,evidenceReference:evidenceReference.trim(),notes:notes.trim(),
   ...(['repair_approved','rejected'].includes(nextStatus)?{coverageDecision:coverage}:{}),
  });
 },onSuccess:()=>{setEvidenceReference('');setNotes('');void client.invalidateQueries({queryKey:['equipment-warranty-cases',workspaceId,branchId]});void client.invalidateQueries({queryKey:['equipment-warranty-detail',workspaceId,branchId,caseId]});toast.success('Warranty decision recorded');},onError:e=>toast.error('Warranty status not changed',{description:e instanceof Error?e.message:'Review the inspection evidence.'})});
 const issuePart=useMutation({mutationFn:()=>{
  if(!chosen||chosen.status!=='repairing')throw new Error('The claim is not approved for repair.');
  if(!warehouseId||!productId||!lotId||!/^\d+(?:\.\d{1,3})?$/.test(partQuantity)||Number(partQuantity)<=0||!partEvidence.trim())throw new Error('Choose the actual part lot, quantity and repair evidence.');
  return apiEquipmentService.issueWarrantyPart(workspaceId,branchId,chosen.id,{
   productId,...(variantId?{variantId}:{}),warehouseId,lotId,quantity:partQuantity,evidenceReference:partEvidence.trim(),
  },partRequestKey.current);
 },onSuccess:()=>{partRequestKey.current=typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `warranty-${Date.now()}-${Math.random().toString(36).slice(2)}`;setLotId('');setPartEvidence('');void client.invalidateQueries({queryKey:['equipment-warranty-detail',workspaceId,branchId,caseId]});void client.invalidateQueries({queryKey:['warranty-part-lots',workspaceId,branchId]});toast.success('Repair part issued and cost posted');},onError:e=>toast.error('Repair part not issued',{description:e instanceof Error?e.message:'No stock or ledger entry was posted.'})});
 if(!unitId)return null;
 return <section className="section-card" aria-label="Warranty claim decisions and repair parts">
  <div className="section-card-heading"><div><h4>Warranty claims and repair parts</h4><p>Claims refer to the sold device. Each coverage decision requires independent review; parts are charged to warranty expense only after approval.</p></div></div>
  {cases.isError&&<p role="alert">Warranty claims could not be loaded for this branch.</p>}
  {cases.data&&cases.data.filter(c=>c.serialId===unitId).length===0&&<p>No warranty claims have been opened for this device.</p>}
  {cases.data&&<label className="field-label">Claim for this device
   <select value={chosen?.id??''} onChange={event=>{setCaseId(event.target.value);setEvidenceReference('');setNotes('');}}>
    <option value="">Choose a warranty case</option>
    {cases.data.filter(row=>row.serialId===unitId).map(row=><option key={row.id} value={row.id}>{row.issueSummary.slice(0,65)} · {row.status.replace(/_/g,' ')}</option>)}
   </select>
  </label>}
  {chosen&&<div>
   <p><strong>Current claim status:</strong> {chosen.status.replace(/_/g,' ')}. Reported concern: {chosen.issueSummary}</p>
   {detail.data&&<details><summary>Inspection, decisions and issued parts</summary>
    {detail.data.events.map(event=><p key={event.id}>{new Date(event.createdAt).toLocaleString()} · {event.nextStatus.replace(/_/g,' ')} · {event.notes} · Reference {event.evidenceReference}</p>)}
    {detail.data.parts.map(part=><p key={part.id}>Part issued: {products.find(x=>x.id===part.productId)?.name??'Registered spare part'} · {part.quantity} units · {part.totalCostMinor} minor units · {part.evidenceReference}</p>)}
   </details>}
   {allowedNext.length>0&&<div className="form-two-col">
    <label className="field-label">Next claim step<select value={allowedNext.includes(nextStatus)?nextStatus:''} onChange={e=>setNextStatus(e.target.value as WarrantyCaseStatus)}><option value="">Choose a step</option>{allowedNext.map(s=><option value={s} key={s}>{s.replace(/_/g,' ')}</option>)}</select></label>
    {['repair_approved','rejected'].includes(nextStatus)&&<label className="field-label">Reviewed responsibility<select value={coverage} onChange={e=>setCoverage(e.target.value as WarrantyCoverageDecision)}>{coverageOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>}
    <label className="field-label">Inspection / decision reference<input value={evidenceReference} maxLength={250} onChange={e=>setEvidenceReference(e.target.value)} placeholder="Signed service inspection or approval reference"/></label>
    <label className="field-label">Technician or coverage decision notes<textarea rows={2} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Findings, coverage evidence and action taken"/></label>
    <button type="button" className="button button-secondary button-small" disabled={!allowedNext.includes(nextStatus)||!evidenceReference.trim()||notes.trim().length<8||changeStatus.isPending} onClick={()=>changeStatus.mutate()}>Record claim decision</button>
   </div>}
   {chosen.status==='repairing'&&<details><summary>Issue a received spare part to this repair</summary>
    <p>Only accepted, available part lots can be issued. The posting decreases stock and records the exact warranty expense.</p>
    <div className="form-two-col">
     <label className="field-label">Spare-part product<select value={productId} onChange={e=>{setProductId(e.target.value);setVariantId('');setLotId('');}}><option value="">Choose part</option>{candidates.map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></label>
     <label className="field-label">Warehouse<select value={warehouseId} onChange={e=>{setWarehouseId(e.target.value);setLotId('');}}><option value="">Choose warehouse</option>{(warehouses.data??[]).filter((w): w is Record<string,unknown>&{id:string;name:string}=>typeof w.id==='string'&&typeof w.name==='string').map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
     {(variants.data??[]).some(v=>v.active)&&<label className="field-label">Exact part variant<select value={variantId} onChange={e=>{setVariantId(e.target.value);setLotId('');}}><option value="">Choose variant</option>{(variants.data??[]).filter(v=>v.active).map(v=><option key={v.id} value={v.id}>{v.sku}</option>)}</select></label>}
     <label className="field-label">Accepted spare-part lot<select value={lotId} onChange={e=>setLotId(e.target.value)}><option value="">Choose source lot</option>{(lots.data??[]).filter(l=>l.available>0&&l.warehouseId===warehouseId&&(!variantId||l.variantId===variantId)).map(l=><option key={l.id} value={l.id}>{l.lotNumber} · {l.available} available</option>)}</select></label>
     <label className="field-label">Quantity issued<input value={partQuantity} onChange={e=>setPartQuantity(e.target.value)} inputMode="decimal" placeholder="1"/></label>
     <label className="field-label">Part fitting / inspection reference<input value={partEvidence} onChange={e=>setPartEvidence(e.target.value)} maxLength={250} placeholder="Signed technician service record"/></label>
    </div>
    <button type="button" className="button button-primary button-small" disabled={!productId||!warehouseId||!lotId||!partEvidence.trim()||issuePart.isPending} onClick={()=>issuePart.mutate()}>Post repair part and warranty expense</button>
   </details>}
  </div>}
 </section>;
}
