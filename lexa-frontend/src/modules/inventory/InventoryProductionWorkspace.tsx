import {useMemo,useState,type FormEvent} from 'react';
import {useQueries,useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {apiIndustryOperations,type StockFormula} from '../../data/remote/apiIndustryOperations';
import {apiCatalogInventory} from '../../data/remote/apiWorkstream03';
import type {Product} from '../../domain/shared/types';

const decimal = /^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/;
const positive = (value:string) => decimal.test(value)&&Number(value)>0;
type ComponentDraft = {key:number;productId:string;variantId:string;quantity:string};
const stockName = (product:Product) => `${product.name} · ${product.sku}`;

/** The only posting mechanism used here is the server-approved, fully atomic
 * production endpoint. All client previews are illustrative, never stock facts.
 */
export default function InventoryProductionWorkspace({workspaceId,branchId,products}:{workspaceId:string;branchId:string;products:readonly Product[]}){
 const client=useQueryClient();
 const status=useQuery({queryKey:['industry-production-access',workspaceId,branchId],queryFn:()=>apiIndustryOperations.rollout(workspaceId,branchId),retry:0});
 const enabled=status.data?.postingEnabled===true;
 const formulas=useQuery({queryKey:['industry-formulas',workspaceId,branchId],queryFn:()=>apiIndustryOperations.formulas(workspaceId,branchId),enabled});
 const orders=useQuery({queryKey:['industry-orders',workspaceId,branchId],queryFn:()=>apiIndustryOperations.orders(workspaceId,branchId),enabled});
 const warehouses=useQuery({queryKey:['industry-warehouses',workspaceId,branchId],queryFn:()=>apiCatalogInventory.warehouses(workspaceId,branchId),enabled});
 const variants=useQuery({queryKey:['industry-product-variants',workspaceId],queryFn:()=>apiCatalogInventory.allVariants(workspaceId),enabled});
 const menuLines=useQuery({queryKey:['industry-pending-menu-lines',workspaceId,branchId],queryFn:()=>apiIndustryOperations.pendingMenus(workspaceId,branchId),enabled});
 const eligibleCuts=useQuery({queryKey:['industry-cut-eligible-lines',workspaceId,branchId],queryFn:()=>apiIndustryOperations.measuredLines(workspaceId,branchId),enabled});
 const cuts=useQuery({queryKey:['industry-measured-cuts',workspaceId,branchId],queryFn:()=>apiIndustryOperations.measuredCuts(workspaceId,branchId),enabled});
 const [kind,setKind]=useState<StockFormula['kind']>('production');
 const [name,setName]=useState('');const [outputId,setOutputId]=useState('');const [outputVariant,setOutputVariant]=useState('');const [yieldQuantity,setYieldQuantity]=useState('1');
 const [ingredients,setIngredients]=useState<ComponentDraft[]>([{key:1,productId:'',variantId:'',quantity:'1'}]);
 const [selectedFormula,setSelectedFormula]=useState('');const [warehouseId,setWarehouseId]=useState('');const [batchCount,setBatchCount]=useState('1');
 const [finishedLot,setFinishedLot]=useState('');const [saleLineId,setSaleLineId]=useState('');
 const [selectedLots,setSelectedLots]=useState<Record<string,string>>({});const [wastes,setWastes]=useState<Record<string,string>>({});
 const [cutSaleLine,setCutSaleLine]=useState('');const [cutWaste,setCutWaste]=useState('0.001');const [cutReason,setCutReason]=useState('');
 const [busy,setBusy]=useState(false);
 const productMap=useMemo(()=>new Map(products.map(p=>[p.id,p])),[products]);
 const selected=formulas.data?.find(f=>f.id===selectedFormula);
 const availableIngredients=products.filter(p=>p.active&&p.trackStock&&p.trackLot&&!p.trackSerial);
 const finishedOptions=products.filter(p=>p.active&&(!p.trackStock||(p.trackLot&&!p.trackSerial)));
 const sourceQueries=useQueries({queries:(selected?.components??[]).map(c=>({
  queryKey:['industry-ingredient-lots',workspaceId,branchId,c.productId,c.variantId],
  queryFn:()=>apiCatalogInventory.availableLots(workspaceId,branchId,c.productId,c.variantId??undefined),
  enabled:enabled&&Boolean(selected),staleTime:10000,
 }))});
 const chosenWarehouse=warehouses.data?.find(w=>w.id===warehouseId);
 const outputIsMenu=selected?productMap.get(selected.outputProductId)?.trackStock===false:false;
 const saleOptions=(menuLines.data??[]).filter(line=>line.productId===selected?.outputProductId&&line.variantId===(selected?.outputVariantId??null));
 const validWarehouses=(warehouses.data??[]).flatMap(w=>typeof w.id==='string'&&typeof w.name==='string'&&w.active===true?[{id:w.id,name:w.name}]:[]);
 const variantOptions=(id:string)=>(variants.data??[]).filter(v=>v.productId===id&&v.active);
 async function run(action:()=>Promise<unknown>,message:string){setBusy(true);try{await action();toast.success(message);await Promise.all([
  client.invalidateQueries({queryKey:['industry-formulas',workspaceId,branchId]}),
  client.invalidateQueries({queryKey:['industry-orders',workspaceId,branchId]}),
  client.invalidateQueries({queryKey:['industry-measured-cuts',workspaceId,branchId]}),
  client.invalidateQueries({queryKey:['industry-cut-eligible-lines',workspaceId,branchId]}),
  client.invalidateQueries({queryKey:['industry-pending-menu-lines',workspaceId,branchId]}),
  client.invalidateQueries({queryKey:['inventory-balances',workspaceId,branchId]}),
  client.invalidateQueries({queryKey:['inventory-movements',workspaceId,branchId]}),
 ]);}catch(e){toast.error('Nothing was posted',{description:e instanceof Error?e.message:'Review the record and your permissions.'});}finally{setBusy(false);}}
 function updateIngredient(key:number,partial:Partial<ComponentDraft>){setIngredients(rows=>rows.map(row=>row.key===key?{...row,...partial}:row));}
 async function createFormula(e:FormEvent){e.preventDefault();if(!enabled||!outputId||!positive(yieldQuantity)||ingredients.some(i=>!i.productId||!positive(i.quantity)))return;
  const components=ingredients.map(i=>({productId:i.productId,...(i.variantId?{variantId:i.variantId}:{}),quantity:i.quantity,unitCode:productMap.get(i.productId)?.unitOfMeasure??''}));
  await run(()=>apiIndustryOperations.createFormula(workspaceId,branchId,{name,kind,outputProductId:outputId,...(outputVariant?{outputVariantId:outputVariant}:{}),outputQuantity:yieldQuantity,components}),'Formula saved for independent review');
 }
 async function createOrder(e:FormEvent){e.preventDefault();if(!selected||!warehouseId||!positive(batchCount)||!Number.isSafeInteger(Number(batchCount)))return;
  const orderInputs=selected.components.map(c=>({formulaComponentId:c.id,sourceLotId:selectedLots[c.id]??'',wasteQuantity:wastes[c.id]??'0'}));
  if(orderInputs.some(i=>!i.sourceLotId)){toast.error('Choose a real source lot for every ingredient.');return;}
  await run(()=>apiIndustryOperations.createOrder(workspaceId,branchId,{formulaId:selected.id,warehouseId,batches:Number(batchCount),...(outputIsMenu?{saleLineId}:{outputLotNumber:finishedLot}),inputs:orderInputs}),'Production order submitted for approval');
 }
 async function createCut(e:FormEvent){e.preventDefault();if(!cutSaleLine||!positive(cutWaste)||cutReason.trim().length<8)return;
  await run(()=>apiIndustryOperations.requestCut(workspaceId,branchId,{saleLineId:cutSaleLine,wasteQuantity:cutWaste,reason:cutReason}),'Cutting loss sent for review');
 }
 return <section className="section-card" aria-label="Production and controlled stock conversions">
  <details>
   <summary><strong>Production, recipes & measured stock</strong> <span className="field-help">Approved ingredients, finished batches and cutting losses</span></summary>
   {status.isLoading?<p>Checking production access…</p>:status.isError?<p role="alert">Production permissions could not be verified. No stock changes are available.</p>:!enabled?
    <div className="form-info"><p>Controlled production has not been activated for this business. Existing stock and sales remain available; production posting requires an approved rollout.</p></div>:
    <div className="form-stack">
     <h3>Production formulas</h3>
     <p className="field-help">Record actual source ingredients and expected output. A different authorized employee must approve the formula before it can be used.</p>
     <form className="form-stack" onSubmit={e=>void createFormula(e)}>
      <div className="form-two-col"><label className="field-label">Formula name<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Bread loaf, 800 g"/></label>
       <label className="field-label">Production method<select value={kind} onChange={e=>setKind(e.target.value as StockFormula['kind'])}>
        <option value="production">Finished batch</option><option value="recipe">Prepared food sale</option><option value="decant">Fragrance decant</option><option value="tester">Display tester</option><option value="assembly">Assembled stock</option></select></label></div>
      <div className="form-two-col"><label className="field-label">Finished product or menu item<select required value={outputId} onChange={e=>{setOutputId(e.target.value);setOutputVariant('');}}><option value="">Choose an existing product</option>{finishedOptions.filter(p=>kind==='recipe'?!p.trackStock:p.trackStock).map(p=><option value={p.id} key={p.id}>{stockName(p)}</option>)}</select></label>
       <label className="field-label">Expected output quantity<input required inputMode="decimal" pattern="[0-9]+(\\.[0-9]{1,3})?" value={yieldQuantity} onChange={e=>setYieldQuantity(e.target.value)}/></label></div>
      {variantOptions(outputId).length>0&&<label className="field-label">Finished variant<select required value={outputVariant} onChange={e=>setOutputVariant(e.target.value)}><option value="">Choose SKU</option>{variantOptions(outputId).map(v=><option key={v.id} value={v.id}>{v.sku}</option>)}</select></label>}
      <h4>Ingredients and components</h4>
      {ingredients.map((item,i)=><div className="form-two-col" key={item.key}>
       <label className="field-label">Ingredient {i+1}<select required value={item.productId} onChange={e=>updateIngredient(item.key,{productId:e.target.value,variantId:''})}><option value="">Choose lot-tracked stock</option>{availableIngredients.map(p=><option key={p.id} value={p.id}>{stockName(p)}</option>)}</select></label>
       <label className="field-label">Quantity per output batch ({productMap.get(item.productId)?.unitOfMeasure??'base unit'})<input required inputMode="decimal" value={item.quantity} onChange={e=>updateIngredient(item.key,{quantity:e.target.value})}/></label>
       {variantOptions(item.productId).length>0&&<label className="field-label">Ingredient variant<select required value={item.variantId} onChange={e=>updateIngredient(item.key,{variantId:e.target.value})}><option value="">Choose SKU</option>{variantOptions(item.productId).map(v=><option key={v.id} value={v.id}>{v.sku}</option>)}</select></label>}
       {ingredients.length>1&&<button type="button" className="button button-secondary button-small" onClick={()=>setIngredients(rows=>rows.filter(row=>row.key!==item.key))}>Remove ingredient</button>}
      </div>)}
      <div className="action-group"><button type="button" className="button button-secondary" disabled={ingredients.length>=30} onClick={()=>setIngredients(rows=>[...rows,{key:Math.max(0,...rows.map(r=>r.key))+1,productId:'',variantId:'',quantity:'1'}])}>Add ingredient</button><button type="submit" className="button button-primary" disabled={busy||!outputId||!name.trim()}>Save formula</button></div>
     </form>
     <div className="table-toolbar"><h4>Formula review</h4><span className="muted-count">{formulas.data?.length??0} records</span></div>
     {(formulas.data??[]).map(formula=><div className="form-info" key={formula.id}><div><strong>{formula.name}</strong> · {formula.kind.replace('_',' ')} · {formula.status}<p className="field-help">Output: {productMap.get(formula.outputProductId)?.name??'Archived product'} · {String(formula.outputQuantity)}</p></div>{formula.status==='draft'&&<button type="button" className="button button-secondary button-small" disabled={busy} onClick={()=>void run(()=>apiIndustryOperations.approveFormula(workspaceId,branchId,formula.id),'Formula approved')}>Approve formula</button>}</div>)}
     <h3>Production orders</h3>
     <form className="form-stack" onSubmit={e=>void createOrder(e)}>
      <div className="form-two-col"><label className="field-label">Approved formula<select required value={selectedFormula} onChange={e=>{setSelectedFormula(e.target.value);setSelectedLots({});setWastes({});setSaleLineId('');}}><option value="">Choose approved formula</option>{(formulas.data??[]).filter(f=>f.status==='approved').map(f=><option key={f.id} value={f.id}>{f.name} · {f.kind}</option>)}</select></label>
       <label className="field-label">Source warehouse<select required value={warehouseId} onChange={e=>{setWarehouseId(e.target.value);setSelectedLots({});}}><option value="">Choose warehouse</option>{validWarehouses.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}</select></label></div>
      {selected&&<><div className="form-two-col"><label className="field-label">Batch count<input required inputMode="numeric" type="number" min={1} step={1} max={10000} value={batchCount} onChange={e=>setBatchCount(e.target.value)}/></label>
       {outputIsMenu?<label className="field-label">Completed meal or order line<select required value={saleLineId} onChange={e=>setSaleLineId(e.target.value)}><option value="">Choose sale receipt and item</option>{saleOptions.map(s=><option key={s.id} value={s.id}>{s.receiptNumber} · {s.description} · {s.quantity} portions</option>)}</select></label>:
       <label className="field-label">Finished batch reference<input required maxLength={100} value={finishedLot} onChange={e=>setFinishedLot(e.target.value)} placeholder="As marked on the actual produced batch"/></label>}</div>
       <p className="field-help">The selected warehouse must contain every source ingredient. Waste is additional to the quantities in the approved formula.</p>
       {selected.components.map((c,i)=>{
        const rows=(sourceQueries[i]?.data??[]).filter(l=>l.warehouseId===warehouseId);
        return <div className="form-two-col" key={c.id}><label className="field-label">{productMap.get(c.productId)?.name??'Ingredient'} · source lot<select required value={selectedLots[c.id]??''} onChange={e=>setSelectedLots(all=>({...all,[c.id]:e.target.value}))}><option value="">Select received lot</option>{rows.map(l=><option key={l.id} value={l.id}>{l.lotNumber} · {l.available} available{l.expiryDate?` · expires ${l.expiryDate}`:''}</option>)}</select></label>
        <label className="field-label">Documented waste ({c.unitCode})<input inputMode="decimal" value={wastes[c.id]??'0'} onChange={e=>setWastes(all=>({...all,[c.id]:e.target.value}))}/></label></div>;
       })}</>}
      <button type="submit" className="button button-primary" disabled={busy||!selected||!chosenWarehouse||(outputIsMenu?!saleLineId:!finishedLot.trim())}>Submit production order</button>
     </form>
     {(orders.data??[]).map(order=><div className="form-info" key={order.id}><div><strong>{formulas.data?.find(f=>f.id===order.formulaId)?.name??'Production'}</strong> · {order.status}<p className="field-help">{order.outputLotNumber??'Prepared sale'} · {order.batches} batch(es) {order.journalId?'· Journal recorded':''}</p></div>
      {order.status==='draft'&&<button type="button" disabled={busy} className="button button-secondary button-small" onClick={()=>void run(()=>apiIndustryOperations.approveOrder(workspaceId,branchId,order.id),'Order approved')}>Approve</button>}
      {order.status==='approved'&&<button type="button" disabled={busy} className="button button-primary button-small" onClick={()=>void run(()=>apiIndustryOperations.completeOrder(workspaceId,branchId,order.id),'Production posted to stock and accounts')}>Complete and post</button>}
     </div>)}
     <h3>Cut-to-length stock</h3>
     <p className="field-help">Record physical cutting loss against an actual sold roll or length. The original sold length stays on the receipt; an approver posts the additional loss separately.</p>
     <form className="form-stack" onSubmit={e=>void createCut(e)}><label className="field-label">Completed measured sale<select required value={cutSaleLine} onChange={e=>setCutSaleLine(e.target.value)}><option value="">Choose receipt and product</option>{(eligibleCuts.data??[]).map(x=><option key={x.id} value={x.id}>{x.receiptNumber} · {x.description} · {x.quantity} {x.unitName}</option>)}</select></label>
      <div className="form-two-col"><label className="field-label">Cutting loss, in stock units<input required inputMode="decimal" value={cutWaste} onChange={e=>setCutWaste(e.target.value)}/></label><label className="field-label">Reason<input required minLength={8} maxLength={500} value={cutReason} onChange={e=>setCutReason(e.target.value)} placeholder="Describe the physical cut loss"/></label></div>
      <button type="submit" disabled={busy||!cutSaleLine||!positive(cutWaste)||cutReason.trim().length<8} className="button button-primary">Submit cutting loss</button>
     </form>
     {(cuts.data??[]).map(cut=><div className="form-info" key={cut.id}><div><strong>{cut.wasteQuantity} units</strong> · {cut.status}<p>{cut.reason}</p></div>{cut.status==='pending'&&<button type="button" disabled={busy} className="button button-secondary button-small" onClick={()=>void run(()=>apiIndustryOperations.approveCut(workspaceId,branchId,cut.id),'Cutting loss posted to inventory and accounts')}>Approve loss</button>}</div>)}
    </div>}
  </details>
 </section>;
}
