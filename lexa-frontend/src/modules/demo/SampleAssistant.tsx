import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useWorkspace } from '../../app/WorkspaceContext';
import { localReportsRepository } from '../../data/local/reports';
import './demo.css';

type Topic = 'sales' | 'stock' | 'purchasing';
function money(value: number): string {
  return new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(value);
}

/** A transparent, deterministic guide over browser-local sample data, never an AI API call. */
export default function SampleAssistant() {
  const { workspace, branch } = useWorkspace();
  const [topic, setTopic] = useState<Topic>('sales');
  const summary = useQuery({
    queryKey: ['demo-assistant', workspace.id, branch.id],
    queryFn: () => localReportsRepository.getDashboardSnapshot({ workspaceId: workspace.id, branchId: branch.id }),
    staleTime: 10_000,
  });
  return <div className="page-stack lexa-browser-demo-reports">
    <header className="lexa-browser-demo-heading">
      <span>LEXA ASSISTANT · GUIDED DEMONSTRATION</span>
      <h1>Explore insights from this sample business</h1>
      <p>This browser-only guide reads linked fictional sales and stock figures. It is not the connected AI Assistant, and cannot access customer records or post transactions.</p>
    </header>
    <nav className="lexa-browser-demo-periods" aria-label="Sample questions">
      <button type="button" aria-pressed={topic==='sales'} onClick={()=>setTopic('sales')}>What have we sold?</button>
      <button type="button" aria-pressed={topic==='stock'} onClick={()=>setTopic('stock')}>Which stock needs attention?</button>
      <button type="button" aria-pressed={topic==='purchasing'} onClick={()=>setTopic('purchasing')}>How do purchases work?</button>
    </nav>
    <section className="section-card" style={{ padding: 24 }}>
      {summary.isPending ? <p role="status">Reading linked sample records…</p> :
        summary.isError ? <p role="alert">The sample summary could not be opened. <button type="button" onClick={()=>void summary.refetch()}>Retry</button></p> :
        topic==='sales' ? <><h2>Recorded sales</h2>
          <p>This shop has {summary.data.saleCount} linked sample sales, totalling {money(summary.data.netSalesMinor)}. Checkout updates the receipt history and stock movements together.</p>
          <Link to="/sales">Explore sale receipts →</Link></> :
        topic==='stock' ? <><h2>Stock requiring attention</h2>
          <p>{summary.data.lowStockCount} catalogue products are marked low stock in this sample. Review stock quantities before placing new supplier orders.</p>
          <Link to="/inventory">Inspect the stock →</Link></> :
          <><h2>From supplier order to sale</h2>
            <p>Purchase orders and supplier records here are illustrative registers. They do not post goods receipts automatically. Checkout-to-stock movements are functional within the sample.</p>
            <Link to="/modules/purchases">Explore sample orders →</Link></>}
    </section>
    <p>To use the connected AI Assistant, sign in to an authorized business account. This guide never sends your question to an AI provider.</p>
  </div>;
}
