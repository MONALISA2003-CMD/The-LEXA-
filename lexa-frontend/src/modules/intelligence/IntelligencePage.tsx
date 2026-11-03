
import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { Sparkles, BrainCircuit, ShieldCheck, Send, RefreshCw, AlertTriangle, Copy, Trash2, ArrowRight } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { apiIntelligence, type IntelligenceScope } from '../../data/remote/apiIntelligence';
import './intelligence-suite.css';
const ideas=[['overview','Business priorities','What should I focus on in my business right now?'],['sales','Sales performance','Explain my sales, returns and receipts.'],['inventory','Low stock','What do my stock records and reorder alerts show?'],['finance','Cash and debt','What are my receivables, payables and financial control issues?']] as const;
type ChatMessage={id:string;role:'user'|'assistant';text:string;time:string};
export default function IntelligencePage(){
 const {workspace,branch}=useWorkspace();
 const [params]=useSearchParams();
 const scopeParam=params.get('scope') as IntelligenceScope|null;
 const [scope,setScope]=useState<IntelligenceScope>(scopeParam??'overview');
 const [question,setQuestion]=useState(params.get('question')?.slice(0,2000)??'');
 const [messages,setMessages]=useState<ChatMessage[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const status=useQuery({queryKey:['lexa-ai-status',workspace.id,branch.id],queryFn:()=>apiIntelligence.status(workspace.id,branch.id),staleTime:30000,retry:1});
 const snapshot=useQuery({queryKey:['lexa-ai-records',workspace.id,branch.id],queryFn:()=>apiIntelligence.brief(workspace.id,branch.id),staleTime:60000,retry:1});
 const available=status.data?.canRunBusiness===true;
 const send=async(e?:FormEvent)=>{e?.preventDefault();const q=question.trim();if(!q||busy||!available)return;
  setError('');setBusy(true);setMessages(v=>[...v,{role:'user',text:q,time:new Date().toISOString(),id:crypto.randomUUID()}]);setQuestion('');
  try{const result=await apiIntelligence.explain(workspace.id,branch.id,q,scope);
   if(!result.answer?.trim())throw new Error('Empty model response');
   setMessages(v=>[...v,{role:'assistant',text:result.answer,time:new Date().toISOString(),id:crypto.randomUUID()}]);
  }catch(cause){setError(cause instanceof Error?cause.message:'AI providers could not complete this answer.');setQuestion(q);}
  finally{setBusy(false);}
 };
 return <main className="page-stack lexa-intel-page lexa-assistant">
  <section className="lexa-intel-hero violet"><div><span className="lexa-intel-kicker"><Sparkles size={15}/> YOUR BUSINESS INTELLIGENCE ASSISTANT</span><h1>Ask LEXA<span>, get clarity.</span></h1><p>Real business explanations, priorities and practical next steps—based on records you are permitted to see.</p><small><ShieldCheck size={14}/> Read-only · Permission filtered · No private employee records shared</small></div><BrainCircuit className="lexa-intel-hero-glyph" size={45}/></section>
  <div className="lexa-ai-status"><span className={available?'online':'offline'}/><strong>{status.isLoading?'Checking AI…':available?'Assistant ready':'Model service unavailable'}</strong><span>{available?`${status.data?.providersAvailable?.length??0} configured provider routes · automatic fallback`:'Verified reports remain available'}</span><button onClick={()=>void Promise.all([status.refetch(),snapshot.refetch()])} disabled={status.isFetching}><RefreshCw size={15}/> Refresh</button><button disabled={!messages.length} onClick={()=>{setMessages([]);setQuestion('');setError('')}}><Trash2 size={15}/> New chat</button></div>
  {!available&&!status.isLoading&&<div className="lexa-intel-warning"><AlertTriangle size={18}/> {status.isError?'AI status could not be loaded.':status.data?.explanation??'AI requires at least one working provider key on the Render backend. Ask your system administrator to check configuration.'} Use Business Reports below while models are offline.</div>}
  <div className="lexa-ai-layout">
   <section className="lexa-ai-chat">
    {!messages.length&&<div className="lexa-ai-welcome"><div className="lexa-ai-icon"><Sparkles size={29}/></div><h2>What would you like to understand?</h2><p>Ask LEXA about sales, inventory, customer collections and the decisions that matter to your business.</p><div className="lexa-ai-ideas">{ideas.map(([area,title,text])=><button key={title} disabled={!available} onClick={()=>{setScope(area);setQuestion(text)}}><Sparkles size={15}/>{title}<ArrowRight size={15}/></button>)}</div></div>}
    <div className="lexa-ai-messages" aria-live="polite">{messages.map(msg=><article key={msg.id} className={`lexa-ai-message ${msg.role}`}><span className="lexa-ai-avatar">{msg.role==='assistant'?<Sparkles size={16}/>: 'YOU'}</span><div><header><strong>{msg.role==='assistant'?'LEXA Assistant':'You'}</strong><small>{new Date(msg.time).toLocaleTimeString('en-UG',{hour:'2-digit',minute:'2-digit'})}</small></header><p>{msg.text}</p>{msg.role==='assistant'&&<button type="button" onClick={()=>void navigator.clipboard.writeText(msg.text)}><Copy size={14}/> Copy answer</button>}</div></article>)}</div>
    {busy&&<div className="lexa-ai-thinking"><Sparkles size={17}/> LEXA is checking permitted business records and available models…</div>}
    {error&&<div className="lexa-intel-warning" role="alert"><AlertTriangle size={16}/>{error} Your question has been restored. Retry when the provider is available.</div>}
    <form onSubmit={send} className="lexa-ai-composer"><label htmlFor="lexa-question">Your business question</label><textarea id="lexa-question" rows={3} maxLength={2000} value={question} placeholder="Ask about sales, stock, cash flow or operational priorities…" onChange={e=>setQuestion(e.target.value)} disabled={!available||busy}/><div><select aria-label="Business area" value={scope} onChange={e=>setScope(e.target.value as IntelligenceScope)} disabled={!available||busy}><option value="overview">Whole business</option><option value="sales">Sales</option><option value="inventory">Inventory</option><option value="finance">Finance</option><option value="customers">Customers</option><option value="people">People</option></select><small>{question.length}/2000</small><button type="submit" disabled={!available||busy||!question.trim()}><Send size={16}/> Ask LEXA</button></div></form>
   </section>
   <aside className="lexa-ai-aside"><section><div className="lexa-ai-aside-head"><ShieldCheck size={20}/><h3>Verified business snapshot</h3></div><p>Works even when external AI models are offline.</p>{snapshot.isLoading&&<p>Calculating real business activity…</p>}{snapshot.isError&&<div className="lexa-intel-warning">Snapshot unavailable. <button onClick={()=>void snapshot.refetch()}>Retry</button></div>}{snapshot.data&&<><ul>{snapshot.data.observations.map((item,i)=><li key={i}>{item}</li>)}</ul><small>{snapshot.data.notice}</small></>}<Link to="/reports">Open Business Reports <ArrowRight size={15}/></Link></section><section><div className="lexa-ai-aside-head"><ShieldCheck size={19}/><h3>Privacy protected</h3></div><p>LEXA explains filtered business totals. It cannot change records, approve payments, see passwords or send personal HR records to external models.</p></section></aside>
  </div>
 </main>;
}

