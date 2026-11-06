import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Database, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import { sales, products, workspaces } from '../../data/repositories';
import { apiBaseUrl, dataProviderMode } from '../../data/remote/runtimeConfig';
import { apiAuth } from '../../data/remote/apiAuth';
import { apiTeamAccess } from '../../data/remote/apiTeamAccess';
import { businessErrorMessage } from '../../data/remote/businessMessages';
import { businessSetupApi } from '../../data/remote/businessSetup';
import { INDUSTRY_OPTIONS, availableBusinessSpecialties } from '../../domain/catalog/industryCatalog';

export default function SettingsPage() {
  const { workspace, refreshWorkspaces } = useWorkspace();
  const client = useQueryClient();
  const ownerAccess = useQuery({ queryKey: ['business-access', workspace.id], queryFn: () => apiTeamAccess.access(workspace.id), enabled: dataProviderMode === 'api' });
  const ownerOnly = dataProviderMode !== 'api' || ownerAccess.data?.isOwner === true;
  const [name, setName] = useState(workspace.businessName);
  const [timezone, setTimezone] = useState(workspace.timezone);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setName(workspace.businessName);
    setTimezone(workspace.timezone);
  }, [workspace.id, workspace.businessName, workspace.timezone]);
  const activitiesQuery=useQuery({queryKey:['business-setup',workspace.id],queryFn:()=>businessSetupApi.read(workspace.id),enabled:ownerOnly&&dataProviderMode==='api',staleTime:30000});
  const activities=activitiesQuery.data;
  const industryNames=activities?.industries.map(code=>INDUSTRY_OPTIONS.find(([key])=>key===code)?.[1]??code)??[];
  const specialtyOptions=availableBusinessSpecialties(activities?.industries??[]);
  const specialtyNames=activities?.subActivityCodes.map(code=>specialtyOptions.find(item=>item.code===code)?.label??code)??[];
  const productsQuery = useQuery({ queryKey: ['products', workspace.id], queryFn: () => products.list({ workspaceId: workspace.id, activeOnly: false }), enabled: ownerOnly });
  const salesQuery = useQuery({ queryKey: ['sales', workspace.id], queryFn: () => sales.list({ workspaceId: workspace.id, limit: 500 }), enabled: ownerOnly });
  const currencyLocked = (productsQuery.data?.length ?? 0) > 0 || (salesQuery.data?.length ?? 0) > 0;

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    try {
      await workspaces.update({ ...workspace, businessName: name, timezone });
      await refreshWorkspaces();
      await client.invalidateQueries({ queryKey: ['dashboard', workspace.id] });
      toast.success(dataProviderMode === 'api' ? 'Business settings saved' : 'Business settings saved on this device');
    } catch (error) {
      toast.error('Settings were not saved', { description: businessErrorMessage(error) });
    } finally { setSaving(false); }
  }

  async function signOut() {
    setSigningOut(true);
    try { await apiAuth.signOut(); window.location.assign('/sign-in'); }
    catch (error) { toast.error('Could not end the session', { description: businessErrorMessage(error) }); }
    finally { setSigningOut(false); }
  }



  if (!ownerOnly) return <div className="page-stack"><section className="section-card"><h2>Account settings</h2><p>Company profile changes require business-owner permissions. Personal security and privacy controls are available in this settings centre.</p><div className="account-security-actions"><Link to="/settings?section=security" className="button button-secondary">Sign-in and security</Link><Link to="/settings?section=privacy" className="button button-secondary">Privacy preferences</Link></div></section></div>;

  return (
    <div className="page-stack">
      <div className="page-heading-row"><div><div className="eyebrow eyebrow-blue">BUSINESS PREFERENCES</div><h2>Business profile & preferences</h2><p>Maintain your organization details, operating timezone and business activities.</p></div><div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><span className="soft-badge"><span className="status-dot" /> {dataProviderMode === 'api' ? (apiBaseUrl ? 'Shared business account' : 'Business account not connected') : 'This device only'}</span>{dataProviderMode === 'api' && apiBaseUrl && <button className="button button-secondary" type="button" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? 'Signing out…' : 'Sign out'}</button>}</div></div>
      <section className="section-card settings-form-card"><div className="section-card-heading"><div className="heading-icon blue-icon"><Database size={18} /></div><div><h3>Business profile</h3><p>Update how your business appears to you and your team.</p></div></div><form onSubmit={saveProfile} className="form-stack"><div className="form-two-col"><label className="field-label">Business name <span className="required-mark">*</span><input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label><div className="field-label"><strong>Business activities</strong><p>{industryNames.length?industryNames.join(' · '):'Specify your business activities in Business Setup.'}</p><Link to="/business-setup" className="button button-secondary button-small">Edit business activities</Link></div></div><div className="form-two-col"><label className="field-label">Currency<input value={`${workspace.currency} — ${new Intl.DisplayNames(['en'], { type: 'currency' }).of(workspace.currency) ?? workspace.currency}`} disabled /><small className="field-help">{currencyLocked ? 'Currency cannot be changed once you have recorded products or sales. This helps keep your prices accurate.' : 'Contact your administrator if you need to change your business currency.'}</small></label><label className="field-label">Timezone<select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="Africa/Kampala">Kampala (EAT)</option><option value="Africa/Nairobi">Nairobi (EAT)</option><option value="Africa/Dar_es_Salaam">Dar es Salaam (EAT)</option><option value="UTC">UTC</option><option value="Europe/London">London</option></select></label></div><div className="form-info"><ShieldCheck size={16} /><p>Your business profile is saved securely and is available to your authorised team members.</p></div><div><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save business profile'} <Check size={16} /></button></div></form></section>

      <section className="section-card"><div className="section-card-heading"><div className="heading-icon blue-icon"><ShieldCheck size={18}/></div><div><h3>Products and services you offer</h3><p>{specialtyNames.length?specialtyNames.join(' · '):'Choose what you sell to tailor product entry, purchasing and checkout.'}</p></div></div><Link className="button button-secondary" to="/business-setup">Manage business activities</Link></section>
      <section className="section-card"><div className="section-card-heading"><div className="heading-icon blue-icon"><ShieldCheck size={18}/></div><div><h3>Business registration and payments</h3><p>Update your business address, trading details and accepted payment methods.</p></div></div><Link to="/business-setup" className="button button-primary">Review business setup</Link></section>


      
    </div>
  );
}
