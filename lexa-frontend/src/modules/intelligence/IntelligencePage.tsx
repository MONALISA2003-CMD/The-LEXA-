import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { Copy, RefreshCw, Send, ArrowRight } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { apiIntelligence, type IntelligenceScope } from '../../data/remote/apiIntelligence';
import { businessErrorMessage } from '../../data/remote/businessMessages';
import OwnerActions from './OwnerActions';
import AssistantAnswer from './AssistantAnswer';
import './intelligence-suite.css';

const prompts = [
 ['inventory', 'Stock and replenishment', 'How many products are at or below reorder levels?'],
 ['sales', 'Sales activity', 'How many completed sales are recorded?'],
 ['finance', 'Outstanding balances', 'How much is owed by customers and to suppliers?'],
 ['overview', 'Business priorities', 'Which current business risks should I review first?'],
] as const;
type Message = {id:string;role:'owner'|'lexa';text:string;time:string};
const newId=()=>crypto.randomUUID();
export default function IntelligencePage(){
 const {workspace,branch}=useWorkspace();
 const [params]=useSearchParams();
 const validScope=(value:string|null):IntelligenceScope=>value&&['overview','sales','inventory','finance','customers','people'].includes(value)?value as IntelligenceScope:'overview';
 const [scope,setScope]=useState<IntelligenceScope>(validScope(params.get('scope')));
 const [question,setQuestion]=useState((params.get('question')||'').slice(0,2000));
 const [messages,setMessages]=useState<Message[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const status=useQuery({queryKey:['lexa-ai-status',workspace.id,branch.id],queryFn:()=>apiIntelligence.status(workspace.id,branch.id),retry:false,staleTime:30000});
 const available=status.data?.canRunBusiness===true;
 const run=async(e?:FormEvent)=>{
  e?.preventDefault();const q=question.trim();if(!q||!available||busy)return;
  setBusy(true);setError('');setQuestion('');setMessages(v=>[...v,{id:newId(),role:'owner',text:q,time:new Date().toISOString()}]);
  try{const result=await apiIntelligence.explain(workspace.id,branch.id,q,scope);
   if(!result.answer?.trim())throw new Error('No response was received.');
   setMessages(v=>[...v,{id:newId(),role:'lexa',text:result.answer,time:new Date().toISOString()}]);
  }catch(err){setQuestion(q);setError(businessErrorMessage(err));}
  finally{setBusy(false);}
 };
 return <main className="page-stack lexa-intel-page lexa-assistant">
  <header className="lexa-intel-hero violet"><div><span className="lexa-intel-kicker">BUSINESS ASSISTANT</span><h1>LEXA Intelligence</h1><p>Review real sales, stock and financial records. Prepare business tasks with your approval.</p></div></header>
  {status.isLoading&&<p role="status">Checking access…</p>}
  {status.isError&&<section className="lexa-intel-warning" role="alert">{businessErrorMessage(status.error)} <button type="button" onClick={()=>void status.refetch()}>Retry</button></section>}
  {!status.isLoading&&!status.isError&&!available&&<section className="lexa-intel-warning" role="status">{status.data?.entitled===false?'The assistant is not included in this business subscription.':'LEXA Intelligence is available to the business owner when the service is connected.'}</section>}
  {available&&<>
   <div className="lexa-ai-status"><strong>Ready for business requests</strong><button type="button" onClick={()=>{setQuestion('');setMessages([]);setError('')}} disabled={!messages.length}><RefreshCw size={16}/> New request</button></div>
   <div className="lexa-ai-layout">
    <section className="lexa-ai-chat" aria-label="Business analysis">
      {messages.length===0&&<div className="lexa-ai-welcome"><h2>What would you like to review?</h2><div className="lexa-ai-ideas">{prompts.map(([area,label,text])=><button type="button" key={label} onClick={()=>{setScope(area);setQuestion(text)}}>{label}<ArrowRight size={15}/></button>)}</div></div>}
      <div className="lexa-ai-messages" aria-live="polite">{messages.map(m=><article key={m.id} className={`lexa-ai-message ${m.role==='owner'?'user':'assistant'}`}><div><header><strong>{m.role==='owner'?'You':'LEXA'}</strong><small>{new Date(m.time).toLocaleTimeString('en-UG',{hour:'2-digit',minute:'2-digit'})}</small></header>{m.role==='lexa'?<AssistantAnswer text={m.text}/>:<p>{m.text}</p>}{m.role==='lexa'&&<button type="button" onClick={()=>void navigator.clipboard.writeText(m.text)}><Copy size={14}/> Copy</button>}</div></article>)}</div>
      {busy&&<p className="lexa-ai-thinking" role="status">Reviewing your business records…</p>}
      {error&&<p className="lexa-intel-warning" role="alert">{error}</p>}
      <form className="lexa-ai-composer" onSubmit={run}><label htmlFor="lexa-question">Business question</label><textarea id="lexa-question" maxLength={2000} rows={3} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask about stock, sales, receivables or business priorities" disabled={busy}/><div><select aria-label="Business area" value={scope} onChange={e=>setScope(e.target.value as IntelligenceScope)} disabled={busy}>{[['overview','Whole business'],['sales','Sales'],['inventory','Inventory'],['finance','Finance'],['customers','Customers'],['people','Team']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><small>{question.length}/2000</small><button disabled={busy||!question.trim()} type="submit"><Send size={15}/> Ask LEXA</button></div></form>
    </section>
    <aside className="lexa-ai-aside"><OwnerActions enabled={available}/><section><h3>Business reports</h3><p>See recorded activity and accounting reports.</p><Link to="/reports">Open reports <ArrowRight size={15}/></Link></section></aside>
   </div>
  </>}
 </main>;
}
