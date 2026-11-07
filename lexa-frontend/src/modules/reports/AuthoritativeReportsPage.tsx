
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { BarChart3, CalendarDays, Download, RefreshCw, Printer, ShieldCheck, AlertTriangle, ArrowRight, LockKeyhole } from '../../components/LexaIcon';
import { useWorkspace } from '../../app/WorkspaceContext';
import { isApiProvider } from '../../data/remote/runtimeConfig';
import { apiReports } from '../../data/remote/apiReports';
import { apiTeamAccess } from '../../data/remote/apiTeamAccess';
import { LineTrendChart, BarBreakdownChart } from '../../components/charts/Charts';
import '../intelligence/intelligence-suite.css';

function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Kampala',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function before(days:number){return new Date(Date.parse(today()+'T00:00:00Z')-days*86400000).toISOString().slice(0,10);}
function money(value:number,currency:string){return new Intl.NumberFormat('en-UG',{style:'currency',currency,maximumFractionDigits:currency==='UGX'?0:2}).format(value/(currency==='UGX'?1:100));}
function exportCSV(rows:Array<Array<unknown>>){const escape=(v:unknown)=>'"'+String(v??'').replace(/"/g,'""').replace(/^[=+@\-\t]/,"'$&")+'"';const blob=new Blob(['\ufeff'+rows.map(row=>row.map(escape).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='LEXA_Business_Report.csv';a.click();URL.revokeObjectURL(url);}
export default function AuthoritativeReportsPage(){
 const {workspace,branch}=useWorkspace();
 const navigate=useNavigate();
 const ownerAccess=useQuery({queryKey:['report-ai-owner',workspace.id],queryFn:()=>apiTeamAccess.access(workspace.id),retry:false,staleTime:60000});
 const [from,setFrom]=useState(()=>before(29)),[to,setTo]=useState(()=>today()),[range,setRange]=useState(30);
 const [active,setActive]=useState('executive'),[custom,setCustom]=useState(false);
 const valid=from<=to && (Date.parse(to)-Date.parse(from))/86400000<=365;
 const report=useQuery({queryKey:['intelligence-report-library',workspace.id,branch.id,from,to],queryFn:()=>apiReports.library(workspace.id,branch.id,from,to),enabled:valid,staleTime:60000,retry:1});
 const detail=report.data;
 const family=detail?.families.find(x=>x.key===active);
 const currency=detail?.currency??workspace.currency??'UGX';
 const preset=(days:number)=>{setTo(today());setFrom(before(days-1));setRange(days);setCustom(false);};
 const download=()=>{if(!detail||!family?.available)return;exportCSV([['LEXA Business Reports',family.title],['Period',from,to],['Currency',currency],['Source tables',family.source],[],['Metric','Value','Basis'],...family.metrics.map(x=>[x.label,x.unit==='money'?x.value/(currency==='UGX'?1:100):x.value,x.basis]),[],['Date','Gross Sales','Receipts'],...detail.trend.map(x=>[x.label,x.salesMinor,x.receiptsMinor])]);};
 const ask=()=>navigate('/intelligence?scope='+({finance:'finance',inventory:'inventory',sales:'sales',customers:'customers',people:'people'} as Record<string,string>)[active]+'&question='+encodeURIComponent('Explain the most important findings and recommended actions in my '+family?.title+' report from '+from+' to '+to));
 return <main className="page-stack lexa-intel-page lexa-reports">
   <section className="lexa-intel-hero jade"><div><span className="lexa-intel-kicker"><BarChart3 size={15}/> LEXA BUSINESS INTELLIGENCE</span><h1>Business Reports<span>, made clear.</span></h1><p>Real performance, financial controls and operational insights from your own workspace records.</p><small><ShieldCheck size={14}/> {isApiProvider ? 'Verified LEXA data · Permission-controlled' : 'Local-only preview · Not server-verified'} · {currency}</small></div><BarChart3 className="lexa-intel-hero-glyph" size={46}/></section>
   <section className="lexa-intel-toolbar"><span><CalendarDays size={15}/> Reporting period</span><div className="lexa-intel-presets">{[1,7,30,90].map(n=><button key={n} className={range===n&&!custom?'selected':''} onClick={()=>preset(n)}>{n===1?'Today':n+' days'}</button>)}<button className={custom?'selected':''} onClick={()=>{setCustom(true);setRange(0)}}>Custom</button></div>{custom&&<div className="lexa-intel-dates"><label>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>}
    <div className="lexa-intel-actions"><button onClick={()=>void report.refetch()} disabled={report.isFetching}><RefreshCw size={15}/> Refresh</button><button onClick={download} disabled={!family?.available}><Download size={15}/> CSV</button><button onClick={()=>window.print()} disabled={!detail}><Printer size={15}/> Print</button></div></section>
   {!isApiProvider&&<div className="lexa-intel-warning" role="status">Local-only data is not presented as a server-verified report. Connect to LEXA to view authoritative reports.</div>}
   {!valid&&<div className="lexa-intel-warning">Reporting period must contain 1–366 days.</div>}
   {report.isLoading&&<div className="lexa-intel-status"><RefreshCw size={19}/> Preparing verified business reports…</div>}
   {report.isError&&<div className="lexa-intel-warning"><AlertTriangle size={20}/> Reports couldn't be retrieved. Your records have not changed. <button onClick={()=>void report.refetch()}>Retry</button></div>}
   {detail&&<>
    <header className="lexa-intel-heading"><div><span>REPORT LIBRARY</span><h2>Explore your business</h2><p>Actual source records, not estimated or AI-generated numbers.</p></div><small>Updated {new Date(detail.generatedAt).toLocaleString('en-UG')}</small></header>
    <div className="lexa-intel-tabs" role="tablist">{detail.families.map(x=><button role="tab" aria-selected={active===x.key} className={active===x.key?'active':''} key={x.key} onClick={()=>setActive(x.key)}>{!x.available&&<LockKeyhole size={12}/>} {x.title}</button>)}</div>
    {family&&<section className="lexa-intel-content">
     <header className="lexa-intel-content-head"><div><span>{family.available?'VERIFIED REPORT':'ACCESS CONTROLLED'}</span><h2>{family.title}</h2><p>Source: {family.source}</p></div>{ownerAccess.data?.isOwner===true&&<button className="lexa-intel-ask" onClick={ask}>Ask LEXA <ArrowRight size={15}/></button>}</header>
     {!family.available?<p className="lexa-intel-warning"><LockKeyhole size={17}/> This report requires your CEO's approval or a specific workspace permission.</p>:<>
       <div className="lexa-intel-metrics">{family.metrics.map(m=><article key={m.label}><label>{m.label}<small>{m.basis}</small></label><strong>{m.unit==='money'?money(m.value,currency):m.value.toLocaleString('en-UG',{maximumFractionDigits:2})}</strong></article>)}</div>
       {['executive','sales','payments'].includes(active)&&<div className="lexa-intel-charts"><LineTrendChart title="Sales and receipts" description="Completed sales and actual recorded collections" points={detail.trend.map(x=>({label:x.label,value:x.salesMinor,comparisonValue:x.receiptsMinor}))} currencyFormatter={x=>money(x,currency)} comparisonLabel="Receipts"/><BarBreakdownChart title="Payment methods" description="Cash, mobile money and bank channels as recorded" points={detail.paymentMethods.map(x=>({label:x.label,value:x.amountMinor}))} formatValue={x=>money(x,currency)}/></div>}
       {['executive','sales'].includes(active)&&<div className="lexa-intel-comparison">Previous period: {detail.comparison.changePercent===null?'No comparable previous sales recorded.':`${detail.comparison.changePercent>0?'+':''}${detail.comparison.changePercent}% change in completed gross sales.`}</div>}
       {detail.alerts.length>0&&['executive','inventory','finance','compliance'].includes(active)&&<div className="lexa-intel-alerts"><h3>Items needing attention</h3>{detail.alerts.map(x=><Link key={x.title} to={x.link}><AlertTriangle size={16}/><span><strong>{x.title}</strong><small>{x.detail}</small></span><ArrowRight size={15}/></Link>)}</div>}
       <div className="lexa-intel-source"><ShieldCheck size={18}/><span><strong>Data assurance</strong><small>{detail.assurance}</small><small>Sources: {family.source}. Balances marked "current" are snapshots, not historical period-end totals.</small></span><Link to={family.link}>Open module <ArrowRight size={14}/></Link></div>
      </>}
    </section>}
   </>}
 </main>;
}

