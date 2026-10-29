import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import {
  Activity, ArrowDownUp, Banknote, Bell, BookOpen, Building2, BarChart3, ChevronDown, Target, Boxes, Plug,
  CircleHelp, ClipboardList, Command, CreditCard, FileText, LayoutDashboard, Menu,
  Package, PackageCheck, ReceiptText, Settings, ShoppingCart, Store, Tag, Truck, Users, Wallet, X, Moon, Sun,
} from 'lucide-react';
import { toast } from 'sonner';
import { localWorkspaceRepository } from '../../data/local/workspaces';
import { WorkspaceContext } from '../WorkspaceContext';
import type { Branch, Workspace } from '../../domain/shared/types';
import { moduleAccentForGroup, moduleAccentForPath } from '../../domain/shared/moduleAccents';

const ACTIVE_WORKSPACE_KEY = 'lexa.ui.activeWorkspaceId';
const ACTIVE_BRANCH_KEY = 'lexa.ui.activeBranchId';

const navSections = [
  { title: 'WORKSPACE', items: [
    { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/workspace', label: 'Business & branches', icon: Building2 },
    { to: '/modules', label: 'All modules', icon: Command, end: true },
  ] },
  { title: 'CRM & GROWTH', items: [
    { to: '/modules/leads', label: 'Leads & prospects', icon: Users },
    { to: '/modules/opportunities', label: 'Opportunities', icon: Target },
    { to: '/modules/contacts', label: 'Contacts & addresses', icon: Users },
    { to: '/modules/campaigns', label: 'Campaigns', icon: Activity },
    { to: '/modules/sales-teams', label: 'Sales team & territories', icon: Users },
  ] },
  { title: 'SELLING', items: [
    { to: '/checkout', label: 'Checkout / POS', icon: ShoppingCart },
    { to: '/sales', label: 'Sales & receipts', icon: CreditCard },
    { to: '/modules/sales-orders', label: 'Sales orders', icon: ShoppingCart },
    { to: '/modules/sales-invoices', label: 'Sales invoices', icon: ReceiptText },
    { to: '/modules/quotations', label: 'Quotations', icon: FileText },
    { to: '/modules/price-lists', label: 'Price lists & pricing', icon: Tag },
    { to: '/modules/customers', label: 'Customers', icon: Users },
  ] },
  { title: 'INVENTORY', items: [
    { to: '/products', label: 'Products', icon: Package },
    { to: '/inventory', label: 'Stock & movements', icon: ArrowDownUp },
    { to: '/modules/receiving', label: 'Goods receiving', icon: PackageCheck },
    { to: '/modules/stock-counts', label: 'Stock counts', icon: ClipboardList },
    { to: '/modules/stock-transfers', label: 'Stock transfers', icon: Truck },
    { to: '/modules/warehouses', label: 'Warehouses & locations', icon: Building2 },
    { to: '/modules/picklists', label: 'Picklists & picking', icon: ClipboardList },
    { to: '/modules/item-bundles', label: 'Item bundles', icon: Boxes },
  ] },
  { title: 'LOGISTICS', items: [
    { to: '/modules/deliveries', label: 'Deliveries & fulfilment', icon: Truck },
  ] },
  { title: 'PROCUREMENT', items: [
    { to: '/modules/purchase-requests', label: 'Purchase requests', icon: ClipboardList },
    { to: '/modules/rfqs', label: 'Requests for quotation', icon: FileText },
    { to: '/modules/supplier-quotes', label: 'Supplier quotations', icon: FileText },
    { to: '/modules/suppliers', label: 'Suppliers', icon: Truck },
    { to: '/modules/purchases', label: 'Purchase orders', icon: ClipboardList },
    { to: '/modules/purchase-invoices', label: 'Supplier invoices', icon: ReceiptText },
  ] },
  { title: 'FINANCE', items: [
    { to: '/modules/expenses', label: 'Expenses', icon: ReceiptText },
    { to: '/modules/money-accounts', label: 'Cash & money accounts', icon: Wallet },
    { to: '/modules/payments', label: 'Receipts & payments', icon: CreditCard },
    { to: '/modules/accounting', label: 'Accounting journals', icon: BookOpen },
    { to: '/modules/chart-of-accounts', label: 'Chart of accounts', icon: BookOpen },
    { to: '/modules/tax-codes', label: 'Tax codes & rules', icon: ReceiptText },
    { to: '/modules/bank-reconciliation', label: 'Bank reconciliation', icon: Banknote },
    { to: '/modules/assets', label: 'Fixed assets', icon: Building2 },
    { to: '/modules/cost-centers', label: 'Cost centres', icon: BookOpen },
    { to: '/modules/budgets', label: 'Budgets & forecasts', icon: Wallet },
    { to: '/modules/recurring-invoices', label: 'Recurring billing', icon: ReceiptText },
    { to: '/modules/tax-documents', label: 'Tax documents / EFRIS', icon: BookOpen },
  ] },
  { title: 'PEOPLE & PAYROLL', items: [
    { to: '/modules/employees', label: 'Employees & HR', icon: Users },
    { to: '/modules/attendance', label: 'Attendance & shifts', icon: Activity },
    { to: '/modules/payroll', label: 'Payroll', icon: Wallet },
  ] },
  { title: 'INTEGRATION & CONTROL', items: [
    { to: '/modules/integrations', label: 'Integration status', icon: Plug },
    { to: '/modules/reports', label: 'Reports & analytics', icon: BarChart3 },
    { to: '/modules/team', label: 'Team & access', icon: Users },
    { to: '/business-tools', label: 'Business tools', icon: Settings },
    { to: '/modules/audit', label: 'Activity & audit log', icon: Activity },
  ] },
];

function routeTitle(pathname: string): string {
  if (pathname === '/') return 'Overview';
  if (pathname.startsWith('/sales/')) return 'Sale details';
  if (pathname === '/modules') return 'All modules';
  const found = navSections.flatMap((section) => section.items)
    .filter((item) => item.to !== '/')
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => pathname === item.to || pathname.startsWith(item.to + '/'));
  if (found) return found.label;
  if (pathname === '/settings') return 'Settings';
  return 'Workspace';
}

