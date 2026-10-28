import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  Activity, ArrowDownUp, Bell, Building2, ChevronDown, CircleHelp, ClipboardList, Command, CreditCard,
  LayoutDashboard, Menu, Package, Settings, ShoppingCart, Store, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { localWorkspaceRepository } from '../../data/local/workspaces';
import { WorkspaceContext } from '../WorkspaceContext';
import type { Branch, Workspace } from '../../domain/shared/types';

const ACTIVE_WORKSPACE_KEY = 'lexa.ui.activeWorkspaceId';
const ACTIVE_BRANCH_KEY = 'lexa.ui.activeBranchId';

const navSections = [
  { title: 'WORKSPACE', items: [
    { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/workspace', label: 'Business & branches', icon: Building2 },
  ] },
  { title: 'OPERATIONS', items: [
    { to: '/checkout', label: 'Checkout', icon: ShoppingCart },
    { to: '/sales', label: 'Sales & receipts', icon: CreditCard },
    { to: '/products', label: 'Products', icon: Package },
    { to: '/inventory', label: 'Inventory', icon: ArrowDownUp },
  ] },
];

const planned = [
  { label: 'Purchasing', icon: ClipboardList },
  { label: 'Reports', icon: Activity },
];

function routeTitle(pathname: string): string {
  if (pathname === '/') return 'Overview';
  if (pathname.startsWith('/sales/')) return 'Sale details';
  const found = navSections.flatMap((section) => section.items).find((item) => item.to !== '/' && pathname.startsWith(item.to));
  if (found) return found.label;
  if (pathname === '/settings') return 'Settings';
  return 'Workspace';
}

export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);
  // Prevent a premature redirect while the selected workspace's branch is loading.
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
    void (async () => {
      if (!workspace) {
        setBranches([]);
        setBranch(null);
        setBranchesLoading(false);
        return;
      }
      setBranchesLoading(true);
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
        if (!cancelled) {
          setBranches([]);
          setBranch(null);
          toast.error('Could not load branches for this workspace.');
        }
      } finally {
        if (!cancelled) setBranchesLoading(false);
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
    setBranchesLoading(true);
    setBranches([]);
    setBranch(null);
    setWorkspace(found);
    try {
      const foundBranches = await localWorkspaceRepository.listBranches(found.id);
      setBranches(foundBranches);
      setBranch(foundBranches[0] ?? null);
      if (foundBranches[0]) localStorage.setItem(ACTIVE_BRANCH_KEY, foundBranches[0].id);
      else localStorage.removeItem(ACTIVE_BRANCH_KEY);
      toast.success(`Switched to ${found.businessName}`);
    } catch {
      toast.error('Could not load branches for this workspace.');
    } finally {
      setBranchesLoading(false);
    }
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

  if (loading || (workspace !== null && (branchesLoading || !branch))) {
    return <div className="boot-screen"><div className="brand-mark">L</div><span>Opening your workspace…</span></div>;
  }
  if (!workspace) return <Navigate to="/onboarding" replace />;
  if (!branch || !contextValue) {
    return <main className="onboarding-shell"><section className="setup-card"><div className="setup-card-icon"><Store size={21} /></div><div className="setup-card-heading"><h2>Workspace needs attention</h2><p>Your business record exists, but no branch could be loaded. Your saved workspace has not been deleted.</p></div><button className="button button-primary button-wide" onClick={() => navigate('/onboarding', { replace: true })}>Return to setup</button></section></main>;
  }

  return (
    <WorkspaceContext.Provider value={contextValue}>
      <div className="app-frame">
        <div className={`mobile-scrim ${mobileNavOpen ? 'is-visible' : ''}`} onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
        <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`} aria-label="Main navigation">
          <div className="brand-lockup">
            <div className="brand-mark">L</div>
            <div><div className="brand-name">LEXA</div><div className="brand-caption">BUSINESS OS</div></div>
            <button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}><X size={18} /></button>
          </div>
          <div className="sidebar-workspace">
            <div className="workspace-avatar"><Store size={18} /></div>
            <div className="workspace-mini-copy"><strong>{workspace.businessName}</strong><span>{branch.name}</span></div>
            <ChevronDown size={15} className="muted-icon" />
          </div>
          <nav className="nav-groups">
            {navSections.map((section) => (
              <div className="nav-section" key={section.title}>
                <div className="nav-section-title">{section.title}</div>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return <NavLink key={item.to} to={item.to} end={'end' in item ? item.end : false} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
                    <Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>
                  </NavLink>;
                })}
              </div>
            ))}
            <div className="nav-section">
              <div className="nav-section-title nav-title-row"><span>COMING NEXT</span><span className="phase-pill">ROADMAP</span></div>
              {planned.map(({ label, icon: Icon }) => <div className="nav-link nav-link-disabled" key={label} title={`${label} is planned for a later phase`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span><span className="small-dot" /></div>)}
            </div>
          </nav>
          <div className="sidebar-bottom">
            <div className="local-note"><span className="status-dot" /><div><strong>Local workspace</strong><span>Saved on this device</span></div></div>
            <NavLink to="/settings" className={({ isActive }) => `nav-link settings-link ${isActive ? 'nav-link-active' : ''}`}><Settings size={18} /><span>Settings</span></NavLink>
            <button className="help-link" onClick={() => toast.info('LEXA local-first preview', { description: 'Your records are saved in this browser profile. Backend services are not connected.' })}><CircleHelp size={16} /><span>Help & limitations</span></button>
          </div>
        </aside>

        <main className="main-panel">
          <header className="topbar">
            <div className="topbar-title"><button className="icon-button mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button><div><div className="eyebrow">BUSINESS WORKSPACE</div><h1>{routeTitle(location.pathname)}</h1></div></div>
            <div className="topbar-actions">
              <label className="select-wrap workspace-select"><Building2 size={15} /><span className="sr-only">Active business</span><select aria-label="Active business" value={workspace.id} onChange={(event) => void setActiveWorkspace(event.target.value)}>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.businessName}</option>)}</select><ChevronDown size={14} /></label>
              <label className="select-wrap branch-select"><Store size={15} /><span className="sr-only">Active branch</span><select aria-label="Active branch" value={branch.id} onChange={(event) => setActiveBranch(event.target.value)}>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={14} /></label>
              <div className="topbar-divider" />
              <button className="icon-button notification-button" aria-label="Notifications" onClick={() => toast.info('No new notifications', { description: 'Connected alerts will be added in a later phase.' })}><Bell size={18} /><span className="notification-dot" /></button>
              <div className="user-avatar" aria-label="Local operator">L</div>
            </div>
          </header>
          <div className="local-status-banner"><span className="status-dot" /><span><strong>Local-first mode</strong> — records stay in this browser. Team sharing and secure sign-in are not connected.</span><button onClick={() => navigate('/settings')}>Details <Command size={12} /></button></div>
          <div className="page-content"><Outlet /></div>
          <footer className="app-footer"><span>LEXA Workspace · Frontend milestone 0.1</span><span>Local data only <span className="footer-dot">•</span> No external services connected</span></footer>
        </main>
      </div>
    </WorkspaceContext.Provider>
  );
}
