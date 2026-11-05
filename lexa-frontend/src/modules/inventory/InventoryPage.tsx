import { apiCatalogInventory } from '../../data/remote/apiWorkstream03';
import { dataProviderMode } from '../../data/remote/runtimeConfig';
import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {Link,useLocation} from 'react-router';
import { ArrowDownLeft, ArrowUpRight, ClipboardCheck, Package, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import { inventory, products } from '../../data/repositories';
import { movementLabel } from '../../domain/inventory/stock';
import type { StockMovement, Product } from '../../domain/shared/types';
import { StandardDataTable, type DataTableColumn } from '../../components/tables/StandardDataTable';
import { BarcodeCapture } from '../../components/barcode/BarcodeCapture';
import InventoryIntelligencePanel from './InventoryIntelligencePanel';
import {InventoryFrame} from './InventoryFrame';
import EquipmentServicePanel from './EquipmentServicePanel';

export default function InventoryPage() {
  const { workspace, branch } = useWorkspace();
  const client = useQueryClient();
  const inventoryLocation = useLocation();
  const unitHistoryQuery = new URLSearchParams(inventoryLocation.search);
  const initialUnitId = unitHistoryQuery.get('unitId') ?? '';
  const initialSaleLineId = unitHistoryQuery.get('saleLineId') ?? '';
  const [formOpen, setFormOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [variantId,setVariantId] = useState('');
  const [movementType, setMovementType] = useState<'opening' | 'adjustment'>('opening');
  const [direction, setDirection] = useState<'increase' | 'decrease'>('increase');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('Opening stock');
  const [inspectProductId,setInspectProductId]=useState('');
  const [inspectVariantId,setInspectVariantId]=useState('');
  const [saving, setSaving] = useState(false);

  const productQuery = useQuery({ queryKey: ['products', workspace.id], queryFn: () => products.list({ workspaceId: workspace.id, activeOnly: false }) });
  const variants=useQuery({queryKey:['all-variants',workspace.id],queryFn:()=>apiCatalogInventory.allVariants(workspace.id),enabled:dataProviderMode==='api',staleTime:30000,retry:1});
  const variantBalances=useQuery({queryKey:['checkout-variant-balances',workspace.id,branch.id],queryFn:()=>apiCatalogInventory.variantBalances(workspace.id,branch.id),enabled:dataProviderMode==='api',staleTime:10000,retry:1});
  const selectedVariants=(variants.data??[]).filter(v=>v.productId===productId);
  const inspectProduct=(productQuery.data??[]).find(p=>p.id===inspectProductId);
  const inspectVariants=(variants.data??[]).filter(v=>v.productId===inspectProductId);
  const canInspectUnit=Boolean(inspectProductId)&&(!inspectVariants.length||Boolean(inspectVariantId));
  const lotDetails=useQuery({queryKey:['stock-drilldown-lots',workspace.id,branch.id,inspectProductId,inspectVariantId],queryFn:()=>apiCatalogInventory.availableLots(workspace.id,branch.id,inspectProductId,inspectVariantId||undefined),enabled:dataProviderMode==='api'&&canInspectUnit&&Boolean(inspectProduct?.trackLot),retry:1});
  const serialDetails=useQuery({queryKey:['stock-drilldown-serials',workspace.id,branch.id,inspectProductId,inspectVariantId],queryFn:()=>apiCatalogInventory.availableSerials(workspace.id,branch.id,inspectProductId,inspectVariantId||undefined),enabled:dataProviderMode==='api'&&canInspectUnit&&Boolean(inspectProduct?.trackSerial),retry:1});

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
    const matchingVariant=(variants.data??[]).find(v=>v.sku.toLocaleLowerCase()===normalized||(v.barcode??'').toLocaleLowerCase()===normalized);
    const match = matchingVariant?trackedProducts.find(p=>p.id===matchingVariant.productId):trackedProducts.find((item) => item.sku.toLocaleLowerCase() === normalized || (item.barcode ?? '').toLocaleLowerCase() === normalized);
    if (!match) { toast.error('Product code not found', { description: 'Check the barcode or SKU and confirm that the product is active and stock-tracked.' }); return; }
    setProductId(match.id);setVariantId(matchingVariant?.id??'');
    toast.success('Product and variant selected', { description: `${match.name} · current stock ${balanceQuery.data?.get(match.id) ?? 0}` });
  }

  function openForm(type: 'opening' | 'adjustment') {
    setMovementType(type);
    setDirection('increase');
    setQuantity('1');
    setReason(type === 'opening' ? 'Opening stock' : 'Count correction');
    setProductId(trackedProducts[0]?.id ?? '');setVariantId('');
    setFormOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const entered = Number(quantity);
      if(!Number.isFinite(entered)||entered<=0||entered>1_000_000||Math.round(entered*1000)!==entered*1000)throw new Error('Enter a positive quantity with up to three decimal places.');
      if(selectedVariants.length&&!variantId)throw new Error('Choose the exact size, colour or model variant before changing stock.');
      if (movementType === 'opening' && direction !== 'increase') throw new Error('Opening stock must be an increase.');
      const quantityDelta = direction === 'increase' ? entered : -entered;
      await inventory.recordAdjustment({ workspaceId: workspace.id, branchId: branch.id, productId, ...(variantId?{variantId}:{}), quantityDelta, reason, movementType });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['inventory-balances', workspace.id, branch.id] }),
        client.invalidateQueries({ queryKey: ['checkout-variant-balances',workspace.id,branch.id] }),
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
    <InventoryFrame title="Stock & movements" subtitle="See available goods, customer reservations, stock movement and inventory risks in one place."
      action={<><Link to="/modules/stock-counts" className="solar-button-secondary"><ClipboardCheck size={16}/> Count and correct stock</Link>
        <button className="solar-button" onClick={()=>openForm('opening')} disabled={!trackedProducts.length}><Plus size={16}/> Record opening stock</button></>}>
      <InventoryIntelligencePanel/>
      <div className="page-heading-row"><div><div className="eyebrow eyebrow-blue">STOCK CONTROL</div><h2>Inventory</h2><p>Stock on hand is calculated from recorded movements for {branch.name}.</p></div><div className="action-group"><button className="button button-secondary" onClick={() => openForm('adjustment')} disabled={!trackedProducts.length}><ClipboardCheck size={16} /> Adjust stock</button><button className="button button-primary" onClick={() => openForm('opening')} disabled={!trackedProducts.length}><Plus size={17} /> Opening stock</button></div></div>
      <div className="metric-strip three-metrics"><div className="mini-metric"><span>Units on hand</span><strong>{totalUnits.toLocaleString()}</strong><small>Calculated from movement history</small></div><div className="mini-metric"><span>Tracked products</span><strong>{trackedProducts.length}</strong><small>Active products with stock tracking</small></div><div className="mini-metric"><span>Low-stock items</span><strong className={lowStockProducts.length ? 'warning-value' : ''}>{lowStockProducts.length}</strong><small>At or below minimum threshold</small></div></div>

      <div className="inventory-layout">
        <section className="section-card table-card inventory-balance-card"><div className="table-toolbar"><div><h3>Stock balances</h3><p>On-hand quantities by product</p></div><span className="branch-chip"><Package size={14} /> {branch.name}</span></div>{balanceQuery.isError ? <div className="inline-error" role="alert"><strong>Could not load stock balances.</strong><span>{balanceQuery.error instanceof Error ? balanceQuery.error.message : 'Check the connection and retry.'}</span><button className="button button-secondary button-small" onClick={() => void balanceQuery.refetch()}>Retry</button></div> : trackedProducts.length === 0 ? <div className="empty-state"><div className="empty-icon"><Package size={23} /></div><h3>No stock-tracked products</h3><p>Create products and enable inventory tracking to record opening stock.</p></div> : <StandardDataTable rows={balanceRows} columns={balanceColumns} rowLabel="products" emptyTitle="No stock-tracked products" emptyDescription="Create products and enable inventory tracking to record opening stock." />}</section>
        <section className="section-card low-stock-panel"><div className="section-card-heading"><div className="heading-icon amber-icon"><ArrowDownLeft size={18} /></div><div><h3>Low-stock review</h3><p>Items that need attention</p></div></div>{lowStockProducts.length ? <div className="low-stock-list">{lowStockProducts.slice(0, 6).map(({ product, onHand }) => <div className="low-stock-row" key={product.id}><div><strong>{product.name}</strong><span>{product.sku}</span></div><div className="low-stock-amount"><strong>{onHand}</strong><span>min {product.lowStockThreshold}</span></div></div>)}</div> : <div className="compact-empty"><div className="success-ring"><ArrowUpRight size={18} /></div><strong>Nothing below threshold</strong><span>When stock runs low, it will appear here.</span></div>}<div className="panel-footnote">Review shortages before creating a purchase request; no order is placed automatically. <Link to="/modules/replenishment">Review reorder planning</Link> · <Link to="/modules/purchase-requests">Create purchase request</Link></div></section>
      </div>

      <section className="section-card table-card lexa-stock-drilldown">
       <div className="table-toolbar"><div><h3>Inspect actual stock</h3><p>Drill down from a product to its sellable variant, available batches or individual serial/IMEI.</p></div><Link to="/modules/replenishment" className="button button-secondary button-small">Review replenishment</Link></div>
       <div className="form-two-col"><label className="field-label">Product<select value={inspectProductId} onChange={e=>{setInspectProductId(e.target.value);setInspectVariantId('');}}><option value="">Choose a product</option>{trackedProducts.map(product=><option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label>
       {inspectVariants.length>0&&<label className="field-label">Sellable variant<select value={inspectVariantId} onChange={e=>setInspectVariantId(e.target.value)}><option value="">Select a size, colour, storage or model</option>{inspectVariants.map(v=><option key={v.id} value={v.id}>{v.sku} · {Object.values(v.attributes??{}).join(' · ')}</option>)}</select></label>}</div>
       {inspectProduct&&<div className="lexa-stock-detail">
        <p><strong>{inspectProduct.name}</strong> · Branch stock: {balanceQuery.data?.get(inspectProduct.id)??0} {inspectProduct.unitOfMeasure??'units'}</p>
        {inspectVariants.length>0&&<table className="lexa-stock-detail-table"><caption>Recorded stock movements by sellable variant</caption><thead><tr><th>Variant</th><th>Attributes</th><th>On hand</th></tr></thead><tbody>{inspectVariants.map(v=><tr key={v.id}><td>{v.sku}</td><td>{Object.values(v.attributes??{}).join(' · ')}</td><td>{variantBalances.data?.find(b=>b.productId===inspectProductId&&b.variantId===v.id)?.quantity??0}</td></tr>)}</tbody></table>}
        {inspectVariants.length>0&&!inspectVariantId&&<p role="status">Select a variant to see its available lots or individual units.</p>}
        {canInspectUnit&&inspectProduct.trackLot&&<div><h4>Available unexpired lots</h4>{lotDetails.isError?<p role="alert">Lot details could not be loaded. Retry the stock lookup.</p>:lotDetails.isLoading?<p>Loading batches…</p>:!lotDetails.data?.length?<p>No available lots for this selection.</p>:<table className="lexa-stock-detail-table"><thead><tr><th>Batch</th><th>Expiry</th><th>Available</th></tr></thead><tbody>{lotDetails.data.map(lot=><tr key={lot.id}><td>{lot.lotNumber}</td><td>{lot.expiryDate??'Not set'}</td><td>{lot.available}</td></tr>)}</tbody></table>}</div>}
        {canInspectUnit&&inspectProduct.trackSerial&&<div><h4>Available physical units</h4>{serialDetails.isError?<p role="alert">Serial details could not be loaded.</p>:serialDetails.isLoading?<p>Loading devices…</p>:!serialDetails.data?.length?<p>No available serials for this selection.</p>:<div className="lexa-stock-serial-list">{serialDetails.data.slice(0,120).map(unit=><code key={unit.id}>{unit.serialNumber}{unit.identifiers?.imei2?' / IMEI 2: '+unit.identifiers.imei2:''}</code>)}{serialDetails.data.length>120&&<small>Showing 120 of {serialDetails.data.length}. Use the scanner to find a specific unit.</small>}</div>}</div>}
        {!inspectProduct.trackLot&&!inspectProduct.trackSerial&&<p>Quantity-managed stock: individual serial or lot IDs are not required for this product.</p>}
       </div>}
       <p className="field-help">Figures reflect authorized branch records. For batch goods, availability excludes reserved, quarantined and expired stock. Read-only drill-down never changes quantities.</p>
      </section>
      {dataProviderMode==='api'&&<EquipmentServicePanel workspaceId={workspace.id} branchId={branch.id} products={productQuery.data??[]} initialUnitId={initialUnitId} initialSaleLineId={initialSaleLineId}/>}
      <section className="section-card table-card"><div className="table-toolbar"><div><h3>Movement history</h3><p>Auditable changes to stock at this branch</p></div><span className="muted-count">{movementQuery.data?.length ?? 0} records</span></div>{movementQuery.isError ? <div className="inline-error" role="alert"><strong>Could not load movement history.</strong><span>{movementQuery.error instanceof Error ? movementQuery.error.message : 'Check the connection and retry.'}</span><button className="button button-secondary button-small" onClick={() => void movementQuery.refetch()}>Retry</button></div> : movementQuery.isLoading ? <div className="loading-state">Loading movement history…</div> : !(movementQuery.data ?? []).length ? <div className="empty-state compact"><div className="empty-icon"><ArrowDownLeft size={23} /></div><h3>No stock movements yet</h3><p>Record opening quantities or a stock adjustment to begin the ledger.</p>{trackedProducts.length > 0 && <button className="button button-primary" onClick={() => openForm('opening')}><Plus size={15} /> Record opening stock</button>}</div> : <StandardDataTable rows={movementQuery.data ?? []} columns={movementColumns} rowLabel="movements" emptyTitle="No stock movements yet" emptyDescription="Stock ledger events will appear here after a validated movement is recorded." />}</section>


      {formOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false); }}><section className="form-modal small-modal" role="dialog" aria-modal="true" aria-labelledby="stock-form-title"><div className="modal-heading"><div><div className="eyebrow eyebrow-blue">STOCK LEDGER</div><h3 id="stock-form-title">{movementType === 'opening' ? 'Record opening stock' : 'Adjust stock'}</h3><p>This creates a movement record; it does not edit a standalone balance.</p></div><button className="icon-button" aria-label="Close form" onClick={() => setFormOpen(false)}><X size={19} /></button></div><form onSubmit={submit} className="form-stack"><BarcodeCapture compact label="Scan a product for this stock movement" onCode={handleStockBarcode} /><label className="field-label">Product <span className="required-mark">*</span><select required value={productId} onChange={(event) => {setProductId(event.target.value);setVariantId('');}}>{trackedProducts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku} (on hand: {balanceQuery.data?.get(item.id) ?? 0})</option>)}</select></label>{selectedVariants.length>0&&<label className="field-label">Exact product variant *<select required value={variantId} onChange={e=>setVariantId(e.target.value)}><option value="">Choose size, colour or model</option>{selectedVariants.map(v=><option key={v.id} value={v.id}>{v.sku} · stock {variantBalances.data?.find(b=>b.productId===productId&&b.variantId===v.id)?.quantity??0}</option>)}</select></label>}{movementType === 'adjustment' && <label className="field-label">Adjustment direction<select value={direction} onChange={(event) => setDirection(event.target.value as 'increase' | 'decrease')}><option value="increase">Increase stock</option><option value="decrease">Decrease stock</option></select></label>}<label className="field-label">{movementType === 'opening' ? 'Opening quantity' : 'Quantity'} <span className="required-mark">*</span><input required type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label className="field-label">Reason <span className="required-mark">*</span><textarea required rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why stock is changing" /></label><div className="form-info"><ClipboardCheck size={16} /><p>Changes are saved with a timestamp and reason. Stock cannot be reduced below zero.</p></div><div className="form-modal-actions"><button type="button" className="button button-secondary" onClick={() => setFormOpen(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={saving || !trackedProducts.length}>{saving ? 'Saving…' : 'Save movement'} <ArrowUpRight size={16} /></button></div></form></section></div>}
    </InventoryFrame>
  );
}
