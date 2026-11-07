import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Building2, Check, ChevronLeft, ChevronRight, CircleCheck, CreditCard, MapPin, PackageCheck, ShieldCheck, Store, Wallet } from '../../components/LexaIcon';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import { businessSetupApi, type BusinessSetupRecord, type SetupSave } from '../../data/remote/businessSetup';
import { businessErrorMessage } from '../../data/remote/businessMessages';
import { dataProviderMode } from '../../data/remote/runtimeConfig';

import { INDUSTRY_OPTIONS, RETIRED_INDUSTRIES, availableBusinessSpecialties } from '../../domain/catalog/industryCatalog';
const MODELS = [['retail','Retail'],['wholesale','Wholesale'],['distribution','Distribution'],['services','Services'],['rental','Rental'],['subscription','Subscriptions'],['mixed','Mixed business'],['other','Other']] as const;
const OFFERINGS = [['physical_goods','Physical products'],['services','Services'],['digital_goods','Digital goods'],['subscriptions','Subscriptions'],['rentals','Rentals']] as const;
const CHANNELS = [['shop','Physical shop'],['field_sales','Field sales'],['online','Website / online'],['social','WhatsApp / social'],['b2b','Business to business'],['delivery','Delivery'],['other','Other']] as const;
const CURRENCIES = [['UGX','UGX — Ugandan shilling'],['KES','KES — Kenyan shilling'],['TZS','TZS — Tanzanian shilling'],['RWF','RWF — Rwandan franc'],['USD','USD — US dollar'],['EUR','EUR — Euro'],['GBP','GBP — Pound sterling']] as const;
const TIMEZONES = [['Africa/Kampala','Kampala · EAT'],['Africa/Nairobi','Nairobi · EAT'],['Africa/Dar_es_Salaam','Dar es Salaam · EAT'],['Africa/Kigali','Kigali · CAT'],['UTC','UTC'],['Europe/London','London'],['America/New_York','New York']] as const;
const STEP_NAMES = ['Business identity','Business activities','Payment records','Review & finish'];

