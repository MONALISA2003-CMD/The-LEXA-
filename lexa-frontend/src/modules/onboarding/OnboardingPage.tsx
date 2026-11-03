import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Check, LogIn, ShieldCheck, Sparkles, Building2, RefreshCw } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { workspaces } from '../../data/repositories';
import { apiAuth } from '../../data/remote/apiAuth';
import { apiBaseUrl, isApiProvider } from '../../data/remote/runtimeConfig';
import { businessErrorMessage } from '../../data/remote/businessMessages';
import { resolveBusinessSelection } from '../../app/resolveBusinessSelection';
import type { Workspace } from '../../domain/shared/types';

const WORKSPACE_KEY = 'lexa.ui.activeWorkspaceId';
const BRANCH_KEY = 'lexa.ui.activeBranchId';

type EntryStatus = 'checking' | 'ready' | 'guest' | 'error';
function readPreference(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function writePreference(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* Never store business records in preferences. */ } }

const businessTypes = [
  { value: 'retail', label: 'Retail shop' },
  { value: 'wholesale', label: 'Wholesale / distribution' },
  { value: 'restaurant', label: 'Restaurant / food business' },
  { value: 'services', label: 'Salon / service business' },
  { value: 'electronics', label: 'Electronics / appliances' },
  { value: 'general', label: 'Other business' },
];

