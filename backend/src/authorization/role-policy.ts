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
  | 'reports.read'
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
  'collaboration.read', 'module.read',
];
const OPERATIONAL_WRITES: Permission[] = [
  'catalog.write', 'sales.write', 'sales.return', 'inventory.write',
  'procurement.write', 'procurement.receive', 'crm.write', 'people.write',
  'manufacturing.write', 'fulfilment.write', 'collaboration.write',
  'approval.decide', 'module.write',
];
const ALL_READS: Permission[] = READ_PERMISSIONS;
const OWNER_EXTRA: Permission[] = ['people.private.read','people.directory.write','people.compensation.read','people.compensation.write','payroll.read','payroll.write','projects.read','projects.write','support.read','support.write','audit.read'];

const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  owner: ['workspace.manage', 'finance.write', ...ALL_READS, ...OPERATIONAL_WRITES, ...OWNER_EXTRA],
  owner_administrator: ['workspace.manage', 'finance.write', ...ALL_READS, ...OPERATIONAL_WRITES, ...OWNER_EXTRA],
  administrator: ['workspace.manage', 'finance.write', ...ALL_READS, ...OPERATIONAL_WRITES, ...OWNER_EXTRA],
  admin: ['workspace.manage', 'finance.write', ...ALL_READS, ...OPERATIONAL_WRITES, ...OWNER_EXTRA],
  business_manager: ['finance.write', ...ALL_READS, ...OPERATIONAL_WRITES, 'projects.read','projects.write','support.read','support.write'],
  manager: ['finance.write', ...ALL_READS, ...OPERATIONAL_WRITES, 'projects.read','projects.write','support.read','support.write'],
  branch_manager: ['workspace.read', 'catalog.read', 'sales.read', 'inventory.read', 'procurement.read', 'finance.read', 'crm.read', 'people.read', 'manufacturing.read', 'fulfilment.read', 'reports.read', 'collaboration.read', 'module.read', ...OPERATIONAL_WRITES],
  cashier: ['workspace.read', 'catalog.read', 'sales.read', 'inventory.read', 'reports.read', 'collaboration.read', 'collaboration.write', 'sales.write', 'cash.manage', 'support.read'],
  sales: ['workspace.read', 'catalog.read', 'sales.read', 'inventory.read', 'crm.read', 'reports.read', 'collaboration.read', 'collaboration.write', 'sales.write', 'sales.return', 'crm.write', 'support.read', 'support.write'],
  sales_operator: ['workspace.read', 'catalog.read', 'sales.read', 'inventory.read', 'crm.read', 'reports.read', 'collaboration.read', 'collaboration.write', 'sales.write', 'crm.write', 'support.read', 'support.write'],
  inventory_operator: ['workspace.read', 'catalog.read', 'inventory.read', 'procurement.read', 'manufacturing.read', 'fulfilment.read', 'reports.read', 'collaboration.read', 'collaboration.write', 'catalog.write', 'inventory.write', 'procurement.receive', 'fulfilment.write', 'manufacturing.write', 'module.write'],
  warehouse_operator: ['workspace.read', 'catalog.read', 'inventory.read', 'procurement.read', 'manufacturing.read', 'fulfilment.read', 'reports.read', 'collaboration.read', 'collaboration.write', 'inventory.write', 'procurement.receive', 'fulfilment.write', 'manufacturing.write'],
  accountant: ['workspace.read', 'catalog.read', 'sales.read', 'procurement.read', 'finance.read', 'reports.read', 'collaboration.read', 'collaboration.write', 'finance.write', 'procurement.write', 'approval.decide', 'module.write'],
  read_only: [...ALL_READS],
  readonly: [...ALL_READS],
  viewer: [...ALL_READS],
  member: ['workspace.read', 'catalog.read', 'sales.read', 'inventory.read', 'crm.read', 'reports.read', 'collaboration.read', 'module.read'],
  hr_manager: ['workspace.read','people.read','people.write','people.private.read','people.directory.write','people.compensation.read','people.compensation.write','payroll.read','payroll.write','projects.read','projects.write','support.read','audit.read','collaboration.read','collaboration.write','approval.decide','module.read','module.write'],
  hr_officer: ['workspace.read','people.read','people.write','people.private.read','people.directory.write','projects.read','support.read','support.write','collaboration.read','collaboration.write','approval.decide','module.read','module.write'],
  payroll_officer: ['workspace.read','people.read','people.compensation.read','payroll.read','payroll.write','collaboration.read','collaboration.write','approval.decide','module.read'],
  employee: ['workspace.read','people.read','people.write','projects.read','collaboration.read','collaboration.write','module.read'],
  project_manager: ['workspace.read','people.read','projects.read','projects.write','collaboration.read','collaboration.write','approval.decide','module.read','module.write'],
  support_agent: ['workspace.read','crm.read','people.read','support.read','support.write','collaboration.read','collaboration.write','module.read','module.write'],
  auditor: ['workspace.read','reports.read','audit.read','finance.read','people.read','projects.read','support.read','module.read'],
};