function Picker({ label, choices, values, onChange }: {
  label: string; choices: readonly (readonly [string,string])[]; values: string[]; onChange: (next: string[]) => void;
}) {
  const [search,setSearch]=useState('');
  const filtered=choices.filter(([code,text])=>`${text} ${code}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <fieldset className="bs-fieldset"><legend>{label}</legend>
    {choices.length>9&&<label className="bs-activity-search">Find an activity<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search business activities"/></label>}
    <p className="bs-activity-hint">{values.length} selected · Choose as many as you operate.</p>
    <div className="bs-picks">{filtered.map(([value, text]) =>
    <button type="button" key={value} className={`bs-pick ${values.includes(value) ? 'bs-pick-on' : ''}`} aria-pressed={values.includes(value)}
      onClick={() => onChange(values.includes(value) ? values.filter(v => v !== value) : [...values,value])}>
      {values.includes(value) && <Check size={15}/>} {text}
    </button>
  )}{filtered.length===0&&<p>No business activities match your search.</p>}</div></fieldset>;
}

export default function BusinessSetupPage() {
  const { workspace, refreshWorkspaces } = useWorkspace();
  const queryClient=useQueryClient();
  const navigate = useNavigate();
  const [data, setData] = useState<BusinessSetupRecord | null>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [selectedMethods, setSelectedMethods] = useState<string[]>([]);
  const [savedIndustries,setSavedIndustries]=useState<string[]>([]);
  const [activityChangeAcknowledged,setActivityChangeAcknowledged]=useState(false);
  useEffect(() => {
    let cancelled = false; setLoading(true); setError(''); setData(null);
    if (dataProviderMode !== 'api') { setError('Connect your business account to use secure business setup.'); setLoading(false); return; }
    void businessSetupApi.read(workspace.id).then(record => {
      if (cancelled) return;
      setData({...record,subActivityCodes:record.subActivityCodes??[]});setSavedIndustries(record.industries);setStep(record.completedAt ? 1 : Math.max(1,Math.min(4,record.setupStep)));
      setSelectedMethods(record.paymentMethods?.filter(p => p.enabled).map(p => p.code) ?? []);
      setConfirmed(Boolean(record.manualPaymentsConfirmedAt));
    }).catch(cause => { if (!cancelled) setError(businessErrorMessage(cause)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspace.id]);

  function change<K extends keyof BusinessSetupRecord>(key: K, value: BusinessSetupRecord[K]) {
    setData(current => current ? { ...current, [key]: value } : current);
  }
  const completed = Boolean(data?.completedAt);
  const currentPaymentLabels = useMemo(() => data?.paymentMethods?.filter(p => selectedMethods.includes(p.code)).map(p => p.label) ?? [], [data?.paymentMethods,selectedMethods]);

  async function advance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!data || !data.isOwner || saving) return;
    setSaving(true); setError('');
    try {
      let payload: SetupSave;
      if (step === 1) payload = { step:1, businessName:data.businessName, branchName:data.branchName, tradingName:data.tradingName,
        legalName:data.legalName, country:data.country, district:data.district, city:data.city, physicalAddress:data.physicalAddress,
        onlineOnly:data.onlineOnly, email:data.email, phone:data.phone, website:data.website,
        registrationNumber:data.registrationNumber, taxIdentificationNumber:data.taxIdentificationNumber };
      else if (step === 2) payload = { step:2, industry:data.industry,industries:data.industries,subActivityCodes:data.subActivityCodes,activityRevision:data.activityRevision,confirmActivityChange:activityChangeAcknowledged,businessModels:data.businessModels,offeringTypes:data.offeringTypes,
        offeringsDescription:data.offeringsDescription,sellingChannels:data.sellingChannels };
      else payload = { step:3,currency:data.currency,timezone:data.timezone,methods:selectedMethods,confirmation:confirmed };
      const response = await businessSetupApi.save(workspace.id,payload);
      setStep(Math.max(step+1,response.nextStep));
      if(step===2){setSavedIndustries([...data.industries]);setActivityChangeAcknowledged(false);const latest=await businessSetupApi.read(workspace.id);setData(latest);await queryClient.invalidateQueries({queryKey:['industry-catalogue',workspace.id]});await queryClient.invalidateQueries({queryKey:['business-setup',workspace.id]});}
      if (step === 1 || step === 2 || step === 3) await refreshWorkspaces();
      toast.success('Business settings saved');
    } catch (cause) { setError(businessErrorMessage(cause)); }
    finally { setSaving(false); }
  }
  async function finish() {
    if (!data || !data.isOwner || saving) return;
    setSaving(true);setError('');
    try {
      await businessSetupApi.complete(workspace.id);
      await refreshWorkspaces();
      toast.success('Business setup complete');
      navigate('/', { replace:true });
    } catch (cause) { setError(businessErrorMessage(cause)); }
    finally { setSaving(false); }
  }
  if (loading) return <section className="bs-shell"><div className="bs-card" role="status">Loading business settings…</div></section>;
  if (!data) return <section className="bs-shell"><div className="bs-card" role="alert"><h2>Business profile unavailable</h2><p>{error || 'LEXA could not load the profile for this workspace. Your business has not been changed.'}</p><button className="button button-primary" onClick={() => window.location.reload()}>Retry loading profile</button><Link to="/workspace" className="button button-secondary">Back to My Business</Link></div></section>;
  if (!data.isOwner) return <section className="bs-shell"><div className="bs-card"><h2>CEO access required</h2><p>Only the verified business CEO can edit this profile.</p><Link to="/workspace" className="button button-primary">Return to My Business</Link></div></section>;
  return <section className="bs-shell">
    <section className="bs-hero"><div className="bs-hero-icon"><Store size={22}/></div><p className="bs-eyebrow">LEXA · BUSINESS FOUNDATIONS</p>
      <h1>{completed ? 'Your business profile' : 'Configure your business'}</h1>
      <p>Manage your business activities, branches, products and payment records in one account.</p>
      <div className="bs-hero-foot"><ShieldCheck size={16}/> Owner-controlled · Private to {workspace.businessName}</div>
    </section>
    <section className="bs-card">
      <div className="bs-progress-header"><span>STEP {step} OF 4</span><span>{STEP_NAMES[step-1]}</span></div>
      <div className="bs-progress" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={4} aria-label="Business setup progress">
        {[1,2,3,4].map(n => <div key={n} className={n <= step ? 'bs-progress-active' : ''} />)}
      </div>
      {step === 1 && <><div className="bs-step-title"><Building2/><div><h2>Introduce your business</h2><p>These details identify your business throughout LEXA.</p></div></div>
      <form onSubmit={advance} className="bs-form">
        <div className="bs-grid"><label>Business name *<input required maxLength={100} value={data.businessName} onChange={e => change('businessName',e.target.value)} placeholder="e.g. My Trading Company"/></label>
          <label>Trading name (optional)<input maxLength={100} value={data.tradingName} onChange={e => change('tradingName',e.target.value)} placeholder="Name your customers know"/></label></div>
        <label>Legal business name (optional)<input maxLength={160} value={data.legalName} onChange={e => change('legalName',e.target.value)} placeholder="Registered legal name"/></label>
        <div className="bs-grid"><label>Country *<select value={data.country} onChange={e => change('country',e.target.value)}><option value="UG">Uganda</option><option value="KE">Kenya</option><option value="TZ">Tanzania</option><option value="RW">Rwanda</option><option value="US">United States</option><option value="GB">United Kingdom</option><option value="ZZ">Other / international</option></select></label>
          <label>District / region<input value={data.district} maxLength={120} onChange={e => change('district',e.target.value)} placeholder="e.g. Kampala"/></label></div>
        <div className="bs-grid"><label>Town or city<input value={data.city} maxLength={120} onChange={e => change('city',e.target.value)} placeholder="e.g. Kampala"/></label>
          <input type="hidden" value={data.branchName||'Main branch'} readOnly/></div>
        <label>Physical address<input value={data.physicalAddress} maxLength={250} onChange={e => change('physicalAddress',e.target.value)} placeholder="Street, building, floor, shop number"/></label>
        <label className="bs-checkline"><input type="checkbox" checked={data.onlineOnly} onChange={e => change('onlineOnly',e.target.checked)}/> I operate online / remotely without a physical location</label>
        <div className="bs-grid"><label>Business phone<input type="tel" maxLength={40} value={data.phone} onChange={e => change('phone',e.target.value)} placeholder="e.g. +256 7XX XXX XXX"/></label>
          <label>Business email<input type="email" value={data.email} onChange={e => change('email',e.target.value)} placeholder="hello@mybusiness.com"/></label></div>
        <label>Business website (optional)<input type="url" value={data.website} onChange={e => change('website',e.target.value)} placeholder="https://mybusiness.com"/></label>
        <details className="bs-advanced"><summary>Legal and tax identifiers — optional</summary><div className="bs-grid"><label>Registration number<input value={data.registrationNumber} onChange={e=>change('registrationNumber',e.target.value)}/></label><label>TIN / tax ID<input value={data.taxIdentificationNumber} onChange={e=>change('taxIdentificationNumber',e.target.value)}/></label></div><p>LEXA does not determine your tax obligations from these fields.</p></details>
        <footer className="bs-actions"><Link to="/" className="button button-secondary">Do this later</Link><button className="button button-primary" disabled={saving}>{saving?'Saving…':'Continue to activities'} <ChevronRight size={16}/></button></footer>
      </form></>}
      {step === 2 && <><div className="bs-step-title"><Store/><div><h2>What does your business do?</h2><p>Select the activities that guide product entry and stock workflows. Existing records remain available.</p></div></div>
      <form className="bs-form" onSubmit={advance}>
        <p className="bs-activity-hint">Choose every activity your business carries out. There is no limit on combining business types, and you can update this list later without losing any product or sale.</p>
        {data.industries.some(code=>RETIRED_INDUSTRIES.includes(code))&&<p role="alert">Some former industry selections were retired. Please confirm your remaining business activities; existing records are preserved.</p>}
        <Picker label="What industries or activities do you operate? * (choose any)" choices={INDUSTRY_OPTIONS} values={data.industries.filter(code=>!RETIRED_INDUSTRIES.includes(code))} onChange={values=>{change('industries',values);change('subActivityCodes',data.subActivityCodes.filter(code=>availableBusinessSpecialties(values).some(item=>item.code===code)));change('industry',values.includes(data.industry)?data.industry:(values[0]??''));setActivityChangeAcknowledged(false);}}/>
        <p className="bs-activity-hint">Choose the departments that best describe what you sell. They set the product forms shown first in Products and purchasing; existing stock and accounting history remain available.</p>
        <Picker label="What do you sell or provide? (choose the specialties that apply)" choices={availableBusinessSpecialties(data.industries).map(item=>[item.code,item.label] as const)} values={data.subActivityCodes} onChange={values=>change('subActivityCodes',values)}/>
        {savedIndustries.some(code=>!data.industries.includes(code))&&<label className="bs-checkline bs-owner-confirm"><input type="checkbox" checked={activityChangeAcknowledged} onChange={event=>setActivityChangeAcknowledged(event.target.checked)}/><span>I have reviewed pending purchases, stock and customer orders. Removing an activity changes future product suggestions only; existing items, receipts, returns and account entries remain available.</span></label>}
        {data.lastActivityChange&&<p className="bs-activity-hint">Activity settings last changed {new Date(data.lastActivityChange.changedAt).toLocaleString()} · revision {data.lastActivityChange.version}.</p>}
        <Picker label="How do you operate? * (choose all that apply)" choices={MODELS} values={data.businessModels} onChange={v=>change('businessModels',v)}/>
        <Picker label="What forms of business do you provide? *" choices={OFFERINGS} values={data.offeringTypes} onChange={v=>change('offeringTypes',v)}/>
        <label>Describe what your business sells or does *<textarea required maxLength={500} rows={4} value={data.offeringsDescription} onChange={e=>change('offeringsDescription',e.target.value)} placeholder="e.g. We sell phones and accessories wholesale and retail, and provide phone repairs."/></label>
        <Picker label="Where do customers buy from you?" choices={CHANNELS} values={data.sellingChannels} onChange={v=>change('sellingChannels',v)}/>
        <footer className="bs-actions"><button type="button" className="button button-secondary" onClick={()=>setStep(1)}><ChevronLeft size={16}/> Back</button><button className="button button-primary" disabled={saving}>{saving?'Saving…':'Continue to payments'} <ChevronRight size={16}/></button></footer>
      </form></>}
      {step === 3 && <><div className="bs-step-title"><Wallet/><div><h2>How are payments received?</h2><p>Choose how your business records money received. LEXA does not operate or connect payment gateways.</p></div></div>
      <form className="bs-form" onSubmit={advance}>
        <div className="bs-grid"><label>Business currency *<select value={data.currency} onChange={e=>change('currency',e.target.value)}>{CURRENCIES.map(([code,label])=><option value={code} key={code}>{label}</option>)}</select></label>
        <label>Reporting timezone *<select value={data.timezone} onChange={e=>change('timezone',e.target.value)}>{TIMEZONES.map(([code,label])=><option value={code} key={code}>{label}</option>)}</select></label></div>
        <fieldset className="bs-fieldset"><legend>Methods your business accepts *</legend><div className="bs-payment-grid">{data.paymentMethods.map(method=><label key={method.code} className={`bs-payment-option ${selectedMethods.includes(method.code)?'is-on':''}`}>
          <input type="checkbox" checked={selectedMethods.includes(method.code)} onChange={e=>setSelectedMethods(current=>e.target.checked?[...current,method.code]:current.filter(v=>v!==method.code))}/><CreditCard size={18}/><span>{method.label}</span>
          {selectedMethods.includes(method.code)&&<CircleCheck size={16} className="bs-selected"/>}</label>)}</div></fieldset>
        <div className="bs-notice"><ShieldCheck size={18}/><div><strong>Recording only — no gateways</strong><p>LEXA never sends, requests or verifies transfers. Your business must independently confirm each payment through cash counting, a bank statement or the provider's official transaction record. Record the amount and reference only after confirmation. Never enter PINs, passwords or OTPs into LEXA.</p></div></div>
        <label className="bs-checkline bs-owner-confirm"><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><strong>As the business owner, I confirm these payment-recording methods are accurate and understand LEXA does not verify received money.</strong></label>
        <footer className="bs-actions"><button type="button" className="button button-secondary" onClick={()=>setStep(2)}><ChevronLeft size={16}/> Back</button><button className="button button-primary" disabled={saving||selectedMethods.length===0}>{saving?'Saving…':'Review my business'} <ChevronRight size={16}/></button></footer>
      </form></>}
      {step === 4 && <><div className="bs-step-title"><PackageCheck/><div><h2>Review business settings</h2><p>Confirm the details that will appear across products, purchasing and sales.</p></div></div>
      <div className="bs-review-grid"><div><Building2/><span>Business</span><strong>{data.businessName}</strong><small>{data.legalName||data.tradingName||'Business owner profile'}</small></div>
        <div><MapPin/><span>Internal accounting location</span><strong>{data.branchName}</strong><small>{[data.city,data.district,data.country].filter(Boolean).join(', ')}</small></div>
        <div><Store/><span>Business activity</span><strong>{data.industries.length} selected</strong><small>{data.industries.map(code=>INDUSTRY_OPTIONS.find(([id])=>id===code)?.[1]??code).join(' · ')}{data.subActivityCodes.length?` · ${data.subActivityCodes.map(code=>availableBusinessSpecialties(data.industries).find(item=>item.code===code)?.label??code).join(' · ')}`:''}</small></div>
        <div><CreditCard/><span>Recording methods</span><strong>{currentPaymentLabels.length} enabled</strong><small>{currentPaymentLabels.join(' · ')}</small></div></div>
      <div className="bs-notice"><ShieldCheck size={19}/><p>Owners have complete access inside this business. Other tenants stay private. Your setup is stored in Neon PostgreSQL and connected to the same tenant used by POS, stock, finance, staff and reports.</p></div>
      {completed?<div className="bs-actions"><button type="button" className="button button-secondary" onClick={()=>setStep(1)}>Edit business setup</button><Link className="button button-primary" to="/">Open dashboard <ChevronRight size={16}/></Link></div>:<div className="bs-actions"><button type="button" className="button button-secondary" onClick={()=>setStep(3)}><ChevronLeft size={16}/> Back</button><button type="button" onClick={()=>void finish()} disabled={saving} className="button button-primary">{saving?'Finalizing…':'Finish and open LEXA'} <Check size={17}/></button></div>}
      </>}
      {error&&<div className="bs-error" role="alert">{error}</div>}
      <div className="bs-save-note"><ShieldCheck size={14}/> Each step is saved to this business. You can return to finish later.</div>
    </section>
  </section>;
}
