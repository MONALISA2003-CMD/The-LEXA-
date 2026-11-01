import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import { sales } from '../../data/repositories';
import { apiCommerce, type DispatchableSaleLine, type DispatchRecord } from '../../data/remote/apiCommerce';
import { formatMinorAmount, minorUnitFactor, parseMajorAmount } from '../../domain/money/money';

const methods = [
  ['business_rider', 'Business-owned rider'], ['independent_rider', 'Independent rider'], ['bus', 'Bus / bus company'],
  ['transport_company', 'Transport company'], ['courier_manual', 'Courier (manual)'], ['customer_pickup', 'Customer pickup'],
  ['business_employee', 'Business employee / owner'], ['other', 'Other'],
] as const;
const agentTypes = [
  ['employee', 'Employee'], ['internal_rider', 'Business rider'], ['independent_rider', 'Independent rider'],
  ['bus_operator', 'Bus operator / company'], ['transport_partner', 'Transport partner'], ['courier_contact', 'Courier contact'], ['other', 'Other'],
] as const;
const paymentCategories = [['cash','Cash'],['mobile_money','Mobile money'],['bank_transfer','Bank transfer / deposit'],['card','Card'],['cheque','Cheque'],['other','Other']] as const;
const nextStatus: Record<string, { status: string; label: string }[]> = {
  prepared: [{ status: 'assigned', label: 'Assign' }, { status: 'cancelled', label: 'Cancel' }],
  assigned: [{ status: 'picked_up', label: 'Mark picked up' }, { status: 'cancelled', label: 'Cancel' }],
  picked_up: [{ status: 'in_transit', label: 'In transit' }, { status: 'delivery_failed', label: 'Delivery failed' }],
  in_transit: [{ status: 'delivered', label: 'Mark delivered' }, { status: 'delivery_failed', label: 'Delivery failed' }],
  delivery_failed: [{ status: 'return_pending', label: 'Return pending' }, { status: 'returned', label: 'Mark returned' }, { status: 'assigned', label: 'Reattempt' }],
  return_pending: [{ status: 'returned', label: 'Mark returned' }, { status: 'assigned', label: 'Reattempt' }],
  dispatched: [{ status: 'in_transit', label: 'In transit' }, { status: 'delivered', label: 'Mark delivered' }, { status: 'delivery_failed', label: 'Delivery failed' }],
};

function money(value: number, currency: string) { return formatMinorAmount(value, currency); }
function parseSafeMinor(value: string | undefined, fallback: number, currency: string) { try { return parseMajorAmount(value ?? String(fallback / minorUnitFactor(currency)), currency); } catch { return 0; } }

