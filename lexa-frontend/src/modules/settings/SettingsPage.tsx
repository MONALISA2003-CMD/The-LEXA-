import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CloudOff, Database, LockKeyhole, ShieldCheck, Smartphone, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import { localWorkspaceRepository } from '../../data/local/workspaces';
import { sales, products } from '../../data/repositories';

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
      await localWorkspaceRepository.update({ ...workspace, businessName: name, businessType, timezone });
      await refreshWorkspaces();
      await client.invalidateQueries({ queryKey: ['dashboard', workspace.id] });
      toast.success('Business settings saved locally');
    } catch (error) {
      toast.error('Settings were not saved', { description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setSaving(false); }
  }

  const integrations = [
    { title: 'Authentication & password recovery', description: 'Identity verification, sessions and account recovery', icon: LockKeyhole, status: 'Not connected' },
    { title: 'Shared backend & database', description: 'Multi-user access, server-side validation and cross-device sync', icon: Database, status: 'Not connected' },
    { title: 'Team invitations & chat', description: 'Deliver messages and manage remote team members', icon: Users, status: 'Not connected' },
    { title: 'Mobile money & payment processing', description: 'External payment initiation and transfer confirmation', icon: Smartphone, status: 'Not connected' },
    { title: 'URA / EFIRS tax integration', description: 'Official fiscal submission and response tracking', icon: ShieldCheck, status: 'Not connected' },
  ];

  return (
    <div className="page-stack">
      <div className="page-heading-row"><div><div className="eyebrow eyebrow-blue">PREFERENCES & CONNECTIONS</div><h2>Settings</h2><p>Manage business preferences and review connected services.</p></div><span className="soft-badge"><span className="status-dot" /> Device storage</span></div>
      <section className="section-card settings-form-card"><div className="section-card-heading"><div className="heading-icon blue-icon"><Database size={18} /></div><div><h3>Business profile</h3><p>Saved values used for workspace labels and display preferences.</p></div></div><form onSubmit={saveProfile} className="form-stack"><div className="form-two-col"><label className="field-label">Business name <span className="required-mark">*</span><input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label><label className="field-label">Business type<select value={businessType} onChange={(event) => setBusinessType(event.target.value)}>{businessTypes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label></div><div className="form-two-col"><label className="field-label">Currency<input value={`${workspace.currency} — ${new Intl.DisplayNames(['en'], { type: 'currency' }).of(workspace.currency) ?? workspace.currency}`} disabled /><small className="field-help">{currencyLocked ? 'Locked after product or sales records exist to avoid silently reinterpreting stored prices.' : 'Currency changes require an explicit migration policy.'}</small></label><label className="field-label">Timezone<select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="Africa/Kampala">Kampala (EAT)</option><option value="Africa/Nairobi">Nairobi (EAT)</option><option value="Africa/Dar_es_Salaam">Dar es Salaam (EAT)</option><option value="UTC">UTC</option><option value="Europe/London">London</option></select></label></div><div className="form-info"><ShieldCheck size={16} /><p>Business name and timezone changes are local preferences. A secure server-side audit log is not available until a backend is connected.</p></div><div><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save business profile'} <Check size={16} /></button></div></form></section>

      <section className="section-card integration-card"><div className="section-card-heading"><div className="heading-icon amber-icon"><CloudOff size={18} /></div><div><h3>Integration status</h3><p>Explicit status labels prevent unavailable external actions from being mistaken as live.</p></div></div><div className="integration-list">{integrations.map(({ title, description, icon: Icon }) => <div className="integration-row" key={title}><div className="integration-icon"><Icon size={18} /></div><div className="integration-copy"><strong>{title}</strong><span>{description}</span></div><span className="status-pill status-muted"><span className="tiny-status-dot" /> Not connected</span></div>)}</div></section>

      <section className="section-card privacy-card"><div className="section-card-heading"><div className="heading-icon green-icon"><ShieldCheck size={18} /></div><div><h3>Data & privacy</h3><p>Review where business records are stored and which services are available.</p></div></div><div className="privacy-grid"><div className="privacy-item"><Database size={17} /><div><strong>Browser IndexedDB</strong><p>Business records stay in this browser profile, not a shared server.</p></div></div><div className="privacy-item"><CloudOff size={17} /><div><strong>No cross-device sync</strong><p>Other devices and staff do not receive these records automatically.</p></div></div><div className="privacy-item"><LockKeyhole size={17} /><div><strong>Account security</strong><p>Sign-in and role-based access must be enabled before multiple staff can safely share a workspace.</p></div></div></div><div className="warning-note"><strong>Important:</strong> Browser storage can be cleared by the user or browser. Keep an independent backup of critical business records.</div></section>
      <div className="settings-version-row"><span>LEXA frontend</span><strong>0.1.0</strong><span>Stack: React · TypeScript · Vite · Dexie</span></div>
    </div>
  );
}
