import { moduleAccentForPath } from '../../domain/shared/moduleAccents';
import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, ClipboardCheck, Package, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import { inventory, products } from '../../data/repositories';
import { movementLabel } from '../../domain/inventory/stock';
import type { StockMovement, Product } from '../../domain/shared/types';
import { StandardDataTable, type DataTableColumn } from '../../components/tables/StandardDataTable';
import { BarcodeCapture } from '../../components/barcode/BarcodeCapture';

export default function InventoryPage() {
  const { workspace, branch } = useWorkspace();
  const client = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [movementType, setMovementType] = useState<'opening' | 'adjustment'>('opening');
  const [direction, setDirection] = useState<'increase' | 'decrease'>('increase');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('Opening stock');
  const [saving, setSaving] = useState(false);

  const productQuery = useQuery({ queryKey: ['products', workspace.id], queryFn: () => products.list({ workspaceId: workspace.id, activeOnly: false }) });
  const balanceQuery = useQuery({ queryKey: ['inventory-balances', workspace.id, branch.id], queryFn: () => inventory.getBalances({ workspaceId: workspace.id, branchId: branch.id }) });
  const movementQuery = useQuery({ queryKey: ['inventory-movements', workspace.id, branch.id], queryFn: () => inventory.listMovements({ workspaceId: workspace.id, branchId: branch.id, limit: 100 }) });
  const trackedProducts = useMemo(() => (productQuery.data ?? []).filter((item) => item.trackStock && item.active), [productQuery.data]);
  const productMap = useMemo(() => new Map((productQuery.data ?? []).map((item) => [item.id, item])), [productQuery.data]);
  const onHandProducts = trackedProducts.map((product) => ({ product, onHand: balanceQuery.data?.get(product.id) ?? 0 }));
  const lowStockProducts = onHandProducts.filter(({ product, onHand }) => onHand <= product.lowStockThreshold);
  const totalUnits = onHandProducts.reduce((sum, item) => sum + item.onHand, 0);
  const balanceRows = onHandProducts.map(({ product, onHand }) => ({ ...product, onHand, isLow: onHand <= product.lowStockThreshold }));
  const balanceColumns: DataTableColumn<Product & { onHand: number; isLow: boolean }>[] = [
    { key: 'name', header: 'Product', cell: (row) => <div className="product-cell"><div className="product-avatar"><Package size={16} /></div><div><strong>{row.name}</strong><span>Updated from stock ledger</span></div></div>, sortValue: (row) => row.name },
    { key: 'sku', header: 'SKU', cell: (row) => <span className="sku-label">{row.sku}</span>, sortValue: (row) => row.sku },
    { key: 'onHand', header: 'On hand', cell: (row) => <strong className={`stock-number ${row.isLow ? 'stock-low' : ''}`}>{row.onHand}</strong>, sortValue: (row) => row.onHand },
    { key: 'lowStockThreshold', header: 'Minimum', cell: (row) => row.lowStockThreshold, sortValue: (row) => row.lowStockThreshold },
    { key: 'status', header: 'Status', cell: (row) => row.isLow ? <span className="status-pill status-warning">Reorder review</span> : <span className="status-pill status-good">In range</span>, sortValue: (row) => row.isLow ? 'Reorder review' : 'In range' },
  ];
  const movementColumns: DataTableColumn<StockMovement>[] = [
    { key: 'createdAt', header: 'Date', cell: (row) => new Date(row.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }), sortValue: (row) => row.createdAt },
    { key: 'productId', header: 'Product', cell: (row) => productMap.get(row.productId)?.name ?? 'Unknown product', sortValue: (row) => productMap.get(row.productId)?.name ?? row.productId },
    { key: 'type', header: 'Event', cell: (row) => <span className="movement-type">{movementLabel(row.type)}</span>, sortValue: (row) => row.type },
    { key: 'quantityDelta', header: 'Change', align: 'end', cell: (row) => <span className={`movement-quantity ${row.quantityDelta > 0 ? 'movement-positive' : 'movement-negative'}`}>{row.quantityDelta > 0 ? '+' : ''}{row.quantityDelta}</span>, sortValue: (row) => row.quantityDelta },
    { key: 'reason', header: 'Reason / reference', cell: (row) => row.reason, sortValue: (row) => row.reason },
  ];

  function handleStockBarcode(code: string) {
    const normalized = code.trim().toLocaleLowerCase();
    const match = trackedProducts.find((item) => item.sku.toLocaleLowerCase() === normalized || (item.barcode ?? '').toLocaleLowerCase() === normalized);
    if (!match) { toast.error('Product code not found', { description: 'Check the barcode or SKU and confirm that the product is active and stock-tracked.' }); return; }
    setProductId(match.id);
    toast.success('Product selected', { description: `${match.name} · current stock ${balanceQuery.data?.get(match.id) ?? 0}` });
  }

  function openForm(type: 'opening' | 'adjustment') {
    setMovementType(type);
    setDirection('increase');
    setQuantity('1');
    setReason(type === 'opening' ? 'Opening stock' : 'Count correction');
    setProductId(trackedProducts[0]?.id ?? '');
    setFormOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const entered = Number(quantity);
      if (!Number.isSafeInteger(entered) || entered <= 0) throw new Error('Enter a positive whole-number quantity.');
      if (movementType === 'opening' && direction !== 'increase') throw new Error('Opening stock must be an increase.');
      const quantityDelta = direction === 'increase' ? entered : -entered;
      await inventory.recordAdjustment({ workspaceId: workspace.id, branchId: branch.id, productId, quantityDelta, reason, movementType });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['inventory-balances', workspace.id, branch.id] }),
        client.invalidateQueries({ queryKey: ['inventory-movements', workspace.id, branch.id] }),
        client.invalidateQueries({ queryKey: ['dashboard', workspace.id, branch.id] }),
      ]);
      toast.success(movementType === 'opening' ? 'Opening stock recorded' : 'Stock adjustment saved', { description: `${Math.abs(quantityDelta)} unit${Math.abs(quantityDelta) === 1 ? '' : 's'} · ${productMap.get(productId)?.name ?? 'Product'}` });
      setFormOpen(false);
    } catch (error) {
      toast.error('Stock was not changed', { description: error instanceof Error ? error.message : 'Check the details and try again.' });
    } finally { setSaving(false); }
  }

  return (
    <div className="page-stack" data-module-accent={moduleAccentForPath("/inventory")}>
      <div className="page-heading-row"><div><div className="eyebrow eyebrow-blue">STOCK CONTROL</div><h2>Inventory</h2><p>Stock on hand is calculated from recorded movements for {branch.name}.</p></div><div className="action-group"><button className="button button-secondary" onClick={() => openForm('adjustment')} disabled={!trackedProducts.length}><ClipboardCheck size={16} /> Adjust stock</button><button className="button button-primary" onClick={() => openForm('opening')} disabled={!trackedProducts.length}><Plus size={17} /> Opening stock</button></div></div>
      <div className="metric-strip three-metrics"><div className="mini-metric"><span>Units on hand</span><strong>{totalUnits.toLocaleString()}</strong><small>Calculated from movement history</small></div><div className="mini-metric"><span>Tracked products</span><strong>{trackedProducts.length}</strong><small>Active products with stock tracking</small></div><div className="mini-metric"><span>Low-stock items</span><strong className={lowStockProducts.length ? 'warning-value' : ''}>{lowStockProducts.length}</strong><small>At or below minimum threshold</small></div></div>

      <div className="inventory-layout">
        <section className="section-card table-card inventory-balance-card"><div className="table-toolbar"><div><h3>Stock balances</h3><p>On-hand quantities by product</p></div><span className="branch-chip"><Package size={14} /> {branch.name}</span></div>{balanceQuery.isError ? <div className="inline-error" role="alert"><strong>Could not load stock balances.</strong><span>{balanceQuery.error instanceof Error ? balanceQuery.error.message : 'Check the connection and retry.'}</span><button className="button button-secondary button-small" onClick={() => void balanceQuery.refetch()}>Retry</button></div> : trackedProducts.length === 0 ? <div className="empty-state"><div className="empty-icon"><Package size={23} /></div><h3>No stock-tracked products</h3><p>Create products and enable inventory tracking to record opening stock.</p></div> : <StandardDataTable rows={balanceRows} columns={balanceColumns} rowLabel="products" emptyTitle="No stock-tracked products" emptyDescription="Create products and enable inventory tracking to record opening stock." />}</section>
        <section className="section-card low-stock-panel"><div className="section-card-heading"><div className="heading-icon amber-icon"><ArrowDownLeft size={18} /></div><div><h3>Low-stock review</h3><p>Items that need attention</p></div></div>{lowStockProducts.length ? <div className="low-stock-list">{lowStockProducts.slice(0, 6).map(({ product, onHand }) => <div className="low-stock-row" key={product.id}><div><strong>{product.name}</strong><span>{product.sku}</span></div><div className="low-stock-amount"><strong>{onHand}</strong><span>min {product.lowStockThreshold}</span></div></div>)}</div> : <div className="compact-empty"><div className="success-ring"><ArrowUpRight size={18} /></div><strong>Nothing below threshold</strong><span>When stock runs low, it will appear here.</span></div>}<div className="panel-footnote">Alerts use product-level minimum quantities; purchasing and reorder automation are not connected.</div></section>
      </div>

      <section className="section-card table-card"><div className="table-toolbar"><div><h3>Movement history</h3><p>Auditable changes to stock at this branch</p></div><span className="muted-count">{movementQuery.data?.length ?? 0} records</span></div>{movementQuery.isError ? <div className="inline-error" role="alert"><strong>Could not load movement history.</strong><span>{movementQuery.error instanceof Error ? movementQuery.error.message : 'Check the connection and retry.'}</span><button className="button button-secondary button-small" onClick={() => void movementQuery.refetch()}>Retry</button></div> : movementQuery.isLoading ? <div className="loading-state">Loading movement history…</div> : !(movementQuery.data ?? []).length ? <div className="empty-state compact"><div className="empty-icon"><ArrowDownLeft size={23} /></div><h3>No stock movements yet</h3><p>Record opening quantities or a stock adjustment to begin the ledger.</p>{trackedProducts.length > 0 && <button className="button button-primary" onClick={() => openForm('opening')}><Plus size={15} /> Record opening stock</button>}</div> : <StandardDataTable rows={movementQuery.data ?? []} columns={movementColumns} rowLabel="movements" emptyTitle="No stock movements yet" emptyDescription="Stock ledger events will appear here after a validated movement is recorded." />}</section>

      {formOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false); }}><section className="form-modal small-modal" role="dialog" aria-modal="true" aria-labelledby="stock-form-title"><div className="modal-heading"><div><div className="eyebrow eyebrow-blue">STOCK LEDGER</div><h3 id="stock-form-title">{movementType === 'opening' ? 'Record opening stock' : 'Adjust stock'}</h3><p>This creates a movement record; it does not edit a standalone balance.</p></div><button className="icon-button" aria-label="Close form" onClick={() => setFormOpen(false)}><X size={19} /></button></div><form onSubmit={submit} className="form-stack"><BarcodeCapture compact label="Scan a product for this stock movement" onCode={handleStockBarcode} /><label className="field-label">Product <span className="required-mark">*</span><select required value={productId} onChange={(event) => setProductId(event.target.value)}>{trackedProducts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku} (on hand: {balanceQuery.data?.get(item.id) ?? 0})</option>)}</select></label>{movementType === 'adjustment' && <label className="field-label">Adjustment direction<select value={direction} onChange={(event) => setDirection(event.target.value as 'increase' | 'decrease')}><option value="increase">Increase stock</option><option value="decrease">Decrease stock</option></select></label>}<label className="field-label">{movementType === 'opening' ? 'Opening quantity' : 'Quantity'} <span className="required-mark">*</span><input required type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label className="field-label">Reason <span className="required-mark">*</span><textarea required rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why stock is changing" /></label><div className="form-info"><ClipboardCheck size={16} /><p>Changes are saved with a timestamp and reason. Stock cannot be reduced below zero.</p></div><div className="form-modal-actions"><button type="button" className="button button-secondary" onClick={() => setFormOpen(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={saving || !trackedProducts.length}>{saving ? 'Saving…' : 'Save movement'} <ArrowUpRight size={16} /></button></div></form></section></div>}
    </div>
  );
}
