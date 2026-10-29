import { useState, type FormEvent } from 'react';
import { Building2, Check, Plus, Store } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { localWorkspaceRepository } from '../../data/local/workspaces';
import { toast } from 'sonner';

export default function WorkspacePage() {
  const { workspace, workspaces, branches, branch, setActiveWorkspace, setActiveBranch, refreshWorkspaces } = useWorkspace();
  const [newBusinessName, setNewBusinessName] = useState('');
  const [newBusinessType, setNewBusinessType] = useState('retail');
  const [newBranchName, setNewBranchName] = useState('Main branch');
  const [branchName, setBranchName] = useState('');
  const [busy, setBusy] = useState(false);

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await localWorkspaceRepository.create({
        businessName: newBusinessName, businessType: newBusinessType, branchName: newBranchName,
        currency: workspace.currency, timezone: workspace.timezone,
      });
      await refreshWorkspaces();
      await setActiveWorkspace(created.id);
      setNewBusinessName('');
      setNewBranchName('Main branch');
      toast.success('Workspace created locally');
    } catch (error) {
      toast.error('Could not create workspace', { description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setBusy(false); }
  }

  async function createBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await localWorkspaceRepository.createBranch({ workspaceId: workspace.id, name: branchName });
      setBranchName('');
      await setActiveWorkspace(workspace.id);
      toast.success('Branch added');
    } catch (error) {
      toast.error('Could not add branch', { description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setBusy(false); }
  }

  return (
    <div className="page-stack">
      <div className="page-heading-row"><div><div className="eyebrow eyebrow-blue">WORKSPACE SETTINGS</div><h2>Business & branches</h2><p>Keep business records scoped to the right workspace and branch.</p></div><div className="soft-badge"><span className="status-dot" /> LOCAL ONLY</div></div>
      <section className="section-card workspace-current-card">
        <div className="section-card-heading"><div className="heading-icon blue-icon"><Building2 size={18} /></div><div><h3>Current business</h3><p>These details define the context used across the application.</p></div></div>
        <div className="workspace-profile-row"><div className="workspace-large-avatar">{workspace.businessName.trim().slice(0, 1).toUpperCase()}</div><div className="workspace-profile-main"><h3>{workspace.businessName}</h3><p>{workspace.businessType.replaceAll('_', ' ')} · {workspace.currency} · {workspace.timezone}</p></div><span className="active-tag"><Check size={13} /> Active</span></div>
        <div className="workspace-stats-row"><div><span>Workspace ID</span><strong className="mono-id">{workspace.id}</strong></div><div><span>Created locally</span><strong>{new Date(workspace.createdAt).toLocaleDateString()}</strong></div><div><span>Available branches</span><strong>{branches.length}</strong></div></div>
      </section>

      <section className="section-card">
        <div className="section-card-heading"><div className="heading-icon cyan-icon"><Store size={18} /></div><div><h3>Branches</h3><p>Branch context determines which stock movements and sales are shown.</p></div></div>
        <div className="branch-list">{branches.map((item) => <button className={`branch-row ${item.id === branch.id ? 'branch-row-active' : ''}`} key={item.id} onClick={() => setActiveBranch(item.id)}><span className="branch-row-icon"><Store size={17} /></span><span className="branch-row-copy"><strong>{item.name}</strong><small>{item.address ?? 'No address added'}</small></span>{item.id === branch.id ? <span className="active-tag"><Check size={13} /> Current branch</span> : <span className="branch-action">Use branch</span>}</button>)}</div>
        <form className="inline-create-form" onSubmit={createBranch}><label className="field-label">Add a branch<input required maxLength={80} value={branchName} onChange={(event) => setBranchName(event.target.value)} placeholder="e.g. City Centre" /></label><button className="button button-secondary" disabled={busy || !branchName.trim()}><Plus size={16} /> Add branch</button></form>
      </section>

      <section className="section-card">
        <div className="section-card-heading"><div className="heading-icon purple-icon"><Building2 size={18} /></div><div><h3>Business workspaces</h3><p>Switch businesses without mixing their locally saved records.</p></div></div>
        <div className="workspace-list">{workspaces.map((item) => <div className="workspace-row" key={item.id}><div className="workspace-row-avatar">{item.businessName.trim().slice(0, 1).toUpperCase()}</div><div className="workspace-row-copy"><strong>{item.businessName}</strong><span>{item.currency} · {item.timezone}</span></div>{item.id === workspace.id ? <span className="active-tag"><Check size={13} /> Current</span> : <button className="button button-quiet button-small" onClick={() => void setActiveWorkspace(item.id)}>Switch</button>}</div>)}</div>
        <form className="new-workspace-form" onSubmit={createWorkspace}><h4>Create another workspace</h4><div className="form-two-col"><label className="field-label">Business name<input required value={newBusinessName} onChange={(event) => setNewBusinessName(event.target.value)} placeholder="Business name" /></label><label className="field-label">Business type<select value={newBusinessType} onChange={(event) => setNewBusinessType(event.target.value)}><option value="retail">Retail shop</option><option value="wholesale">Wholesale / distribution</option><option value="restaurant">Restaurant / food</option><option value="services">Services</option><option value="electronics">Electronics</option><option value="general">General SME</option></select></label></div><label className="field-label">First branch<input required value={newBranchName} onChange={(event) => setNewBranchName(event.target.value)} placeholder="Main branch" /></label><div className="form-info"><span className="status-dot" /><p>New workspaces use the currently active currency and timezone. You can update their profile later.</p></div><button className="button button-primary" disabled={busy || !newBusinessName.trim()}><Plus size={16} /> Create workspace</button></form>
      </section>
    </div>
  );
}
