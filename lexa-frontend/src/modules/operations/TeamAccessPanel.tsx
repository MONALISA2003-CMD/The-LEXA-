import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CircleAlert, LockKeyhole, RefreshCw, Save, ShieldCheck, UserRoundPlus, UserX, UserCheck } from '../../components/LexaIcon';
import { useWorkspace } from '../../app/WorkspaceContext';
import { apiTeamAccess, type TeamMember } from '../../data/remote/apiTeamAccess';
import AddEmployeePanel from './AddEmployeePanel';
import './team-access.css';

const ROLE_OPTIONS = [
 ['business_manager','Business manager'],['finance_manager','Finance manager'],['delivery_officer','Delivery officer'],['production_officer','Production officer'],['quality_officer','Quality officer'],['project_manager','Project manager'],['support_agent','Support agent'],['field_agent','Field service agent'],['technician','Repair technician'],['hr_manager','HR manager'],['employee','Ordinary employee'],['cashier','Sales attendant / cashier'],['sales','Sales representative'],
 ['inventory_operator','Storekeeper'],['procurement_officer','Procurement officer'],['accountant','Accountant'],
 ['hr_officer','HR officer'],['payroll_officer','Payroll officer'],['customer_service','Customer service'],
 ['auditor','Auditor / viewer'],['viewer','Read only'],
] as const;
const ROLE_DESCRIPTIONS: Record<string,string> = {
 business_manager:'Operates daily business activities without ownership or deletion rights.',cashier:'Records sales and independently confirmed receipts; cannot delete records.',
 sales:'Manages customers, leads, quotations and sales; no sensitive finance or payroll.',inventory_operator:'Tracks products, receiving and stock; no business financial controls.',
 procurement_officer:'Records suppliers and purchase requests; no payments or finance permissions.', accountant:'Maintains permitted finance and reconciliations; cannot manage ownership.',
 hr_officer:'Manages people records with no ownership or finance access.',payroll_officer:'Works on payroll information under an assigned role.',
 customer_service:'Manages customer records and follow-up tasks.',auditor:'Read-only access to approved records and audit information.',viewer:'Read-only access to permitted business data.',
};
const nameFor = (member: TeamMember) => member.displayName?.trim() || member.email;
export default function TeamAccessPanel(){
 const {workspace}=useWorkspace();const client=useQueryClient();
 const access=useQuery({queryKey:['business-access',workspace.id],queryFn:()=>apiTeamAccess.access(workspace.id)});
 const enabled=access.data?.isOwner===true;
 const membersQuery=useQuery({queryKey:['team-access-members',workspace.id],queryFn:()=>apiTeamAccess.members(workspace.id),enabled});
 const catalog=useQuery({queryKey:['role-catalog',workspace.id],queryFn:()=>apiTeamAccess.roleCatalog(workspace.id),enabled});
 const invitesQuery=useQuery({queryKey:['team-access-invitations',workspace.id],queryFn:()=>apiTeamAccess.invitations(workspace.id),enabled});
 const branchesQuery=useQuery({queryKey:['team-branches',workspace.id],queryFn:()=>apiTeamAccess.branches(workspace.id),enabled});
 const [email,setEmail]=useState('');const [inviteRole,setInviteRole]=useState('cashier');
 const [roleDraft,setRoleDraft]=useState<Record<string,string>>({});const [busy,setBusy]=useState<string|null>(null);
 const [inviteAll,setInviteAll]=useState(false);const [inviteBranches,setInviteBranches]=useState<string[]>([]);
 const [scopeEditor,setScopeEditor]=useState<string|null>(null);const [scopeDraft,setScopeDraft]=useState<Record<string,{allBranches:boolean;branchIds:string[]}>>({});
 const refresh=async()=>{await Promise.all([client.invalidateQueries({queryKey:['team-access-members',workspace.id]}),client.invalidateQueries({queryKey:['team-access-invitations',workspace.id]})]);};
 const invite=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setBusy('invite');try{const selected=inviteAll?[]:inviteBranches.length?inviteBranches:branchesQuery.data?.length===1?[branchesQuery.data[0]!.id]:[];if(!inviteAll&&!selected.length)throw new Error('Choose at least one branch for this invitation.');await apiTeamAccess.invite(workspace.id,{email:email.trim(),role:inviteRole,allBranches:inviteAll,branchIds:selected});toast.success('Secure invitation sent');setEmail('');setInviteBranches([]);await refresh();}catch(e){toast.error('Invitation not sent',{description:e instanceof Error?e.message:'Please try again.'})}finally{setBusy(null)}};
 const saveRole=async(member:TeamMember)=>{setBusy(member.userId);try{await apiTeamAccess.updateRole(workspace.id,member.userId,roleDraft[member.userId]??member.role);toast.success('Employee role updated');await refresh();}catch(e){toast.error('Unable to update role',{description:e instanceof Error?e.message:'Please retry.'})}finally{setBusy(null)}};
 const saveScope=async(member:TeamMember)=>{const draft=scopeDraft[member.userId]??{allBranches:member.allBranches,branchIds:member.branchIds};if(!draft.allBranches&&!draft.branchIds.length){toast.error('Assign at least one branch.');return;}setBusy(member.userId);try{await apiTeamAccess.updateBranchScope(workspace.id,member.userId,draft);toast.success('Branch access updated');setScopeEditor(null);await refresh();}catch(e){toast.error('Could not update branch access',{description:e instanceof Error?e.message:'Please retry.'})}finally{setBusy(null)}};
 const toggleBranch=(ids:string[],id:string):string[]=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id];
 const removeEmployee=async(member:TeamMember)=>{if(!window.confirm(`Remove ${nameFor(member)} from ${workspace.businessName}? They will lose all business access. Their account and past business transactions will NOT be deleted.`))return;setBusy(member.userId);try{await apiTeamAccess.removeEmployee(workspace.id,member.userId);toast.success('Employee access removed; history preserved');await refresh();}catch(e){toast.error('Could not remove employee access',{description:e instanceof Error?e.message:'Please retry.'})}finally{setBusy(null)}};
 const setStatus=async(member:TeamMember,status:'ACTIVE'|'SUSPENDED')=>{if(status==='SUSPENDED'&&!window.confirm(`Suspend ${nameFor(member)}? They will immediately lose access to this business. Their work history is preserved.`))return;setBusy(member.userId);try{await apiTeamAccess.setStatus(workspace.id,member.userId,status);toast.success(status==='SUSPENDED'?'Employee suspended':'Employee reactivated');await refresh();}catch(e){toast.error('Unable to change access',{description:e instanceof Error?e.message:'Please retry.'})}finally{setBusy(null)}};
 if(access.isLoading)return <section className="section-card">Checking business ownership…</section>;
 if(!enabled)return <section className="section-card"><h2>Owner-only management</h2><p>Only the CEO of this business can create, manage or suspend employee accounts.</p></section>;
 return <div className="team-access-workspace">
   <header className="team-access-header"><div><span className="eyebrow eyebrow-blue">BUSINESS TEAM</span><h2>Team & permissions</h2><p>Every employee works in {workspace.businessName} using their own secure login.</p></div><button type="button" onClick={()=>void refresh()}><RefreshCw size={15}/> Refresh</button></header>
   <AddEmployeePanel workspaceId={workspace.id} onCreated={refresh}/>
   <section className="team-access-member-card team-access-invitation-card"><div className="team-access-identity"><strong><UserRoundPlus size={17}/> Invite an employee</strong><span>They receive an email link and create their own password. Never share passwords.</span></div>
    <form className="team-access-controls" onSubmit={invite}><div className="team-access-control"><label htmlFor="staff-invite-email">Employee email</label><input id="staff-invite-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="employee@business.com"/></div><div className="team-access-control"><label htmlFor="staff-invite-role">Assigned role</label><select id="staff-invite-role" value={inviteRole} onChange={e=>setInviteRole(e.target.value)}>{ROLE_OPTIONS.map(([v,label])=><option key={v} value={v}>{label}</option>)}</select><small>{catalog.data?.find(r=>r.role===inviteRole)?.description??ROLE_DESCRIPTIONS[inviteRole]}</small><div className="team-access-permission-preview"><strong>Granted permissions</strong>{(catalog.data?.find(r=>r.role===inviteRole)?.permissions??[]).filter(permission=>!permission.endsWith('.read')&&!permission.endsWith('.self.read')).slice(0,12).map(permission=><span key={permission}>{permission.replaceAll('.',' · ')}</span>)}</div></div>
      <fieldset className="team-access-branch-panel"><legend>Branch access</legend><label className="team-access-all"><input type="checkbox" checked={inviteAll} onChange={e=>{setInviteAll(e.target.checked);if(e.target.checked)setInviteBranches([])}}/> All branches</label>
      {!inviteAll&&<div className="team-access-branch-grid">{(branchesQuery.data??[]).map(b=><label key={b.id}><input type="checkbox" checked={inviteBranches.includes(b.id)} onChange={()=>setInviteBranches(ids=>toggleBranch(ids,b.id))}/><span>{b.name}</span><small>{b.code}</small></label>)}</div>}
      {branchesQuery.isError&&<small role="alert">Cannot load branches. Retry before inviting.</small>}</fieldset>
      <button className="team-access-save" type="submit" disabled={busy!==null||!email.trim()}>{busy==='invite'?'Sending…':'Send secure invitation'}</button></form>
    <div className="team-access-invitations">{(invitesQuery.data??[]).filter(i=>String(i.status)==='PENDING').slice(0,8).map(i=><span key={String(i.id)}>{String(i.email)} · Awaiting acceptance</span>)}</div>
   </section>
   <div className="team-access-explainer"><ShieldCheck size={20}/><div><strong>One business, shared records, least-privilege access</strong><p>Employees may create records permitted by their roles, but cannot delete business records. Only you can manage their roles or suspend access. Posted transactions remain in the audit trail.</p></div></div>
   {(membersQuery.isError||invitesQuery.isError)&&<div className="team-access-alert" role="alert"><CircleAlert size={18}/> Could not load team members or invitations. Please retry.</div>}
   {membersQuery.isLoading&&<div className="team-access-empty">Loading your secure team…</div>}
   <div className="team-access-member-list">{(membersQuery.data??[]).map(member=>{const owner=['owner','owner_administrator'].includes(member.role);const chosen=roleDraft[member.userId]??member.role;const processing=busy===member.userId;return <article className="team-access-member-card" key={member.userId}>
     <div className="team-access-member-top"><div className="team-access-avatar">{nameFor(member).slice(0,1).toUpperCase()}</div><div className="team-access-identity"><strong>{nameFor(member)} {owner&&'· CEO'}</strong><span>{member.email}</span><small>{member.role.replaceAll('_',' ')} · {new Date(member.createdAt).toLocaleDateString()}</small></div><span className={`team-access-status team-access-status-${member.status.toLowerCase()}`}>{member.status}</span></div>
     {!owner&&<div className="team-access-controls"><div className="team-access-control"><label htmlFor={`staff-role-${member.userId}`}>Business role</label><div className="team-access-inline"><select id={`staff-role-${member.userId}`} disabled={processing||member.status!=='ACTIVE'} value={chosen} onChange={e=>setRoleDraft(v=>({...v,[member.userId]:e.target.value}))}>{!ROLE_OPTIONS.some(([v])=>v===member.role)&&<option value={member.role}>{member.role.replaceAll('_',' ')}</option>}{ROLE_OPTIONS.map(([v,label])=><option key={v} value={v}>{label}</option>)}</select><button type="button" className="team-access-save" onClick={()=>void saveRole(member)} disabled={chosen===member.role||processing||member.status!=='ACTIVE'}><Save size={14}/> Save</button></div><small>{catalog.data?.find(r=>r.role===chosen)?.description??ROLE_DESCRIPTIONS[chosen]??'Existing business role'}</small>
      <button className="team-access-save" type="button" disabled={processing} onClick={()=>{setScopeEditor(v=>v===member.userId?null:member.userId);setScopeDraft(v=>({...v,[member.userId]:{allBranches:member.allBranches,branchIds:member.branchIds}}))}}>
        {member.allBranches?'All branches':`${member.branchIds.length} assigned branch(es)`} · Edit access</button>
      {scopeEditor===member.userId&&<fieldset className="team-access-branch-panel"><legend>Branch access for {nameFor(member)}</legend>
        <label className="team-access-all"><input type="checkbox" checked={(scopeDraft[member.userId]?.allBranches??member.allBranches)} onChange={e=>setScopeDraft(v=>({...v,[member.userId]:{allBranches:e.target.checked,branchIds:e.target.checked?[]:(v[member.userId]?.branchIds??member.branchIds)}}))}/> All branches</label>
        {!(scopeDraft[member.userId]?.allBranches??member.allBranches)&&<div className="team-access-branch-grid">{(branchesQuery.data??[]).map(b=><label key={b.id}><input type="checkbox" checked={(scopeDraft[member.userId]?.branchIds??member.branchIds).includes(b.id)} onChange={()=>setScopeDraft(v=>{const old=v[member.userId]??{allBranches:member.allBranches,branchIds:member.branchIds};return {...v,[member.userId]:{allBranches:false,branchIds:toggleBranch(old.branchIds,b.id)}}})}/><span>{b.name}</span></label>)}</div>}
        <button type="button" className="team-access-save" disabled={processing} onClick={()=>void saveScope(member)}>Save branch access</button>
      </fieldset>}
      </div><div className="team-access-control"><label>Employee access</label><div className="team-access-inline">{member.status==='ACTIVE'?<button className="team-access-save team-access-danger" type="button" onClick={()=>void setStatus(member,'SUSPENDED')} disabled={processing}><UserX size={15}/> Suspend access</button>:<button className="team-access-save" type="button" onClick={()=>void setStatus(member,'ACTIVE')} disabled={processing}><UserCheck size={15}/> Reactivate access</button>}</div><small>Suspension preserves all business records and employee activity.</small><button type="button" className="team-access-remove" disabled={processing} onClick={()=>void removeEmployee(member)}>Remove from this business</button></div></div>}
   </article>})}</div>
   <footer className="team-access-footnote"><LockKeyhole size={15}/><span>Invite links expire after seven days. The CEO controls access; no employee role can delete business records or grant itself ownership.</span></footer>
 </div>;
}
