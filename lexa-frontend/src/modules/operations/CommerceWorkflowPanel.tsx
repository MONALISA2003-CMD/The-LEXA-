import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDownToLine, ArrowUpRight, CheckCircle2, PackageCheck, Plus, Truck, UserRoundCheck, X } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { useModuleRecordService } from '../../data/providers/ModuleRecordServiceProvider';
import { products } from '../../data/repositories';
import { isApiProvider } from '../../data/remote/runtimeConfig';
import { apiCommerce, type CommerceOrder, type GoodsReceiptInput } from '../../data/remote/apiCommerce';
import type { PreviewRecord } from './moduleCatalog';
import type { Product } from '../../domain/shared/types';
import './commerce-workflows.css';

type DraftLine = { productId: string; quantity: string };
type ReceiptDraft = { orderLineId: string; productName: string; remaining: number; acceptedQuantity: string; rejectedQuantity: string; rejectionReason: string; batchNumber: string; expiryDate: string };
type DispatchDraft = { orderLineId: string; productName: string; remaining: number; quantity: string };
const emptyLine: DraftLine = { productId: '', quantity: '1' };

function money(amountMinor: number, currency: string) {
  const factor = 10 ** (new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0);
  return new Intl.NumberFormat('en-UG', { style: 'currency', currency, maximumFractionDigits: currency === 'UGX' ? 0 : 2 }).format(amountMinor / factor);
}
function labelStatus(status: string) { return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }

export default function CommerceWorkflowPanel({ moduleId }: { moduleId: string }) {
  const { workspace, branch } = useWorkspace();
  const service = useModuleRecordService();
  const client = useQueryClient();
  const scope = { workspaceId: workspace.id, branchId: branch.id };
  const apiMode = isApiProvider;
  const salesModule = moduleId === 'sales-orders';
  const purchaseModule = moduleId === 'purchases' || moduleId === 'receiving';
  const deliveryModule = moduleId === 'deliveries';
  const leadModule = moduleId === 'leads';
  const customerModule = moduleId === 'customers';
  const supplierModule = moduleId === 'suppliers';
  const [showCreate, setShowCreate] = useState(false);
  const [partyId, setPartyId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [courier, setCourier] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ ...emptyLine }]);
  const [busy, setBusy] = useState(false);
  const [receivingOrder, setReceivingOrder] = useState<CommerceOrder | null>(null);
  const [dispatchOrder, setDispatchOrder] = useState<CommerceOrder | null>(null);
  const [dispatchDraft, setDispatchDraft] = useState<DispatchDraft[]>([]);
  const [receiptDraft, setReceiptDraft] = useState<ReceiptDraft[]>([]);
  const [receiptReason, setReceiptReason] = useState('');
  const [deliveryRefs, setDeliveryRefs] = useState<Record<string, string>>({});

  const productQuery = useQuery({ queryKey: ['products', workspace.id], queryFn: () => products.list({ workspaceId: workspace.id, activeOnly: true }), enabled: apiMode && (salesModule || purchaseModule) });
  const partyModule = salesModule || customerModule ? 'customers' : 'suppliers';
  const partyQuery = useQuery({ queryKey: ['module-register', workspace.id, branch.id, partyModule], queryFn: () => service.list(scope, partyModule, []), enabled: apiMode && (salesModule || purchaseModule || customerModule || supplierModule) });
  const leadQuery = useQuery({ queryKey: ['module-register', workspace.id, branch.id, 'leads'], queryFn: () => service.list(scope, 'leads', []), enabled: apiMode && leadModule });
  const salesOrdersQuery = useQuery({ queryKey: ['commerce-sales-orders', workspace.id, branch.id], queryFn: () => apiCommerce.listSalesOrders(scope), enabled: apiMode && (salesModule || customerModule) });
  const purchaseOrdersQuery = useQuery({ queryKey: ['commerce-purchase-orders', workspace.id, branch.id], queryFn: () => apiCommerce.listPurchaseOrders(scope), enabled: apiMode && (purchaseModule || supplierModule) });
  const deliveriesQuery = useQuery({ queryKey: ['commerce-deliveries', workspace.id, branch.id], queryFn: () => apiCommerce.listDeliveries(scope), enabled: apiMode && deliveryModule });
  const availableProducts = useMemo(() => productQuery.data ?? [], [productQuery.data]);
  const parties = useMemo(() => (partyQuery.data ?? []).filter((r) => (r.status ?? 'Active') === 'Active'), [partyQuery.data]);
  const leads = useMemo(() => leadQuery.data ?? [], [leadQuery.data]);
  const salesOrders = salesOrdersQuery.data ?? [];
  const purchaseOrders = purchaseOrdersQuery.data ?? [];
  const deliveries = deliveriesQuery.data ?? [];
  const isWorkflowModule = salesModule || purchaseModule || deliveryModule || leadModule || customerModule || supplierModule;

  if (!apiMode || !isWorkflowModule) return null;

  async function refreshAll() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['commerce-sales-orders', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['commerce-purchase-orders', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['commerce-deliveries', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['module-register', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['inventory-balances', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['inventory-movements', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['dashboard', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['sales', workspace.id] }),
    ]);
  }

  function updateLine(index: number, key: keyof DraftLine, value: string) {
    setLines((current) => current.map((line, i) => i === index ? { ...line, [key]: value } : line));
  }
  function addLine() { setLines((current) => [...current, { ...emptyLine }]); }
  function removeLine(index: number) { setLines((current) => current.length <= 1 ? current : current.filter((_, i) => i !== index)); }

  async function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      const normalized = lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) }));
      if (normalized.some((line) => !line.productId || !Number.isFinite(line.quantity) || line.quantity <= 0)) throw new Error('Choose a product and positive quantity for every line.');
      if (salesModule) {
        const party = parties.find((p) => p.id === partyId);
        const result = await apiCommerce.createSalesOrder(scope, { ...(partyId ? { customerRecordId: partyId } : {}), ...(party?.name ? { customerName: party.name } : {}), ...(deliveryAddress.trim() ? { deliveryAddress: deliveryAddress.trim() } : {}), ...(courier.trim() ? { courier: courier.trim() } : {}), ...(expectedDate ? { expectedDate } : {}), lines: normalized });
        toast.success('Sales order created', { description: `${result.orderNumber} · ${money(result.totalMinor, workspace.currency)}` });
      } else {
        const supplier = parties.find((p) => p.id === partyId);
        if (!supplier?.name) throw new Error('Choose a supplier from the supplier register.');
        const result = await apiCommerce.createPurchaseOrder(scope, { supplierRecordId: partyId, supplierName: supplier.name, ...(expectedDate ? { expectedDate } : {}), lines: normalized });
        toast.success('Purchase order created', { description: `${result.orderNumber} · ${money(result.totalMinor, workspace.currency)}` });
      }
      setShowCreate(false); setPartyId(''); setExpectedDate(''); setDeliveryAddress(''); setCourier(''); setLines([{ ...emptyLine }]); await refreshAll();
    } catch (error) { toast.error('Order not saved', { description: error instanceof Error ? error.message : 'Check the details and try again.' }); }
    finally { setBusy(false); }
  }

  async function runAction(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try { const result = await action(); toast.success(success, { description: result && typeof result === 'object' && 'status' in result ? labelStatus(String((result as {status:unknown}).status)) : undefined }); await refreshAll(); }
    catch (error) { toast.error('Workflow was not posted', { description: error instanceof Error ? error.message : 'Check the details and try again.' }); }
    finally { setBusy(false); }
  }

  function openDispatch(order: CommerceOrder) {
    const pending = order.lines.map((line) => ({
      orderLineId: line.id ?? '', productName: line.productName,
      remaining: Math.max(0, line.quantity - (line.quantityFulfilled ?? 0)),
      quantity: String(Math.max(0, line.quantity - (line.quantityFulfilled ?? 0))),
    })).filter((line) => line.remaining > 0);
    setDispatchOrder(order); setDispatchDraft(pending);
  }
  async function postDispatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!dispatchOrder) return; setBusy(true);
    try {
      const linesToDispatch = dispatchDraft.filter((line) => Number(line.quantity) > 0).map((line) => ({ orderLineId: line.orderLineId, quantity: Number(line.quantity) }));
      if (!linesToDispatch.length) throw new Error('Enter at least one quantity to dispatch.');
      const result = await apiCommerce.fulfilSalesOrder(scope, dispatchOrder.id, linesToDispatch);
      toast.success('Fulfilment dispatched', { description: `${result.fulfilmentNumber} · ${money(result.totalMinor, workspace.currency)} · Stock ledger updated.` });
      setDispatchOrder(null); setDispatchDraft([]); await refreshAll();
    } catch (error) { toast.error('Fulfilment was not posted', { description: error instanceof Error ? error.message : 'Check quantities and stock availability.' }); }
    finally { setBusy(false); }
  }

  function openReceipt(order: CommerceOrder) {
    const pending = order.lines.map((line) => ({
      orderLineId: line.id ?? '', productName: line.productName,
      remaining: Math.max(0, line.quantity - (line.quantityAccepted ?? 0)),
      acceptedQuantity: '', rejectedQuantity: '', rejectionReason: '', batchNumber: '', expiryDate: '',
    })).filter((line) => line.remaining > 0);
    setReceivingOrder(order); setReceiptDraft(pending); setReceiptReason('');
  }
  async function postReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!receivingOrder) return; setBusy(true);
    try {
      const receipt: GoodsReceiptInput = {
        ...(receiptReason.trim() ? { reason: receiptReason.trim() } : {}),
        lines: receiptDraft.filter((line) => Number(line.acceptedQuantity) > 0 || Number(line.rejectedQuantity) > 0).map((line) => ({
          orderLineId: line.orderLineId,
          acceptedQuantity: Number(line.acceptedQuantity || 0),
          rejectedQuantity: Number(line.rejectedQuantity || 0),
          ...(line.rejectionReason.trim() ? { rejectionReason: line.rejectionReason.trim() } : {}),
          ...(line.batchNumber.trim() ? { batchNumber: line.batchNumber.trim() } : {}),
          ...(line.expiryDate ? { expiryDate: line.expiryDate } : {}),
        })),
      };
      const result = await apiCommerce.receivePurchaseOrder(scope, receivingOrder.id, receipt);
      toast.success('Goods receipt posted', { description: `${result.receiptNumber} · ${result.accepted} accepted, ${result.rejected} rejected. Only accepted quantities increased stock.` });
      setReceivingOrder(null); setReceiptDraft([]); await refreshAll();
    } catch (error) { toast.error('Goods receipt was not posted', { description: error instanceof Error ? error.message : 'Check quantities and retry.' }); }
    finally { setBusy(false); }
  }

  function heading() {
    if (salesModule) return ['ORDER MANAGEMENT', 'Sales order execution', 'Build customer orders, confirm stock availability, then fulfil and dispatch. Stock reduces only on dispatch.'];
    if (purchaseModule) return ['PURCHASING & RECEIVING', 'Supplier order and receipt control', 'Order from a supplier, count what arrived, separate accepted from rejected units, and post accepted stock.'];
    if (deliveryModule) return ['LAST-MILE OPERATIONS', 'Dispatch and delivery control', 'Track every dispatched fulfilment through in-transit, proof-of-delivery or delivery exception.'];
    if (leadModule) return ['CRM CONVERSION', 'Lead qualification hand-off', 'Convert a qualified lead into a customer account and preserve the source relationship.'];
    if (customerModule) return ['CUSTOMER COMMERCE', 'Customer orders and history', 'See operational orders linked to customer records.'];
    return ['SUPPLIER COMMERCE', 'Supplier purchasing history', 'See purchase commitments and receipts linked to supplier records.'];
  }
  const [eyebrow, title, description] = heading();

  return (
    <section className="commerce-workflow-panel">
      <div className="commerce-panel-heading">
        <div className="commerce-panel-icon"><PackageCheck size={18} /></div>
        <div><span className="eyebrow eyebrow-blue">{eyebrow}</span><h3>{title}</h3><p>{description}</p></div>
        {(salesModule || moduleId === 'purchases') && <button type="button" className="button button-primary button-small" onClick={() => setShowCreate((value) => !value)}><Plus size={15} /> New {salesModule ? 'sales order' : 'purchase order'}</button>}
      </div>

      {showCreate && (salesModule || moduleId === 'purchases') && <form className="commerce-create-form" onSubmit={saveOrder}>
        <div className="commerce-form-grid">
          <label className="field-label">{salesModule ? 'Customer (optional for cash orders)' : 'Supplier'}<select value={partyId} onChange={(e) => setPartyId(e.target.value)} required={!salesModule}><option value="">{salesModule ? 'Walk-in / not linked' : 'Select supplier'}</option>{parties.map((party) => <option key={party.id} value={party.id}>{party.name ?? party.customerCode ?? party.supplierCode ?? party.id}</option>)}</select></label>
          <label className="field-label">Expected {salesModule ? 'delivery' : 'receipt'} date<input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></label>
          {salesModule && <label className="field-label">Delivery address<input value={deliveryAddress} onChange={(e)=>setDeliveryAddress(e.target.value)} placeholder="Delivery destination" /></label>}
          {salesModule && <label className="field-label">Courier / driver<input value={courier} onChange={(e)=>setCourier(e.target.value)} placeholder="Optional carrier or driver" /></label>}
        </div>
        <div className="commerce-lines-heading"><strong>Order lines</strong><button type="button" className="button button-secondary button-small" onClick={addLine}><Plus size={14} /> Add line</button></div>
        {lines.map((line, index) => <div className="commerce-line-row" key={index}>
          <label className="field-label">Product<select required value={line.productId} onChange={(e) => updateLine(index, 'productId', e.target.value)}><option value="">Choose product</option>{availableProducts.map((product: Product) => <option value={product.id} key={product.id}>{product.name} · {product.sku}</option>)}</select></label>
          <label className="field-label">Quantity<input required type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e) => updateLine(index, 'quantity', e.target.value)} /></label>
          <div className="commerce-line-price"><span>{salesModule ? 'Selling price' : 'Unit cost'}</span><strong>{(() => { const product = availableProducts.find((p) => p.id === line.productId); const amount = salesModule ? product?.sellingPriceMinor : product?.costPriceMinor; return amount === undefined ? '—' : money(amount, workspace.currency); })()}</strong></div>
          <button type="button" className="icon-button" aria-label="Remove line" disabled={lines.length === 1} onClick={() => removeLine(index)}><X size={16} /></button>
        </div>)}
        <div className="commerce-form-note">Prices are taken from the saved product catalogue. Confirming a sales order reserves available stock; dispatch posts the stock issue.</div>
        <div className="commerce-form-actions"><button type="button" className="button button-secondary" onClick={() => setShowCreate(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={busy || !availableProducts.length}>{busy ? 'Saving…' : 'Save draft order'} <ArrowUpRight size={15} /></button></div>
      </form>}

      {salesModule && <>
        <div className="commerce-section-title"><h4>Sales orders</h4><span>{salesOrders.length} orders</span></div>
        {salesOrdersQuery.isError ? <div className="inline-error">Could not load sales orders. {salesOrdersQuery.error instanceof Error ? salesOrdersQuery.error.message : ''}</div> : salesOrders.length === 0 ? <div className="commerce-empty">No customer orders yet. Create the first order to start the fulfilment workflow.</div> : <div className="commerce-order-list">{salesOrders.map((order) => <article className="commerce-order-card" key={order.id}>
          <div className="commerce-order-main"><div><strong>{order.orderNumber}</strong><small>{order.customerName || 'Walk-in / unlinked customer'} · {order.lines.length} lines</small></div><span className={'commerce-status ' + order.status}>{labelStatus(order.status)}</span><b>{money(order.totalMinor, workspace.currency)}</b></div>
          <div className="commerce-order-lines">{order.lines.map((line) => <span key={line.id}>{line.productName} · {line.quantityFulfilled ?? 0}/{line.quantity} fulfilled</span>)}</div>
          <div className="commerce-card-actions">{order.status === 'draft' && <button className="button button-secondary button-small" disabled={busy} onClick={() => void runAction(() => apiCommerce.confirmSalesOrder(scope, order.id), 'Sales order confirmed and stock reserved')}>Confirm & reserve stock</button>}{['confirmed','partially_fulfilled'].includes(order.status) && <button className="button button-primary button-small" disabled={busy} onClick={() => openDispatch(order)}><Truck size={14} /> Pick, fulfil & dispatch</button>}{order.status === 'fulfilled' && <span className="commerce-action-note"><CheckCircle2 size={14} /> Fully fulfilled</span>}</div>
        </article>)}</div>}
      </>}

      {dispatchOrder && <form className="commerce-create-form commerce-receipt-form" onSubmit={postDispatch}>
        <div className="commerce-lines-heading"><div><strong>Pick and dispatch · {dispatchOrder.orderNumber}</strong><p>Enter the quantity leaving this branch for each line. You can dispatch part of an order now and the remainder later.</p></div><button type="button" className="icon-button" aria-label="Close fulfilment" onClick={() => setDispatchOrder(null)}><X size={17}/></button></div>
        {dispatchDraft.map((line,index)=><div className="commerce-receipt-row commerce-dispatch-row" key={line.orderLineId}><div><strong>{line.productName}</strong><small>{line.remaining} still to fulfil</small></div><label className="field-label">Quantity to dispatch<input type="number" min="0" max={line.remaining} step="0.001" value={line.quantity} onChange={(e)=>setDispatchDraft((current)=>current.map((r,i)=>i===index?{...r,quantity:e.target.value}:r))}/></label></div>)}
        <div className="commerce-form-actions"><button type="button" className="button button-secondary" onClick={()=>setDispatchOrder(null)}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy?'Dispatching…':'Confirm dispatch'} <Truck size={15}/></button></div>
      </form>}

      {purchaseModule && <>
        <div className="commerce-section-title"><h4>Purchase orders</h4><span>{purchaseOrders.length} orders</span></div>
        {purchaseOrdersQuery.isError ? <div className="inline-error">Could not load purchase orders. {purchaseOrdersQuery.error instanceof Error ? purchaseOrdersQuery.error.message : ''}</div> : purchaseOrders.length === 0 ? <div className="commerce-empty">No supplier orders yet. Create a purchase order and place it before receiving goods.</div> : <div className="commerce-order-list">{purchaseOrders.map((order) => <article className="commerce-order-card" key={order.id}>
          <div className="commerce-order-main"><div><strong>{order.orderNumber}</strong><small>{order.supplierName} · {order.lines.length} lines</small></div><span className={'commerce-status ' + order.status}>{labelStatus(order.status)}</span><b>{money(order.totalMinor, workspace.currency)}</b></div>
          <div className="commerce-order-lines">{order.lines.map((line) => <span key={line.id}>{line.productName} · {line.quantityAccepted ?? 0} accepted, {line.quantityRejected ?? 0} rejected of {line.quantity}</span>)}</div>
          <div className="commerce-card-actions">{order.status === 'draft' && <button className="button button-secondary button-small" disabled={busy} onClick={() => void runAction(() => apiCommerce.orderPurchaseOrder(scope, order.id), 'Purchase order sent to supplier')}>Place order</button>}{['ordered','partially_received'].includes(order.status) && <button className="button button-primary button-small" disabled={busy} onClick={() => openReceipt(order)}><ArrowDownToLine size={14} /> Record goods receipt</button>}{order.status === 'received' && <span className="commerce-action-note"><CheckCircle2 size={14} /> Fully received</span>}</div>
        </article>)}</div>}
        {receivingOrder && <form className="commerce-create-form commerce-receipt-form" onSubmit={postReceipt}>
          <div className="commerce-lines-heading"><div><strong>Count goods received · {receivingOrder.orderNumber}</strong><p>Only accepted quantities enter the stock ledger. Rejected quantities remain out of stock.</p></div><button type="button" className="icon-button" aria-label="Close receipt" onClick={() => setReceivingOrder(null)}><X size={17} /></button></div>
          {receiptDraft.map((line,index)=><div className="commerce-receipt-row" key={line.orderLineId}><div><strong>{line.productName}</strong><small>{line.remaining} accepted still outstanding</small></div><label className="field-label">Accepted<input type="number" min="0" max={line.remaining} step="0.001" value={line.acceptedQuantity} onChange={(e)=>setReceiptDraft((current)=>current.map((r,i)=>i===index?{...r,acceptedQuantity:e.target.value}:r))}/></label><label className="field-label">Rejected<input type="number" min="0" max={line.remaining} step="0.001" value={line.rejectedQuantity} onChange={(e)=>setReceiptDraft((current)=>current.map((r,i)=>i===index?{...r,rejectedQuantity:e.target.value}:r))}/></label><label className="field-label">Batch / lot<input value={line.batchNumber} onChange={(e)=>setReceiptDraft((current)=>current.map((r,i)=>i===index?{...r,batchNumber:e.target.value}:r))}/></label><label className="field-label">Expiry date<input type="date" value={line.expiryDate} onChange={(e)=>setReceiptDraft((current)=>current.map((r,i)=>i===index?{...r,expiryDate:e.target.value}:r))}/></label><label className="field-label">Rejection note<input value={line.rejectionReason} onChange={(e)=>setReceiptDraft((current)=>current.map((r,i)=>i===index?{...r,rejectionReason:e.target.value}:r))}/></label></div>)}
          <label className="field-label">Receipt note<textarea rows={2} value={receiptReason} onChange={(e)=>setReceiptReason(e.target.value)} placeholder="Delivery note, condition, or discrepancy"/></label>
          <div className="commerce-form-actions"><button type="button" className="button button-secondary" onClick={()=>setReceivingOrder(null)}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy?'Posting…':'Post counted receipt'} <PackageCheck size={15}/></button></div>
        </form>}
      </>}

      {deliveryModule && <>
        <div className="commerce-section-title"><h4>Dispatch register</h4><span>{deliveries.length} deliveries</span></div>
        {deliveriesQuery.isError ? <div className="inline-error">Could not load deliveries. {deliveriesQuery.error instanceof Error ? deliveriesQuery.error.message : ''}</div> : deliveries.length === 0 ? <div className="commerce-empty">Dispatched orders appear here when fulfilment posts their stock movements and creates a delivery.</div> : <div className="commerce-order-list">{deliveries.map((delivery) => <article className="commerce-order-card" key={delivery.id}><div className="commerce-order-main"><div><strong>{delivery.deliveryNumber}</strong><small>{delivery.salesOrderNumber} · {delivery.fulfilmentNumber} · {delivery.recipientName || 'Recipient not set'}{delivery.courier ? ` · ${delivery.courier}` : ''}{delivery.expectedDate ? ` · ETA ${delivery.expectedDate.slice(0,10)}` : ''}</small></div><span className={'commerce-status ' + delivery.status}>{labelStatus(delivery.status)}</span><b>{new Date(delivery.dispatchedAt).toLocaleDateString()}</b></div>{delivery.deliveryAddress && <div className="commerce-order-lines">Destination: {delivery.deliveryAddress}</div>}{delivery.trackingReference && <div className="commerce-order-lines">Tracking / proof: {delivery.trackingReference}</div>}{delivery.status !== 'delivered' && <div className="commerce-card-actions"><input className="commerce-tracking-input" aria-label="Tracking or proof of delivery" placeholder="Tracking / proof reference" value={deliveryRefs[delivery.id] ?? delivery.trackingReference ?? ''} onChange={(e)=>setDeliveryRefs((current)=>({...current,[delivery.id]:e.target.value}))}/>{(delivery.status==='dispatched'||delivery.status==='delivery_failed') && <button className="button button-secondary button-small" disabled={busy} onClick={()=>void runAction(()=>apiCommerce.updateDelivery(scope,delivery.id,{status:'in_transit',...(deliveryRefs[delivery.id] ? {trackingReference:deliveryRefs[delivery.id]} : {})}),delivery.status==='delivery_failed'?'Delivery retry started':'Delivery marked in transit')}>{delivery.status==='delivery_failed'?'Retry delivery':'In transit'}</button>}<button className="button button-primary button-small" disabled={busy || !(deliveryRefs[delivery.id] ?? delivery.trackingReference ?? '').trim()} onClick={()=>void runAction(()=>apiCommerce.updateDelivery(scope,delivery.id,{status:'delivered',...(deliveryRefs[delivery.id] ? {trackingReference:deliveryRefs[delivery.id]} : {})}),'Delivery closed with proof reference')}>Mark delivered</button><button className="button button-secondary button-small" disabled={busy} onClick={()=>void runAction(()=>apiCommerce.updateDelivery(scope,delivery.id,{status:'delivery_failed',...(deliveryRefs[delivery.id] ? {trackingReference:deliveryRefs[delivery.id]} : {})}),'Delivery exception recorded')}>Delivery failed</button></div>}</article>)}</div>}
      </>}

      {leadModule && <>
        <div className="commerce-section-title"><h4>Qualified leads</h4><span>{leads.length} records</span></div>
        {leadQuery.isError ? <div className="inline-error">Could not load CRM leads.</div> : leads.length===0 ? <div className="commerce-empty">Create a lead in the register before converting it to a customer account.</div> : <div className="commerce-order-list">{leads.map((lead:PreviewRecord)=><article className="commerce-order-card" key={lead.id}><div className="commerce-order-main"><div><strong>{lead.company||lead.name||lead.leadName||lead.id}</strong><small>{lead.email||lead.phone||'No contact details recorded'}</small></div><span className={'commerce-status '+(lead.status==='Converted'?'fulfilled':'draft')}>{lead.status}</span></div><div className="commerce-card-actions">{lead.status!=='Converted' && <button className="button button-primary button-small" disabled={busy} onClick={()=>void runAction(()=>apiCommerce.convertLead(scope,lead.id),'Lead converted to a customer account') }><UserRoundCheck size={14}/> Convert to customer</button>}</div></article>)}</div>}
      </>}

      {(customerModule || supplierModule) && <>
        <div className="commerce-section-title"><h4>{customerModule?'Customer sales orders':'Supplier purchase orders'}</h4><span>{(customerModule?salesOrders:purchaseOrders).length} orders</span></div>
        {(customerModule?salesOrders:purchaseOrders).filter((order)=>customerModule?Boolean(order.customerName):Boolean(order.supplierName)).slice(0,15).map((order)=><article className="commerce-order-card" key={order.id}><div className="commerce-order-main"><div><strong>{order.orderNumber}</strong><small>{order.lines.length} product lines</small></div><span className={'commerce-status '+order.status}>{labelStatus(order.status)}</span><b>{money(order.totalMinor,workspace.currency)}</b></div></article>)}
        <p className="commerce-form-note">Select a record in the register to see its cross-module links in the record detail panel. This section shows branch-level transaction history.</p>
      </>}
    </section>
  );
}