export default function DeliveryDispatchPanel() {
  const { workspace, branch } = useWorkspace();
  const client = useQueryClient();
  const scope = { workspaceId: workspace.id, branchId: branch.id };
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('business_rider');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [address, setAddress] = useState('');
  const [destinationArea, setDestinationArea] = useState('');
  const [destinationTown, setDestinationTown] = useState('');
  const [transportDetails, setTransportDetails] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [expectedCollection, setExpectedCollection] = useState('0');
  const [deliveryExpense, setDeliveryExpense] = useState('0');
  const [lineQuantities, setLineQuantities] = useState<Record<string, string>>({});
  const [agentName, setAgentName] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [agentType, setAgentType] = useState('internal_rider');
  const [agentTransport, setAgentTransport] = useState('');
  const [collectionDeliveryId, setCollectionDeliveryId] = useState('');
  const [collectionLines, setCollectionLines] = useState<Array<{ methodCategory: string; amount: string; methodLabel: string; reference: string; notes: string }>>([{ methodCategory: 'cash', amount: '', methodLabel: '', reference: '', notes: '' }]);
  const [directReceiptDeliveryId, setDirectReceiptDeliveryId] = useState('');
  const [directReceiptAmount, setDirectReceiptAmount] = useState('');
  const [directReceiptMethod, setDirectReceiptMethod] = useState('cash');
  const [directReceiptLabel, setDirectReceiptLabel] = useState('');
  const [directReceiptReference, setDirectReceiptReference] = useState('');
  const [remittanceMethod, setRemittanceMethod] = useState('cash');
  const [remittanceMethodLabel, setRemittanceMethodLabel] = useState('');
  const [remittanceReference, setRemittanceReference] = useState('');
  const [remittanceVarianceReason, setRemittanceVarianceReason] = useState('');
  const [remittanceAmounts, setRemittanceAmounts] = useState<Record<string, string>>({});
  const [selectedRemittanceReports, setSelectedRemittanceReports] = useState<string[]>([]);
  const [selectedDetailId, setSelectedDetailId] = useState('');
  const [selectedAgentHistoryId, setSelectedAgentHistoryId] = useState('');
  const [eventReason, setEventReason] = useState('');
  const [eventRecipient, setEventRecipient] = useState('');
  const [busy, setBusy] = useState(false);

  const saleQuery = useQuery({ queryKey: ['sales', workspace.id, 'dispatch'], queryFn: () => sales.list({ workspaceId: workspace.id, limit: 300 }) });
  const agentQuery = useQuery({ queryKey: ['delivery-agents', workspace.id, branch.id], queryFn: () => apiCommerce.listDeliveryAgents(scope, true) });
  const dispatchQuery = useQuery({ queryKey: ['delivery-dispatches', workspace.id, branch.id], queryFn: () => apiCommerce.listDispatches(scope) });
  const reportsQuery = useQuery({ queryKey: ['delivery-collection-reports', workspace.id, branch.id], queryFn: () => apiCommerce.listCollectionReports(scope) });
  const deliveryReportQuery = useQuery({ queryKey: ['delivery-report', workspace.id, branch.id], queryFn: () => apiCommerce.getDeliveryReport(scope) });
  const dispatchableQuery = useQuery({ queryKey: ['delivery-dispatchable', workspace.id, branch.id, selectedSaleId], queryFn: () => apiCommerce.getDispatchableLines(scope, selectedSaleId), enabled: Boolean(selectedSaleId) });
  const dispatchDetailQuery = useQuery({ queryKey: ['delivery-dispatch-detail', workspace.id, branch.id, selectedDetailId], queryFn: () => apiCommerce.getDispatch(scope, selectedDetailId), enabled: Boolean(selectedDetailId) });
  const agentHistoryQuery = useQuery({ queryKey: ['delivery-agent-history', workspace.id, branch.id, selectedAgentHistoryId], queryFn: () => apiCommerce.getDeliveryAgentHistory(scope, selectedAgentHistoryId), enabled: Boolean(selectedAgentHistoryId) });
  const completedSales = useMemo(() => (saleQuery.data ?? []).filter((sale) => sale.branchId === branch.id && sale.status === 'completed'), [saleQuery.data, branch.id]);
  const agents = agentQuery.data ?? [];
  const dispatches = dispatchQuery.data ?? [];
  const reports = reportsQuery.data ?? [];
  const dispatchableLines = dispatchableQuery.data?.lines ?? [];
  const dispatchCount = dispatches.length;
  const activeCount = dispatches.filter((item) => !['delivered','returned','cancelled'].includes(item.status)).length;
  const failedCount = dispatches.filter((item) => ['delivery_failed','return_pending','returned'].includes(item.status)).length;
  const reportedOutstanding = reports.reduce((sum, report) => sum + Math.max(0, report.outstandingReportedMinor), 0);
  const dispatchedSellingValue = dispatches.reduce((sum, item) => sum + item.goodsSellingMinor, 0);
  const dispatchedCostValue = dispatches.reduce((sum, item) => sum + item.goodsCostMinor, 0);
  const selectedRemittanceTotal = reports.filter((report) => selectedRemittanceReports.includes(report.id)).reduce((sum, report) => sum + parseSafeMinor(remittanceAmounts[report.id], report.outstandingReportedMinor, workspace.currency), 0);

  useEffect(() => {
    if (!dispatchableLines.length) { setLineQuantities({}); return; }
    setLineQuantities(Object.fromEntries(dispatchableLines.filter((line) => line.dispatchableQuantity > 0).map((line) => [line.saleLineId, String(line.dispatchableQuantity)])));
    const sale = dispatchableQuery.data?.sale;
    if (sale) {
      setRecipientName((current) => current || sale.customerName || '');
      setRecipientPhone((current) => current || sale.customerPhone || '');
    }
  }, [dispatchableLines, dispatchableQuery.data?.sale]);

  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['delivery-agents', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['delivery-dispatches', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['delivery-collection-reports', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['delivery-report', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['delivery-agent-history', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['delivery-dispatchable', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['sales', workspace.id] }),
      client.invalidateQueries({ queryKey: ['dashboard', workspace.id, branch.id] }),
    ]);
  }

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      const result = await apiCommerce.createDeliveryAgent(scope, { displayName: agentName.trim(), agentType, ...(agentPhone.trim() ? { phone: agentPhone.trim() } : {}), ...(agentTransport.trim() ? { transportDescription: agentTransport.trim() } : {}) });
      setAgentName(''); setAgentPhone(''); setAgentTransport(''); setSelectedAgentId(result.id);
      toast.success('Delivery contact saved'); await refresh();
    } catch (error) { toast.error('Delivery contact was not saved', { description: error instanceof Error ? error.message : 'Check the details and retry.' }); }
    finally { setBusy(false); }
  }

  async function createDispatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedSaleId) return;
    setBusy(true);
    try {
      const items = dispatchableLines.map((line) => ({ saleLineId: line.saleLineId, quantity: Number(lineQuantities[line.saleLineId] ?? 0) })).filter((line) => line.quantity > 0);
      if (!items.length) throw new Error('Enter at least one positive dispatch quantity.');
      const result = await apiCommerce.createDispatch(scope, {
        saleId: selectedSaleId, items, deliveryMethod,
        ...(selectedAgentId ? { deliveryAgentId: selectedAgentId } : {}),
        ...(recipientName.trim() ? { recipientName: recipientName.trim() } : {}),
        ...(recipientPhone.trim() ? { recipientPhone: recipientPhone.trim() } : {}),
        ...(address.trim() ? { deliveryAddress: address.trim() } : {}),
        ...(destinationArea.trim() ? { destinationArea: destinationArea.trim() } : {}),
        ...(destinationTown.trim() ? { destinationTown: destinationTown.trim() } : {}),
        ...(transportDetails.trim() ? { transportDetails: transportDetails.trim() } : {}),
        ...(expectedDate ? { expectedDate } : {}),
        deliveryExpenseMinor: parseMajorAmount(deliveryExpense || '0', workspace.currency),
        expectedCollectionMinor: parseMajorAmount(expectedCollection || '0', workspace.currency),
      });
      toast.success('Dispatch prepared', { description: `${result.deliveryNumber} · No additional stock movement was posted.` });
      setSelectedSaleId(''); setAddress(''); setDestinationArea(''); setDestinationTown(''); setTransportDetails(''); setExpectedDate(''); setExpectedCollection('0'); setDeliveryExpense('0');
      await refresh();
    } catch (error) { toast.error('Dispatch was not created', { description: error instanceof Error ? error.message : 'Refresh the sale quantities and retry.' }); }
    finally { setBusy(false); }
  }

  async function transition(item: DispatchRecord, status: string) {
    setBusy(true);
    try {
      await apiCommerce.updateDispatchStatus(scope, item.id, { status, ...(eventReason.trim() ? { reason: eventReason.trim() } : {}), ...(eventRecipient.trim() ? { recipientName: eventRecipient.trim() } : {}) });
      toast.success(`Delivery marked ${status.replaceAll('_',' ')}`); setEventReason(''); setEventRecipient(''); await refresh();
    } catch (error) { toast.error('Delivery status was not changed', { description: error instanceof Error ? error.message : 'Check the transition and retry.' }); }
    finally { setBusy(false); }
  }

  async function reportCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!collectionDeliveryId) return; setBusy(true);
    try {
      const lines = collectionLines.map((line) => ({
        methodCategory: line.methodCategory,
        amountMinor: parseMajorAmount(line.amount, workspace.currency),
        ...(line.methodLabel.trim() ? { methodLabel: line.methodLabel.trim() } : {}),
        ...(line.reference.trim() ? { reference: line.reference.trim() } : {}),
        ...(line.notes.trim() ? { notes: line.notes.trim() } : {}),
      }));
      if (lines.some((line) => line.amountMinor <= 0)) throw new Error('Every collection method line must have an amount greater than zero.');
      const result = await apiCommerce.reportRiderCollection(scope, collectionDeliveryId, { lines });
      toast.success('Rider collection report saved', { description: result.message });
      setCollectionLines([{ methodCategory: 'cash', amount: '', methodLabel: '', reference: '', notes: '' }]); setCollectionDeliveryId(''); await refresh();
    } catch (error) { toast.error('Collection report was not saved', { description: error instanceof Error ? error.message : 'Check each amount and retry.' }); }
    finally { setBusy(false); }
  }

  async function recordDirectReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!directReceiptDeliveryId) return;
    setBusy(true);
    try {
      const amountMinor = parseMajorAmount(directReceiptAmount, workspace.currency);
      if (amountMinor <= 0) throw new Error('Enter the amount received directly by the business.');
      await apiCommerce.recordDirectReceipt(scope, directReceiptDeliveryId, {
        methodCategory: directReceiptMethod, amountMinor,
        ...(directReceiptLabel.trim() ? { methodLabel: directReceiptLabel.trim() } : {}),
        ...(directReceiptReference.trim() ? { reference: directReceiptReference.trim() } : {}),
      });
      toast.success('Direct customer receipt recorded', { description: 'Linked to the delivery and sale balance; not provider-verified.' });
      setDirectReceiptDeliveryId(''); setDirectReceiptAmount(''); setDirectReceiptLabel(''); setDirectReceiptReference('');
      await refresh();
    } catch (error) { toast.error('Direct receipt was not recorded', { description: error instanceof Error ? error.message : 'The sale balance may have changed.' }); }
    finally { setBusy(false); }
  }

  async function acceptSelectedRemittances() {
    if (!selectedRemittanceReports.length) return;
    setBusy(true);
    try {
      const allocations = reports.filter((report) => selectedRemittanceReports.includes(report.id)).map((report) => ({
        reportId: report.id,
        amountMinor: parseMajorAmount(remittanceAmounts[report.id] ?? String(report.outstandingReportedMinor / minorUnitFactor(workspace.currency)), workspace.currency),
      }));
      if (allocations.some((allocation) => allocation.amountMinor <= 0)) throw new Error('Each selected allocation must be greater than zero.');
      await apiCommerce.acceptRemittance(scope, {
        methodCategory: remittanceMethod,
        ...(remittanceMethodLabel.trim() ? { methodLabel: remittanceMethodLabel.trim() } : {}),
        ...(remittanceReference.trim() ? { reference: remittanceReference.trim() } : {}),
        ...(remittanceVarianceReason.trim() ? { varianceReason: remittanceVarianceReason.trim() } : {}),
        allocations,
      });
      toast.success('Remittance accepted', { description: `${allocations.length} collection report(s) reconciled. Only the accepted allocations were added as customer receipts.` });
      setSelectedRemittanceReports([]); setRemittanceReference(''); setRemittanceVarianceReason(''); await refresh();
    } catch (error) { toast.error('Remittance was not accepted', { description: error instanceof Error ? error.message : 'The report or sale balance may have changed.' }); }
    finally { setBusy(false); }
  }

  function updateCollectionLine(index: number, field: 'methodCategory' | 'amount' | 'methodLabel' | 'reference' | 'notes', value: string) {
    setCollectionLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line));
  }

  async function toggleAgent(id: string, active: boolean) {
    setBusy(true);
    try { await apiCommerce.updateDeliveryAgent(scope, id, { active }); toast.success(active ? 'Delivery agent activated' : 'Delivery agent deactivated'); await refresh(); }
    catch (error) { toast.error('Delivery agent was not updated', { description: error instanceof Error ? error.message : 'Try again.' }); }
    finally { setBusy(false); }
  }

  return (
    <section className="commerce-workflow-panel" style={{ marginBottom: 18 }}>
      <div className="commerce-panel-heading">
        <div className="commerce-panel-icon">🚚</div>
        <div><span className="eyebrow eyebrow-blue">WORKSTREAM 7 · INCREMENT 1</span><h3>POS dispatches and rider reconciliation</h3><p>Split a completed sale into dispatch batches, record lifecycle events, then reconcile rider-held money separately from customer receipts.</p></div>
      </div>
      <div className="commerce-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
        <div className="commerce-summary-card"><span>Dispatch records</span><strong>{deliveryReportQuery.data?.totals.dispatchCount ?? dispatchCount}</strong></div>
        <div className="commerce-summary-card"><span>Open deliveries</span><strong>{deliveryReportQuery.data?.totals.openCount ?? activeCount}</strong><small>{deliveryReportQuery.data?.totals.failedOrReturnedCount ?? failedCount} failed / returned</small></div>
        <div className="commerce-summary-card"><span>Goods selling value dispatched</span><strong>{money(deliveryReportQuery.data?.totals.goodsSellingMinor ?? dispatchedSellingValue, workspace.currency)}</strong></div>
        <div className="commerce-summary-card"><span>Goods cost value dispatched</span><strong>{money(deliveryReportQuery.data?.totals.goodsCostMinor ?? dispatchedCostValue, workspace.currency)}</strong></div>
        <div className="commerce-summary-card"><span>Delivery expenses</span><strong>{money(deliveryReportQuery.data?.totals.deliveryExpenseMinor ?? 0, workspace.currency)}</strong></div>
        <div className="commerce-summary-card"><span>Rider-held outstanding</span><strong>{money(deliveryReportQuery.data?.totals.riderHeldOutstandingMinor ?? reportedOutstanding, workspace.currency)}</strong></div>
        <div className="commerce-summary-card"><span>Accepted from riders</span><strong>{money(deliveryReportQuery.data?.totals.collectionAcceptedMinor ?? 0, workspace.currency)}</strong></div>
        <div className="commerce-summary-card"><span>Reconciliation variances</span><strong>{deliveryReportQuery.data?.totals.varianceCount ?? 0}</strong></div>
        <div className="commerce-summary-card"><span>Registered delivery contacts</span><strong>{agents.length}</strong></div>
      </div>
      {deliveryReportQuery.isError && <p className="panel-footnote">Delivery report totals could not be refreshed. The dispatch register remains available.</p>}
      {deliveryReportQuery.data && <div className="section-card" style={{ padding: 14, marginBottom: 14 }}>
        <h4 style={{ margin: '0 0 8px' }}>Delivery performance and reconciliation report</h4>
        <p className="panel-footnote" style={{ marginTop: 0 }}>Current branch scope · {deliveryReportQuery.data.timezone}. Rider-reported collections are custody claims; accepted remittances are separate.</p>
        <div className="form-two-col" style={{ gap: 14 }}>
          <div><strong>By transport method</strong><div className="responsive-table-wrap"><table className="data-table"><thead><tr><th>METHOD</th><th>DISPATCHES</th><th>GOODS VALUE</th><th>GOODS COST</th></tr></thead><tbody>{deliveryReportQuery.data.byMethod.map((row) => <tr key={row.deliveryMethod}><td>{row.deliveryMethod.replaceAll('_',' ')}</td><td>{row.count}</td><td>{money(row.goodsSellingMinor, workspace.currency)}</td><td>{money(row.goodsCostMinor, workspace.currency)}</td></tr>)}</tbody></table></div></div>
          <div><strong>By destination</strong><div className="responsive-table-wrap"><table className="data-table"><thead><tr><th>DESTINATION</th><th>DISPATCHES</th><th>EXPENSE</th></tr></thead><tbody>{deliveryReportQuery.data.byDestination.map((row) => <tr key={row.destination}><td>{row.destination}</td><td>{row.count}</td><td>{money(row.deliveryExpenseMinor, workspace.currency)}</td></tr>)}</tbody></table></div></div>
        </div>
        <div style={{ marginTop: 10 }}><strong>Rider / transport performance</strong><div className="responsive-table-wrap"><table className="data-table"><thead><tr><th>AGENT</th><th>DISPATCHES</th><th>DELIVERED</th><th>FAILED / RETURNED</th><th>REPORTED</th><th>REMITTED</th><th>ACCEPTED</th></tr></thead><tbody>{deliveryReportQuery.data.byAgent.map((row) => <tr key={row.agentId}><td>{row.agentName}</td><td>{row.dispatchCount}</td><td>{row.deliveredCount}</td><td>{row.failedOrReturnedCount}</td><td>{money(row.reportedMinor, workspace.currency)}</td><td>{money(row.remittedMinor, workspace.currency)}</td><td>{money(row.acceptedMinor, workspace.currency)}</td></tr>)}</tbody></table></div></div>
      </div>}

      <div className="commerce-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,360px),1fr))', gap: 14 }}>
        <div className="section-card" style={{ padding: 16 }}>
          <h4 style={{ margin: '0 0 10px' }}>Create dispatch from a POS sale</h4>
          <form className="form-stack" onSubmit={createDispatch}>
            <label className="field-label">Completed sale<select value={selectedSaleId} onChange={(event) => setSelectedSaleId(event.target.value)} required><option value="">Choose a receipt…</option>{completedSales.map((sale) => <option key={sale.id} value={sale.id}>{sale.receiptNumber} · {money(sale.totalMinor, workspace.currency)}{sale.customerName ? ` · ${sale.customerName}` : ''}</option>)}</select></label>
            {selectedSaleId && <div style={{ display: 'grid', gap: 8, padding: 10, background: '#f8fafc', borderRadius: 8 }}>
              {dispatchableQuery.isLoading ? <span>Loading remaining sale quantities…</span> : dispatchableLines.map((line: DispatchableSaleLine) => <label key={line.saleLineId} className="field-label" style={{ display: 'grid', gridTemplateColumns: '1fr 90px', alignItems: 'center', gap: 8 }}><span>{line.productName}<small style={{ display: 'block', color: '#64748b' }}>Remaining: {line.dispatchableQuantity} · SKU {line.sku}{line.legacyReservedQuantity ? ` · Previous sales-order dispatch: ${line.legacyReservedQuantity}` : ''}</small>{line.legacyMappingRequired && <small style={{ display: 'block', color: '#b45309' }}>A previous fulfilment cannot safely be linked to this exact sale line. Resolve its mapping before dispatching this product again.</small>}</span><input aria-label={`${line.productName} dispatch quantity`} type="number" min="0" max={line.dispatchableQuantity} step="0.001" disabled={line.legacyMappingRequired} value={lineQuantities[line.saleLineId] ?? '0'} onChange={(event) => setLineQuantities((current) => ({ ...current, [line.saleLineId]: event.target.value }))} /></label>)}
              {!dispatchableQuery.isLoading && dispatchableLines.every((line) => line.dispatchableQuantity <= 0) && <p style={{ color: '#64748b', margin: 0 }}>All quantities are already dispatched/reserved, or an older fulfilment needs a safe line mapping before another dispatch can be created.</p>}
            </div>}
            <label className="field-label">Transport method<select value={deliveryMethod} onChange={(event) => setDeliveryMethod(event.target.value)}>{methods.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="field-label">Delivery agent / transport contact<select value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)}><option value="">Select later / none</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.displayName} · {agent.agentType.replaceAll('_',' ')}</option>)}</select></label>
            <div className="form-two-col"><label className="field-label">Recipient name<input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} /></label><label className="field-label">Recipient phone<input value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value)} /></label></div>
            <label className="field-label">Destination / address<input value={address} onChange={(event) => setAddress(event.target.value)} /></label>
            <div className="form-two-col"><label className="field-label">Area / neighbourhood<input value={destinationArea} onChange={(event) => setDestinationArea(event.target.value)} /></label><label className="field-label">Town / district<input value={destinationTown} onChange={(event) => setDestinationTown(event.target.value)} /></label></div>
            <label className="field-label">Bus route, parcel ref or transport detail<input value={transportDetails} onChange={(event) => setTransportDetails(event.target.value)} /></label>
            <div className="form-two-col"><label className="field-label">Expected date<input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></label><label className="field-label">Expected amount to collect ({workspace.currency})<input type="number" min="0" step={minorUnitFactor(workspace.currency) === 1 ? '1' : '0.01'} value={expectedCollection} onChange={(event) => setExpectedCollection(event.target.value)} /></label></div>
            <label className="field-label">Delivery expense ({workspace.currency})<input type="number" min="0" step={minorUnitFactor(workspace.currency) === 1 ? '1' : '0.01'} value={deliveryExpense} onChange={(event) => setDeliveryExpense(event.target.value)} /></label>
            <button className="button button-primary" type="submit" disabled={busy || !selectedSaleId || dispatchableQuery.isLoading || dispatchableLines.every((line) => line.dispatchableQuantity <= 0)}>Prepare dispatch</button>
            <p className="panel-footnote">Dispatching does not deduct stock again. A rider collection report is not a customer payment until the business accepts a remittance.</p>
          </form>
        </div>

        <div className="section-card" style={{ padding: 16 }}>
          <h4 style={{ margin: '0 0 10px' }}>Delivery-agent directory</h4>
          <form className="form-stack" onSubmit={createAgent}>
            <label className="field-label">Name / transport company<input value={agentName} onChange={(event) => setAgentName(event.target.value)} required maxLength={160} /></label>
            <div className="form-two-col"><label className="field-label">Type<select value={agentType} onChange={(event) => setAgentType(event.target.value)}>{agentTypes.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field-label">Phone<input value={agentPhone} onChange={(event) => setAgentPhone(event.target.value)} /></label></div>
            <label className="field-label">Vehicle / route description<input value={agentTransport} onChange={(event) => setAgentTransport(event.target.value)} /></label>
            <button type="submit" className="button button-secondary" disabled={busy || !agentName.trim()}>Add delivery contact</button>
          </form>
          <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
            {agents.map((agent) => <div key={agent.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #e2e8f0' }}><div><strong>{agent.displayName}</strong><small style={{ display: 'block', color: '#64748b' }}>{agent.agentType.replaceAll('_',' ')}{agent.phone ? ` · ${agent.phone}` : ''}{agent.transportDescription ? ` · ${agent.transportDescription}` : ''}{!agent.active ? ' · Inactive' : ''}</small></div><div style={{ display: 'flex', gap: 6 }}><button className="button button-secondary button-small" type="button" disabled={busy} onClick={() => setSelectedAgentHistoryId(agent.id)}>History</button><button className="button button-secondary button-small" type="button" disabled={busy} onClick={() => toggleAgent(agent.id, !agent.active)}>{agent.active ? 'Deactivate' : 'Activate'}</button></div></div>)}
            {!agents.length && <p className="compact-empty">No delivery contacts registered yet.</p>}
          </div>
          {selectedAgentHistoryId && <div style={{ marginTop: 14, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><strong>Delivery-agent history</strong><button type="button" className="button button-secondary button-small" onClick={() => setSelectedAgentHistoryId('')}>Close</button></div>
            {agentHistoryQuery.isLoading ? <p>Loading agent history…</p> : agentHistoryQuery.error ? <p className="panel-footnote">Could not load this agent's history.</p> : agentHistoryQuery.data && <>
              <p className="panel-footnote">{agentHistoryQuery.data.agent.displayName} · {agentHistoryQuery.data.deliveries.length} dispatches · {agentHistoryQuery.data.collectionReports.length} collection reports</p>
              <div className="responsive-table-wrap"><table className="data-table"><thead><tr><th>DELIVERY</th><th>STATUS</th><th>DESTINATION</th><th>GOODS VALUE</th></tr></thead><tbody>{agentHistoryQuery.data.deliveries.map((row) => <tr key={row.id}><td>{row.deliveryNumber}{row.receiptNumber ? <small className="subtle-line">{row.receiptNumber}</small> : null}</td><td>{row.status.replaceAll('_',' ')}</td><td>{row.destinationTown || row.destinationArea || '—'}</td><td>{money(row.goodsSellingMinor, workspace.currency)}</td></tr>)}</tbody></table></div>
              <div className="responsive-table-wrap" style={{ marginTop: 8 }}><table className="data-table"><thead><tr><th>COLLECTION</th><th>REPORTED</th><th>REMITTED</th><th>ACCEPTED</th><th>STATUS</th></tr></thead><tbody>{agentHistoryQuery.data.collectionReports.map((row) => <tr key={row.id}><td>{row.deliveryNumber}</td><td>{money(row.reportedMinor, workspace.currency)}</td><td>{money(row.remittedMinor, workspace.currency)}</td><td>{money(row.acceptedMinor, workspace.currency)}</td><td>{row.status}</td></tr>)}</tbody></table></div>
            </>}
          </div>}
        </div>
      </div>

      <div className="section-card" style={{ padding: 16, marginTop: 14 }}>
        <h4 style={{ margin: '0 0 10px' }}>Dispatch register and lifecycle</h4>
        <p className="panel-footnote" style={{ marginTop: 0 }}>Failed and returned goods remain reserved here. A return status alone never puts stock back; process the physical return through Inventory before making those goods available again.</p>
        <div style={{ display: 'grid', gap: 10 }}>
          {dispatches.map((item) => <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}><div><strong>{item.deliveryNumber}</strong><span style={{ marginLeft: 8, color: '#64748b', fontSize: 12 }}>{item.receiptNumber ? `Sale ${item.receiptNumber}` : 'Dispatch'}</span><small style={{ display: 'block', color: '#64748b' }}>{item.recipientName || 'Recipient not set'} · {item.agentName || item.deliveryMethod.replaceAll('_',' ')}</small></div><div style={{ textAlign: 'right' }}><strong>{item.status.replaceAll('_',' ')}</strong><small style={{ display: 'block', color: '#64748b' }}>{money(item.goodsSellingMinor, workspace.currency)} goods · Cost {money(item.goodsCostMinor, workspace.currency)}</small></div></div>
            <small style={{ color: '#64748b' }}>{item.deliveryAddress || item.destinationArea || 'Destination not specified'}{item.expectedCollectionMinor > 0 ? ` · Expected collection ${money(item.expectedCollectionMinor, workspace.currency)}` : ''}</small>
            <button type="button" className="button button-secondary button-small" style={{ justifySelf: 'start' }} onClick={() => setSelectedDetailId(selectedDetailId === item.id ? '' : item.id)}>{selectedDetailId === item.id ? 'Hide' : 'View'} dispatch details & history</button>
            {['prepared','assigned','picked_up','in_transit','delivery_failed','return_pending','dispatched'].includes(item.status) && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{(nextStatus[item.status] ?? []).map((next) => <button key={next.status} className="button button-secondary button-small" type="button" disabled={busy} onClick={() => transition(item, next.status)}>{next.label}</button>)}</div>}
            {['in_transit','dispatched','delivered','delivery_failed','return_pending'].includes(item.status) && <button type="button" className="button button-secondary button-small" style={{ justifySelf: 'start' }} onClick={() => setCollectionDeliveryId(item.id)}>Report rider collection</button>}
            {item.saleId && <button type="button" className="button button-secondary button-small" style={{ justifySelf: 'start' }} onClick={() => setDirectReceiptDeliveryId(directReceiptDeliveryId === item.id ? '' : item.id)}>Record customer paid directly to business</button>}
            {directReceiptDeliveryId === item.id && <form className="form-stack" onSubmit={recordDirectReceipt} style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
              <div className="form-two-col"><label className="field-label">Received amount ({workspace.currency})<input type="number" min="0" step={minorUnitFactor(workspace.currency) === 1 ? '1' : '0.01'} value={directReceiptAmount} onChange={(event) => setDirectReceiptAmount(event.target.value)} required /></label><label className="field-label">Method<select value={directReceiptMethod} onChange={(event) => setDirectReceiptMethod(event.target.value)}>{paymentCategories.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
              <div className="form-two-col"><label className="field-label">Provider / bank label<input value={directReceiptLabel} onChange={(event) => setDirectReceiptLabel(event.target.value)} placeholder="Manual description" /></label><label className="field-label">Receipt reference<input value={directReceiptReference} onChange={(event) => setDirectReceiptReference(event.target.value)} /></label></div>
              <div style={{ display: 'flex', gap: 8 }}><button type="submit" className="button button-primary button-small" disabled={busy}>Record direct receipt</button><button type="button" className="button button-secondary button-small" onClick={() => setDirectReceiptDeliveryId('')}>Close</button></div>
              <small className="panel-footnote">This records payment received by the business and links it to this dispatch. It does not verify a bank or mobile-money provider.</small>
            </form>}
            {collectionDeliveryId === item.id && <form className="form-stack" onSubmit={reportCollection} style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10 }}><strong>Rider-reported amounts by payment method</strong>{collectionLines.map((line, index) => <div key={index} style={{ display: 'grid', gap: 7, padding: 10, background: '#f8fafc', borderRadius: 8 }}><div className="form-two-col"><label className="field-label">Method<select value={line.methodCategory} onChange={(event) => updateCollectionLine(index, 'methodCategory', event.target.value)}>{paymentCategories.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field-label">Amount ({workspace.currency})<input type="number" min="0" step={minorUnitFactor(workspace.currency) === 1 ? '1' : '0.01'} value={line.amount} onChange={(event) => updateCollectionLine(index, 'amount', event.target.value)} required /></label></div><div className="form-two-col"><label className="field-label">Network / bank label<input value={line.methodLabel} onChange={(event) => updateCollectionLine(index, 'methodLabel', event.target.value)} placeholder="MTN, Airtel, bank…" /></label><label className="field-label">Reference<input value={line.reference} onChange={(event) => updateCollectionLine(index, 'reference', event.target.value)} /></label></div><label className="field-label">Notes<input value={line.notes} onChange={(event) => updateCollectionLine(index, 'notes', event.target.value)} /></label>{collectionLines.length > 1 && <button type="button" className="button button-secondary button-small" style={{ justifySelf: 'start' }} onClick={() => setCollectionLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>Remove method line</button>}</div>)}<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="button button-secondary button-small" disabled={collectionLines.length >= 20} onClick={() => setCollectionLines((current) => [...current, { methodCategory: 'cash', amount: '', methodLabel: '', reference: '', notes: '' }])}>Add another method</button><button type="submit" className="button button-primary button-small" disabled={busy}>Save rider report</button><button type="button" className="button button-secondary button-small" onClick={() => setCollectionDeliveryId('')}>Close</button></div><small className="panel-footnote">Reported money remains rider-held and does not affect the sale balance or cash drawer.</small></form>}
          </div>)}
          {!dispatches.length && <p className="compact-empty">No POS dispatch records in this branch.</p>}
        </div>
        {dispatches.length > 0 && <div className="form-two-col" style={{ marginTop: 12 }}><label className="field-label">Delivery event reason <input value={eventReason} onChange={(event) => setEventReason(event.target.value)} placeholder="Required for failed / return / cancel" /></label><label className="field-label">Recipient name for delivery proof<input value={eventRecipient} onChange={(event) => setEventRecipient(event.target.value)} placeholder="Who received the goods?" /></label></div>}
      </div>

      <div className="section-card" style={{ padding: 16, marginTop: 14 }}>
        <h4 style={{ margin: '0 0 6px' }}>Rider collection reports and remittances</h4>
        <p className="panel-footnote" style={{ marginTop: 0 }}>“Reported by rider” is a custody claim only. Accepting a remittance creates a sale receipt for the amount accepted and records cash-session movement only when a cash session is supplied.</p>
        <div className="form-two-col" style={{ marginBottom: 10 }}><label className="field-label">Received payment method<select value={remittanceMethod} onChange={(event) => setRemittanceMethod(event.target.value)}>{paymentCategories.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field-label">Network / bank label<input value={remittanceMethodLabel} onChange={(event) => setRemittanceMethodLabel(event.target.value)} placeholder="Optional" /></label><label className="field-label">Receipt / handover reference<input value={remittanceReference} onChange={(event) => setRemittanceReference(event.target.value)} /></label><label className="field-label">Variance / handover notes<input value={remittanceVarianceReason} onChange={(event) => setRemittanceVarianceReason(event.target.value)} placeholder="Explain shortfall, excess or dispute" /></label></div>
        <div style={{ display: 'grid', gap: 8 }}>
          {reports.filter((report) => report.outstandingReportedMinor > 0).map((report) => <div key={report.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr minmax(120px,170px)', alignItems: 'center', gap: 8, borderTop: '1px solid #e2e8f0', paddingTop: 10 }}><input type="checkbox" aria-label={`Select collection report ${report.deliveryNumber} for grouped remittance`} checked={selectedRemittanceReports.includes(report.id)} onChange={(event) => setSelectedRemittanceReports((current) => event.target.checked ? [...current, report.id] : current.filter((id) => id !== report.id))} /><div><strong>{report.deliveryNumber}</strong><small style={{ display: 'block', color: '#64748b' }}>{report.agentName || 'Delivery contact'} · Rider reported {money(report.amountReportedMinor, workspace.currency)} · Accepted {money(report.amountAcceptedMinor, workspace.currency)} · Outstanding {money(report.outstandingReportedMinor, workspace.currency)}</small></div><input aria-label={`Amount accepted from report ${report.id}`} type="number" min="0" max={report.outstandingReportedMinor / minorUnitFactor(workspace.currency)} step={minorUnitFactor(workspace.currency) === 1 ? '1' : '0.01'} value={remittanceAmounts[report.id] ?? String(report.outstandingReportedMinor / minorUnitFactor(workspace.currency))} onChange={(event) => setRemittanceAmounts((current) => ({ ...current, [report.id]: event.target.value }))} /></div>)}
          {!reports.length && <p className="compact-empty">No rider collection reports have been submitted.</p>}
          {reports.filter((report) => report.outstandingReportedMinor <= 0).length > 0 && <p className="panel-footnote">{reports.filter((report) => report.outstandingReportedMinor <= 0).length} collection report(s) fully reconciled.</p>}
          {selectedRemittanceReports.length > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderTop: '1px solid #e2e8f0', paddingTop: 12 }}><span>{selectedRemittanceReports.length} report(s) selected · Accepted allocation total {money(selectedRemittanceTotal, workspace.currency)}</span><button type="button" className="button button-primary button-small" disabled={busy || selectedRemittanceTotal <= 0} onClick={acceptSelectedRemittances}>Accept grouped remittance</button></div>}
        </div>
      </div>

      {selectedDetailId && <div className="section-card" style={{ padding: 16, marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><h4 style={{ margin: 0 }}>Dispatch details and event history</h4><button type="button" className="button button-secondary button-small" onClick={() => setSelectedDetailId('')}>Close</button></div>
        {dispatchDetailQuery.isLoading ? <p>Loading dispatch history…</p> : dispatchDetailQuery.error ? <p className="panel-footnote">Dispatch details could not be loaded. Retry by closing and reopening this panel.</p> : dispatchDetailQuery.data && <>
          <p className="panel-footnote">{dispatchDetailQuery.data.delivery.deliveryNumber} · {dispatchDetailQuery.data.delivery.status.replaceAll('_',' ')} · {dispatchDetailQuery.data.delivery.agentName || dispatchDetailQuery.data.delivery.deliveryMethod.replaceAll('_',' ')}</p>
          <div className="responsive-table-wrap"><table className="data-table"><thead><tr><th>PRODUCT / SKU</th><th>QUANTITY</th><th>SELLING VALUE</th><th>COST VALUE</th></tr></thead><tbody>{dispatchDetailQuery.data.items.map((line) => <tr key={line.id}><td><strong>{line.productName}</strong><small className="subtle-line">{line.sku}</small></td><td>{line.quantity}</td><td>{money(line.totalSellingMinor, workspace.currency)}</td><td>{money(line.totalCostMinor, workspace.currency)}</td></tr>)}</tbody></table></div>
          <div style={{ display: 'grid', gap: 8, marginTop: 14 }}><strong>Lifecycle events</strong>{dispatchDetailQuery.data.events.map((event) => <div key={event.id} style={{ borderLeft: '3px solid #93c5fd', padding: '4px 10px' }}><strong>{event.newStatus.replaceAll('_',' ')}</strong><small style={{ display: 'block', color: '#64748b' }}>{new Date(event.occurredAt).toLocaleString()}{event.actorName ? ` · ${event.actorName}` : event.actorUserId ? ` · Actor ${event.actorUserId.slice(0,8)}` : ''}</small>{event.reason && <small>{event.reason}</small>}{event.recipientName && <small>Recipient: {event.recipientName}</small>}</div>)}{!dispatchDetailQuery.data.events.length && <small>No lifecycle events have been recorded.</small>}</div>
        </>}
      </div>}
    </section>
  );
}
