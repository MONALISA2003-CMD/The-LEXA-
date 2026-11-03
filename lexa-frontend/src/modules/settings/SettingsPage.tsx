import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Database, LockKeyhole, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import { sales, products, workspaces } from '../../data/repositories';
import { apiBaseUrl, dataProviderMode } from '../../data/remote/runtimeConfig';
import { apiAuth } from '../../data/remote/apiAuth';
import SecurityPanel from '../security/SecurityPanel'; // LEXA_AUTH_SECURITY_UI_PATCH:settings-import-v1
import { apiClient } from '../../data/remote/apiClient';
import { businessErrorMessage } from '../../data/remote/businessMessages';

const businessTypes = [
  { value: 'retail', label: 'Retail shop' }, { value: 'wholesale', label: 'Wholesale / distribution' },
  { value: 'restaurant', label: 'Restaurant / food business' }, { value: 'services', label: 'Salon / service business' },
  { value: 'electronics', label: 'Electronics / appliances' }, { value: 'general', label: 'Other business' },
];

export default function SettingsPage() {
  const { workspace, refreshWorkspaces } = useWorkspace();
  const client = useQueryClient();
  const [name, setName] = useState(workspace.businessName);
  const [businessType, setBusinessType] = useState(workspace.businessType);
  const [timezone, setTimezone] = useState(workspace.timezone);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [healthState, setHealthState] = useState<'not-checked' | 'checking' | 'healthy' | 'unavailable'>('not-checked');
  const [healthMessage, setHealthMessage] = useState('Not tested yet');

  useEffect(() => {
    setName(workspace.businessName);
    setBusinessType(workspace.businessType);
    setTimezone(workspace.timezone);
  }, [workspace.id, workspace.businessName, workspace.businessType, workspace.timezone]);
  const productsQuery = useQuery({ queryKey: ['products', workspace.id], queryFn: () => products.list({ workspaceId: workspace.id, activeOnly: false }) });
  const salesQuery = useQuery({ queryKey: ['sales', workspace.id], queryFn: () => sales.list({ workspaceId: workspace.id, limit: 500 }) });
  const currencyLocked = (productsQuery.data?.length ?? 0) > 0 || (salesQuery.data?.length ?? 0) > 0;

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    try {
      await workspaces.update({ ...workspace, businessName: name, businessType, timezone });
      await refreshWorkspaces();
      await client.invalidateQueries({ queryKey: ['dashboard', workspace.id] });
      toast.success(dataProviderMode === 'api' ? 'Business settings saved' : 'Business settings saved on this device');
    } catch (error) {
      toast.error('Settings were not saved', { description: businessErrorMessage(error) });
    } finally { setSaving(false); }
  }

  async function testBackend() {
    if (!apiBaseUrl) { setHealthState('unavailable'); setHealthMessage('Business service is not connected'); return; }
    setHealthState('checking'); setHealthMessage('Checking service availability…');
    try {
      const health = await apiClient.get<{ status?: string; version?: string }>('/health');
      if (!health || typeof health !== 'object' || typeof health.status !== 'string') throw new Error('Service could not be reached.');
      setHealthState(health.status.toLowerCase() === 'ok' || health.status.toLowerCase() === 'healthy' ? 'healthy' : 'unavailable');
      setHealthMessage(health.status.toLowerCase() === 'ok' || health.status.toLowerCase() === 'healthy' ? 'Available' : 'Not available');
    } catch (error) { setHealthState('unavailable'); setHealthMessage('Service could not be reached'); }
  }

  async function signOut() {
    setSigningOut(true);
    try { await apiAuth.signOut(); window.location.assign('/sign-in'); }
    catch (error) { toast.error('Could not end the session', { description: businessErrorMessage(error) }); }
    finally { setSigningOut(false); }
  }



  return (
    <div className="page-stack">
      <div className="page-heading-row"><div><div className="eyebrow eyebrow-blue">PREFERENCES & CONNECTIONS</div><h2>Settings</h2><p>Manage business preferences and review connected services.</p></div><div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><span className="soft-badge"><span className="status-dot" /> {dataProviderMode === 'api' ? (apiBaseUrl ? 'Shared business account' : 'Business account not connected') : 'This device only'}</span>{dataProviderMode === 'api' && apiBaseUrl && <button className="button button-secondary" type="button" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? 'Signing out…' : 'Sign out'}</button>}</div></div>
      <section className="section-card settings-form-card"><div className="section-card-heading"><div className="heading-icon blue-icon"><Database size={18} /></div><div><h3>Business profile</h3><p>Update how your business appears to you and your team.</p></div></div><form onSubmit={saveProfile} className="form-stack"><div className="form-two-col"><label className="field-label">Business name <span className="required-mark">*</span><input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label><label className="field-label">Business type<select value={businessType} onChange={(event) => setBusinessType(event.target.value)}>{businessTypes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label></div><div className="form-two-col"><label className="field-label">Currency<input value={`${workspace.currency} — ${new Intl.DisplayNames(['en'], { type: 'currency' }).of(workspace.currency) ?? workspace.currency}`} disabled /><small className="field-help">{currencyLocked ? 'Currency cannot be changed once you have recorded products or sales. This helps keep your prices accurate.' : 'Contact your administrator if you need to change your business currency.'}</small></label><label className="field-label">Timezone<select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="Africa/Kampala">Kampala (EAT)</option><option value="Africa/Nairobi">Nairobi (EAT)</option><option value="Africa/Dar_es_Salaam">Dar es Salaam (EAT)</option><option value="UTC">UTC</option><option value="Europe/London">London</option></select></label></div><div className="form-info"><ShieldCheck size={16} /><p>Your business profile is saved securely and is available to your authorised team members.</p></div><div><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save business profile'} <Check size={16} /></button></div></form></section>

      {/* LEXA_AUTH_SECURITY_UI_PATCH:security-panel-v1 */}
      <SecurityPanel />

      {dataProviderMode === 'api' && <section className="section-card"><div className="section-card-heading"><div className="heading-icon blue-icon"><Database size={18} /></div><div><h3>LEXA availability</h3><p>Check that your business service is available.</p></div></div><div className="backend-health-row"><div><strong>Business service</strong><span className={'health-state ' + healthState}>{healthMessage}</span></div><button className="button button-secondary" type="button" disabled={healthState === 'checking'} onClick={() => void testBackend()}>{healthState === 'checking' ? 'Checking…' : 'Check availability'}</button></div></section>}

      <section className="section-card privacy-card"><div className="section-card-heading"><div className="heading-icon green-icon"><ShieldCheck size={18} /></div><div><h3>Data & privacy</h3><p>Review where business records are stored and which services are available.</p></div></div><div className="privacy-grid"><div className="privacy-item"><Database size={17} /><div><strong>{dataProviderMode === 'api' ? 'Shared business records' : 'This device'}</strong><p>{dataProviderMode === 'api' ? (apiBaseUrl ? 'Business information is accessed through your authorised LEXA account.' : 'The shared business service is not connected. Contact your LEXA administrator.') : 'Business records stay on this device and do not sync to a shared server.'}</p></div></div><div className="privacy-item"><Users size={17} /><div><strong>{dataProviderMode === 'api' ? 'Shared business access' : 'No cross-device sync'}</strong><p>{dataProviderMode === 'api' ? 'Your authorised team members can access shared business information.' : 'Other devices and staff do not receive these records automatically.'}</p></div></div><div className="privacy-item"><LockKeyhole size={17} /><div><strong>Account security</strong><p>Each team member should have the correct access for their responsibilities.</p></div></div></div>{dataProviderMode === 'local' && <div className="warning-note"><strong>Important:</strong> Keep a separate backup of important business records.</div>}</section>
      <div className="settings-version-row"><span>LEXA business settings</span><strong>Account</strong><span>Business service: {dataProviderMode === 'api' ? 'Shared account' : 'This device only'}</span></div>
    </div>
  );
}
