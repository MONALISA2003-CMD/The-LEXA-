
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Activity, ArrowRight, BriefcaseBusiness, ClipboardList, Package, ShieldCheck, ShoppingCart, Users, Wallet } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { isEmployeeNavigationAllowed } from '../../domain/shared/staffNavigation';
import EmployeeWorkPanel from './EmployeeWorkPanel';
import { apiTeamAccess, type BusinessAccess } from '../../data/remote/apiTeamAccess';

type LinkItem={label:string;to:string;permission:string;icon:typeof Activity};
const WORK:LinkItem[]=[
 {label:'Checkout / POS',to:'/checkout',permission:'sales.write',icon:ShoppingCart},
 {label:'Sales & receipts',to:'/sales',permission:'sales.read',icon:ShoppingCart},
 {label:'Products & pricing',to:'/products',permission:'catalog.read',icon:Package},
 {label:'Inventory',to:'/inventory',permission:'inventory.read',icon:Package},
 {label:'Purchasing',to:'/modules/purchases',permission:'procurement.read',icon:ClipboardList},
 {label:'Accounting & finance',to:'/modules/accounting',permission:'finance.read',icon:Wallet},
 {label:'Employees & HR',to:'/modules/employees',permission:'people.read',icon:Users},
 {label:'HR & attendance',to:'/modules/attendance',permission:'people.read',icon:Users},
 {label:'Delivery operations',to:'/modules/deliveries',permission:'fulfilment.read',icon:BriefcaseBusiness},
 {label:'Production',to:'/modules/work-orders',permission:'manufacturing.read',icon:BriefcaseBusiness},
 {label:'Projects',to:'/modules/projects',permission:'projects.read',icon:BriefcaseBusiness},
 {label:'Customer service',to:'/modules/support',permission:'support.read',icon:Users},
 {label:'Reports',to:'/reports',permission:'reports.read',icon:Activity},
];
const preferred:Record<string,string[]>={
 cashier:['/checkout','/sales','/products'],sales:['/sales','/checkout','/products','/reports'],
 inventory_operator:['/inventory','/products','/modules/purchases'],warehouse_operator:['/inventory','/products'],
 accountant:['/modules/accounting','/reports','/sales'],
 finance_manager:['/modules/accounting','/reports','/sales'],procurement_officer:['/modules/purchases','/inventory'],
 hr_officer:['/modules/employees','/modules/attendance'],hr_manager:['/modules/employees','/modules/attendance'],
 payroll_officer:['/modules/employees','/modules/attendance'],delivery_officer:['/modules/deliveries','/inventory'],
 production_officer:['/modules/work-orders','/inventory'],quality_officer:['/modules/work-orders','/inventory'],
 customer_service:['/modules/support','/sales'],support_agent:['/modules/support'],technician:['/inventory','/products'],
 project_manager:['/modules/projects'],business_manager:['/sales','/inventory','/modules/purchases','/reports'],
};
export default function StaffDashboard({access}:{access:BusinessAccess}){
 const {workspace}=useWorkspace();
 const mine=useQuery({queryKey:['my-employment',workspace.id],queryFn:()=>apiTeamAccess.myEmployment(workspace.id)});
 const permissions=new Set(access.permissions);
 const ranking=preferred[access.role]??[];
 const tools=WORK.filter(item=>permissions.has(item.permission) && isEmployeeNavigationAllowed(access.role,item.to) && (access.role !== 'employee' || !['people.read','finance.read','reports.read'].includes(item.permission))).sort((a,b)=>{
  const x=ranking.indexOf(a.to),y=ranking.indexOf(b.to);
  return (x<0?99:x)-(y<0?99:y);
 });
 return <div className="page-stack lexa-staff-home">
  <section className="overview-hero lexa-staff-hero">
    <div className="overview-hero-copy">
      <div className="overview-kicker"><span/> MY BUSINESS WORKSPACE</div>
      <h2>Welcome to your <span>workday.</span></h2>
      <p>{workspace.businessName} · {mine.data?.fullName??'Team member'} · {mine.data?.jobTitle??access.role.replaceAll('_',' ')}</p>
      <div className="overview-hero-actions"><Link to="/my-employment" className="button button-primary"><BriefcaseBusiness size={16}/> My employment profile</Link></div>
    </div>
  </section>
  <div className="overview-service-note"><ShieldCheck size={20}/><div><strong>Your CEO has assigned your business permissions</strong>
    <span>Only the screens needed for your role are shown. Your workspace never reveals private payroll, accounts or other employees' records unless expressly authorized.</span></div></div>
  {(access.role==='employee'||access.role==='field_agent'||access.role==='technician')&&<EmployeeWorkPanel role={access.role}/> }
  <section className="overview-section">
   <div className="overview-section-heading"><div><span className="eyebrow eyebrow-blue">YOUR WORK TOOLS</span><h3>What you can access</h3><p>Choose a business task to get started.</p></div></div>
   <div className="overview-workflow-grid">
     {tools.map(item=>{const Icon=item.icon;return <Link className="overview-workflow-card" key={item.to} to={item.to} style={{textDecoration:'none'}}>
       <i><Icon size={20}/></i><span><strong>{item.label}</strong><small>Open assigned business tool</small></span><ArrowRight size={16}/>
     </Link>})}
     <Link className="overview-workflow-card" to="/my-employment" style={{textDecoration:'none'}}><i><Users size={20}/></i>
       <span><strong>My profile</strong><small>View your employment summary</small></span><ArrowRight size={16}/></Link>
   </div>
  </section>
 </div>;
}

