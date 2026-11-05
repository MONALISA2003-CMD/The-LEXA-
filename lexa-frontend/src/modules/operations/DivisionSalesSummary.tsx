import {useQuery} from '@tanstack/react-query';
import {useWorkspace} from '../../app/WorkspaceContext';
import {apiIndustryOperations} from '../../data/remote/apiIndustryOperations';
import {dataProviderMode} from '../../data/remote/runtimeConfig';
import {formatMinorAmount} from '../../domain/money/money';

function amount(raw:string,currency:string):string{
 const value=Number(raw);
 return Number.isSafeInteger(value)?formatMinorAmount(value,currency):'Unavailable';
}

/** Branch-level sales attribution uses the original posted sale-line division,
 * not the division currently assigned to its product. No profit is estimated
 * when returned costs or source valuation remain unresolved. */
export default function DivisionSalesSummary(){
 const {workspace,branch}=useWorkspace();const w=workspace.id,b=branch.id;
 const result=useQuery({queryKey:['division-sales-attribution',w,b],queryFn:()=>apiIndustryOperations.salesReport(w,b),enabled:dataProviderMode==='api',staleTime:60_000,retry:0});
 if(dataProviderMode!=='api')return null;
 const groups=result.data?.groups??[];
 return <section className="fin-panel" aria-label="Business division sales attribution">
  <div className="fin-heading-row"><div><h2>Sales by business division</h2><p>Original sale-line assignments for {branch.name}; historical unassigned sales remain visible.</p></div></div>
  {result.isPending?<p className="fin-loading">Loading recorded division sales…</p>:
   result.isError?<p role="alert">Division sales records are unavailable. Consolidated ledger balances above are unaffected.</p>:
   groups.length===0?<p className="fin-empty">No completed sales have been attributed to a division.</p>:
   <div className="fin-table-scroll"><table className="fin-table"><thead><tr><th>Division at sale</th><th>Sale lines</th><th>Gross recorded sales</th><th>Recorded returns</th><th>Source cost</th></tr></thead><tbody>
    {groups.map(row=><tr key={row.division_id??'unassigned'}><td>{row.division_name}</td><td>{row.line_count}</td><td>{amount(row.gross_minor,workspace.currency)}</td><td>{amount(row.refund_minor,workspace.currency)}</td><td>{row.unknown_cost_lines>0?'Incomplete':amount(row.known_cost_minor,workspace.currency)}</td></tr>)}
   </tbody></table></div>}
  <p className="fin-footnote">Recorded returns are physical/financial return documents, not proof of cash settlement. Source costs do not include return cost reversals. This report does not assert net profit or replace consolidated general-ledger statements.</p>
 </section>;
}
