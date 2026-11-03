export type Permission =
  | 'workspace.read' | 'workspace.manage'
  | 'catalog.read' | 'catalog.write'
  | 'sales.read' | 'sales.write' | 'sales.return'
  | 'inventory.read' | 'inventory.write'
  | 'procurement.read' | 'procurement.write' | 'procurement.receive'
  | 'finance.read' | 'finance.write' | 'cash.manage'
  | 'crm.read' | 'crm.write'
  | 'people.read' | 'people.write' | 'people.private.read' | 'people.directory.write'
  | 'manufacturing.read' | 'manufacturing.write'
  | 'fulfilment.read' | 'fulfilment.write'
  | 'reports.read' | 'intelligence.read' | 'intelligence.run' | 'saas.read' | 'saas.manage'
  | 'collaboration.read' | 'collaboration.write'
  | 'approval.decide'
  | 'people.compensation.read' | 'people.compensation.write'
  | 'payroll.read' | 'payroll.write'
  | 'projects.read' | 'projects.write'
  | 'support.read' | 'support.write'
  | 'audit.read'
  | 'module.read' | 'module.write';

const READ_PERMISSIONS: Permission[] = [
  'workspace.read', 'catalog.read', 'sales.read', 'inventory.read',
  'procurement.read', 'finance.read', 'crm.read', 'people.read',
  'manufacturing.read', 'fulfilment.read', 'reports.read',
  'collaboration.read', 'module.read', 'intelligence.read', 'saas.read',
];
const OPERATIONAL_WRITES: Permission[] = [
  'catalog.write', 'sales.write', 'sales.return', 'inventory.write',
  'procurement.write', 'procurement.receive', 'crm.write', 'people.write',
  'manufacturing.write', 'fulfilment.write', 'collaboration.write',
  'approval.decide', 'module.write',
];
const ALL_READS: Permission[] = READ_PERMISSIONS;
const OWNER_EXTRA: Permission[] = ['saas.manage','people.private.read','people.directory.write','people.compensation.read','people.compensation.write','payroll.read','payroll.write','projects.read','projects.write','support.read','support.write','audit.read'];