export default function AppShell() {
  const location = useLocation();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [resolvedBranchWorkspaceId, setResolvedBranchWorkspaceId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [uiMode, setUiMode] = useState<'simple' | 'advanced'>(() => {
    try { return window.localStorage.getItem('lexa.ui.mode') === 'advanced' ? 'advanced' : 'simple'; }
    catch { return 'simple'; }
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return window.localStorage.getItem('lexa.ui.theme') === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem('lexa.ui.theme', theme); } catch { /* Theme still works for this session. */ }
  }, [theme]);
  useEffect(() => {
    const handleModeChange = (event: Event) => {
      const mode = (event as CustomEvent<'simple' | 'advanced'>).detail;
      if (mode === 'simple' || mode === 'advanced') setUiMode(mode);
    };
    window.addEventListener('lexa:ui-mode-change', handleModeChange);
    return () => window.removeEventListener('lexa:ui-mode-change', handleModeChange);
  }, []);
  const visibleNavSections = uiMode === 'advanced' ? navSections : [
    { title: 'WORKSPACE', items: (navSections[0]?.items ?? []).filter((item) => item.to === '/' || item.to === '/workspace') },
    { title: 'QUICK ACTIONS', items: [
      { to: '/checkout', label: 'Sell', icon: ShoppingCart },
      { to: '/modules/purchases', label: 'Buy', icon: ShoppingCart },
      { to: '/modules/expenses', label: 'Expense', icon: ReceiptText },
      { to: '/inventory', label: 'Stock', icon: Package },
      { to: '/modules/customers', label: 'Money owed', icon: Users },
      { to: '/business-tools', label: 'Business tools', icon: Settings },
      { to: '/settings', label: 'Settings', icon: Settings },
    ] },
  ];

  const refreshWorkspaces = useCallback(async () => {
    const items = await localWorkspaceRepository.list();
    setWorkspaces(items);
    const savedId = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    const chosen = items.find((item) => item.id === savedId) ?? items[0] ?? null;
    if (chosen) {
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, chosen.id);
      setWorkspace(chosen);
    } else setWorkspace(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await localWorkspaceRepository.list();
        if (cancelled) return;
        setWorkspaces(items);
        const savedId = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
        const chosen = items.find((item) => item.id === savedId) ?? items[0] ?? null;
        setWorkspace(chosen);
        if (chosen) localStorage.setItem(ACTIVE_WORKSPACE_KEY, chosen.id);
      } catch {
        toast.error('Could not open local workspace', { description: 'Check browser storage permissions and reload the page.' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!workspace) {
      setBranches([]);
      setBranch(null);
      setBranchesLoading(false);
      setResolvedBranchWorkspaceId(null);
      return () => { cancelled = true; };
    }
    // Never redirect to onboarding while the workspace's branch list is still loading.
    // This race used to send a just-created workspace back to setup before its branch arrived.
    setBranchesLoading(true);
    setResolvedBranchWorkspaceId(null);
    setBranches([]);
    setBranch(null);
    void (async () => {
      try {
        const items = await localWorkspaceRepository.listBranches(workspace.id);
        if (cancelled) return;
        setBranches(items);
        const savedId = localStorage.getItem(ACTIVE_BRANCH_KEY);
        const chosen = items.find((item) => item.id === savedId) ?? items[0] ?? null;
        setBranch(chosen);
        if (chosen) localStorage.setItem(ACTIVE_BRANCH_KEY, chosen.id);
        else localStorage.removeItem(ACTIVE_BRANCH_KEY);
      } catch {
        if (!cancelled) toast.error('Could not load branches for this workspace.');
      } finally {
        if (!cancelled) {
          setBranchesLoading(false);
          setResolvedBranchWorkspaceId(workspace.id);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [workspace]);

  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  const setActiveWorkspace = useCallback(async (workspaceId: string) => {
    const latestWorkspaces = await localWorkspaceRepository.list();
    setWorkspaces(latestWorkspaces);
    const found = latestWorkspaces.find((item) => item.id === workspaceId);
    if (!found) { toast.error('Business workspace not found.'); return; }
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, found.id);
    localStorage.removeItem(ACTIVE_BRANCH_KEY);
    setBranches([]);
    setBranch(null);
    setWorkspace(found);
    toast.success(`Switched to ${found.businessName}`);
  }, []);

  const setActiveBranch = useCallback((branchId: string) => {
    const found = branches.find((item) => item.id === branchId);
    if (!found) { toast.error('Branch not found.'); return; }
    localStorage.setItem(ACTIVE_BRANCH_KEY, found.id);
    setBranch(found);
    toast.success(`Branch changed to ${found.name}`);
  }, [branches]);

  const contextValue = useMemo(() => {
    if (!workspace || !branch) return null;
    return { workspaces, workspace, branches, branch, setActiveWorkspace, setActiveBranch, refreshWorkspaces };
  }, [workspaces, workspace, branches, branch, setActiveWorkspace, setActiveBranch, refreshWorkspaces]);

  if (loading || (workspace && (branchesLoading || resolvedBranchWorkspaceId !== workspace.id))) return <div className="boot-screen"><div className="brand-mark">L</div><span>Opening your workspace…</span></div>;
  if (!workspace) return <Navigate to="/onboarding" replace />;
  if (!branch) return <Navigate to="/onboarding" replace />;
  if (!contextValue) return null;

  return (
    <WorkspaceContext.Provider value={contextValue}>
      <div className="app-frame">
        <div className={`mobile-scrim ${mobileNavOpen ? 'is-visible' : ''}`} onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
        <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`} aria-label="Main navigation">
          <div className="brand-lockup">
            <div className="lexa-brand-logo-frame"><img className="lexa-brand-logo" src="/lexa-logo.png" alt="LEXA — Sales, Inventory, Business Management" /></div>
            <button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}><X size={18} /></button>
          </div>
          <div className="sidebar-workspace">
            <div className="workspace-avatar"><Store size={18} /></div>
            <div className="workspace-mini-copy"><strong>{workspace.businessName}</strong><span>{branch.name}</span></div>
            <ChevronDown size={15} className="muted-icon" />
          </div>
          <nav className="nav-groups">
            {visibleNavSections.map((section) => (
              <div className="nav-section" key={section.title} data-module-accent={moduleAccentForGroup(section.title)}>
                <div className="nav-section-title">{section.title}</div>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return <NavLink key={item.to} to={item.to} end={'end' in item ? item.end : false} data-module-accent={moduleAccentForPath(item.to)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
                    <Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>
                  </NavLink>;
                })}
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="local-note"><span className="status-dot" /><div><strong>Workspace status</strong><span>Business workspace active</span></div></div>
            <NavLink to="/settings" data-module-accent={moduleAccentForPath('/settings')} className={({ isActive }) => `nav-link settings-link ${isActive ? 'nav-link-active' : ''}`}><Settings size={18} /><span>Settings</span></NavLink>
            <button className="help-link" onClick={() => toast.info('LEXA workspace help', { description: 'Use the module directory to access sales, inventory, finance, operations and team tools. See Settings for storage and connection details.' })}><CircleHelp size={16} /><span>Help & guidance</span></button>
          </div>
        </aside>

        <main className="main-panel" data-module-accent={moduleAccentForPath(location.pathname)}>
          <header className="topbar">
            <div className="topbar-title"><button className="icon-button mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button><div><div className="eyebrow">BUSINESS WORKSPACE</div><h1>{routeTitle(location.pathname)}</h1></div></div>
            <div className="topbar-actions">
              <label className="select-wrap workspace-select"><Building2 size={15} /><span className="sr-only">Active business</span><select aria-label="Active business" value={workspace.id} onChange={(event) => void setActiveWorkspace(event.target.value)}>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.businessName}</option>)}</select><ChevronDown size={14} /></label>
              <label className="select-wrap branch-select"><Store size={15} /><span className="sr-only">Active branch</span><select aria-label="Active branch" value={branch.id} onChange={(event) => setActiveBranch(event.target.value)}>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={14} /></label>
              <div className="topbar-divider" />
              <button className="icon-button theme-toggle" type="button" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
              <button className="icon-button notification-button" aria-label="Notifications" onClick={() => toast.info('No connected alerts yet', { description: 'Live notifications will be enabled when the existing backend integration is connected.' })}><Bell size={18} /></button>
              <div className="user-avatar" aria-label="Workspace operator">L</div>
            </div>
          </header>
          <div className="page-content"><Outlet /></div>
          <footer className="app-footer"><span>LEXA Workspace</span><span>Sales · Inventory · Business Management</span></footer>
        </main>
      </div>
    </WorkspaceContext.Provider>
  );
}
