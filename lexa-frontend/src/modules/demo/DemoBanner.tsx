import {useEffect,useState} from 'react';
import {AlertCircle,RefreshCcw,ShieldCheck,X} from 'lucide-react';
import {apiDemo} from '../../data/remote/apiDemo';
import './demo.css';

export default function DemoBanner(){
  const [deadline,setDeadline]=useState<number|null>(null);
  const [now,setNow]=useState(Date.now());
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{
    let mounted=true;
    void apiDemo.status().then(s=>{if(mounted)setDeadline(new Date(s.expiresAt).getTime());}).catch(()=>{});
    const interval=window.setInterval(()=>setNow(Date.now()),30_000);
    return ()=>{mounted=false;window.clearInterval(interval);};
  },[]);
  const minutes=deadline?Math.max(0,Math.ceil((deadline-now)/60_000)):null;
  const reset=async()=>{
    if(!window.confirm('Reset this demo? Your sample changes will be lost and a new workspace will open.'))return;
    setBusy(true);setMessage('');
    try{await apiDemo.reset();window.location.replace('/');}catch(e){setMessage(e instanceof Error?e.message:'Could not reset demo.');setBusy(false);}
  };
  const exit=async()=>{
    setBusy(true);
    try{await apiDemo.end();}catch{/* Expired sessions are already unusable. */}
    window.location.replace('https://lexaaamaal.com/');
  };
  return <aside className="lexa-demo-banner" aria-label="LEXA demonstration workspace">
    <span><ShieldCheck size={17}/><strong>LIVE DEMO</strong> Fictional sample data only {minutes!==null&&<small>· {minutes} min remaining</small>}</span>
    <div>
      <button disabled={busy} type="button" onClick={()=>void reset()}><RefreshCcw size={15}/> Reset</button>
      <a href="https://app.lexaaamaal.com/create-account">Create real account</a>
      <button disabled={busy} type="button" onClick={()=>void exit()}><X size={15}/> Exit</button>
    </div>
    {message&&<p role="alert"><AlertCircle size={14}/>{message}</p>}
  </aside>;
}
