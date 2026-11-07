import { isDemoDeployment } from '../../data/remote/apiDemo';
import DemoBanner from '../../modules/demo/DemoBanner';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Building2, ChevronDown, CircleHelp, Menu, Settings, Store, X, Moon, Sun, Pin, Search } from '../../components/LexaIcon';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { apiTeamAccess } from '../../data/remote/apiTeamAccess';
import { workspaces as workspaceRepository } from '../../data/repositories';
import { isApiProvider } from '../../data/remote/runtimeConfig';
import { WorkspaceContext } from '../WorkspaceContext';
import type { Branch, Workspace } from '../../domain/shared/types';
import { moduleAccentForGroup, moduleAccentForPath } from '../../domain/shared/moduleAccents';
import GlobalSearch from '../../components/GlobalSearch';
import { BusinessAssortmentSelector } from '../../components/business/BusinessAssortmentSelector';
import LexaLogo from '../../components/LexaLogo';
import { navigationIcons } from '../../components/icons/EnterpriseNavIcons';
import { isEmployeeNavigationAllowed } from '../../domain/shared/staffNavigation';
import { apiAuth } from '../../data/remote/apiAuth';
import { apiPlatformBilling } from '../../data/remote/apiPlatformAdministration';
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
    { to: '/', label: 'Overview', icon: navigationIcons.LayoutDashboard, end: true },
    { to: '/workspace', label: 'My Business', icon: navigationIcons.Building2 },
    { to: '/team', label: 'Team & permissions', icon: navigationIcons.Users },
    { to: '/my-employment', label: 'My employment', icon: navigationIcons.Users },
    { to: '/business-setup', label: 'Business profile setup', icon: navigationIcons.Sparkles },
  ] },
  { title: 'BUSINESS REPORTS & ADVICE', items: [
    { to: '/reports', label: 'Business reports', icon: navigationIcons.BarChart3 },
    { to: '/intelligence', label: 'LEXA Assistant', icon: navigationIcons.Sparkles },
  ] },
  { title: 'CUSTOMERS & GROWTH', items: [
    { to: '/modules/customers', label: 'Customers', icon: navigationIcons.Users },
    { to: '/modules/leads', label: 'Leads & prospects', icon: navigationIcons.Users },
    { to: '/modules/opportunities', label: 'Opportunities', icon: navigationIcons.Target },
    { to: '/modules/contacts', label: 'Contacts & addresses', icon: navigationIcons.Users },
    { to: '/modules/campaigns', label: 'Campaigns', icon: navigationIcons.Activity },
    { to: '/modules/sales-teams', label: 'Sales team & territories', icon: navigationIcons.Users },
  ] },
  { title: 'SELLING', items: [
    { to: '/checkout', label: 'Checkout / POS', icon: navigationIcons.ShoppingCart },
    { to: '/sales', label: 'Sales & receipts', icon: navigationIcons.CreditCard },
    { to: '/modules/sales-orders', label: 'Sales orders', icon: navigationIcons.ShoppingCart },
    { to: '/modules/sales-returns', label: 'Sales returns', icon: navigationIcons.ReceiptText },
    { to: '/modules/sales-invoices', label: 'Sales invoices', icon: navigationIcons.ReceiptText },
    { to: '/modules/quotations', label: 'Quotations', icon: navigationIcons.FileText },
    { to: '/modules/price-lists', label: 'Price lists & pricing', icon: navigationIcons.Tag },
      ] },
  { title: 'INVENTORY', items: [
    { to: '/products', label: 'Products', icon: navigationIcons.Package },
    { to: '/inventory', label: 'Stock & movements', icon: navigationIcons.ArrowDownUp },
    { to: '/modules/receiving', label: 'Goods receiving', icon: navigationIcons.PackageCheck },
    { to: '/modules/stock-counts', label: 'Stock counts', icon: navigationIcons.ClipboardList },
    { to: '/modules/batches', label: 'Batch & lot tracking', icon: navigationIcons.Package },
    { to: '/modules/replenishment', label: 'Replenishment', icon: navigationIcons.PackageCheck },
    { to: '/modules/stock-transfers', label: 'Stock transfers', icon: navigationIcons.Truck },
    { to: '/modules/warehouses', label: 'Warehouses & locations', icon: navigationIcons.Building2 },
    { to: '/modules/picklists', label: 'Picklists & picking', icon: navigationIcons.ClipboardList },
    { to: '/modules/item-bundles', label: 'Item bundles', icon: navigationIcons.Boxes },
  ] },
  { title: 'LOGISTICS', items: [
    { to: '/modules/deliveries', label: 'Deliveries & fulfilment', icon: navigationIcons.Truck },
    { to: '/modules/packages', label: 'Packages', icon: navigationIcons.Package },
  ] },
  { title: 'PURCHASING', items: [
    { to: '/modules/purchase-requests', label: 'Purchase requests', icon: navigationIcons.ClipboardList },
    { to: '/modules/rfqs', label: 'Requests for quotation', icon: navigationIcons.FileText },
    { to: '/modules/supplier-quotes', label: 'Supplier quotations', icon: navigationIcons.FileText },
    { to: '/modules/suppliers', label: 'Suppliers', icon: navigationIcons.Truck },
    { to: '/modules/purchases', label: 'Purchase orders', icon: navigationIcons.ClipboardList },
    { to: '/modules/purchase-returns', label: 'Purchase returns', icon: navigationIcons.ReceiptText },
    { to: '/modules/purchase-invoices', label: 'Supplier invoices', icon: navigationIcons.ReceiptText },
  ] },
  { title: 'FINANCE', items: [
    { to: '/modules/finance-overview', label: 'Financial overview', icon: navigationIcons.Landmark },
    { to: '/modules/expenses', label: 'Expenses', icon: navigationIcons.ReceiptText },
    { to: '/modules/cash-sessions', label: 'Cash sessions', icon: navigationIcons.Wallet },
    { to: '/modules/money-accounts', label: 'Cash & money accounts', icon: navigationIcons.Wallet },
    { to: '/modules/payments', label: 'Receipts & payments', icon: navigationIcons.CreditCard },
    { to: '/modules/accounting', label: 'Accounting journals', icon: navigationIcons.BookOpen },
    { to: '/modules/chart-of-accounts', label: 'Chart of accounts', icon: navigationIcons.BookOpen },
    { to: '/modules/tax-codes', label: 'Tax codes & rules', icon: navigationIcons.ReceiptText },
    { to: '/modules/bank-reconciliation', label: 'Bank reconciliation', icon: navigationIcons.Banknote },
    { to: '/modules/assets', label: 'Fixed assets', icon: navigationIcons.Building2 },
    { to: '/modules/cost-centers', label: 'Cost centres', icon: navigationIcons.BookOpen },
    { to: '/modules/budgets', label: 'Budgets & forecasts', icon: navigationIcons.Wallet },
    { to: '/modules/recurring-invoices', label: 'Recurring billing', icon: navigationIcons.ReceiptText },
    { to: '/modules/tax-documents', label: 'Tax documents / EFRIS', icon: navigationIcons.BookOpen },
  ] },
  { title: 'TEAM & PAYROLL', items: [
    { to: '/modules/employees', label: 'Employees & HR', icon: navigationIcons.Users },
    { to: '/modules/attendance', label: 'Attendance & shifts', icon: navigationIcons.Activity },
    { to: '/modules/leave', label: 'Leave & absences', icon: navigationIcons.Users },
    { to: '/modules/timesheets', label: 'Timesheets', icon: navigationIcons.Activity },
    { to: '/modules/payroll', label: 'Payroll', icon: navigationIcons.Wallet },
  ] },
  { title: 'PRODUCTION & QUALITY', items: [
    { to: '/modules/work-orders', label: 'Work orders', icon: navigationIcons.ClipboardList },
    { to: '/modules/boms', label: 'Bills of materials', icon: navigationIcons.Package },
    { to: '/modules/job-cards', label: 'Job cards', icon: navigationIcons.ClipboardList },
    { to: '/modules/quality', label: 'Quality checks', icon: navigationIcons.PackageCheck },
  ] },
  { title: 'PROJECTS & SERVICE', items: [
    { to: '/modules/projects', label: 'Projects', icon: navigationIcons.ClipboardList },
    { to: '/modules/tasks', label: 'Tasks', icon: navigationIcons.ClipboardList },
    { to: '/modules/support', label: 'Customer support', icon: navigationIcons.Users },
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
  if (pathname === '/settings') return 'Account & business settings';
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
  const [expandedSections, setExpandedSections] = useState<string[]>(['WORKSPACE']);
  const [moduleSearch, setModuleSearch] = useState('');
  const [pinnedPaths, setPinnedPaths] = useState<string[]>([]);
  useEffect(() => {
    const active = navSections.find(section => section.items.some(item => location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to + '/'))));
    if (active) setExpandedSections(current => current.includes(active.title) ? current : [...current, active.title]);
    setMobileNavOpen(false);
  }, [location.pathname]);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return readPreference('lexa.ui.theme') === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem('lexa.ui.theme', theme); } catch { /* Theme still works for this session. */ }
  }, [theme]);
  const subscriptionQuery = useQuery({
    queryKey: ['lexa-subscription-entitlement', workspace?.id],
    queryFn: () => apiPlatformBilling.status(workspace!.id),
    enabled: Boolean(workspace && isApiProvider),
    staleTime: 15_000, retry: 1,
  });
  const accessQuery = useQuery({
    queryKey: ['business-access', workspace?.id],
    queryFn: () => apiTeamAccess.access(workspace!.id),
    enabled: Boolean(workspace && isApiProvider),
    staleTime: 20_000,
  });
  const isOwner = !isApiProvider || accessQuery.data?.isOwner === true;
  const allowed = new Set(!isApiProvider ? [
    'workspace.read','reports.read','crm.read','sales.read','inventory.read','procurement.read',
    'finance.read','people.read','manufacturing.read','fulfilment.read','intelligence.read',
    'saas.read','support.read','projects.read','module.read'
  ] : accessQuery.data?.permissions ?? []);
  const sectionPermission: Record<string,string> = {
    'BUSINESS REPORTS & ADVICE':'reports.read', 'CUSTOMERS & GROWTH':'crm.read',
    'SELLING':'sales.read','INVENTORY':'inventory.read','LOGISTICS':'fulfilment.read',
    'PURCHASING':'procurement.read','FINANCE':'finance.read','TEAM & PAYROLL':'people.read',
    'PRODUCTION & QUALITY':'manufacturing.read', 'PROJECTS & SERVICE':'projects.read',
  };
  const visibleNavSections = navSections.map(section => ({...section,items:section.items.filter(item => {
    if (isApiProvider && !isOwner && !isEmployeeNavigationAllowed(accessQuery.data?.role ?? '', item.to)) return false;
    if(item.to==='/team'||item.to==='/business-setup') return isOwner;
    if(item.to==='/my-employment') return !isOwner;
    if(item.to==='/workspace'||item.to==='/') return true;
    if(item.to==='/intelligence')return isOwner;
    if(item.to==='/reports')return allowed.has('reports.read');
    if(item.to==='/modules/employees'||item.to==='/modules/attendance')return allowed.has('people.read');
    if(item.to==='/modules/payroll')return allowed.has('payroll.read');
    if(item.to==='/modules/finance-overview'||item.to==='/modules/expenses'||item.to==='/modules/money-accounts'||item.to==='/modules/payments'||item.to==='/modules/accounting'||item.to==='/modules/chart-of-accounts'||item.to==='/modules/tax-codes'||item.to==='/modules/bank-reconciliation'||item.to==='/modules/assets'||item.to==='/modules/cost-centers'||item.to==='/modules/budgets'||item.to==='/modules/recurring-invoices'||item.to==='/modules/tax-documents')return allowed.has('finance.read');
    if(item.to==='/modules/recurring-invoices')return allowed.has('sales.read');
    if(item.to==='/modules/support')return allowed.has('support.read');
    if(item.to==='/modules/packages')return allowed.has('fulfilment.read');
    if(item.to==='/modules/quality')return allowed.has('manufacturing.read');
    if(item.to==='/modules/leave'||item.to==='/modules/timesheets')return allowed.has('people.read');
    if(item.to==='/modules/cash-sessions')return allowed.has('cash.manage') || allowed.has('finance.read');
    return allowed.has(sectionPermission[section.title]??'workspace.read');
  })})).filter(section=>section.items.length>0);
  // Navigation preferences never contain record data and reset when switching businesses.
  useEffect(() => { setPinnedPaths([]); setModuleSearch(''); }, [workspace?.id]);
  // Every authorized module remains accessible within its existing navigation group.
  // Search narrows the visible groups but never replaces a real module with a placeholder.
  const filteredNav = moduleSearch.trim()
    ? visibleNavSections.map(section => ({...section,items:section.items.filter(item =>
        `${section.title} ${item.label}`.toLowerCase().includes(moduleSearch.trim().toLowerCase()))}))
        .filter(section => section.items.length > 0)
    : visibleNavSections;
  const favorites = visibleNavSections.flatMap(section => section.items).filter(item => pinnedPaths.includes(item.to));
  const togglePin = (path: string) => setPinnedPaths(current => current.includes(path) ? current.filter(value => value !== path) : [...current, path]);
  const toggleNavSection = (title:string) => setExpandedSections(current=>current.includes(title)?current.filter(item=>item!==title):[...current,title]);
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
  useEffect(() => { if (isApiProvider) { void apiAuth.getSession().then(s => { if(s.requiresPasswordChange) navigate('/change-password',{replace:true}); }).catch(() => {}); } }, [navigate]);
  useEffect(() => {
    const handleAuthRequired = () => navigate(isDemoDeployment?'/demo':'/sign-in', { replace: true, state: { returnTo: location.pathname, connectionIssue: 'session' } });
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
    <Navigate to={isDemoDeployment ? "/demo" : "/sign-in"} replace state={{ returnTo: `${location.pathname}${location.search}${location.hash}`, connectionIssue: 'session' }} />
  );
  if (loadError) return <main className="error-screen" role="alert">
    <div className="eyebrow eyebrow-blue">BUSINESS ACCESS</div>
    <h1>We couldn't open your business.</h1>
    <p>{loadError}</p>
    <div className="business-entry-error-actions"><button type="button" className="button button-primary" onClick={() => window.location.reload()}>Try again</button><Link to="/onboarding" className="button button-secondary">Choose a business</Link></div>
  </main>;
  if (loading || (workspace && (branchesLoading || resolvedBranchWorkspaceId !== workspace.id))) return <div className="boot-screen"><span className="lexa-boot-brand"><LexaLogo compact variant="master" /></span><span>Opening your business…</span></div>;
  if (!workspace && (requestedBusinessId || readPreference(ACTIVE_WORKSPACE_KEY))) return <main className="error-screen" role="alert">
    <div className="eyebrow eyebrow-blue">YOUR BUSINESS</div>
    <h1>We couldn't reopen your business.</h1>
    <p>Your details are safely saved. Please try again, or return to your business list. You don't need to create another business.</p>
    <div className="business-entry-error-actions"><button type="button" className="button button-primary" onClick={() => window.location.reload()}>Try again</button><Link to="/onboarding" className="button button-secondary">Choose my business</Link></div>
  </main>;
  if (!workspace) return <Navigate to="/onboarding" replace />;
  if (isApiProvider && subscriptionQuery.isLoading) return <div className="boot-screen" role="status">Checking your LEXA subscription…</div>;
  if (isApiProvider && subscriptionQuery.isError) return <main className="error-screen" role="alert"><h1>Could not verify your subscription</h1><p>Your business data has not been changed. Please retry or contact LEXA support.</p><button className="button button-primary" onClick={()=>window.location.reload()}>Try again</button></main>;
  if (isApiProvider && subscriptionQuery.data && !subscriptionQuery.data.operational)
    return <Navigate to={`/subscription?workspaceId=${encodeURIComponent(workspace.id)}`} replace />;
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
            <div className="lexa-brand-logo-frame"><LexaLogo accent={moduleAccentForPath(location.pathname)} onDark /></div>
            <button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}><X size={18} /></button>
          </div>
          <div className="sidebar-workspace">
            <div className="workspace-avatar"><Store size={18} /></div>
            <div className="workspace-mini-copy"><strong>{workspace.businessName}</strong><span>{isOwner ? 'CEO / Business owner' : accessQuery.data?.role?.replaceAll('_', ' ') || 'Team member'}</span></div>
          </div>
          <nav className="nav-groups">
            <label className="lexa-sidebar-filter"><Search size={15} aria-hidden="true"/><span className="sr-only">Find a module</span><input value={moduleSearch} onChange={event => setModuleSearch(event.target.value)} placeholder="Find a module" aria-label="Find a module" autoComplete="off"/></label>
            {favorites.length > 0 && !moduleSearch && <div className="lexa-nav-pinned" aria-label="Pinned modules"><div className="lexa-nav-pinned-heading"><Pin size={14}/> Pinned</div>{favorites.map(item => { const Icon = item.icon;return <NavLink key={item.to} to={item.to} data-module-accent={moduleAccentForPath(item.to)} onClick={() => setMobileNavOpen(false)} className={({isActive})=>`nav-link ${isActive?'nav-link-active':''}`}><Icon size={17}/><span>{item.label}</span></NavLink>; })}</div>}
            <p className="lexa-nav-hint">Workspace navigation</p>
            {filteredNav.map((section) => (
              <div className="nav-section" key={section.title} data-module-accent={moduleAccentForGroup(section.title)}>
                <button type="button" className="nav-section-title lexa-nav-group-toggle" aria-expanded={Boolean(moduleSearch) || expandedSections.includes(section.title)} onClick={() => toggleNavSection(section.title)}><span>{section.title}</span><ChevronDown size={14} className={moduleSearch || expandedSections.includes(section.title) ? 'lexa-nav-arrow-open' : ''} /></button>
                {(moduleSearch || expandedSections.includes(section.title)) && section.items.map((item) => {
                  const Icon = item.icon;
                  const financeSubsection = section.title === 'FINANCE' ? ({'/modules/finance-overview':'OVERVIEW','/modules/expenses':'TRANSACTIONS','/modules/accounting':'ACCOUNTING & LEDGER','/modules/bank-reconciliation':'BANKING & PLANNING','/modules/tax-codes':'TAX & COMPLIANCE'} as Record<string,string>)[item.to] : undefined;
                  return <div className="lexa-nav-module-row" key={item.to}>{financeSubsection && <div className="lexa-nav-subheading">{financeSubsection}</div>}<div className="lexa-nav-module-link"><NavLink to={item.to} end={'end' in item ? item.end : false} data-module-accent={moduleAccentForPath(item.to)} onClick={() => setMobileNavOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
                    <Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>
                  </NavLink><button type="button" className={`lexa-nav-pin ${pinnedPaths.includes(item.to)?'is-pinned':''}`} onClick={() => togglePin(item.to)} aria-label={`${pinnedPaths.includes(item.to)?'Unpin':'Pin'} ${item.label}`} title={`${pinnedPaths.includes(item.to)?'Unpin':'Pin'} ${item.label}`}><Pin size={14} fill={pinnedPaths.includes(item.to)?'currentColor':'none'}/></button></div></div>;
                })}
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="local-note"><span className="status-dot" /><div><strong>Workspace storage</strong><span>{isApiProvider ? 'Secure business account' : 'Records stored on this device'}</span></div></div>
            <button className="help-link" onClick={() => toast.info('LEXA workspace guidance', { description: 'Select a module group to access business records. Account protection, privacy controls and operational tools are available in Account & business settings.' })}><CircleHelp size={16} /><span>Help & guidance</span></button>
            <NavLink to="/settings" data-module-accent={moduleAccentForPath('/settings')} className={({ isActive }) => `nav-link settings-link ${isActive ? 'nav-link-active' : ''}`}><Settings size={18} /><span>Account & business settings</span></NavLink>
          </div>
        </aside>

        <main className="main-panel" data-module-accent={moduleAccentForPath(location.pathname)}>
          {isDemoDeployment && <DemoBanner />}
          <header className="topbar">
            <div className="topbar-title"><LexaLogo compact accent={moduleAccentForPath(location.pathname)} className="lexa-topbar-mark" /><button className="icon-button mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button><div><div className="eyebrow">BUSINESS WORKSPACE</div><h1>{routeTitle(location.pathname)}</h1></div></div>
            <GlobalSearch />
            <div className="topbar-actions">
              {isOwner && <Link className="lexa-owner-assistant-shortcut" to={`/intelligence?scope=${location.pathname.includes('/finance')||location.pathname.includes('/accounting')||location.pathname.includes('/budgets')?'finance':location.pathname.includes('/inventory')||location.pathname.includes('/products')||location.pathname.includes('/stock')?'inventory':location.pathname.includes('/sales')||location.pathname.includes('/checkout')?'sales':'overview'}`} title="Open LEXA Intelligence for this area" aria-label="Open LEXA Intelligence for this area">LEXA</Link>}
              <span className="lexa-current-business"><Building2 size={15}/>{workspace.businessName}</span>
              <div className="topbar-divider" />
              <button className="icon-button theme-toggle" type="button" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
              <div className="user-avatar" aria-label={isOwner ? "CEO account" : "Team member account"}>{isOwner ? "CEO" : "TM"}</div>
            </div>
          </header>
          {!(['/products','/inventory','/checkout','/modules/finance-overview'].includes(location.pathname)||
            /^\/modules\/(purchases|purchase-requests|purchase-returns|purchase-invoices|rfqs|supplier-quotes|suppliers)$/.test(location.pathname))&&
            <div className="lexa-workspace-activity-selector"><BusinessAssortmentSelector workspaceId={workspace.id} context="workspace"/>
              {isOwner&&<Link to="/business-setup" className="lexa-activity-settings-link">Manage business activities</Link>}</div>}
          <div className="page-content"><Outlet /></div>
          <footer className="app-footer"><span>© {new Date().getFullYear()} LEXA</span><span>LEXA is a subsidiary of AMAAL GROUP.</span></footer>
        </main>
      </div>
    </WorkspaceContext.Provider>
  );
}
