import { useCallback, useEffect, useMemo, useState, type ReactNode, type FormEvent } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, BellRing, Building2, CalendarClock,
  CheckCircle2, CircleDollarSign, CreditCard, FileClock, HeartPulse, HelpCircle,
  LayoutDashboard, LockKeyhole, Menu, Search, Shield, ShieldCheck, Sparkles, Wifi, Trash2, RotateCcw,
  TrendingUp, Users, UserPlus, LogOut, X,
} from 'lucide-react';
import {
  apiPlatformAdministration as api,
  apiPlatformAdministratorAuth as adminAuth,
  type PlatformAdminTeamMember, type PlatformRole,
  type PlatformProfile,
  type PlatformSummary,
  type PlatformBusiness,
  type PlatformUser,
  type PlatformPayment,
  type PlatformHealth,
  type PlatformRevenue,
  type PlatformSupportCase,
  type PlatformIncident,
  type PlatformAccountActivity,
  type PlatformAudit,
} from '../../data/remote/apiPlatformAdministration';
import { businessErrorMessage } from '../../data/remote/businessMessages';
import './platform-administration.css';

type Section = 'overview'|'businesses'|'users'|'activity'|'payments'|'revenue'|'health'|'support'|'incidents'|'audit'|'team';
type RevenueMode = 'revenue'|'payments';

const sections = [
  {id:'overview',label:'Overview',icon:LayoutDashboard,roles:['super_admin','billing_manager','auditor']},
  {id:'businesses',label:'Business accounts',icon:Building2,roles:['super_admin','billing_manager','support_agent','auditor']},
  {id:'users',label:'Users & access',icon:Users,roles:['super_admin','support_agent','auditor']},
  {id:'activity',label:'Live account activity',icon:Wifi,roles:['super_admin','operations_manager','auditor']},
  {id:'payments',label:'Payment approvals',icon:CreditCard,roles:['super_admin','billing_manager','auditor']},
  {id:'revenue',label:'Revenue reports',icon:BarChart3,roles:['super_admin','billing_manager','auditor']},
  {id:'health',label:'System health',icon:HeartPulse,roles:['super_admin','operations_manager','auditor']},
  {id:'support',label:'Support cases',icon:HelpCircle,roles:['super_admin','support_agent','billing_manager','auditor']},
  {id:'incidents',label:'Incidents',icon:AlertTriangle,roles:['super_admin','operations_manager','auditor']},
  {id:'audit',label:'Audit trail',icon:FileClock,roles:['super_admin','auditor']},
  {id:'team',label:'Admin team & invitations',icon:UserPlus,roles:['super_admin']},
] as const;

