import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CloudOff, Database, LockKeyhole, ShieldCheck, Smartphone, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import { sales, products, workspaces } from '../../data/repositories';
import { apiBaseUrl, dataProviderMode } from '../../data/remote/runtimeConfig';
import { apiAuth } from '../../data/remote/apiAuth';
import { apiClient } from '../../data/remote/apiClient';

const businessTypes = [
  { value: 'retail', label: 'Retail shop' }, { value: 'wholesale', label: 'Wholesale / distribution' },
  { value: 'restaurant', label: 'Restaurant / food business' }, { value: 'services', label: 'Salon / service business' },
  { value: 'electronics', label: 'Electronics / appliances' }, { value: 'general', label: 'General SME' },
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
      toast.error('Settings were not saved', { description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setSaving(false); }
  }

  async function testBackend() {
    if (!apiBaseUrl) { setHealthState('unavailable'); setHealthMessage('Backend URL is not configured'); return; }
    setHealthState('checking'); setHealthMessage('Checking API health…');
    try {
      const health = await apiClient.get<{ status?: string; version?: string }>('/health');
      if (!health || typeof health !== 'object' || typeof health.status !== 'string') throw new Error('Health endpoint returned an invalid response.');
      setHealthState(health.status.toLowerCase() === 'ok' || health.status.toLowerCase() === 'healthy' ? 'healthy' : 'unavailable');
      setHealthMessage(`${health.status}${health.version ? ` · ${health.version}` : ''}`);
    } catch (error) { setHealthState('unavailable'); setHealthMessage(error instanceof Error ? error.message : 'Backend health check failed'); }
  }

  async function signOut() {
    setSigningOut(true);
    try { await apiAuth.signOut(); window.location.assign('/sign-in'); }
    catch (error) { toast.error('Could not end the session', { description: error instanceof Error ? error.message : 'Retry or contact your administrator.' }); }
    finally { setSigningOut(false); }
  }

  const integrations = [
    { title: 'Authentication & password recovery', description: 'Session, sign-in and recovery endpoints; live verification requires the server', icon: LockKeyhole, status: dataProviderMode === 'api' && apiBaseUrl ? 'API contract configured · unverified' : 'Not configured' },
    { title: 'Shared backend & database', description: 'Multi-user access, server-side validation and cross-device sync', icon: Database, status: dataProviderMode === 'api' && apiBaseUrl ? 'URL configured · health unverified' : 'Not configured' },
    { title: 'Team invitations & chat', description: 'Deliver messages and manage remote team members', icon: Users, status: 'Not connected' },
    { title: 'Mobile money & payment processing', description: 'External payment initiation and transfer confirmation', icon: Smartphone, status: 'Not connected' },
    { title: 'URA / EFIRS tax integration', description: 'Official fiscal submission and response tracking', icon: ShieldCheck, status: 'Not connected' },
  ];

  return (
    <div className="page-stack">
      <div className="page-heading-row"><div><div className="eyebrow eyebrow-blue">PREFERENCES & CONNECTIONS</div><h2>Settings</h2><p>Manage business preferences and review connected services.</p></div><div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><span className="soft-badge"><span className="status-dot" /> {dataProviderMode === 'api' ? (apiBaseUrl ? 'Backend mode' : 'Backend not configured') : 'Device storage mode'}</span>{dataProviderMode === 'api' && apiBaseUrl && <button className="button button-secondary" type="button" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? 'Signing out…' : 'Sign out'}</button>}</div></div>
      <section className="section-card settings-form-card"><div className="section-card-heading"><div className="heading-icon blue-icon"><Database size={18} /></div><div><h3>Business profile</h3><p>Saved values used for workspace labels and display preferences.</p></div></div><form onSubmit={saveProfile} className="form-stack"><div className="form-two-col"><label className="field-label">Business name <span className="required-mark">*</span><input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label><label className="field-label">Business type<select value={businessType} onChange={(event) => setBusinessType(event.target.value)}>{businessTypes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label></div><div className="form-two-col"><label className="field-label">Currency<input value={`${workspace.currency} — ${new Intl.DisplayNames(['en'], { type: 'currency' }).of(workspace.currency) ?? workspace.currency}`} disabled /><small className="field-help">{currencyLocked ? 'Locked after product or sales records exist to avoid silently reinterpreting stored prices.' : 'Currency changes require an explicit migration policy.'}</small></label><label className="field-label">Timezone<select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="Africa/Kampala">Kampala (EAT)</option><option value="Africa/Nairobi">Nairobi (EAT)</option><option value="Africa/Dar_es_Salaam">Dar es Salaam (EAT)</option><option value="UTC">UTC</option><option value="Europe/London">London</option></select></label></div><div className="form-info"><ShieldCheck size={16} /><p>Business profile changes are sent to the configured backend in API mode. Device-storage mode saves only in this browser and does not create a server audit event.</p></div><div><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save business profile'} <Check size={16} /></button></div></form></section>

      <section className="section-card integration-card"><div className="section-card-heading"><div className="heading-icon amber-icon"><CloudOff size={18} /></div><div><h3>Integration status</h3><p>Service states are only marked healthy after a real response.</p></div></div>{dataProviderMode === 'api' && <div className="backend-health-row"><div><strong>Backend health</strong><span className={'health-state ' + healthState}>{healthMessage}</span></div><button className="button button-secondary" type="button" disabled={healthState === 'checking'} onClick={() => void testBackend()}>{healthState === 'checking' ? 'Checking…' : 'Test backend connection'}</button></div>}<div className="integration-list">{integrations.map(({ title, description, icon: Icon, status }) => <div className="integration-row" key={title}><div className="integration-icon"><Icon size={18} /></div><div className="integration-copy"><strong>{title}</strong><span>{description}</span></div><span className={'status-pill ' + 'status-muted'}><span className="tiny-status-dot" /> {status}</span></div>)}</div></section>

      <section className="section-card privacy-card"><div className="section-card-heading"><div className="heading-icon green-icon"><ShieldCheck size={18} /></div><div><h3>Data & privacy</h3><p>Review where business records are stored and which services are available.</p></div></div><div className="privacy-grid"><div className="privacy-item"><Database size={17} /><div><strong>{dataProviderMode === 'api' ? 'Backend data service' : 'Browser IndexedDB'}</strong><p>{dataProviderMode === 'api' ? (apiBaseUrl ? 'Business requests use the configured backend API. Server authorization and tenant isolation remain mandatory.' : 'API mode is selected but the backend URL is missing. Configure VITE_API_BASE_URL before using business data.') : 'Business records stay on this device and do not sync to a shared server.'}</p></div></div><div className="privacy-item"><CloudOff size={17} /><div><strong>{dataProviderMode === 'api' ? 'Server-controlled sync' : 'No cross-device sync'}</strong><p>{dataProviderMode === 'api' ? 'Cross-device access depends on backend identity, authorization and persistence.' : 'Other devices and staff do not receive these records automatically.'}</p></div></div><div className="privacy-item"><LockKeyhole size={17} /><div><strong>Account security</strong><p>Sign-in and role-based access must be enabled before multiple staff can safely share a workspace.</p></div></div></div>{dataProviderMode === 'local' && <div className="warning-note"><strong>Important:</strong> Browser storage can be cleared by the user or browser. Keep an independent backup of critical business records.</div>}</section>
      <div className="settings-version-row"><span>LEXA frontend</span><strong>0.1.0</strong><span>Stack: React · TypeScript · Vite · {dataProviderMode === 'api' ? 'REST API' : 'Dexie local mode'}</span></div>
    </div>
  );
}
