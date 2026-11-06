
export const STAFF_NAV_ROUTES: Readonly<Record<string, readonly string[]>> = Object.freeze({
 cashier:['/checkout','/sales','/products','/modules/cash-sessions'],
 sales:['/sales','/products','/modules/sales-orders','/modules/quotations','/modules/customers','/modules/leads','/modules/opportunities','/modules/contacts','/modules/price-lists'],
 sales_operator:['/checkout','/sales','/products','/modules/sales-orders','/modules/quotations','/modules/customers','/modules/price-lists'],
 inventory_operator:['/products','/inventory','/modules/receiving','/modules/stock-counts','/modules/batches','/modules/replenishment','/modules/warehouses','/modules/picklists'],
 warehouse_operator:['/products','/inventory','/modules/receiving','/modules/stock-counts','/modules/batches','/modules/picklists','/modules/warehouses'],
 procurement_officer:['/modules/suppliers','/modules/purchase-requests','/modules/rfqs','/modules/supplier-quotes','/modules/purchases','/modules/receiving','/inventory'],
 accountant:['/modules/accounting','/modules/chart-of-accounts','/modules/expenses','/modules/payments','/modules/money-accounts','/modules/bank-reconciliation','/modules/sales-invoices','/modules/purchase-invoices','/modules/tax-documents','/reports'],
 finance_manager:['/modules/accounting','/modules/chart-of-accounts','/modules/expenses','/modules/payments','/modules/money-accounts','/modules/bank-reconciliation','/modules/budgets','/modules/sales-invoices','/modules/purchase-invoices','/reports'],
 hr_officer:['/modules/employees','/modules/attendance','/modules/leave','/modules/timesheets'],
 hr_manager:['/modules/employees','/modules/attendance','/modules/leave','/modules/timesheets','/modules/payroll'],
 payroll_officer:['/modules/employees','/modules/payroll','/modules/attendance'],
 delivery_officer:['/modules/deliveries','/modules/packages','/modules/picklists'],
 production_officer:['/modules/work-orders','/modules/boms','/modules/job-cards','/modules/quality','/inventory','/products'],
 quality_officer:['/modules/quality','/modules/work-orders','/modules/batches','/inventory'],
 customer_service:['/modules/customers','/modules/support','/modules/contacts','/modules/sales-orders'],
 support_agent:['/modules/support','/modules/customers','/modules/contacts'],
 project_manager:['/modules/projects','/modules/tasks','/modules/timesheets'],
 auditor:['/reports','/modules/accounting','/modules/expenses','/modules/payments'],
 viewer:['/reports','/products','/inventory'],
 read_only:['/reports','/products','/inventory'],
 readonly:['/reports','/products','/inventory'],
  technician:['/products','/inventory'],
 field_agent:[],
 employee:[],
 business_manager:['/reports','/sales','/checkout','/products','/inventory','/modules/sales-orders','/modules/sales-returns','/modules/customers','/modules/contacts','/modules/leads','/modules/purchase-requests','/modules/purchases','/modules/suppliers','/modules/receiving','/modules/stock-counts','/modules/deliveries','/modules/packages','/modules/projects','/modules/tasks'],
 manager:['/reports','/sales','/checkout','/products','/inventory','/modules/sales-orders','/modules/sales-returns','/modules/customers','/modules/contacts','/modules/leads','/modules/purchase-requests','/modules/purchases','/modules/suppliers','/modules/receiving','/modules/stock-counts','/modules/deliveries','/modules/packages','/modules/projects','/modules/tasks'],
});
export function isEmployeeNavigationAllowed(role:string,path:string):boolean{
 if(['/','/workspace','/my-employment','/settings','/settings/security','/settings/privacy'].includes(path))return true;
 return (STAFF_NAV_ROUTES[role.trim().toLowerCase()]??[]).includes(path);
}

