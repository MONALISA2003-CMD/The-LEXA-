import {Link, useLocation} from 'react-router';
import {BarChart3, ClipboardCheck, FileText, HandCoins, HeartHandshake, ReceiptText, RotateCcw, ShoppingCart, Tag} from 'lucide-react';
import {useQuery} from '@tanstack/react-query';
import {useWorkspace} from '../../app/WorkspaceContext';
import {formatMinorAmount} from '../../domain/money/money';
import {apiSellingInsights} from '../../data/remote/apiSellingInsights';
import './selling-sunset.css';

export const sellingScreens=[
 {path:'/checkout',label:'Checkout',icon:ShoppingCart},
 {path:'/sales',label:'Sales & receipts',icon:ReceiptText},
 {path:'/modules/sales-orders',label:'Orders',icon:ClipboardCheck},
 {path:'/modules/sales-returns',label:'Returns',icon:RotateCcw},
 {path:'/modules/sales-invoices',label:'Invoices',icon:HandCoins},
 {path:'/modules/quotations',label:'Quotations',icon:FileText},
 {path:'/modules/price-lists',label:'Pricing',icon:Tag},
 {path:'/modules/customers',label:'Customers',icon:HeartHandshake}
] as const;
const headings:Record<string,{title:string;subtitle:string}>={
 '/checkout':{title:'Make a sale',subtitle:'Find products quickly, take payment and give your customer a business-branded receipt.'},
 '/sales':{title:'Sales & receipts',subtitle:'See what you sold, the money received and customer balances.'},
 '/modules/sales-orders':{title:'Sales orders',subtitle:'Confirm customer orders, reserve goods and follow deliveries.'},
 '/modules/sales-returns':{title:'Returns & refunds',subtitle:'Find the original receipt, inspect returned items and settle the customer fairly.'},
 '/modules/sales-invoices':{title:'Customer invoices',subtitle:'Issue invoices, follow up on unpaid balances and record payments.'},
 '/modules/quotations':{title:'Quotations',subtitle:'Prepare professional offers and follow through on customer decisions.'},
 '/modules/price-lists':{title:'Prices & promotions',subtitle:'Prepare selling prices and make them available after business-owner approval.'},
 '/modules/customers':{title:'Your customers',subtitle:'One directory for customer contacts, purchases, orders and balances.'}
};
export default function SellingNav({compact=false}:{compact?:boolean}){
 const location=useLocation(),path=location.pathname.replace(/\/$/,'');
 const active=sellingScreens.find(s=>s.path===path)??sellingScreens[0];
 const heading=headings[active.path]!;
 const Icon=active.icon;
 return <section className={'selling-group-nav '+(compact?'selling-nav-compact':'')}>
  <div className="selling-group-banner"><div><span className="selling-eyebrow">SELLING · YOUR BUSINESS</span>
    <h1>{heading.title}</h1><p>{heading.subtitle}</p></div><div className="selling-group-icon"><Icon size={32}/></div>
  </div>
  <nav className="selling-group-links" aria-label="Selling sections">
   {sellingScreens.map(item=><Link key={item.path} to={item.path} aria-current={item.path===path?'page':undefined} className={item.path===path?'active':''}><item.icon size={15}/>{item.label}</Link>)}
  </nav>
 </section>;
}
export function SellingPerformance({full=false}:{full?:boolean}){
 const {workspace,branch}=useWorkspace();
 const query=useQuery({queryKey:['selling-insights',workspace.id,branch.id],queryFn:()=>apiSellingInsights.get(workspace.id,branch.id),staleTime:60_000,retry:1});
 const d=query.data;
 const stats=d?[['Net sales',d.totals.netMinor],['Money received',d.totals.receivedMinor],['Customer balances',d.totals.outstandingMinor],['Returns',d.totals.returnedMinor]]:[];
 const peak=Math.max(1,...(d?.days??[]).map(day=>Math.max(day.grossMinor,day.receivedMinor)));
 return <section className="selling-performance">
  <header><div><span className="selling-eyebrow">SALES PERFORMANCE</span><h2>{full?'How your business is selling':'Sales at a glance'}</h2><p>Actual recorded business activity · {d?d.from+' to '+d.to:'Last 30 days'}</p></div><BarChart3 size={22}/></header>
  {query.isLoading&&<div className="selling-muted">Loading your latest sales…</div>}
  {query.isError&&<div className="selling-error" role="alert">The sales overview could not load. Your records are unchanged. <button onClick={()=>void query.refetch()}>Try again</button></div>}
  {d&&<><div className="selling-stat-grid">{stats.map(([label,value])=><article key={label}><span>{label}</span><strong>{formatMinorAmount(Number(value),workspace.currency)}</strong></article>)}</div>
    <h3>Sales and money received</h3>
    <div className="selling-trend" role="img" aria-label="Daily sales and receipts over the selected period">
     {(d.days.length?d.days:[]).slice(-30).map(day=><div key={day.day} className="selling-trend-day" title={day.day+' Sales: '+formatMinorAmount(day.grossMinor,workspace.currency)+' Received: '+formatMinorAmount(day.receivedMinor,workspace.currency)}>
       <div className="selling-trend-bars"><span style={{height:String(Math.max(2,day.grossMinor/peak*100))+'%'}}/><span style={{height:String(Math.max(2,day.receivedMinor/peak*100))+'%'}}/></div>
       {full&&<small>{day.day.slice(5)}</small>}
     </div>)}
     {!d.days.length&&<p>No sales or payments recorded in this period.</p>}
    </div>
    <div className="selling-trend-legend"><span><i className="selling-color-sales"/>Sales</span><span><i className="selling-color-receipts"/>Money received</span></div>
    {full&&<div className="selling-deep-graphs">
      <div><h3>Most popular products</h3>{d.topProducts.length?d.topProducts.slice(0,6).map(p=><div className="selling-ranked" key={p.productId}><span>{p.name} · {p.units} sold</span><strong>{formatMinorAmount(p.grossMinor,workspace.currency)}</strong></div>):<p>No products sold in this period.</p>}</div>
      <div><h3>Payments received by method</h3>{d.methods.length?d.methods.map(p=><div className="selling-ranked" key={p.method}><span>{p.method.replaceAll('_',' ')}</span><strong>{formatMinorAmount(p.amountMinor,workspace.currency)}</strong></div>):<p>No recorded payments in this period.</p>}</div>
    </div>}
    <p className="selling-footnote">Money received is shown by payment date. Customer balances are the current amount owed, not limited by the graph's dates.</p>
  </>}
 </section>;
}

