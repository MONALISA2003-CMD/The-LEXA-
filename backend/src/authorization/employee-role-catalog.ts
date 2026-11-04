import { availablePermissions } from './role-policy';

export const EMPLOYEE_ROLE_CATALOG: Readonly<Record<string,{label:string;description:string}>> = Object.freeze({
  business_manager: {label: 'Business manager', description: 'Supervise sales, inventory, purchasing and assigned branch operations.'},
  cashier: {label: 'Cashier / sales attendant', description: 'Record sales and manage own cash session; no ledger or payroll access.'},
  sales: {label: 'Sales representative', description: 'Manage customers, leads, quotations and sales orders.'},
  inventory_operator: {label: 'Storekeeper', description: 'Receive, count and transfer stock within assigned branches.'},
  procurement_officer: {label: 'Procurement officer', description: 'Prepare supplier requests and purchase orders; cannot approve their own requests.'},
  accountant: {label: 'Accountant / bookkeeper', description: 'Prepare accounting records and reconcile transactions without owner privileges.'},
  finance_manager: {label: 'Finance manager', description: 'Supervise Finance and independently approve assigned payroll workflows.'},
  hr_officer: {label: 'HR officer', description: 'Manage employee records, attendance and leave, without payroll access.'},
  hr_manager: {label: 'HR manager', description: 'Oversee employee records, leave and timesheet approvals.'},
  payroll_officer: {label: 'Payroll officer', description: 'Prepare payroll and deductions, without approving the same payroll run.'},
  delivery_officer: {label: 'Delivery / logistics', description: 'Manage dispatches, delivery records and rider handovers.'},
  customer_service: {label: 'Customer service', description: 'Support customers and follow up on orders and cases.'},
  production_officer: {label: 'Production officer', description: 'Execute work orders and record production output.'},
  quality_officer: {label: 'Quality officer', description: 'Record quality checks; final release requires separate approval.'},
  project_manager: {label: 'Project manager', description: 'Manage projects, tasks, assigned work and project timesheet approvals.'},
  support_agent: {label: 'Support agent', description: 'Handle authorized support cases and customer enquiries.'},
  field_agent: {label: 'Field service agent', description: 'View and update only service cases assigned to you.'},
  auditor: {label: 'Auditor', description: 'Read approved audit and financial reports; cannot change transactions.'},
  viewer: {label: 'Read-only viewer', description: 'View authorized business records without changes.'},
  employee: {label: 'Ordinary employee', description: 'Access only your employment profile, attendance, leave and timesheets.'},
});
export function invitableRoleCatalog() { return Object.entries(EMPLOYEE_ROLE_CATALOG).map(([role, profile]) => ({role,...profile,permissions:availablePermissions(role)})); }
