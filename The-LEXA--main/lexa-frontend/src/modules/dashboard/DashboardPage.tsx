import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Box, Building2, CircleDollarSign,
  Clock3, Package, ShoppingBag, ShoppingCart, Wallet,
} from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { reports } from '../../data/repositories';
import { formatMinorAmount } from '../../domain/money/money';
import { PHASE_TWO_LINKS } from '../operations/moduleCatalog';
import { moduleAccentForPath } from '../../domain/shared/moduleAccents';

const dashboardModulePaths = [
  '/modules/customers', '/modules/quotations', '/modules/sales-orders', '/modules/sales-invoices',
  '/modules/suppliers', '/modules/purchases', '/modules/purchase-invoices', '/modules/receiving',
  '/modules/expenses', '/modules/reports',
];
const dashboardModules = PHASE_TWO_LINKS.filter((item) => dashboardModulePaths.includes(item.to));

export default function DashboardPage() {
  const { workspace, branch } = useWorkspace();
  const navigate = useNavigate();
  const snapshotQuery = useQuery({
    queryKey: ['dashboard', workspace.id, branch.id],
    queryFn: () => reports.getDashboardSnapshot({ workspaceId: workspace.id, branchId: branch.id }),
  });
  const snapshot = snapshotQuery.data;
  const localDate = (() => {
    try { return new Intl.DateTimeFormat('en-UG', { dateStyle: 'full', timeZone: workspace.timezone }).format(new Date()); }
    catch { return new Date().toLocaleDateString(); }
  })();

  return (
    <div className="page-stack dashboard-page" data-module-accent={moduleAccentForPath("/")}>
      <section className="welcome-banner">
        <div className="welcome-copy">
          <div className="welcome-kicker"><span className="welcome-kicker-dot" /> BUSINESS OVERVIEW <span className="welcome-separator">·</span> {localDate.toUpperCase()}</div>
          <h2>One clear view of <span>your business.</span></h2>
          <p>Welcome to {workspace.businessName} / {branch.name}. Track the existing sales and inventory workflows, then explore the expanded Phase 2 frontend modules.</p>
          <div className="welcome-actions">
            <button className="button button-white" onClick={() => navigate('/checkout')}><ShoppingCart size={16} /> New sale</button>
            <button className="button button-outline-light" onClick={() => navigate('/modules')}><Building2 size={16} /> Browse all modules</button>
          </div>
        </div>
        <div className="welcome-illustration" aria-hidden="true"><div className="orb orb-one" /><div className="orb orb-two" /><div className="illustration-card"><div className="illustration-card-top"><span /><span /><span /></div><div className="illustration-card-chart"><span /><span /><span /><span /><span /><span /><span /></div><div className="illustration-card-footer"><div /><div /><div /></div></div><div className="illustration-float"><CircleDollarSign size={19} /><span>Business workspace</span><strong>Module by module</strong></div></div><div className="welcome-decoration" />
      </section>

      {snapshotQuery.isError && <div className="inline-error"><strong>Could not load the business overview.</strong><span>{snapshotQuery.error instanceof Error ? snapshotQuery.error.message : 'Check local storage and reload.'}</span></div>}
      <div className="dashboard-section-title"><div><h3>Current business snapshot</h3><p>Figures derived from existing saved sales and inventory records for this branch.</p></div><span className="data-period"><Clock3 size={14} /> Since tracking started</span></div>
      <div className="metric-strip four-metrics">
        <button className="metric-card" onClick={() => navigate('/sales')}><div className="metric-card-top"><span>Net sales value</span><span className="metric-icon blue-metric" data-module-accent={moduleAccentForPath("/sales")} data-module-accent={moduleAccentForPath("/sales")}><CircleDollarSign size={18} /></span></div><strong>{snapshot ? formatMinorAmount(snapshot.netSalesMinor, workspace.currency) : '—'}</strong><small><span className="metric-inline-dot blue-dot" /> After recorded returns</small><span className="metric-card-link">View sales <ArrowUpRight size={13} /></span></button>
        <button className="metric-card" onClick={() => navigate('/sales')}><div className="metric-card-top"><span>Recorded receipts</span><span className="metric-icon green-metric" data-module-accent={moduleAccentForPath("/modules/payments")} data-module-accent={moduleAccentForPath("/modules/payments")}><Wallet size={18} /></span></div><strong>{snapshot ? formatMinorAmount(snapshot.recordedReceiptsMinor, workspace.currency) : '—'}</strong><small><span className="metric-inline-dot green-dot" /> Amounts marked as received</small><span className="metric-card-link">Payment activity <ArrowUpRight size={13} /></span></button>
        <button className="metric-card" onClick={() => navigate('/sales')}><div className="metric-card-top"><span>Outstanding estimate</span><span className="metric-icon amber-metric" data-module-accent={moduleAccentForPath("/modules/sales-invoices")} data-module-accent={moduleAccentForPath("/modules/sales-invoices")}><Clock3 size={18} /></span></div><strong>{snapshot ? formatMinorAmount(snapshot.outstandingMinor, workspace.currency) : '—'}</strong><small><span className="metric-inline-dot amber-dot" /> Based on local sale/payment records</small><span className="metric-card-link">Review sales <ArrowUpRight size={13} /></span></button>
        <button className="metric-card" onClick={() => navigate('/inventory')}><div className="metric-card-top"><span>Units on hand</span><span className="metric-icon purple-metric" data-module-accent={moduleAccentForPath("/inventory")} data-module-accent={moduleAccentForPath("/inventory")}><Box size={18} /></span></div><strong>{snapshot ? snapshot.itemsInStock.toLocaleString() : '—'}</strong><small><span className="metric-inline-dot purple-dot" /> From the stock movement ledger</small><span className="metric-card-link">View inventory <ArrowUpRight size={13} /></span></button>
      </div>

      <div className="dashboard-main-grid">
        <section className="section-card table-card recent-activity-card">
          <div className="table-toolbar"><div><h3>Recent sales</h3><p>Latest saved transactions from the active branch</p></div><button className="text-link" onClick={() => navigate('/sales')}>All sales <ArrowRight size={14} /></button></div>
          {snapshotQuery.isLoading ? <div className="loading-state">Calculating from saved records…</div> : !snapshot?.recentSales.length ? <div className="empty-state compact"><div className="empty-icon"><ShoppingBag size={21} /></div><h3>Your activity will appear here</h3><p>Complete a sale to see its receipt and related stock movements here.</p><button className="button button-primary" onClick={() => navigate('/checkout')}><ShoppingCart size={15} /> Start a sale</button></div> : <div className="recent-sales-list">{snapshot.recentSales.map((sale) => <button key={sale.id} className="recent-sale-row" onClick={() => navigate(`/sales/${sale.id}`)}><span className="recent-sale-icon"><ReceiptMini /></span><span className="recent-sale-main"><strong>{sale.customerName || 'Walk-in customer'}</strong><span>{sale.receiptNumber} <span className="tiny-separator">·</span> {new Date(sale.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span></span><span className="recent-sale-total"><strong>{formatMinorAmount(sale.totalMinor, workspace.currency)}</strong><span>Completed</span></span><ArrowRight size={15} className="recent-row-arrow" /></button>)}</div>}
        </section>
        <section className="section-card operational-panel"><div className="section-card-heading"><div className="heading-icon amber-icon"><Package size={18} /></div><div><h3>Stock needs attention</h3><p>Products at or below their minimum quantity</p></div></div>{snapshotQuery.isLoading ? <div className="loading-state">Checking inventory…</div> : !snapshot?.lowStockProducts.length ? <div className="compact-empty"><div className="success-ring"><ArrowUpRight size={17} /></div><strong>Nothing to flag in current records</strong><span>Alerts are calculated from the active branch stock ledger.</span></div> : <div className="low-stock-list">{snapshot.lowStockProducts.map(({ product, onHand }) => <div className="low-stock-row" key={product.id}><div><strong>{product.name}</strong><span>{product.sku}</span></div><div className="low-stock-amount"><strong>{onHand}</strong><span>min {product.lowStockThreshold}</span></div></div>)}</div>}<button className="panel-bottom-link" onClick={() => navigate('/inventory')}>Open inventory <ArrowRight size={14} /></button></section>
      </div>

      <section className="section-card phase-two-launch-card">
        <div className="phase-two-launch-heading"><div><div className="eyebrow eyebrow-blue">PHASE 2 · EXPANDED FRONTEND</div><h3>Explore the full business workspace</h3><p>New module screens, entry forms, lists, filters and sample workflows are ready for frontend review.</p></div><button className="button button-secondary button-small" onClick={() => navigate('/modules')}>All modules <ArrowRight size={14} /></button></div>
        <div className="phase-two-launch-grid">
          {dashboardModules.map((item) => { const Icon = item.icon; return <button key={item.to} onClick={() => navigate(item.to)}><span className="quick-action-icon quick-blue" data-module-accent={moduleAccentForPath(item.to)}><Icon size={17} /></span><span><strong>{item.title}</strong><small>{item.description}</small></span><ArrowRight size={14} /></button>; })}
        </div>
        <div className="phase-two-launch-footnote"><Activity size={14} /><span>Important: the existing backend/database has not been altered. New Phase 2 module figures are browser-local demonstration data until the later API integration step. They are not live balances or official accounting entries.</span></div>
      </section>

      <div className="dashboard-lower-grid">
        <section className="section-card quick-actions-card"><div className="section-card-heading"><div className="heading-icon blue-icon"><ArrowUpRight size={18} /></div><div><h3>Core workflow shortcuts</h3><p>Quick links to existing screens.</p></div></div><div className="quick-actions-grid"><button onClick={() => navigate('/checkout')}><span className="quick-action-icon quick-blue" data-module-accent={moduleAccentForPath("/checkout")}><ShoppingCart size={18} /></span><span><strong>Record a sale</strong><small>Checkout & receipt</small></span><ArrowRight size={15} /></button><button onClick={() => navigate('/products')}><span className="quick-action-icon quick-purple" data-module-accent={moduleAccentForPath("/products")}><Package size={18} /></span><span><strong>Add product</strong><small>Catalogue & pricing</small></span><ArrowRight size={15} /></button><button onClick={() => navigate('/inventory')}><span className="quick-action-icon quick-green" data-module-accent={moduleAccentForPath("/inventory")}><ArrowDownRight size={18} /></span><span><strong>Record stock</strong><small>Opening or adjustment</small></span><ArrowRight size={15} /></button></div></section>
        <section className="section-card data-integrity-card"><div className="section-card-heading"><div className="heading-icon green-icon"><CircleDollarSign size={18} /></div><div><h3>How to read these figures</h3><p>Keep the source and limitations clear.</p></div></div><div className="integrity-item"><span className="integrity-marker integrity-blue" /><div><strong>Sales value</strong><p>Completed sale totals less recorded returns.</p></div></div><div className="integrity-item"><span className="integrity-marker integrity-green" /><div><strong>Receipts</strong><p>Amounts marked received, not external transfer confirmation.</p></div></div><div className="integrity-item"><span className="integrity-marker integrity-amber" /><div><strong>Stock on hand</strong><p>Opening quantities plus recorded receipts, sales, returns and adjustments.</p></div></div></section>
      </div>
      <div className="local-disclaimer"><span className="disclaimer-icon"><Clock3 size={16} /></span><div><strong>Frontend modules are being prepared for integration.</strong><span>Current core records and new module previews remain separate. The later connection phase will map these screens to your existing API, database, identity, permissions and transactional workflows.</span></div><button onClick={() => navigate('/settings')}>Implementation status <ArrowRight size={14} /></button></div>
    </div>
  );
}

function ReceiptMini() { return <ShoppingBag size={16} />; }
