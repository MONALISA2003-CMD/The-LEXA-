import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Printer, ReceiptText, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import { salesWorkflow } from '../../data/providers';
import { sales } from '../../data/repositories';
import { formatMinorAmount } from '../../domain/money/money';
import type { PaymentMethod } from '../../domain/shared/types';

const refundMethods: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash (recorded)' }, { value: 'mtn_momo', label: 'MTN Mobile Money (recorded)' },
  { value: 'airtel_money', label: 'Airtel Money (recorded)' }, { value: 'bank_transfer', label: 'Bank transfer (recorded)' },
  { value: 'other', label: 'Other' },
];

export default function SaleDetailPage() {
  const { saleId } = useParams();
  const { workspace, branch, branches } = useWorkspace();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [returnOpen, setReturnOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('Customer return');
  const [recordRefund, setRecordRefund] = useState(false);
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('cash');
  const [saving, setSaving] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['sale-detail', workspace.id, saleId],
    queryFn: () => saleId ? sales.getSale({ workspaceId: workspace.id, saleId }) : Promise.resolve(null),
    enabled: Boolean(saleId),
  });
  const detail = detailQuery.data;
  const returnedByLine = useMemo(() => {
    const result = new Map<string, number>();
    for (const line of detail?.returnLines ?? []) result.set(line.originalSaleLineId, (result.get(line.originalSaleLineId) ?? 0) + line.quantity);
    return result;
  }, [detail?.returnLines]);
  const receiptTotal = (detail?.payments ?? []).filter((payment) => payment.kind === 'receipt').reduce((sum, payment) => sum + payment.amountMinor, 0);
  const refundTotal = (detail?.payments ?? []).filter((payment) => payment.kind === 'refund').reduce((sum, payment) => sum + payment.amountMinor, 0);
  const returnTotal = (detail?.returns ?? []).reduce((sum, item) => sum + item.totalMinor, 0);
  const outstanding = Math.max(0, (detail?.sale.totalMinor ?? 0) - returnTotal - receiptTotal + refundTotal);
  const isCorrectBranch = Boolean(detail && detail.sale.branchId === branch.id);
  const sourceBranchName = branches.find((item) => item.id === detail?.sale.branchId)?.name ?? 'Original sale branch';

  async function submitReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!saleId || !detail) return;
    const items = detail.lines.map((line) => ({ saleLineId: line.id, quantity: Number(quantities[line.id] ?? '0') })).filter((item) => item.quantity > 0);
    if (!items.length) { toast.error('Enter a quantity to return.'); return; }
    setSaving(true);
    try {
      const result = await salesWorkflow.recordReturn({
        workspaceId: workspace.id, branchId: branch.id, saleId, items, reason,
        recordRefund, refundMethod,
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['sale-detail', workspace.id, saleId] }),
        client.invalidateQueries({ queryKey: ['sales', workspace.id] }),
        client.invalidateQueries({ queryKey: ['inventory-balances', workspace.id, branch.id] }),
        client.invalidateQueries({ queryKey: ['inventory-movements', workspace.id, branch.id] }),
        client.invalidateQueries({ queryKey: ['dashboard', workspace.id, branch.id] }),
      ]);
      setQuantities({}); setReason('Customer return'); setRecordRefund(false); setReturnOpen(false);
      toast.success('Return recorded', { description: `${result.returnRecord.returnNumber} links back to this sale.` });
    } catch (error) {
      toast.error('Return was not recorded', { description: error instanceof Error ? error.message : 'No return records were committed.' });
    } finally { setSaving(false); }
  }

  if (detailQuery.isLoading) return <div className="loading-state page-loading">Loading sale record…</div>;
  if (!detail) return <div className="page-stack"><div className="empty-state"><div className="empty-icon"><ReceiptText size={23} /></div><h3>Sale not found</h3><p>This receipt does not exist in the active workspace, or the local record is unavailable.</p><button className="button button-primary" onClick={() => navigate('/sales')}>Back to sales</button></div></div>;

  return (
    <div className="page-stack receipt-page">
      <div className="page-heading-row"><div><button className="back-link" onClick={() => navigate('/sales')}><ArrowLeft size={15} /> Sales history</button><div className="eyebrow eyebrow-blue">COMPLETED TRANSACTION</div><h2>Sale details</h2><p>Inspect the source transaction and its related records.</p></div><div className="action-group"><button className="button button-secondary" onClick={() => window.print()}><Printer size={16} /> Print</button><button className="button button-primary" onClick={() => setReturnOpen(true)} disabled={!isCorrectBranch || detail.lines.every((line) => (returnedByLine.get(line.id) ?? 0) >= line.quantity)}><RotateCcw size={16} /> Record return</button></div></div>
      {!isCorrectBranch && <div className="inline-warning"><ShieldCheck size={17} /><span>This sale belongs to another branch. Switch the active branch in the top bar before recording a return.</span></div>}
      <section className="receipt-summary section-card"><div className="receipt-brand-row"><div className="receipt-brand"><div className="brand-mark compact-brand">L</div><div><strong>LEXA</strong><span>LOCAL RECEIPT RECORD</span></div></div><span className="status-pill status-good">Completed</span></div><div className="receipt-amount-row"><div><span>Receipt total</span><strong>{formatMinorAmount(detail.sale.totalMinor, workspace.currency)}</strong><small>{detail.sale.receiptNumber}</small></div><div className="receipt-date"><span>Recorded on</span><strong>{new Date(detail.sale.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</strong><small>{new Date(detail.sale.createdAt).toLocaleTimeString(undefined, { timeStyle: 'short' })}</small></div></div><div className="receipt-meta-grid"><div><span>Business</span><strong>{workspace.businessName}</strong></div><div><span>Branch</span><strong>{sourceBranchName}</strong></div><div><span>Customer</span><strong>{detail.sale.customerName || 'Walk-in customer'}</strong></div></div></section>

      <section className="section-card table-card"><div className="table-toolbar"><div><h3>Items sold</h3><p>Line prices are snapshots from the completed sale.</p></div><span className="muted-count">{detail.lines.length} lines</span></div><div className="responsive-table-wrap"><table className="data-table"><thead><tr><th>ITEM</th><th>QUANTITY</th><th>UNIT PRICE</th><th>LINE TOTAL</th></tr></thead><tbody>{detail.lines.map((line) => { const returned = returnedByLine.get(line.id) ?? 0; return <tr key={line.id}><td><strong>{line.productNameSnapshot}</strong><div className="subtle-line">{returned ? `${returned} of ${line.quantity} returned` : 'Original sale line'}</div></td><td>{line.quantity}</td><td>{formatMinorAmount(line.unitPriceMinor, workspace.currency)}</td><td className="amount-cell">{formatMinorAmount(line.lineTotalMinor, workspace.currency)}</td></tr>; })}</tbody><tfoot><tr><td colSpan={3}>Sale total</td><td className="amount-cell">{formatMinorAmount(detail.sale.totalMinor, workspace.currency)}</td></tr></tfoot></table></div></section>

      <div className="receipt-two-column"><section className="section-card"><div className="section-card-heading"><div className="heading-icon green-icon"><Check size={18} /></div><div><h3>Recorded payment activity</h3><p>Amounts reported as received or refunded.</p></div></div><div className="payment-summary-list"><div><span>Recorded receipts</span><strong>{formatMinorAmount(receiptTotal, workspace.currency)}</strong></div><div><span>Recorded refunds</span><strong>{formatMinorAmount(refundTotal, workspace.currency)}</strong></div><div className="payment-summary-total"><span>Outstanding estimate</span><strong>{formatMinorAmount(outstanding, workspace.currency)}</strong></div></div>{detail.payments.length === 0 ? <div className="compact-empty"><span>No payment records attached.</span></div> : <div className="payment-history">{detail.payments.map((payment) => <div className="payment-history-row" key={payment.id}><div><strong>{payment.kind === 'receipt' ? 'Receipt recorded' : 'Refund recorded'}</strong><span>{payment.method.replaceAll('_', ' ')} · {new Date(payment.createdAt).toLocaleString()}</span>{payment.reference && <small>Ref: {payment.reference}</small>}</div><strong className={payment.kind === 'refund' ? 'refund-amount' : ''}>{payment.kind === 'refund' ? '−' : ''}{formatMinorAmount(payment.amountMinor, workspace.currency)}</strong></div>)}</div>}<div className="panel-footnote">An amount recorded here is not proof of an external transfer. LEXA has not initiated any payment.</div></section>
      <section className="section-card"><div className="section-card-heading"><div className="heading-icon amber-icon"><RotateCcw size={18} /></div><div><h3>Returns & reversals</h3><p>Every return references this original sale.</p></div></div>{detail.returns.length === 0 ? <div className="compact-empty"><strong>No returns recorded</strong><span>When an item is returned, the original sale remains unchanged and a return record is added.</span></div> : <div className="return-history">{detail.returns.map((item) => <div className="return-history-row" key={item.id}><div><strong>{item.returnNumber}</strong><span>{item.reason}</span><small>{new Date(item.createdAt).toLocaleString()}</small><em>{item.refundRecorded ? 'Refund record included' : 'No refund recorded'}</em></div><strong>{formatMinorAmount(item.totalMinor, workspace.currency)}</strong></div>)}</div>}</section></div>

      {returnOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReturnOpen(false); }}><section className="form-modal return-modal" role="dialog" aria-modal="true" aria-labelledby="return-form-title"><div className="modal-heading"><div><div className="eyebrow eyebrow-blue">LINKED REVERSAL RECORD</div><h3 id="return-form-title">Record a return</h3><p>Original receipt: {detail.sale.receiptNumber}</p></div><button className="icon-button" aria-label="Close return form" onClick={() => setReturnOpen(false)}><X size={19} /></button></div><form onSubmit={submitReturn} className="form-stack"><div className="return-quantity-list">{detail.lines.map((line) => { const returned = returnedByLine.get(line.id) ?? 0; const remaining = line.quantity - returned; return <label className="return-quantity-row" key={line.id}><span><strong>{line.productNameSnapshot}</strong><small>{remaining} remaining returnable · {formatMinorAmount(line.unitPriceMinor, workspace.currency)} each</small></span><input type="number" aria-label={`Quantity to return for ${line.productNameSnapshot}`} min="0" max={remaining} step="1" disabled={remaining === 0} value={quantities[line.id] ?? '0'} onChange={(event) => setQuantities({ ...quantities, [line.id]: event.target.value })} /></label>; })}</div><label className="field-label">Return reason <span className="required-mark">*</span><textarea rows={2} required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for the return" /></label><label className="checkbox-field refund-checkbox"><input type="checkbox" checked={recordRefund} onChange={(event) => setRecordRefund(event.target.checked)} /><span><strong>Record a refund</strong><small>Only select this if money was actually refunded. No transfer will be initiated.</small></span></label>{recordRefund && <label className="field-label">Recorded refund method<select value={refundMethod} onChange={(event) => setRefundMethod(event.target.value as PaymentMethod)}>{refundMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>}<div className="form-info"><ShieldCheck size={16} /><p>LEXA validates returned quantities against the original sale, restores tracked stock, and preserves the original transaction.</p></div><div className="form-modal-actions"><button type="button" className="button button-secondary" onClick={() => setReturnOpen(false)}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Recording…' : 'Save return'} <Check size={16} /></button></div></form></section></div>}
    </div>
  );
}
