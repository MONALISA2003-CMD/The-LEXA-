import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, BadgeCheck, Boxes, LockKeyhole, RefreshCcw, ShoppingCart, Sparkles } from 'lucide-react';
import TurnstileWidget, { publicTurnstileSiteKey } from '../auth/TurnstileWidget';
import { apiDemo, isDemoDeployment } from '../../data/remote/apiDemo';
import { ApiRequestError } from '../../data/remote/apiClient';
import './demo.css';

export default function DemoEntryPage(){
  const navigate=useNavigate();
  const [token,setToken]=useState<string|null>(null);
  const [revision,setRevision]=useState(0);
  const [checking,setChecking]=useState(true);
  const [opening,setOpening]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    if(!isDemoDeployment){setChecking(false);return;}
    let active=true;
    void apiDemo.status().then(()=>{if(active)navigate('/',{replace:true});}).catch(()=>{if(active)setChecking(false);});
    return ()=>{active=false;};
  },[navigate]);
  const start=async(e:FormEvent)=>{
    e.preventDefault();if(opening)return;
    setError('');setOpening(true);
    try{
      await apiDemo.start(token??undefined);
      // The CSRF double-submit token belongs to this browser; the session is an
      // HttpOnly cookie. A full reload clears old workspace/query caches.
      window.location.replace('/');
    }catch(err){
      const msg=err instanceof ApiRequestError?err.message:err instanceof Error?err.message:'Unable to create a demo session.';
      setError(msg);setToken(null);setRevision(n=>n+1);setOpening(false);
    }
  };
  if(!isDemoDeployment)return <main className="lexa-demo-entry"><div className="lexa-demo-entry-card"><h1>Try the interactive LEXA demo</h1><p>The demo runs on its own isolated website, separate from real customer accounts.</p><a className="lexa-demo-primary" href="https://demo.lexaaamaal.com/demo">Open live demo <ArrowRight size={18}/></a></div></main>;
  return <main className="lexa-demo-entry">
    <div className="lexa-demo-entry-card">
      <img src="/lexa-master-lockup.png" alt="LEXA" className="lexa-demo-logo"/>
      <span className="lexa-demo-kicker"><Sparkles size={16}/> INTERACTIVE DEMONSTRATION</span>
      <h1>Explore LEXA with your own sample business.</h1>
      <p>Try the same workspace used by LEXA customers. Create sales, update stock, explore finance and discover the complete module collection using fictional records.</p>
      <div className="lexa-demo-features">
        <span><ShoppingCart size={17}/> Sales and finance</span>
        <span><Boxes size={17}/> Inventory and projects</span>
        <span><BadgeCheck size={17}/> No registration or payment</span>
        <span><LockKeyhole size={17}/> Private temporary sample data</span>
      </div>
      {checking?<p role="status">Checking your demo session…</p>:<form onSubmit={e=>void start(e)}>
        <TurnstileWidget key={revision} action="demo" onToken={setToken}/>
        {error&&<p className="lexa-demo-error" role="alert">{error}</p>}
        <button className="lexa-demo-primary" type="submit" disabled={opening||(!token&&Boolean(publicTurnstileSiteKey))}>
          {opening?'Preparing your workspace…':'Start exploring LEXA'} {opening?<RefreshCcw className="lexa-demo-loading" size={19}/>:<ArrowRight size={19}/>}
        </button>
      </form>}
      <small>Each demo lasts up to two hours and expires after 30 minutes of inactivity. Sample operations do not send messages or transfer money.</small>
      <a className="lexa-demo-back" href="https://lexaaamaal.com/">Back to the LEXA website</a>
    </div>
  </main>;
}
