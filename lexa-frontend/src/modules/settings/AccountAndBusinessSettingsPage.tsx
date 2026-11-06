import { lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BriefcaseBusiness, LockKeyhole, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { useWorkspace } from '../../app/WorkspaceContext';
import { apiTeamAccess } from '../../data/remote/apiTeamAccess';
import { isApiProvider } from '../../data/remote/runtimeConfig';
import './account-and-business-settings.css';

const BusinessProfile = lazy(() => import('./SettingsPage'));
const AccountSecurity = lazy(() => import('../account/AccountSecurityPage'));
const PrivacyPreferences = lazy(() => import('../account/PrivacyPreferencesPage'));
const BusinessTools = lazy(() => import('../tools/BusinessToolsPage'));

type SettingsSection = 'business' | 'security' | 'privacy' | 'tools';
const tabDefinitions = [
  { id: 'business', label: 'Business profile', description: 'Company information and business preferences', icon: BriefcaseBusiness, ownerOnly: true },
  { id: 'security', label: 'Account security', description: 'Sign-in protection, sessions and authenticator', icon: LockKeyhole, ownerOnly: false },
  { id: 'privacy', label: 'Privacy preferences', description: 'Consent choices and account privacy', icon: ShieldCheck, ownerOnly: false },
  { id: 'tools', label: 'Business tools', description: 'Cash-up, compliance, data management and capture', icon: SlidersHorizontal, ownerOnly: true },
] as const;

/** One client-facing settings module; its existing functions retain their authorization. */
export default function AccountAndBusinessSettingsPage() {
  const { workspace } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const access = useQuery({
    queryKey: ['business-access', workspace.id],
    queryFn: () => apiTeamAccess.access(workspace.id),
    enabled: isApiProvider,
    staleTime: 20_000,
  });
  const isOwner = !isApiProvider || access.data?.isOwner === true;
  const tabs = tabDefinitions.filter(tab => !tab.ownerOnly || isOwner);
  const requested = params.get('section');
  const section: SettingsSection = tabs.find(tab => tab.id === requested)?.id ?? (isOwner ? 'business' : 'security');

  function select(next: SettingsSection) {
    if (!tabs.some(tab => tab.id === next)) return;
    setParams(current => {
      const value = new URLSearchParams(current);
      value.set('section', next);
      return value;
    });
  }

  return <div className="account-business-settings page-stack">
    <header className="account-business-settings-header">
      <div className="eyebrow eyebrow-blue">WORKSPACE ADMINISTRATION</div>
      <h2>Account & business settings</h2>
      <p>Manage your account protection, privacy preferences and authorized business operations in one place.</p>
    </header>
    <nav aria-label="Account and business settings sections" className="account-business-settings-tabs">
      {tabs.map(tab => <button key={tab.id} type="button"
        aria-current={section === tab.id ? 'page' : undefined}
        className={`account-business-settings-tab ${section === tab.id ? 'is-active' : ''}`}
        onClick={() => select(tab.id)}>
        <tab.icon size={19} aria-hidden="true" />
        <span><strong>{tab.label}</strong><small>{tab.description}</small></span>
      </button>)}
    </nav>
    <section aria-label={`${tabs.find(tab => tab.id === section)?.label ?? 'Account'} settings`}>
      <Suspense fallback={<p role="status" className="account-business-settings-loading">Opening your account settings…</p>}>
        {section === 'business' && isOwner ? <BusinessProfile /> : null}
        {section === 'security' ? <AccountSecurity /> : null}
        {section === 'privacy' ? <PrivacyPreferences /> : null}
        {section === 'tools' && isOwner ? <BusinessTools /> : null}
      </Suspense>
    </section>
  </div>;
}
