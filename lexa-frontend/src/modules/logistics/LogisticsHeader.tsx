
import {Link,useLocation} from 'react-router';
import {ArrowUpRight,Boxes,ClipboardCheck,PackageCheck,Truck} from 'lucide-react';
import './logistics-violet.css';
export default function LogisticsHeader({active}:{active:'deliveries'|'packages'}){
 const location=useLocation();
 return <header className="logistics-hero">
  <div className="logistics-hero-main">
   <span className="logistics-eyebrow">LOGISTICS · YOUR BUSINESS</span>
   <h1>{active==='packages'?'Packages & packing slips':'Deliveries & fulfilment'}</h1>
   <p>{active==='packages'?'Check every product, seal parcels and follow them through delivery.':'Send goods with confidence, follow every delivery and account for money collected.'}</p>
  </div>
  <div className="logistics-hero-emblem">{active==='packages'?<Boxes size={36}/>:<Truck size={36}/>}</div>
  <nav className="logistics-links" aria-label="Logistics sections">
   <Link to="/modules/deliveries" aria-current={location.pathname==='/modules/deliveries'?'page':undefined}><Truck size={15}/> Deliveries</Link>
   <Link to="/modules/packages" aria-current={location.pathname==='/modules/packages'?'page':undefined}><PackageCheck size={15}/> Packages</Link>
   <Link to="/modules/sales-orders"><ClipboardCheck size={15}/> Sales orders <ArrowUpRight size={13}/></Link>
  </nav>
 </header>;
}

