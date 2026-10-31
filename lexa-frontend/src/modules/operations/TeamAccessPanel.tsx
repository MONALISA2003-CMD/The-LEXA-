import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CircleAlert, LockKeyhole, RefreshCw, Save, ShieldCheck, Users } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { apiTeamAccess, type TeamMember } from '../../data/remote/apiTeamAccess';
import './team-access.css';

const ROLE_OPTIONS = [
  ['business_manager', 'Business manager'], ['manager', 'Manager'], ['branch_manager', 'Branch manager'],
  ['accountant', 'Accountant'], ['sales', 'Sales'], ['sales_operator', 'Sales operator'],
  ['cashier', 'Cashier'], ['inventory_operator', 'Inventory operator'], ['warehouse_operator', 'Warehouse operator'],
  ['read_only', 'Read only'], ['member', 'Member'], ['viewer', 'Viewer'], ['administrator', 'Administrator'],
] as const;

type ScopeDraft = { allBranches: boolean; branchIds: string[] };
const displayName = (member: TeamMember) => member.displayName?.trim() || member.email;

export default function TeamAccessPanel() {
  const { workspace } = useWorkspace();
  const cache = useQueryClient();
  const membersQuery = useQuery({ queryKey: ['team-access-members', workspace.id], queryFn: () => apiTeamAccess.members(workspace.id) });
  const branchesQuery = useQuery({ queryKey: ['team-access-branches', workspace.id], queryFn: () => apiTeamAccess.branches(workspace.id) });
  const invitationsQuery = useQuery({ queryKey: ['team-access-invitations', workspace.id], queryFn: () => apiTeamAccess.invitations(workspace.id) });
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [scopeDrafts, setScopeDrafts] = useState<Record<string, ScopeDraft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteAllBranches, setInviteAllBranches] = useState(true);
  const members = membersQuery.data ?? [];
  const branches = branchesQuery.data ?? [];
  const currentRole = useMemo(() => roleDrafts, [roleDrafts]);
  const error = membersQuery.error ?? branchesQuery.error ?? invitationsQuery.error;

  async function sendInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving('invite');
    try { await apiTeamAccess.invite(workspace.id, { email: inviteEmail.trim(), role: inviteRole, allBranches: inviteAllBranches, branchIds: [] }); toast.success('Invitation sent', { description: `An invitation was sent to ${inviteEmail.trim()}.` }); setInviteEmail(''); await refresh(); }
    catch (cause) { toast.error('Invitation could not be sent', { description: cause instanceof Error ? cause.message : 'Check the email configuration and permissions.' }); }
    finally { setSaving(null); }
  }

  async function refresh() {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['team-access-members', workspace.id] }),
      cache.invalidateQueries({ queryKey: ['team-access-branches', workspace.id] }),
      cache.invalidateQueries({ queryKey: ['team-access-invitations', workspace.id] }),
      cache.invalidateQueries({ queryKey: ['workspaces'] }),
    ]);
  }

  function scopeFor(member: TeamMember): ScopeDraft {
    return scopeDrafts[member.userId] ?? { allBranches: member.branchScopeMode !== 'restricted', branchIds: [...member.branchIds] };
  }

  async function saveRole(member: TeamMember) {
    const role = currentRole[member.userId] ?? member.role;
    if (role === member.role) return;
    setSaving(`${member.userId}:role`);
    try {
      await apiTeamAccess.updateRole(workspace.id, member.userId, role);
      toast.success(`Role updated for ${displayName(member)}`);
      await refresh();
      setRoleDrafts(current => { const next = { ...current }; delete next[member.userId]; return next; });
    } catch (cause) {
      toast.error('Role was not updated', { description: cause instanceof Error ? cause.message : 'Check your permissions and retry.' });
    } finally { setSaving(null); }
  }

  async function saveBranches(member: TeamMember) {
    const draft = scopeFor(member);
    setSaving(`${member.userId}:branches`);
    try {
      await apiTeamAccess.updateBranchScope(workspace.id, member.userId, draft);
      toast.success(draft.allBranches ? `All branches enabled for ${displayName(member)}` : `Branch access saved for ${displayName(member)}`);
      await refresh();
      setScopeDrafts(current => { const next = { ...current }; delete next[member.userId]; return next; });
    } catch (cause) {
      toast.error('Branch access was not saved', { description: cause instanceof Error ? cause.message : 'Check the selected branches and retry.' });
    } finally { setSaving(null); }
  }

  const isLoading = membersQuery.isLoading || branchesQuery.isLoading;
  return (
    <section className="team-access-workspace">
      <header className="team-access-header">
        <div><span className="eyebrow eyebrow-blue">WORKSPACE ADMINISTRATION</span><h3>Team & access</h3><p>Manage roles and explicit branch access for existing workspace members.</p></div>
        <button type="button" onClick={() => void refresh()} disabled={saving !== null}><RefreshCw size={15} /> Refresh</button>
      </header>
      <section className="team-access-member-card team-access-invitation-card"><div className="team-access-identity"><strong>Invite a teammate</strong><span>Invitations are emailed with a single-use acceptance link and optional branch restriction.</span></div><form className="team-access-controls" onSubmit={sendInvite}><div className="team-access-control"><label htmlFor="invite-email">Email address</label><input id="invite-email" type="email" required maxLength={254} value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="teammate@example.com" /></div><div className="team-access-control"><label htmlFor="invite-role">Role</label><select id="invite-role" value={inviteRole} onChange={e=>setInviteRole(e.target.value)}>{ROLE_OPTIONS.filter(([value])=>!['administrator'].includes(value)).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div><label className="team-access-all"><input type="checkbox" checked={inviteAllBranches} onChange={e=>setInviteAllBranches(e.target.checked)}/> Allow all branches</label><button type="submit" className="team-access-save" disabled={saving!==null || !inviteEmail.trim()}>{saving==='invite'?'Sending…':'Send invitation'}</button></form><div className="team-access-invitations">{(invitationsQuery.data??[]).map(invite=><span key={String(invite.id)}>{String(invite.email)} · {String(invite.role)} · {String(invite.status)}</span>)}</div></section>
      <div className="team-access-explainer"><ShieldCheck size={18} /><div><strong>Server-enforced access</strong><p>Role permissions apply to every API request. Restricted branch scope can include selected branches or no branches at all. Workspace owners and administrators retain workspace-wide access.</p></div></div>
      {error && <div className="team-access-alert"><CircleAlert size={17} /><span>{error instanceof Error ? error.message : 'Team access could not be loaded. You may need owner or administrator permissions.'}</span></div>}
      {isLoading && <div className="team-access-empty">Loading members and branches…</div>}
      {!isLoading && members.length === 0 && <div className="team-access-empty"><Users size={22} /><strong>No workspace members found</strong><span>Members will appear here once they have active or invited membership records.</span></div>}
      {!isLoading && members.length > 0 && <div className="team-access-member-list">
        {members.map(member => {
          const scope = scopeFor(member);
          const roleValue = roleDrafts[member.userId] ?? member.role;
          const roleChanged = roleValue !== member.role;
          const scopeChanged = scope.allBranches !== (member.branchScopeMode !== 'restricted') || (!scope.allBranches && (scope.branchIds.length !== member.branchIds.length || scope.branchIds.some(id => !member.branchIds.includes(id))));
          const protectedOwner = ['owner', 'owner_administrator'].includes(member.role);
          const branchScopeLocked = protectedOwner || ['admin', 'administrator'].includes(member.role);
          const busy = saving?.startsWith(`${member.userId}:`) ?? false;
          return <article className="team-access-member-card" key={member.userId}>
            <div className="team-access-member-top"><div className="team-access-avatar">{displayName(member).slice(0, 1).toUpperCase()}</div><div className="team-access-identity"><strong>{displayName(member)}</strong><span>{member.email}</span><small>{member.status.replace(/_/g, ' ').toLowerCase()} · Member since {new Date(member.createdAt).toLocaleDateString()}</small></div><span className={`team-access-status team-access-status-${member.status.toLowerCase()}`}>{member.status}</span></div>
            <div className="team-access-controls">
              <div className="team-access-control"><label htmlFor={`role-${member.userId}`}>Workspace role</label><div className="team-access-inline"><select id={`role-${member.userId}`} disabled={protectedOwner || member.status !== 'ACTIVE' || busy} value={roleValue} onChange={event => setRoleDrafts(current => ({ ...current, [member.userId]: event.target.value }))}>{ROLE_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><button type="button" className="team-access-save" disabled={!roleChanged || busy} onClick={() => void saveRole(member)}><Save size={14} /> Save role</button></div>{protectedOwner && <small>Workspace ownership cannot be changed here.</small>}</div>
              <div className="team-access-control"><div className="team-access-control-heading"><label>Branch access</label><span>{scope.allBranches ? 'All branches' : `${scope.branchIds.length} of ${branches.length} selected`}</span></div>
                <label className="team-access-all"><input type="checkbox" checked={scope.allBranches} disabled={branchScopeLocked || member.status !== 'ACTIVE' || busy} onChange={event => setScopeDrafts(current => {
                  const existingDraft = current[member.userId];
                  return {
                    ...current,
                    [member.userId]: {
                      allBranches: event.target.checked,
                      branchIds: event.target.checked ? [] : (existingDraft?.branchIds.length ? existingDraft.branchIds : branches.map(branch => branch.id)),
                    },
                  };
                })} /> Allow access to all workspace branches</label>
                {!scope.allBranches && <div className="team-access-branch-grid">{branches.map(branch => <label key={branch.id}><input type="checkbox" checked={scope.branchIds.includes(branch.id)} disabled={branchScopeLocked || member.status !== 'ACTIVE' || busy} onChange={event => setScopeDrafts(current => { const prior = current[member.userId] ?? scope; return { ...current, [member.userId]: { allBranches: false, branchIds: event.target.checked ? [...prior.branchIds, branch.id] : prior.branchIds.filter(id => id !== branch.id) } }; })} /><span>{branch.name}</span><small>{branch.code}</small></label>)}</div>}
                <div className="team-access-branch-footer"><span>{!scope.allBranches && scope.branchIds.length === 0 ? 'This member will not be able to access any branch.' : scope.allBranches ? 'Workspace-wide branch access.' : 'Only checked branches will be visible and accessible.'}</span><button type="button" className="team-access-save" disabled={!scopeChanged || busy} onClick={() => void saveBranches(member)}><Save size={14} /> Save branches</button></div>
              </div>
            </div>
          </article>;
        })}
      </div>}
      <footer className="team-access-footnote"><LockKeyhole size={15} /><span>Invitation acceptance requires an account signed in with the exact invited email. Resend delivery must be configured with a verified sender in the API environment.</span></footer>
    </section>
  );
}
