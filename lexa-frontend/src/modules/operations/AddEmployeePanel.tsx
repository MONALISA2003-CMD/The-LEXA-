import { validNewPassword, NEW_PASSWORD_RULE } from '../../domain/shared/newPasswordPolicy';

import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LockKeyhole, ShieldCheck, UserRoundPlus, Users, KeyRound, Pencil } from '../../components/LexaIcon';
import { apiTeamAccess, type StaffDraft, type StaffProfile } from '../../data/remote/apiTeamAccess';

const ROLES = [
  ['business_manager','Business manager'],['cashier','Cashier / sales attendant'],['sales','Sales representative'],
  ['inventory_operator','Storekeeper'],['procurement_officer','Procurement officer'],
  ['accountant','Accountant / bookkeeper'],['finance_manager','Finance manager'],
  ['hr_officer','HR officer'],['hr_manager','HR manager'],['payroll_officer','Payroll officer'],
  ['delivery_officer','Delivery / logistics'],['customer_service','Customer service'],
  ['production_officer','Production officer'],['quality_officer','Quality officer'],
  ['project_manager','Project manager'],['support_agent','Support agent'],['field_agent','Field service agent'],['technician','Repair technician'],
  ['auditor','Auditor'],['viewer','Read-only viewer'],['employee','Ordinary employee'],
] as const;
const EMPTY:StaffDraft = {
  fullName:'',preferredName:'',username:'',email:'',initialPassword:'',
  role:'cashier',phone:'',department:'',jobTitle:'',employmentType:'salaried',
  hireDate:new Date().toISOString().slice(0,10),residentialAddress:'',district:'',dateOfBirth:'',
  emergencyContactName:'',emergencyContactPhone:'',nationalId:'',contractReference:'',probationEnd:'',notes:'',
};
// Only string-backed employee fields are valid inputs for text/date form controls.
// Branch selection uses its own checkbox state; never send a boolean or array
// through the value property of an HTML input.
type StaffTextField = {
  [K in keyof StaffDraft]-?: NonNullable<StaffDraft[K]> extends string ? K : never;
}[keyof StaffDraft];

