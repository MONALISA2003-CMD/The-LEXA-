import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, Building2, CheckCircle2, CreditCard, FileCheck2, LockKeyhole,
  Mail, MapPin, Settings2, ShieldCheck, Users, Wallet,
} from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { businessSetupApi } from '../../data/remote/businessSetup';
import { apiTeamAccess } from '../../data/remote/apiTeamAccess';
import './my-business.css';

/**
 * My Business deliberately displays the CEO's existing tenant, not a new company.
 * Permission checks here determine presentation only; the API remains authoritative.
 */
export default function WorkspacePage() {
  const { workspace } = useWorkspace();
  const accessQuery = useQuery({
    queryKey: ['business-access', workspace.id],
    queryFn: () => apiTeamAccess.access(workspace.id),
  });
  const setupQuery = useQuery({
    queryKey: ['business-setup-summary', workspace.id],
    queryFn: () => businessSetupApi.read(workspace.id),
  });
  const owner = accessQuery.data?.isOwner === true;
  const profile = setupQuery.data;
  const teamQuery = useQuery({
    queryKey: ['team-access-members', workspace.id],
    queryFn: () => apiTeamAccess.members(workspace.id),
    enabled: owner,
  });
  const activeMembers = teamQuery.data?.filter(member => member.status === 'ACTIVE').length;
  const enabledMethods = profile?.paymentMethods?.filter(method => method.enabled) ?? [];
  const address = [profile?.physicalAddress, profile?.city, profile?.country]
    .filter(Boolean).join(', ');

  return <div className="page-stack my-business-page" data-module-accent="navy">
    <section className="my-business-hero" aria-labelledby="my-business-title">
      <div className="my-business-kicker"><ShieldCheck size={16} /> VERIFIED BUSINESS WORKSPACE</div>
      <div className="my-business-hero-layout">
        <div className="my-business-hero-row">
          <div className="my-business-avatar"><Building2 size={29} /></div>
          <div className="my-business-hero-copy">
            <h2 id="my-business-title">{workspace.businessName}</h2>
            <p>Your business identity, trusted records and people in one secure place.</p>
          </div>
        </div>
        {owner && <Link to="/business-setup" className="button button-primary my-business-hero-edit">
          <Settings2 size={16} /> Edit business profile <ArrowRight size={15} />
        </Link>}
      </div>
      <div className="my-business-hero-stats" aria-label="Business account summary">
        <span><CheckCircle2 size={16} /> Active business</span>
        <span><Wallet size={16} /> {workspace.currency}</span>
        <span><LockKeyhole size={16} /> {owner ? 'CEO / Owner' : accessQuery.data?.role?.replaceAll('_', ' ') || 'Assigned team access'}</span>
      </div>
    </section>

    {accessQuery.isError && <div className="inline-error" role="alert">Unable to verify your business role. Reload to try again. Management controls remain unavailable.</div>}
    {setupQuery.isError && <div className="inline-error" role="alert">Business profile details could not be loaded. Your CEO permissions have not been changed. <button type="button" className="button button-secondary button-small" onClick={() => void setupQuery.refetch()}>Retry profile</button></div>}
    <div className="my-business-heading">
      <div><span className="eyebrow eyebrow-blue">BUSINESS CONTROL CENTRE</span><h3>Your company, configured your way</h3>
        <p>Keep your business details, secure staff access and recording preferences up to date.</p></div>
    </div>

    <div className="my-business-grid">
      <section className="section-card my-business-info" aria-labelledby="my-business-profile-heading">
        <div className="section-card-heading"><span className="heading-icon blue-icon"><Building2 size={18} /></span>
          <div><h3 id="my-business-profile-heading">Business profile</h3><p>A consistent company identity across LEXA records.</p></div></div>
        <div className="my-business-facts">
          <div><span>Trading name</span><strong>{profile?.tradingName || workspace.businessName}</strong></div>
          <div><span>Industry</span><strong>{profile?.industry?.replaceAll('_', ' ') || 'Not configured yet'}</strong></div>
          <div><span>Business address</span><strong>{address || 'Not supplied'}</strong></div>
          <div><span>Contact email</span><strong>{profile?.email || 'Not supplied'}</strong></div>
          <div><span>Business phone</span><strong>{profile?.phone || 'Not supplied'}</strong></div>
          <div><span>Business timezone</span><strong>{workspace.timezone}</strong></div>
        </div>
        {owner && <Link to="/business-setup" className="button button-secondary my-business-link">
          <FileCheck2 size={16} /> Manage profile <ArrowRight size={16} />
        </Link>}
      </section>

      <section className="section-card my-business-info" aria-labelledby="my-business-team-heading">
        <div className="section-card-heading"><span className="heading-icon green-icon"><Users size={18} /></span>
          <div><h3 id="my-business-team-heading">Team & permissions</h3><p>Only the CEO can invite employees and assign roles.</p></div></div>
        {owner ? <>
          <div className="my-business-team-count"><strong>{activeMembers ?? '—'}</strong>
            <span>Active business memberships, including the CEO</span></div>
          {teamQuery.isError && <p className="text-muted" role="status">Team count is unavailable. Access settings remain protected.</p>}
          <p className="text-muted">Give each employee their own login and the permissions needed for their work. You can suspend access while preserving business history.</p>
          <Link to="/team" className="button button-primary my-business-link"><Users size={16} /> Manage team & roles <ArrowRight size={16} /></Link>
        </> : <div className="my-business-access-note"><ShieldCheck size={20} />
          <span>Your CEO manages employee invitations and role permissions. You can use only the business functions assigned to your role.</span></div>}
      </section>

      <section className="section-card my-business-info" aria-labelledby="my-business-payments-heading">
        <div className="section-card-heading"><span className="heading-icon amber-icon"><CreditCard size={18} /></span>
          <div><h3 id="my-business-payments-heading">Payment recording</h3><p>Methods used to record independently confirmed payments.</p></div></div>
        <div className="my-business-methods">{enabledMethods.length ? enabledMethods.map(method => <span key={method.code}>{method.label}</span>) :
          <p className="text-muted">No payment recording methods are configured yet.</p>}</div>
        <p className="my-business-help-note">LEXA records receipts; it does not verify or transfer funds through a payment gateway.</p>
        {owner && <Link to="/business-setup" className="button button-secondary my-business-link"><Settings2 size={16} /> Configure methods <ArrowRight size={16} /></Link>}
      </section>

      <section className="section-card my-business-info" aria-labelledby="my-business-security-heading">
        <div className="section-card-heading"><span className="heading-icon blue-icon"><ShieldCheck size={18} /></span>
          <div><h3 id="my-business-security-heading">Security & governance</h3><p>Protect sensitive business data and ownership.</p></div></div>
        <div className="my-business-feature"><LockKeyhole size={18} /><span>Membership and permissions are checked by the backend for protected operations.</span></div>
        <div className="my-business-feature"><Mail size={18} /><span>Employees use individual accounts and time-limited invitation links.</span></div>
        <div className="my-business-feature"><MapPin size={18} /><span>One business workspace with an internal accounting location for record compatibility.</span></div>
        {owner && <Link to="/team" className="button button-secondary my-business-link"><ShieldCheck size={16} /> Review employee access <ArrowRight size={16} /></Link>}
      </section>
    </div>
  </div>;
}
