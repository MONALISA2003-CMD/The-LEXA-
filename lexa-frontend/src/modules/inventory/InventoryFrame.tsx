
import type{ReactNode} from 'react';
import {Link,useLocation} from 'react-router';
import {Boxes,Package,PackageCheck,ClipboardCheck,CalendarClock,ChartNoAxesCombined,
 ArrowLeftRight,Warehouse,ScanBarcode,Layers3,ShieldCheck,RefreshCw} from 'lucide-react';
import './solar-volt.css';
const links=[
 {to:'/products',label:'Products',icon:Package},
 {to:'/inventory',label:'Stock & movements',icon:Boxes},
 {to:'/modules/receiving',label:'Goods receiving',icon:PackageCheck},
 {to:'/modules/stock-counts',label:'Stock counts',icon:ClipboardCheck},
 {to:'/modules/batches',label:'Batches & expiry',icon:CalendarClock},
 {to:'/modules/replenishment',label:'Reorder planning',icon:ChartNoAxesCombined},
 {to:'/modules/stock-transfers',label:'Stock transfers',icon:ArrowLeftRight},
 {to:'/modules/warehouses',label:'Storage locations',icon:Warehouse},
 {to:'/modules/picklists',label:'Pick & pack',icon:ScanBarcode},
 {to:'/modules/item-bundles',label:'Product bundles',icon:Layers3}
];
export function InventoryFrame({title,subtitle,children,action}:{title:string;subtitle:string;children:ReactNode;action?:ReactNode}){
 const current=useLocation().pathname;
 return <div className="page-stack solar-inventory" data-module-accent="volt">
  <header className="solar-hero">
   <div className="solar-hero-top">
    <div><div className="solar-kicker">INVENTORY · STOCK INTELLIGENCE</div><h1>{title}</h1><p>{subtitle}</p></div>
    <div className="solar-hero-icon"><Boxes size={32}/></div>
   </div>
   <nav className="solar-module-nav" aria-label="Inventory modules">{links.map(item=><Link to={item.to} key={item.to}
      aria-current={current===item.to?'page':undefined}><item.icon size={15}/>{item.label}</Link>)}</nav>
   {action&&<div className="solar-hero-actions">{action}</div>}
  </header>{children}
 </div>;
}
export function InventoryPanel({title,subtitle,children,action}:{title:string;subtitle?:string;children:ReactNode;action?:ReactNode}){
 return <section className="solar-panel"><div className="solar-panel-header"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}
export function InventoryNotice({children,retry}:{children:ReactNode;retry?:()=>void}){
 return <div className="solar-notice" role="alert"><ShieldCheck size={17}/><span>{children}</span>{retry&&<button onClick={retry} type="button"><RefreshCw size={14}/> Try again</button>}</div>;
}
export function InventoryStats({cards}:{cards:Array<{label:string;value:string|number;help?:string}>}){
 return <section className="solar-stats" aria-label="Stock overview">{cards.map(x=><article key={x.label}><span>{x.label}</span><strong>{x.value}</strong>{x.help&&<small>{x.help}</small>}</article>)}</section>;
}
export function InventoryBarChart({title,data,empty='No activity has been recorded for this period.'}:{title:string;data:Array<{label:string;value:number}>;empty?:string}){
 const max=Math.max(1,...data.map(x=>x.value));
 return <div className="solar-chart"><h3>{title}</h3>{data.some(d=>d.value>0)?<div className="solar-chart-bars">{data.map((d,i)=><div className="solar-chart-line" key={d.label+i}>
  <span title={d.label}>{d.label}</span><div className="solar-bar-track"><i style={{width:Math.max(0,Math.min(100,d.value/max*100))+'%'}}/></div>
  <b>{Number(d.value.toFixed(1)).toLocaleString('en-UG')}</b>
 </div>)}</div>:<p className="solar-empty">{empty}</p>}</div>;
}
export function InventoryTable({headings,rows,empty}:{headings:string[];rows:Array<Array<ReactNode>>;empty:string}){
 return rows.length?<div className="solar-table-scroll"><table className="solar-table"><thead><tr>{headings.map(h=><th key={h}>{h}</th>)}</tr></thead>
 <tbody>{rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j} data-label={headings[j]}>{cell}</td>)}</tr>)}</tbody></table></div>:
 <p className="solar-empty">{empty}</p>;
}
export const readable=(x:unknown)=>typeof x==='string'?x.replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase()):String(x??'—');
export const field=(row:Record<string,unknown>,...keys:string[])=>keys.map(k=>row[k]).find(v=>v!==undefined&&v!==null)??'';
export const number=(x:unknown)=>Number(x??0)||0;
export const day=(x:unknown)=>x?new Date(String(x)).toLocaleDateString('en-UG'):'—';

