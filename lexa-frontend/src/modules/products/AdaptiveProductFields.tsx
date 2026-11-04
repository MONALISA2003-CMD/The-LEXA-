import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { parseMajorAmount, formatMinorAmount } from '../../domain/money/money';
import { apiCatalogInventory } from '../../data/remote/apiWorkstream03';
import { PRODUCT_PRESETS, presetFor, suggestedPresets } from '../../domain/catalog/industryCatalog';
import type { Category, Product } from '../../domain/shared/types';
import './adaptive-products.css';

type FieldsProps = {
  industries: readonly string[];
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
export default function AdaptiveProductFields({industries,categories,productType,categoryId,categoryName,attributes,onChange}:FieldsProps){
 const preset=presetFor(productType);
 const relevant=suggestedPresets(industries);
 const byId=useMemo(()=>new Map(categories.map(c=>[c.id,c])),[categories]);
 const category=categories.find(c=>c.id===categoryId);
 const ancestorCategories:Category[]=[];const seen=new Set<string>();let current=category;
 while(current&&!seen.has(current.id)&&ancestorCategories.length<20){ancestorCategories.unshift(current);seen.add(current.id);current=current.parentId?byId.get(current.parentId):undefined;}
 const customFields=ancestorCategories.flatMap(c=>c.attributeSchema??[]);
 const fields=[...preset.fields,...customFields.filter(f=>!preset.fields.some(p=>p.key===f.key))];
 return <div className="lexa-adaptive-product-fields">
   <div className="lexa-product-field-heading"><strong>Product type & relevant details</strong><span>LEXA shows fields appropriate for this item—not every industry.</span></div>
   <div className="form-two-col">
     <label className="field-label">What are you adding?
       <select value={productType} onChange={e=>{const next=presetFor(e.target.value);onChange({productType:next.key,categoryId:'',categoryName:'',attributes:{},unit:next.unit,tracking:next.stock});}}>
         <optgroup label="Recommended for your business">{relevant.filter(p=>p.industries.some(x=>industries.includes(x))).map(p=><option key={p.key} value={p.key}>{p.label}</option>)}</optgroup>
         <optgroup label="All product types">{PRODUCT_PRESETS.filter(p=>!p.industries.some(x=>industries.includes(x))).map(p=><option key={p.key} value={p.key}>{p.label}</option>)}</optgroup>
       </select>
     </label>
     <label className="field-label">Existing category / subcategory
       <select value={categoryId} onChange={e=>{const selected=categories.find(c=>c.id===e.target.value);onChange({categoryId:e.target.value,categoryName:'',...(selected?.templateKey?{productType:selected.templateKey,attributes:{}}:{})});}}>
         <option value="">Use suggested or enter custom category</option>
         {categories.map(c=><option key={c.id} value={c.id}>{categoryPath(c,byId)}</option>)}
       </select>
     </label>
   </div>
   {!categoryId&&<label className="field-label">Category name (optional)
     <input value={categoryName} maxLength={100} onChange={e=>onChange({categoryName:e.target.value})} placeholder={preset.path.join(' › ')||'Enter a category name'}/>
     <small className="field-help">Existing categories are reused. Use Category manager to create or edit a nested hierarchy.</small>
   </label>}
   {fields.length>0&&<div className="lexa-product-attributes">
     <p><strong>{preset.label} details</strong> · Only relevant attributes are shown.</p>
     <div className="form-two-col">{fields.map(field=><label className="field-label" key={field.key}>{field.label}
       {field.kind==='select'?<select value={attributes[field.key]??''} onChange={e=>onChange({attributes:{...attributes,[field.key]:e.target.value}})}><option value="">Choose (optional)</option>{(field.options??[]).map(opt=><option value={opt} key={opt}>{opt}</option>)}</select>:
        <input type={field.kind==='number'?'number':'text'} min={field.kind==='number'?'0':undefined} step={field.kind==='number'?'any':undefined} maxLength={field.kind==='number'?undefined:250} value={attributes[field.key]??''} onChange={e=>onChange({attributes:{...attributes,[field.key]:e.target.value}})} placeholder={`Enter ${field.label.toLowerCase()}`}/>}
     </label>)}</div>
   </div>}
   {preset.variants.length>0&&<p className="lexa-product-hint">This type supports variants by {preset.variants.join(', ')}. Save the product, then add its sellable variants below. Each variant has its own SKU and stock.</p>}
   {preset.stock==='serial'&&<p className="lexa-product-hint">Each physical device must have its actual IMEI or serial recorded when stock is received. A batch number is optional.</p>}
   {preset.stock==='batch'&&<p className="lexa-product-hint">Use batches and expiry dates for products requiring expiry or lot tracking.</p>}
 </div>;
}

export function CategoryManager({workspaceId,categories}:{workspaceId:string;categories:readonly Category[]}){
 const queryClient=useQueryClient();const [open,setOpen]=useState(false);
 const [name,setName]=useState('');const [parentId,setParentId]=useState('');const [templateKey,setTemplateKey]=useState('');
 const [customKey,setCustomKey]=useState('');const [customLabel,setCustomLabel]=useState('');
 const byId=useMemo(()=>new Map(categories.map(c=>[c.id,c])),[categories]);
 const create=useMutation({mutationFn:()=>apiCatalogInventory.createCategory(workspaceId,{name,...(parentId?{parentId}:{}),...(templateKey?{templateKey}:{}),...(customKey&&customLabel?{attributeSchema:[{key:customKey,label:customLabel,kind:'text'}]}:{})}),onSuccess:async()=>{await queryClient.invalidateQueries({queryKey:['categories',workspaceId]});setName('');setParentId('');setCustomKey('');setCustomLabel('');toast.success('Category created');},onError:e=>toast.error('Category was not created',{description:e instanceof Error?e.message:'Check the category name.'})});
 return <div className="lexa-category-manager">
   <button type="button" className="button button-secondary button-small" aria-expanded={open} onClick={()=>setOpen(o=>!o)}>{open?'Hide category manager':'Manage categories and subcategories'}</button>
   {open&&<div className="lexa-category-editor">
     <strong>Create your own category</strong><p>Categories are private to this business. Existing product and sales records are never deleted when you add a category.</p>
     <div className="form-two-col"><label className="field-label">Category / subcategory name<input value={name} maxLength={100} onChange={e=>setName(e.target.value)} placeholder="e.g. Smartphones"/></label>
     <label className="field-label">Under category<select value={parentId} onChange={e=>setParentId(e.target.value)}><option value="">Top-level category</option>{categories.map(c=><option key={c.id} value={c.id}>{categoryPath(c,byId)}</option>)}</select></label></div>
     <label className="field-label">Product fields for this category (optional)<select value={templateKey} onChange={e=>setTemplateKey(e.target.value)}><option value="">Not linked to one product type</option>{PRODUCT_PRESETS.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
     <div className="form-two-col"><label className="field-label">Extra field key (optional)<input value={customKey} onChange={e=>setCustomKey(e.target.value)} placeholder="e.g. fabricCode"/></label><label className="field-label">Extra field label<input value={customLabel} onChange={e=>setCustomLabel(e.target.value)} placeholder="e.g. Fabric code"/></label></div>
     <button type="button" className="button button-primary button-small" disabled={!name.trim()||create.isPending} onClick={()=>create.mutate()}>{create.isPending?'Creating…':'Create category'}</button>
   </div>}
 </div>;
}

export function ProductVariantsManager({workspaceId,product,currency}:{workspaceId:string;product:Product;currency:string}){
 const queryClient=useQueryClient();const [sku,setSku]=useState('');const [barcode,setBarcode]=useState('');const [selected,setSelected]=useState<Record<string,string>>({});const [cost,setCost]=useState('');const [selling,setSelling]=useState('');
 const variantKeys=presetFor(product.productType??'general').variants;
 const result=useQuery({queryKey:['product-variants',workspaceId,product.id],queryFn:()=>apiCatalogInventory.variants(workspaceId,product.id)});
 const create=useMutation({mutationFn:()=>apiCatalogInventory.createVariant(workspaceId,product.id,{sku,barcode:barcode||undefined,attributes:selected,costPriceMinor:cost.trim()?parseMajorAmount(cost,currency):product.costPriceMinor,sellingPriceMinor:selling.trim()?parseMajorAmount(selling,currency):product.sellingPriceMinor}),onSuccess:async()=>{await queryClient.invalidateQueries({queryKey:['product-variants',workspaceId,product.id]});await queryClient.invalidateQueries({queryKey:['all-variants',workspaceId]});setSku('');setBarcode('');setCost('');setSelling('');setSelected({});toast.success('Sellable variant added');},onError:e=>toast.error('Variant was not saved',{description:e instanceof Error?e.message:'Check the SKU.'})});
 return <section className="lexa-variant-manager"><h4>Sellable variations</h4><p>Define distinct sizes, colours or capacities. Each variant keeps its own SKU, price and stock, without duplicating the parent product.</p>
   {(result.data??[]).map(v=><div className="lexa-variant-row" key={v.id}><strong>{v.sku}</strong><small>{Object.values(v.attributes??{}).join(' · ')} · {formatMinorAmount(v.sellingPriceMinor,currency)}</small></div>)}
   <div className="form-two-col"><label className="field-label">Variant SKU<input value={sku} onChange={e=>setSku(e.target.value)} placeholder="Unique size/colour SKU" maxLength={80}/></label><label className="field-label">Variant barcode<input value={barcode} onChange={e=>setBarcode(e.target.value)} maxLength={100}/></label></div>
   <div className="form-two-col"><label className="field-label">Variant cost price ({currency})<input type="number" min="0" step="0.01" value={cost} onChange={e=>setCost(e.target.value)} placeholder={formatMinorAmount(product.costPriceMinor,currency)}/></label><label className="field-label">Variant selling price ({currency})<input type="number" min="0" step="0.01" value={selling} onChange={e=>setSelling(e.target.value)} placeholder={formatMinorAmount(product.sellingPriceMinor,currency)}/></label></div><div className="form-two-col">{variantKeys.map(key=><label className="field-label" key={key}>{key.replace(/([A-Z])/g,' $1')}<input value={selected[key]??''} onChange={e=>setSelected(current=>({...current,[key]:e.target.value}))} maxLength={120}/></label>)}</div>
   <button type="button" className="button button-secondary button-small" disabled={!sku.trim()||create.isPending} onClick={()=>create.mutate()}>{create.isPending?'Saving…':'Add variant'}</button>
 </section>;
}

export function SerializedUnitManager({workspaceId,branchId,product}:{workspaceId:string;branchId:string;product:Product}){
 const [serial,setSerial]=useState('');const [imei2,setImei2]=useState('');const queryClient=useQueryClient();
 const [variantId,setVariantId]=useState('');
 const variants=useQuery({queryKey:['product-variants',workspaceId,product.id],queryFn:()=>apiCatalogInventory.variants(workspaceId,product.id)});
 const serials=useQuery({queryKey:['available-serials',workspaceId,branchId,product.id,variantId],queryFn:()=>apiCatalogInventory.availableSerials(workspaceId,branchId,product.id,variantId||undefined)});
 const create=useMutation({mutationFn:()=>apiCatalogInventory.createStandaloneSerial(workspaceId,branchId,{productId:product.id,...(variantId?{variantId}:{}),serialNumber:serial,...(imei2?{imei2}:{})}),onSuccess:async()=>{await queryClient.invalidateQueries({queryKey:['available-serials',workspaceId,branchId,product.id]});setSerial('');setImei2('');toast.success('Device identity registered');},onError:e=>toast.error('Device identifier was not recorded',{description:e instanceof Error?e.message:'Record stock before adding a serial.'})});
 return <section className="lexa-variant-manager"><h4>Received device identifiers</h4><p>First record stock in Inventory. Then register one real serial or IMEI per available device. Repeated identifiers are blocked.</p>
 {variants.data?.length?<label className="field-label">Device variant<select value={variantId} onChange={e=>setVariantId(e.target.value)}><option value="">Base product</option>{variants.data.map(v=><option value={v.id} key={v.id}>{v.sku}</option>)}</select></label>:null}
 <div className="form-two-col"><label className="field-label">IMEI / serial number<input value={serial} maxLength={120} onChange={e=>setSerial(e.target.value)}/></label><label className="field-label">Second IMEI (optional)<input value={imei2} maxLength={15} inputMode="numeric" onChange={e=>setImei2(e.target.value)}/></label></div>
 <button type="button" className="button button-secondary button-small" disabled={!serial.trim()||create.isPending} onClick={()=>create.mutate()}>{create.isPending?'Registering…':'Register device'}</button>
 <small>{serials.data?.length??0} currently available serialized units {serials.isLoading?'· loading':''}</small>
 </section>;
}
