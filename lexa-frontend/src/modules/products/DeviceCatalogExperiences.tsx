import {useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {apiCatalogInventory} from '../../data/remote/apiWorkstream03';
import {dataProviderMode} from '../../data/remote/runtimeConfig';
import {presetFor} from '../../domain/catalog/industryCatalog';
import {BarcodeCapture} from '../../components/barcode/BarcodeCapture';
import type {Product} from '../../domain/shared/types';

/** Searchable business-owned brands/models, not brand-shaped category names. */
export function DeviceBrandModelSelector({workspaceId,productType,brandId,modelId,onChange}:{workspaceId:string;productType:string;brandId:string;modelId:string;onChange:(next:{brandId:string;modelId:string;brandName?:string;modelName?:string})=>void}){
 const client=useQueryClient();const [brandName,setBrandName]=useState('');const [modelName,setModelName]=useState('');const [code,setCode]=useState('');
 const eligible=presetFor(productType).industries.some(x=>['mobile_phones','electronics','household_goods','repair_services'].includes(x))&&productType!=='general';
 const brands=useQuery({queryKey:['catalog-brands',workspaceId],queryFn:()=>apiCatalogInventory.catalogBrands(workspaceId),enabled:dataProviderMode==='api'&&eligible});
 const models=useQuery({queryKey:['catalog-device-models',workspaceId],queryFn:()=>apiCatalogInventory.catalogDeviceModels(workspaceId),enabled:dataProviderMode==='api'&&eligible});
 const createBrand=useMutation({mutationFn:()=>apiCatalogInventory.createCatalogBrand(workspaceId,brandName),onSuccess:async record=>{await client.invalidateQueries({queryKey:['catalog-brands',workspaceId]});onChange({brandId:record.id,modelId:'',brandName:record.name});setBrandName('');toast.success('Manufacturer / brand saved');},onError:e=>toast.error('Brand not saved',{description:e instanceof Error?e.message:'Check the name.'})});
 const createModel=useMutation({mutationFn:()=>apiCatalogInventory.createCatalogDeviceModel(workspaceId,{brandId,name:modelName,productType,...(code.trim()?{manufacturerCode:code.trim()}:{})}),onSuccess:async record=>{await client.invalidateQueries({queryKey:['catalog-device-models',workspaceId]});onChange({brandId:record.brandId,modelId:record.id,modelName:record.name});setModelName('');setCode('');toast.success('Manufacturer model saved');},onError:e=>toast.error('Model not saved',{description:e instanceof Error?e.message:'Check the model.'})});
 if(!eligible||dataProviderMode!=='api')return null;
 const matching=(models.data??[]).filter(m=>m.brandId===brandId&&m.productType===productType);
 return <section className="lexa-category-editor" aria-label="Manufacturer and model catalogue">
  <h4>Manufacturer / brand and model</h4>
  <p>Choose the exact manufacturer and product model. Brands are shared across phones, electronics and appliances; they are not product categories. Unknown brands can be registered by your business.</p>
  <div className="form-two-col">
   <label className="field-label">Brand<select value={brandId} onChange={e=>{const b=(brands.data??[]).find(x=>x.id===e.target.value);onChange({brandId:e.target.value,modelId:'',brandName:b?.name??''});}}><option value="">Select / add brand</option>{(brands.data??[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
   <label className="field-label">Manufacturer model<select value={modelId} disabled={!brandId} onChange={e=>{const m=matching.find(x=>x.id===e.target.value);onChange({brandId,modelId:e.target.value,modelName:m?.name??''});}}><option value="">Select / add model</option>{matching.map(m=><option key={m.id} value={m.id}>{m.name}{m.manufacturerCode?' · '+m.manufacturerCode:''}</option>)}</select></label>
  </div>
  <div className="form-two-col"><label className="field-label">Add missing brand<input maxLength={100} value={brandName} onChange={e=>setBrandName(e.target.value)} placeholder="e.g. Samsung"/></label><button type="button" className="button button-secondary button-small" disabled={!brandName.trim()||createBrand.isPending} onClick={()=>createBrand.mutate()}>Register brand</button></div>
  {brandId&&<div className="form-two-col"><label className="field-label">Add model<input maxLength={120} value={modelName} onChange={e=>setModelName(e.target.value)} placeholder="e.g. Galaxy S24"/></label><label className="field-label">Manufacturer code (optional)<input value={code} maxLength={100} onChange={e=>setCode(e.target.value)} placeholder="Official model code"/></label><button type="button" className="button button-secondary button-small" disabled={!modelName.trim()||createModel.isPending} onClick={()=>createModel.mutate()}>Register model</button></div>}
  <small className="field-help">Products with no registered model remain supported; existing product IDs and identifiers are preserved.</small>
 </section>;
}

/** Fitment requires a verified relationship, not a textual model-name guess. */
export function AccessoryCompatibilityManager({workspaceId,product}:{workspaceId:string;product:Product}){
 const allowed=new Set(['phone_accessory','phone_case','screen_protector','charger','usb_cable','power_bank','earphones','spare_part']);
 const [modelId,setModelId]=useState('');const [notes,setNotes]=useState('');const client=useQueryClient();
 const enabled=dataProviderMode==='api'&&allowed.has(product.productType??'');
 const models=useQuery({queryKey:['catalog-device-models',workspaceId],queryFn:()=>apiCatalogInventory.catalogDeviceModels(workspaceId),enabled});
 const brands=useQuery({queryKey:['catalog-brands',workspaceId],queryFn:()=>apiCatalogInventory.catalogBrands(workspaceId),enabled});
 const fits=useQuery({queryKey:['compatible-models',workspaceId,product.id],queryFn:()=>apiCatalogInventory.accessoryFits(workspaceId,product.id),enabled});
 const propose=useMutation({mutationFn:()=>apiCatalogInventory.linkAccessoryFit(workspaceId,product.id,{deviceModelId:modelId,...(notes.trim()?{fitmentNotes:notes.trim()}:{})}),onSuccess:async()=>{await client.invalidateQueries({queryKey:['compatible-models',workspaceId,product.id]});setModelId('');setNotes('');toast.success('Compatibility submitted for verification');},onError:e=>toast.error('Compatibility was not saved',{description:e instanceof Error?e.message:''})});
 const verify=useMutation({mutationFn:(id:string)=>apiCatalogInventory.verifyAccessoryFit(workspaceId,id),onSuccess:async()=>{await client.invalidateQueries({queryKey:['compatible-models',workspaceId,product.id]});toast.success('Compatibility verified');},onError:e=>toast.error('Approval unavailable',{description:e instanceof Error?e.message:'Manager approval required'})});
 if(!enabled)return null;
 const modelById=new Map((models.data??[]).map(m=>[m.id,m]));const brandById=new Map((brands.data??[]).map(b=>[b.id,b.name]));
 return <section className="lexa-variant-manager"><h4>Compatible device models</h4><p>Link this accessory only to models whose fit is verified. A business inventory approver must confirm the link before checkout recommends it.</p>
 {(fits.data??[]).map(f=>{const m=modelById.get(f.deviceModelId);return <div className="lexa-variant-row" key={f.id}><strong>{m?(brandById.get(m.brandId)??'Brand')+' '+m.name:'Registered device model'}</strong><span>{f.verifiedAt?'Verified':'Pending verification'} {f.fitmentNotes??''}{!f.verifiedAt&&<button type="button" className="button button-secondary button-small" disabled={verify.isPending} onClick={()=>verify.mutate(f.id)}>Verify fit</button>}</span></div>;})}
 <label className="field-label">Device model<select value={modelId} onChange={e=>setModelId(e.target.value)}><option value="">Select compatible model</option>{(models.data??[]).map(m=><option key={m.id} value={m.id}>{brandById.get(m.brandId)??'Brand'} · {m.name}</option>)}</select></label>
 <label className="field-label">Compatibility evidence / notes<input maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Manufacturer fit list or physical fit test"/></label>
 <button type="button" className="button button-secondary button-small" disabled={!modelId||propose.isPending} onClick={()=>propose.mutate()}>Propose compatible model</button>
 </section>;
}

/** Append-only inspection trail; cannot change stock or mark a device sold. */
export function UnitConditionManager({workspaceId,branchId,productId,variantId}:{workspaceId:string;branchId:string;productId:string;variantId:string}){
 const [serialId,setSerialId]=useState('');const [identifier,setIdentifier]=useState('');const [condition,setCondition]=useState('new');const [battery,setBattery]=useState('');const [notes,setNotes]=useState('');const client=useQueryClient();
 const units=useQuery({queryKey:['inspection-available-serials',workspaceId,branchId,productId,variantId],queryFn:()=>apiCatalogInventory.availableSerials(workspaceId,branchId,productId,variantId||undefined),enabled:dataProviderMode==='api'});
 const history=useQuery({queryKey:['unit-inspections',workspaceId,branchId,serialId],queryFn:()=>apiCatalogInventory.unitInspections(workspaceId,branchId,serialId),enabled:Boolean(serialId)});
 const lifecycle=useQuery({queryKey:['unit-lifecycle',workspaceId,branchId,serialId],queryFn:()=>apiCatalogInventory.unitLifecycle(workspaceId,branchId,serialId),enabled:Boolean(serialId)});
 const lookup=useMutation({mutationFn:(value:string)=>apiCatalogInventory.lookupSerial(workspaceId,branchId,value),onSuccess:row=>{if(row.productId!==productId){toast.error('This identifier belongs to a different product.');return;}setSerialId(row.id);toast.success('Exact unit found');},onError:e=>toast.error('Device not found',{description:e instanceof Error?e.message:'Check the actual IMEI or serial.'})});
 const create=useMutation({mutationFn:()=>apiCatalogInventory.addUnitInspection(workspaceId,branchId,serialId,{condition,...(battery.trim()?{batteryHealthPercent:Number(battery)}:{}),...(notes.trim()?{notes:notes.trim()}:{})}),onSuccess:async()=>{await client.invalidateQueries({queryKey:['unit-inspections',workspaceId,branchId,serialId]});setNotes('');toast.success('Physical-unit inspection recorded');},onError:e=>toast.error('Inspection not saved',{description:e instanceof Error?e.message:''})});
 return <section className="lexa-variant-manager"><h4>Unit inspection and condition</h4><p>Record the actual physical condition of a specific device. Inspections are immutable history and do not create stock or alter sale identities.</p>
 <BarcodeCapture compact label="Scan any unit IMEI or serial, including sold devices" onCode={code=>{setIdentifier(code);lookup.mutate(code);}}/>
 <div className="form-two-col"><label className="field-label">Search exact unit identifier<input value={identifier} onChange={e=>setIdentifier(e.target.value)} maxLength={120} placeholder="IMEI or manufacturer serial"/></label><button type="button" className="button button-secondary button-small" disabled={!identifier.trim()||lookup.isPending} onClick={()=>lookup.mutate(identifier)}>Find unit history</button></div>
 <label className="field-label">Available device<select value={serialId} onChange={e=>setSerialId(e.target.value)}><option value="">Select unit by IMEI / serial</option>{(units.data??[]).map(s=><option key={s.id} value={s.id}>{s.serialNumber}</option>)}</select></label>
 {serialId&&<><div className="form-two-col"><label className="field-label">Condition<select value={condition} onChange={e=>setCondition(e.target.value)}><option value="new">New</option><option value="open_box">Open box</option><option value="used_good">Used – good</option><option value="used_fair">Used – fair</option><option value="refurbished">Refurbished</option><option value="damaged">Damaged</option></select></label><label className="field-label">Battery health % (if measured)<input type="number" min="0" max="100" step="1" value={battery} onChange={e=>setBattery(e.target.value)}/></label></div><label className="field-label">Inspection notes<input maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Checked functions, included accessories, physical condition"/></label><button type="button" className="button button-secondary button-small" disabled={create.isPending} onClick={()=>create.mutate()}>Record inspection</button>{lifecycle.data&&<div className="lexa-product-hint"><strong>Exact unit: {lifecycle.data.unit.serialNumber}</strong> · {lifecycle.data.unit.status}. {(lifecycle.data.sales??[]).map(x=>`Sold on receipt ${x.sale.receiptNumber}`).join(' · ')} {(lifecycle.data.returns??[]).map(x=>`Return ${x.returnRecord.returnNumber} (${x.disposition})`).join(' · ')} <small>{lifecycle.data.movements.length} stock movement events recorded.</small></div>}{(history.data??[]).map(h=><div className="lexa-variant-row" key={h.id}><strong>{h.condition.replaceAll('_',' ')} · {new Date(h.createdAt).toLocaleString()}</strong><small>{h.batteryHealthPercent===null?'':`Battery ${h.batteryHealthPercent}% · `}{h.notes??''}</small></div>)}</>}
 </section>;
}
