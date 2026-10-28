import { useState, type FormEvent } from 'react';
import { ArrowRight, Check, ShieldCheck, Sparkles, Store } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { localWorkspaceRepository } from '../../data/local/workspaces';

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const workspace = await localWorkspaceRepository.create({ businessName, businessType, branchName, currency, timezone });
      localStorage.setItem('lexa.ui.activeWorkspaceId', workspace.id);
      toast.success('Business workspace created', { description: 'Your setup is saved on this device.' });
      navigate('/', { replace: true });
    } catch (error) {
      toast.error('Could not create workspace', { description: error instanceof Error ? error.message : 'Please check the form and try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="onboarding-shell">
      <div className="onboarding-brand"><div className="brand-mark">L</div><div><strong>LEXA</strong><span>BUSINESS OPERATING WORKSPACE</span></div></div>
      <div className="onboarding-layout">
        <section className="onboarding-intro">
          <div className="mini-label"><Sparkles size={14} /> YOUR BUSINESS, CONNECTED</div>
          <h1>Let’s set up your <span>workspace.</span></h1>
          <p>Start with your business details. You’ll be able to add products, record stock, make sales and trace what changed — all in one place.</p>
          <div className="onboarding-benefits">
            <div><span className="benefit-icon"><Check size={17} /></span><div><strong>Records that connect</strong><p>Sales link to stock movements, payments and receipts.</p></div></div>
            <div><span className="benefit-icon"><Check size={17} /></span><div><strong>Saved on this device</strong><p>Your local records remain after a page refresh.</p></div></div>
            <div><span className="benefit-icon"><ShieldCheck size={17} /></span><div><strong>Clear about limitations</strong><p>Shared access and server services are not connected yet.</p></div></div>
          </div>
          <div className="onboarding-local-note"><span className="status-dot" /> LOCAL-FIRST PREVIEW <span className="note-divider">·</span> NO BACKEND CONNECTED</div>
        </section>
        <section className="setup-card">
          <div className="setup-card-icon"><Store size={21} /></div>
          <div className="setup-card-heading"><h2>Business details</h2><p>You can update these settings later.</p></div>
          <form onSubmit={handleSubmit} className="form-stack">
            <label className="field-label">Business name <span className="required-mark">*</span><input autoFocus required maxLength={100} value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="e.g. Amaal Traders" /></label>
            <label className="field-label">Business type <select value={businessType} onChange={(event) => setBusinessType(event.target.value)}>{businessTypes.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}</select></label>
            <label className="field-label">First branch name <span className="required-mark">*</span><input required maxLength={80} value={branchName} onChange={(event) => setBranchName(event.target.value)} placeholder="e.g. Main branch" /></label>
            <div className="form-two-col">
              <label className="field-label">Currency<select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="UGX">UGX — Uganda shilling</option><option value="KES">KES — Kenya shilling</option><option value="TZS">TZS — Tanzania shilling</option><option value="USD">USD — US dollar</option><option value="GBP">GBP — Pound sterling</option><option value="EUR">EUR — Euro</option></select></label>
              <label className="field-label">Timezone<select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="Africa/Kampala">Kampala (EAT)</option><option value="Africa/Nairobi">Nairobi (EAT)</option><option value="Africa/Dar_es_Salaam">Dar es Salaam (EAT)</option><option value="UTC">UTC</option><option value="Europe/London">London</option></select></label>
            </div>
            <div className="form-info"><ShieldCheck size={16} /><p>This creates a local workspace only. It does not create a login, invite team members or enable cross-device sync.</p></div>
            <button className="button button-primary button-wide" type="submit" disabled={saving}>{saving ? 'Creating workspace…' : 'Create workspace'} <ArrowRight size={17} /></button>
          </form>
          <div className="setup-footnote"><span className="status-dot" /> Saved locally in this browser</div>
        </section>
      </div>
      <footer className="onboarding-footer"><span>LEXA · Early frontend milestone</span><span>Designed for connected, accountable business work.</span></footer>
    </main>
  );
}
