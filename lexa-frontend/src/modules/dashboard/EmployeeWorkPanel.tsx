import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import { apiWorkstream6 } from '../../data/remote/apiWorkstream6';
import './employee-work.css';

function readable(value: unknown): string {
  return String(value??'').replaceAll('_',' ');
}

export default function EmployeeWorkPanel({role}:{role:string}) {
  const {workspace,branch}=useWorkspace();
  const w=workspace.id,b=branch.id;
  const isField=role==='field_agent'||role==='technician';
  const overview=useQuery({queryKey:['personal-employment',w,b],queryFn:()=>apiWorkstream6.myOverview(w,b),enabled:!isField});
  const fieldCases=useQuery({queryKey:['field-assigned-cases',w,b],queryFn:()=>apiWorkstream6.myFieldCases(w,b),enabled:isField});
  const [leaveType,setLeaveType]=useState('annual');
  const [start,setStart]=useState('');const [end,setEnd]=useState('');
  const [days,setDays]=useState('1');
  const [workDate,setWorkDate]=useState(new Date().toISOString().slice(0,10));
  const [regularHours,setRegularHours]=useState('8');
  const [caseNotes,setCaseNotes]=useState<Record<string,string>>({});const [saving,setSaving]=useState(false);
  const submitLeave=async(e:FormEvent)=>{
    e.preventDefault();setSaving(true);
    try{
      const draft=await apiWorkstream6.createMyLeave(w,b,{leaveType,startsOn:start,endsOn:end,daysRequested:Number(days)});
      await apiWorkstream6.submitMyLeave(w,b,draft.id);
      toast.success('Leave request submitted');setStart('');setEnd('');await overview.refetch();
    }catch(error){toast.error(error instanceof Error?error.message:'Could not submit leave. Your draft may still need submitting.');await overview.refetch()}
    finally{setSaving(false)}
  };
  const submitHours=async(e:FormEvent)=>{
    e.preventDefault();setSaving(true);
    try{
      const draft=await apiWorkstream6.createMyTimesheet(w,b,{workDate,regularHours:Number(regularHours),overtimeHours:0,billableHours:0});
      await apiWorkstream6.submitMyTimesheet(w,b,draft.id);
      toast.success('Hours submitted');await overview.refetch();
    }catch(error){toast.error(error instanceof Error?error.message:'Could not submit hours. Check for a draft time entry.');await overview.refetch()}
    finally{setSaving(false)}
  };
  const updateField=async(id:string,status:'in_progress'|'waiting_customer')=>{
    if(!(caseNotes[id]??'').trim()){toast.error('Enter a work note before updating a case.');return;}
    setSaving(true);
    try{await apiWorkstream6.updateMyFieldCase(w,b,id,{status,note:(caseNotes[id]??'').trim()});toast.success('Assigned case updated');setCaseNotes(v=>({...v,[id]:''}));await fieldCases.refetch()}
    catch(error){toast.error(error instanceof Error?error.message:'Could not update assigned case.')}
    finally{setSaving(false)}
  };
  if(isField)return <section className="employee-work-panel">
    <header><h3>Assigned service jobs</h3><p>Only cases assigned to your employee account.</p></header>
    {fieldCases.isLoading&&<p>Loading assigned work…</p>}
    {fieldCases.isError&&<p role="alert">Your cases could not be loaded. <button type="button" onClick={()=>void fieldCases.refetch()}>Retry</button></p>}
    {!fieldCases.isLoading&&!fieldCases.isError&&fieldCases.data?.length===0&&<p>No service cases have been assigned to you.</p>}
    {(fieldCases.data??[]).map(item=><article key={item.id} className="employee-work-record"><div><strong>{item.subject}</strong><span>{item.caseNumber} · {readable(item.status)} · {item.priority}</span></div>
      <label>Work note<textarea rows={2} maxLength={2000} value={caseNotes[item.id]??''} onChange={e=>setCaseNotes(v=>({...v,[item.id]:e.target.value}))} placeholder="Describe the work completed or the information still needed" /></label>
      <div className="employee-work-actions"><button disabled={saving} type="button" onClick={()=>void updateField(item.id,'in_progress')}>Work in progress</button><button disabled={saving} type="button" onClick={()=>void updateField(item.id,'waiting_customer')}>Awaiting customer</button></div></article>)}
  </section>;
  return <section className="employee-work-panel">
    <header><h3>My work records</h3><p>Attendance, leave and hours for {branch.name}.</p></header>
    {overview.isLoading&&<p>Loading your work records…</p>}
    {overview.isError&&<p role="alert">Your work records are unavailable. <button type="button" onClick={()=>void overview.refetch()}>Retry</button></p>}
    {!overview.isError&&<div className="employee-work-grid">
      <div className="employee-work-card"><h4>Recent attendance</h4>{!overview.isLoading&&overview.data?.attendance.length===0&&<p>No attendance records yet.</p>}
        {(overview.data?.attendance??[]).slice(0,5).map((item,i)=><p key={`${item.date}-${i}`}>{String(item.date).slice(0,10)} · {readable(item.status)}</p>)}</div>
      <div className="employee-work-card"><h4>My leave requests</h4>{!overview.isLoading&&overview.data?.leave.length===0&&<p>No leave requests yet.</p>}
        {(overview.data?.leave??[]).slice(0,5).map(item=><p key={item.id}>{item.leaveType} · {readable(item.status)} · {String(item.startsOn).slice(0,10)}</p>)}</div>
      <div className="employee-work-card"><h4>My timesheets</h4>{!overview.isLoading&&overview.data?.timesheets.length===0&&<p>No timesheets yet.</p>}
        {(overview.data?.timesheets??[]).slice(0,5).map(item=><p key={item.id}>{String(item.workDate).slice(0,10)} · {readable(item.status)}</p>)}</div>
    </div>}
    <div className="employee-work-grid">
      <form className="employee-work-card" onSubmit={submitLeave}><h4>Request leave</h4>
        <label>Leave type<select value={leaveType} onChange={e=>setLeaveType(e.target.value)}><option value="annual">Annual</option><option value="sick">Sick leave</option><option value="unpaid">Unpaid</option><option value="compassionate">Compassionate</option><option value="study">Study</option><option value="maternity_paternity">Parental leave</option></select></label>
        <label>From<input type="date" value={start} onChange={e=>setStart(e.target.value)} required /></label>
        <label>To<input type="date" value={end} min={start||undefined} onChange={e=>setEnd(e.target.value)} required /></label>
        <label>Working days<input type="number" min="0.5" max="366" step="0.5" value={days} onChange={e=>setDays(e.target.value)} required /></label>
        <button type="submit" disabled={saving||!start||!end}>Submit leave</button>
      </form>
      <form className="employee-work-card" onSubmit={submitHours}><h4>Record working hours</h4>
        <label>Work date<input type="date" required value={workDate} onChange={e=>setWorkDate(e.target.value)}/></label>
        <label>Hours worked<input type="number" min="0.25" max="24" step="0.25" required value={regularHours} onChange={e=>setRegularHours(e.target.value)}/></label>
        <button type="submit" disabled={saving}>Submit hours</button>
      </form>
    </div>
  </section>;
}
