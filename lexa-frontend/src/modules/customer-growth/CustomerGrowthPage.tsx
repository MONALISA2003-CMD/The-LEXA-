
import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, BarChart3, CalendarClock, CheckCircle2, ChevronDown, ContactRound, HeartHandshake, Megaphone, MessageCircle, Pencil, Plus, RefreshCcw, Search, ShieldCheck, Target, TrendingUp, Users, X } from '../../components/LexaIcon';
import { useWorkspace } from '../../app/WorkspaceContext';
import { useModuleRecordService } from '../../data/providers/ModuleRecordServiceProvider';
import { getModuleDefinition, type ModuleField, type PreviewRecord } from '../operations/moduleCatalog';
import { calculateRecord, validateRecord, type FormValues } from '../operations/previewRules';
import { apiCustomerGrowth, type GrowthActivity } from '../../data/remote/apiCustomerGrowth';
import './customer-growth.css';

const modules=[
 {id:'leads',label:'Leads',headline:'Turn interest into real opportunities',subtitle:'Follow up on enquiries, build relationships and move promising prospects forward.',icon:Users},
 {id:'opportunities',label:'Deals',headline:'Keep promising sales moving',subtitle:'Know which deals are progressing, what they are worth and which need attention.',icon:Target},
 {id:'contacts',label:'Contacts',headline:'People, places and relationships',subtitle:'Your customer contact book, with communication preferences and follow-up reminders.',icon:ContactRound},
 {id:'campaigns',label:'Campaigns',headline:'Make every promotion count',subtitle:'Plan promotions and see the enquiries, deals and sales they actually generate.',icon:Megaphone},
 {id:'sales-teams',label:'Sales team',headline:'Help your sales team achieve more',subtitle:'Assign employees, track territories and compare actual attributed sales against targets.',icon:TrendingUp},
 {id:'customers',label:'Customers',headline:'One place for every customer',subtitle:'Keep your customer directory connected to sales and customer support.',icon:HeartHandshake},
] as const;
type GrowthId=typeof modules[number]['id'];
const stages:Record<string,string[]>={
 leads:['New','Contacted','Qualified','Converted','Lost'],
 opportunities:['New','Qualified','Proposal','Negotiation','Won','Lost'],
 contacts:['Active','Inactive'],
 campaigns:['Draft','Planned','Active','Completed','Cancelled'],
 'sales-teams':['Active','On leave','Inactive'],
 customers:['Active','On hold','Inactive'],
};
const refs:Record<string,string>={leads:'leadCode',opportunities:'opportunityCode',contacts:'contactCode',campaigns:'campaignCode','sales-teams':'salespersonCode',customers:'customerCode'};
const prefixes:Record<string,string>={leads:'LEAD',opportunities:'DEAL',contacts:'CON',campaigns:'CAMP','sales-teams':'REP',customers:'CUS'};
const displayKey:Record<GrowthId,string>={leads:'company',opportunities:'company',contacts:'contactName',campaigns:'name','sales-teams':'salesperson',customers:'name'};
const secondaryKey:Record<GrowthId,string>={leads:'contactName',opportunities:'contactName',contacts:'partyName',campaigns:'channel','sales-teams':'territory',customers:'phone'};
const money=(value:number,currency:string)=>new Intl.NumberFormat('en-UG',{style:'currency',currency,maximumFractionDigits:currency==='UGX'?0:2}).format(value/(currency==='UGX'?1:100));
const today=()=>new Date().toISOString().slice(0,10);
const asText=(x:unknown)=>typeof x==='string'?x:String(x??'');
function emptyForm(moduleId:GrowthId,fields:ModuleField[]):FormValues{
 const result:FormValues={};
 for(const f of fields)result[f.key]=f.kind==='select'?(f.options?.[0]??''):f.kind==='number'?'0':'';
 result.status=stages[moduleId]?.[0]??'New';
 const ref=refs[moduleId];if(ref)result[ref]=`${prefixes[moduleId]}-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
 for(const field of ['createdDate','startDate','issueDate','hireDate'])if(field in result)result[field]=today();
 if('expectedCloseDate' in result)result.expectedCloseDate=today();
 if('periodEnd' in result)result.periodEnd=today();
 return result;
}
function tagStatus(value:string){return ['Won','Qualified','Converted','Active','Completed'].includes(value)?'positive':['Lost','Inactive','Cancelled'].includes(value)?'neutral':['Negotiation','Contacted','Proposal'].includes(value)?'progress':'attention';}
function Field({field,value,onChange}:{field:ModuleField;value:string;onChange:(v:string)=>void}){
 return <label className={`lexa-growth-field ${field.fullWidth?'full':''}`}>
  <span>{field.label}{field.required&&<small>*</small>}</span>
  {field.kind==='select'?<select value={value} required={field.required} onChange={e=>onChange(e.target.value)}>
   {(field.options??[]).map(s=><option key={s} value={s}>{s}</option>)}
  </select>:field.kind==='textarea'?<textarea rows={3} value={value} required={field.required} maxLength={1200} onChange={e=>onChange(e.target.value)}/>:<input
   type={field.kind==='date'?'date':field.kind==='number'?'number':field.kind==='tel'?'tel':field.kind==='email'?'email':'text'}
   value={value} required={field.required} min={field.min} step={field.step} maxLength={field.kind==='number'?undefined:320}
   placeholder={field.placeholder||undefined} onChange={e=>onChange(e.target.value)}/>}
  {field.help&&<small className="lexa-growth-field-hint">{field.help}</small>}
 </label>;
}

export default function CustomerGrowthPage(){
 const location=useLocation();
 const routeId=location.pathname.split('/').filter(Boolean).at(-1);
 const [routeSearch]=useSearchParams();
 const navigate=useNavigate();
 const moduleId=modules.some(m=>m.id===routeId)?routeId as GrowthId:'leads';
 const {workspace,branch}=useWorkspace();
 const client=useQueryClient(),service=useModuleRecordService();
 const module=getModuleDefinition(moduleId);
 const [search,setSearch]=useState('');
 const [filter,setFilter]=useState('All');
 const [selected,setSelected]=useState<PreviewRecord|null>(null);
 const [showForm,setShowForm]=useState(false);
 const [edit,setEdit]=useState<PreviewRecord|null>(null);
 const [form,setForm]=useState<FormValues>({});
 const [activity,setActivity]=useState({type:'call',summary:'',due:''});
 const [busy,setBusy]=useState(false);
 const scope={workspaceId:workspace.id,branchId:branch.id};
 const records=useQuery({queryKey:['module-register',workspace.id,branch.id,moduleId],queryFn:()=>service.list(scope,moduleId,module?.initial),staleTime:20_000,retry:1});
 const summary=useQuery({queryKey:['customer-growth-summary',workspace.id,branch.id],queryFn:()=>apiCustomerGrowth.summary(workspace.id,branch.id),staleTime:45_000,retry:1});
 const team=useQuery({queryKey:['customer-growth-people',workspace.id,branch.id],queryFn:()=>apiCustomerGrowth.people(workspace.id,branch.id),staleTime:120_000,retry:1});
 const campaigns=useQuery({queryKey:['module-register',workspace.id,branch.id,'campaigns'],queryFn:()=>service.list(scope,'campaigns',[]),enabled:moduleId==='leads'||moduleId==='opportunities',staleTime:45000});
 const activityRecordId=selected?.id??routeSearch.get('recordId');
 const activities=useQuery({queryKey:['growth-activities',workspace.id,branch.id,moduleId,activityRecordId],queryFn:()=>apiCustomerGrowth.activities(workspace.id,branch.id,moduleId,activityRecordId!),enabled:Boolean(activityRecordId),staleTime:25000,retry:1});
 const config=modules.find(x=>x.id===moduleId)!;const Icon=config.icon;
 const all=records.data??[];
 const visible=useMemo(()=>all.filter(r=>{
  const matches=!search||Object.values(r).some(v=>asText(v).toLowerCase().includes(search.toLowerCase()));
  return matches&&(filter==='All'||r.status===filter);
 }),[all,search,filter]);
 const counts=summary.data?.counts;
 const linked=routeSearch.get('recordId');
 const current=selected?all.find(r=>r.id===selected.id)??selected:linked?all.find(r=>r.id===linked)??null:null;
 const salesDetails=current?(moduleId==='customers'?summary.data?.salesByCustomer[current.id]:
   moduleId==='opportunities'?summary.data?.salesByOpportunity[current.id]:
   moduleId==='sales-teams'?summary.data?.salesByEmployee[current.salespersonEmployeeId??'']:undefined):undefined;
 const newRecord=()=>{if(!module)return;setEdit(null);setForm(emptyForm(moduleId,module.fields));setShowForm(true);};
 const editing=(r:PreviewRecord)=>{if(!module)return;setEdit(r);setForm(Object.fromEntries(module.fields.map(f=>[f.key,r[f.key]??''])));setShowForm(true);};
 const refresh=async()=>{await Promise.all([client.invalidateQueries({queryKey:['module-register',workspace.id,branch.id]}),client.invalidateQueries({queryKey:['customer-growth-summary',workspace.id,branch.id]})]);};
 const save=async(e:FormEvent)=>{
  e.preventDefault();if(!module)return;
  if(moduleId==='sales-teams'&&!form.salespersonEmployeeId){toast.error('Choose an existing employee for this sales assignment.');return;}
  if((moduleId==='leads'||moduleId==='contacts')&&form.marketingConsent==='Yes'&&!form.consentSource?.trim()){
   toast.error('Record how this person agreed to marketing contact.');return;
  }
  if(form.marketingOptOut==='Yes'&&form.marketingConsent==='Yes'){toast.error('A customer who opted out cannot receive promotions.');return;}
  const values={...form};
  if(moduleId==='sales-teams'){
   const person=team.data?.find(x=>x.employeeId===values.salespersonEmployeeId);
   if(person)values.salesperson=person.name;
   values.salesAchieved='0'; // Achievements always come from actual attributed sales, never a typed estimate.
  }
  const record=calculateRecord(moduleId,values,edit?.id??crypto.randomUUID());
  const problem=validateRecord(moduleId,values,record);
  if(problem){toast.error('Please check the details',{description:problem});return;}
  setBusy(true);
  try{
   const saved=await service.save(scope,moduleId,{...(edit??{}),...record},module.initial);
   client.setQueryData(['module-register',workspace.id,branch.id,moduleId],saved);
   setSelected(saved.find(x=>x.id===record.id)??null);setShowForm(false);setEdit(null);await refresh();
   toast.success('Saved to your business',{description:`${module.singular[0]?.toUpperCase()}${module.singular.slice(1)} details are available to your authorized team.`});
  }catch(error){toast.error('Could not save your changes',{description:error instanceof Error?error.message:'Please retry.'});}
  finally{setBusy(false);}
 };
 const convert=async(r:PreviewRecord)=>{
  if(!['leads','opportunities','contacts'].includes(moduleId))return;
  setBusy(true);
  try{
   const result=await apiCustomerGrowth.convert(workspace.id,branch.id,moduleId,r.id);
   await refresh();setSelected(null);
   toast.success(result.existing?'Existing linked record opened':'Customer journey advanced',{description:'The earlier contact details and source remain linked.'});
   navigate(`/modules/${result.moduleId}?recordId=${encodeURIComponent(result.id)}`);
  }catch(error){toast.error('Could not continue this customer journey',{description:error instanceof Error?error.message:'Please review the status and try again.'});}
  finally{setBusy(false);}
 };
 const addActivity=async(e:FormEvent)=>{
  e.preventDefault();if(!current||!activity.summary.trim())return;setBusy(true);
  try{
   await apiCustomerGrowth.addActivity(workspace.id,branch.id,moduleId,current.id,{activityType:activity.type,summary:activity.summary.trim(),...(activity.due?{nextFollowUpOn:activity.due}:{})});
   setActivity({type:'call',summary:'',due:''});await Promise.all([activities.refetch(),refresh()]);
   toast.success('Customer activity recorded');
  }catch(error){toast.error('Could not record this follow-up',{description:error instanceof Error?error.message:'Please retry.'});}
  finally{setBusy(false);}
 };
 const convertLabel=moduleId==='leads'?'Create opportunity':moduleId==='opportunities'?'Create customer':'Create customer';
 const mayConvert=(moduleId==='leads'&&['Contacted','Qualified'].includes(current?.status??''))||
  (moduleId==='opportunities'&&current?.status==='Won')||(moduleId==='contacts'&&current?.partyType!=='Employee');
 if(!module)return <Navigate to="/modules" replace/>;
 return <main className="page-stack lexa-growth-page" data-module-accent="rose">
  <header className="lexa-growth-hero">
   <div className="lexa-growth-hero-copy"><span className="lexa-growth-eyebrow"><HeartHandshake size={16}/> CUSTOMERS & GROWTH</span>
    <h1>{config.headline}</h1><p>{config.subtitle}</p>
    <div className="lexa-growth-assurance"><ShieldCheck size={15}/> Your business · Your customers · Your team's access</div>
   </div><div className="lexa-growth-hero-icon"><Icon size={37}/></div>
  </header>
  <nav className="lexa-growth-tabs" aria-label="Customers and growth sections">
   {modules.map(item=><Link key={item.id} to={`/modules/${item.id}`} className={item.id===moduleId?'active':''}>{item.label}</Link>)}
  </nav>
  {summary.isError&&<div className="lexa-growth-message" role="alert">We couldn't load the latest growth totals. Your saved records are unaffected. <button type="button" onClick={()=>void summary.refetch()}>Retry totals</button></div>}
  <section className="lexa-growth-stats" aria-label="Customer growth summary">
   {(moduleId==='leads'?[
    ['Total enquiries',counts?.leads],['Follow-ups due',counts?.dueFollowUps],['Ready for sales',summary.data?.leadPipeline.Qualified??0]
   ]:moduleId==='opportunities'?[
    ['Open deals',counts?.openOpportunities],['Possible deal value',counts?.weightedPipeline],['Won deals',summary.data?.opportunityPipeline.Won?.count??0]
   ]:moduleId==='contacts'?[
    ['Contact records',counts?.contacts],['Customers',counts?.customers],['Follow-ups due',counts?.dueFollowUps]
   ]:moduleId==='campaigns'?[
    ['Campaigns',counts?.campaigns],['Sourced leads',summary.data?.campaignPerformance.reduce((s,c)=>s+c.leads,0)],['Sales from linked deals',summary.data?.campaignPerformance.reduce((s,c)=>s+c.completedSalesMinor,0)]
   ]:moduleId==='sales-teams'?[
    ['Sales assignments',counts?.salespeople],['Available sales staff',team.data?.length],['Linked sales this year',summary.data?Object.values(summary.data.salesByEmployee).reduce((s,x)=>s+x.totalMinor,0):undefined]
   ]:[['Customers',counts?.customers],['Contact people',counts?.contacts],['Verified linked sales this year',summary.data?Object.values(summary.data.salesByCustomer).reduce((s,x)=>s+x.totalMinor,0):undefined]]
   ).map(([label,value])=><article key={String(label)}><span>{label}</span><strong>{value==null?'—':typeof value==='number'&&(/value|sales/i.test(String(label)))?money(value*(String(label).includes('Possible')?(workspace.currency==='UGX'?1:100):1),workspace.currency):Number(value).toLocaleString('en-UG')}</strong></article>)}
  </section>
  {moduleId==='opportunities'&&<section className="lexa-growth-pipeline" aria-label="Deal pipeline">
   <div className="lexa-growth-section-title"><Target size={20}/><h2>Deal stages</h2><span>Move a deal forward by updating its stage</span></div>
   <div className="lexa-growth-lanes">
    {['New','Qualified','Proposal','Negotiation','Won'].map(stage=><div className="lexa-growth-lane" key={stage}>
     <header><strong>{stage}</strong><span>{all.filter(x=>x.status===stage).length}</span></header>
     {all.filter(x=>x.status===stage).slice(0,6).map(r=><button type="button" key={r.id} onClick={()=>{setSelected(r);setShowForm(false)}}><strong>{r.company||'Potential deal'}</strong><small>{r.contactName}</small><span>{money(Number(r.amount||0)*(workspace.currency==='UGX'?1:100),workspace.currency)}</span></button>)}
     {!all.some(x=>x.status===stage)&&<p>No deals in this stage</p>}
    </div>)}
   </div>
  </section>}
  {moduleId==='campaigns'&&Boolean(summary.data?.campaignPerformance.length)&&<section className="lexa-growth-campaigns">
   <div className="lexa-growth-section-title"><BarChart3 size={20}/><h2>Campaign results</h2><span>Only explicitly linked leads, deals and recorded sales are counted</span></div>
   <div className="lexa-growth-campaign-grid">
    {summary.data!.campaignPerformance.map(c=><article key={c.id}><strong>{c.name}</strong><small>{c.channel} · {c.status}</small><div><span>{c.leads} leads</span><span>{c.deals} deals</span></div><div><strong>{money(c.completedSalesMinor,workspace.currency)}</strong><small>Linked completed sales</small></div></article>)}
   </div>
  </section>}
  <section className="lexa-growth-workspace">
   <div className="lexa-growth-toolbar"><div><span className="lexa-growth-eyebrow">YOUR RECORDS</span><h2>{module.title.replace('CRM ','').replace(' & prospect tracking',' & prospects')}</h2><p>{all.length} saved · {visible.length} showing</p></div>
    <div className="lexa-growth-buttons"><button className="lexa-growth-secondary" disabled={records.isFetching} type="button" onClick={()=>void refresh()}><RefreshCcw size={16}/> Refresh</button><button className="lexa-growth-primary" type="button" onClick={newRecord}><Plus size={16}/> {moduleId==='leads'?'Add lead':moduleId==='opportunities'?'Add deal':moduleId==='contacts'?'Add contact':moduleId==='campaigns'?'New campaign':moduleId==='sales-teams'?'Assign salesperson':'Add customer'}</button></div></div>
   <div className="lexa-growth-filters"><label className="lexa-growth-search"><Search size={16}/><input aria-label="Search customer records" placeholder="Find a name, company, phone or reference…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    <label className="lexa-growth-status"><span>Status</span><select value={filter} onChange={e=>setFilter(e.target.value)}><option>All</option>{(stages[moduleId]??[]).map(s=><option key={s}>{s}</option>)}</select><ChevronDown size={14}/></label></div>
   {records.isLoading&&<div className="lexa-growth-empty">Loading customer information…</div>}
   {records.isError&&<div className="lexa-growth-message" role="alert">Customer records couldn't be loaded. <button type="button" onClick={()=>void records.refetch()}>Retry</button></div>}
   {!records.isLoading&&!records.isError&&visible.length===0&&<div className="lexa-growth-empty"><Icon size={28}/><h3>{all.length?'No matches for your search':'Start building customer relationships'}</h3><p>{all.length?'Try a different name or stage.':'Save your first record to see follow-ups, activity and results together.'}</p><button type="button" onClick={newRecord}>Add {module.singular}</button></div>}
   <div className="lexa-growth-record-grid">{visible.map(r=><article key={r.id} className="lexa-growth-record">
     <div className="lexa-growth-record-head"><div className="lexa-growth-avatar">{asText(r[displayKey[moduleId]]).slice(0,1).toUpperCase()||'C'}</div><span className={`lexa-growth-status-tag ${tagStatus(r.status)}`}>{r.status}</span></div>
     <h3>{r[displayKey[moduleId]]||r.name||module.singular}</h3>
     <p>{r[secondaryKey[moduleId]]||'No additional details yet'}</p>
     <div className="lexa-growth-record-meta">
       {moduleId==='leads'&&<><span>Next: {r.nextFollowUpDate||r.nextAction||'Set a follow-up'}</span><span>{r.source||'Source not recorded'}</span></>}
       {moduleId==='opportunities'&&<><span>Estimated: {money(Number(r.amount||0)*(workspace.currency==='UGX'?1:100),workspace.currency)}</span><span>Target: {r.expectedCloseDate||'Not set'}</span></>}
       {moduleId==='campaigns'&&<><span>{r.channel||'Channel not recorded'}</span><span>Budget: {money(Number(r.budget||0)*(workspace.currency==='UGX'?1:100),workspace.currency)}</span></>}
       {moduleId==='sales-teams'&&<><span>Target: {money(Number(r.salesTarget||0)*(workspace.currency==='UGX'?1:100),workspace.currency)}</span><span>Actual linked sales: {money(summary.data?.salesByEmployee[r.salespersonEmployeeId??'']?.totalMinor??0,workspace.currency)}</span></>}
       {moduleId==='contacts'&&<><span>{r.phone||r.email||'Contact number not recorded'}</span><span>{r.marketingConsent==='Yes'?'Marketing contact approved':'Marketing contact not approved'}</span></>}
       {moduleId==='customers'&&<><span>{r.phone||'No contact number'}</span><span>Linked sales: {summary.data?.salesByCustomer[r.id]?.count??0}</span></>}
     </div>
     <button type="button" className="lexa-growth-record-open" onClick={()=>{setSelected(r);setShowForm(false)}}>View details <ArrowRight size={15}/></button>
    </article>)}</div>
  </section>
  <div className="lexa-growth-info"><ShieldCheck size={17}/><p>People you authorize can work with these records. Sales, payments and commission figures are counted only when linked to actual business transactions. Promotions never send messages automatically.</p></div>
  {showForm&&<div className="lexa-growth-modal" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowForm(false)}}><section role="dialog" aria-modal="true" aria-label={edit?'Edit customer record':'Add customer record'} className="lexa-growth-dialog">
   <header><div><span className="lexa-growth-eyebrow">{edit?'EDIT DETAILS':'NEW RECORD'}</span><h2>{edit?`Update ${module.singular}`:`Add ${module.singular}`}</h2><p>All changes stay within this business.</p></div><button type="button" aria-label="Close" onClick={()=>setShowForm(false)}><X size={20}/></button></header>
   <form onSubmit={save}><div className="lexa-growth-form-grid">
    {module.fields.filter(f=>!(moduleId==='sales-teams'&&['salesAchieved','salesperson'].includes(f.key))).map(f=><Field key={f.key} field={f} value={form[f.key]??''} onChange={v=>setForm(old=>({...old,[f.key]:v}))}/>)}
    {['leads','opportunities','contacts'].includes(moduleId)&&<><label className="lexa-growth-field"><span>Assigned salesperson</span><select value={form.assignedEmployeeId??''} onChange={e=>setForm(old=>({...old,assignedEmployeeId:e.target.value,owner:team.data?.find(x=>x.employeeId===e.target.value)?.name??old.owner??''}))}><option value="">Not assigned yet</option>{(team.data??[]).map(x=><option key={x.employeeId} value={x.employeeId}>{x.name} · {x.title}</option>)}</select></label></>}
    {moduleId==='sales-teams'&&<label className="lexa-growth-field"><span>Existing employee *</span><select required value={form.salespersonEmployeeId??''} onChange={e=>setForm(old=>({...old,salespersonEmployeeId:e.target.value}))}><option value="">Choose an employee</option>{(team.data??[]).map(x=><option key={x.employeeId} value={x.employeeId}>{x.name} · {x.title}</option>)}</select></label>}
    {['leads','opportunities'].includes(moduleId)&&<label className="lexa-growth-field"><span>Related campaign</span><select value={form.campaignRecordId??''} onChange={e=>setForm(old=>({...old,campaignRecordId:e.target.value}))}><option value="">No campaign</option>{(campaigns.data??[]).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
   </div>
   <div className="lexa-growth-form-footer"><button type="button" className="lexa-growth-secondary" onClick={()=>setShowForm(false)}>Cancel</button><button disabled={busy} className="lexa-growth-primary" type="submit"><CheckCircle2 size={17}/>{busy?'Saving…':edit?'Save changes':'Save to my business'}</button></div>
   </form>
  </section></div>}
  {current&&!showForm&&<div className="lexa-growth-modal" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><section role="dialog" aria-modal="true" aria-label="Customer record details" className="lexa-growth-dialog">
   <header><div><span className="lexa-growth-eyebrow">CUSTOMER RELATIONSHIP</span><h2>{current[displayKey[moduleId]]||module.singular}</h2><p>{current.status} · {module.title}</p></div><button aria-label="Close" onClick={()=>setSelected(null)}><X size={20}/></button></header>
   <div className="lexa-growth-detail-body"><div className="lexa-growth-detail-actions"><button className="lexa-growth-secondary" type="button" onClick={()=>editing(current)}><Pencil size={16}/> Edit details</button>{mayConvert&&<button className="lexa-growth-primary" type="button" disabled={busy} onClick={()=>void convert(current)}><ArrowRight size={16}/>{convertLabel}</button>}{moduleId==='customers'&&<Link className="lexa-growth-primary" to="/sales"><BarChart3 size={16}/> View sales</Link>}</div>
    {salesDetails&&<div className="lexa-growth-linked-sale"><strong>{salesDetails.count} linked completed sales</strong><span>{money(salesDetails.totalMinor,workspace.currency)} · Last 365 days</span></div>}
    <div className="lexa-growth-detail-facts">{module.fields.filter(f=>current[f.key]&&!['notes','status'].includes(f.key)).slice(0,14).map(f=><div key={f.key}><span>{f.label}</span><strong>{current[f.key]}</strong></div>)}</div>
    <div className="lexa-growth-activity"><div className="lexa-growth-section-title"><MessageCircle size={18}/><h3>Conversations & follow-ups</h3></div>
      {activities.isLoading&&<p>Loading activity…</p>}{activities.isError&&<p>Activity could not be loaded. <button onClick={()=>void activities.refetch()}>Retry</button></p>}
      {(activities.data??[]).map((a:GrowthActivity)=><div className="lexa-growth-activity-item" key={a.id}><strong>{a.activityType.replaceAll('_',' ')}</strong><span>{a.summary}</span><small>{new Date(a.happenedAt).toLocaleDateString('en-UG')}{a.nextFollowUpOn?' · Next '+String(a.nextFollowUpOn).slice(0,10):''}</small></div>)}
      {!activities.isLoading&&!activities.data?.length&&<p>No customer interactions recorded yet.</p>}
      <form onSubmit={addActivity}><label>What happened?<select value={activity.type} onChange={e=>setActivity(o=>({...o,type:e.target.value}))}><option value="call">Phone call</option><option value="whatsapp">WhatsApp conversation</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="note">Note</option><option value="follow_up">Follow-up</option></select></label><label>Notes<textarea required rows={3} maxLength={1200} value={activity.summary} onChange={e=>setActivity(o=>({...o,summary:e.target.value}))} placeholder="What did the customer say? What happens next?"/></label><label>Next follow-up (optional)<input type="date" value={activity.due} onChange={e=>setActivity(o=>({...o,due:e.target.value}))}/></label><button className="lexa-growth-primary" type="submit" disabled={busy||!activity.summary.trim()}><CalendarClock size={16}/> Record activity</button></form>
    </div>
   </div>
  </section></div>}
 </main>;
}

