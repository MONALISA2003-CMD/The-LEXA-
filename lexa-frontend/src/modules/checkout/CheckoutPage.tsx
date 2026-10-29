import { moduleAccentForPath } from '../../domain/shared/moduleAccents';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Barcode, CheckCircle2, Minus, Plus, Search, ShoppingBag, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import { inventory, products } from '../../data/repositories';
import { salesWorkflow } from '../../data/providers';
import { formatMinorAmount, minorUnitFactor, parseMajorAmount } from '../../domain/money/money';
import type { PaymentMethod } from '../../domain/shared/types';
import { dataProviderMode } from '../../data/remote/runtimeConfig';
import { BarcodeCapture } from '../../components/barcode/BarcodeCapture';

const paymentMethods: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' }, { value: 'mtn_momo', label: 'MTN Mobile Money' },
  { value: 'airtel_money', label: 'Airtel Money' }, { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'card_recorded', label: 'Card (recorded externally)' }, { value: 'other', label: 'Other' },
];

type PaymentLineDraft = { id: string; method: PaymentMethod; amount: string; reference: string };

export default function CheckoutPage() {
  const { workspace, branch } = useWorkspace();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState('');
  const [paymentLines, setPaymentLines] = useState<PaymentLineDraft[]>([{ id: 'payment-line-initial', method: 'cash', amount: '0', reference: '' }]);
  const [customerPhone, setCustomerPhone] = useState('');
  const [promisedPaymentDate, setPromisedPaymentDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const productQuery = useQuery({ queryKey: ['products', workspace.id], queryFn: () => products.list({ workspaceId: workspace.id, activeOnly: true }) });
  const balanceQuery = useQuery({ queryKey: ['inventory-balances', workspace.id, branch.id], queryFn: () => inventory.getBalances({ workspaceId: workspace.id, branchId: branch.id }) });
  const productsList = productQuery.data ?? [];
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return productsList.filter((product) => {
      if (!needle) return true;
      return product.name.toLocaleLowerCase().includes(needle) || product.sku.toLocaleLowerCase().includes(needle) || (product.barcode ?? '').toLocaleLowerCase().includes(needle);
    }).filter((product) => !product.trackStock || (balanceQuery.data?.get(product.id) ?? 0) > 0);
  }, [productsList, search, balanceQuery.data]);
  const cartLines = useMemo(() => Object.entries(cart).map(([productId, quantity]) => {
    const product = productsList.find((item) => item.id === productId);
    if (!product) return null;
    return { product, quantity, lineTotalMinor: product.sellingPriceMinor * quantity, stock: balanceQuery.data?.get(product.id) ?? 0 };
  }).filter((item) => item !== null), [cart, productsList, balanceQuery.data]);
  const totalMinor = cartLines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  const factor = minorUnitFactor(workspace.currency);
  const paymentAllocatedMinor = paymentLines.reduce((sum, line) => { try { return sum + parseMajorAmount(line.amount || '0', workspace.currency); } catch { return sum; } }, 0);
  const creditDueMinor = totalMinor - paymentAllocatedMinor;

  useEffect(() => { setPaymentLines((current) => current.length === 1 && current[0] ? [{ ...current[0], amount: String(totalMinor / factor) }] : current); }, [totalMinor, factor]);
  useEffect(() => { setCart({}); setCustomerName(''); setCustomerPhone(''); setPromisedPaymentDate(''); setPaymentLines([{ id: 'payment-line-' + Date.now(), method: 'cash', amount: '0', reference: '' }]); }, [workspace.id, branch.id]);


  async function handleScannedProduct(code: string) {
    setSearch(code);
    const normalized = code.trim().toLocaleLowerCase();
    const exact = productsList.filter((product) => product.active && (product.barcode?.trim().toLocaleLowerCase() === normalized || product.sku.trim().toLocaleLowerCase() === normalized));
    if (exact.length === 1) {
      addToCart(exact[0]!.id);
      return;
    }
    if (exact.length > 1) {
      toast.error('Barcode is not unique', { description: 'Ask an administrator to resolve duplicate barcode/SKU records before checkout.' });
      return;
    }
    toast.error('Product code not found', { description: 'The code was searched against the current product catalogue. Verify the barcode or add the product first.' });
  }

  function addToCart(productId: string) {
    const product = productsList.find((item) => item.id === productId);
    if (!product) return;
    const current = cart[productId] ?? 0;
    const available = balanceQuery.data?.get(productId) ?? 0;
    if (product.trackStock && current + 1 > available) {
      toast.error('Not enough stock', { description: `${product.name} has ${available - current} more unit${available - current === 1 ? '' : 's'} available.` });
      return;
    }
    setCart((value) => ({ ...value, [productId]: (value[productId] ?? 0) + 1 }));
  }

  function setQuantity(productId: string, nextQuantity: number) {
    if (nextQuantity <= 0) {
      setCart((value) => { const next = { ...value }; delete next[productId]; return next; });
      return;
    }
    const product = productsList.find((item) => item.id === productId);
    const available = balanceQuery.data?.get(productId) ?? 0;
    if (product?.trackStock && nextQuantity > available) {
      toast.error(`Only ${available} available`, { description: product.name });
      return;
    }
    setCart((value) => ({ ...value, [productId]: nextQuantity }));
  }

  function addPaymentLine() {
    const currentTotal = paymentLines.reduce((sum, line) => { try { return sum + parseMajorAmount(line.amount || '0', workspace.currency); } catch { return sum; } }, 0);
    const remaining = Math.max(0, totalMinor - currentTotal);
    setPaymentLines((current) => [...current, { id: 'payment-line-' + Date.now() + '-' + current.length, method: 'mtn_momo', amount: String(remaining / factor), reference: '' }]);
  }

  function updatePaymentLine(lineId: string, changes: Partial<PaymentLineDraft>) {
    setPaymentLines((current) => current.map((line) => line.id === lineId ? { ...line, ...changes } : line));
  }

  function removePaymentLine(lineId: string) {
    setPaymentLines((current) => current.length > 1 ? current.filter((line) => line.id !== lineId) : current);
  }

  async function completeSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cartLines.length) { toast.error('Your cart is empty. Add an item first.'); return; }
    let payments: Array<{ method: PaymentMethod; amountMinor: number; reference?: string }>;
    try {
      payments = paymentLines.map((line) => ({
        method: line.method,
        amountMinor: parseMajorAmount(line.amount || '0', workspace.currency),
        ...(line.reference.trim() ? { reference: line.reference.trim() } : {}),
      })).filter((payment) => payment.amountMinor > 0);
    } catch (error) {
      toast.error('Check payment amounts', { description: error instanceof Error ? error.message : 'One of the payment amounts is invalid.' });
      return;
    }
    const allocatedMinor = payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
    if (allocatedMinor > totalMinor) { toast.error('Recorded payments cannot exceed the sale total.'); return; }
    const creditMinor = totalMinor - allocatedMinor;
    if (creditMinor > 0 && (!customerName.trim() || !customerPhone.trim())) {
      toast.error('Credit sales need a named customer and phone number', { description: 'Record the customer details before saving any unpaid balance.' });
      return;
    }
    if (creditMinor > 0 && promisedPaymentDate && promisedPaymentDate < new Date().toISOString().slice(0, 10)) {
      toast.error('Promised payment date cannot be in the past.'); return;
    }
    setSubmitting(true);
    try {
      const result = await salesWorkflow.completeSale({
        workspaceId: workspace.id,
        branchId: branch.id,
        items: cartLines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
        payments,
        ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
        ...(creditMinor > 0 && customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
        ...(creditMinor > 0 ? { promisedPaymentDate: promisedPaymentDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) } : {}),
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['products', workspace.id] }),
        client.invalidateQueries({ queryKey: ['inventory-balances', workspace.id, branch.id] }),
        client.invalidateQueries({ queryKey: ['inventory-movements', workspace.id, branch.id] }),
        client.invalidateQueries({ queryKey: ['sales', workspace.id] }),
        client.invalidateQueries({ queryKey: ['dashboard', workspace.id, branch.id] }),
      ]);
      setCart({}); setCustomerName(''); setCustomerPhone(''); setPromisedPaymentDate('');
      setPaymentLines([{ id: 'payment-line-' + Date.now(), method: 'cash', amount: '0', reference: '' }]);
      toast.success('Sale recorded', { description: `Receipt ${result.sale.receiptNumber} ${dataProviderMode === 'api' ? 'saved to the LEXA backend' : 'saved on this device'}${creditMinor > 0 ? '; customer credit remains outstanding.' : '.'}` });
      navigate(`/sales/${result.sale.id}`);
    } catch (error) {
      toast.error('Sale was not completed', { description: error instanceof Error ? error.message : 'No sale records were committed. Check the cart and try again.' });
    } finally { setSubmitting(false); }
  }

  return (
    <div className="page-stack checkout-page" data-module-accent={moduleAccentForPath("/checkout")}>
      <div className="page-heading-row"><div><div className="eyebrow eyebrow-blue">POINT OF SALE</div><h2>Checkout</h2><p>Build a cart, record payment received, and save a traceable receipt.</p></div><div className="soft-badge"><span className="status-dot" /> {branch.name}</div></div>
      <div className="checkout-layout">
        <section className="section-card product-picker-card"><div className="checkout-section-heading"><div><h3>Choose products</h3><p>Only products with stock are shown when inventory is tracked.</p></div><span className="round-icon"><ShoppingBag size={17} /></span></div><label className="search-field product-search"><Search size={17} /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product or scan SKU" aria-label="Search products for checkout" /><Barcode size={16} className="search-trailing-icon" /></label>
          <BarcodeCapture compact autoResolve label="Scan an item into checkout" onCode={handleScannedProduct} />
          {productQuery.isLoading ? <div className="loading-state">Loading product catalogue…</div> : filtered.length === 0 ? <div className="empty-state"><div className="empty-icon"><PackageIcon /></div><h3>{productsList.length === 0 ? 'No products yet' : 'No products match'}</h3><p>{productsList.length === 0 ? 'Add a product from the catalogue, then record opening stock before checkout.' : 'Check the search term or add stock in Inventory.'}</p><button type="button" className="button button-secondary" onClick={() => navigate('/products')}>{productsList.length === 0 ? 'Open products' : 'Manage products'}</button></div> : <div className="checkout-product-grid">{filtered.map((product) => { const stock = balanceQuery.data?.get(product.id) ?? 0; return <button key={product.id} className="checkout-product" onClick={() => addToCart(product.id)}><span className="checkout-product-icon"><PackageIcon /></span><span className="checkout-product-name">{product.name}</span><span className="checkout-product-sku">{product.sku}</span><span className="checkout-product-bottom"><strong>{formatMinorAmount(product.sellingPriceMinor, workspace.currency)}</strong><small>{product.trackStock ? `${stock} in stock` : 'Non-stock item'}</small></span><span className="add-product-plus"><Plus size={16} /></span></button>; })}</div>}
        </section>
        <section className="section-card cart-card"><div className="checkout-section-heading"><div><h3>Current sale</h3><p>{cartLines.length} {cartLines.length === 1 ? 'line item' : 'line items'}</p></div><span className="cart-count">{cartLines.reduce((sum, line) => sum + line.quantity, 0)}</span></div>
          {cartLines.length === 0 ? <div className="cart-empty"><div className="cart-empty-icon"><ShoppingBag size={22} /></div><strong>Your cart is empty</strong><span>Select a product to begin a sale.</span></div> : <div className="cart-line-list">{cartLines.map(({ product, quantity, lineTotalMinor }) => <div className="cart-line" key={product.id}><div className="cart-line-main"><strong>{product.name}</strong><span>{formatMinorAmount(product.sellingPriceMinor, workspace.currency)} each</span></div><div className="quantity-control"><button aria-label={`Remove one ${product.name}`} onClick={() => setQuantity(product.id, quantity - 1)}><Minus size={13} /></button><span>{quantity}</span><button aria-label={`Add one ${product.name}`} onClick={() => setQuantity(product.id, quantity + 1)}><Plus size={13} /></button></div><strong className="cart-line-total">{formatMinorAmount(lineTotalMinor, workspace.currency)}</strong><button className="icon-button remove-line" aria-label={`Remove ${product.name} from cart`} onClick={() => setQuantity(product.id, 0)}><Trash2 size={15} /></button></div>)}</div>}
          <form onSubmit={completeSale} className="checkout-form"><div className="total-row"><span>Sale total</span><strong>{formatMinorAmount(totalMinor, workspace.currency)}</strong></div><label className="field-label">Customer name {creditDueMinor > 0 ? <span className="required-mark">REQUIRED FOR CREDIT</span> : <span className="optional-label">OPTIONAL</span>}<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Walk-in customer" required={creditDueMinor > 0} /></label><label className="field-label">Customer phone {creditDueMinor > 0 && <span className="required-mark">REQUIRED FOR CREDIT</span>}<input type="tel" inputMode="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="e.g. 07XX XXX XXX" required={creditDueMinor > 0} /></label><div style={{ display: 'grid', gap: 10 }}><div><strong>Payment lines</strong><p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 11 }}>Split a sale between cash, MTN MoMo, Airtel Money, bank or other recorded methods.</p></div>{paymentLines.map((line, index) => <div key={line.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, display: 'grid', gap: 10 }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><strong>Payment {index + 1}</strong>{paymentLines.length > 1 && <button type="button" className="button button-secondary button-small" onClick={() => removePaymentLine(line.id)}>Remove line</button>}</div><div className="form-two-col"><label className="field-label">Method<select value={line.method} onChange={(event) => updatePaymentLine(line.id, { method: event.target.value as PaymentMethod })}>{paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label><label className="field-label">Amount received ({workspace.currency})<input inputMode="decimal" type="number" min="0" step={factor === 1 ? '1' : '0.01'} value={line.amount} onChange={(event) => updatePaymentLine(line.id, { amount: event.target.value })} required /></label></div><label className="field-label">Payment reference <span className="optional-label">OPTIONAL</span><input value={line.reference} onChange={(event) => updatePaymentLine(line.id, { reference: event.target.value })} placeholder="Transaction ID / receipt ref" /></label></div>)}<button type="button" className="button button-secondary" onClick={addPaymentLine}><Plus size={14} /> Add split-payment line</button><div className="payment-footnote"><Wallet size={16} /><span>Recorded payments: {formatMinorAmount(paymentAllocatedMinor, workspace.currency)} · {creditDueMinor > 0 ? `Credit due: ${formatMinorAmount(creditDueMinor, workspace.currency)}` : creditDueMinor < 0 ? `Overpaid by ${formatMinorAmount(Math.abs(creditDueMinor), workspace.currency)} — reduce the payment lines.` : 'Fully paid'}. LEXA only records methods; no external transfer is initiated.</span></div>{creditDueMinor > 0 && <label className="field-label">Promised payment date <span className="optional-label">OPTIONAL</span><input type="date" min={new Date().toISOString().slice(0, 10)} value={promisedPaymentDate} onChange={(event) => setPromisedPaymentDate(event.target.value)} /></label>}</div><div className="payment-footnote"><Wallet size={16} /><span>LEXA records the amount you say was received. It does not initiate or confirm an external transfer. Unpaid balance remains visible on the sale.</span></div><button className="button button-primary button-wide complete-sale-button" type="submit" disabled={submitting || cartLines.length === 0}>{submitting ? 'Saving sale…' : 'Complete sale & create receipt'} <CheckCircle2 size={17} /></button><div className="checkout-secure-note">Sale, items, payment record and stock movements save together.</div></form>
        </section>
      </div>
    </div>
  );
}

function PackageIcon() {
  return <ShoppingBag size={18} strokeWidth={1.8} />;
}