const FIELDS: Array<{name:StaffTextField;label:string;type?:string;required?:boolean;hint?:string}> = [
  {name:'fullName',label:'Legal full name',required:true},
  {name:'preferredName',label:'Preferred name'},
  {name:'username',label:'Employee login username',required:true,hint:'3–32 lowercase letters, numbers, dots, underscores or hyphens'},
  {name:'email',label:'Work email (optional)',type:'email',hint:'Not required if employee uses username'},
  {name:'initialPassword',label:'Temporary password',type:'password',required:true,hint:'Exactly 8 characters: upper and lowercase, number and symbol. Employee changes it at first sign-in'},
  {name:'phone',label:'Phone number',type:'tel'},
  {name:'department',label:'Department'},
  {name:'jobTitle',label:'Job title',required:true},
  {name:'hireDate',label:'Employment start date',type:'date',required:true},
];
const MORE: Array<{name:StaffTextField;label:string;type?:string}> = [
  {name:'residentialAddress',label:'Residential address'},
  {name:'district',label:'District'},
  {name:'dateOfBirth',label:'Date of birth',type:'date'},
  {name:'emergencyContactName',label:'Emergency contact full name'},
  {name:'emergencyContactPhone',label:'Emergency contact phone',type:'tel'},
  {name:'nationalId',label:'National ID (optional)'},
  {name:'contractReference',label:'Employment contract reference'},
  {name:'probationEnd',label:'Probation end',type:'date'},
  {name:'notes',label:'Employment notes'},
];
function fromProfile(s:StaffProfile):StaffDraft {
  return {...EMPTY,fullName:s.fullName,preferredName:s.preferredName??'',username:s.username??'',
    email:s.email??'',role:s.role??'employee',phone:s.phone??'',department:s.department??'',jobTitle:s.jobTitle??'',
    employmentType:s.employmentType,hireDate:String(s.hireDate).slice(0,10),
    residentialAddress:s.residentialAddress??'',district:s.district??'',
    dateOfBirth:s.dateOfBirth?String(s.dateOfBirth).slice(0,10):'',
    emergencyContactName:s.emergencyContactName??'',emergencyContactPhone:s.emergencyContactPhone??'',
    nationalId:s.nationalId??'',contractReference:s.contractReference??'',
    probationEnd:s.probationEnd?String(s.probationEnd).slice(0,10):'',notes:s.notes??'',
    initialPassword:''};
}
export default function AddEmployeePanel({workspaceId,onCreated}:{workspaceId:string;onCreated:()=>Promise<void>}){
  const qc=useQueryClient();
  const staff=useQuery({queryKey:['ceo-employees',workspaceId],queryFn:()=>apiTeamAccess.staff(workspaceId)});
  const [form,setForm]=useState<StaffDraft>({...EMPTY});
  const branches=useQuery({queryKey:['team-branches',workspaceId],queryFn:()=>apiTeamAccess.branches(workspaceId)});
  const [allBranches,setAllBranches]=useState(false);
  const [branchIds,setBranchIds]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState<string|null>(null);
  const [resetId,setResetId]=useState<string|null>(null);
  const [newPassword,setNewPassword]=useState('');
  const set=(key:StaffTextField,value:string)=>setForm(old=>({...old,[key]:value}));
  const refresh=async()=>{await Promise.all([qc.invalidateQueries({queryKey:['ceo-employees',workspaceId]}),onCreated()]);};
  const create=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    if(!editing && !validNewPassword(form.initialPassword)){toast.error(NEW_PASSWORD_RULE);return;}
    setBusy(true);
    try {
      if(editing){await apiTeamAccess.updateStaff(workspaceId,editing,form);toast.success('Employee profile updated');}
      else {
        const selected=allBranches?[]:branchIds.length?branchIds:branches.data?.length===1?[branches.data[0]!.id]:[];
        if(!allBranches&&!selected.length){toast.error('Select at least one branch for the employee.');return;}
        const result=await apiTeamAccess.createStaff(workspaceId,{...form,allBranches,branchIds:selected});
        toast.success('Employee account created',{description:`${result.username} can now sign in using the temporary password you assigned.`});
      }
      setForm({...EMPTY});setEditing(null);setShowForm(false);await refresh();
    } catch(err){toast.error('Could not save employee',{description:err instanceof Error?err.message:'Please retry.'});}
    finally{setBusy(false);}
  };
  const reset=async(s:StaffProfile)=>{
    if(!validNewPassword(newPassword)){toast.error(NEW_PASSWORD_RULE);return;}
    setBusy(true);
    try{await apiTeamAccess.resetStaffPassword(workspaceId,s.employeeId,newPassword);
      toast.success('Temporary password updated. Previous sessions revoked.');
      setNewPassword('');setResetId(null);await refresh();
    }catch(err){toast.error('Could not reset password',{description:err instanceof Error?err.message:'Please retry.'});}
    finally{setBusy(false);}
  };
  return <section className="section-card lexa-employee-provisioning">
    <header className="section-card-heading">
      <div className="heading-icon blue-icon"><Users size={20}/></div>
      <div><h3>Employee records & accounts</h3><p>Add biodata, employment information, role and a secure staff login. Only the CEO manages this section.</p></div>
      <button className="button button-primary" type="button" onClick={()=>{setEditing(null);setForm({...EMPTY});setShowForm(v=>!v)}}><UserRoundPlus size={16}/>{showForm?'Close':'Add employee'}</button>
    </header>
    {showForm&&<form className="lexa-employee-form" onSubmit={create}>
      <div className="lexa-employee-form-heading"><strong>{editing?'Edit employee profile':'New employee onboarding'}</strong><span>Employee access never creates another business or branch.</span></div>
      <div className="lexa-employee-form-grid">
        {FIELDS.filter(x=>!editing||!['initialPassword','username','email','hireDate'].includes(x.name)).map(f=><label key={f.name}>{f.label}
          <input type={f.type??'text'} name={f.name} autoComplete="off" required={f.required} minLength={f.name==='initialPassword'?8:undefined}
            maxLength={f.name==='initialPassword'?8:f.name==='username'?32:254} value={form[f.name]} onChange={e=>set(f.name,e.target.value)}/>
          {f.hint&&<small>{f.hint}</small>}
        </label>)}
        {!editing&&<>
          <label>Assign business role<select value={form.role} onChange={e=>set('role',e.target.value)}>
            {ROLES.map(([id,name])=><option value={id} key={id}>{name}</option>)}
          </select></label>
          <label>Employment type<select value={form.employmentType} onChange={e=>set('employmentType',e.target.value)}>
            <option value="salaried">Salaried</option><option value="hourly">Hourly</option><option value="contractor">Contractor</option>
          </select></label>
        </>}
      </div>
      {!editing&&<fieldset className="team-access-branch-panel"><legend>Employee branch access</legend>
        <label className="team-access-all"><input type="checkbox" checked={allBranches} onChange={e=>{setAllBranches(e.target.checked);if(e.target.checked)setBranchIds([])}}/> All branches</label>
        {!allBranches&&<div className="team-access-branch-grid">{(branches.data??[]).map(branch=><label key={branch.id}><input type="checkbox" checked={branchIds.includes(branch.id)} onChange={e=>setBranchIds(ids=>e.target.checked?[...new Set([...ids,branch.id])]:ids.filter(id=>id!==branch.id))}/><span>{branch.name}</span></label>)}</div>}
        {branches.isError&&<span role="alert">Could not load branches. Retry before creating employee access.</span>}
      </fieldset>}
      <details className="lexa-employee-advanced" open={Boolean(editing)}>
        <summary>Personal, emergency contact and contract information</summary>
        <div className="lexa-employee-form-grid">
          {MORE.map(f=><label key={f.name}>{f.label}
            <input type={f.type??'text'} maxLength={1000} value={form[f.name]} onChange={e=>set(f.name,e.target.value)}/>
          </label>)}
        </div>
        <p>Collect only information necessary for employment. Private fields are restricted to CEO management; salary and statutory payroll are handled in HR & Payroll.</p>
      </details>
      <div className="lexa-employee-security"><ShieldCheck size={18}/>
        <span>The employee receives a unique account in this business only. Their temporary password is never shown again after you create it and they must change it before work begins.</span></div>
      <button className="button button-primary" type="submit" disabled={busy}><LockKeyhole size={16}/>{busy?'Saving…':editing?'Save employee details':'Create employee and login'}</button>
    </form>}
    {staff.isLoading&&<div className="team-access-empty">Loading employment records…</div>}
    {staff.isError&&<div role="alert" className="team-access-alert">Employment details could not be loaded. <button type="button" onClick={()=>void staff.refetch()}>Retry</button></div>}
    {!staff.isLoading&&!staff.isError&&staff.data?.length===0&&<div className="team-access-empty"><Users size={22}/><strong>No employees added yet</strong><span>Choose Add employee to create your first staff profile.</span></div>}
    <div className="lexa-employee-directory">
      {(staff.data??[]).map(s=><article className="lexa-employee-row" key={s.employeeId}>
        <div className="lexa-employee-avatar">{s.fullName.slice(0,1).toUpperCase()}</div>
        <div className="lexa-employee-identity"><strong>{s.fullName}</strong><span>{s.jobTitle} · {s.employeeNumber}</span><small>{s.username||'No staff login'} · {s.role?.replaceAll('_',' ')||'HR-only record'}</small></div>
        <details className="lexa-employee-detail"><summary>Manage</summary>
          <div className="lexa-employee-detail-body">
            <p><strong>Department:</strong> {s.department||'Not specified'} · <strong>Start:</strong> {String(s.hireDate).slice(0,10)}</p>
            <p><strong>Phone:</strong> {s.phone||'Not supplied'} · <strong>Emergency contact:</strong> {s.emergencyContactName||'Not supplied'}</p>
            <button type="button" className="button button-secondary button-small" onClick={()=>{setEditing(s.employeeId);setForm(fromProfile(s));setShowForm(true);window.scrollTo({top:0,behavior:'smooth'})}}><Pencil size={14}/> Edit biodata</button>
            {s.userId&&<button type="button" className="button button-secondary button-small" onClick={()=>{setResetId(resetId===s.employeeId?null:s.employeeId);setNewPassword('')}}><KeyRound size={14}/> Reset staff password</button>}
            {resetId===s.employeeId&&<div className="lexa-employee-reset">
              <label>New temporary password<input type="password" autoComplete="new-password" minLength={8} maxLength={8} value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="8 mixed characters"/></label>
              <button className="button button-primary button-small" type="button" disabled={busy||!validNewPassword(newPassword)} onClick={()=>void reset(s)}>Save and revoke old sessions</button>
            </div>}
          </div>
        </details>
      </article>)}
    </div>
  </section>;
}

