import {useMemo,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link} from 'react-router';
import {apiCatalogInventory} from '../../data/remote/apiWorkstream03';
import {apiIndustryOperations} from '../../data/remote/apiIndustryOperations';
import type {Product} from '../../domain/shared/types';

/** Staff-initiated, permissioned demand review. Python never writes inventory
 * and the browser receives aggregate forecast evidence without customer data. */
export default function WarehouseDemandReview({workspaceId,branchId,products}:{workspaceId:string;branchId:string;products:readonly Product[]}){
 const [warehouseId,setWarehouseId]=useState('');const [requested,setRequested]=useState(false);
 const warehouses=useQuery({queryKey:['warehouse-demand-locations',workspaceId,branchId],queryFn:()=>apiCatalogInventory.warehouses(workspaceId,branchId),retry:0});
 const options=(warehouses.data??[]).flatMap(row=>typeof row.id==='string'&&typeof row.name==='string'&&row.active!==false?[{id:row.id,name:row.name}]:[]);
 const review=useQuery({queryKey:['warehouse-demand-review',workspaceId,branchId,warehouseId],queryFn:()=>apiIndustryOperations.demandReview(workspaceId,branchId,warehouseId),enabled:requested&&!!warehouseId,staleTime:90_000,retry:0});
 const names=useMemo(()=>new Map(products.map(p=>[p.id,`${p.name} · ${p.sku}`])),[products]);
 const displayedItems=(review.data?.items??[]).filter(item=>names.has(item.productId));
 return <section className="section-card" aria-label="Warehouse demand review">
  <details><summary><strong>Warehouse demand review</strong> <span className="field-help">Recorded stock usage and replenishment policies</span></summary>
   <p className="field-help">Review calculated demand alongside actual stock and your approved replenishment settings. This analysis does not place orders, change prices or adjust stock.</p>
   <div className="form-two-col"><label className="field-label">Warehouse<select value={warehouseId} onChange={event=>{setWarehouseId(event.target.value);setRequested(false);}}><option value="">Choose warehouse</option>{options.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
    <div><button type="button" className="button button-secondary" disabled={!warehouseId||review.isFetching} onClick={()=>{if(requested){void review.refetch();}else setRequested(true);}}>{review.isFetching?'Checking demand…':'Review recorded demand'}</button></div></div>
   {warehouses.isError&&<p role="alert">Warehouses could not be loaded for this branch.</p>}
   {requested&&review.isError&&<p role="alert">Demand analysis is unavailable. Replenishment must be based on verified records and supplier terms.</p>}
   {review.data&&requested&&<>
    <p className="field-help">Analysis date: {review.data.asOf} · Model: {review.data.algorithmVersion}. Every suggestion requires staff review.</p>
    {!displayedItems.length?<p>No active replenishment policies were eligible for this warehouse. Set up a real reorder policy first.</p>:
     <div className="table-scroll"><table className="data-table"><thead><tr><th>Product</th><th>Observed days</th><th>Demand / day</th><th>Suggested units</th><th>Validation</th></tr></thead><tbody>
     {displayedItems.map(item=><tr key={item.productId}><td>{names.get(item.productId)??'Archived stock item'}</td><td>{item.observations}</td><td>{item.forecastDaily??'Insufficient history'}</td><td>{item.recommendedPurchaseUnits??'Not available'}</td><td>{item.warnings.length?item.warnings.join(' '):`Method: ${item.model}`}</td></tr>)}
     </tbody></table></div>}
    <p className="field-help">{review.data.notes}</p>
    <Link to="/modules/replenishment" className="button button-secondary button-small">Review replenishment policies</Link>
   </>}
  </details>
 </section>;
}
