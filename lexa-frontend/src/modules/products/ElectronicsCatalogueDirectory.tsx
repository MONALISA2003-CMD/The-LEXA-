import {useMemo,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {apiElectronicsCatalogue,type V2Family,type V2Model} from '../../data/remote/apiElectronicsCatalogue';
import {describeElectronicsStockPolicy} from '../../domain/catalog/electronicsFamilyTracking';
import {dataProviderMode} from '../../data/remote/runtimeConfig';
import './electronics-catalogue-directory.css';

/** Read-safe browsing + explicitly approved taxonomy/model-directory writes.
 * Does not create products, quantities, serials or financial transactions.
 */
export default function ElectronicsCatalogueDirectory({workspaceId,industries,onCategoryChosen}:{workspaceId:string;industries:readonly string[];onCategoryChosen?:(categoryId:string,legacyType?:string)=>void}){
 const [open,setOpen]=useState(false);const [search,setSearch]=useState('');const [code,setCode]=useState('');const [brandQuery,setBrandQuery]=useState('');
 const [activeBrandId,setActiveBrandId]=useState('');const [alias,setAlias]=useState('');const [targetBrandId,setTargetBrandId]=useState('');
 const [familyCode,setFamilyCode]=useState('');const [modelName,setModelName]=useState('');const [manufacturerCode,setManufacturerCode]=useState('');
 const [specs,setSpecs]=useState<Record<string,string|boolean>>({});const [sourceName,setSourceName]=useState('');
 const [selectedModelId,setSelectedModelId]=useState('');const [revisionOpen,setRevisionOpen]=useState(false);
 const [revisionSpecs,setRevisionSpecs]=useState<Record<string,string|boolean>>({});const [revisionEvidence,setRevisionEvidence]=useState('');
 const cache=useQueryClient();
 const relevant=dataProviderMode==='api'&&industries.some(k=>['mobile_phones','electronics','household_goods','repair_services','construction'].includes(k));
 const summary=useQuery({queryKey:['electronics-v2-summary',workspaceId],queryFn:()=>apiElectronicsCatalogue.summary(workspaceId),enabled:relevant&&open,retry:1,staleTime:60000});
 const taxonomy=useQuery({queryKey:['electronics-v2-taxonomy',workspaceId,search],queryFn:()=>apiElectronicsCatalogue.taxonomy(workspaceId,search),enabled:relevant&&open,retry:1});
 const customCategories=useQuery({queryKey:['electronics-custom-categories',workspaceId,search],queryFn:()=>apiElectronicsCatalogue.customCategories(workspaceId,search),enabled:relevant&&open,retry:1});
 const families=useQuery({queryKey:['electronics-v2-families',workspaceId],queryFn:()=>apiElectronicsCatalogue.families(workspaceId),enabled:relevant&&open,retry:1,staleTime:60000});
 const preview=useQuery({queryKey:['electronics-v2-category-preview',workspaceId,code],queryFn:()=>apiElectronicsCatalogue.preview(workspaceId,code),enabled:relevant&&open&&Boolean(code),retry:0});
 const brands=useQuery({queryKey:['electronics-v2-brands',workspaceId,brandQuery],queryFn:()=>apiElectronicsCatalogue.brandSearch(workspaceId,brandQuery),enabled:relevant&&open,retry:1});
 const models=useQuery({queryKey:['electronics-v2-models',workspaceId],queryFn:()=>apiElectronicsCatalogue.models(workspaceId),enabled:relevant&&open,retry:1});
 const chosenNode=(taxonomy.data?.nodes??[]).find(n=>n.code===code);
 const chosenFamily=(families.data?.families??[]).find(f=>f.code===chosenNode?.familyCode);
 const modelFamily=(families.data?.families??[]).find(f=>f.code===familyCode);
 const selectedModel=(models.data??[]).find(m=>m.id===selectedModelId);
 const selectedModelPolicy=(families.data?.families??[]).find(f=>f.code===selectedModel?.familyCode);
 const enabledFamilies=(families.data?.families??[]).filter(f=>f.enabled);
 const visibleNodes=useMemo(()=>(taxonomy.data?.nodes??[]).filter(n=>n.selectable).slice(0,250),[taxonomy.data]);
 const refreshCategories=async()=>{await cache.invalidateQueries({queryKey:['electronics-custom-categories',workspaceId]});await cache.invalidateQueries({queryKey:['categories',workspaceId]});await cache.invalidateQueries({queryKey:['electronics-v2-category-preview',workspaceId,code]});};
 const adopted=useMutation({mutationFn:async()=>{if(!code)throw new Error('Select a category.');return apiElectronicsCatalogue.adopt(workspaceId,code);},onSuccess:async r=>{await refreshCategories();toast.success('Category added without changing existing products');if(chosenFamily&&onCategoryChosen)onCategoryChosen(r.categoryId,chosenFamily.legacyProductType);},onError:e=>toast.error('Category not adopted',{description:e instanceof Error?e.message:'Owner or manager approval is required.'})});
 const linked=useMutation({mutationFn:async(categoryId:string)=>apiElectronicsCatalogue.linkExisting(workspaceId,categoryId,code),onSuccess:async r=>{await refreshCategories();toast.success('Existing category ID linked safely');if(chosenFamily&&onCategoryChosen)onCategoryChosen(r.categoryId,chosenFamily.legacyProductType);},onError:e=>toast.error('Existing category could not be linked',{description:e instanceof Error?e.message:'Check its original breadcrumb.'})});
 const saveAlias=useMutation({mutationFn:()=>apiElectronicsCatalogue.addBrandAlias(workspaceId,activeBrandId,alias),onSuccess:async()=>{await cache.invalidateQueries({queryKey:['electronics-v2-brands',workspaceId,brandQuery]});setAlias('');toast.success('Brand search alias registered');},onError:e=>toast.error('Alias unavailable',{description:e instanceof Error?e.message:'Alias already belongs to another brand.'})});
 const proposeMerge=useMutation({mutationFn:()=>apiElectronicsCatalogue.proposeMerge(workspaceId,{sourceBrandId:activeBrandId,targetBrandId,rationale:'Suggested duplicate for manual review; existing brands and products must remain unchanged.'}),onSuccess:()=>{setTargetBrandId('');toast.success('Non-destructive duplicate review proposed');},onError:e=>toast.error('Duplicate review not submitted',{description:e instanceof Error?e.message:''})});
 function collectedSpecifications(policy:V2Family, values:Record<string,string|boolean>=specs):Record<string,string|number|boolean>{
  const result:Record<string,string|number|boolean>={};
  for(const f of policy.fields){if(f.key==='model')continue;const raw=values[f.key];if(raw===undefined||raw==='')continue;
   if(f.type==='number'){
    const n=Number(raw);if(!Number.isFinite(n)||n<0)throw new Error(`Enter a valid ${f.key} measurement${f.unit?' in '+f.unit:''}.`);result[f.key]=n;
   }else if(f.type==='boolean')result[f.key]=raw===true;
   else result[f.key]=String(raw);
  }
  return result;
 }
 const createModel=useMutation({mutationFn:async()=>{const policy=modelFamily;if(!policy)throw new Error('Choose a published family.');return apiElectronicsCatalogue.createModel(workspaceId,{brandId:activeBrandId,name:modelName,familyCode:policy.code,productType:policy.legacyProductType,...(manufacturerCode.trim()?{manufacturerCode:manufacturerCode.trim()}:{}),referenceSpecs:collectedSpecifications(policy),...(sourceName.trim()?{provenance:{sourceName:sourceName.trim()}}:{})});},onSuccess:async record=>{await cache.invalidateQueries({queryKey:['electronics-v2-models',workspaceId]});setSelectedModelId(record.id);setModelName('');setManufacturerCode('');setSpecs({});toast.success('Manufacturer reference draft created');},onError:e=>toast.error('Model reference not saved',{description:e instanceof Error?e.message:'Check the family and manufacturer.'})});
 const reviewModel=useMutation({mutationFn:({model,outcome}:{model:V2Model;outcome:'reviewed'|'rejected'})=>apiElectronicsCatalogue.reviewModel(workspaceId,model.id,outcome),onSuccess:async record=>{await cache.invalidateQueries({queryKey:['electronics-v2-models',workspaceId]});toast.success(record.reviewStatus==='rejected'?'Reference rejected for review':'Manufacturer reference approved');},onError:e=>toast.error('Model review blocked',{description:e instanceof Error?e.message:'Required specifications, source evidence or manager permission missing.'})});
 function beginRevision(model:V2Model){
  setSelectedModelId(model.id);
  setRevisionSpecs(Object.fromEntries(Object.entries(model.referenceSpecs).map(([key,val])=>[key,typeof val==='number'?String(val):val])));
  setRevisionEvidence(model.provenance?.sourceName??'');
  setRevisionOpen(true);
 }
 const reviseModel=useMutation({mutationFn:async()=>{
  if(!selectedModel||!selectedModelPolicy)throw new Error('Choose a registered model with a published family.');
  return apiElectronicsCatalogue.reviseModel(workspaceId,selectedModel.id,{referenceSpecs:collectedSpecifications(selectedModelPolicy,revisionSpecs),
    ...(revisionEvidence.trim()?{provenance:{sourceName:revisionEvidence.trim()}}:{})});
 },onSuccess:async()=>{await cache.invalidateQueries({queryKey:['electronics-v2-models',workspaceId]});setRevisionOpen(false);toast.success('New reference specification version saved as a draft');},onError:e=>toast.error('Model revision blocked',{description:e instanceof Error?e.message:'Check the values and review permissions.'})});
 if(!relevant)return null;
 return <section className="lexa-v2-panel" aria-label="LEXA Electronics Catalogue V2">
  <button type="button" className="button button-secondary button-small" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>{open?'Hide Electronics V2 directory':'Explore Electronics V2: 221 categories and specifications'}</button>
  {open&&<div className="lexa-v2-panel-body">
   <h4>Electronics catalogue, brands and manufacturer models</h4>
   <p>Search stable categories, review manufacturer references and add only the category nodes you choose. Nothing here creates stock, changes old product IDs or reclassifies historical transactions.</p>
   {summary.data&&<p className="lexa-product-hint">V{summary.data.schemaVersion} · {summary.data.enabledLeafCount} enabled of {summary.data.leaves} category leaves · {summary.data.families} specification families · policy v{summary.data.policyVersion}</p>}
   <label className="field-label">Search catalogue, code or historical breadcrumb<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Try keypad phones, air fryer, laptop, printer, UPS…" maxLength={100}/></label>
   {taxonomy.isError&&<p role="alert">Catalogue not available. Refresh after the backend and database upgrade.</p>}
   <div className="lexa-v2-leaf-picker"><label className="field-label">Choose a V2 category<select value={code} onChange={e=>setCode(e.target.value)}>
    <option value="">Select a category leaf</option>{visibleNodes.map(node=><option key={node.code} value={node.code} disabled={!node.enabled}>{node.breadcrumb}{node.enabled?'':' · Industry not active'}</option>)}
   </select></label></div>
   {(customCategories.data?.nodes.length??0)>0&&<div className="lexa-v2-preview" aria-label="Existing business categories"><strong>Your business's existing categories</strong><small>These are real categories already in your workspace, including your own custom nodes. No category or stock is created by searching.</small>
    {customCategories.data?.nodes.slice(0,12).map(item=><div className="lexa-v2-inline" key={item.categoryId}><span>{item.breadcrumb} · {item.code}</span><button type="button" className="button button-secondary button-small" onClick={()=>{onCategoryChosen?.(item.categoryId,item.templateKey??undefined);toast.success('Existing category selected; inventory was not modified');}}>Use category</button></div>)}
    {(customCategories.data?.total??0)>12&&<small>Refine your search to find more categories ({customCategories.data?.total} matches).</small>}
   </div>}
   {chosenNode&&<div className="lexa-v2-preview"><strong>{chosenNode.breadcrumb}</strong><span>{chosenNode.code} · {chosenFamily?.stockProfile??'Policy pending'} stock</span>
    {chosenFamily&&<small>{chosenFamily.fields.filter(f=>f.required).map(f=>f.key).join(', ')||'Flexible specifications'} · {describeElectronicsStockPolicy(chosenFamily)}</small>}
    {preview.data?.action==='already_adopted'&&<span>Already present in this workspace; existing category preserved.</span>}
    {preview.data?.action==='adopt_new_with_approval'&&<button type="button" className="button button-secondary button-small" disabled={adopted.isPending} onClick={()=>adopted.mutate()}>Add this category to my business</button>}
    {preview.data?.action==='link_existing_with_approval'&&<><span>Historical category found. Link its existing ID instead of duplicating stock categories.</span>
     {preview.data.legacyCandidates.map(c=><button type="button" className="button button-secondary button-small" key={c.categoryId} disabled={linked.isPending} onClick={()=>linked.mutate(c.categoryId)}>Link existing: {c.path}</button>)}
    </>}
    {preview.isError&&<small role="alert">Category is unavailable for your selected industries or could not be previewed.</small>}
   </div>}
   <hr/>
   <h4>Manufacturer & brand directory</h4>
   <label className="field-label">Find registered brands and aliases<input value={brandQuery} onChange={e=>setBrandQuery(e.target.value)} maxLength={100} placeholder="Samsung / Tecno / itel / HP…"/></label>
   <label className="field-label">Select manufacturer<select value={activeBrandId} onChange={e=>{setActiveBrandId(e.target.value);setAlias('');}}><option value="">Choose brand</option>{(brands.data??[]).map(b=><option key={b.id} value={b.id}>{b.name}{b.aliases.length?` · ${b.aliases.join(', ')}`:''}</option>)}</select></label>
   {activeBrandId&&<><div className="lexa-v2-inline"><label className="field-label">Add alternate spelling<input value={alias} maxLength={100} onChange={e=>setAlias(e.target.value)} placeholder="e.g. manufacturer trading name"/></label><button className="button button-secondary button-small" type="button" disabled={!alias.trim()||saveAlias.isPending} onClick={()=>saveAlias.mutate()}>Save alias</button></div>
    <div className="lexa-v2-inline"><label className="field-label">Suggest duplicate brand<select value={targetBrandId} onChange={e=>setTargetBrandId(e.target.value)}><option value="">Choose another brand</option>{(brands.data??[]).filter(b=>b.id!==activeBrandId).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><button className="button button-secondary button-small" type="button" disabled={!targetBrandId||proposeMerge.isPending} onClick={()=>proposeMerge.mutate()}>Propose merge review</button></div>
    <small className="field-help">A proposal never merges, deletes or renames existing records.</small>
   </>}
   <hr/>
   <h4>Reference model specifications</h4>
   <label className="field-label">Family and type<select value={familyCode} onChange={e=>{setFamilyCode(e.target.value);setSpecs({});}}><option value="">Select family</option>{enabledFamilies.map(f=><option key={f.code} value={f.code}>{f.code} · {f.stockProfile}</option>)}</select></label>
   {modelFamily&&<><p className="lexa-product-hint">Required fields and manufacturer/source evidence must be complete before a manager reviews a reference. New reference versions never overwrite historical product or physical-unit data.</p>
    <div className="form-two-col"><label className="field-label">Manufacturer model<input value={modelName} onChange={e=>setModelName(e.target.value)} maxLength={120} placeholder="Manufacturer label"/></label><label className="field-label">Manufacturer code<input value={manufacturerCode} onChange={e=>setManufacturerCode(e.target.value)} maxLength={100}/></label></div>
    <div className="form-two-col">{modelFamily.fields.filter(f=>f.key!=='model').map(f=><label className="field-label" key={f.key}>{f.key}{f.unit?` (${f.unit})`:''}{f.required?' *':''}
     {f.type==='boolean'?<select value={String(specs[f.key]??'')} onChange={e=>setSpecs(s=>({...s,[f.key]:e.target.value==='true'}))}><option value="">Unknown</option><option value="true">Yes</option><option value="false">No</option></select>:
      f.type==='enum'?<select value={String(specs[f.key]??'')} onChange={e=>setSpecs(s=>({...s,[f.key]:e.target.value}))}><option value="">Unknown</option>{(f.options??[]).map(x=><option key={x} value={x}>{x}</option>)}</select>:
      <input type={f.type==='number'?'number':'text'} step={f.type==='number'?'any':undefined} min={f.type==='number'?0:undefined} value={String(specs[f.key]??'')} onChange={e=>setSpecs(s=>({...s,[f.key]:e.target.value}))} maxLength={f.type==='number'?undefined:250}/>}
    </label>)}</div>
    <label className="field-label">Source / manufacturer evidence<input value={sourceName} maxLength={200} onChange={e=>setSourceName(e.target.value)} placeholder="Supplier data sheet / manufacturer reference"/></label>
    <button className="button button-secondary button-small" type="button" disabled={!activeBrandId||!modelName.trim()||createModel.isPending} onClick={()=>createModel.mutate()}>Register draft model reference</button>
   </>}
   {(models.data??[]).length>0&&<><label className="field-label">Review registered model<select value={selectedModelId} onChange={e=>{setSelectedModelId(e.target.value);setRevisionOpen(false);}}><option value="">Select a model</option>{(models.data??[]).filter(m=>!familyCode||m.familyCode===familyCode).map(m=><option key={m.id} value={m.id}>{m.name} · {m.reviewStatus} · v{m.referenceVersion}</option>)}</select></label>
    {selectedModel&&<div className="lexa-v2-preview"><strong>{selectedModel.name}</strong><span>Reference version {selectedModel.referenceVersion} · {selectedModel.reviewStatus}</span><small>Model family: {selectedModel.familyCode??'Historical unclassified model'}; no historical products are modified.</small>
     {selectedModel.familyCode&&<button type="button" className="button button-secondary button-small" onClick={()=>beginRevision(selectedModel)}>Create revised specification version</button>}
     {selectedModel.reviewStatus==='draft'&&selectedModel.familyCode&&<div className="lexa-v2-inline">
      <button className="button button-secondary button-small" type="button" disabled={reviewModel.isPending} onClick={()=>reviewModel.mutate({model:selectedModel,outcome:'reviewed'})}>Approve reviewed reference</button>
      <button className="button button-secondary button-small" type="button" disabled={reviewModel.isPending} onClick={()=>reviewModel.mutate({model:selectedModel,outcome:'rejected'})}>Reject incomplete or incorrect reference</button>
     </div>}
     {revisionOpen&&selectedModelPolicy&&<div className="lexa-v2-preview" aria-label="Revise manufacturer model specifications">
      <strong>New reference version for {selectedModel.name}</strong>
      <small>Editing adds an immutable revision and returns the model to draft review. Existing sales, products and previous reference versions stay unchanged.</small>
      <div className="form-two-col">{selectedModelPolicy.fields.filter(f=>f.key!=='model').map(f=><label className="field-label" key={f.key}>{f.key}{f.unit?` (${f.unit})`:''}{f.required?' *':''}
       {f.type==='boolean'?<select value={String(revisionSpecs[f.key]??'')} onChange={e=>setRevisionSpecs(v=>({...v,[f.key]:e.target.value===''?'':e.target.value==='true'}))}><option value="">Unknown</option><option value="true">Yes</option><option value="false">No</option></select>:
        f.type==='enum'?<select value={String(revisionSpecs[f.key]??'')} onChange={e=>setRevisionSpecs(v=>({...v,[f.key]:e.target.value}))}><option value="">Unknown</option>{(f.options??[]).map(opt=><option key={opt} value={opt}>{opt}</option>)}</select>:
        <input type={f.type==='number'?'number':'text'} min={f.type==='number'?0:undefined} step={f.type==='number'?'any':undefined} maxLength={f.type==='number'?undefined:250} value={String(revisionSpecs[f.key]??'')} onChange={e=>setRevisionSpecs(v=>({...v,[f.key]:e.target.value}))}/>}</label>)}</div>
      <label className="field-label">Manufacturer or supplier evidence<input maxLength={200} value={revisionEvidence} onChange={e=>setRevisionEvidence(e.target.value)} placeholder="Source, manufacturer data sheet or supplier record"/></label>
      <div className="lexa-v2-inline"><button type="button" className="button button-primary button-small" disabled={reviseModel.isPending} onClick={()=>reviseModel.mutate()}>Save new draft version</button><button type="button" className="button button-secondary button-small" onClick={()=>setRevisionOpen(false)}>Cancel revision</button></div>
     </div>}
    </div>}
   </>}
  </div>}
 </section>;
}
