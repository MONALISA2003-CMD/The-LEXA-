import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Cookie, ShieldCheck } from '../../components/LexaIcon';
import { apiAuth } from '../../data/remote/apiAuth';
import { businessErrorMessage } from '../../data/remote/businessMessages';
import './account-security.css';
export default function PrivacyPreferencesPage() {
    const client = useQueryClient();
    const record = useQuery({ queryKey: ['privacy-preferences'], queryFn: apiAuth.privacyPreferences, staleTime: 30000 });
    const [analytics, setAnalytics] = useState(false);
    const [saving, setSaving] = useState(false);
    useEffect(() => { if (record.data)
        setAnalytics(record.data.optionalAnalytics); }, [record.data]);
    async function save() {
        setSaving(true);
        try {
            const next = await apiAuth.setPrivacyPreferences(analytics);
            client.setQueryData(['privacy-preferences'], next);
            toast.success('Privacy preferences saved.');
        }
        catch (error) {
            toast.error('Preferences were not saved', { description: businessErrorMessage(error) });
        }
        finally {
            setSaving(false);
        }
    }
    return <main className="page-stack account-security-page"><header className="account-security-heading"><div><span className="account-security-eyebrow"><Cookie size={16}/> PRIVACY CONTROLS</span><h1>Privacy preferences</h1><p>Control optional analytics for your LEXA account. Essential security cookies are not optional.</p></div><Link className="button button-secondary" to="/settings/security">Account security</Link></header>
    <section className="section-card account-security-section"><h2>Essential security cookies</h2><p>These keep your session signed in, protect forms from cross-site requests and remember a verified browser. LEXA cannot provide authenticated business services without essential session controls.</p><div className="account-security-status"><ShieldCheck size={17}/> Always active</div><Link to="/legal/cookies">Read the cookie policy</Link></section>
    <section className="section-card account-security-section"><h2>Optional analytics</h2><p>Optional analytics are off by default. Your choice is recorded with the active policy version. Enabling this preference does not enable any unconfigured analytics provider.</p>
      {record.isPending && <p role="status">Loading your privacy preferences…</p>}
      {record.isError && <p role="alert">{businessErrorMessage(record.error)}</p>}
      {record.data && <><label className="account-security-check"><input type="checkbox" checked={analytics} onChange={event => setAnalytics(event.target.checked)}/><span>Allow optional product-usage analytics</span></label><p className="account-security-note">Policy version {record.data.policyVersion}{record.data.updatedAt ? ` · Last updated ${new Date(record.data.updatedAt).toLocaleString()}` : ''}</p><button className="button button-primary" disabled={saving || analytics === record.data.optionalAnalytics} onClick={() => void save()}>{saving ? 'Saving…' : 'Save preferences'}</button></>}
    </section><section className="section-card account-security-section"><h2>Further information</h2><p>You can review how LEXA processes account information and how to make a privacy inquiry.</p><div className="account-security-actions"><Link to="/legal/privacy">Read the privacy policy</Link><Link to="/legal/cookies">Read the cookie policy</Link></div></section>
  </main>;
}
