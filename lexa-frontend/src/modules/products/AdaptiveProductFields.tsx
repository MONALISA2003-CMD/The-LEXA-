import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { parseMajorAmount, formatMinorAmount } from '../../domain/money/money';
import { apiCatalogInventory } from '../../data/remote/apiWorkstream03';
import { PRODUCT_PRESETS, presetFor, suggestedPresets, permittedPresets, suggestedCategoryPaths, type ProductField } from '../../domain/catalog/industryCatalog';
import type { Category, Product } from '../../domain/shared/types';
import {buildVariantMatrix} from '../../domain/catalog/variantMatrix';
import {BarcodeCapture} from '../../components/barcode/BarcodeCapture';
import {UnitConditionManager} from './DeviceCatalogExperiences';
import './adaptive-products.css';

type FieldsProps = {
  industries: readonly string[];
  workspaceId: string;
  categories: readonly Category[];
  productType: string;
  categoryId: string;
  categoryName: string;
  attributes: Record<string,string>;
  onChange: (next: { productType?:string;categoryId?:string;categoryName?:string;attributes?:Record<string,string>;unit?:string;tracking?:'none'|'serial'|'batch'|'quantity' })=>void;
};
function categoryPath(category:Category, byId:Map<string,Category>):string {
 const names=[category.name];const seen=new Set([category.id]);let parent=category.parentId;
 while(parent && !seen.has(parent) && names.length<12){seen.add(parent);const row=byId.get(parent);if(!row)break;names.unshift(row.name);parent=row.parentId;}
 return names.join(' › ');
}
export default function AdaptiveProductFields({industries,workspaceId,categories,productType,categoryId,categoryName,attributes,onChange}:FieldsProps){
 const queryClient=useQueryClient();
 const ensurePath=useMutation({mutationFn:(path:readonly string[])=>apiCatalogInventory.ensureCategoryPath(workspaceId,path),onSuccess:async record=>{onChange({categoryId:record.categoryId,categoryName:''});await queryClient.invalidateQueries({queryKey:['categories',workspaceId]});toast.success('Industry category hierarchy created');},onError:error=>toast.error('Could not create category hierarchy',{description:error instanceof Error?error.message:'Check your business industry selection.'})});
 const preset=presetFor(productType);
 const relevant=suggestedPresets(industries,productType);
 const [division,setDivision]=useState<'all'|'phones'|'accessories'|'electronics'|'appliances'>('all');
 const divisions:Record<Exclude<typeof division,'all'>,readonly string[]>={
  phones:['smartphone','feature_phone','cellular_tablet','mifi_router'],
  accessories:['phone_accessory','phone_case','screen_protector','charger','usb_cable','power_bank','earphones'],
  electronics:['tv','audio','laptop','network_router','printer','cctv_camera','gaming_console'],
  appliances:['appliance','refrigerator','washing_machine','cooker','air_conditioner','small_appliance'],
 };
 const specialized=industries.some(x=>['mobile_phones','electronics','household_goods'].includes(x))||[...Object.values(divisions).flat()].includes(productType);
 const visiblePresets=division==='all'?relevant:relevant.filter(p=>divisions[division].includes(p.key)||p.key===productType);

 const paths=suggestedCategoryPaths(industries);
 const byId=useMemo(()=>new Map(categories.map(c=>[c.id,c])),[categories]);
 const category=categories.find(c=>c.id===categoryId);
 const ancestorCategories:Category[]=[];const seen=new Set<string>();let current=category;
 while(current&&!seen.has(current.id)&&ancestorCategories.length<20){ancestorCategories.unshift(current);seen.add(current.id);current=current.parentId?byId.get(current.parentId):undefined;}
 // Category-defined fields are optional today. Normalize them to ProductField
 // before merging so strict TS never assumes their persisted schema has `required`.
 const customFields:ProductField[]=[...new Map(ancestorCategories.flatMap(c=>c.attributeSchema??[]).map(f=>[f.key,{...f,required:f.required===true}] as const)).values()];
 const fields:ProductField[]=[...preset.fields,...customFields.filter(f=>!preset.fields.some(p=>p.key===f.key))];
 return <div className="lexa-adaptive-product-fields">
   <div className="lexa-product-field-heading"><strong>Product type & relevant details</strong><span>LEXA shows fields appropriate for this item—not every industry.</span></div>
   {specialized&&<div className="lexa-product-hint"><strong>Choose the correct retail product family:</strong><div className="lexa-division-filters">{(['all','phones','accessories','electronics','appliances'] as const).map(key=><button type="button" key={key} aria-pressed={division===key} className={`button button-small ${division===key?'button-primary':'button-secondary'}`} onClick={()=>setDivision(key)}>{key==='all'?'All business types':key[0]!.toUpperCase()+key.slice(1)}</button>)}</div><small>Phones are identified by actual device IMEIs. Accessories use fitment and quantity; electronics and appliances use their own specifications and serial rules.</small></div>}
   <div className="form-two-col">
     <label className="field-label">What are you adding?
       <select value={productType} onChange={e=>{const next=presetFor(e.target.value);onChange({productType:next.key,categoryId:'',categoryName:'',attributes:{},unit:next.unit,tracking:next.stock});}}>
         {productType&&!PRODUCT_PRESETS.some(p=>p.key===productType)&&<option value={productType}>Historical product type — edit existing details only</option>}
         <optgroup label="For your business">{visiblePresets.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}</optgroup>
       </select>
     </label>
     <label className="field-label">Existing category / subcategory
       <select value={categoryId} onChange={e=>{const selected=categories.find(c=>c.id===e.target.value);onChange({categoryId:e.target.value,categoryName:'',...(selected?.templateKey?{productType:selected.templateKey,attributes:{}}:{})});}}>
         <option value="">Use suggested or enter custom category</option>
         {categories.map(c=><option key={c.id} value={c.id}>{categoryPath(c,byId)}</option>)}
       </select>
     </label>
   </div>
   {!categoryId&&<div className="lexa-custom-category-entry"><label className="field-label">Category name (optional)
     <input value={categoryName} maxLength={100} onChange={e=>onChange({categoryName:e.target.value})} placeholder={preset.path.join(' › ')||'Enter a category name'}/></label>
     <small className="field-help">Choose a suggested category path below or create a nested category with the category manager. Existing categories remain unchanged.</small>
     {paths.length>0&&<div className="lexa-catalogue-path-suggestions"><label className="field-label">Suggested industry hierarchy<select value="" onChange={e=>{const path=paths.find(p=>p.join(' › ')===e.target.value);if(path){const full=path.join(' › ');const matched=categories.find(c=>categoryPath(c,byId)===full);if(matched){onChange({categoryId:matched.id,categoryName:'',attributes:{}});}else ensurePath.mutate([...path]);}}}><option value="">Choose a category path</option>{paths.map(path=><option key={path.join('/')} value={path.join(' › ')}>{path.join(' › ')}</option>)}</select></label><small className="field-help">LEXA will create a missing approved path in your workspace, without inventing products or stock.</small></div>}
   </div>}
   {fields.length>0&&<div className="lexa-product-attributes">
     <p><strong>{preset.label} details</strong> · Only relevant attributes are shown.</p>
     <div className="form-two-col">{fields.map(field=><label className="field-label" key={field.key}>{field.label}{field.required?' *':''}
       {field.kind==='select'?<select required={field.required===true} value={attributes[field.key]??''} onChange={e=>onChange({attributes:{...attributes,[field.key]:e.target.value}})}><option value="">{field.required?'Choose (required)':'Choose (optional)'}</option>{(field.options??[]).map(opt=><option value={opt} key={opt}>{opt}</option>)}</select>:
        <input required={field.required===true} type={field.kind==='number'?'number':'text'} min={field.kind==='number'?'0':undefined} step={field.kind==='number'?'any':undefined} maxLength={field.kind==='number'?undefined:250} value={attributes[field.key]??''} onChange={e=>onChange({attributes:{...attributes,[field.key]:e.target.value}})} placeholder={`Enter ${field.label.toLowerCase()}`}/>}
     </label>)}</div>
   </div>}
   {preset.variants.length>0&&<p className="lexa-product-hint">This type supports variants by {preset.variants.join(', ')}. Save the product, then add its sellable variants below. Each variant has its own SKU and stock.</p>}
   {preset.stock!=='none'&&<p className="lexa-product-hint"><strong>Inventory rule:</strong> {preset.stock==='serial'?'Track each physical unit with an IMEI or serial number.':preset.stock==='batch'?'Track lots or production batches.':'Track quantity per product variant.'} This policy is enforced by the server for every client.</p>}
   {preset.stock==='serial'&&<p className="lexa-product-hint">Each physical device must have its actual IMEI or serial recorded when stock is received. A batch number is optional.</p>}
   {preset.stock==='batch'&&<p className="lexa-product-hint">Use batches and expiry dates for products requiring expiry or lot tracking.</p>}
 </div>;
}

