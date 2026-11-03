import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  Activity, ArrowDownUp, Banknote, BookOpen, Building2, BarChart3, ChevronDown, Target, Boxes,
  CircleHelp, ClipboardList, CreditCard, FileText, LayoutDashboard, Menu,
  Package, PackageCheck, ReceiptText, Settings, ShoppingCart, Store, Tag, Truck, Users, Wallet, X, Moon, Sun, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { workspaces as workspaceRepository } from '../../data/repositories';
import { isApiProvider } from '../../data/remote/runtimeConfig';
import { WorkspaceContext } from '../WorkspaceContext';
import type { Branch, Workspace } from '../../domain/shared/types';
import { moduleAccentForGroup, moduleAccentForPath } from '../../domain/shared/moduleAccents';
import GlobalSearch from '../../components/GlobalSearch';
import { businessErrorMessage } from '../../data/remote/businessMessages';
import { resolveBusinessSelection } from '../resolveBusinessSelection';
import { Link } from 'react-router';

const ACTIVE_WORKSPACE_KEY = 'lexa.ui.activeWorkspaceId';
const ACTIVE_BRANCH_KEY = 'lexa.ui.activeBranchId';

function readPreference(key: string): string | null { try { return window.localStorage.getItem(key); } catch { return null; } }
function writePreference(key: string, value: string): void { try { window.localStorage.setItem(key, value); } catch { /* Server-backed data must not depend on preferences being writable. */ } }
function removePreference(key: string): void { try { window.localStorage.removeItem(key); } catch { /* Preferences are non-critical. */ } }
function errorMessage(error: unknown): string { return businessErrorMessage(error); }
function errorStatus(error: unknown): number | null { return error && typeof error === 'object' && 'status' in error && typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : null; }

