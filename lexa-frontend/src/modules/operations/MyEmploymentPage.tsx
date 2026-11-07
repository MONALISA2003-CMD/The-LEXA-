
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { BriefcaseBusiness, ShieldCheck, Users } from '../../components/LexaIcon';
import { useWorkspace } from '../../app/WorkspaceContext';
import { apiTeamAccess } from '../../data/remote/apiTeamAccess';
export default function MyEmploymentPage(){
 const {workspace}=useWorkspace();
 const query=useQuery({queryKey:['my-employment',workspace.id],queryFn:()=>apiTeamAccess.myEmployment(workspace.id)});
 return <div className="page-stack">
   <div className="page-heading-row"><div><span className="eyebrow eyebrow-blue">MY WORKSPACE</span><h2>My employment profile</h2><p>Your own job information in {workspace.businessName}.</p></div></div>
   {query.isLoading&&<section className="section-card" style={{padding:24}}>Loading your employment summary…</section>}
   {query.isError&&<section className="inline-error" role="alert">Could not load your employment information. <button className="button button-secondary" onClick={()=>void query.refetch()}>Retry</button></section>}
   {!query.isLoading&&!query.isError&&!query.data&&<section className="section-card" style={{padding:24}}><Users size={24}/><h3>No employment profile yet</h3><p>Your CEO can complete your employee record in Team & Permissions.</p></section>}
   {query.data&&<section className="section-card" style={{padding:24,display:'grid',gap:16}}>
    <BriefcaseBusiness size={32} color="#075cf5"/><h2>{query.data.fullName}</h2>
    <div className="my-business-facts">
      <div><span>Employee number</span><strong>{query.data.employeeNumber}</strong></div>
      <div><span>Job title</span><strong>{query.data.jobTitle}</strong></div>
      <div><span>Department</span><strong>{query.data.department??'Not specified'}</strong></div>
      <div><span>Employment type</span><strong>{query.data.employmentType}</strong></div>
      <div><span>Start date</span><strong>{String(query.data.hireDate).slice(0,10)}</strong></div>
      <div><span>Employment status</span><strong>{query.data.employmentStatus}</strong></div>
    </div>
   </section>}
   <div className="overview-integrity-note"><ShieldCheck size={18}/><p>Private employment and payroll records are managed by authorized roles. Contact your CEO to correct any information.</p></div>
   <Link to="/" className="button button-secondary" style={{justifySelf:'start'}}>Back to Overview</Link>
 </div>;
}