export function CategoryManager({workspaceId,categories,industries=[]}:{workspaceId:string;categories:readonly Category[];industries?:readonly string[]}){
 const queryClient=useQueryClient();const [open,setOpen]=useState(false);
 const [name,setName]=useState('');const [parentId,setParentId]=useState('');const [templateKey,setTemplateKey]=useState('');
 const [customKey,setCustomKey]=useState('');const [customLabel,setCustomLabel]=useState('');
 const [customKind,setCustomKind]=useState<'text'|'number'|'select'>('text');const [customRequired,setCustomRequired]=useState(false);
 const [customOptions,setCustomOptions]=useState('');const [fields,setFields]=useState<Array<{key:string;label:string;kind:'text'|'number'|'select';required?:boolean;options?:string[]}>>([]);
 const byId=useMemo(()=>new Map(categories.map(c=>[c.id,c])),[categories]);
 function addField(){
  const key=customKey.trim(),label=customLabel.trim();
  if(!/^[A-Za-z][A-Za-z0-9_]{0,49}$/.test(key)||!label){toast.error('Enter a valid field key and label.');return;}
  if(fields.some(f=>f.key.toLowerCase()===key.toLowerCase())){toast.error('That field key was already added.');return;}
  const options=customOptions.split(',').map(v=>v.trim()).filter(Boolean);
  if(customKind==='select'&&!options.length){toast.error('Enter comma-separated dropdown choices.');return;}
  if(fields.length>=25){toast.error('A category supports up to 25 custom fields.');return;}
  setFields(list=>[...list,{key,label,kind:customKind,...(customRequired?{required:true}:{}),...(customKind==='select'?{options:[...new Set(options)]}:{})}]);
  setCustomKey('');setCustomLabel('');setCustomOptions('');setCustomRequired(false);
 }
 const create=useMutation({mutationFn:()=>apiCatalogInventory.createCategory(workspaceId,{name,...(parentId?{parentId}:{}),...(templateKey?{templateKey}:{}),...(fields.length?{attributeSchema:fields}:{})}),onSuccess:async()=>{await queryClient.invalidateQueries({queryKey:['categories',workspaceId]});setName('');setParentId('');setFields([]);setOpen(false);toast.success('Category and fields created');},onError:e=>toast.error('Category was not created',{description:e instanceof Error?e.message:'Check the category name.'})});
 return <div className="lexa-category-manager">
   <button type="button" className="button button-secondary button-small" aria-expanded={open} onClick={()=>setOpen(o=>!o)}>{open?'Hide category builder':'Manage categories and subcategories'}</button>
   {open&&<div className="lexa-category-editor">
     <strong>Build a category for your business</strong><p>Define its place in the hierarchy, which product template it uses, and the custom fields staff must enter. Parent fields are inherited by subcategories.</p>
     <div className="form-two-col"><label className="field-label">Category / subcategory name<input value={name} maxLength={100} onChange={e=>setName(e.target.value)} placeholder="e.g. Smartphones"/></label>
     <label className="field-label">Under category<select value={parentId} onChange={e=>setParentId(e.target.value)}><option value="">Top-level category</option>{categories.map(c=><option key={c.id} value={c.id}>{categoryPath(c,byId)}</option>)}</select></label></div>
     <label className="field-label">Product template<select value={templateKey} onChange={e=>setTemplateKey(e.target.value)}><option value="">Flexible category</option>{permittedPresets(industries).map(p=><option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
     <div className="lexa-product-hint">Custom fields: {fields.length} / 25. The server validates required values, numeric data and dropdown choices for new products across all API clients.</div>
     {fields.map((f,index)=><div className="lexa-variant-row" key={f.key}><strong>{f.label} ({f.key})</strong><span>{f.kind}{f.required?' · Required':''}{f.options?.length?' · '+f.options.join(', '):''} <button type="button" className="button button-secondary button-small" onClick={()=>setFields(list=>list.filter((_,i)=>i!==index))} aria-label={`Remove ${f.label} field`}>Remove</button></span></div>)}
     <div className="form-two-col"><label className="field-label">Field key<input value={customKey} maxLength={50} onChange={e=>setCustomKey(e.target.value)} placeholder="e.g. fabricCode"/></label><label className="field-label">Display label<input value={customLabel} maxLength={100} onChange={e=>setCustomLabel(e.target.value)} placeholder="e.g. Fabric code"/></label></div>
     <div className="form-two-col"><label className="field-label">Field type<select value={customKind} onChange={e=>setCustomKind(e.target.value as 'text'|'number'|'select')}><option value="text">Text</option><option value="number">Number</option><option value="select">Dropdown</option></select></label><label className="checkbox-field"><input type="checkbox" checked={customRequired} onChange={e=>setCustomRequired(e.target.checked)}/><span>Required when adding a product</span></label></div>
     {customKind==='select'&&<label className="field-label">Dropdown choices (comma-separated)<input value={customOptions} onChange={e=>setCustomOptions(e.target.value)} placeholder="e.g. Cotton, Linen, Polyester"/></label>}
     <button type="button" className="button button-secondary button-small" onClick={addField} disabled={!customKey.trim()||!customLabel.trim()}>Add this field</button>
     <button type="button" className="button button-primary button-small" disabled={!name.trim()||create.isPending} onClick={()=>create.mutate()}>{create.isPending?'Creating…':'Create category and its fields'}</button>
   </div>}
 </div>;
}

export function ProductVariantsManager({workspaceId,product,currency}:{workspaceId:string;product:Product;currency:string}){
 const queryClient=useQueryClient();const [sku,setSku]=useState('');const [barcode,setBarcode]=useState('');const [selected,setSelected]=useState<Record<string,string>>({});const [cost,setCost]=useState('');const [selling,setSelling]=useState('');
 const variantKeys=presetFor(product.productType??'general').variants;
 const [matrix,setMatrix]=useState<Record<string,string>>({});const [matrixPrefix,setMatrixPrefix]=useState(product.sku);
 const [matrixError,setMatrixError]=useState('');const [matrixOverrides,setMatrixOverrides]=useState<Record<string,{sku?:string;cost?:string;selling?:string}>>({});
 const matrixRows=useMemo(()=>{try{return buildVariantMatrix(matrixPrefix,variantKeys,matrix);}catch{return [];}},[matrixPrefix,variantKeys.join('|'),matrix]);
 const result=useQuery({queryKey:['product-variants',workspaceId,product.id],queryFn:()=>apiCatalogInventory.variants(workspaceId,product.id)});
 const create=useMutation({mutationFn:()=>apiCatalogInventory.createVariant(workspaceId,product.id,{sku,barcode:barcode||undefined,attributes:selected,costPriceMinor:cost.trim()?parseMajorAmount(cost,currency):product.costPriceMinor,sellingPriceMinor:selling.trim()?parseMajorAmount(selling,currency):product.sellingPriceMinor}),onSuccess:async()=>{await queryClient.invalidateQueries({queryKey:['product-variants',workspaceId,product.id]});await queryClient.invalidateQueries({queryKey:['all-variants',workspaceId]});setSku('');setBarcode('');setCost('');setSelling('');setSelected({});toast.success('Sellable variant added');},onError:e=>toast.error('Variant was not saved',{description:e instanceof Error?e.message:'Check the SKU.'})});
 const batch=useMutation({mutationFn:async()=>{const rows=buildVariantMatrix(matrixPrefix,variantKeys,matrix);if(!rows.length)throw new Error('Enter one or more variation values.');const existing=new Set((result.data??[]).map(v=>v.sku.toLowerCase()));if(rows.some(r=>existing.has(r.sku.toLowerCase())))throw new Error('A generated SKU already exists. Edit the prefix or values.');return apiCatalogInventory.createVariantBatch(workspaceId,product.id,rows.map(r=>{const override=matrixOverrides[r.sku];return {sku:override?.sku?.trim()||r.sku,attributes:r.attributes,costPriceMinor:override?.cost?.trim()?parseMajorAmount(override.cost,currency):product.costPriceMinor,sellingPriceMinor:override?.selling?.trim()?parseMajorAmount(override.selling,currency):product.sellingPriceMinor};}));},onSuccess:async data=>{await queryClient.invalidateQueries({queryKey:['product-variants',workspaceId,product.id]});await queryClient.invalidateQueries({queryKey:['all-variants',workspaceId]});setMatrix({});setMatrixOverrides({});setMatrixError('');toast.success(`${data.created} variants created atomically`);},onError:e=>setMatrixError(e instanceof Error?e.message:'Could not create variants.')});
 return <section className="lexa-variant-manager"><h4>Sellable variations</h4><p>Define distinct sizes, colours or capacities. Each variant keeps its own SKU, price and stock, without duplicating the parent product.</p>
   {(result.data??[]).map(v=><div className="lexa-variant-row" key={v.id}><strong>{v.sku}</strong><small>{Object.values(v.attributes??{}).join(' · ')} · {formatMinorAmount(v.sellingPriceMinor,currency)}</small></div>)}
   <div className="form-two-col"><label className="field-label">Variant SKU<input value={sku} onChange={e=>setSku(e.target.value)} placeholder="Unique size/colour SKU" maxLength={80}/></label><label className="field-label">Variant barcode<input value={barcode} onChange={e=>setBarcode(e.target.value)} maxLength={100}/></label></div>
   <div className="form-two-col"><label className="field-label">Variant cost price ({currency})<input type="number" min="0" step="0.01" value={cost} onChange={e=>setCost(e.target.value)} placeholder={formatMinorAmount(product.costPriceMinor,currency)}/></label><label className="field-label">Variant selling price ({currency})<input type="number" min="0" step="0.01" value={selling} onChange={e=>setSelling(e.target.value)} placeholder={formatMinorAmount(product.sellingPriceMinor,currency)}/></label></div><div className="form-two-col">{variantKeys.map(key=><label className="field-label" key={key}>{key.replace(/([A-Z])/g,' $1')}<input value={selected[key]??''} onChange={e=>setSelected(current=>({...current,[key]:e.target.value}))} maxLength={120}/></label>)}</div>
   <button type="button" className="button button-secondary button-small" disabled={!sku.trim()||create.isPending} onClick={()=>create.mutate()}>{create.isPending?'Saving…':'Add variant'}</button>
   {variantKeys.length>0&&<div className="lexa-matrix-builder">
     <h4>Generate several variants at once</h4><p>Enter comma-separated values. For a boutique: sizes S, M, L and colours Black, Blue creates six separate SKUs. Preview before saving; all rows are created together or none are saved.</p>
     <label className="field-label">SKU prefix<input value={matrixPrefix} maxLength={55} onChange={e=>setMatrixPrefix(e.target.value)} placeholder={product.sku}/></label>
     <div className="form-two-col">{variantKeys.map(key=><label className="field-label" key={key}>{key.replace(/([A-Z])/g,' $1')} values<input value={matrix[key]??''} onChange={e=>setMatrix(prev=>({...prev,[key]:e.target.value}))} placeholder={`e.g. ${key==='size'?'S, M, L':'Black, Blue'}`}/></label>)}</div>
     {matrixError&&<p role="alert" className="inline-error">{matrixError}</p>}
     {matrixRows.length>0&&<div className="lexa-matrix-preview"><strong>Preview and edit: {matrixRows.length} variants</strong><p>Change a generated SKU or enter a different cost or selling price for any combination. Blank prices use the product's defaults.</p>{matrixRows.map(r=><div className="lexa-matrix-row" key={r.sku}><span>{Object.values(r.attributes).join(' · ')}</span><label>SKU<input aria-label={`SKU for ${Object.values(r.attributes).join(' ')}`} maxLength={80} value={matrixOverrides[r.sku]?.sku??r.sku} onChange={e=>setMatrixOverrides(old=>({...old,[r.sku]:{...old[r.sku],sku:e.target.value}}))}/></label><label>Cost ({currency})<input aria-label={`Cost for ${r.sku}`} type="number" min="0" step="0.01" placeholder={formatMinorAmount(product.costPriceMinor,currency)} value={matrixOverrides[r.sku]?.cost??''} onChange={e=>setMatrixOverrides(old=>({...old,[r.sku]:{...old[r.sku],cost:e.target.value}}))}/></label><label>Sell ({currency})<input aria-label={`Selling price for ${r.sku}`} type="number" min="0" step="0.01" placeholder={formatMinorAmount(product.sellingPriceMinor,currency)} value={matrixOverrides[r.sku]?.selling??''} onChange={e=>setMatrixOverrides(old=>({...old,[r.sku]:{...old[r.sku],selling:e.target.value}}))}/></label></div>)}</div>}
     <button type="button" className="button button-primary button-small" disabled={!matrixRows.length||batch.isPending} onClick={()=>batch.mutate()}>{batch.isPending?'Creating…':`Create ${matrixRows.length} variants`}</button>
   </div>}

 </section>;
}

export function SerializedUnitManager({workspaceId,branchId,product}:{workspaceId:string;branchId:string;product:Product}){
 const [serial,setSerial]=useState('');const [imei2,setImei2]=useState('');const queryClient=useQueryClient();
 const [variantId,setVariantId]=useState('');
 const requiresImei=presetFor(product.productType??'general').identifiers.includes('imei');
 const variants=useQuery({queryKey:['product-variants',workspaceId,product.id],queryFn:()=>apiCatalogInventory.variants(workspaceId,product.id)});
 const serials=useQuery({queryKey:['available-serials',workspaceId,branchId,product.id,variantId],queryFn:()=>apiCatalogInventory.availableSerials(workspaceId,branchId,product.id,variantId||undefined)});
 const create=useMutation({mutationFn:()=>apiCatalogInventory.createStandaloneSerial(workspaceId,branchId,{productId:product.id,...(variantId?{variantId}:{}),serialNumber:serial,...(requiresImei&&imei2?{imei2}:{})}),onSuccess:async()=>{await queryClient.invalidateQueries({queryKey:['available-serials',workspaceId,branchId,product.id]});setSerial('');setImei2('');toast.success('Device identity registered');},onError:e=>toast.error('Device identifier was not recorded',{description:e instanceof Error?e.message:'Record stock before adding a serial.'})});
 return <section className="lexa-variant-manager"><h4>Received device identifiers</h4><p>First record stock in Inventory. Then register one real serial or IMEI per available device. Repeated identifiers are blocked.</p>
 {variants.data?.length?<label className="field-label">Device variant<select value={variantId} onChange={e=>setVariantId(e.target.value)}><option value="">Base product</option>{variants.data.map(v=><option value={v.id} key={v.id}>{v.sku}</option>)}</select></label>:null}
 <BarcodeCapture compact label={requiresImei?'Scan device IMEI 1':'Scan manufacturer serial'} onCode={code=>setSerial(code.trim())}/>
 {requiresImei&&<BarcodeCapture compact label="Scan second device IMEI (optional)" onCode={code=>setImei2(code.trim())}/>}
 <div className="form-two-col"><label className="field-label">{requiresImei?'Primary IMEI (15 digits)':'Unique serial number'}<input value={serial} maxLength={requiresImei?15:120} inputMode={requiresImei?'numeric':'text'} onChange={e=>setSerial(e.target.value)}/></label>{requiresImei&&<label className="field-label">Second IMEI (if dual SIM)<input value={imei2} maxLength={15} inputMode="numeric" onChange={e=>setImei2(e.target.value)}/></label>}</div><small className="field-help">{requiresImei?'Scan the genuine device IMEI(s). The server verifies the check digits and rejects duplicate identifiers across all branches.':'Use the real manufacturer serial; LEXA checks uniqueness across the business.'}</small>
 <button type="button" className="button button-secondary button-small" disabled={!serial.trim()||create.isPending} onClick={()=>create.mutate()}>{create.isPending?'Registering…':'Register device'}</button>
 <small>{serials.data?.length??0} currently available serialized units {serials.isLoading?'· loading':''}</small>
 <UnitConditionManager workspaceId={workspaceId} branchId={branchId} productId={product.id} variantId={variantId}/>
 </section>;
}


/** Package conversion is master data: purchasing and receiving use its stable id. */
export function ProductPackagingManager({workspaceId,product}:{workspaceId:string;product:Product}){
 const queryClient=useQueryClient();
 const [code,setCode]=useState('');const [name,setName]=useState('');const [size,setSize]=useState('');const [variantId,setVariantId]=useState('');
 const packages=useQuery({queryKey:['product-packages',workspaceId,product.id],queryFn:()=>apiCatalogInventory.productPackages(workspaceId,product.id)});
 const variants=useQuery({queryKey:['product-variants',workspaceId,product.id],queryFn:()=>apiCatalogInventory.variants(workspaceId,product.id)});
 const create=useMutation({mutationFn:()=>apiCatalogInventory.createProductPackage(workspaceId,product.id,{code,name,unitsPerPackage:Number(size),...(variantId?{variantId}:{})}),onSuccess:async()=>{await queryClient.invalidateQueries({queryKey:['product-packages',workspaceId,product.id]});await queryClient.invalidateQueries({queryKey:['all-product-packages',workspaceId]});setCode('');setName('');setSize('');toast.success('Purchasing package saved');},onError:e=>toast.error('Package was not saved',{description:e instanceof Error?e.message:'Check the conversion factor.'})});
 return <section className="lexa-variant-manager"><h4>Purchasing and stock packages</h4><p>Define cartons, packs or rolls in real base units. LEXA will receive stock in {product.unitOfMeasure??'Each'} and keep this conversion auditable.</p>
 {(packages.data??[]).map(p=><div className="lexa-variant-row" key={p.id}><strong>{p.code} · {p.name}</strong><small>1 package = {p.unitsPerPackage} {p.baseUnit}{p.variantId?' · Specific variant':''}</small></div>)}
 <div className="form-two-col"><label className="field-label">Package code<input maxLength={40} value={code} onChange={e=>setCode(e.target.value)} placeholder="e.g. CTN24"/></label><label className="field-label">Name<input maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Carton of 24"/></label></div>
 <div className="form-two-col"><label className="field-label">Base units in one package<input type="number" min="0.001" step="0.001" value={size} onChange={e=>setSize(e.target.value)} placeholder="e.g. 24"/></label><label className="field-label">Applicable variant<select value={variantId} onChange={e=>setVariantId(e.target.value)}><option value="">Base product</option>{(variants.data??[]).map(v=><option key={v.id} value={v.id}>{v.sku}</option>)}</select></label></div>
 <button type="button" className="button button-secondary button-small" disabled={!code.trim()||!name.trim()||!size.trim()||create.isPending} onClick={()=>create.mutate()}>{create.isPending?'Saving…':'Add package conversion'}</button>
 </section>;
}
