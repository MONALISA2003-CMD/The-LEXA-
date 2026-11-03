import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, CheckCircle2, CreditCard, FileCheck2, LockKeyhole, Mail, MapPin, Settings2, ShieldCheck, Users, Wallet } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { businessSetupApi } from '../../data/remote/businessSetup';
import { apiTeamAccess } from '../../data/remote/apiTeamAccess';
import './my-business.css';

export default function WorkspacePage() {
  const { workspace } = useWorkspace();
  const accessQuery = useQuery({ queryKey: ['business-access', workspace.id], queryFn: () => apiTeamAccess.access(workspace.id) });
  const setupQuery = useQuery({ queryKey: ['business-setup-summary', workspace.id], queryFn: () => businessSetupApi.read(workspace.id) });
  const owner = accessQuery.data?.isOwner === true;
  const profile = setupQuery.data;
  const teamQuery = useQuery({ queryKey: ['team-access-members', workspace.id], queryFn: () => apiTeamAccess.members(workspace.id), enabled: owner });
  return <div className="page-stack my-business-page">
    <section className="my-business-hero">
      <div className="my-business-kicker"><ShieldCheck size={16} /> SECURE BUSINESS ACCOUNT</div>
      <div className="my-business-hero-row"><div className="my-business-avatar"><Building2 size={30}/></div><div><h2>{workspace.businessName}</h2><p>One business. One set of trusted records. All the people you authorize.</p></div></div>
      <div className="my-business-hero-stats"><span><CheckCircle2 size={16}/> Active business</span><span><Wallet size={16}/>{workspace.currency}</span><span><LockKeyhole size={16}/>{owner?'CEO / Owner':accessQuery.data?.role?.replaceAll('_',' ') || 'Your assigned access'}</span></div>
    </section>
    {accessQuery.isError && <div className="inline-error" role="alert">Unable to verify your role. Reload to try again.</div>}
    <div className="my-business-grid">
      <section className="section-card my-business-info"><div className="section-card-heading"><span className="heading-icon blue-icon"><Building2 size={18}/></span><div><h3>Business profile</h3><p>Consistent identity across documents and records.</p></div></div>
        <div className="my-business-facts">
          <div><span>Trading name</span><strong>{profile?.tradingName || workspace.businessName}</strong></div>
          <div><span>Industry</span><strong>{profile?.industry?.replaceAll('_',' ') || 'Not configured yet'}</strong></div>
          <div><span>Business address</span><strong>{[profile?.physicalAddress,profile?.city,profile?.country].filter(Boolean).join(', ') || 'Not supplied'}</strong></div>
          <div><span>Contact email</span><strong>{profile?.email || 'Not supplied'}</strong></div>
          <div><span>Business phone</span><strong>{profile?.phone || 'Not supplied'}</strong></div>
          <div><span>Default timezone</span><strong>{workspace.timezone}</strong></div>
        </div>
        {owner && <Link to="/business-setup" className="button button-primary my-business-link"><FileCheck2 size={16}/> Edit business profile <ArrowRight size={16}/></Link>}
      </section>
      <section className="section-card my-business-info"><div className="section-card-heading"><span className="heading-icon cyan-icon"><Users size={18}/></span><div><h3>Team & permissions</h3><p>Employees work inside this business, never as new business accounts.</p></div></div>
        {owner ? <><div className="my-business-team-count"><strong>{teamQuery.data?.filter(member=>member.status==='ACTIVE').length ?? '—'}</strong><span>Active business accounts, including the owner</span></div><p className="text-muted">Invite employees securely, choose their role, suspend access instantly, and retain a complete audit history.</p><Link to="/team" className="button button-primary my-business-link"><Users size={16}/> Manage my team <ArrowRight size={16}/></Link></> : <div className="my-business-access-note"><ShieldCheck size={20}/><span>Your business owner manages roles and permissions. You can work with records authorized for your role.</span></div>}
      </section>
      <section className="section-card my-business-info"><div className="section-card-heading"><span className="heading-icon green-icon"><CreditCard size={18}/></span><div><h3>Payment recording</h3><p>Record how money was received; no payment gateway connections.</p></div></div>
        <div className="my-business-methods">{profile?.paymentMethods?.filter(method => method.enabled).length ? profile.paymentMethods.filter(method => method.enabled).map(method=><span key={method.code}>{method.label}</span>):<p className="text-muted">The owner has not enabled any recording methods yet.</p>}</div>
        {owner&&<Link to="/business-setup" className="button button-secondary my-business-link"><Settings2 size={16}/> Update accepted methods <ArrowRight size={16}/></Link>}
      </section>
      <section className="section-card my-business-info"><div className="section-card-heading"><span className="heading-icon blue-icon"><ShieldCheck size={18}/></span><div><h3>Data & privacy</h3><p>Protected by tenant membership, roles and transaction history.</p></div></div>
        <div className="my-business-feature"><LockKeyhole size={18}/><span>Business records are private to the people granted access.</span></div>
        <div className="my-business-feature"><Mail size={18}/><span>Employees receive private invitation links and set their own passwords.</span></div>
        <div className="my-business-feature"><MapPin size={18}/><span>One internal accounting location; no visible branch management.</span></div>
      </section>
    </div>
  </div>;
}
