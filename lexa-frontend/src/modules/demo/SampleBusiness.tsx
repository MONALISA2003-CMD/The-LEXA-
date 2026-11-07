import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useWorkspace } from '../../app/WorkspaceContext';
import { localReportsRepository } from '../../data/local/reports';

/** Browser-local business overview. No customer-only profile APIs are called. */
export default function SampleBusiness() {
  const { workspace, branch } = useWorkspace();
  const overview = useQuery({
    queryKey: ['browser-demo-my-business', workspace.id, branch.id],
    queryFn: () => localReportsRepository.getDashboardSnapshot({ workspaceId: workspace.id, branchId: branch.id }),
  });
  return <div className="page-stack lexa-browser-demo-settings">
    <header className="lexa-browser-demo-heading">
      <span>MY BUSINESS · FICTIONAL EXAMPLE</span>
      <h1>{workspace.businessName}</h1>
      <p>This browser-local sample demonstrates what a business owner can inspect. It is not a live registered company or an authenticated customer profile.</p>
    </header>
    <section className="section-card" style={{ padding: 24 }}>
      <h2>Business workspace</h2>
      <div className="lexa-browser-demo-settings-grid">
        <section><h3>Business</h3><p>{workspace.businessName}</p></section>
        <section><h3>Branch</h3><p>{branch.name}</p></section>
        <section><h3>Currency</h3><p>{workspace.currency}</p></section>
      </div>
    </section>
    <section className="section-card" style={{ padding: 24 }}>
      <h2>Linked sample activity</h2>
      {overview.isPending ? <p role="status">Checking sample activity…</p> :
        overview.isError ? <p role="alert">Sample activity is temporarily unavailable. <button type="button" onClick={()=>void overview.refetch()}>Retry</button></p> :
        <p>{overview.data.saleCount} sample sale receipts are recorded, with {overview.data.lowStockCount} low-stock items requiring review.</p>}
      <nav className="lexa-browser-demo-shortcuts" aria-label="Explore business">
        <Link to="/checkout">Record a sample sale →</Link>
        <Link to="/inventory">Inspect stock →</Link>
        <Link to="/modules/purchases">Browse supplier orders →</Link>
        <Link to="/reports">Read linked reports →</Link>
      </nav>
    </section>
    <p>Changing legal ownership, staff identity, payments, and subscription details requires a real authenticated LEXA account.</p>
  </div>;
}
