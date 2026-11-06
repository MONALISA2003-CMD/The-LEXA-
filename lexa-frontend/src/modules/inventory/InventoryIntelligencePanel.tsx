
import {useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link} from 'react-router';
import {useWorkspace} from '../../app/WorkspaceContext';
import {apiInventoryOperations} from '../../data/remote/apiInventoryOperations';
import {dataProviderMode} from '../../data/remote/runtimeConfig';
import {formatMinorAmount} from '../../domain/money/money';
import {InventoryPanel,InventoryNotice,InventoryStats,InventoryBarChart,InventoryTable,day} from './InventoryFrame';
export default function InventoryIntelligencePanel({compact=false}:{compact?:boolean}){
 const {workspace,branch}=useWorkspace();
 const query=useQuery({queryKey:['inventory-intelligence',workspace.id,branch.id],
   queryFn:()=>apiInventoryOperations.intelligence({workspaceId:workspace.id,branchId:branch.id}),enabled:dataProviderMode==='api',staleTime:45000});
 const source=query.data;
 const movement=useMemo(()=>{
  const grouped=new Map<string,{inward:number;outward:number}>();
  for(const item of source?.dailyMovements??[]){
   const existing=grouped.get(item.date)??{inward:0,outward:0};
   if(item.quantity>0)existing.inward+=item.quantity;
   else existing.outward+=Math.abs(item.quantity);
   grouped.set(item.date,existing);
  }
  return [...grouped].sort((a,b)=>a[0].localeCompare(b[0])).slice(-12);
 },[source]);
 const urgent=(source?.products??[]).filter(p=>p.lowStock).sort((a,b)=>a.available-b.available);
 const money=(x:number)=>formatMinorAmount(x,workspace.currency);
 return <div className="solar-intelligence" style={{display:'grid',gap:16}}>
  {dataProviderMode==='local'&&<p className="solar-fineprint" role="note">Local-only preview: authoritative stock intelligence requires a connected LEXA account. Figures are not available here; use the recorded product and movement registers below.</p>}
  {query.isError&&<InventoryNotice retry={()=>void query.refetch()}>Current inventory intelligence could not load. Stock figures below must not be treated as zero until the connection is restored.</InventoryNotice>}
  <InventoryStats cards={[
   {label:'Available to sell',value:query.isError?'—':source?.totals.available.toLocaleString('en-UG')??'—',help:'On hand less reserved or restricted'},
   {label:'Reserved for orders',value:query.isError?'—':source?.totals.reserved.toLocaleString('en-UG')??'—'},
   {label:'Products running low',value:query.isError?'—':source?.totals.lowStock??'—'},
   {label:'Estimated purchase-cost value',value:query.isError?'—':source?money(source.totals.estimatedCostMinor):'—',help:'Estimate, not Finance valuation'},
  ]}/>
  {!compact&&<>
   <div className="solar-chart-grid">
    <InventoryBarChart title="Stock received / added · last 30 days" data={movement.map(([label,v])=>({label:label.slice(5),value:v.inward}))}/>
    <InventoryBarChart title="Stock sold / removed · last 30 days" data={movement.map(([label,v])=>({label:label.slice(5),value:v.outward}))}/>
   </div>
   <InventoryPanel title="Products needing attention" subtitle="Available quantities, customer commitments and minimum stock are checked together.">
    <InventoryTable headings={['Product','Available','Reserved','Minimum','Days of cover','Stock at purchase cost']} rows={urgent.slice(0,20).map(p=>[
     <div key="p"><strong>{p.name}</strong><br/><small>{p.sku}</small></div>,
     <strong key="avail" style={{color:'#AC5B18'}}>{p.available}</strong>,p.reserved,p.minStock,
     p.daysOfCover===null?'Not enough sales history':p.daysOfCover+' days',money(p.estimatedCostValueMinor)
    ])} empty="No tracked products are below their configured minimum."/>
    <Link to="/modules/replenishment" className="solar-button">Review what to buy</Link>
   </InventoryPanel>
   <div className="solar-chart-grid">
    <InventoryBarChart title="Best-selling products · 30 days" data={(source?.fastSellers??[]).slice(0,8).map(p=>({label:p.name,value:p.sold30Days}))}/>
    <InventoryBarChart title="Stock with no sales · estimated cost value" data={(source?.slowSellers??[]).slice(0,8).map(p=>({label:p.name,value:p.estimatedCostValueMinor}))}/>
   </div>
   <InventoryPanel title="Products approaching expiry" subtitle="From recorded supplier batches, not estimates.">
    <InventoryTable headings={['Batch','Product','Quantity','Expiry','Days remaining']} rows={(source?.expiring??[]).filter(x=>x.daysUntilExpiry<=60).slice(0,12).map(x=>[
     x.batch,source?.products.find(p=>p.id===x.productId)?.name??'Product',x.quantity,day(x.expiryDate),
     <span key="days" className={x.daysUntilExpiry<=0?'solar-tag solar-tag-danger':'solar-tag solar-tag-warning'}>{x.daysUntilExpiry<=0?'Expired':x.daysUntilExpiry+' days'}</span>
    ])} empty="No recorded lots are approaching expiry within 60 days."/>
    <Link to="/modules/batches" className="solar-button-secondary">Review batch history</Link>
   </InventoryPanel>
  </>}
  <p className="solar-fineprint">{source?'Last refreshed: '+new Date(source.asOf).toLocaleString('en-UG')+'. ':''}
   {source?.valuationNote??'Stock intelligence is derived from recorded business movements.'}
   An available quantity is not a guarantee a product can be sold if a serial, batch or expiry restriction applies.</p>
 </div>;
}

