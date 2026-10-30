import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowDownLeft, CheckCircle2, FilePlus2, FileText, RefreshCw, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import { apiReceivables, type EligibleSale, type ReceivablesInvoice } from '../../data/remote/apiReceivables';
import { isApiProvider } from '../../data/remote/runtimeConfig';
import './accounts-receivable.css';

function localDate() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function currencyScale(currency: string) {
  try { return 10 ** new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits; }
  catch { return 1; }
}
function money(minor: number, currency: string) {
  const scale = currencyScale(currency);
  return new Intl.NumberFormat('en-UG', { style: 'currency', currency, maximumFractionDigits: currency === 'UGX' ? 0 : 2 }).format(minor / scale);
}
function labelStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function asMajor(minor: number, currency: string) {
  return String(minor / currencyScale(currency));
}

export default function AccountsReceivablePanel() {
  const { workspace, branch } = useWorkspace();
  const client = useQueryClient();
  const scope = { workspaceId: workspace.id, branchId: branch.id };
  const today = localDate();
  const [issueDates, setIssueDates] = useState<Record<string, string>>({});
  const [dueDates, setDueDates] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<ReceivablesInvoice | null>(null);
  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [receiptIdempotencyKey, setReceiptIdempotencyKey] = useState('');

  const invoicesQuery = useQuery({
    queryKey: ['ar-invoices', workspace.id, branch.id],
    queryFn: () => apiReceivables.listInvoices(scope),
    enabled: isApiProvider,
  });
  const eligibleQuery = useQuery({
    queryKey: ['ar-eligible-sales', workspace.id, branch.id],
    queryFn: () => apiReceivables.listEligibleSales(scope),
    enabled: isApiProvider,
  });
  const receiptsQuery = useQuery({
    queryKey: ['ar-receipts', workspace.id, branch.id],
    queryFn: () => apiReceivables.listReceipts(scope),
    enabled: isApiProvider,
  });
  const summaryQuery = useQuery({
    queryKey: ['ar-summary', workspace.id, branch.id],
    queryFn: () => apiReceivables.summary(scope),
    enabled: isApiProvider,
  });

  const invoices = invoicesQuery.data ?? [];
  const eligibleSales = eligibleQuery.data ?? [];
  const receipts = receiptsQuery.data ?? [];
  const summary = summaryQuery.data;

  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['ar-invoices', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['ar-eligible-sales', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['ar-receipts', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['ar-summary', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['sales', workspace.id] }),
      client.invalidateQueries({ queryKey: ['dashboard', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['module-register', workspace.id, branch.id, 'sales-invoices'] }),
    ]);
  }

  async function createInvoice(event: FormEvent<HTMLFormElement>, sale: EligibleSale) {
    event.preventDefault();
    const issueDate = issueDates[sale.id] || today;
    const dueDate = dueDates[sale.id] || '';
    if (!dueDate) { toast.error('Choose a due date before creating the invoice.'); return; }
    if (dueDate < issueDate) { toast.error('The due date cannot be earlier than the invoice date.'); return; }
    setBusyId(sale.id);
    try {
      const invoice = await apiReceivables.createInvoice(scope, { saleId: sale.id, issueDate, dueDate });
      toast.success('Invoice draft created', { description: `${invoice.invoiceNumber} · ${money(invoice.totalMinor, workspace.currency)}` });
      await refresh();
    } catch (error) {
      toast.error('Invoice was not created', { description: error instanceof Error ? error.message : 'Check the sale and try again.' });
    } finally { setBusyId(''); }
  }

  async function issueInvoice(invoice: ReceivablesInvoice) {
    setBusyId(invoice.id);
    try {
      const issued = await apiReceivables.issueInvoice(scope, invoice.id);
      toast.success('Customer invoice issued', { description: `${issued.invoiceNumber} · ${money(issued.balanceDueMinor, workspace.currency)} outstanding` });
      await refresh();
    } catch (error) {
      toast.error('Invoice was not issued', { description: error instanceof Error ? error.message : 'Check the invoice and try again.' });
    } finally { setBusyId(''); }
  }

  async function voidInvoice(invoice: ReceivablesInvoice) {
    if (!window.confirm(`Void draft invoice ${invoice.invoiceNumber}? The completed sale will remain unchanged.`)) return;
    setBusyId(invoice.id);
    try {
      await apiReceivables.voidDraftInvoice(scope, invoice.id);
      toast.success('Draft invoice voided', { description: `${invoice.invoiceNumber} · no sales or stock entries were changed` });
      await refresh();
    } catch (error) {
      toast.error('Draft invoice was not voided', { description: error instanceof Error ? error.message : 'Refresh the register and try again.' });
    } finally { setBusyId(''); }
  }

  function openReceipt(invoice: ReceivablesInvoice) {
    setSelectedInvoice(invoice);
    setPaymentAmount(asMajor(invoice.balanceDueMinor, workspace.currency));
    setPaymentDate(today);
    setPaymentReference('');
    setReceiptIdempotencyKey(crypto.randomUUID());
  }

  async function recordReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInvoice) return;
    const amountMinor = Math.round(Number(paymentAmount) * currencyScale(workspace.currency));
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > selectedInvoice.balanceDueMinor) {
      toast.error('Enter a positive receipt amount no greater than the invoice balance.');
      return;
    }
    setBusyId(selectedInvoice.id);
    try {
      const receipt = await apiReceivables.recordReceipt(scope, {
        paymentDate,
        method: paymentMethod,
        ...(paymentReference.trim() ? { reference: paymentReference.trim() } : {}),
        amountMinor,
        idempotencyKey: receiptIdempotencyKey,
        allocations: [{ invoiceId: selectedInvoice.id, amountMinor }],
      });
      toast.success('Customer receipt recorded', { description: `${receipt.receiptNumber} · ${money(receipt.amountMinor, workspace.currency)} allocated to ${selectedInvoice.invoiceNumber}` });
      setSelectedInvoice(null);
      setReceiptIdempotencyKey('');
      await refresh();
    } catch (error) {
      toast.error('Receipt was not recorded', { description: error instanceof Error ? error.message : 'Check the receipt and allocation.' });
    } finally { setBusyId(''); }
  }

  if (!isApiProvider) {
    return <section className="ar-panel"><div className="ar-unavailable"><AlertCircle size={19} /><div><strong>Accounts Receivable requires the connected LEXA backend.</strong><p>Connect the live API provider to issue invoices and allocate receipts. No device-local or preview invoice will be treated as an accounting transaction.</p></div></div></section>;
  }

  return (
    <section className="ar-panel">
      <header className="ar-heading">
        <div className="ar-heading-icon"><Wallet size={20} /></div>
        <div className="ar-heading-copy"><span className="eyebrow eyebrow-blue">CUSTOMER CREDIT CONTROL</span><h3>Accounts receivable</h3><p>Issue invoices from completed sales, record receipts, allocate cash and monitor overdue customer balances.</p></div>
        <button type="button" className="button button-secondary button-small" onClick={() => void refresh()} disabled={Boolean(busyId)}><RefreshCw size={14} /> Refresh</button>
      </header>

      <div className="ar-integrity-note"><CheckCircle2 size={16} /><span>Invoices snapshot completed sale lines. Receipts mirror into the existing sales-payment ledger. This screen records payments already received; it does not initiate bank or mobile-money transfers.</span></div>

      {summaryQuery.isError ? <div className="inline-error">Could not load the receivables summary. {summaryQuery.error instanceof Error ? summaryQuery.error.message : ''}</div> : <div className="ar-summary-grid">
        <article><span>Outstanding</span><strong>{money(summary?.outstandingMinor ?? 0, workspace.currency)}</strong><small>{summary?.openCount ?? 0} open invoices</small></article>
        <article><span>Overdue</span><strong>{money(summary?.overdueMinor ?? 0, workspace.currency)}</strong><small>{summary?.overdueCount ?? 0} overdue invoices</small></article>
        <article><span>Not yet due</span><strong>{money(summary?.currentMinor ?? 0, workspace.currency)}</strong><small>Current receivables</small></article>
        <article><span>Total invoices</span><strong>{(summary?.invoiceCount ?? 0).toLocaleString()}</strong><small>Issued invoices</small></article>
      </div>}
      {summary && <div className="ar-ageing-grid" aria-label="Overdue ageing"><div><span>1–30 days</span><strong>{money(summary.days1to30Minor, workspace.currency)}</strong></div><div><span>31–60 days</span><strong>{money(summary.days31to60Minor, workspace.currency)}</strong></div><div><span>61–90 days</span><strong>{money(summary.days61to90Minor, workspace.currency)}</strong></div><div><span>Over 90 days</span><strong>{money(summary.over90Minor, workspace.currency)}</strong></div></div>}

      <section className="ar-section">
        <div className="ar-section-heading"><div><span className="eyebrow eyebrow-blue">STEP 1</span><h4>Completed sales ready to invoice</h4><p>Only completed sales with a named customer and no recorded return are eligible.</p></div><span className="ar-count">{eligibleSales.length} eligible</span></div>
        {eligibleQuery.isError ? <div className="inline-error">Could not load completed sales. {eligibleQuery.error instanceof Error ? eligibleQuery.error.message : ''}</div> : eligibleQuery.isLoading ? <div className="ar-empty">Loading completed sales…</div> : eligibleSales.length === 0 ? <div className="ar-empty">No eligible completed sales. Complete a named-customer sale or fulfil a sales order first.</div> : <div className="ar-sale-list">
          {eligibleSales.map((sale) => <form className="ar-sale-row" key={sale.id} onSubmit={(event) => void createInvoice(event, sale)}>
            <div className="ar-sale-main"><strong>{sale.receiptNumber}</strong><span>{sale.customerName}</span><small>{sale.lineCount} lines · {new Date(sale.createdAt).toLocaleDateString()}</small></div>
            <div className="ar-sale-total"><span>Sale total</span><strong>{money(sale.totalMinor, workspace.currency)}</strong></div>
            <label className="field-label">Invoice date<input type="date" value={issueDates[sale.id] ?? today} onChange={(event) => setIssueDates((current) => ({ ...current, [sale.id]: event.target.value }))} required /></label>
            <label className="field-label">Due date<input type="date" min={issueDates[sale.id] ?? today} value={dueDates[sale.id] ?? ''} onChange={(event) => setDueDates((current) => ({ ...current, [sale.id]: event.target.value }))} required /></label>
            <button type="submit" className="button button-primary button-small" disabled={Boolean(busyId)}><FilePlus2 size={14} /> {busyId === sale.id ? 'Creating…' : 'Create draft'}</button>
          </form>)}
        </div>}
      </section>

      <section className="ar-section">
        <div className="ar-section-heading"><div><span className="eyebrow eyebrow-blue">STEP 2</span><h4>Customer invoice register</h4><p>Review a draft and issue it. Void and recreate a draft if its dates are wrong. Issued invoices are not editable; use the credit-note workflow for post-issue corrections.</p></div><span className="ar-count">{invoices.length} invoices</span></div>
        {invoicesQuery.isError ? <div className="inline-error">Could not load customer invoices. {invoicesQuery.error instanceof Error ? invoicesQuery.error.message : ''}</div> : invoicesQuery.isLoading ? <div className="ar-empty">Loading invoices…</div> : invoices.length === 0 ? <div className="ar-empty">No customer invoices yet. Create a draft from a completed sale above.</div> : <div className="ar-invoice-list">
          {invoices.map((invoice) => <article className="ar-invoice-card" key={invoice.id}>
            <div className="ar-invoice-top"><div><strong>{invoice.invoiceNumber}</strong><span>{invoice.customerName}</span><small>Sale {invoice.sourceSaleId.slice(0, 8)} · Due {invoice.dueDate}</small></div><span className={'ar-status ar-status-' + invoice.status}>{labelStatus(invoice.status)}</span></div>
            <div className="ar-invoice-amounts"><div><span>Total</span><strong>{money(invoice.totalMinor, workspace.currency)}</strong></div><div><span>Received</span><strong>{money(invoice.receivedMinor, workspace.currency)}</strong></div><div><span>Balance due</span><strong>{money(invoice.balanceDueMinor, workspace.currency)}</strong></div></div>
            {invoice.lines.length > 0 && <details className="ar-lines-details"><summary>{invoice.lines.length} invoice lines</summary><div>{invoice.lines.map((line) => <div key={line.id}><span>{line.productName} × {line.quantity}</span><strong>{money(line.lineTotalMinor, workspace.currency)}</strong></div>)}</div></details>}
            <div className="ar-invoice-actions">
              {invoice.status === 'draft' && <><button className="button button-primary button-small" type="button" onClick={() => void issueInvoice(invoice)} disabled={Boolean(busyId)}><FileText size={14} /> {busyId === invoice.id ? 'Processing…' : 'Issue invoice'}</button><button className="button button-secondary button-small" type="button" onClick={() => void voidInvoice(invoice)} disabled={Boolean(busyId)}>Void draft</button></>}
              {['issued', 'partially_paid', 'overdue'].includes(invoice.status) && <button className="button button-secondary button-small" type="button" onClick={() => openReceipt(invoice)} disabled={Boolean(busyId)}><ArrowDownLeft size={14} /> Record receipt</button>}
              {invoice.status === 'paid' && <span className="ar-paid-note"><CheckCircle2 size={14} /> Fully settled</span>}
            </div>
          </article>)}
        </div>}
      </section>

      {selectedInvoice && <form className="ar-receipt-form" onSubmit={(event) => void recordReceipt(event)}>
        <div className="ar-form-heading"><div><span className="eyebrow eyebrow-blue">STEP 3</span><h4>Record customer receipt</h4><p>{selectedInvoice.invoiceNumber} · {selectedInvoice.customerName} · Balance {money(selectedInvoice.balanceDueMinor, workspace.currency)}</p></div><button type="button" className="button button-secondary button-small" onClick={() => { setSelectedInvoice(null); setReceiptIdempotencyKey(''); }}>Cancel</button></div>
        <div className="ar-form-grid">
          <label className="field-label">Payment date<input required type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label>
          <label className="field-label">Amount ({workspace.currency})<input required type="number" min="0.01" step={workspace.currency === 'UGX' ? '1' : '0.01'} max={asMajor(selectedInvoice.balanceDueMinor, workspace.currency)} value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label>
          <label className="field-label">Payment method<select required value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="mtn_momo">MTN Mobile Money (recorded)</option><option value="airtel_money">Airtel Money (recorded)</option><option value="bank_transfer">Bank transfer (recorded)</option><option value="card_recorded">Card (recorded)</option><option value="other">Other</option></select></label>
          <label className="field-label">Reference (optional)<input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Bank / mobile money reference" /></label>
        </div>
        <div className="ar-form-note">The amount is allocated directly to this invoice. For this increment, each receipt must be fully allocated; cash advances and unallocated customer credits will be added in a later phase.</div>
        <div className="ar-form-actions"><button className="button button-primary" type="submit" disabled={Boolean(busyId)}>{busyId === selectedInvoice.id ? 'Recording…' : 'Record and allocate receipt'} <ArrowDownLeft size={15} /></button></div>
      </form>}

      <section className="ar-section">
        <div className="ar-section-heading"><div><span className="eyebrow eyebrow-blue">RECONCILIATION</span><h4>Customer receipt register</h4><p>Includes receipts entered here and customer payments entered from the existing sales screen after an invoice is issued.</p></div><span className="ar-count">{receipts.length} receipts</span></div>
        {receiptsQuery.isError ? <div className="inline-error">Could not load customer receipts. {receiptsQuery.error instanceof Error ? receiptsQuery.error.message : ''}</div> : receipts.length === 0 ? <div className="ar-empty">Receipts allocated to issued invoices will appear here.</div> : <div className="ar-receipt-list">
          {receipts.map((receipt) => <article className="ar-receipt-row" key={receipt.id}><div><strong>{receipt.receiptNumber}</strong><span>{receipt.customerName}</span><small>{receipt.paymentDate} · {receipt.method.replace(/_/g, ' ')}</small></div><div className="ar-receipt-allocation">{receipt.allocations.map((allocation) => <small key={allocation.invoiceId}>{allocation.invoiceNumber}</small>)}</div><strong>{money(receipt.amountMinor, workspace.currency)}</strong></article>)}
        </div>}
      </section>

      <div className="ar-tax-note"><AlertCircle size={16} /><span>These are internal customer-billing invoices, not statutory tax invoices. Tax is not calculated or added in this increment; amounts preserve the completed sale total exactly. Tax setup and statutory document integration will be handled in the tax phase after current rules are verified.</span></div>
    </section>
  );
}