/** Account entry and business setup are separate steps. Never offer business creation to signed-out users. */
export default function OnboardingPage() {
  const navigate = useNavigate();
  const [entryStatus, setEntryStatus] = useState<EntryStatus>(isApiProvider ? 'checking' : 'ready');
  const [entryError, setEntryError] = useState('');
  const [businessRecoveryNeeded, setBusinessRecoveryNeeded] = useState(false);
  const [businesses, setBusinesses] = useState<Workspace[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [showCreation, setShowCreation] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('retail');
  const [branchName, setBranchName] = useState('Main branch');
  const [currency, setCurrency] = useState('UGX');
  const [timezone, setTimezone] = useState('Africa/Kampala');
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  const [actionError, setActionError] = useState('');
  const [createdButNotOpened, setCreatedButNotOpened] = useState(false);

  const loadBusinesses = useCallback(async () => {
    setEntryStatus('checking');
    setEntryError('');
    setBusinessRecoveryNeeded(false);
    if (isApiProvider && !apiBaseUrl) {
      setEntryError('LEXA cannot connect to your business account right now. Please contact your administrator.');
      setEntryStatus('error');
      return;
    }
    if (isApiProvider) {
      try { await apiAuth.getSession(); }
      catch (error) {
        if (error && typeof error === 'object' && 'status' in error && (error as { status?: unknown }).status === 401) {
          setEntryStatus('guest');
          return;
        }
        setEntryError(businessErrorMessage(error));
        setEntryStatus('error');
        return;
      }
    }
    try {
      const items = await workspaces.list();
      const savedId = readPreference(WORKSPACE_KEY);
      const recovered = await resolveBusinessSelection(items, savedId, workspaces.getById);
      setBusinesses(recovered.businesses);
      setSelectedBusinessId(recovered.selected?.id ?? '');
      if (isApiProvider && savedId && recovered.businesses.length === 0) {
        // Do not encourage a duplicate when the user already opened a business
        // on this device but the service briefly fails to return its membership.
        setBusinessRecoveryNeeded(true);
        setEntryError('We could not find the business you opened previously. Try again, or sign in with the account that owns it. Your records have not been deleted.');
        setEntryStatus('error');
        return;
      }
      setEntryStatus('ready');
    } catch (error) {
      setEntryError(businessErrorMessage(error));
      setEntryStatus('error');
    }
  }, []);

  useEffect(() => { void loadBusinesses(); }, [loadBusinesses]);

  async function openBusiness(business: Workspace): Promise<void> {
    // Only navigate after confirming that the first branch is available.
    let branches = await workspaces.listBranches(business.id);
    if (branches.length === 0) {
      const main = await workspaces.createBranch({ workspaceId: business.id, name: 'Main branch' });
      branches = [main];
    }
    const chosen = branches.find((item) => item.id === readPreference(BRANCH_KEY)) ?? branches[0];
    if (!chosen?.id) throw new Error('Your business is saved, but its first branch could not be opened. Please try again.');
    writePreference(WORKSPACE_KEY, business.id);
    writePreference(BRANCH_KEY, chosen.id);
    // Carry the verified selection into the business shell even when the next
    // business-list response is delayed or the browser blocks local preferences.
    // The shell still checks authorization and branch availability with the server.
    navigate('/', { replace: true, state: { openBusinessId: business.id, openBranchId: chosen.id } });
  }

  async function openSelectedBusiness() {
    const business = businesses.find((item) => item.id === selectedBusinessId);
    if (!business) { setActionError('Please choose the business you want to open.'); return; }
    setActionError('');
    setOpening(true);
    try { await openBusiness(business); }
    catch (error) { setActionError(businessErrorMessage(error)); }
    finally { setOpening(false); }
  }

  async function createBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (entryStatus !== 'ready' || saving) return;
    setActionError('');
    const duplicate = businesses.find((item) => item.businessName.trim().toLocaleLowerCase() === businessName.trim().toLocaleLowerCase());
    if (duplicate) {
      setSelectedBusinessId(duplicate.id);
      setShowCreation(false);
      setActionError('That business is already on your account. Select “Open my business” instead of creating it again.');
      return;
    }
    setSaving(true);
    let created: Workspace | null = null;
    try {
      const newBusiness = await workspaces.create({ businessName, businessType, branchName, currency, timezone });
      created = newBusiness;
      setBusinesses((previous) => previous.some((item) => item.id === newBusiness.id) ? previous : [...previous, newBusiness]);
      setSelectedBusinessId(newBusiness.id);
      setCreatedButNotOpened(true);
      setShowCreation(false);
      await openBusiness(created);
    } catch (error) {
      if (created) {
        setActionError(`“${created.businessName}” has been created, but we could not open it yet. Choose “Open my business” to continue. ${businessErrorMessage(error)}`);
      } else {
        // A delayed response may have saved the business; reload the list before any further attempt.
        try {
          const latest = await workspaces.list();
          const recovered = await resolveBusinessSelection(latest, readPreference(WORKSPACE_KEY), workspaces.getById);
          setBusinesses(recovered.businesses);
          const matching = recovered.businesses.find((item) => item.businessName.trim().toLocaleLowerCase() === businessName.trim().toLocaleLowerCase());
          if (matching) {
            setSelectedBusinessId(matching.id);
            setShowCreation(false);
            setCreatedButNotOpened(true);
            setActionError('Your business has been saved. Choose “Open my business” to continue.');
          } else setActionError(businessErrorMessage(error));
        } catch { setActionError(businessErrorMessage(error)); }
      }
    } finally { setSaving(false); }
  }

  const hasBusinesses = businesses.length > 0;
  const showForm = entryStatus === 'ready' && (!hasBusinesses || showCreation);

  return (
    <main className="onboarding-shell">
      <header className="onboarding-brand business-entry-header">
        <Link to="/sign-in" aria-label="LEXA sign-in"><img className="onboarding-brand-logo" src="/lexa-logo.png" alt="LEXA — Business management" /></Link>
        {isApiProvider && <Link to="/sign-in" className="business-entry-signin"><LogIn size={17} /> Sign in to another account</Link>}
      </header>
      <div className="onboarding-layout">
        <section className="onboarding-intro">
          <div className="mini-label"><Sparkles size={14} /> YOUR BUSINESS, SIMPLIFIED</div>
          <h1>{entryStatus === 'guest' ? <>Welcome back to <span>LEXA.</span></> : hasBusinesses ? <>Welcome to your <span>business.</span></> : <>Your business. <span>One place.</span></>}</h1>
          <p>{entryStatus === 'guest' ? 'Sign in to open your existing businesses, continue your work and manage your team.' : hasBusinesses ? 'Choose your business to continue working, or add another business to your account.' : 'Manage sales, stock, customers, finances and your team with confidence.'}</p>
          <div className="onboarding-benefits">
            <div><span className="benefit-icon"><Check size={17} /></span><div><strong>Keep business moving</strong><p>See what needs attention and pick up where you left off.</p></div></div>
            <div><span className="benefit-icon"><Check size={17} /></span><div><strong>Everything connected</strong><p>Sales, products, stock and payments work together.</p></div></div>
            <div><span className="benefit-icon"><ShieldCheck size={17} /></span><div><strong>Private to your business</strong><p>Your team only accesses the businesses and information they are allowed to use.</p></div></div>
          </div>
        </section>
        <section className="setup-card" aria-label="Business access">
          <div className="setup-card-icon"><Building2 size={22} /></div>
          {entryStatus === 'checking' && <div role="status" className="business-entry-status"><h2>Finding your businesses…</h2><p>We're checking your account so you can continue where you left off.</p></div>}
          {entryStatus === 'guest' && <div className="business-entry-panel">
            <h2>Already have a LEXA account?</h2>
            <p>Sign in with your business email and password. Your existing businesses will be ready to open.</p>
            <Link to="/sign-in" state={{ returnTo: '/onboarding' }} className="button button-primary button-wide business-entry-cta"><LogIn size={18} /> Sign in to my account <ArrowRight size={18} /></Link>
            <div className="business-entry-help"><strong>New to LEXA?</strong><span>Ask your business administrator to invite you. Your business details will be ready after you sign in.</span></div>
          </div>}
          {entryStatus === 'error' && <div className="business-entry-panel" role="alert">
            <h2>We couldn't open your business account.</h2>
            <p>{entryError}</p>
            <button type="button" className="button button-primary button-wide business-entry-cta" onClick={() => void loadBusinesses()}><RefreshCw size={17} /> Try again</button>
            <Link to="/sign-in" className="business-entry-alt-link">Return to sign in</Link>
            {businessRecoveryNeeded && <button type="button" className="business-entry-secondary" onClick={() => { setBusinessRecoveryNeeded(false); setEntryStatus('ready'); setShowCreation(true); setActionError(''); }}>Set up a different business</button>}
          </div>}
          {entryStatus === 'ready' && <>
            {hasBusinesses && !showCreation && <div className="business-entry-panel">
              <div className="setup-card-heading"><h2>Choose your business</h2><p>Open an existing business and continue your work.</p></div>
              <label className="field-label" htmlFor="existing-business">Your businesses</label>
              <select className="business-entry-select" id="existing-business" value={selectedBusinessId} onChange={(event) => setSelectedBusinessId(event.target.value)}>
                {businesses.map((business) => <option key={business.id} value={business.id}>{business.businessName}</option>)}
              </select>
              {createdButNotOpened && <p className="business-entry-recovery" role="status">Your business is saved. You can open it here.</p>}
              {actionError && <p className="business-entry-error" role="alert">{actionError}</p>}
              <button type="button" className="button button-primary button-wide business-entry-cta" onClick={() => void openSelectedBusiness()} disabled={opening}>
                {opening ? 'Opening your business…' : 'Open my business'} <ArrowRight size={18} />
              </button>
              <button type="button" className="business-entry-secondary" onClick={() => { setActionError(''); setShowCreation(true); }}>Add another business</button>
            </div>}
            {showForm && <>
              <div className="setup-card-heading"><h2>{hasBusinesses ? 'Add another business' : 'Set up your business'}</h2><p>Tell us about your business. You can change these details later.</p></div>
              <form onSubmit={(event) => void createBusiness(event)} className="form-stack">
                <label className="field-label">Business name <span className="required-mark">*</span><input autoFocus required maxLength={100} value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="For example, My Trading Company" /></label>
                <label className="field-label">What kind of business do you run?<select value={businessType} onChange={(event) => setBusinessType(event.target.value)}>{businessTypes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
                <label className="field-label">First branch name <span className="required-mark">*</span><input required maxLength={80} value={branchName} onChange={(event) => setBranchName(event.target.value)} placeholder="For example, Main branch" /></label>
                <div className="form-two-col">
                  <label className="field-label">Currency<select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="UGX">UGX — Uganda shilling</option><option value="KES">KES — Kenya shilling</option><option value="TZS">TZS — Tanzania shilling</option><option value="USD">USD — US dollar</option><option value="GBP">GBP — Pound sterling</option><option value="EUR">EUR — Euro</option></select></label>
                  <label className="field-label">Time zone<select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="Africa/Kampala">Kampala (EAT)</option><option value="Africa/Nairobi">Nairobi (EAT)</option><option value="Africa/Dar_es_Salaam">Dar es Salaam (EAT)</option><option value="UTC">UTC</option><option value="Europe/London">London</option></select></label>
                </div>
                <div className="form-info"><ShieldCheck size={16} /><p>Your business details are saved securely to your account. You can invite your team after setup.</p></div>
                {actionError && <p className="business-entry-error" role="alert">{actionError}</p>}
                <button className="button button-primary button-wide" type="submit" disabled={saving}>{saving ? 'Setting up your business…' : 'Create and open my business'} <ArrowRight size={17} /></button>
                {hasBusinesses && <button type="button" className="business-entry-secondary" onClick={() => { setShowCreation(false); setActionError(''); }}>Back to my businesses</button>}
              </form>
            </>}
          </>}
        </section>
      </div>
      <footer className="onboarding-footer"><span>LEXA · Business management</span><span>Built to help your business run smoothly.</span></footer>
    </main>
  );
}
