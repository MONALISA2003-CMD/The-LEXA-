import {useMemo,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {BarcodeCapture} from '../../components/barcode/BarcodeCapture';
import {apiCatalogInventory,type ElectronicsReceiptUnit} from '../../data/remote/apiWorkstream03';
import {dataProviderMode} from '../../data/remote/runtimeConfig';
import type {Product} from '../../domain/shared/types';
import {isValidPhysicalIdentifier,validateReceiptDraft} from '../../domain/catalog/electronicsReceivingValidation';
import {UnitConditionManager} from './DeviceCatalogExperiences';

const receiptKey=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():`lexa-receipt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const conditions=['new','open_box','used_good','used_fair','refurbished','damaged'] as const;
const value=(v:unknown)=>typeof v==='string'?v:'';

/** Drafts are local to this browser session. Neither scanning nor editing posts stock. */
export function ElectronicsSerializedReceiving({workspaceId,branchId,product}:{workspaceId:string;branchId:string;product:Product}){
 const queryClient=useQueryClient();
 const [warehouseId,setWarehouseId]=useState('');
 const [variantId,setVariantId]=useState('');
 const [reference,setReference]=useState('');
 const [primary,setPrimary]=useState('');
 const [second,setSecond]=useState('');
 const [extraImeis,setExtraImeis]=useState('');
 const [condition,setCondition]=useState<NonNullable<ElectronicsReceiptUnit['condition']>>('new');
 const [notes,setNotes]=useState('');
 const [cost,setCost]=useState(String(product.costPriceMinor));
 const [draft,setDraft]=useState<ElectronicsReceiptUnit[]>([]);
 const [idempotencyKey,setIdempotencyKey]=useState(receiptKey);
 const isPhone=['smartphone','feature_phone','cellular_tablet','mifi_router'].includes(product.productType??'');
 const variants=useQuery({queryKey:['product-variants',workspaceId,product.id],queryFn:()=>apiCatalogInventory.variants(workspaceId,product.id),enabled:dataProviderMode==='api'});
 const warehouses=useQuery({queryKey:['warehouses',workspaceId,branchId],queryFn:()=>apiCatalogInventory.warehouses(workspaceId,branchId),enabled:dataProviderMode==='api'});
 const reconciliation=useQuery({queryKey:['physical-unit-reconciliation',workspaceId,branchId],queryFn:()=>apiCatalogInventory.reconcilePhysicalUnits(workspaceId,branchId),enabled:dataProviderMode==='api',staleTime:30000});
 const mismatch=reconciliation.data?.items.find(item=>item.productId===product.id&&!item.balanced);
 const issues=useMemo(()=>validateReceiptDraft(draft,isPhone),[draft,isPhone]);
 const insert=()=>{
  const item:ElectronicsReceiptUnit={serialNumber:primary.trim(),...(second.trim()?{imei2:second.trim()}:{}),...(extraImeis.trim()?{extraImeis:extraImeis.split(',').map(x=>x.trim())}:{}),condition,...(notes.trim()?{notes:notes.trim()}:{})};
  const problems=validateReceiptDraft([...draft,item],isPhone);
  if(problems.length){toast.error('Check this device identifier',{description:problems[0]});return;}
  if(draft.length>=100){toast.error('Maximum 100 units per batch.');return;}
  setDraft(list=>[...list,item]);setPrimary('');setSecond('');setExtraImeis('');setNotes('');toast.success('Unit added to local draft. No stock posted.');
 };
 const commit=useMutation({mutationFn:()=>apiCatalogInventory.receiveSerializedStock(workspaceId,branchId,{productId:product.id,warehouseId,reference:reference.trim(),sourceKind:'approved_opening',unitCostMinor:Number(cost),units:draft,...(variantId?{variantId}:{})},idempotencyKey),onSuccess:async row=>{
  toast.success(`${row.accepted} physical units ${row.alreadyPosted?'already posted':'received and posted'}`);
  setDraft([]);setIdempotencyKey(receiptKey);setReference('');setSecond('');
  await queryClient.invalidateQueries({queryKey:['available-serials',workspaceId,branchId,product.id]});
  await queryClient.invalidateQueries({queryKey:['inventory-balances',workspaceId,branchId]});
  await queryClient.invalidateQueries({queryKey:['physical-unit-reconciliation',workspaceId,branchId]});
 },onError:error=>toast.error('Receipt not posted',{description:error instanceof Error?error.message:'Check your permissions and each actual device identifier.'})});
 const good=Boolean(draft.length&&!issues.length&&warehouseId&&reference.trim()&&Number.isSafeInteger(Number(cost))&&Number(cost)>=0&&(!variants.data?.length||variantId));
 if(dataProviderMode!=='api')return null;
 return <section className="lexa-variant-manager" aria-label="Serialized device receiving">
  <h4>Receive phones and devices</h4>
  <p><strong>Draft, not stock:</strong> Scanning only adds to a local, in-memory queue. An inventory approver must post this approved-opening receipt. Supplier deliveries must use Purchasing → Goods Receipt instead.</p>
  <p className="field-help" role="status">{draft.length} scanned units in draft · These devices are not available to sell until receipt approval.</p>
  {mismatch&&<p className="inline-error" role="alert">Inventory reconciliation needs review: {mismatch.registeredUnits} registered units against {mismatch.ledgerUnits} stock movement units for this product. Check received devices before posting or selling.</p>}
  <div className="form-two-col">
   <label className="field-label">Warehouse<select value={warehouseId} onChange={e=>setWarehouseId(e.target.value)}><option value="">Select warehouse</option>{(warehouses.data??[]).map(row=><option key={value(row.id)} value={value(row.id)}>{value(row.name)}</option>)}</select></label>
   <label className="field-label">Sellable variant<select value={variantId} onChange={e=>setVariantId(e.target.value)}><option value="">{variants.data?.length?'Choose required SKU':'Base product'}</option>{(variants.data??[]).map(item=><option key={item.id} value={item.id}>{item.sku}</option>)}</select></label>
   <label className="field-label">Approved opening reference<input value={reference} maxLength={120} onChange={e=>setReference(e.target.value)} placeholder="Opening stock approval / reference"/></label>
   <label className="field-label">Cost per physical unit (minor currency units)<input type="number" min="0" step="1" value={cost} onChange={e=>setCost(e.target.value)}/></label>
  </div>
  <BarcodeCapture compact label={isPhone?'Scan IMEI 1':'Scan manufacturer serial'} onCode={code=>setPrimary(code.trim())}/>
  <div className="form-two-col">
   <label className="field-label">{isPhone?'IMEI 1 · 15 digits':'Physical serial'}<input value={primary} onChange={e=>setPrimary(e.target.value)} maxLength={isPhone?15:120} inputMode={isPhone?'numeric':'text'} autoComplete="off"/></label>
   {isPhone&&<label className="field-label">IMEI 2 (only if assigned)<input value={second} onChange={e=>setSecond(e.target.value)} maxLength={15} inputMode="numeric" autoComplete="off"/></label>}
   {isPhone&&<label className="field-label">Additional actual IMEIs, comma separated<input value={extraImeis} onChange={e=>setExtraImeis(e.target.value)} placeholder="Optional" autoComplete="off"/></label>}
   <label className="field-label">Unit condition<select value={condition} onChange={e=>setCondition(e.target.value as NonNullable<ElectronicsReceiptUnit['condition']>)}>{conditions.map(c=><option key={c} value={c}>{c.replaceAll('_',' ')}</option>)}</select></label>
   <label className="field-label">Inspection note<input value={notes} maxLength={1000} onChange={e=>setNotes(e.target.value)} placeholder="Optional physical condition details"/></label>
  </div>
  <button type="button" className="button button-secondary button-small" disabled={!isValidPhysicalIdentifier(primary,isPhone)||draft.length>=100||commit.isPending} onClick={insert}>Add unit to draft</button>
  {draft.length>0&&<div aria-label="Unposted scanned units" className="lexa-variant-list">{draft.map((u,i)=><div className="lexa-variant-row" key={`${u.serialNumber}-${i}`}><span><strong>Unit {i+1}</strong> · {u.serialNumber.replace(/^(.{4}).*(.{4})$/,'$1••••$2')} {u.imei2?'· IMEI 2 assigned':''} · {u.condition}</span><button type="button" className="button button-secondary button-small" disabled={commit.isPending} onClick={()=>setDraft(list=>list.filter((_,n)=>n!==i))} aria-label={`Remove draft unit ${i+1}`}>Remove</button></div>)}</div>}
  {issues.length>0&&<p role="alert" className="inline-error">{issues[0]}</p>}
  <button type="button" className="button button-primary button-small" disabled={!good||commit.isPending||(typeof navigator!=='undefined'&&!navigator.onLine)} onClick={()=>commit.mutate()}>{commit.isPending?'Posting exact units…':`Approve and post ${draft.length} physical units`}</button>
  <small className="field-help">Every accepted handset creates one stock unit, even with multiple IMEIs. Invalid or duplicated identifiers are rejected atomically. Damaged units enter quarantine.</small>
  <UnitConditionManager workspaceId={workspaceId} branchId={branchId} productId={product.id} variantId={variantId}/>
 </section>;
}

/** Source-aware, effective-dated package sizes and aliases are not stock movements. */
export function ElectronicsProductIdentityAndPackages({workspaceId,product}:{workspaceId:string;product:Product}){
 const client=useQueryClient();const [aliasType,setAliasType]=useState('supplier_sku');const [aliasValue,setAliasValue]=useState('');
 const [packageId,setPackageId]=useState('');const [size,setSize]=useState('');const [effectiveAt,setEffectiveAt]=useState('');
 const aliases=useQuery({queryKey:['product-aliases',workspaceId,product.id],queryFn:()=>apiCatalogInventory.productAliases(workspaceId,product.id)});
 const packages=useQuery({queryKey:['product-packages',workspaceId,product.id],queryFn:()=>apiCatalogInventory.productPackages(workspaceId,product.id)});
 const history=useQuery({queryKey:['package-conversions',workspaceId,product.id,packageId],queryFn:()=>apiCatalogInventory.packageConversionHistory(workspaceId,product.id,packageId),enabled:Boolean(packageId)});
 const addAlias=useMutation({mutationFn:()=>apiCatalogInventory.createProductAlias(workspaceId,product.id,aliasType,aliasValue),onSuccess:async()=>{setAliasValue('');await client.invalidateQueries({queryKey:['product-aliases',workspaceId,product.id]});toast.success('Search alias saved without stock changes');},onError:e=>toast.error('Alias rejected',{description:e instanceof Error?e.message:''})});
 const revise=useMutation({mutationFn:()=>apiCatalogInventory.revisePackageConversion(workspaceId,product.id,packageId,Number(size),new Date(effectiveAt).toISOString()),onSuccess:async()=>{setSize('');setEffectiveAt('');await client.invalidateQueries({queryKey:['package-conversions',workspaceId,product.id,packageId]});toast.success('Future package conversion scheduled');},onError:e=>toast.error('Conversion rejected',{description:e instanceof Error?e.message:''})});
 return <section className="lexa-variant-manager" aria-label="Search aliases and package version history">
  <h4>Supplier / manufacturer search codes</h4>
  <p>Search by supplier SKU, manufacturer code, authentic GTIN or barcode. An alias cannot identify two different products in this business.</p>
  {(aliases.data??[]).map(a=><div className="lexa-variant-row" key={a.id}><strong>{a.aliasType.replaceAll('_',' ')}</strong><span>{a.aliasValue}</span></div>)}
  <div className="form-two-col"><label className="field-label">Code type<select value={aliasType} onChange={e=>setAliasType(e.target.value)}>{['supplier_sku','manufacturer_code','gtin','barcode','brand_reference','other'].map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label><label className="field-label">Search value<input value={aliasValue} onChange={e=>setAliasValue(e.target.value)} maxLength={120}/></label></div>
  <button type="button" className="button button-secondary button-small" disabled={!aliasValue.trim()||addAlias.isPending} onClick={()=>addAlias.mutate()}>Save search code</button>
  <h4>Effective-dated packaging conversions</h4>
  <p>For example, 1 carton = 10 cables. A new conversion takes effect on its scheduled date and never rewrites an earlier receipt.</p>
  <label className="field-label">Package<select value={packageId} onChange={e=>setPackageId(e.target.value)}><option value="">Choose a package</option>{(packages.data??[]).map(p=><option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></label>
  {(history.data??[]).map(r=><p key={r.id} className="field-help">Revision {r.version}: {r.unitsPerPackage} base units, effective {new Date(r.effectiveAt).toLocaleDateString()}</p>)}
  <div className="form-two-col"><label className="field-label">New base units per package<input type="number" min="0.001" step="0.001" value={size} onChange={e=>setSize(e.target.value)}/></label><label className="field-label">Effective date and time<input type="datetime-local" value={effectiveAt} onChange={e=>setEffectiveAt(e.target.value)}/></label></div>
  <button type="button" className="button button-secondary button-small" disabled={!packageId||!size||!effectiveAt||Number(size)<=0||revise.isPending} onClick={()=>revise.mutate()}>Schedule conversion revision</button>
 </section>;
}

/** Kits are approved master data. Assembly consumes all components atomically or none. */
export function ElectronicsBundleManager({workspaceId,branchId,product}:{workspaceId:string;branchId:string;product:Product}){
 const client=useQueryClient();const [mode,setMode]=useState<'sealed_kit'|'assembled_kit'>('assembled_kit');
 const [componentId,setComponentId]=useState('');const [componentVariantId,setComponentVariantId]=useState('');const [componentSearch,setComponentSearch]=useState('');const [quantity,setQuantity]=useState('1');const [components,setComponents]=useState<Array<{productId:string;variantId?:string;quantity:number}>>([]);
 const [warehouseId,setWarehouseId]=useState('');const [assemblyCount,setAssemblyCount]=useState('1');const [receiptKeyValue,setReceiptKeyValue]=useState(receiptKey);
 const bundle=useQuery({queryKey:['bundle',workspaceId,product.id],queryFn:()=>apiCatalogInventory.productBundle(workspaceId,product.id)});
 const componentVariants=useQuery({queryKey:['all-variants',workspaceId],queryFn:()=>apiCatalogInventory.allVariants(workspaceId),enabled:dataProviderMode==='api'});
 const componentOptions=(componentVariants.data??[]).filter(v=>v.productId===componentId);
 const candidates=useQuery({queryKey:['bundle-products',workspaceId,componentSearch],queryFn:()=>apiCatalogInventory.searchProductsByIdentity(workspaceId,componentSearch),enabled:componentSearch.trim().length>=2&&dataProviderMode==='api'});
 const warehouses=useQuery({queryKey:['warehouses',workspaceId,branchId],queryFn:()=>apiCatalogInventory.warehouses(workspaceId,branchId)});
 const save=useMutation({mutationFn:()=>apiCatalogInventory.createProductBundle(workspaceId,product.id,{mode,components}),onSuccess:async()=>{await client.invalidateQueries({queryKey:['bundle',workspaceId,product.id]});toast.success('Kit definition saved for approval');},onError:e=>toast.error('Kit rejected',{description:e instanceof Error?e.message:''})});
 const activate=useMutation({mutationFn:()=>apiCatalogInventory.activateProductBundle(workspaceId,product.id),onSuccess:async()=>{await client.invalidateQueries({queryKey:['bundle',workspaceId,product.id]});toast.success('Kit definition approved');},onError:e=>toast.error('Approval rejected',{description:e instanceof Error?e.message:''})});
 const assemble=useMutation({mutationFn:()=>apiCatalogInventory.assembleProductBundle(workspaceId,branchId,product.id,{warehouseId,quantity:Number(assemblyCount)},receiptKeyValue),onSuccess:async r=>{toast.success(`${r.quantity} kits ${r.alreadyPosted?'already assembled':'assembled atomically'}`);setReceiptKeyValue(receiptKey);await client.invalidateQueries({queryKey:['inventory-balances',workspaceId,branchId]});},onError:e=>toast.error('Kit assembly was not posted',{description:e instanceof Error?e.message:''})});
 return <section className="lexa-variant-manager" aria-label="Kit components and assembly">
  <h4>Sealed kits and assembled kits</h4>
  <p>Sealed kits are received and sold as purchased stock. Assembled kits consume component stock atomically, then receive the completed kit. Serialized and lot-tracked components require a separate verified handling workflow.</p>
  {bundle.data?<><p>Defined kit: <strong>{bundle.data.mode.replaceAll('_',' ')}</strong> · {bundle.data.status}</p>
    {bundle.data.status==='draft'&&<button type="button" className="button button-secondary button-small" disabled={activate.isPending} onClick={()=>activate.mutate()}>Approve kit definition</button>}
    {bundle.data.mode==='assembled_kit'&&bundle.data.status==='active'&&<><div className="form-two-col"><label className="field-label">Assembly warehouse<select value={warehouseId} onChange={e=>setWarehouseId(e.target.value)}><option value="">Choose warehouse</option>{(warehouses.data??[]).map(w=><option key={value(w.id)} value={value(w.id)}>{value(w.name)}</option>)}</select></label><label className="field-label">Number of kits<input type="number" min="1" max="100" step="1" value={assemblyCount} onChange={e=>setAssemblyCount(e.target.value)}/></label></div><button type="button" className="button button-primary button-small" disabled={!warehouseId||!Number.isInteger(Number(assemblyCount))||Number(assemblyCount)<1||assemble.isPending} onClick={()=>assemble.mutate()}>Assemble complete kit</button></>}
   </>:<>
   <label className="field-label">Kit type<select value={mode} onChange={e=>setMode(e.target.value as 'sealed_kit'|'assembled_kit')}><option value="assembled_kit">Assembled from stocked components</option><option value="sealed_kit">Sealed supplier kit</option></select></label>
   <label className="field-label">Find component product<input value={componentSearch} onChange={e=>setComponentSearch(e.target.value)} placeholder="Search by SKU, name, model or code" maxLength={100}/></label>
   <div className="form-two-col"><label className="field-label">Component product<select value={componentId} onChange={e=>{setComponentId(e.target.value);setComponentVariantId('');}}><option value="">Choose component</option>{(candidates.data??[]).filter(p=>p.id!==product.id&&p.trackStock&&!p.trackSerial&&!p.trackLot).map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></label><label className="field-label">Component SKU<select value={componentVariantId} onChange={e=>setComponentVariantId(e.target.value)} disabled={!componentOptions.length}><option value="">{componentOptions.length?'Choose exact SKU':'Base product'}</option>{componentOptions.map(v=><option key={v.id} value={v.id}>{v.sku}</option>)}</select></label><label className="field-label">Component units per kit<input type="number" min="0.001" step="0.001" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label></div>
   <button type="button" className="button button-secondary button-small" disabled={!componentId||(componentOptions.length>0&&!componentVariantId)||!Number(quantity)||Number(quantity)<=0||components.some(c=>c.productId===componentId&&(c.variantId??'')===componentVariantId)} onClick={()=>{setComponents(list=>[...list,{productId:componentId,...(componentVariantId?{variantId:componentVariantId}:{}),quantity:Number(quantity)}]);setComponentId('');setComponentVariantId('');}}>Add component</button>
   {components.map((c,i)=><div className="lexa-variant-row" key={`${c.productId}:${c.variantId??''}`}><span>{i+1}. {candidates.data?.find(p=>p.id===c.productId)?.name??'Stock item'}{c.variantId?` · ${(componentVariants.data??[]).find(v=>v.id===c.variantId)?.sku??'Selected SKU'}`:''} · {c.quantity} units</span><button type="button" className="button button-secondary button-small" onClick={()=>setComponents(list=>list.filter(x=>!(x.productId===c.productId&&(x.variantId??'')===(c.variantId??''))))}>Remove</button></div>)}
   <button type="button" className="button button-secondary button-small" disabled={!components.length||save.isPending} onClick={()=>save.mutate()}>Save draft kit</button>
  </>}
 </section>;
}
