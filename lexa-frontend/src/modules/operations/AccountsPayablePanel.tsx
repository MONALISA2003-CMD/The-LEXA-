import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BadgeCheck, CalendarDays, CheckCircle2, FilePlus2, ReceiptText, Wallet } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { apiPayables, type PayablesInvoice } from '../../data/remote/apiPayables';
import './accounts-payable.css';

function digits(currency: string) {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0; }
  catch { return 0; }
}
function factor(currency: string) { return 10 ** digits(currency); }
function money(minor: number, currency: string) {
  return new Intl.NumberFormat('en-UG', { style: 'currency', currency, maximumFractionDigits: digits(currency) }).format(minor / factor(currency));
}
function toMinor(majorValue: string, currency: string) {
  const n = Number(majorValue);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * factor(currency));
}
function localDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
}
function statusLabel(value: string) { return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()); }

export default function AccountsPayablePanel() {
  const { workspace, branch } = useWorkspace();
  const client = useQueryClient();
  const scope = { workspaceId: workspace.id, branchId: branch.id };
  const currency = workspace.currency;
  const purchaseOrdersQuery = useQuery({ queryKey: ['ap-purchase-orders', workspace.id, branch.id], queryFn: () => apiPayables.purchaseOrders(scope) });
  const invoicesQuery = useQuery({ queryKey: ['ap-invoices', workspace.id, branch.id], queryFn: () => apiPayables.invoices(scope) });
  const paymentsQuery = useQuery({ queryKey: ['ap-payments', workspace.id, branch.id], queryFn: () => apiPayables.payments(scope) });
  const summaryQuery = useQuery({ queryKey: ['ap-summary', workspace.id, branch.id], queryFn: () => apiPayables.summary(scope) });
  const reconciliationQuery = useQuery({ queryKey: ['ap-reconciliation', workspace.id, branch.id], queryFn: () => apiPayables.reconciliation(scope) });
  const orders = purchaseOrdersQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const payments = paymentsQuery.data ?? [];
  const summary = summaryQuery.data;

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [billDate, setBillDate] = useState(localDate());
  const [dueDate, setDueDate] = useState(localDate());
  const [taxValue, setTaxValue] = useState('0');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [unitCosts, setUnitCosts] = useState<Record<string, string>>({});
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentSupplier, setPaymentSupplier] = useState('');
  const [paymentDate, setPaymentDate] = useState(localDate());
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [paymentAccount, setPaymentAccount] = useState('Main bank account');
  const [paymentReference, setPaymentReference] = useState('');
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const selectedOrder = useMemo(() => orders.find(order => order.id === selectedOrderId), [orders, selectedOrderId]);
  const supplierKey = (invoice: PayablesInvoice) => invoice.supplierRecordId ? `id:${invoice.supplierRecordId}` : `name:${invoice.supplierName.trim().toLowerCase()}`;
  const payableInvoices = invoices.filter(invoice => ['approved', 'partially_paid', 'overdue'].includes(invoice.status) && invoice.balanceDueMinor > 0);
  const supplierOptions = [...new Map(payableInvoices.map(invoice => [supplierKey(invoice), { key: supplierKey(invoice), name: invoice.supplierName }])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const supplierInvoices = payableInvoices.filter(invoice => supplierKey(invoice) === paymentSupplier);
  const suppliers = supplierOptions.map(supplier => supplier.key);
  const allocationTotal = supplierInvoices.reduce((sum, invoice) => sum + toMinor(allocations[invoice.id] ?? '', currency), 0);

  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['ap-purchase-orders', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['ap-invoices', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['ap-payments', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['ap-summary', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['ap-reconciliation', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['module-register', workspace.id, branch.id, 'purchase-invoices'] }),
      client.invalidateQueries({ queryKey: ['module-register', workspace.id, branch.id, 'purchases'] }),
    ]);
  }

  function chooseOrder(id: string) {
    setSelectedOrderId(id);
    const order = orders.find(item => item.id === id);
    setQuantities(Object.fromEntries((order?.receiptLines ?? []).map(line => [line.receiptLineId, String(line.availableQuantity)])));
    setUnitCosts(Object.fromEntries((order?.receiptLines ?? []).map(line => [line.receiptLineId, String(line.unitCostMinor / factor(currency))])));
  }

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;
    const lines = selectedOrder.receiptLines.map(line => {
      const quantity = Number(quantities[line.receiptLineId] ?? 0);
      const rawUnitCost = unitCosts[line.receiptLineId] ?? String(line.unitCostMinor / factor(currency));
      return { receiptLineId: line.receiptLineId, quantity, unitCostMinor: toMinor(rawUnitCost, currency), unitCostValid: rawUnitCost.trim() !== '' && Number.isFinite(Number(rawUnitCost)) && Number(rawUnitCost) >= 0 };
    }).filter(line => line.quantity > 0);
    if (!lines.length || lines.some(line => !Number.isFinite(line.quantity) || !line.unitCostValid || !Number.isSafeInteger(line.unitCostMinor) || line.unitCostMinor < 0)) { toast.error('Enter valid quantities and supplier unit costs for at least one accepted receipt line.'); return; }
    setBusy(true);
    try {
      const result = await apiPayables.createInvoice(scope, { purchaseOrderId: selectedOrder.id, supplierInvoiceNumber: supplierInvoiceNumber.trim(), billDate, dueDate, taxMinor: toMinor(taxValue, currency), ...(invoiceNotes.trim() ? { notes: invoiceNotes.trim() } : {}), lines: lines.map(line => ({ receiptLineId: line.receiptLineId, quantity: line.quantity, unitCostMinor: line.unitCostMinor })) });
      toast.success('Supplier bill saved', { description: `${result.invoiceNumber} · ${money(result.totalMinor, currency)}` });
      setCreateOpen(false); setSelectedOrderId(''); setSupplierInvoiceNumber(''); setTaxValue('0'); setInvoiceNotes(''); setQuantities({}); setUnitCosts({}); await refresh();
    } catch (error) { toast.error('Supplier bill not saved', { description: error instanceof Error ? error.message : 'Check the bill details and try again.' }); }
    finally { setBusy(false); }
  }

  async function runInvoiceAction(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try { await action(); toast.success(success); await refresh(); }
    catch (error) { toast.error('Invoice was not updated', { description: error instanceof Error ? error.message : 'Check the invoice and retry.' }); }
    finally { setBusy(false); }
  }

  function openPayment() {
    const preferred = suppliers[0] ?? '';
    setPaymentSupplier(preferred); setPaymentDate(localDate()); setPaymentAccount('Main bank account'); setAllocations({}); setPaymentOpen(true);
  }

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const paymentAllocations = supplierInvoices.map(invoice => ({ invoiceId: invoice.id, amountMinor: toMinor(allocations[invoice.id] ?? '', currency) })).filter(item => item.amountMinor > 0);
    if (!paymentAllocations.length) { toast.error('Allocate an amount to at least one invoice.'); return; }
    if (paymentAllocations.some(item => item.amountMinor > (supplierInvoices.find(invoice => invoice.id === item.invoiceId)?.balanceDueMinor ?? 0))) { toast.error('An allocation exceeds its invoice balance.'); return; }
    setBusy(true);
    try {
      const result = await apiPayables.recordPayment(scope, { paymentDate, method: paymentMethod, account: paymentAccount, ...(paymentReference.trim() ? { reference: paymentReference.trim() } : {}), allocations: paymentAllocations });
      toast.success('Supplier payment recorded', { description: `${result.paymentNumber} · ${money(result.amountMinor, currency)} allocated` });
      setPaymentOpen(false); setAllocations({}); setPaymentReference(''); await refresh();
    } catch (error) { toast.error('Payment was not recorded', { description: error instanceof Error ? error.message : 'Check the allocations and try again.' }); }
    finally { setBusy(false); }
  }

  const loading = purchaseOrdersQuery.isLoading || invoicesQuery.isLoading || summaryQuery.isLoading;
  const error = purchaseOrdersQuery.error ?? invoicesQuery.error ?? summaryQuery.error;

  return (
    <section className="ap-workspace">
      <header className="ap-header"><div><span className="eyebrow eyebrow-blue">PROCUREMENT & FINANCE</span><h3>Supplier invoices & accounts payable</h3><p>Manage supplier bills, approvals, payment allocations and purchase reconciliation.</p></div><div className="ap-header-actions"><button className="button button-secondary" type="button" onClick={openPayment} disabled={!payableInvoices.length}><Wallet size={15}/> Record payment</button><button className="button button-primary" type="button" onClick={() => setCreateOpen(value => !value)} disabled={!orders.length}><FilePlus2 size={15}/> New supplier bill</button></div></header>

      {error && <div className="inline-error" role="alert">{error instanceof Error ? error.message : 'Could not load supplier payables.'}</div>}
      {loading ? <div className="loading-state">Loading supplier accounts…</div> : <>
        <div className="ap-metrics">
          <article><span>Outstanding payable</span><strong>{money(summary?.outstandingMinor ?? 0, currency)}</strong><small>{summary?.openCount ?? 0} open bills</small></article>
          <article><span>Overdue</span><strong>{money(summary?.overdueMinor ?? 0, currency)}</strong><small>{summary?.overdueCount ?? 0} overdue bills</small></article>
          <article><span>Not yet due</span><strong>{money(summary?.currentMinor ?? 0, currency)}</strong><small>Current balance</small></article>
          <article><span>Supplier bills</span><strong>{summary?.invoiceCount ?? 0}</strong><small>{invoices.length} listed records</small></article>
        </div>

        <section className="ap-card"><div className="ap-section-heading"><div><h4>Payables ageing</h4><p>Outstanding supplier balances by due date.</p></div><CalendarDays size={18}/></div>
          <div className="ap-ageing-grid"><div><span>Current</span><strong>{money(summary?.currentMinor ?? 0, currency)}</strong></div><div><span>1–30 days</span><strong>{money(summary?.days1to30Minor ?? 0, currency)}</strong></div><div><span>31–60 days</span><strong>{money(summary?.days31to60Minor ?? 0, currency)}</strong></div><div><span>61–90 days</span><strong>{money(summary?.days61to90Minor ?? 0, currency)}</strong></div><div><span>Over 90 days</span><strong>{money(summary?.over90Minor ?? 0, currency)}</strong></div></div>
        </section>

        {createOpen && <form className="ap-card ap-form" onSubmit={(event) => void createInvoice(event)}>
          <div className="ap-section-heading"><div><h4>Enter supplier bill</h4><p>Choose a purchase order and match the bill to accepted receipt quantities.</p></div><button type="button" className="button button-secondary button-small" onClick={() => setCreateOpen(false)}>Close</button></div>
          <div className="ap-form-grid">
            <label className="field-label ap-span-2">Purchase order<select required value={selectedOrderId} onChange={event => chooseOrder(event.target.value)}><option value="">Select a purchase order</option>{orders.map(order => <option key={order.id} value={order.id}>{order.orderNumber} · {order.supplierName} · {order.receiptLines.length} receipt lines</option>)}</select></label>
            <label className="field-label">Supplier bill number<input required maxLength={100} value={supplierInvoiceNumber} onChange={event => setSupplierInvoiceNumber(event.target.value)} placeholder="Supplier's invoice reference"/></label>
            <label className="field-label">Bill date<input required type="date" value={billDate} onChange={event => setBillDate(event.target.value)}/></label>
            <label className="field-label">Due date<input required type="date" min={billDate} value={dueDate} onChange={event => setDueDate(event.target.value)}/></label>
            <label className="field-label">Tax amount ({currency})<input type="number" min="0" step={digits(currency) === 0 ? '1' : '0.01'} value={taxValue} onChange={event => setTaxValue(event.target.value)}/></label>
          </div>
          {selectedOrder && <div className="ap-receipt-lines"><div className="ap-receipt-lines-heading"><strong>Accepted goods receipt lines</strong><span>{selectedOrder.orderNumber} · {selectedOrder.supplierName}</span></div>
            {selectedOrder.receiptLines.map(line => <div className="ap-receipt-line" key={line.receiptLineId}><div><strong>{line.productName}</strong><small>{line.receiptNumber} · {line.receiptDate ?? ''} · {line.sku}</small><small>{line.availableQuantity} units available · PO unit cost {money(line.unitCostMinor, currency)}</small></div><label className="field-label">Bill quantity<input aria-label={`Bill quantity for ${line.productName}`} type="number" min="0" max={line.availableQuantity} step="0.001" value={quantities[line.receiptLineId] ?? '0'} onChange={event => setQuantities(current => ({ ...current, [line.receiptLineId]: event.target.value }))}/></label><label className="field-label">Supplier unit cost<input aria-label={`Supplier unit cost for ${line.productName}`} type="number" min="0" step={digits(currency) === 0 ? '1' : '0.01'} value={unitCosts[line.receiptLineId] ?? String(line.unitCostMinor / factor(currency))} onChange={event => setUnitCosts(current => ({ ...current, [line.receiptLineId]: event.target.value }))}/></label></div>)}
          </div>}
          <label className="field-label">Bill description / reference details<textarea rows={2} maxLength={1000} value={invoiceNotes} onChange={event => setInvoiceNotes(event.target.value)}/></label>
          <div className="ap-form-footer"><span>Line subtotal {money((selectedOrder?.receiptLines ?? []).reduce((sum, line) => sum + Math.round(Number(quantities[line.receiptLineId] ?? 0) * toMinor(unitCosts[line.receiptLineId] ?? String(line.unitCostMinor / factor(currency)), currency)), 0), currency)} · Tax {money(toMinor(taxValue, currency), currency)}</span><button className="button button-primary" type="submit" disabled={busy || !selectedOrder}>{busy ? 'Saving…' : 'Save draft bill'} <FilePlus2 size={15}/></button></div>
        </form>}

        {paymentOpen && <form className="ap-card ap-form" onSubmit={(event) => void recordPayment(event)}>
          <div className="ap-section-heading"><div><h4>Record supplier payment</h4><p>Allocate the payment across one or more approved bills for the selected supplier.</p></div><button type="button" className="button button-secondary button-small" onClick={() => setPaymentOpen(false)}>Close</button></div>
          <div className="ap-form-grid"><label className="field-label">Supplier<select required value={paymentSupplier} onChange={event => { setPaymentSupplier(event.target.value); setAllocations({}); }}><option value="">Select supplier</option>{supplierOptions.map(supplier => <option key={supplier.key} value={supplier.key}>{supplier.name}</option>)}</select></label><label className="field-label">Payment date<input required type="date" value={paymentDate} onChange={event => setPaymentDate(event.target.value)}/></label><label className="field-label">Payment method<select required value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer (recorded)</option><option value="mtn_momo">MTN Mobile Money (recorded)</option><option value="airtel_money">Airtel Money (recorded)</option><option value="cheque">Cheque (recorded)</option><option value="card_recorded">Card (recorded)</option><option value="other">Other</option></select></label><label className="field-label">Payment account<select required value={paymentAccount} onChange={event => setPaymentAccount(event.target.value)}><option>Cash till</option><option>Main bank account</option><option>MTN Mobile Money</option><option>Airtel Money</option></select></label><label className="field-label">Payment reference<input maxLength={160} value={paymentReference} onChange={event => setPaymentReference(event.target.value)} placeholder="Bank / mobile money reference"/></label></div>
          {supplierInvoices.length > 0 ? <div className="ap-allocation-list">{supplierInvoices.map(invoice => <label className="ap-allocation-row" key={invoice.id}><span><strong>{invoice.supplierInvoiceNumber}</strong><small>{invoice.invoiceNumber} · Due {invoice.dueDate} · Balance {money(invoice.balanceDueMinor, currency)}</small></span><input aria-label={`Allocation for ${invoice.supplierInvoiceNumber}`} type="number" min="0" max={invoice.balanceDueMinor / factor(currency)} step={digits(currency) === 0 ? '1' : '0.01'} value={allocations[invoice.id] ?? ''} onChange={event => setAllocations(current => ({ ...current, [invoice.id]: event.target.value }))} placeholder="Allocation"/></label>)}</div> : <div className="ap-empty">No open bills are available for this supplier.</div>}
          <div className="ap-form-footer"><span>Payment total <strong>{money(allocationTotal, currency)}</strong></span><button className="button button-primary" type="submit" disabled={busy || allocationTotal <= 0}>{busy ? 'Recording…' : 'Record and allocate payment'} <Wallet size={15}/></button></div>
        </form>}

        <section className="ap-card"><div className="ap-section-heading"><div><h4>Supplier invoice register</h4><p>Draft bills, approvals, balances and payment status.</p></div><span className="ap-count">{invoices.length} bills</span></div>
          {invoicesQuery.isError ? <div className="inline-error">Could not load supplier bills.</div> : invoices.length === 0 ? <div className="ap-empty">Supplier bills matched to accepted goods receipts will appear here.</div> : <div className="ap-invoice-list">{invoices.map(invoice => <article className="ap-invoice-card" key={invoice.id}><div className="ap-invoice-top"><div><strong>{invoice.supplierInvoiceNumber}</strong><small>{invoice.invoiceNumber} · {invoice.supplierName} · PO {invoice.purchaseOrderNumber}</small></div><span className={`ap-status ${invoice.status}`}>{statusLabel(invoice.status)}</span></div><div className="ap-invoice-meta"><span>Bill date <b>{invoice.billDate}</b></span><span>Due date <b>{invoice.dueDate}</b></span><span>Total <b>{money(invoice.totalMinor, currency)}</b></span><span>Paid <b>{money(invoice.paidMinor, currency)}</b></span><span>Balance <b>{money(invoice.balanceDueMinor, currency)}</b></span></div>
            <details className="ap-line-details"><summary>{invoice.lines.length} matched receipt lines</summary><div>{invoice.lines.map(line => <div key={line.id}><span>{line.productName} × {line.quantity} · {line.receiptNumber}</span><b>{money(line.lineTotalMinor, currency)}</b></div>)}</div></details>
            <div className="ap-invoice-actions">{invoice.status === 'draft' && <><button type="button" className="button button-primary button-small" disabled={busy} onClick={() => void runInvoiceAction(() => apiPayables.approveInvoice(scope, invoice.id), 'Supplier invoice approved')}><BadgeCheck size={14}/> Approve bill</button><button type="button" className="button button-secondary button-small" disabled={busy} onClick={() => void runInvoiceAction(() => apiPayables.voidDraftInvoice(scope, invoice.id), 'Draft bill voided')}>Void draft</button></>}{invoice.status === 'paid' && <span className="ap-paid"><CheckCircle2 size={14}/> Fully paid</span>}</div>
          </article>)}</div>}
        </section>

        <section className="ap-card"><div className="ap-section-heading"><div><h4>Purchase and receipt reconciliation</h4><p>Compare purchase commitments, accepted receipt value, supplier bills and recorded payments.</p></div><ReceiptText size={18}/></div>
          {reconciliationQuery.isError ? <div className="inline-error">Could not load purchase reconciliation.</div> : (reconciliationQuery.data ?? []).length === 0 ? <div className="ap-empty">Purchase orders will appear here when created.</div> : <div className="ap-recon-list">{reconciliationQuery.data!.map(row => <article className="ap-recon-row" key={row.id}><div><strong>{row.purchaseOrderNumber}</strong><small>{row.supplierName} · {statusLabel(row.status)}</small></div><div><span>Received value</span><b>{money(row.receivedValueMinor, currency)}</b></div><div><span>Billed subtotal</span><b>{money(row.billedSubtotalMinor, currency)}</b></div><div><span>Unbilled received</span><b>{money(row.unbilledReceivedMinor, currency)}</b></div><div><span>Supplier price variance</span><b>{money(row.billVarianceMinor, currency)}</b></div><div><span>Paid</span><b>{money(row.paidMinor, currency)}</b></div><div><span>Payable balance</span><b>{money(row.payableBalanceMinor, currency)}</b></div></article>)}</div>}
        </section>

        <section className="ap-card"><div className="ap-section-heading"><div><h4>Supplier payment register</h4><p>Recorded payments and the invoices to which they were allocated.</p></div><span className="ap-count">{payments.length} payments</span></div>
          {paymentsQuery.isError ? <div className="inline-error">Could not load supplier payments.</div> : payments.length === 0 ? <div className="ap-empty">Supplier payments will appear here after posting.</div> : <div className="ap-payment-list">{payments.map(payment => <article className="ap-payment-row" key={payment.id}><div><strong>{payment.paymentNumber}</strong><small>{payment.supplierName} · {payment.paymentDate} · {statusLabel(payment.method)} · {payment.account}</small><small>{payment.reference || 'No external reference'}</small></div><div className="ap-payment-allocations">{payment.allocations.map(allocation => <small key={allocation.invoiceId}>{allocation.supplierInvoiceNumber} · {money(allocation.amountMinor, currency)}</small>)}</div><b>{money(payment.amountMinor, currency)}</b></article>)}</div>}
        </section>
      </>}
    </section>
  );
}