const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  owner: ['workspace.manage', 'finance.write', 'intelligence.run', ...ALL_READS, ...OPERATIONAL_WRITES, ...OWNER_EXTRA],
  owner_administrator: ['workspace.manage', 'finance.write', 'intelligence.run', ...ALL_READS, ...OPERATIONAL_WRITES, ...OWNER_EXTRA],
  administrator: ['workspace.read','catalog.read','catalog.write','sales.read','sales.write','sales.return','inventory.read','inventory.write','procurement.read','procurement.write','procurement.receive','finance.read','crm.read','crm.write','fulfilment.read','fulfilment.write','reports.read','collaboration.read','collaboration.write','projects.read','projects.write','support.read','support.write','approval.decide','module.read','module.write'],
  admin: ['workspace.read','catalog.read','catalog.write','sales.read','sales.write','sales.return','inventory.read','inventory.write','procurement.read','procurement.write','procurement.receive','finance.read','crm.read','crm.write','fulfilment.read','fulfilment.write','reports.read','collaboration.read','collaboration.write','projects.read','projects.write','support.read','support.write','approval.decide','module.read','module.write'],
  business_manager: ['workspace.read','catalog.read','catalog.write','sales.read','sales.write','sales.return','inventory.read','inventory.write','procurement.read','procurement.write','procurement.receive','finance.read','crm.read','crm.write','fulfilment.read','fulfilment.write','reports.read','collaboration.read','collaboration.write','projects.read','projects.write','support.read','support.write','approval.decide','module.read','module.write'],
  manager: ['workspace.read','catalog.read','catalog.write','sales.read','sales.write','sales.return','inventory.read','inventory.write','procurement.read','procurement.write','procurement.receive','finance.read','crm.read','crm.write','fulfilment.read','fulfilment.write','reports.read','collaboration.read','collaboration.write','projects.read','projects.write','support.read','support.write','approval.decide','module.read','module.write'],
  branch_manager: ['workspace.read','catalog.read','catalog.write','sales.read','sales.write','sales.return','inventory.read','inventory.write','procurement.read','procurement.write','procurement.receive','finance.read','crm.read','crm.write','fulfilment.read','fulfilment.write','reports.read','collaboration.read','collaboration.write','projects.read','projects.write','support.read','support.write','approval.decide','module.read','module.write'],
  cashier: ['workspace.read', 'catalog.read', 'sales.read', 'inventory.read', 'fulfilment.read', 'collaboration.read', 'collaboration.write', 'sales.write', 'cash.manage', 'support.read'],
  sales: ['workspace.read', 'catalog.read', 'sales.read', 'inventory.read', 'fulfilment.read', 'crm.read', 'collaboration.read', 'collaboration.write', 'sales.write', 'crm.write', 'support.read', 'support.write'],
  sales_operator: ['workspace.read', 'catalog.read', 'sales.read', 'inventory.read', 'fulfilment.read', 'crm.read', 'collaboration.read', 'collaboration.write', 'sales.write', 'crm.write', 'support.read', 'support.write'],
  inventory_operator: ['workspace.read', 'catalog.read', 'inventory.read', 'procurement.read', 'manufacturing.read', 'fulfilment.read', 'collaboration.read', 'collaboration.write', 'catalog.write', 'inventory.write', 'procurement.receive', 'fulfilment.write', 'manufacturing.write', 'module.write'],
  warehouse_operator: ['workspace.read', 'catalog.read', 'inventory.read', 'procurement.read', 'manufacturing.read', 'fulfilment.read', 'collaboration.read', 'collaboration.write', 'inventory.write', 'procurement.receive', 'fulfilment.write', 'manufacturing.write'],
  finance_manager: ['workspace.read','finance.read','finance.write','cash.manage','sales.read','procurement.read','reports.read','approval.decide','audit.read','module.read'],
  delivery_officer: ['workspace.read','fulfilment.read','fulfilment.write','sales.read','inventory.read','module.read','collaboration.read'],
  production_officer: ['workspace.read','manufacturing.read','manufacturing.write','inventory.read','inventory.write','catalog.read','module.read'],
  quality_officer: ['workspace.read','manufacturing.read','manufacturing.write','inventory.read','catalog.read','module.read','approval.decide'],
  accountant: ['intelligence.read', 'intelligence.run', 'saas.read', 'workspace.read', 'catalog.read', 'sales.read', 'fulfilment.read', 'procurement.read', 'finance.read', 'reports.read', 'collaboration.read', 'collaboration.write', 'finance.write', 'procurement.write', 'module.write'],
  read_only: ['workspace.read','reports.read','sales.read','inventory.read','catalog.read','module.read'],
  readonly: ['workspace.read','reports.read','sales.read','inventory.read','catalog.read','module.read'],
  viewer: ['workspace.read','reports.read','sales.read','inventory.read','catalog.read','module.read'],
  member: ['workspace.read', 'catalog.read', 'sales.read', 'inventory.read', 'crm.read', 'reports.read', 'collaboration.read', 'module.read'],
  hr_manager: ['workspace.read','people.read','people.write','people.private.read','people.directory.write','people.compensation.read','people.compensation.write','payroll.read','payroll.write','projects.read','projects.write','support.read','audit.read','collaboration.read','collaboration.write','approval.decide','module.read','module.write'],
  hr_officer: ['workspace.read','people.read','people.write','people.private.read','people.directory.write','projects.read','support.read','support.write','collaboration.read','collaboration.write','approval.decide','module.read','module.write'],
  payroll_officer: ['workspace.read','people.read','people.compensation.read','payroll.read','payroll.write','collaboration.read','collaboration.write','approval.decide','module.read'],
  employee: ['workspace.read','people.read','collaboration.read','collaboration.write'],
  project_manager: ['workspace.read','people.read','projects.read','projects.write','collaboration.read','collaboration.write','approval.decide','module.read','module.write'],
  support_agent: ['workspace.read','crm.read','people.read','support.read','support.write','collaboration.read','collaboration.write','module.read','module.write'],
  procurement_officer: ['workspace.read','catalog.read','inventory.read','procurement.read','procurement.write','crm.read','collaboration.read'],
  customer_service: ['workspace.read','crm.read','crm.write','sales.read','support.read','support.write','collaboration.read'],
  auditor: ['workspace.read','reports.read','audit.read','finance.read','people.read','projects.read','support.read','module.read'],
};

export function normalizeRole(role: string): string {
  return role.trim().toLowerCase().replace(/[\s/-]+/g, '_');
}

export function isWorkspaceAdministrator(role: string): boolean {
  return ['owner', 'owner_administrator'].includes(normalizeRole(role));
}

/** A restricted scope may contain zero branches; administrators always retain workspace-wide access. */
export function canAccessBranch(role: string, scopeMode: string, isAssigned: boolean): boolean {
  return isWorkspaceAdministrator(role) || scopeMode !== 'restricted' || isAssigned;
}

