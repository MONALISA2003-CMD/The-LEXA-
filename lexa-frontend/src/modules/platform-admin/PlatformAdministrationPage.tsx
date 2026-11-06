import { useCallback, useEffect, useMemo, useState, type ReactNode, type FormEvent } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  Activity, AlertTriangle, BarChart3, Building2, CalendarClock, CheckCircle2, CircleDollarSign,
  CreditCard, FileClock, HeartPulse, HelpCircle, LayoutDashboard, LockKeyhole,
  Menu, Search, Shield, ShieldCheck, Users, X,
} from 'lucide-react';
import { apiPlatformAdministration as api, type PlatformProfile, type PlatformSummary,
  type PlatformBusiness, type PlatformUser, type PlatformPayment, type PlatformHealth, type PlatformRevenue,
  type PlatformSupportCase, type PlatformIncident, type PlatformAudit,
} from '../../data/remote/apiPlatformAdministration';
import { businessErrorMessage } from '../../data/remote/businessMessages';
import './platform-administration.css';

type Section = 'overview'|'businesses'|'users'|'payments'|'revenue'|'health'|'support'|'incidents'|'audit';
const sections = [
  {id:'overview',label:'Overview',icon:LayoutDashboard,roles:['super_admin','billing_manager','auditor','operations_manager']},
  {id:'businesses',label:'Business accounts',icon:Building2,roles:['super_admin','billing_manager','support_agent','auditor']},
  {id:'users',label:'Users & access',icon:Users,roles:['super_admin','support_agent','auditor']},
  {id:'payments',label:'Payment approvals',icon:CreditCard,roles:['super_admin','billing_manager','auditor']},
  {id:'revenue',label:'Revenue reports',icon:BarChart3,roles:['super_admin','billing_manager','auditor']},
  {id:'health',label:'System health',icon:HeartPulse,roles:['super_admin','operations_manager','auditor']},
  {id:'support',label:'Support cases',icon:HelpCircle,roles:['super_admin','support_agent','billing_manager','auditor']},
  {id:'incidents',label:'Incidents',icon:AlertTriangle,roles:['super_admin','operations_manager','auditor']},
  {id:'audit',label:'Audit trail',icon:FileClock,roles:['super_admin','auditor']},
] as const;
const ugx=(n:number|undefined)=>`UGX ${Number(n??0).toLocaleString('en-UG')}`;
const date=(value:string|null|undefined)=>value?new Date(value).toLocaleString('en-UG',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Kampala'}):'—';
const state=(s:string)=> <span className={`lexa-state lexa-state-${s.replace(/[^a-z]/g,'')}`}>{s.replaceAll('_',' ')}</span>;
const SectionCard=({children,title}:{children:ReactNode;title?:string})=><section className="lexa-platform-card">{title&&<h2>{title}</h2>}{children}</section>;

export default function PlatformAdministrationPage(){
  const [profile,setProfile]=useState<PlatformProfile|null>(null);
  const [loadingProfile,setLoadingProfile]=useState(true);
  const [authError,setAuthError]=useState('');
  const [section,setSection]=useState<Section>('overview');
  const [mobileOpen,setMobileOpen]=useState(false);
  const [working,setWorking]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [refresh,setRefresh]=useState(0);
  const [summary,setSummary]=useState<PlatformSummary|null>(null);
  const [businesses,setBusinesses]=useState<PlatformBusiness[]>([]);
  const [query,setQuery]=useState('');
  const [searchTerm,setSearchTerm]=useState('');
  const [businessPage,setBusinessPage]=useState(0);
  const [userPage,setUserPage]=useState(0);
  const [users,setUsers]=useState<PlatformUser[]>([]);
  const [details,setDetails]=useState<Awaited<ReturnType<typeof api.business>>|null>(null);
  const [paymentFilter,setPaymentFilter]=useState('submitted');
  const [payments,setPayments]=useState<PlatformPayment[]>([]);
  const [review,setReview]=useState<PlatformPayment|null>(null);
  const [verifiedReference,setVerifiedReference]=useState('');
  const [accessOperation,setAccessOperation]=useState<{tenantId:string;businessName:string;mode:'suspended'|'reinstate'|'enroll'}|null>(null);
  const [accessReason,setAccessReason]=useState('');
  const [accessConfirmed,setAccessConfirmed]=useState(false);
  const [reviewNote,setReviewNote]=useState('');
  const [receiptConfirmed,setReceiptConfirmed]=useState(false);
  const [revenue,setRevenue]=useState<PlatformRevenue|null>(null);
  const [health,setHealth]=useState<PlatformHealth|null>(null);
  const [cases,setCases]=useState<PlatformSupportCase[]>([]);
  const [incidents,setIncidents]=useState<PlatformIncident[]>([]);
  const [audits,setAudits]=useState<PlatformAudit[]>([]);
  const [newIncidentOpen,setNewIncidentOpen]=useState(false);
  const [incidentTitle,setIncidentTitle]=useState('');
  const [incidentDescription,setIncidentDescription]=useState('');
  const [incidentSeverity,setIncidentSeverity]=useState('medium');

  useEffect(()=>{
    let active=true;
    void api.profile().then(p=>{if(active){setProfile(p);if(!sections[0].roles.some(r=>r===p.role))setSection('businesses');}})
      .catch(err=>{if(active)setAuthError(businessErrorMessage(err));})
      .finally(()=>{if(active)setLoadingProfile(false);});
    return ()=>{active=false;};
  },[]);
  const allowedSections=useMemo(()=>sections.filter(s=>profile&&s.roles.some(r=>r===profile.role)),[profile]);
  const reload=useCallback(()=>setRefresh(n=>n+1),[]);
  // Debounce directory search: do not make one Neon query for every keypress.
  useEffect(()=>{const timer=window.setTimeout(()=>setSearchTerm(query),400);return()=>window.clearTimeout(timer);},[query]);
  // A visible admin console checks its current section once a minute. There is no
  // paid always-on worker, nor a false promise of alerts when the tab is closed.
  useEffect(()=>{
    if(!profile||profile.requiresMfa)return;
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible'&&['overview','health','payments'].includes(section))reload();},60_000);
    return()=>window.clearInterval(timer);
  },[profile,section,reload]);
  useEffect(()=>{
    if(!profile||profile.requiresMfa||!allowedSections.some(s=>s.id===section))return;
    let active=true;setLoading(true);setError('');
    void (async()=>{
      try{
        if(section==='overview'){const res=await api.overview();if(active)setSummary(res);}
        if(section==='businesses'){const res=await api.businesses(searchTerm,businessPage*50);if(active)setBusinesses(res);}
        if(section==='users'){const res=await api.users(searchTerm,userPage*50);if(active)setUsers(res);}
        if(section==='payments'){const res=await api.payments(paymentFilter);if(active)setPayments(res);}
        if(section==='revenue'){const res=await api.revenue();if(active)setRevenue(res);}
        if(section==='health'){const res=await api.health();if(active)setHealth(res);}
        if(section==='support'){const res=await api.support();if(active)setCases(res);}
        if(section==='incidents'){const res=await api.incidents();if(active)setIncidents(res);}
        if(section==='audit'){const res=await api.audit();if(active)setAudits(res);}
      }catch(err){if(active)setError(businessErrorMessage(err));}
      finally{if(active)setLoading(false);}
    })();
    return()=>{active=false;};
  },[profile,section,refresh,searchTerm,businessPage,userPage,paymentFilter,allowedSections]);
  async function takeAction(action:()=>Promise<unknown>,success:string){
    setWorking(true);
    try{await action();toast.success(success);setReview(null);setReceiptConfirmed(false);setReviewNote('');reload();}
    catch(err){toast.error(businessErrorMessage(err));}finally{setWorking(false);}
  }
  async function openDetails(b:PlatformBusiness){
    try{const value=await api.business(b.tenant_id);setDetails(value);}catch(err){toast.error(businessErrorMessage(err));}
  }
  function switchTo(next:Section){setSection(next);setMobileOpen(false);setDetails(null);setReview(null);setAccessOperation(null);setQuery('');setSearchTerm('');setBusinessPage(0);setUserPage(0);}
  if(loadingProfile)return <div className="lexa-platform-loading" role="status">Checking LEXA platform administrator permissions…</div>;
  if(authError||!profile)return <main className="lexa-platform-access"><Shield size={35}/><h1>Platform administrator access</h1><p>{authError||'This account is not enrolled as a LEXA platform administrator.'}</p><p>Business administrators are not automatically platform administrators.</p><Link to="/sign-in">Sign in to an authorized account</Link></main>;
  if(profile.requiresMfa)return <main className="lexa-platform-access"><LockKeyhole size={36}/><h1>Authenticator verification required</h1><p>LEXA Control Centre requires an enrolled authenticator for administrative access. Enable MFA in your account security settings first.</p><Link to="/account/security">Open account security</Link></main>;
  return <div className="lexa-platform-app">
    <aside className={`lexa-platform-sidebar ${mobileOpen?'open':''}`} aria-label="LEXA Control Centre navigation">
      <div className="lexa-platform-sidebar-brand"><img src="/lexa-master-lockup-light.png" alt="LEXA"/><span>CONTROL CENTRE</span></div>
      <div className="lexa-platform-sidebar-caption">PLATFORM MANAGEMENT</div>
      <nav>{allowedSections.map(s=><button key={s.id} type="button" className={`lexa-platform-nav-item ${section===s.id?'active':''}`} onClick={()=>switchTo(s.id as Section)}><s.icon size={19}/>{s.label}</button>)}</nav>
      <div className="lexa-platform-sidebar-footer"><ShieldCheck size={18}/><div><strong>{profile.role.replaceAll('_',' ')}</strong><span>Restricted admin access</span></div></div>
    </aside>
    <main className="lexa-platform-main">
      <header className="lexa-platform-toolbar"><button className="lexa-platform-mobile-toggle" aria-label="Toggle admin menu" onClick={()=>setMobileOpen(x=>!x)}>{mobileOpen?<X/>:<Menu/>}</button><div><span className="lexa-platform-eyebrow">LEXA / PLATFORM</span><h1>{sections.find(s=>s.id===section)?.label}</h1></div><div className="lexa-platform-toolbar-actions"><button title="Refresh current section" onClick={reload} className="lexa-platform-round-button"><Activity size={18}/></button><Link to="/" className="lexa-platform-return">Business workspace</Link></div></header>
      <div className="lexa-platform-content">
        {loading&&<div role="status" className="lexa-platform-muted">Refreshing verified data…</div>}
        {error&&<SectionCard><div role="alert" className="lexa-platform-error">{error}</div><button onClick={reload} className="lexa-platform-button">Try again</button></SectionCard>}
        {section==='overview'&&summary&&<>
          <div className="lexa-platform-intro"><div><h2>Good day, Administrator</h2><p>Payments, subscription access and platform operations in one place.</p></div><span>Last checked {date(summary.checkedAt)}</span></div>
          <div className="lexa-platform-metrics">
            <div><Building2/><span>Registered businesses</span><strong>{summary.businesses.businesses}</strong><small>{summary.businesses.legacy} protected existing accounts</small></div>
            <div><CheckCircle2/><span>Paid active accounts</span><strong>{summary.businesses.active}</strong><small>{summary.businesses.pending} awaiting first activation</small></div>
            <div><CreditCard/><span>Pending payment reviews</span><strong>{summary.payments.submitted}</strong><small>Independent verification required</small></div>
            <div><CircleDollarSign/><span>Last 30 days collected</span><strong>{ugx(summary.payments.last_30_days)}</strong><small>Verified subscription periods only</small></div>
          </div>
          {(summary.incidentAlerts.critical>0||summary.incidentAlerts.high>0)&&<div className="lexa-platform-incident-banner" role="alert"><AlertTriangle size={22}/><div><strong>{summary.incidentAlerts.critical} critical and {summary.incidentAlerts.high} high-severity unresolved incidents</strong><p>Review platform incidents before routine administrative work.</p></div><button className="lexa-platform-table-action" onClick={()=>switchTo('incidents')}>Open incidents</button></div>}
          <div className="lexa-platform-two-col"><SectionCard title="Priority action queue"><div className="lexa-platform-action-list">
            <button onClick={()=>switchTo('payments')}><CreditCard/><div><strong>{summary.payments.submitted} payments awaiting verification</strong><span>Review claimed transfers and activate verified subscriptions</span></div></button>
            <button onClick={()=>switchTo('businesses')}><CalendarClock/><div><strong>{summary.businesses.expiring} subscriptions expire in seven days</strong><span>Check renewals and contact owners</span></div></button>
            <button onClick={()=>switchTo('support')}><HelpCircle/><div><strong>{summary.openSupportCases} unresolved support cases</strong><span>Respond to outstanding business issues</span></div></button>
          </div></SectionCard><SectionCard title="Cash and subscription snapshot"><dl className="lexa-platform-facts"><div><dt>Lifetime verified collections</dt><dd>{ugx(summary.payments.cash_collected)}</dd></div><div><dt>Confirmed paid subscriptions</dt><dd>{summary.businesses.active}</dd></div><div><dt>Expired paid accounts</dt><dd>{summary.businesses.expired}</dd></div><div><dt>Standard subscription</dt><dd>UGX 50,000 / 30 days</dd></div></dl></SectionCard></div>
        </>}
        {section==='businesses'&&<>
          <SectionCard title="Business account register"><div className="lexa-platform-controls"><label className="lexa-platform-search"><Search size={16}/><input aria-label="Search businesses" placeholder="Search by business or owner email" value={query} maxLength={120} onChange={e=>{setQuery(e.target.value);setBusinessPage(0);setUserPage(0);}}/></label><span className="lexa-platform-muted">50 accounts per page</span></div>
            <div className="lexa-platform-table-wrap"><table><thead><tr><th>Business</th><th>Account owner</th><th>Subscription</th><th>Paid through</th><th>Review</th></tr></thead><tbody>{businesses.map(b=><tr key={b.tenant_id}><td><strong>{b.business_name}</strong><small>{b.tenant_id.slice(0,8)}</small></td><td>{b.owner_email||'Not recorded'}</td><td>{state(b.status)}</td><td>{date(b.paid_through)}</td><td><button className="lexa-platform-table-action" onClick={()=>void openDetails(b)}>Details</button></td></tr>)}</tbody></table>{!businesses.length&&<div className="lexa-platform-empty">No businesses match the current search.</div>}</div><div className="lexa-platform-controls"><button className="lexa-platform-table-action" disabled={businessPage===0} onClick={()=>setBusinessPage(n=>n-1)}>Previous page</button><span className="lexa-platform-muted">Page {businessPage+1}</span><button className="lexa-platform-table-action" disabled={businesses.length<50} onClick={()=>setBusinessPage(n=>n+1)}>Next page</button></div>
          </SectionCard>
          {details&&<SectionCard title={`Account details — ${details.business.business_name}`}><div className="lexa-platform-row"><p>{details.business.owner_email||'Owner email unavailable'} · {state(details.business.status)}</p><button onClick={()=>setDetails(null)} className="lexa-platform-text-button">Close</button></div><p>Current paid-through date: <strong>{date(details.business.paid_through)}</strong></p><p>Verified subscription history: {details.periods.length} visible period(s)</p><div className="lexa-platform-history">{details.periods.map((p,i)=><div key={i}>{date(p.starts_at)} to {date(p.ends_at)} · {ugx(p.amount_ugx)}</div>)}</div>
            {profile.role==='super_admin'&&<div className="lexa-platform-controls">
              {details.business.status==='legacy'&&<button className="lexa-platform-danger" disabled={working} onClick={()=>{setAccessOperation({tenantId:details.business.tenant_id,businessName:details.business.business_name,mode:'enroll'});setAccessReason('');setAccessConfirmed(false);}}>Enrol in paid billing</button>}
              <button className="lexa-platform-danger" disabled={working||details.business.status==='suspended'} onClick={()=>{setAccessOperation({tenantId:details.business.tenant_id,businessName:details.business.business_name,mode:'suspended'});setAccessReason('');setAccessConfirmed(false);}}>Suspend access</button>
              <button className="lexa-platform-table-action" disabled={working||details.business.status!=='suspended'} onClick={()=>{setAccessOperation({tenantId:details.business.tenant_id,businessName:details.business.business_name,mode:'reinstate'});setAccessReason('');setAccessConfirmed(false);}}>Reinstate access</button>
            </div>}
            {accessOperation&&accessOperation.tenantId===details.business.tenant_id&&<div className="lexa-platform-review" role="group" aria-label="Confirm account access change">
              <h3>{accessOperation.mode==='enroll'?'Review transition to manual billing':accessOperation.mode==='suspended'?'Review account suspension':'Review account reinstatement'}</h3>
              <p><strong>{accessOperation.businessName}</strong> · {accessOperation.mode==='enroll'?'This existing business will become payment-pending until a verified payment is approved. Their records are preserved.':accessOperation.mode==='suspended'?'Business operations will be paused, without deleting data or changing its paid-through date.':'Access is restored only if the prior legacy entitlement or valid paid period permits it.'}</p>
              <label>Reason for the audit trail<textarea required value={accessReason} maxLength={400} rows={2} onChange={e=>setAccessReason(e.target.value)}/></label>
              <label className="lexa-platform-checkbox"><input type="checkbox" checked={accessConfirmed} onChange={e=>setAccessConfirmed(e.target.checked)}/> I have reviewed the effect on this business and authorized this change.</label>
              <div className="lexa-platform-controls"><button className="lexa-platform-danger" disabled={working||accessReason.trim().length<5||!accessConfirmed} onClick={()=>void takeAction(async()=>{if(accessOperation.mode==='enroll')await api.transitionLegacy(accessOperation.tenantId,accessReason);else await api.access(accessOperation.tenantId,accessOperation.mode,accessReason);setAccessOperation(null);setDetails(null);},'Account change saved and audited.')}>Confirm account change</button><button className="lexa-platform-text-button" onClick={()=>setAccessOperation(null)}>Cancel</button></div>
            </div>}
          </SectionCard>}
        </>}
        {section==='users'&&<SectionCard title="Account user directory">
          <p className="lexa-platform-muted">Limited membership metadata only. Passwords, private business transactions and security secrets are not exposed. Employee roles remain controlled by each business owner.</p>
          <div className="lexa-platform-controls"><label className="lexa-platform-search"><Search size={16}/><input aria-label="Search platform users" placeholder="Search email, person or business" maxLength={120} value={query} onChange={e=>{setQuery(e.target.value);setBusinessPage(0);setUserPage(0);}}/></label><span className="lexa-platform-muted">50 directory entries per page</span></div>
          <div className="lexa-platform-table-wrap"><table><thead><tr><th>User</th><th>Business</th><th>Business role</th><th>Status</th><th>Joined</th></tr></thead><tbody>{users.map(u=><tr key={`${u.tenant_id}-${u.user_id}`}><td><strong>{u.display_name||'Name not provided'}</strong><small>{u.email}</small></td><td>{u.business_name}</td><td>{u.membership_role}</td><td>{state(u.membership_status.toLowerCase())}</td><td>{date(u.joined_at)}</td></tr>)}</tbody></table>{!users.length&&<div className="lexa-platform-empty">No directory entries for the current search.</div>}</div><div className="lexa-platform-controls"><button className="lexa-platform-table-action" disabled={userPage===0} onClick={()=>setUserPage(n=>n-1)}>Previous page</button><span className="lexa-platform-muted">Page {userPage+1}</span><button className="lexa-platform-table-action" disabled={users.length<50} onClick={()=>setUserPage(n=>n+1)}>Next page</button></div>
        </SectionCard>}
        {section==='payments'&&<>
          <SectionCard title="Verify manual payments"><div className="lexa-platform-controls"><label>Review status <select value={paymentFilter} onChange={e=>setPaymentFilter(e.target.value)}><option value="submitted">Submitted for review</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label><span className="lexa-platform-muted">Screenshots and messages are not proof of cleared funds. Verify in the recipient's account.</span></div>
            <div className="lexa-platform-table-wrap"><table><thead><tr><th>Business</th><th>Claimed payment</th><th>Reference</th><th>Submitted</th><th>Decision</th></tr></thead><tbody>{payments.map(p=><tr key={p.id}><td><strong>{p.business_name}</strong><small>{p.owner_email||'—'}</small></td><td>{ugx(p.amount_ugx)}<small>{p.method.replaceAll('_',' ')}</small></td><td>{p.transaction_reference||'Message only'}<small>{p.payment_reference}</small></td><td>{date(p.created_at)}</td><td>{p.status==='submitted'&&['super_admin','billing_manager'].includes(profile.role)?<button className="lexa-platform-table-action" onClick={()=>{setReview(p);setVerifiedReference(p.transaction_reference||'');setReviewNote('');setReceiptConfirmed(false);}}>Review</button>:state(p.status)}</td></tr>)}</tbody></table>{!payments.length&&<div className="lexa-platform-empty">No payment submissions match this filter.</div>}</div>
          </SectionCard>
          {review&&<SectionCard title={`Verify payment — ${review.business_name}`}><div className="lexa-platform-review"><p><strong>Claimed amount:</strong> {ugx(review.amount_ugx)} · {review.method.replaceAll('_',' ')}</p><p><strong>Customer transaction reference:</strong> {review.transaction_reference||'None provided'}</p><p><strong>Message:</strong> {review.claim_message||'Not supplied'}</p><p><strong>Internal payment request:</strong> {review.payment_reference}</p><p className="lexa-platform-instructions">Check the actual receiving bank/mobile-money account before authorizing. No screenshot or text may bypass this step.</p>
            <label>Independently verified provider receipt reference<input value={verifiedReference} required maxLength={120} onChange={e=>setVerifiedReference(e.target.value)} placeholder="Confirmed in recipient's account"/></label><label>Internal review note<textarea value={reviewNote} rows={2} maxLength={500} onChange={e=>setReviewNote(e.target.value)}/></label><label className="lexa-platform-checkbox"><input type="checkbox" checked={receiptConfirmed} onChange={e=>setReceiptConfirmed(e.target.checked)}/> I independently verified that UGX 50,000 arrived in the official receiving account.</label><div className="lexa-platform-controls"><button className="lexa-platform-button" disabled={working||!receiptConfirmed||!verifiedReference.trim()} onClick={()=>void takeAction(()=>api.approve(review.id,verifiedReference,reviewNote),'Payment approved. Subscription activated or renewed for 30 days.')}>Confirm payment & activate</button><button className="lexa-platform-danger" disabled={working||!reviewNote.trim()} onClick={()=>void takeAction(()=>api.reject(review.id,reviewNote),'Payment submission rejected with reason.')}>Reject with reason</button><button className="lexa-platform-text-button" onClick={()=>setReview(null)}>Cancel</button></div>
          </div></SectionCard>}
        </>}
        {section==='revenue'&&revenue&&<>
          <div className="lexa-platform-metrics"><div><CircleDollarSign/><span>Total verified collections</span><strong>{ugx(revenue.totals.total)}</strong><small>Historical recorded subscription payments</small></div><div><BarChart3/><span>Last 30 days</span><strong>{ugx(revenue.totals.last_30_days)}</strong><small>Confirmed, not projected</small></div><div><CreditCard/><span>Verified payments</span><strong>{revenue.totals.payments}</strong><small>Approved subscription records</small></div><div><CalendarClock/><span>Plan</span><strong>{ugx(revenue.priceUGX)}</strong><small>Exactly 30 days per period</small></div></div>
          <SectionCard title="Verified cash collection history"><p className="lexa-platform-muted">Amounts shown are confirmed subscription payments, not customer ERP sales or speculative revenue.</p><div className="lexa-platform-chart" role="img" aria-label="Subscription collections by day in the last 60 days">{revenue.trend.map(d=><div key={d.day} className="lexa-platform-chart-row"><span>{d.day}</span><div><i style={{width:`${Math.max(1,100*d.revenue/Math.max(50_000,...revenue.trend.map(x=>x.revenue)))}%`}}/></div><strong>{ugx(d.revenue)}</strong></div>)}{!revenue.trend.length&&<p>No verified subscription collections yet.</p>}</div></SectionCard>
        </>}
        {section==='health'&&health&&<>
          <div className="lexa-platform-intro"><div><h2>Operational intelligence</h2><p>Evidence-based status, not simulated health reports.</p></div><span>Checked {date(health.checkedAt)}</span></div>
          <div className="lexa-platform-health-grid">{[
            ['LEXA backend API',health.api.status],['Neon connectivity',health.database.status],
            ['Render deployment metrics',health.render.status],['Vercel deployment metrics',health.vercel.status],
            ['Redis background jobs',health.redis.status],['ClamAV scanner',health.scanner.status],
            ['Dedicated worker',health.worker.status],['Sentry errors',health.observability.sentryConfigured?'configured':'not configured'],
            ['OpenTelemetry',health.observability.otelConfigured?'configured':'not configured']
          ].map(([name,status])=><div className="lexa-platform-health-tile" key={name}><Activity size={17}/><span>{name}</span>{state(status ?? 'unknown')}</div>)}</div>
          <SectionCard title="Urgent and recommended actions">{health.recommendations.length?health.recommendations.map((r,i)=><div key={i} className="lexa-platform-alert"><AlertTriangle size={19}/><div><strong>{r.title}</strong><p>{r.description}</p><small>Suggested action: {r.action}</small></div>{state(r.severity)}</div>):<p className="lexa-platform-muted">No issues detected in the currently connected health checks. External deployment monitoring is not connected.</p>}</SectionCard>
          <SectionCard title="Subscription priorities"><dl className="lexa-platform-facts"><div><dt>Payment reviews</dt><dd>{health.billing.pending_payment_reviews}</dd></div><div><dt>Oldest pending (hours)</dt><dd>{health.billing.oldest_payment_hours??'—'}</dd></div><div><dt>Expiring within 7 days</dt><dd>{health.billing.expiring}</dd></div></dl></SectionCard>
        </>}
        {section==='support'&&<SectionCard title="Customer support queue"><div className="lexa-platform-table-wrap"><table><thead><tr><th>Business</th><th>Case / description</th><th>Priority</th><th>Status</th><th>Action</th></tr></thead><tbody>{cases.map(c=><tr key={c.id}><td>{c.business_name}</td><td><strong>{c.subject}</strong><small>{c.description}</small></td><td>{state(c.priority)}</td><td>{state(c.status)}</td><td>{['super_admin','support_agent'].includes(profile.role)?<select aria-label={`Update support status for ${c.subject}`} value={c.status} disabled={working} onChange={e=>void takeAction(()=>api.supportStatus(c.id,e.target.value),'Support case status updated.')}><option value="open">Open</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option></select>:'Read only'}</td></tr>)}</tbody></table>{!cases.length&&<div className="lexa-platform-empty">No customer support cases have been submitted.</div>}</div></SectionCard>}
        {section==='incidents'&&<><SectionCard title="Platform incident register"><div className="lexa-platform-row"><p>Track investigations, owners and resolution history.</p>{['super_admin','operations_manager'].includes(profile.role)&&<button className="lexa-platform-button" onClick={()=>setNewIncidentOpen(x=>!x)}>Record incident</button>}</div>{newIncidentOpen&&<form className="lexa-platform-form" onSubmit={(e:FormEvent)=>{e.preventDefault();void takeAction(()=>api.createIncident({title:incidentTitle,description:incidentDescription,category:'operations',severity:incidentSeverity}),'Incident created.');setNewIncidentOpen(false);}}><label>Title<input value={incidentTitle} maxLength={140} required onChange={e=>setIncidentTitle(e.target.value)}/></label><label>Description<textarea value={incidentDescription} required maxLength={1500} onChange={e=>setIncidentDescription(e.target.value)}/></label><label>Severity<select value={incidentSeverity} onChange={e=>setIncidentSeverity(e.target.value)}><option>critical</option><option>high</option><option>medium</option><option>info</option></select></label><button className="lexa-platform-button" disabled={working}>Save incident</button></form>}
          <div className="lexa-platform-table-wrap"><table><thead><tr><th>Incident</th><th>Priority</th><th>Opened</th><th>Status</th></tr></thead><tbody>{incidents.map(i=><tr key={i.id}><td><strong>{i.title}</strong><small>{i.description}</small></td><td>{state(i.severity)}</td><td>{date(i.created_at)}</td><td>{['super_admin','operations_manager'].includes(profile.role)?<select aria-label={`Change status of ${i.title}`} disabled={working} value={i.status} onChange={e=>void takeAction(()=>api.incidentStatus(i.id,e.target.value),'Incident updated.')}><option value="open">Open</option><option value="acknowledged">Acknowledged</option><option value="resolved">Resolved</option></select>:state(i.status)}</td></tr>)}</tbody></table>{!incidents.length&&<div className="lexa-platform-empty">No platform incidents have been recorded.</div>}</div></SectionCard></>}
        {section==='audit'&&<SectionCard title="Immutable platform activity trail"><p className="lexa-platform-muted">Administrative payment and account actions. Changes cannot be erased through the runtime application.</p><div className="lexa-platform-table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>Business ID</th><th>Administrator</th></tr></thead><tbody>{audits.map(a=><tr key={a.id}><td>{date(a.created_at)}</td><td><strong>{a.action.replaceAll('.',' · ')}</strong></td><td>{a.tenant_id?.slice(0,12)||'Platform'}</td><td>{a.actor_user_id.slice(0,12)}</td></tr>)}</tbody></table>{!audits.length&&<div className="lexa-platform-empty">No platform administrative actions recorded yet.</div>}</div></SectionCard>}
        <footer className="lexa-platform-main-footer"><ShieldCheck size={15}/> LEXA Control Centre · Business account data remains tenant-isolated · UGX 50,000 per 30 days</footer>
      </div>
    </main>
  </div>;
}