const navSections = [
  { title: 'WORKSPACE', items: [
    { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/workspace', label: 'Business & branches', icon: Building2 },
  ] },
  { title: 'BUSINESS REPORTS & ADVICE', items: [
    { to: '/reports', label: 'Business reports', icon: BarChart3 },
    { to: '/intelligence', label: 'LEXA Assistant', icon: Sparkles },
  ] },
  { title: 'CUSTOMERS & GROWTH', items: [
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
  { title: 'PURCHASING', items: [
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
  { title: 'TEAM & PAYROLL', items: [
    { to: '/modules/employees', label: 'Employees & HR', icon: Users },
    { to: '/modules/attendance', label: 'Attendance & shifts', icon: Activity },
    { to: '/modules/payroll', label: 'Payroll', icon: Wallet },
  ] },
  { title: 'ADMINISTRATION', items: [

    { to: '/modules/team', label: 'Team & access', icon: Users },
    { to: '/business-tools', label: 'Business tools', icon: Settings },
  ] },
];

function routeTitle(pathname: string): string {
  if (pathname === '/') return 'Overview';
  if (pathname.startsWith('/sales/')) return 'Sale details';
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
  const navigate = useNavigate();
  const requestedBusinessId = typeof (location.state as { openBusinessId?: unknown } | null)?.openBusinessId === 'string'
    ? (location.state as { openBusinessId: string }).openBusinessId : null;
  const requestedBranchId = typeof (location.state as { openBranchId?: unknown } | null)?.openBranchId === 'string'
    ? (location.state as { openBranchId: string }).openBranchId : null;
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorStatus, setLoadErrorStatus] = useState<number | null>(null);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [resolvedBranchWorkspaceId, setResolvedBranchWorkspaceId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [uiMode, setUiMode] = useState<'simple' | 'advanced'>(() => {
    try { return readPreference('lexa.ui.mode') === 'advanced' ? 'advanced' : 'simple'; }
    catch { return 'simple'; }
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return readPreference('lexa.ui.theme') === 'dark' ? 'dark' : 'light'; }
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
      { to: '/reports', label: 'Business reports', icon: BarChart3 },
      { to: '/intelligence', label: 'LEXA Assistant', icon: Sparkles },
      { to: '/settings', label: 'Settings', icon: Settings },
    ] },
  ];

  const refreshWorkspaces = useCallback(async () => {
    try {
    const items = await workspaceRepository.list();
    const recovered = await resolveBusinessSelection(items, requestedBusinessId ?? readPreference(ACTIVE_WORKSPACE_KEY), workspaceRepository.getById);
    setLoadError(null);
    setLoadErrorStatus(null);
    setWorkspaces(recovered.businesses);
    const chosen = recovered.selected;
    if (chosen) {
      writePreference(ACTIVE_WORKSPACE_KEY, chosen.id);
      setWorkspace(chosen);
    } else setWorkspace(null);
    } catch (error) { setLoadError(errorMessage(error)); setLoadErrorStatus(errorStatus(error)); throw error; }
  }, [requestedBusinessId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await workspaceRepository.list();
        const recovered = await resolveBusinessSelection(items, requestedBusinessId ?? readPreference(ACTIVE_WORKSPACE_KEY), workspaceRepository.getById);
        if (cancelled) return;
        setWorkspaces(recovered.businesses);
        setLoadError(null);
        setLoadErrorStatus(null);
        const chosen = recovered.selected;
        setWorkspace(chosen);
        if (chosen) writePreference(ACTIVE_WORKSPACE_KEY, chosen.id);
      } catch (error) {
        if (!cancelled) { setLoadError(errorMessage(error)); setLoadErrorStatus(errorStatus(error)); }
        if (!isApiProvider) toast.error('Could not open the workspace', { description: errorMessage(error) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [requestedBusinessId]);

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
        const items = await workspaceRepository.listBranches(workspace.id);
        if (cancelled) return;
        setLoadError(null);
        setLoadErrorStatus(null);
        setBranches(items);
        const savedId = requestedBusinessId === workspace.id ? requestedBranchId : readPreference(ACTIVE_BRANCH_KEY);
        const chosen = items.find((item) => item.id === savedId) ?? items[0] ?? null;
        setBranch(chosen);
        if (chosen) writePreference(ACTIVE_BRANCH_KEY, chosen.id);
        else removePreference(ACTIVE_BRANCH_KEY);
      } catch (error) {
        if (!cancelled) { setLoadError(errorMessage(error)); setLoadErrorStatus(errorStatus(error)); }
        if (!cancelled && !isApiProvider) toast.error('Could not load branches for this workspace.', { description: errorMessage(error) });
      } finally {
        if (!cancelled) {
          setBranchesLoading(false);
          setResolvedBranchWorkspaceId(workspace.id);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [workspace, requestedBusinessId, requestedBranchId]);

  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);
  useEffect(() => {
    const handleAuthRequired = () => navigate('/sign-in', { replace: true, state: { returnTo: location.pathname, connectionIssue: 'session' } });
    window.addEventListener('lexa:auth-required', handleAuthRequired);
    return () => window.removeEventListener('lexa:auth-required', handleAuthRequired);
  }, [navigate, location.pathname]);

  const setActiveWorkspace = useCallback(async (workspaceId: string) => {
    try {
      const latestWorkspaces = await workspaceRepository.list();
      setWorkspaces(latestWorkspaces);
      const found = latestWorkspaces.find((item) => item.id === workspaceId);
      if (!found) { toast.error('Business workspace not found.'); return; }
      writePreference(ACTIVE_WORKSPACE_KEY, found.id);
      removePreference(ACTIVE_BRANCH_KEY);
      setBranches([]);
      setBranch(null);
      setLoadError(null);
      setWorkspace(found);
      toast.success(`Switched to ${found.businessName}`);
    } catch (error) { toast.error('Could not switch business workspace', { description: errorMessage(error) }); }
  }, []);

  const setActiveBranch = useCallback((branchId: string) => {
    const found = branches.find((item) => item.id === branchId);
    if (!found) { toast.error('Branch not found.'); return; }
    writePreference(ACTIVE_BRANCH_KEY, found.id);
    setBranch(found);
    toast.success(`Branch changed to ${found.name}`);
  }, [branches]);

  const contextValue = useMemo(() => {
    if (!workspace || !branch) return null;
    return { workspaces, workspace, branches, branch, setActiveWorkspace, setActiveBranch, refreshWorkspaces };
  }, [workspaces, workspace, branches, branch, setActiveWorkspace, setActiveBranch, refreshWorkspaces]);

  if (loadError && loadErrorStatus === 401) return (
    <Navigate to="/sign-in" replace state={{ returnTo: `${location.pathname}${location.search}${location.hash}`, connectionIssue: 'session' }} />
  );
  if (loadError) return <main className="error-screen" role="alert">
    <div className="eyebrow eyebrow-blue">BUSINESS ACCESS</div>
    <h1>We couldn't open your business.</h1>
    <p>{loadError}</p>
    <div className="business-entry-error-actions"><button type="button" className="button button-primary" onClick={() => window.location.reload()}>Try again</button><Link to="/onboarding" className="button button-secondary">Choose a business</Link></div>
  </main>;
  if (loading || (workspace && (branchesLoading || resolvedBranchWorkspaceId !== workspace.id))) return <div className="boot-screen"><div className="brand-mark">L</div><span>Opening your business…</span></div>;
  if (!workspace && (requestedBusinessId || readPreference(ACTIVE_WORKSPACE_KEY))) return <main className="error-screen" role="alert">
    <div className="eyebrow eyebrow-blue">YOUR BUSINESS</div>
    <h1>We couldn't reopen your business.</h1>
    <p>Your details are safely saved. Please try again, or return to your business list. You don't need to create another business.</p>
    <div className="business-entry-error-actions"><button type="button" className="button button-primary" onClick={() => window.location.reload()}>Try again</button><Link to="/onboarding" className="button button-secondary">Choose my business</Link></div>
  </main>;
  if (!workspace) return <Navigate to="/onboarding" replace />;
  if (!branch) return <main className="error-screen" role="alert">
    <div className="eyebrow eyebrow-blue">BUSINESS SETUP</div>
    <h1>Your business is saved.</h1>
    <p>We couldn't open its first branch. Your business is still on your account. Choose your business to continue or try again.</p>
    <div className="business-entry-error-actions"><Link className="button button-primary" to="/onboarding">Choose my business</Link><button className="button button-secondary" type="button" onClick={() => window.location.reload()}>Try again</button></div>
  </main>;
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
            <button className="help-link" onClick={() => toast.info('LEXA workspace help', { description: 'Use the navigation to manage sales, stock, purchasing, finance, reports and your team. Visit Settings to manage business preferences.' })}><CircleHelp size={16} /><span>Help & guidance</span></button>
          </div>
        </aside>

        <main className="main-panel" data-module-accent={moduleAccentForPath(location.pathname)}>
          <header className="topbar">
            <div className="topbar-title"><button className="icon-button mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button><div><div className="eyebrow">BUSINESS WORKSPACE</div><h1>{routeTitle(location.pathname)}</h1></div></div>
            <GlobalSearch />
            <div className="topbar-actions">
              <label className="select-wrap workspace-select"><Building2 size={15} /><span className="sr-only">Active business</span><select aria-label="Active business" value={workspace.id} onChange={(event) => void setActiveWorkspace(event.target.value)}>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.businessName}</option>)}</select><ChevronDown size={14} /></label>
              <label className="select-wrap branch-select"><Store size={15} /><span className="sr-only">Active branch</span><select aria-label="Active branch" value={branch.id} onChange={(event) => setActiveBranch(event.target.value)}>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={14} /></label>
              <div className="topbar-divider" />
              <button className="icon-button theme-toggle" type="button" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
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