export function hasPermission(role: string, permission: Permission): boolean {
  const normalized = normalizeRole(role);
  const permissions = ROLE_PERMISSIONS[normalized];
  // Cash register operations are separately permissioned from general ledger posting.
  if (permission === 'cash.manage') return ['owner','owner_administrator','administrator','admin','business_manager','manager','branch_manager','accountant','cashier'].includes(normalized);
  // Unknown role names fail closed; never infer write access from membership alone.
  return permissions?.includes(permission) ?? false;
}

export const availablePermissions = (role: string): Permission[] => [...new Set([...(ROLE_PERMISSIONS[normalizeRole(role)] ?? []), ...(hasPermission(role, 'cash.manage') ? ['cash.manage' as Permission] : [])])];
export const isOwnerRole = (role: string) => ['owner', 'owner_administrator'].includes(normalizeRole(role));

export function permissionForRequest(method: string, pathname: string, params: Record<string, unknown> = {}): Permission | null {
  const verb = method.toUpperCase();
  if (['HEAD', 'OPTIONS'].includes(verb)) return null;
  const write = !['GET'].includes(verb);
  const path = pathname.split('?')[0] ?? pathname;
  const moduleId = typeof params.moduleId === 'string' ? params.moduleId : undefined;
  const choose = (read: Permission, mutation: Permission): Permission => write ? mutation : read;

  if (/\/workspaces\/[^/]+\/staff(?:\/|$)/.test(path)) return 'workspace.manage';
  if (/\/workspaces\/[^/]+\/my-employment$/.test(path)) return 'workspace.read';
  if (/\/workspaces\/[^/]+\/access$/.test(path)) return 'workspace.read';
  if (/\/workspaces\/[^/]+\/business-setup(?:\/complete)?$/.test(path)) return write ? 'workspace.manage' : 'workspace.read';
  if (/\/workspaces\/[^/]+\/members(?:$|\?)|\/memberships\/[^/]+(?:\/(?:branches|role|status))?(?:$|\?)|\/workspaces\/[^/]+\/invitations(?:$|\/)/.test(path)) return 'workspace.manage';
  if (/\/crm\/choices$/.test(path)) return 'sales.write';
  if (/\/crm(?:\/|$)/.test(path)) return choose('crm.read', 'crm.write');
  if (/\/modules\/(?:leads|opportunities|contacts|campaigns|sales-teams|customers)\/records(?:\/|$)/.test(path)) return choose('crm.read','crm.write');
  if (/\/recurring-invoices(?:\/|$)/.test(path)) return choose('sales.read', 'sales.write');
  if (/\/intelligence\/status$/.test(path)) return 'intelligence.read';
  if (/\/intelligence\/(?:help|explain|extract)$/.test(path)) return 'intelligence.run';
  if (/\/reports\/(?:authoritative|library)$/.test(path)) return 'reports.read';
  if (/\/intelligence\/brief$/.test(path)) return 'intelligence.read';
  if (/\/saas\/entitlements$|\/saas\/usage$/.test(path)) return 'saas.read';
  if (/\/saas\/support-diagnostics$/.test(path)) return 'support.read';
  if (/\/saas\/plans$/.test(path)) return 'saas.read';
  if (/\/saas\/(?:features|feature-overrides)(?:\/|$)/.test(path)) return 'saas.manage';
  if (/\/operations(?:\/|$)/.test(path)) return choose('workspace.read', 'module.write');
  if (/\/workspaces\/[^/]+$/.test(path) || /\/workspaces\/[^/]+\/branches$/.test(path)) return write ? 'workspace.manage' : 'workspace.read';
  if (/\/products(?:\/|$)|\/categories(?:\/|$)/.test(path)) return choose('catalog.read', 'catalog.write');
  if (/\/inventory\/(?:movements|balances)(?:\/|$)/.test(path)) return choose('inventory.read', 'inventory.write');
  if (/\/sales\/[^/]+\/returns$/.test(path)) return choose('sales.read', 'sales.return');
  if (/\/sales(?:\/|$)/.test(path)) return choose('sales.read', 'sales.write');
  if (/\/commerce\/payment-report$/.test(path)) return 'sales.read';
  if (/\/platform\/attachments(?:\/|$)/.test(path)) return choose('collaboration.read','collaboration.write');
  if (/\/platform\/jobs\/(?:backup|restore-dry-run|restore)$/.test(path) || /\/platform\/jobs\/[^/]+\/restore-(?:approve|release)$/.test(path) || /\/platform\/events\/(?:dead-letter|[^/]+\/replay)$/.test(path)) return 'workspace.manage';
  if (/\/platform\/jobs\/export$/.test(path)) return 'reports.read';
  if (/\/platform\/jobs\/(?:import|[^/]+\/(?:approve|cancel|retry))$/.test(path)) return choose('catalog.read','catalog.write');
  if (/\/platform\/jobs(?:$|\/)/.test(path) || /\/platform\/imports\/templates$/.test(path)) return choose('reports.read','catalog.write');
  if (/\/platform\/jobs\/[^/]+\/download-url$/.test(path)) return 'reports.read';
  if (/\/branches\/[^/]+\/tax\/(?:references|codes|summary)(?:\/|$)/.test(path)) return choose('finance.read','finance.write');
  if (/\/branches\/[^/]+\/tax\/preview$/.test(path)) return 'finance.read';
  if (/\/commerce\/delivery-report$/.test(path)) return 'fulfilment.read';
  if (/\/commerce\/dispatches\/[^/]+\/direct-receipts$/.test(path)) return choose('sales.read', 'sales.write');
  if (/\/commerce\/remittances(?:\/|$)/.test(path)) return choose('sales.read', 'cash.manage');
  if (/\/commerce\/(?:sales-orders\/[^/]+\/fulfil|deliveries|dispatches|delivery-agents|collection-reports|remittances)(?:\/|$)/.test(path)) return choose('fulfilment.read', 'fulfilment.write');
  if (/\/commerce\/sales-orders(?:\/|$)/.test(path)) return choose('sales.read', 'sales.write');
  if (/\/commerce\/purchase-orders\/[^/]+\/receipts$/.test(path)) return choose('procurement.read', 'procurement.receive');
  if (/\/commerce\/purchase-orders(?:\/|$)/.test(path)) return choose('procurement.read', 'procurement.write');
  if (/\/supply-chain\/procurement\/purchase-orders\/[^/]+\/receipts$/.test(path)) return choose('procurement.read', 'procurement.receive');
  if (/\/supply-chain\/procurement\/approval-rules(?:$|\/)/.test(path)) return choose('procurement.read', 'workspace.manage');
  if (/\/supply-chain\/procurement\/awards\/[^/]+\/(?:approve|reject)$|\/supply-chain\/procurement\/purchase-requests\/[^/]+\/decision$|\/supply-chain\/inventory\/stock-counts\/[^/]+\/approve$|\/supply-chain\/procurement\/supplier-returns\/[^/]+\/approve$|\/supply-chain\/quality\/inspections\/[^/]+\/decision$/.test(path)) return 'approval.decide';
  if (/\/branches\/[^/]+\/selling\/insights$/.test(path)) return 'sales.read';
  if (/\/branches\/[^/]+\/selling\/lookup$/.test(path)) return 'sales.read';
  if (/\/supply-chain\/procurement(?:\/|$)/.test(path)) return choose('procurement.read', 'procurement.write');
  if (/\/supply-chain\/inventory(?:\/|$)/.test(path)) return choose('inventory.read', 'inventory.write');
  if (/\/supply-chain\/manufacturing(?:\/|$)|\/supply-chain\/quality(?:\/|$)/.test(path)) return choose('manufacturing.read', 'manufacturing.write');
  if (/\/commerce\/crm\//.test(path)) return choose('crm.read', 'crm.write');
  if (/\/branches\/[^/]+\/finance\/cash-sessions(?:\/|$)|\/branches\/[^/]+\/finance\/cash-ups(?:\/|$)/.test(path)) return choose('finance.read', 'cash.manage');
  if (/\/ledger(?:\/|$)|\/receivables(?:\/|$)|\/payables(?:\/|$)|\/finance(?:\/|$)|\/business-tools\/tax-profile$|\/cash-ups(?:\/|$)/.test(path)) return choose('finance.read', 'finance.write');
  if (/\/catalog(?:\/|$)|\/tax-codes(?:\/|$)|\/price-lists(?:\/|$)/.test(path)) return choose('catalog.read', 'catalog.write');
  if (/\/warehouses(?:\/|$)|\/lots(?:\/|$)|\/reservations(?:\/|$)|\/variants(?:\/|$)/.test(path)) return choose('inventory.read', 'inventory.write');
  if (/\/business-tools\/(?:snapshot|tax-profile)$|\/branches\/[^/]+\/(?:dashboard|analytics|reports)(?:\/|$)/.test(path)) return choose('reports.read', 'finance.write');
  if (/\/workstream6\/audit\/events(?:$|\?)/.test(path)) return 'audit.read';
  if (/\/workstream6\/people\/employees\/[^/]+\/compensation(?:$|\?)/.test(path)) return choose('people.compensation.read', 'people.compensation.write');
  if (path.endsWith('/workstream6/people/employees') || path.endsWith('/workstream6/people/shifts')) return choose('people.read', 'people.directory.write');
  if (/\/workstream6\/people\/payroll(?:\/|$)/.test(path)) return choose('payroll.read', 'payroll.write');
  if (/\/workstream6\/people(?:\/|$)/.test(path)) return choose('people.read', 'people.write');
  if (/\/workstream6\/projects(?:\/|$)/.test(path)) return choose('projects.read', 'projects.write');
  if (/\/workstream6\/support(?:\/|$)/.test(path)) return choose('support.read', 'support.write');
  if (/\/approvals(?:\/|$)/.test(path)) return choose('collaboration.read', 'approval.decide');
  if (/\/inbox\/|\/tasks(?:\/|$)|\/notifications(?:\/|$)|\/activity(?:\/|$)/.test(path)) return choose('collaboration.read', 'collaboration.write');
  if (/\/module-graph\//.test(path)) return choose('module.read', 'module.write');

  if (/\/modules\/[^/]+\/records(?:\/|$)/.test(path) && moduleId) {
    const mapped: Record<string, [Permission, Permission]> = {
      'sales-invoices': ['sales.read', 'sales.write'], quotations: ['sales.read', 'sales.write'], 'sales-orders': ['sales.read', 'sales.write'], 'sales-returns': ['sales.read', 'sales.return'], 'cash-sessions': ['sales.read', 'sales.write'], 'recurring-invoices': ['sales.read', 'sales.write'],
      purchases: ['procurement.read', 'procurement.write'], 'purchase-invoices': ['procurement.read', 'procurement.write'], 'purchase-requests': ['procurement.read', 'procurement.write'], rfqs: ['procurement.read', 'procurement.write'], 'supplier-quotes': ['procurement.read', 'procurement.write'], 'purchase-returns': ['procurement.read', 'procurement.write'],
      expenses: ['finance.read', 'finance.write'], 'money-accounts': ['finance.read', 'finance.write'], payments: ['finance.read', 'finance.write'], accounting: ['finance.read', 'finance.write'], assets: ['finance.read', 'finance.write'], 'chart-of-accounts': ['finance.read', 'finance.write'], 'tax-codes': ['finance.read', 'finance.write'], 'tax-documents': ['finance.read', 'finance.write'], 'bank-reconciliation': ['finance.read', 'finance.write'], 'cost-centers': ['finance.read', 'finance.write'], budgets: ['finance.read', 'finance.write'], audit: ['audit.read', 'audit.read'],
      customers: ['crm.read', 'crm.write'], projects: ['projects.read','projects.write'], 'project-tasks': ['projects.read','projects.write'], suppliers: ['procurement.read', 'procurement.write'], contacts: ['crm.read', 'crm.write'], leads: ['crm.read', 'crm.write'], opportunities: ['crm.read', 'crm.write'], campaigns: ['crm.read', 'crm.write'], 'sales-teams': ['crm.read', 'crm.write'], support: ['support.read', 'support.write'],
      employees: ['people.read', 'people.write'], attendance: ['people.read', 'people.write'], payroll: ['payroll.read', 'payroll.write'], leave: ['people.read', 'people.write'], timesheets: ['people.read', 'people.write'], shifts: ['people.read','people.write'],
      warehouses: ['inventory.read', 'inventory.write'], 'stock-counts': ['inventory.read', 'inventory.write'], 'stock-transfers': ['inventory.read', 'inventory.write'], 'work-orders': ['manufacturing.read', 'manufacturing.write'], quality: ['manufacturing.read', 'manufacturing.write'], batches: ['inventory.read', 'inventory.write'], replenishment: ['inventory.read', 'inventory.write'], 'item-bundles': ['inventory.read', 'inventory.write'], boms: ['manufacturing.read', 'manufacturing.write'], 'job-cards': ['manufacturing.read', 'manufacturing.write'], picklists: ['fulfilment.read', 'fulfilment.write'], deliveries: ['fulfilment.read', 'fulfilment.write'], packages: ['fulfilment.read', 'fulfilment.write'],
    };
    const pair = mapped[moduleId] ?? ['module.read', 'workspace.manage'];
    return choose(pair[0], pair[1]);
  }

  return write ? 'module.write' : 'workspace.read';
}