export function normalizeRole(role: string): string {
  return role.trim().toLowerCase().replace(/[\s/-]+/g, '_');
}

export function isWorkspaceAdministrator(role: string): boolean {
  return ['owner', 'admin', 'administrator', 'owner_administrator'].includes(normalizeRole(role));
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

export function permissionForRequest(method: string, pathname: string, params: Record<string, unknown> = {}): Permission | null {
  const verb = method.toUpperCase();
  if (['HEAD', 'OPTIONS'].includes(verb)) return null;
  const write = !['GET'].includes(verb);
  const path = pathname.split('?')[0] ?? pathname;
  const moduleId = typeof params.moduleId === 'string' ? params.moduleId : undefined;
  const choose = (read: Permission, mutation: Permission): Permission => write ? mutation : read;

  if (/\/workspaces\/[^/]+\/members(?:$|\?)|\/memberships\/[^/]+\/(?:branches|role)(?:$|\?)|\/workspaces\/[^/]+\/invitations(?:$|\/)/.test(path)) return 'workspace.manage';
  if (/\/workspaces\/[^/]+$/.test(path) || /\/workspaces\/[^/]+\/branches$/.test(path)) return write ? 'workspace.manage' : 'workspace.read';
  if (/\/products(?:\/|$)|\/categories(?:\/|$)/.test(path)) return choose('catalog.read', 'catalog.write');
  if (/\/inventory\/(?:movements|balances)(?:\/|$)/.test(path)) return choose('inventory.read', 'inventory.write');
  if (/\/sales\/[^/]+\/returns$/.test(path)) return choose('sales.read', 'sales.return');
  if (/\/sales(?:\/|$)/.test(path)) return choose('sales.read', 'sales.write');
  if (/\/commerce\/sales-orders\/[^/]+\/fulfil$|\/commerce\/deliveries(?:\/|$)/.test(path)) return choose('fulfilment.read', 'fulfilment.write');
  if (/\/commerce\/sales-orders(?:\/|$)/.test(path)) return choose('sales.read', 'sales.write');
  if (/\/commerce\/purchase-orders\/[^/]+\/receipts$/.test(path)) return choose('procurement.read', 'procurement.receive');
  if (/\/commerce\/purchase-orders(?:\/|$)/.test(path)) return choose('procurement.read', 'procurement.write');
  if (/\/supply-chain\/procurement\/purchase-orders\/[^/]+\/receipts$/.test(path)) return choose('procurement.read', 'procurement.receive');
  if (/\/supply-chain\/procurement\/approval-rules(?:$|\/)/.test(path)) return choose('procurement.read', 'workspace.manage');
  if (/\/supply-chain\/procurement\/awards\/[^/]+\/(?:approve|reject)$|\/supply-chain\/procurement\/purchase-requests\/[^/]+\/decision$|\/supply-chain\/inventory\/stock-counts\/[^/]+\/approve$|\/supply-chain\/procurement\/supplier-returns\/[^/]+\/approve$|\/supply-chain\/quality\/inspections\/[^/]+\/decision$/.test(path)) return 'approval.decide';
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
    const pair = mapped[moduleId] ?? ['module.read', 'module.write'];
    return choose(pair[0], pair[1]);
  }

  return write ? 'module.write' : 'workspace.read';
}
