import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Check, ShieldCheck, Sparkles, Store } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { workspaces } from '../../data/repositories';
import { apiBaseUrl, dataProviderMode } from '../../data/remote/runtimeConfig';

function readPreference(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function writePreference(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* Backend workspace creation must not depend on preferences. */ } }

const businessTypes = [
  { value: 'retail', label: 'Retail shop' },
  { value: 'wholesale', label: 'Wholesale / distribution' },
  { value: 'restaurant', label: 'Restaurant / food business' },
  { value: 'services', label: 'Salon / service business' },
  { value: 'electronics', label: 'Electronics / appliances' },
  { value: 'general', label: 'General SME' },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('retail');
  const [branchName, setBranchName] = useState('Main branch');
  const [currency, setCurrency] = useState('UGX');
  const [timezone, setTimezone] = useState('Africa/Kampala');
  const [saving, setSaving] = useState(false);
  const [savedWorkspaceName, setSavedWorkspaceName] = useState('');
  const [openingSaved, setOpeningSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void workspaces.list().then((items) => {
      if (cancelled) return;
      const activeId = readPreference('lexa.ui.activeWorkspaceId');
      const selected = items.find((item) => item.id === activeId) ?? items[0];
      setSavedWorkspaceName(selected?.businessName ?? '');
    }).catch(() => { /* A fresh browser can legitimately have no saved workspace. */ });
    return () => { cancelled = true; };
  }, []);

  async function openSavedWorkspace() {
    setOpeningSaved(true);
    try {
      const items = await workspaces.list();
      const activeId = readPreference('lexa.ui.activeWorkspaceId');
      const workspace = items.find((item) => item.id === activeId) ?? items[0];
      if (!workspace) throw new Error('No saved workspace was found in this browser. Create a workspace below.');
      let branches = await workspaces.listBranches(workspace.id);
      if (!branches.length) {
        const repairedBranch = await workspaces.createBranch({ workspaceId: workspace.id, name: 'Main branch' });
        branches = [repairedBranch];
      }
      writePreference('lexa.ui.activeWorkspaceId', workspace.id);
      writePreference('lexa.ui.activeBranchId', branches[0]!.id);
      toast.success('Opening saved workspace', { description: workspace.businessName });
      navigate('/', { replace: true });
    } catch (error) {
      toast.error('Could not open the saved workspace', { description: error instanceof Error ? error.message : 'Try creating a new workspace below.' });
    } finally {
      setOpeningSaved(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      if (dataProviderMode === 'api' && !apiBaseUrl) throw new Error('The backend URL is not configured. Set VITE_API_BASE_URL before creating a production workspace.');
      const workspace = await workspaces.create({ businessName, businessType, branchName, currency, timezone });
      writePreference('lexa.ui.activeWorkspaceId', workspace.id);
      toast.success('Business workspace created', { description: dataProviderMode === 'api' ? 'Your setup was created by the backend.' : 'Your setup is saved on this device.' });
      navigate('/', { replace: true });
    } catch (error) {
      toast.error('Could not create workspace', { description: error instanceof Error ? error.message : 'Please check the form and try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="onboarding-shell">
      <div className="onboarding-brand"><img className="onboarding-brand-logo" src="/lexa-logo.png" alt="LEXA — Sales, Inventory, Business Management" /></div>
      <div className="onboarding-layout">
        <section className="onboarding-intro">
          <div className="mini-label"><Sparkles size={14} /> YOUR BUSINESS, CONNECTED</div>
          <h1>Let’s set up your <span>workspace.</span></h1>
          <p>Start with your business details. You’ll be able to add products, record stock, make sales and trace what changed — all in one place.</p>
          <div className="onboarding-benefits">
            <div><span className="benefit-icon"><Check size={17} /></span><div><strong>Records that connect</strong><p>Sales link to stock movements, payments and receipts.</p></div></div>
            <div><span className="benefit-icon"><Check size={17} /></span><div><strong>{dataProviderMode === 'api' ? 'Server-managed records' : 'Saved on this device'}</strong><p>{dataProviderMode === 'api' ? 'Workspace and branch records are created and checked by the configured server.' : 'Your local records remain after a page refresh in this browser.'}</p></div></div>
            <div><span className="benefit-icon"><ShieldCheck size={17} /></span><div><strong>Access and security</strong><p>{dataProviderMode === 'api' ? 'Only backend-authorized users should access a workspace or branch.' : 'Device-only mode does not provide shared access or account security.'}</p></div></div>
          </div>
          <div className="onboarding-local-note"><span className="status-dot" /> WORKSPACE SETUP <span className="note-divider">·</span> BUSINESS DETAILS</div>
        </section>
        <section className="setup-card">
          <div className="setup-card-icon"><Store size={21} /></div>
          <div className="setup-card-heading"><h2>Business details</h2><p>You can update these settings later.</p></div>
          {savedWorkspaceName && <div className="saved-workspace-recovery"><div><strong>Workspace already saved</strong><span>{savedWorkspaceName}</span></div><button type="button" className="button button-secondary button-wide" onClick={() => void openSavedWorkspace()} disabled={openingSaved}>{openingSaved ? 'Opening workspace…' : 'Open saved workspace'} <ArrowRight size={16} /></button></div>}
          <form onSubmit={handleSubmit} className="form-stack">
            <label className="field-label">Business name <span className="required-mark">*</span><input autoFocus required maxLength={100} value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Enter your business name" /></label>
            <label className="field-label">Business type <select value={businessType} onChange={(event) => setBusinessType(event.target.value)}>{businessTypes.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}</select></label>
            <label className="field-label">First branch name <span className="required-mark">*</span><input required maxLength={80} value={branchName} onChange={(event) => setBranchName(event.target.value)} placeholder="Enter your first branch name" /></label>
            <div className="form-two-col">
              <label className="field-label">Currency<select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="UGX">UGX — Uganda shilling</option><option value="KES">KES — Kenya shilling</option><option value="TZS">TZS — Tanzania shilling</option><option value="USD">USD — US dollar</option><option value="GBP">GBP — Pound sterling</option><option value="EUR">EUR — Euro</option></select></label>
              <label className="field-label">Timezone<select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="Africa/Kampala">Kampala (EAT)</option><option value="Africa/Nairobi">Nairobi (EAT)</option><option value="Africa/Dar_es_Salaam">Dar es Salaam (EAT)</option><option value="UTC">UTC</option><option value="Europe/London">London</option></select></label>
            </div>
            <div className="form-info"><ShieldCheck size={16} /><p>{dataProviderMode === 'api' ? 'This submits workspace setup to the configured API. A user session and server permissions are required.' : 'This creates a device-only workspace. It does not create an account, invite team members or enable cross-device sync.'}</p></div>
            <button className="button button-primary button-wide" type="submit" disabled={saving || (dataProviderMode === 'api' && !apiBaseUrl)}>{saving ? 'Creating workspace…' : dataProviderMode === 'api' && !apiBaseUrl ? 'Backend URL required' : 'Create workspace'} <ArrowRight size={17} /></button>
          </form>
          <div className="setup-footnote"><span className="status-dot" /> {dataProviderMode === 'api' ? 'Server-backed workspace setup' : 'Saved locally in this browser'}</div>
        </section>
      </div>
      <footer className="onboarding-footer"><span>LEXA · Business workspace</span><span>Designed for connected, accountable business work.</span></footer>
    </main>
  );
}