const ugx=(n:number|undefined)=>`UGX ${Number(n??0).toLocaleString('en-UG')}`;
const date=(value:string|null|undefined)=>value?new Date(value).toLocaleString('en-UG',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Kampala'}):'—';
const state=(s:string)=> <span className={`lexa-state lexa-state-${s.replace(/[^a-z]/g,'')}`}>{s.replaceAll('_',' ')}</span>;
const SectionCard=({children,title,action}:{children:ReactNode;title?:string;action?:ReactNode})=>
  <section className="lexa-platform-card">{title&&<div className="lexa-platform-card-header"><h2>{title}</h2>{action}</div>}{children}</section>;

function AccessShell({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children?: ReactNode }) {
  return (
    <main className="lexa-platform-access-shell">
      <div className="lexa-platform-access-orb lexa-platform-access-orb-a"/>
      <div className="lexa-platform-access-orb lexa-platform-access-orb-b"/>
      <section className="lexa-platform-access-card">
        <div className="lexa-platform-access-badge">LEXA CONTROL CENTRE</div>
        <div className="lexa-platform-access-icon">{icon}</div>
        <h1>{title}</h1>
        <p>{text}</p>
        <div className="lexa-platform-access-list">
          <div><ShieldCheck size={16}/><span>Protected platform administration</span></div>
          <div><CreditCard size={16}/><span>Manual payment reviews and activation</span></div>
          <div><HeartPulse size={16}/><span>System health and incident oversight</span></div>
        </div>
        <div className="lexa-platform-access-actions">{children}</div>
      </section>
    </main>
  );
}

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
  const [adminTeam,setAdminTeam]=useState<PlatformAdminTeamMember[]>([]);
  const [inviteEmail,setInviteEmail]=useState('');
  const [inviteRole,setInviteRole]=useState<PlatformRole>('super_admin');
  const [activity,setActivity]=useState<PlatformAccountActivity[]>([]);
  const [activityPage,setActivityPage]=useState(0);
  const [activityCheckedAt,setActivityCheckedAt]=useState<string|null>(null);
  const [details,setDetails]=useState<Awaited<ReturnType<typeof api.business>>|null>(null);
  const [paymentFilter,setPaymentFilter]=useState('submitted');
  const [payments,setPayments]=useState<PlatformPayment[]>([]);
  const [review,setReview]=useState<PlatformPayment|null>(null);
  const [verifiedReference,setVerifiedReference]=useState('');
  const [accessOperation,setAccessOperation]=useState<{tenantId:string;businessName:string;mode:'suspended'|'reinstate'|'enroll'|'archive'|'restore'}|null>(null);
  const [archiveConfirmName,setArchiveConfirmName]=useState('');
  const [manualActivation,setManualActivation]=useState<{tenantId:string;businessName:string}|null>(null);
  const [manualMethod,setManualMethod]=useState('mtn_momo');
  const [manualReceipt,setManualReceipt]=useState('');
  const [manualNote,setManualNote]=useState('');
  const [manualConfirmed,setManualConfirmed]=useState(false);
  const [accessReason,setAccessReason]=useState('');
  const [accessConfirmed,setAccessConfirmed]=useState(false);
  const [reviewNote,setReviewNote]=useState('');
  const [receiptConfirmed,setReceiptConfirmed]=useState(false);
  const [revenue,setRevenue]=useState<PlatformRevenue|null>(null);
  const [revenueMode,setRevenueMode]=useState<RevenueMode>('revenue');
  const [revenueDays,setRevenueDays]=useState<7|30|60>(30);
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
    void api.profile().then(p=>{
      if(active){
        setProfile(p);
        const first = sections.find(s => s.roles.some(r => r === p.role));
        if(first)setSection(first.id as Section);
      }
    })
      .catch(err=>{if(active)setAuthError(businessErrorMessage(err));})
      .finally(()=>{if(active)setLoadingProfile(false);});
    return ()=>{active=false;};
  },[]);

  const allowedSections=useMemo(()=>sections.filter(s=>profile&&s.roles.some(r=>r===profile.role)),[profile]);
  const reload=useCallback(()=>setRefresh(n=>n+1),[]);

  useEffect(()=>{const timer=window.setTimeout(()=>setSearchTerm(query),400);return()=>window.clearTimeout(timer);},[query]);

  useEffect(()=>{
    if(!profile||profile.requiresMfa)return;
    // Account activity is refreshed every 15 seconds while this browser tab is visible.
    // This does not promise notifications when the tab is closed or the API is offline.
    const interval=section==='activity' || (section==='overview' && profile.role==='super_admin') ? 15_000 : 60_000;
    const timer=window.setInterval(()=>{
      if(document.visibilityState==='visible' && ['overview','health','payments','activity','businesses','incidents'].includes(section))reload();
    },interval);
    return()=>window.clearInterval(timer);
  },[profile,section,reload]);

  useEffect(()=>{
    if(!profile||profile.requiresMfa||!allowedSections.some(s=>s.id===section))return;
    let active=true;
    setLoading(true);
    setError('');
    void (async()=>{
      try{
        if(section==='overview'){const res=await api.overview();if(active)setSummary(res);}
        if(section==='businesses'){const res=await api.businesses(searchTerm,businessPage*50);if(active)setBusinesses(res);}
        if(section==='users'){const res=await api.users(searchTerm,userPage*50);if(active)setUsers(res);}
        if(section==='activity'||(section==='overview' && profile.role==='super_admin')){const res=await api.activity(100,activityPage*100);if(active){setActivity(res);setActivityCheckedAt(new Date().toISOString());}}
        if(section==='payments'){const res=await api.payments(paymentFilter);if(active)setPayments(res);}
        if(section==='revenue'){const res=await api.revenue();if(active)setRevenue(res);}
        if(section==='health'){const res=await api.health();if(active)setHealth(res);}
        if(section==='support'){const res=await api.support();if(active)setCases(res);}
        if(section==='incidents'){const res=await api.incidents();if(active)setIncidents(res);}
        if(section==='audit'){const res=await api.audit();if(active)setAudits(res);}
        if(section==='team'){const res=await adminAuth.team();if(active)setAdminTeam(res);}
      }catch(err){if(active)setError(businessErrorMessage(err));}
      finally{if(active)setLoading(false);}
    })();
    return()=>{active=false;};
  },[profile,section,refresh,searchTerm,businessPage,userPage,paymentFilter,activityPage,allowedSections]);

  async function takeAction(action:()=>Promise<unknown>,success:string){
    setWorking(true);
    try{await action();toast.success(success);setReview(null);setReceiptConfirmed(false);setReviewNote('');reload();}
    catch(err){toast.error(businessErrorMessage(err));}
    finally{setWorking(false);}
  }

  async function openDetails(b:PlatformBusiness){
    try{const value=await api.business(b.tenant_id);setDetails(value);}catch(err){toast.error(businessErrorMessage(err));}
  }

  async function logoutAdmin(){
    try{await adminAuth.logout();window.location.assign('/platform-admin/login');}
    catch(err){toast.error(businessErrorMessage(err));}
  }

  function switchTo(next:Section){
    setSection(next);
    setMobileOpen(false);
    setDetails(null);
    setReview(null);
    setAccessOperation(null);
    setManualActivation(null);
    setArchiveConfirmName('');
    setQuery('');
    setSearchTerm('');
    setBusinessPage(0);
    setUserPage(0);
    setActivityPage(0);
  }

  const activeSectionTitle = sections.find(s=>s.id===section)?.label ?? 'LEXA Control Centre';
  const activeNow=activity.filter(item=>item.online_recently).length;
  const recentlyChangedIps=activity.filter(item=>item.ip_changed_at && Date.now()-new Date(item.ip_changed_at).getTime()<15*60_000).length;
  const highPriorityAlerts = health?.recommendations.filter(item => item.severity === 'high').length ?? 0;
  const unconnectedMonitoring = health ? [health.render.status, health.vercel.status].filter(status => status === 'not_connected').length : 0;
  const revenueTrend = useMemo(() => {
    // Kampala uses UTC+03:00 year-round; match the backend's local-day revenue groups.
    const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0,10);
    const todayStart = Date.parse(`${today}T00:00:00+03:00`);
    const cutoff = todayStart - (revenueDays - 1) * 86_400_000;
    return (revenue?.trend ?? []).filter(item => {
      const timestamp = Date.parse(`${item.day}T00:00:00+03:00`);
      return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= todayStart;
    });
  }, [revenue,revenueDays]);
  const maxRevenueValue = useMemo(()=>Math.max(1, ...revenueTrend.map(item=>revenueMode==='revenue' ? item.revenue : item.payments)),[revenueTrend,revenueMode]);
  const activeBusinesses = summary?.businesses.active ?? 0;
  const projectedCycleRevenue = activeBusinesses * (profile?.priceUGX ?? 50_000);
  const projectedAnnualRevenue = projectedCycleRevenue * 12;

  function exportRevenueCsv() {
    if (!revenue) return;
    const lines = ['Date,Verified collections (UGX),Approved payments', ...revenueTrend.map(item => {
      const day = item.day.replace(/[^0-9-]/g,'');
      return `${day},${Math.max(0, Number(item.revenue) || 0)},${Math.max(0, Number(item.payments) || 0)}`;
    })];
    const blob = new Blob([lines.join('\r\n')], { type:'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `lexa-verified-subscriptions-${revenueDays}-days.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  if(loadingProfile) return (
    <AccessShell icon={<Sparkles size={28}/>} title="Preparing the yellow command centre" text="LEXA is checking platform administrator access and applying the secure control-centre experience.">
      <div className="lexa-platform-loading-pill" role="status">Loading secure admin session…</div>
    </AccessShell>
  );

  if(authError||!profile) return (
    <AccessShell icon={<Shield size={30}/>} title="Platform administrator access" text={authError||'This account is not enrolled as a LEXA platform administrator.'}>
      <Link to="/platform-admin/login" className="lexa-platform-button lexa-platform-button-hero">Administrator sign-in</Link>
      <Link to="/" className="lexa-platform-text-button">Return to business workspace</Link>
    </AccessShell>
  );

  if(profile.requiresMfa) return (
    <AccessShell icon={<LockKeyhole size={30}/>} title="Authenticator verification required" text="LEXA Control Centre requires an enrolled authenticator before platform administration can continue.">
      <Link to="/account/security" className="lexa-platform-button lexa-platform-button-hero">Open account security</Link>
      <Link to="/platform-admin/login" className="lexa-platform-text-button">Sign in with another account</Link>
    </AccessShell>
  );

  return <div className="lexa-platform-app">
    <aside className={`lexa-platform-sidebar ${mobileOpen?'open':''}`} aria-label="LEXA Control Centre navigation">
      <div className="lexa-platform-sidebar-brand">
        <img src="/lexa-master-lockup-light.png" alt="LEXA"/>
        <span>CONTROL CENTRE</span>
      </div>
      <div className="lexa-platform-sidebar-caption">PLATFORM MANAGEMENT</div>
      <nav>
        {allowedSections.map(s=><button key={s.id} type="button" className={`lexa-platform-nav-item ${section===s.id?'active':''}`} onClick={()=>switchTo(s.id as Section)}><s.icon size={19}/>{s.label}</button>)}
      </nav>
      <div className="lexa-platform-sidebar-footer"><ShieldCheck size={18}/><div><strong>{profile.role.replaceAll('_',' ')}</strong><span>Private admin account</span></div></div>
    </aside>
    <main className="lexa-platform-main">
      <header className="lexa-platform-toolbar">
        <button className="lexa-platform-mobile-toggle" aria-label="Toggle admin menu" onClick={()=>setMobileOpen(x=>!x)}>{mobileOpen?<X/>:<Menu/>}</button>
        <div>
          <span className="lexa-platform-eyebrow">LEXA / PLATFORM</span>
          <h1>{activeSectionTitle}</h1>
        </div>
        <div className="lexa-platform-toolbar-pulse">
          <BellRing size={16}/>
          <span>{summary ? `${summary.payments.submitted} payment reviews · ${summary.businesses.expiring} expiring soon` : 'Monitoring platform activity'}</span>
        </div>
        <div className="lexa-platform-toolbar-actions">
          <button title="Refresh current section" onClick={reload} className="lexa-platform-round-button"><Activity size={18}/></button>
          <button type="button" className="lexa-platform-return lexa-admin-logout" onClick={()=>void logoutAdmin()}><LogOut size={16}/> Sign out</button>
        </div>
      </header>
      <div className="lexa-platform-content">
        {loading&&<div role="status" className="lexa-platform-muted">Refreshing verified data…</div>}
        {error&&<SectionCard><div role="alert" className="lexa-platform-error">{error}</div><button onClick={reload} className="lexa-platform-button">Try again</button></SectionCard>}

        {section==='overview'&&summary&&<>
          <section className="lexa-platform-hero">
            <div className="lexa-platform-hero-copy">
              <div className="lexa-platform-kicker"><Sparkles size={16}/> YELLOW COMMAND CENTRE</div>
              <h2>Good day, Administrator</h2>
              <p>Approve subscriptions, monitor platform health, follow revenue, and resolve urgent issues from one professional control centre.</p>
              <div className="lexa-platform-hero-actions">
                <button className="lexa-platform-button" onClick={()=>switchTo('payments')}>Review payment queue <ArrowRight size={16}/></button>
                <button className="lexa-platform-table-action" onClick={()=>switchTo('health')}>Open system health</button>
              </div>
            </div>
            <div className="lexa-platform-hero-panel">
              <div>
                <span>Standard subscription</span>
                <strong>{ugx(profile.priceUGX)}</strong>
                <small>Exactly {profile.periodDays} days per approved period</small>
              </div>
              <div>
                <span>Projected next paid cycle</span>
                <strong>{ugx(projectedCycleRevenue)}</strong>
                <small>{activeBusinesses} active businesses at the standard rate</small>
              </div>
              <div>
                <span>Annualised run-rate</span>
                <strong>{ugx(projectedAnnualRevenue)}</strong>
                <small>Illustrative if current active count remains steady</small>
              </div>
            </div>
          </section>

          <div className="lexa-platform-metrics">
            <div><Building2/><span>Registered businesses</span><strong>{summary.businesses.businesses}</strong><small>{summary.businesses.legacy} protected existing accounts</small></div>
            <div><CheckCircle2/><span>Paid active accounts</span><strong>{summary.businesses.active}</strong><small>{summary.businesses.pending} awaiting first activation</small></div>
            <div><CreditCard/><span>Pending payment reviews</span><strong>{summary.payments.submitted}</strong><small>Independent verification required</small></div>
            <div><CircleDollarSign/><span>Last 30 days collected</span><strong>{ugx(summary.payments.last_30_days)}</strong><small>Verified subscription periods only</small></div>
          </div>

          {(summary.incidentAlerts.critical>0||summary.incidentAlerts.high>0)&&<div className="lexa-platform-incident-banner" role="alert"><AlertTriangle size={22}/><div><strong>{summary.incidentAlerts.critical} critical and {summary.incidentAlerts.high} high-severity unresolved incidents</strong><p>Review platform incidents before routine administrative work.</p></div><button className="lexa-platform-table-action" onClick={()=>switchTo('incidents')}>Open incidents</button></div>}

          {profile.role==='super_admin'&&<div className="lexa-platform-live-summary" role="status">
            <Wifi size={18}/><div><strong>{activeNow} business users recently active</strong><span>Server-observed activity over the last five minutes. {recentlyChangedIps>0?`${recentlyChangedIps} IP change(s) require a contextual review.`:'No recent IP changes in the returned records.'}</span></div>
            <button className="lexa-platform-table-action" onClick={()=>switchTo('activity')}>Open activity monitor <ArrowRight size={15}/></button>
          </div>}
          <div className="lexa-platform-three-col">
            <SectionCard title="Priority action queue">
              <div className="lexa-platform-action-list">
                <button onClick={()=>switchTo('payments')}><CreditCard/><div><strong>{summary.payments.submitted} payments awaiting verification</strong><span>Review claimed transfers and activate verified subscriptions without delay.</span></div></button>
                <button onClick={()=>switchTo('businesses')}><CalendarClock/><div><strong>{summary.businesses.expiring} subscriptions expire in seven days</strong><span>Contact owners early and reduce avoidable service interruptions.</span></div></button>
                <button onClick={()=>switchTo('support')}><HelpCircle/><div><strong>{summary.openSupportCases} unresolved support cases</strong><span>Support teams can triage urgent questions and coordinate follow-up.</span></div></button>
              </div>
            </SectionCard>
            <SectionCard title="Account distribution">
              <div className="lexa-platform-stack-chart">
                {[
                  ['Active',summary.businesses.active,'active'],
                  ['Pending',summary.businesses.pending,'pending'],
                  ['Expiring soon',summary.businesses.expiring,'medium'],
                  ['Expired',summary.businesses.expired,'high'],
                  ['Legacy',summary.businesses.legacy,'legacy'],
                ].map(([label,value,tone])=><div key={label} className="lexa-platform-stack-row"><span>{label}</span><div><i className={`tone-${tone}`} style={{width:`${summary.businesses.businesses?Math.max(6,Number(value)*100/summary.businesses.businesses):6}%`}}/></div><strong>{value}</strong></div>)}
              </div>
            </SectionCard>
            <SectionCard title="Executive snapshot">
              <dl className="lexa-platform-facts">
                <div><dt>Lifetime verified collections</dt><dd>{ugx(summary.payments.cash_collected)}</dd></div>
                <div><dt>Confirmed paid subscriptions</dt><dd>{summary.businesses.active}</dd></div>
                <div><dt>Expired paid accounts</dt><dd>{summary.businesses.expired}</dd></div>
                <div><dt>Standard subscription</dt><dd>UGX 50,000 / 30 days</dd></div>
              </dl>
            </SectionCard>
          </div>
        </>}

        {section==='businesses'&&<>
          <SectionCard title="Business account register" action={<span className="lexa-platform-muted">50 accounts per page</span>}>
            <div className="lexa-platform-controls"><label className="lexa-platform-search"><Search size={16}/><input aria-label="Search businesses" placeholder="Search by business or owner email" value={query} maxLength={120} onChange={e=>{setQuery(e.target.value);setBusinessPage(0);setUserPage(0);}}/></label></div>
            <div className="lexa-platform-table-wrap"><table><thead><tr><th>Business</th><th>Account owner</th><th>Subscription</th><th>Paid through</th><th>Review</th></tr></thead><tbody>{businesses.map(b=><tr key={b.tenant_id}><td><strong>{b.business_name}</strong><small>{b.tenant_id.slice(0,8)}</small></td><td>{b.owner_email||'Not recorded'}</td><td>{state(b.status)}</td><td>{date(b.paid_through)}</td><td><button className="lexa-platform-table-action" onClick={()=>void openDetails(b)}>Details</button></td></tr>)}</tbody></table>{!businesses.length&&<div className="lexa-platform-empty">No businesses match the current search.</div>}</div>
            <div className="lexa-platform-controls"><button className="lexa-platform-table-action" disabled={businessPage===0} onClick={()=>setBusinessPage(n=>n-1)}>Previous page</button><span className="lexa-platform-muted">Page {businessPage+1}</span><button className="lexa-platform-table-action" disabled={businesses.length<50} onClick={()=>setBusinessPage(n=>n+1)}>Next page</button></div>
          </SectionCard>
          {details&&<SectionCard title={`Account details — ${details.business.business_name}`} action={<button onClick={()=>setDetails(null)} className="lexa-platform-text-button">Close</button>}>
            <div className="lexa-platform-detail-banner">
              <div>
                <span>{details.business.owner_email||'Owner email unavailable'}</span>
                <strong>{date(details.business.paid_through)}</strong>
                <small>Current paid-through date</small>
              </div>
              <div>{state(details.business.status)}</div>
            </div>
            <p>Verified subscription history: {details.periods.length} visible period(s)</p>
            <div className="lexa-platform-history">{details.periods.map((p,i)=><div key={i}>{date(p.starts_at)} to {date(p.ends_at)} · {ugx(p.amount_ugx)}</div>)}</div>
            {['super_admin','billing_manager'].includes(profile.role) && !['legacy','suspended','archived'].includes(details.business.status)&&<div className="lexa-platform-controls">
              <button className="lexa-platform-button" disabled={working} onClick={()=>{setManualActivation({tenantId:details.business.tenant_id,businessName:details.business.business_name});setAccessOperation(null);setManualReceipt('');setManualNote('');setManualConfirmed(false);}}>Record verified payment & activate / renew</button>
            </div>}
            {manualActivation?.tenantId===details.business.tenant_id&&<div className="lexa-platform-review lexa-platform-activation-panel" role="group" aria-label="Record verified subscription payment">
              <h3>Verify actual receipt for {manualActivation.businessName}</h3>
              <p>LEXA Standard is UGX 50,000 for 30 days. This action records a confirmed offline payment and activates or renews the account in one audited transaction.</p>
              <label>Verified payment method<select value={manualMethod} onChange={e=>setManualMethod(e.target.value)}><option value="mtn_momo">MTN Mobile Money</option><option value="airtel_money">Airtel Money</option><option value="bank_transfer">Bank transfer</option><option value="other">Other verified method</option></select></label>
              <label>Provider transaction reference<input value={manualReceipt} onChange={e=>setManualReceipt(e.target.value)} maxLength={120} required placeholder="Reference independently confirmed in the receiving account"/></label>
              <label>Verification note<textarea rows={2} maxLength={500} value={manualNote} onChange={e=>setManualNote(e.target.value)} placeholder="Which official account and payment information were checked?"/></label>
              <label className="lexa-platform-checkbox"><input type="checkbox" checked={manualConfirmed} onChange={e=>setManualConfirmed(e.target.checked)}/> I independently confirmed UGX 50,000 arrived in the official receiving account.</label>
              <div className="lexa-platform-controls"><button type="button" className="lexa-platform-button" disabled={working||!manualConfirmed||manualReceipt.trim().length<4||manualNote.trim().length<5} onClick={()=>void takeAction(async()=>{await api.activateWithVerifiedPayment(manualActivation.tenantId,manualMethod,manualReceipt,manualNote);setManualActivation(null);setDetails(null);},'Verified payment recorded. Account activated or renewed for 30 days.')}>Confirm & activate for 30 days</button><button className="lexa-platform-text-button" onClick={()=>setManualActivation(null)}>Cancel</button></div>
            </div>}
            {profile.role==='super_admin'&&<div className="lexa-platform-controls">
              {details.business.status==='legacy'&&<button className="lexa-platform-danger" disabled={working} onClick={()=>{setAccessOperation({tenantId:details.business.tenant_id,businessName:details.business.business_name,mode:'enroll'});setAccessReason('');setAccessConfirmed(false);}}>Enrol in paid billing</button>}
              <button className="lexa-platform-danger" disabled={working||['suspended','archived'].includes(details.business.status)} onClick={()=>{setAccessOperation({tenantId:details.business.tenant_id,businessName:details.business.business_name,mode:'suspended'});setAccessReason('');setAccessConfirmed(false);}}>Suspend access</button>
              <button className="lexa-platform-table-action" disabled={working||details.business.status!=='suspended'} onClick={()=>{setAccessOperation({tenantId:details.business.tenant_id,businessName:details.business.business_name,mode:'reinstate'});setAccessReason('');setAccessConfirmed(false);}}>Reinstate access</button>
              {details.business.status==='archived'?<button className="lexa-platform-table-action" onClick={()=>{setAccessOperation({tenantId:details.business.tenant_id,businessName:details.business.business_name,mode:'restore'});setAccessReason('');setAccessConfirmed(false);}}>Restore archived account</button>:
              <button className="lexa-platform-danger" disabled={working} onClick={()=>{setAccessOperation({tenantId:details.business.tenant_id,businessName:details.business.business_name,mode:'archive'});setAccessReason('');setAccessConfirmed(false);setArchiveConfirmName('');}}>Delete / archive account <Trash2 size={14}/></button>}
            </div>}
            {accessOperation&&accessOperation.tenantId===details.business.tenant_id&&<div className="lexa-platform-review" role="group" aria-label="Confirm account access change">
              <h3>{accessOperation.mode==='enroll'?'Review transition to manual billing':accessOperation.mode==='suspended'?'Review account suspension':accessOperation.mode==='archive'?'Archive account (reversible)':accessOperation.mode==='restore'?'Restore account':'Review account reinstatement'}</h3>
              <p><strong>{accessOperation.businessName}</strong> · {accessOperation.mode==='enroll'?'This existing business will become payment-pending until a verified payment is approved. Its records remain stored.':accessOperation.mode==='suspended'?'Operational access pauses; no business records or paid time are removed.':accessOperation.mode==='archive'?'The account will immediately lose operational access, but its stock, sales, audit, payment and user records will be preserved. This is not permanent erasure.':accessOperation.mode==='restore'?'Restore the archived account without granting unpaid time or bypassing its previous suspension.':'Access is restored only if the legacy entitlement or valid paid period permits it.'}</p>
              {accessOperation.mode==='archive'&&<label>Type the exact business name to confirm archival<input aria-label="Type business name to confirm archive" value={archiveConfirmName} onChange={e=>setArchiveConfirmName(e.target.value)} maxLength={300} placeholder={accessOperation.businessName}/></label>}
              <label>Reason for the audit trail<textarea required value={accessReason} maxLength={400} rows={2} onChange={e=>setAccessReason(e.target.value)}/></label>
              <label className="lexa-platform-checkbox"><input type="checkbox" checked={accessConfirmed} onChange={e=>setAccessConfirmed(e.target.checked)}/> I have reviewed the effect on this business and authorized this change.</label>
              <div className="lexa-platform-controls"><button className="lexa-platform-danger" disabled={working||accessReason.trim().length<5||!accessConfirmed||(accessOperation.mode==='archive'&&archiveConfirmName!==accessOperation.businessName)} onClick={()=>void takeAction(async()=>{
                if(accessOperation.mode==='enroll')await api.transitionLegacy(accessOperation.tenantId,accessReason);
                else if(accessOperation.mode==='archive')await api.archive(accessOperation.tenantId,archiveConfirmName,accessReason);
                else if(accessOperation.mode==='restore')await api.restore(accessOperation.tenantId,accessReason);
                else await api.access(accessOperation.tenantId,accessOperation.mode,accessReason);
                setAccessOperation(null);setDetails(null);
              },'Account change saved and audited.')}>Confirm account change</button><button className="lexa-platform-text-button" onClick={()=>setAccessOperation(null)}>Cancel</button></div>
            </div>}
          </SectionCard>}
        </>}

        {section==='activity'&&<>
          <section className="lexa-platform-live-header">
            <div><div className="lexa-platform-kicker"><Wifi size={16}/> PLATFORM ACCOUNT ACTIVITY</div><h2>Live account oversight</h2><p>Server-observed business activity refreshes every 15 seconds while this console is open. IP changes are signals for investigation, not automatic proof of fraud.</p></div>
            <div className="lexa-platform-live-count"><strong>{activeNow}</strong><span>Recently active in this page</span></div>
          </section>
          <div className="lexa-platform-metrics">
            <div><Wifi/><span>Recently active users</span><strong>{activeNow}</strong><small>Successful API requests · this page</small></div>
            <div><Activity/><span>Observed accounts</span><strong>{new Set(activity.map(a=>a.tenant_id)).size}</strong><small>Business accounts on this page</small></div>
            <div><AlertTriangle/><span>IP changes in 15 minutes</span><strong>{recentlyChangedIps}</strong><small>Check context before taking action</small></div>
            <div><ShieldCheck/><span>Polling interval</span><strong>15s</strong><small>Page {activityPage+1} · Checked {date(activityCheckedAt)}</small></div>
          </div>
          <SectionCard title="Recent user activity" action={<button className="lexa-platform-table-action" onClick={reload}><RotateCcw size={15}/> Refresh now</button>}>
            <p className="lexa-platform-muted">IP values come from the API's observed network peer. A hosting proxy may appear here unless validated proxy trust has been configured. Never treat IP matching as authorization.</p>
            <div className="lexa-platform-table-wrap"><table><thead><tr><th>Business / user</th><th>Subscription</th><th>Observed IP</th><th>Last request</th><th>Activity</th></tr></thead><tbody>{activity.map(a=><tr key={`${a.tenant_id}-${a.user_id}`}><td><strong>{a.business_name}</strong><small>{a.display_name||a.email||'Business user'}</small></td><td>{state(a.subscription_status)}</td><td><strong className="lexa-platform-ip-value">{a.observed_ip||'Unavailable'}</strong>{a.previous_ip&&<small>Previous: {a.previous_ip}</small>}{a.ip_changed_at&&Date.now()-new Date(a.ip_changed_at).getTime()<15*60_000&&<small className="lexa-platform-ip-warning">Recent IP change · review</small>}</td><td>{date(a.last_seen_at)}</td><td>{a.online_recently?state('active'):state('inactive')}<small>{a.request_count} observed updates · {a.last_activity_kind.replaceAll('_',' ')}</small>{a.review_restricted_activity&&<small className="lexa-platform-ip-warning">Restricted-operation signal — investigate immediately</small>}</td></tr>)}</tbody></table>{!activity.length&&<div className="lexa-platform-empty">No authenticated business activity has been recorded since the activity register was enabled.</div>}</div>
            <div className="lexa-platform-controls"><button className="lexa-platform-table-action" disabled={activityPage===0} onClick={()=>setActivityPage(page=>page-1)}>Previous activity page</button><span className="lexa-platform-muted">Page {activityPage+1} · 100 records per page</span><button className="lexa-platform-table-action" disabled={activity.length<100} onClick={()=>setActivityPage(page=>page+1)}>Next activity page</button></div>
          </SectionCard>
        </>}
        {section==='users'&&<SectionCard title="Account user directory">
          <p className="lexa-platform-muted">Limited membership metadata only. Passwords, private business transactions and security secrets are not exposed. Employee roles remain controlled by each business owner.</p>
          <div className="lexa-platform-controls"><label className="lexa-platform-search"><Search size={16}/><input aria-label="Search users" placeholder="Search by user, email, or business" value={query} maxLength={120} onChange={e=>{setQuery(e.target.value);setBusinessPage(0);setUserPage(0);}}/></label></div>
          <div className="lexa-platform-table-wrap"><table><thead><tr><th>User</th><th>Business</th><th>Role</th><th>Status</th><th>Joined</th></tr></thead><tbody>{users.map(u=><tr key={`${u.tenant_id}-${u.user_id}`}><td><strong>{u.display_name||'No display name'}</strong><small>{u.email}</small></td><td>{u.business_name}</td><td>{state(u.membership_role)}</td><td>{state(u.membership_status)}</td><td>{date(u.joined_at)}</td></tr>)}</tbody></table>{!users.length&&<div className="lexa-platform-empty">No user records match the current search.</div>}</div>
          <div className="lexa-platform-controls"><button className="lexa-platform-table-action" disabled={userPage===0} onClick={()=>setUserPage(n=>n-1)}>Previous page</button><span className="lexa-platform-muted">Page {userPage+1}</span><button className="lexa-platform-table-action" disabled={users.length<50} onClick={()=>setUserPage(n=>n+1)}>Next page</button></div>
        </SectionCard>}

        {section==='payments'&&<>
          <SectionCard title="Payment review inbox" action={<select aria-label="Filter payment submissions" value={paymentFilter} onChange={e=>setPaymentFilter(e.target.value)}><option value="submitted">Awaiting verification</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>}>
            <p className="lexa-platform-muted">Only verified money received in the official account may activate or renew a subscription. Screenshots and messages support review but never bypass verification.</p>
            <div className="lexa-platform-table-wrap"><table><thead><tr><th>Business</th><th>Amount</th><th>Reference</th><th>Submitted</th><th>Decision</th></tr></thead><tbody>{payments.map(p=><tr key={p.id}><td><strong>{p.business_name}</strong><small>{p.owner_email||'—'}</small></td><td>{ugx(p.amount_ugx)}<small>{p.method.replaceAll('_',' ')}</small></td><td>{p.transaction_reference||'Message only'}<small>{p.payment_reference}</small></td><td>{date(p.created_at)}</td><td>{p.status==='submitted'&&['super_admin','billing_manager'].includes(profile.role)?<button className="lexa-platform-table-action" onClick={()=>{setReview(p);setVerifiedReference(p.transaction_reference||'');setReviewNote('');setReceiptConfirmed(false);}}>Review</button>:state(p.status)}</td></tr>)}</tbody></table>{!payments.length&&<div className="lexa-platform-empty">No payment submissions match this filter.</div>}</div>
          </SectionCard>
          {review&&<SectionCard title={`Verify payment — ${review.business_name}`}><div className="lexa-platform-review"><p><strong>Claimed amount:</strong> {ugx(review.amount_ugx)} · {review.method.replaceAll('_',' ')}</p><p><strong>Customer transaction reference:</strong> {review.transaction_reference||'None provided'}</p><p><strong>Message:</strong> {review.claim_message||'Not supplied'}</p><p><strong>Internal payment request:</strong> {review.payment_reference}</p><p className="lexa-platform-instructions">Check the actual receiving bank or mobile-money account before authorizing. No screenshot or text may bypass this step.</p>
            <label>Independently verified provider receipt reference<input value={verifiedReference} required maxLength={120} onChange={e=>setVerifiedReference(e.target.value)} placeholder="Confirmed in recipient's account"/></label><label>Internal review note<textarea value={reviewNote} rows={2} maxLength={500} onChange={e=>setReviewNote(e.target.value)}/></label><label className="lexa-platform-checkbox"><input type="checkbox" checked={receiptConfirmed} onChange={e=>setReceiptConfirmed(e.target.checked)}/> I independently verified that UGX 50,000 arrived in the official receiving account.</label><div className="lexa-platform-controls"><button className="lexa-platform-button" disabled={working||!receiptConfirmed||!verifiedReference.trim()} onClick={()=>void takeAction(()=>api.approve(review.id,verifiedReference,reviewNote),'Payment approved. Subscription activated or renewed for 30 days.')}>Confirm payment & activate</button><button className="lexa-platform-danger" disabled={working||!reviewNote.trim()} onClick={()=>void takeAction(()=>api.reject(review.id,reviewNote),'Payment submission rejected with reason.')}>Reject with reason</button><button className="lexa-platform-text-button" onClick={()=>setReview(null)}>Cancel</button></div>
          </div></SectionCard>}
        </>}

        {section==='revenue'&&revenue&&<>
          <div className="lexa-platform-metrics"><div><CircleDollarSign/><span>Total verified collections</span><strong>{ugx(revenue.totals.total)}</strong><small>Historical recorded subscription payments</small></div><div><BarChart3/><span>Last 30 days</span><strong>{ugx(revenue.totals.last_30_days)}</strong><small>Confirmed, not projected</small></div><div><CreditCard/><span>Verified payments</span><strong>{revenue.totals.payments}</strong><small>Approved subscription records</small></div><div><TrendingUp/><span>Plan</span><strong>{ugx(revenue.priceUGX)}</strong><small>Exactly 30 days per period</small></div></div>
          <div className="lexa-platform-two-col">
            <SectionCard title="Verified cash collection history" action={<div className="lexa-platform-chart-actions"><label className="lexa-platform-muted" htmlFor="lexa-revenue-range">Period</label><select id="lexa-revenue-range" value={revenueDays} onChange={event=>setRevenueDays(Number(event.target.value) as 7|30|60)}><option value={7}>7 days</option><option value={30}>30 days</option><option value={60}>60 days</option></select><div className="lexa-platform-segmented"><button type="button" className={revenueMode==='revenue'?'active':''} onClick={()=>setRevenueMode('revenue')}>Revenue</button><button type="button" className={revenueMode==='payments'?'active':''} onClick={()=>setRevenueMode('payments')}>Payments</button></div><button type="button" className="lexa-platform-table-action" onClick={exportRevenueCsv} disabled={!revenueTrend.length}>Export CSV</button></div>}>
              <p className="lexa-platform-muted">Amounts shown are confirmed subscription payments, not customer ERP sales or speculative revenue.</p>
              <div className="lexa-platform-chart" role="group" aria-label={`Verified subscription ${revenueMode} over ${revenueDays} days`}>{revenueTrend.map(d=>{
                const value = revenueMode==='revenue' ? d.revenue : d.payments;
                const label = revenueMode==='revenue' ? ugx(d.revenue) : `${d.payments} payment${d.payments===1?'':'s'}`;
                return <div key={d.day} className="lexa-platform-chart-row"><span>{d.day}</span><div><i style={{width:`${Math.max(1,100*value/maxRevenueValue)}%`}}/></div><strong>{label}</strong></div>;
              })}{!revenueTrend.length&&<p>No verified subscription collections in the selected period.</p>}</div>
            </SectionCard>
            <SectionCard title="Collection outlook">
              <dl className="lexa-platform-facts">
                <div><dt>Expected next paid cycle</dt><dd>{summary ? ugx(projectedCycleRevenue) : 'See overview'}</dd></div>
                <div><dt>Illustrative annualised run-rate</dt><dd>{summary ? ugx(projectedAnnualRevenue) : 'See overview'}</dd></div>
                <div><dt>Average realised per payment</dt><dd>{revenue.totals.payments ? ugx(revenue.totals.total / revenue.totals.payments) : '—'}</dd></div>
                <div><dt>Unverified submissions</dt><dd>{summary?.payments.submitted ?? '—'}</dd></div>
              </dl>
            </SectionCard>
          </div>
        </>}

        {section==='health'&&health&&<>
          <section className="lexa-platform-health-hero">
            <div>
              <div className="lexa-platform-kicker"><HeartPulse size={16}/> VERIFIED PLATFORM HEALTH</div>
              <h2>Operational intelligence</h2>
              <p>Evidence-based status, not simulated monitoring. Administrators can focus on the issues that require action now.</p>
            </div>
            <div className="lexa-platform-score-card">
              <span>Actionable alerts from connected checks</span>
              <strong>{highPriorityAlerts}</strong>
              <span>High-priority recommendations</span>
              <small>{unconnectedMonitoring} deployment metric connection(s) unavailable · Checked {date(health.checkedAt)}</small>
            </div>
          </section>
          <div className="lexa-platform-health-grid">{[
            ['LEXA backend API',health.api.status],['Neon connectivity',health.database.status],
            ['Render deployment metrics',health.render.status],['Vercel deployment metrics',health.vercel.status],
            ['Redis background jobs',health.redis.status],['ClamAV scanner',health.scanner.status],
            ['Dedicated worker',health.worker.status],['Sentry errors',health.observability.sentryConfigured?'configured':'not configured'],
            ['OpenTelemetry',health.observability.otelConfigured?'configured':'not configured']
          ].map(([name,status])=><div className="lexa-platform-health-tile" key={name}><Activity size={17}/><span>{name}</span>{state(status || 'unknown')}</div>)}</div>
          <SectionCard title="Urgent and recommended actions">{health.recommendations.length?health.recommendations.map((r,i)=><div key={i} className="lexa-platform-alert"><AlertTriangle size={19}/><div><strong>{r.title}</strong><p>{r.description}</p><small>Suggested action: {r.action}</small></div>{state(r.severity)}</div>):<p className="lexa-platform-muted">No issues detected in the currently connected health checks. External deployment monitoring is not connected.</p>}</SectionCard>
          <SectionCard title="Subscription priorities"><dl className="lexa-platform-facts"><div><dt>Payment reviews</dt><dd>{health.billing.pending_payment_reviews}</dd></div><div><dt>Oldest pending (hours)</dt><dd>{health.billing.oldest_payment_hours ?? '—'}</dd></div><div><dt>Expiring within 7 days</dt><dd>{health.billing.expiring}</dd></div></dl></SectionCard>
        </>}

        {section==='support'&&<SectionCard title="Customer support queue"><div className="lexa-platform-table-wrap"><table><thead><tr><th>Business</th><th>Case / description</th><th>Priority</th><th>Status</th><th>Action</th></tr></thead><tbody>{cases.map(c=><tr key={c.id}><td>{c.business_name}</td><td><strong>{c.subject}</strong><small>{c.description}</small></td><td>{state(c.priority)}</td><td>{state(c.status)}</td><td>{['super_admin','support_agent'].includes(profile.role)?<select aria-label={`Update support status for ${c.subject}`} value={c.status} disabled={working} onChange={e=>void takeAction(()=>api.supportStatus(c.id,e.target.value),'Support case status updated.')}><option value="open">Open</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option></select>:'Read only'}</td></tr>)}</tbody></table>{!cases.length&&<div className="lexa-platform-empty">No customer support cases have been submitted.</div>}</div></SectionCard>}

        {section==='incidents'&&<><SectionCard title="Platform incident register" action={['super_admin','operations_manager'].includes(profile.role)?<button className="lexa-platform-button" onClick={()=>setNewIncidentOpen(x=>!x)}>Record incident</button>:undefined}><p className="lexa-platform-muted">Track investigations, urgent outages, administrator notes, and resolution history.</p>{newIncidentOpen&&<form className="lexa-platform-form" onSubmit={(e:FormEvent)=>{e.preventDefault();void (async()=>{setWorking(true);try{await api.createIncident({title:incidentTitle,description:incidentDescription,category:'operations',severity:incidentSeverity});toast.success('Incident created.');setNewIncidentOpen(false);setIncidentTitle('');setIncidentDescription('');reload();}catch(err){toast.error(businessErrorMessage(err));}finally{setWorking(false);}})();}}><label>Title<input value={incidentTitle} maxLength={140} required onChange={e=>setIncidentTitle(e.target.value)}/></label><label>Description<textarea value={incidentDescription} required maxLength={1500} onChange={e=>setIncidentDescription(e.target.value)}/></label><label>Severity<select value={incidentSeverity} onChange={e=>setIncidentSeverity(e.target.value)}><option>critical</option><option>high</option><option>medium</option><option>info</option></select></label><button className="lexa-platform-button" disabled={working}>Save incident</button></form>}
          <div className="lexa-platform-table-wrap"><table><thead><tr><th>Incident</th><th>Priority</th><th>Opened</th><th>Status</th></tr></thead><tbody>{incidents.map(i=><tr key={i.id}><td><strong>{i.title}</strong><small>{i.description}</small></td><td>{state(i.severity)}</td><td>{date(i.created_at)}</td><td>{['super_admin','operations_manager'].includes(profile.role)?<select aria-label={`Change status of ${i.title}`} disabled={working} value={i.status} onChange={e=>void takeAction(()=>api.incidentStatus(i.id,e.target.value),'Incident updated.')}><option value="open">Open</option><option value="acknowledged">Acknowledged</option><option value="resolved">Resolved</option></select>:state(i.status)}</td></tr>)}</tbody></table>{!incidents.length&&<div className="lexa-platform-empty">No platform incidents have been recorded.</div>}</div></SectionCard></>}

        {section==='team'&&<>
          <div className="lexa-platform-intro"><div><h2>Administrator team</h2><p>Only an existing Super Admin may invite another administrator. Each person receives a private, one-time link and creates a separate password.</p></div><span>{adminTeam.filter(a=>a.enabled).length} of 5 active seats</span></div>
          <SectionCard title="Invite an administrator" action={<span className="lexa-platform-muted">Maximum five active administrators</span>}>
            <form className="lexa-platform-form lexa-admin-team-invite" onSubmit={event=>{event.preventDefault();void takeAction(async()=>{await adminAuth.invite(inviteEmail,inviteRole);setInviteEmail('');},'Invitation email sent. The link expires after 24 hours.');}}>
              <label>Recipient email address<input type="email" required maxLength={254} autoComplete="off" placeholder="finance@example.com" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}/></label>
              <label>Platform role<select value={inviteRole} onChange={e=>setInviteRole(e.target.value as PlatformRole)}><option value="super_admin">Super Administrator</option><option value="billing_manager">Billing Manager</option><option value="operations_manager">Operations Manager</option><option value="support_agent">Support Agent</option><option value="auditor">Auditor (read-only)</option></select></label>
              <button className="lexa-platform-button" disabled={working||!inviteEmail.includes('@')||adminTeam.filter(a=>a.enabled).length>=5}><UserPlus size={17}/> Send private invitation</button>
            </form>
            <p className="lexa-platform-muted">The financier can be invited as a second Super Administrator. Never share your own password or an invitation intended for a different email.</p>
          </SectionCard>
          <SectionCard title="Authorized administrators">
            <div className="lexa-platform-table-wrap"><table><thead><tr><th>Administrator</th><th>Role</th><th>Access</th><th>Joined</th><th>Manage</th></tr></thead><tbody>{adminTeam.map(member=><tr key={member.admin_user_id}><td><strong>{member.display_name}</strong><small>{member.email}</small></td><td>{member.role.replaceAll('_',' ')}</td><td>{state(member.enabled?'active':'suspended')}</td><td>{date(member.created_at)}</td><td><button type="button" className={member.enabled?'lexa-platform-danger':'lexa-platform-table-action'} disabled={working||member.admin_user_id===profile.adminUserId} onClick={()=>void takeAction(()=>adminAuth.memberAccess(member.admin_user_id,!member.enabled),member.enabled?'Administrator access disabled and sessions revoked.':'Administrator access restored.')}>{member.admin_user_id===profile.adminUserId?'Your account':member.enabled?'Disable access':'Restore access'}</button></td></tr>)}</tbody></table>{adminTeam.length===0&&<div className="lexa-platform-empty">No administrator team records loaded yet.</div>}</div>
            <p className="lexa-platform-muted">You cannot disable your own current Super Admin session. Revoking another administrator removes their active sessions immediately.</p>
          </SectionCard>
        </>}
        {section==='audit'&&<SectionCard title="Immutable platform activity trail"><p className="lexa-platform-muted">Administrative payment and account actions. Changes cannot be erased through the runtime application.</p><div className="lexa-platform-table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>Business ID</th><th>Administrator</th></tr></thead><tbody>{audits.map(a=><tr key={a.id}><td>{date(a.created_at)}</td><td><strong>{a.action.replaceAll('.',' · ')}</strong></td><td>{a.tenant_id?.slice(0,12)||'Platform'}</td><td>{a.actor_user_id.slice(0,12)}</td></tr>)}</tbody></table>{!audits.length&&<div className="lexa-platform-empty">No platform administrative actions recorded yet.</div>}</div></SectionCard>}
        <footer className="lexa-platform-main-footer"><ShieldCheck size={15}/> LEXA Control Centre · Tenant-isolated business data · UGX 50,000 per 30 days · Activity refreshes while open</footer>
      </div>
    </main>
  </div>;
}
