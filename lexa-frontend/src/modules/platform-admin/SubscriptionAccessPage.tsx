import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { CheckCircle2, Clock, CreditCard, HelpCircle, MessageCircle, RefreshCw, ShieldCheck } from '../../components/LexaIcon';
import { toast } from 'sonner';
import { isApiProvider } from '../../data/remote/runtimeConfig';
import { apiClient } from '../../data/remote/apiClient';
import { apiPlatformBilling, type SubscriptionStatusResponse } from '../../data/remote/apiPlatformAdministration';
import { businessErrorMessage } from '../../data/remote/businessMessages';
import './platform-administration.css';

export default function SubscriptionAccessPage() {
  const [params] = useSearchParams();
  const [workspaceId,setWorkspaceId] = useState(params.get('workspaceId') ?? '');
  const [status,setStatus] = useState<SubscriptionStatusResponse|null>(null);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [method,setMethod] = useState('mtn_momo');
  const [reference,setReference] = useState('');
  const [message,setMessage] = useState('');
  const [supportSubject,setSupportSubject] = useState('');
  const [supportDescription,setSupportDescription] = useState('');
  const [supportOpen,setSupportOpen] = useState(false);
  const [refreshKey,setRefreshKey] = useState(0);
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    void (async()=>{
      try{
        let id=workspaceId;
        if(!id){const list=await apiClient.get<Array<{id:string}>>('/workspaces');id=list[0]?.id??'';if(!id)throw new Error('No business is linked to this account.');if(active)setWorkspaceId(id);}
        const response=await apiPlatformBilling.status(id);
        if(active)setStatus(response);
      }catch(err){if(active)setError(businessErrorMessage(err));}
      finally{if(active)setLoading(false);}
    })();
    return ()=>{active=false;};
  },[workspaceId,refreshKey]);
  if(!isApiProvider)return <Navigate to="/" replace/>;
  async function submit(event:FormEvent){event.preventDefault();if(!workspaceId)return;setSaving(true);
    try{await apiPlatformBilling.submit(workspaceId,method,reference,message);toast.success('Payment evidence submitted for review.');setReference('');setMessage('');setRefreshKey(x=>x+1);}
    catch(err){toast.error(businessErrorMessage(err));}finally{setSaving(false);}}
  async function openCase(event:FormEvent){event.preventDefault();if(!workspaceId)return;setSaving(true);
    try{await apiPlatformBilling.openSupport(workspaceId,supportSubject,supportDescription);toast.success('Support request received.');setSupportOpen(false);setSupportSubject('');setSupportDescription('');}
    catch(err){toast.error(businessErrorMessage(err));}finally{setSaving(false);}}
  const isAwaitingReview = status?.latestPayment?.status === 'submitted' && !status.operational;
  const whatsappNumbers = status?.whatsappNumbers?.length ? status.whatsappNumbers : (status?.whatsappNumber ? [status.whatsappNumber] : []);
  const whatsappText = encodeURIComponent(`Hello LEXA, I would like to confirm my UGX 50,000 subscription for ${status?.businessName ?? 'my business'}. Business reference: ${workspaceId}.`);
  return <main className="lexa-platform-page lexa-subscription-page">
    <header className="lexa-platform-public-header"><img src="/lexa-master-lockup-light.png" alt="LEXA"/><Link to="/sign-in">Sign in / switch account</Link></header>
    <div className="lexa-platform-public-content">
      <div className="lexa-platform-kicker"><ShieldCheck size={16}/> OFFICIAL LEXA SUBSCRIPTION</div>
      <h1>Your business access</h1>
      <p className="lexa-platform-lead">Complete your LEXA subscription, follow your payment review and open your business when access is approved. Your saved records remain protected during review.</p>
      {loading?<div role="status" className="lexa-platform-card">Loading secure subscription status…</div>:error?<div className="lexa-platform-card" role="alert"><h2>Could not load subscription</h2><p>{error}</p><Link to="/sign-in">Sign in</Link></div>:status&&<>
        <div className="lexa-platform-card lexa-subscription-summary"><div><span className="lexa-platform-muted">{status.businessName}</span><h2>{status.operational?'Your LEXA account is active':status.status==='archived'?'Business account archived':status.status==='suspended'?'Business account suspended':'Subscription payment required'}</h2><p>{status.operational?(status.status==='legacy'?'Your existing account remains operational during the billing transition.':`Your paid access has ${status.remainingDays} day(s) remaining.`):status.status==='archived'?'Your business records are preserved. Contact LEXA administration to request restoration.':status.status==='suspended'?'Access is temporarily suspended. Please contact LEXA administration.':'Your business is securely saved. Submit payment details and wait for independent verification by LEXA administration.'}</p></div><div className="lexa-subscription-price"><strong>UGX {status.priceUGX.toLocaleString('en-UG')}</strong><span>per {status.periodDays} days</span></div></div>
        <section className="lexa-subscription-progress lexa-platform-card" aria-label="Subscription progress">
          <div className="lexa-subscription-progress-title"><div><span className="lexa-platform-kicker">YOUR NEXT STEPS</span><h2>{status.operational?'Your business is ready':isAwaitingReview?'Your payment is being checked':'Complete your subscription'}</h2></div><span className="lexa-subscription-state-pill">{status.operational?'ACCESS ACTIVE':isAwaitingReview?'UNDER REVIEW':'PAYMENT REQUIRED'}</span></div>
          <ol className="lexa-subscription-steps">
            <li className="is-complete"><span className="lexa-subscription-step-number">✓</span><div><strong>Business registered</strong><small>Your business information has been saved.</small></div></li>
            <li className={status.latestPayment?'is-complete': 'is-current'}><span className="lexa-subscription-step-number">{status.latestPayment?'✓':'2'}</span><div><strong>Payment details submitted</strong><small>{status.latestPayment?'LEXA received your payment claim.':'Provide a receipt reference or a transfer message below.'}</small></div></li>
            <li className={status.operational?'is-complete':isAwaitingReview?'is-current':''}><span className="lexa-subscription-step-number">{status.operational?'✓':'3'}</span><div><strong>Independent payment review</strong><small>{status.operational?'Payment has been confirmed.':isAwaitingReview?'LEXA administration must check the official receiving account.':'A LEXA administrator confirms the actual receipt of funds.'}</small></div></li>
            <li className={status.operational?'is-complete':''}><span className="lexa-subscription-step-number">{status.operational?'✓':'4'}</span><div><strong>Open your business</strong><small>{status.operational?'You can sign in and start working.':'An email will guide you back to your workspace once approved.'}</small></div></li>
          </ol>
        </section>
        {isAwaitingReview&&<div className="lexa-platform-card lexa-subscription-waiting" role="status"><div className="lexa-subscription-waiting-icon"><Clock size={27}/></div><div><h2>Payment details received</h2><p>Your submission is queued for independent review. You do not need to send the same payment again. LEXA will notify the account owner by email when the payment is verified.</p><p className="lexa-platform-muted">Keep the transaction reference. If an administrator needs more details, they may contact you through official LEXA channels.</p><button type="button" className="lexa-platform-table-action" onClick={()=>setRefreshKey(x=>x+1)}>Check review status</button></div></div>}
        {status.operational&&<div className="lexa-platform-card"><p><CheckCircle2 size={18}/> Access approved{status.expiresAt?` until ${new Date(status.expiresAt).toLocaleString('en-UG',{timeZone:'Africa/Kampala'})} EAT`:''}.</p><Link className="lexa-platform-button" to="/">Open my workspace</Link></div>}
        {status.latestPayment&&<div className="lexa-platform-card"><div className="lexa-platform-row"><strong>Most recent payment review</strong><span className={`lexa-state lexa-state-${status.latestPayment.status}`}>{status.latestPayment.status}</span></div><div className="lexa-platform-muted">Reference {status.latestPayment.payment_reference} · {new Date(status.latestPayment.created_at).toLocaleDateString('en-UG')}</div>{status.latestPayment.review_note&&<p>{status.latestPayment.review_note}</p>}</div>}
        {status.canManageBilling && !isAwaitingReview?<div className="lexa-platform-card"><h2><CreditCard size={20}/> Record your subscription payment</h2><p>Pay using official LEXA instructions. A transaction screenshot or WhatsApp message is not automatic proof of receipt; activation follows administrator confirmation.</p><p className="lexa-platform-instructions">{status.paymentInstructions}</p>{status.supportPhone&&<p>LEXA support telephone: <a href={`tel:${status.supportPhone.replace(/[^+0-9]/g,'')}`}>{status.supportPhone}</a></p>}{whatsappNumbers.map((number,index)=><a key={number} className="lexa-platform-whatsapp" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${number}?text=${whatsappText}`}><MessageCircle size={18}/> LEXA WhatsApp {index+1} (+{number})</a>)}
          <form className="lexa-platform-form" onSubmit={e=>void submit(e)}><label>Payment method used<select value={method} onChange={e=>setMethod(e.target.value)}><option value="mtn_momo">MTN Mobile Money</option><option value="airtel_money">Airtel Money</option><option value="bank_transfer">Bank transfer</option><option value="other">Other agreed method</option></select></label><label>Provider receipt / transaction reference<input value={reference} maxLength={120} onChange={e=>setReference(e.target.value)} placeholder="e.g. MTN or bank transaction ID"/></label><label>Payment message or other details<textarea value={message} maxLength={1000} onChange={e=>setMessage(e.target.value)} placeholder="Optional details to help LEXA verify the transfer" rows={3}/></label><p className="lexa-platform-muted">Give the provider reference or enough transfer information for LEXA to identify it. A screenshot alone does not activate your business.</p><button type="submit" className="lexa-platform-button" disabled={saving||(!reference.trim()&&!message.trim())||status.latestPayment?.status==='submitted'}>{saving?'Submitting…':'Send payment details for review'}</button></form>
        </div>:isAwaitingReview?null:<div className="lexa-platform-card"><h2>{status.status==='archived'?'Account archived':status.status==='suspended'?'Account suspended':'Contact your business owner'}</h2><p>{status.status==='archived'||status.status==='suspended'?'LEXA administration must restore this account before payment submission or normal operations. All business data remains preserved.':'Only the owner or appointed administrator can submit subscription payment details. Your existing business data is preserved.'}</p></div>}
        <div className="lexa-platform-card"><div className="lexa-platform-row"><h2><HelpCircle size={20}/> Need help?</h2><button className="lexa-platform-text-button" onClick={()=>setSupportOpen(x=>!x)}>{supportOpen?'Close':'Contact support'}</button></div>{supportOpen&&<form className="lexa-platform-form" onSubmit={e=>void openCase(e)}><label>Subject<input value={supportSubject} required maxLength={140} onChange={e=>setSupportSubject(e.target.value)}/></label><label>Describe the problem<textarea value={supportDescription} required minLength={1} maxLength={2000} rows={3} onChange={e=>setSupportDescription(e.target.value)}/></label><button disabled={saving} className="lexa-platform-button">Send support request</button></form>}</div>
      </>}
      <div className="lexa-platform-footer"><button onClick={()=>setRefreshKey(x=>x+1)} className="lexa-platform-text-button"><RefreshCw size={15}/> Refresh status</button><span><Clock size={15}/> Access renews for 30 days following confirmed payment.</span></div>
    </div>
  </main>;
}
