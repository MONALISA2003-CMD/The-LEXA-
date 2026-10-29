#!/usr/bin/env python3
"""Apply the LEXA preview workflow-completion patch with source guards and idempotency."""
from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT
PAGE_PATH = FRONTEND / "src/modules/operations/OperationsWorkspacePage.tsx"
TOOLS_PATH = FRONTEND / "src/data/mock/previewDataTools.ts"
CATALOG_PATH = FRONTEND / "src/modules/operations/moduleCatalog.ts"
APP_SHELL_PATH = FRONTEND / "src/app/layouts/AppShell.tsx"
ROUTER_PATH = FRONTEND / "src/app/router.tsx"
BUSINESS_TOOLS_PATH = FRONTEND / "src/modules/tools/BusinessToolsPage.tsx"
BUSINESS_TOOLS_DATA_PATH = FRONTEND / "src/data/local/businessTools.ts"
TYPES_PATH = FRONTEND / "src/domain/shared/types.ts"
WORKFLOW_CONTRACTS_PATH = FRONTEND / "src/data/contracts/workflows.ts"
SALES_WORKFLOW_PATH = FRONTEND / "src/data/local/sales-workflow.ts"
CHECKOUT_PATH = FRONTEND / "src/modules/checkout/CheckoutPage.tsx"
SALE_DETAIL_PATH = FRONTEND / "src/modules/sales/SaleDetailPage.tsx"
REPORTS_DATA_PATH = FRONTEND / "src/data/local/reports.ts"
MAIN_PATH = FRONTEND / "src/main.tsx"
BRAND_CSS_PATH = FRONTEND / "src/styles/lexa-brand.css"
BRAND_LOGO_PATH = FRONTEND / "public/lexa-logo.png"
BRAND_FAVICON_PATH = FRONTEND / "public/lexa-favicon.png"
INDEX_PATH = FRONTEND / "index.html"


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"{label}: expected exactly one source match, found {count}; no source changes written")
    return text.replace(old, new, 1)


def between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    first = text.find(start)
    if first < 0:
        fail(f"{label}: start marker not found")
    second = text.find(end, first + len(start))
    if second < 0:
        fail(f"{label}: end marker not found")
    return text[:first] + replacement + text[second:]


def generic_values_source() -> str:
    return r'''function genericRelatedValues(sourceModuleId: string, source: PreviewRecord, targetId: string): FormValues {
  const target = getModuleDefinition(targetId);
  const today = dateInputValue(new Date());
  const dueDate = dateInputValue(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const sourceReferenceField = REFERENCE_FIELDS[sourceModuleId];
  const sourceReference = sourceReferenceField ? (source[sourceReferenceField] ?? source.id) : source.id;

  if (!target) return {};
  if (targetId === 'audit') {
    const sourceTitle = getModuleDefinition(sourceModuleId)?.title ?? sourceModuleId;
    return {
      eventDate: today,
      actor: 'Preview workspace user',
      action: 'Review note created',
      entity: sourceTitle,
      reference: sourceReference,
      detail: `Preview review note for ${sourceTitle} ${sourceReference}. This is not a trusted security audit event or a posted business transaction.`,
      status: 'Recorded',
    };
  }

  const aliases: Record<string, string[]> = {
    customer: ['customer', 'customerName', 'company', 'contactName', 'clientName', 'accountName', 'partyName'],
    customerName: ['customerName', 'customer', 'company', 'contactName', 'clientName'],
    company: ['company', 'customer', 'customerName', 'contactName', 'name'],
    contactName: ['contactName', 'contact', 'customer', 'customerName', 'name'],
    contact: ['contact', 'phone', 'phoneNumber', 'contactName'],
    phone: ['phone', 'contact', 'phoneNumber'],
    email: ['email', 'contactEmail'],
    supplier: ['supplier', 'supplierName', 'preferredSupplier', 'supplierInvited', 'vendor'],
    supplierName: ['supplierName', 'supplier', 'preferredSupplier', 'vendor'],
    partyName: ['partyName', 'customer', 'supplier', 'payee', 'company'],
    itemSummary: ['itemSummary', 'itemDescription', 'productName', 'product', 'bundleName', 'description', 'task'],
    itemDescription: ['itemDescription', 'itemSummary', 'productName', 'product', 'description'],
    item: ['item', 'product', 'productName', 'itemSummary', 'itemDescription'],
    product: ['product', 'productName', 'itemSummary', 'itemDescription'],
    productName: ['productName', 'finishedProductName', 'bundleName', 'itemSummary', 'product', 'item'],
    productSKU: ['productSKU', 'finishedProductSKU', 'sku', 'productCode'],
    sku: ['sku', 'productSKU', 'finishedProductSKU', 'bundleCode'],
    quantity: ['quantity', 'recommendedQuantity', 'orderedQuantity', 'plannedQuantity', 'unitsToPick'],
    orderedQuantity: ['orderedQuantity', 'quantity', 'plannedQuantity'],
    unitPrice: ['unitPrice', 'sellingPrice', 'estimatedValue', 'amount'],
    unitCost: ['unitCost', 'costPrice', 'unitPrice', 'amount'],
    amount: ['amount', 'amountDue', 'netPay', 'total', 'estimatedValue'],
    amountDue: ['amountDue', 'total', 'amount', 'estimatedValue'],
    amountPaid: ['amountPaid', 'amountReceived', 'paidAmount'],
    amountReceived: ['amountReceived', 'amountPaid', 'paidAmount'],
    taxRate: ['taxRate'],
    taxTreatment: ['taxTreatment'],
    project: ['project', 'projectName', 'projectCode'],
    projectName: ['projectName', 'project', 'projectCode', 'name'],
    task: ['task', 'taskName', 'subject', 'description'],
    taskName: ['taskName', 'task', 'subject'],
    employee: ['employee', 'employeeName', 'memberName', 'operator'],
    employeeName: ['employeeName', 'employee', 'memberName'],
    operator: ['operator', 'employee', 'employeeName'],
    owner: ['owner', 'assignedTo', 'manager', 'preparedBy'],
    assignedTo: ['assignedTo', 'owner', 'manager'],
    department: ['department', 'group', 'team'],
    warehouse: ['warehouse', 'location', 'warehouseName'],
    location: ['location', 'warehouse', 'locationCode'],
    account: ['account', 'accountName', 'terminal', 'moneyAccount'],
    accountName: ['accountName', 'account', 'name'],
    campaign: ['campaign', 'campaignCode', 'source'],
    source: ['source', 'campaign', 'campaignCode'],
    description: ['description', 'itemSummary', 'subject', 'name', 'title', 'nextAction'],
    subject: ['subject', 'description', 'itemSummary', 'name'],
    purpose: ['purpose', 'description', 'nextAction'],
    salesOrder: ['salesOrder', 'orderNumber', 'salesOrderReference', 'sourceOrder'],
    salesOrderReference: ['salesOrderReference', 'orderNumber', 'salesOrder', 'sourceOrder'],
    orderNumber: ['orderNumber', 'quoteNumber', 'salesOrder', 'invoiceNumber'],
    purchaseOrder: ['purchaseOrder', 'poNumber', 'orderNumber', 'billNumber'],
    purchaseOrderReference: ['purchaseOrderReference', 'poNumber', 'orderNumber'],
    sourceInvoice: ['sourceInvoice', 'invoiceNumber'],
    sourcePurchaseOrder: ['sourcePurchaseOrder', 'purchaseOrder', 'poNumber', 'billNumber'],
    rfqNumber: ['rfqNumber', 'requestNumber'],
    requestNumber: ['requestNumber', 'purchaseRequest'],
    sourceReference: ['sourceReference', sourceReferenceField ?? 'id'],
    reference: [sourceReferenceField ?? 'id', 'sourceReference', 'reference', 'invoiceNumber', 'orderNumber'],
    ticketNumber: ['ticketNumber', 'supportReference'],
    priority: ['priority'],
    channel: ['channel'],
    category: ['category'],
    branch: ['branch', 'branches'],
    role: ['role'],
    frequency: ['frequency'],
    currency: ['currency'],
    taxCode: ['taxCode', 'taxCodeReference'],
    costCenter: ['costCenter', 'costCenterCode', 'name'],
    costCenterCode: ['costCenterCode', 'costCenter'],
    bundleName: ['bundleName', 'productName', 'itemSummary'],
    bomReference: ['bomReference', 'bomCode'],
    workOrderNumber: ['workOrderNumber', 'jobCardNumber'],
    sourceType: ['sourceType'],
  };
  const result: FormValues = {};
  for (const field of target.fields) {
    if (field.key === 'status') continue;
    const candidates = aliases[field.key] ?? [field.key];
    const found = candidates.map((key) => source[key]).find((value) => typeof value === 'string' && value.trim().length > 0);
    if (found !== undefined) result[field.key] = found;
    else if (field.kind === 'date') {
      if (/(due|valid|expected|target|response|needed|needby|nextRun)/i.test(field.key)) result[field.key] = dueDate;
      else result[field.key] = today;
    }
  }
  // Use deliberate semantics for common business documents where a generic same-key copy is unsafe.
  if (targetId === 'sales-orders' && sourceModuleId === 'opportunities') {
    result.customer = source.company ?? source.contactName ?? '';
    result.itemSummary = source.nextAction ?? ('Opportunity ' + (source.opportunityCode ?? source.id));
    result.quantity = '1';
    result.unitPrice = source.amount ?? source.estimatedValue ?? '0';
    result.discountPercent = '0';
    result.taxTreatment = 'Standard rated';
    result.taxRate = '18';
  }
  if (targetId === 'payments' && sourceModuleId === 'payroll') {
    result.direction = 'Money out';
    result.partyType = 'Other';
    result.partyName = 'Payroll run ' + (source.payrollReference ?? source.id);
    result.amount = source.netPay ?? '0';
    result.notes = 'Preview payment for payroll run ' + (source.payrollReference ?? source.id) + '; no external transfer is initiated.';
  }
  return result;
}

'''


def apply_core_credit_workflow(types: str, contracts: str, service: str, checkout: str, detail: str, reports: str) -> tuple[str, str, str, str, str, str]:
    """Add split-tender credit sales and later payment collection without changing the core storage model."""
    sale_marker = "  customerName?: string;\n  totalMinor: number;"
    sale_fields = "  customerName?: string;\n  customerPhone?: string;\n  promisedPaymentDate?: string;\n  totalMinor: number;"
    if "customerPhone?: string;" not in types:
        types = replace_once(types, sale_marker, sale_fields, "Sale customer phone and promise fields")
    input_marker = "  customerName?: string;\n}\n\nexport interface ReturnItemInput"
    input_fields = "  customerName?: string;\n  customerPhone?: string;\n  promisedPaymentDate?: string;\n}\n\nexport interface ReturnItemInput"
    if "export interface CompleteSaleInput" in types and "promisedPaymentDate?: string;" not in types[types.index("export interface CompleteSaleInput"):types.index("export interface ReturnItemInput")]:
        types = replace_once(types, input_marker, input_fields, "CompleteSaleInput credit contact fields")

    contract_import = "import type { CompleteSaleInput, RecordReturnInput, Sale, SaleReturn } from '../../domain/shared/types';"
    if "ReceivePaymentInput" not in contracts:
        contracts = replace_once(contracts, contract_import,
            "import type { CompleteSaleInput, PaymentMethod, PaymentRecord, RecordReturnInput, Sale, SaleReturn } from '../../domain/shared/types';",
            "sales workflow payment type imports")
        contract_anchor = "export interface SalesWorkflow {"
        receive_types = """export interface ReceivePaymentInput {
  workspaceId: string;
  branchId: string;
  saleId: string;
  method: PaymentMethod;
  amountMinor: number;
  reference?: string;
}

export interface ReceivePaymentResult {
  payment: PaymentRecord;
  outstandingMinor: number;
}

"""
        contracts = replace_once(contracts, contract_anchor, receive_types + contract_anchor, "receive-payment workflow contracts")
    if "receivePayment(input: ReceivePaymentInput)" not in contracts:
        contracts = replace_once(contracts, "  completeSale(input: CompleteSaleInput): Promise<SaleCompletionResult>;",
            "  completeSale(input: CompleteSaleInput): Promise<SaleCompletionResult>;\n  receivePayment(input: ReceivePaymentInput): Promise<ReceivePaymentResult>;",
            "receive-payment workflow interface")

    service_import = "import type { SalesWorkflow } from '../contracts/workflows';"
    if "ReceivePaymentInput" not in service:
        service = replace_once(service, service_import,
            "import type { ReceivePaymentInput, SalesWorkflow } from '../contracts/workflows';", "receive payment service import")
    sale_customer_marker = "        ...(input.customerName?.trim() ? { customerName: input.customerName.trim() } : {}),"
    sale_customer_fields = sale_customer_marker + "\n        ...(input.customerPhone?.trim() ? { customerPhone: input.customerPhone.trim() } : {}),\n        ...(promisedDate ? { promisedPaymentDate: promisedDate } : {}),"
    if "input.customerPhone" not in service:
        service = replace_once(service, sale_customer_marker, sale_customer_fields, "persist credit-sale contact and promise")

    credit_validation = """      const paidMinor = payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
      const creditDueMinor = totalMinor - paidMinor;
      if (creditDueMinor > 0 && (!input.customerName?.trim() || !input.customerPhone?.trim())) {
        throw new Error('Credit sales require a named customer and phone number.');
      }
      const promisedDate = creditDueMinor > 0
        ? input.promisedPaymentDate?.trim() || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        : undefined;
"""
    if "const creditDueMinor = totalMinor - paidMinor;" not in service:
        service = replace_once(service, "      const payments = validatePaymentAllocations(input.payments, totalMinor);\n", "      const payments = validatePaymentAllocations(input.payments, totalMinor);\n" + credit_validation, "enforce credit-sale contact and payment rules")

    if "async receivePayment(input: ReceivePaymentInput)" not in service:
        receive_method = r'''  async receivePayment(input: ReceivePaymentInput) {
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error('Payment amount must be a positive whole minor-unit amount.');
    const timestamp = nowIso();
    let paymentRecord: PaymentRecord | undefined;
    let outstandingAfter = 0;
    await db.transaction('rw', [db.workspaces, db.branches, db.sales, db.returns, db.payments, db.auditEvents], async () => {
      const workspace = await db.workspaces.get(input.workspaceId);
      const branch = await db.branches.get(input.branchId);
      const sale = await db.sales.get(input.saleId);
      if (!workspace) throw new Error('Business workspace not found.');
      if (!branch || branch.workspaceId !== input.workspaceId) throw new Error('Selected branch does not belong to this workspace.');
      if (!sale || sale.workspaceId !== input.workspaceId) throw new Error('Sale not found in this business.');
      if (sale.branchId !== input.branchId) throw new Error('Switch to the original sale branch before recording a payment.');
      const [previousPayments, previousReturns] = await Promise.all([
        db.payments.where('[workspaceId+saleId]').equals([input.workspaceId, input.saleId]).toArray(),
        db.returns.where('[workspaceId+saleId]').equals([input.workspaceId, input.saleId]).toArray(),
      ]);
      const receivedMinor = previousPayments.filter((payment) => payment.kind === 'receipt').reduce((sum, payment) => sum + payment.amountMinor, 0);
      const returnedMinor = previousReturns.reduce((sum, record) => sum + record.totalMinor, 0);
      const outstanding = Math.max(0, sale.totalMinor - returnedMinor - receivedMinor);
      if (input.amountMinor > outstanding) throw new Error(`Payment exceeds the outstanding balance of ${outstanding} minor units.`);
      paymentRecord = {
        id: createId('pay'), workspaceId: input.workspaceId, saleId: input.saleId,
        kind: 'receipt', method: input.method, amountMinor: input.amountMinor,
        ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}), createdAt: timestamp,
      };
      await db.payments.add(paymentRecord);
      await db.auditEvents.add({
        id: createId('audit'), workspaceId: input.workspaceId, branchId: input.branchId,
        entityType: 'sale_payment', entityId: paymentRecord.id, action: 'payment_received',
        ...(input.reference?.trim() ? { reason: input.reference.trim() } : {}), createdAt: timestamp,
      });
      outstandingAfter = outstanding - input.amountMinor;
    });
    if (!paymentRecord) throw new Error('Payment could not be recorded. No payment record was committed.');
    return { payment: paymentRecord, outstandingMinor: outstandingAfter };
  },

'''
        service = replace_once(service, "  async recordReturn(input: RecordReturnInput) {", receive_method + "  async recordReturn(input: RecordReturnInput) {", "receive later sale payment service")

    # Split-tender fields on checkout; unpaid value remains calculated as customer credit.
    if "type PaymentLineDraft =" not in checkout:
        checkout = replace_once(checkout, "export default function CheckoutPage() {",
            "type PaymentLineDraft = { id: string; method: PaymentMethod; amount: string; reference: string };\n\nexport default function CheckoutPage() {",
            "checkout split payment line type")
    old_state = "  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');\n  const [paymentAmount, setPaymentAmount] = useState('0');\n  const [paymentReference, setPaymentReference] = useState('');"
    new_state = "  const [paymentLines, setPaymentLines] = useState<PaymentLineDraft[]>([{ id: 'payment-line-initial', method: 'cash', amount: '0', reference: '' }]);\n  const [customerPhone, setCustomerPhone] = useState('');\n  const [promisedPaymentDate, setPromisedPaymentDate] = useState('');"
    if "const [paymentLines, setPaymentLines]" not in checkout:
        checkout = replace_once(checkout, old_state, new_state, "checkout split-payment state")
    payment_effect = "  useEffect(() => { setPaymentAmount(String(totalMinor / factor)); }, [totalMinor, factor]);"
    if payment_effect in checkout:
        checkout = replace_once(checkout, payment_effect,
            "  useEffect(() => { setPaymentLines((current) => current.length === 1 && current[0] ? [{ ...current[0], amount: String(totalMinor / factor) }] : current); }, [totalMinor, factor]);",
            "single-payment auto-fill")
    reset_effect = "  useEffect(() => { setCart({}); setCustomerName(''); setPaymentReference(''); }, [workspace.id, branch.id]);"
    if reset_effect in checkout:
        checkout = replace_once(checkout, reset_effect,
            "  useEffect(() => { setCart({}); setCustomerName(''); setCustomerPhone(''); setPromisedPaymentDate(''); setPaymentLines([{ id: 'payment-line-' + Date.now(), method: 'cash', amount: '0', reference: '' }]); }, [workspace.id, branch.id]);",
            "checkout reset on workspace change")
    if "const paymentAllocatedMinor = paymentLines.reduce" not in checkout:
        checkout = replace_once(checkout, "  const factor = minorUnitFactor(workspace.currency);",
            "  const factor = minorUnitFactor(workspace.currency);\n  const paymentAllocatedMinor = paymentLines.reduce((sum, line) => { try { return sum + parseMajorAmount(line.amount || '0', workspace.currency); } catch { return sum; } }, 0);\n  const creditDueMinor = totalMinor - paymentAllocatedMinor;",
            "derived paid and credit totals")

    if "function addPaymentLine()" not in checkout:
        methods = r'''  function addPaymentLine() {
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

'''
        checkout = replace_once(checkout, "  async function completeSale(event: FormEvent<HTMLFormElement>) {", methods + "  async function completeSale(event: FormEvent<HTMLFormElement>) {", "checkout payment-line controls")

    function_start = "  async function completeSale(event: FormEvent<HTMLFormElement>) {"
    function_end = "\n\n  return ("
    function_body = r'''  async function completeSale(event: FormEvent<HTMLFormElement>) {
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
      toast.success('Sale recorded', { description: `Receipt ${result.sale.receiptNumber} saved locally${creditMinor > 0 ? '; customer credit remains outstanding.' : '.'}` });
      navigate(`/sales/${result.sale.id}`);
    } catch (error) {
      toast.error('Sale was not completed', { description: error instanceof Error ? error.message : 'No sale records were committed. Check the cart and try again.' });
    } finally { setSubmitting(false); }
  }'''
    if "payments: [{ method: paymentMethod, amountMinor" in checkout:
        checkout = between(checkout, function_start, function_end, function_body, "split-payment sale submission")
    elif "const creditMinor = totalMinor - allocatedMinor;" not in checkout:
        fail("checkout payment function does not match expected source")

    customer_old = '<label className="field-label">Customer name <span className="optional-label">OPTIONAL</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Walk-in customer" /></label>'
    customer_new = '<label className="field-label">Customer name {creditDueMinor > 0 ? <span className="required-mark">REQUIRED FOR CREDIT</span> : <span className="optional-label">OPTIONAL</span>}<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Walk-in customer" required={creditDueMinor > 0} /></label><label className="field-label">Customer phone {creditDueMinor > 0 && <span className="required-mark">REQUIRED FOR CREDIT</span>}<input type="tel" inputMode="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="e.g. 07XX XXX XXX" required={creditDueMinor > 0} /></label>'
    if customer_old in checkout:
        checkout = replace_once(checkout, customer_old, customer_new, "checkout customer phone field")

    payment_ui_old = '<div className="form-two-col"><label className="field-label">Recorded payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>{paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label><label className="field-label">Amount received ({workspace.currency})<input inputMode="decimal" type="number" min="0" step={factor === 1 ? \'1\' : \'0.01\'} value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label></div><label className="field-label">Payment reference <span className="optional-label">OPTIONAL</span><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Transaction ID or note" /></label>'
    payment_ui_new = '''<div style={{ display: 'grid', gap: 10 }}><div><strong>Payment lines</strong><p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 11 }}>Split a sale between cash, MTN MoMo, Airtel Money, bank or other recorded methods.</p></div>{paymentLines.map((line, index) => <div key={line.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, display: 'grid', gap: 10 }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><strong>Payment {index + 1}</strong>{paymentLines.length > 1 && <button type="button" className="button button-secondary button-small" onClick={() => removePaymentLine(line.id)}>Remove line</button>}</div><div className="form-two-col"><label className="field-label">Method<select value={line.method} onChange={(event) => updatePaymentLine(line.id, { method: event.target.value as PaymentMethod })}>{paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label><label className="field-label">Amount received ({workspace.currency})<input inputMode="decimal" type="number" min="0" step={factor === 1 ? '1' : '0.01'} value={line.amount} onChange={(event) => updatePaymentLine(line.id, { amount: event.target.value })} required /></label></div><label className="field-label">Payment reference <span className="optional-label">OPTIONAL</span><input value={line.reference} onChange={(event) => updatePaymentLine(line.id, { reference: event.target.value })} placeholder="Transaction ID / receipt ref" /></label></div>)}<button type="button" className="button button-secondary" onClick={addPaymentLine}><Plus size={14} /> Add split-payment line</button><div className="payment-footnote"><Wallet size={16} /><span>Recorded payments: {formatMinorAmount(paymentAllocatedMinor, workspace.currency)} · {creditDueMinor > 0 ? `Credit due: ${formatMinorAmount(creditDueMinor, workspace.currency)}` : creditDueMinor < 0 ? `Overpaid by ${formatMinorAmount(Math.abs(creditDueMinor), workspace.currency)} — reduce the payment lines.` : 'Fully paid'}. LEXA only records methods; no external transfer is initiated.</span></div>{creditDueMinor > 0 && <label className="field-label">Promised payment date <span className="optional-label">OPTIONAL</span><input type="date" min={new Date().toISOString().slice(0, 10)} value={promisedPaymentDate} onChange={(event) => setPromisedPaymentDate(event.target.value)} /></label>}</div>'''
    if "value={paymentMethod}" in checkout:
        checkout = replace_once(checkout, payment_ui_old, payment_ui_new, "split payment line editor")
    elif "Add split-payment line" not in checkout:
        fail("checkout payment-line editor marker not found")

    # Enable later instalments from the sale detail screen and show derived credit status.
    detail_import_old = "import { useMemo, useState, type FormEvent } from 'react';"
    detail_import_new = "import { useEffect, useMemo, useState, type FormEvent } from 'react';"
    if detail_import_old in detail:
        detail = replace_once(detail, detail_import_old, detail_import_new, "sale detail effect import")
    detail_money_old = "import { formatMinorAmount } from '../../domain/money/money';"
    detail_money_new = "import { formatMinorAmount, minorUnitFactor, parseMajorAmount } from '../../domain/money/money';"
    if detail_money_old in detail:
        detail = replace_once(detail, detail_money_old, detail_money_new, "sale detail money helpers")

    if "const [receiveAmount, setReceiveAmount]" not in detail:
        detail_state_old = "  const [saving, setSaving] = useState(false);"
        detail_state_new = "  const [saving, setSaving] = useState(false);\n  const [receivingPayment, setReceivingPayment] = useState(false);\n  const [receiveMethod, setReceiveMethod] = useState<PaymentMethod>('cash');\n  const [receiveAmount, setReceiveAmount] = useState('');\n  const [receiveReference, setReceiveReference] = useState('');"
        detail = replace_once(detail, detail_state_old, detail_state_new, "sale detail receive-payment state")

    outstanding_old = "  const outstanding = Math.max(0, (detail?.sale.totalMinor ?? 0) - returnTotal - receiptTotal + refundTotal);"
    outstanding_new = "  const outstanding = Math.max(0, (detail?.sale.totalMinor ?? 0) - returnTotal - receiptTotal);\n  const todayInWorkspace = new Intl.DateTimeFormat('en-CA', { timeZone: workspace.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());\n  const isOverdue = Boolean(outstanding > 0 && detail?.sale.promisedPaymentDate && detail.sale.promisedPaymentDate < todayInWorkspace);\n  useEffect(() => { if (outstanding > 0) setReceiveAmount(String(outstanding / minorUnitFactor(workspace.currency))); }, [outstanding, workspace.currency, saleId]);"
    if outstanding_old in detail:
        detail = replace_once(detail, outstanding_old, outstanding_new, "sale balance / overdue derivation")
    elif "const isOverdue = Boolean(outstanding > 0" not in detail:
        fail("Sale detail outstanding calculation does not match the expected source")

    if "async function submitReceivedPayment(" not in detail:
        receive_submit = r'''  async function submitReceivedPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!saleId || !detail || !isCorrectBranch) return;
    let amountMinor: number;
    try { amountMinor = parseMajorAmount(receiveAmount, workspace.currency); }
    catch (error) { toast.error('Check the payment amount', { description: error instanceof Error ? error.message : 'Enter a valid amount.' }); return; }
    if (amountMinor <= 0) { toast.error('Enter a payment greater than zero.'); return; }
    setReceivingPayment(true);
    try {
      const result = await salesWorkflow.receivePayment({
        workspaceId: workspace.id, branchId: branch.id, saleId, method: receiveMethod, amountMinor,
        ...(receiveReference.trim() ? { reference: receiveReference.trim() } : {}),
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['sale-detail', workspace.id, saleId] }),
        client.invalidateQueries({ queryKey: ['sales', workspace.id] }),
        client.invalidateQueries({ queryKey: ['dashboard', workspace.id, branch.id] }),
      ]);
      setReceiveReference('');
      toast.success('Customer payment recorded', { description: `Remaining balance: ${formatMinorAmount(result.outstandingMinor, workspace.currency)}. No external transfer was initiated.` });
    } catch (error) {
      toast.error('Payment was not recorded', { description: error instanceof Error ? error.message : 'No payment record was committed.' });
    } finally { setReceivingPayment(false); }
  }

'''
        detail = replace_once(detail, "  async function submitReturn(event: FormEvent<HTMLFormElement>) {", receive_submit + "  async function submitReturn(event: FormEvent<HTMLFormElement>) {", "sale detail payment collection handler")

    status_old = '<span className="status-pill status-good">Completed</span>'
    status_new = '<span className={"status-pill " + (outstanding === 0 ? "status-good" : isOverdue ? "status-danger" : "status-muted")}>{outstanding === 0 ? "Paid" : isOverdue ? "Overdue" : receiptTotal > 0 ? "Part-paid" : "Unpaid"}</span>'
    if status_old in detail:
        detail = replace_once(detail, status_old, status_new, "derived payment status badge")
    meta_old = '<div><span>Customer</span><strong>{detail.sale.customerName || \'Walk-in customer\'}</strong></div></div></section>'
    meta_new = '<div><span>Customer</span><strong>{detail.sale.customerName || \'Walk-in customer\'}</strong></div><div><span>Phone</span><strong>{detail.sale.customerPhone || \'—\'}</strong></div><div><span>Promised date</span><strong>{detail.sale.promisedPaymentDate || \'Not set\'}</strong></div></div></section>'
    if meta_old in detail:
        detail = replace_once(detail, meta_old, meta_new, "customer phone / promised date receipt details")

    receive_form_marker = '<div className="panel-footnote">An amount recorded here is not proof of an external transfer. LEXA has not initiated any payment.</div>'
    receive_form = '''{outstanding > 0 && isCorrectBranch && <form onSubmit={submitReceivedPayment} className="form-stack" style={{ padding: '14px 16px', margin: '12px 16px', border: '1px solid #dbeafe', borderRadius: 10, background: '#f8fbff' }}><div><strong>Receive customer payment</strong><p style={{ margin: '4px 0 10px', color: '#64748b', fontSize: 11 }}>Balance due: {formatMinorAmount(outstanding, workspace.currency)}. Record instalments against this receipt; no money is transferred by LEXA.</p></div><label className="field-label">Payment method<select value={receiveMethod} onChange={(event) => setReceiveMethod(event.target.value as PaymentMethod)}>{refundMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label><label className="field-label">Amount received ({workspace.currency})<input type="number" inputMode="decimal" min="0" step={minorUnitFactor(workspace.currency) === 1 ? '1' : '0.01'} value={receiveAmount} onChange={(event) => setReceiveAmount(event.target.value)} required /></label><label className="field-label">Reference <span className="optional-label">OPTIONAL</span><input value={receiveReference} onChange={(event) => setReceiveReference(event.target.value)} placeholder="MoMo / bank reference" /></label><button type="submit" className="button button-primary" disabled={receivingPayment}>{receivingPayment ? 'Recording…' : 'Record instalment'} <Check size={15} /></button></form>}'''
    if "submitReceivedPayment" not in detail:
        fail("receive payment handler is missing before rendering form")
    if receive_form_marker in detail and "Receive customer payment</strong>" not in detail:
        detail = replace_once(detail, receive_form_marker, receive_form + receive_form_marker, "sale detail receive-payment form")

    # The dashboard's receivable figure must not add refunds to an amount owed; refunds are a separate cash-out.
    reports = reports.replace("const outstandingMinor = Math.max(0, netSalesMinor - recordedReceiptsMinor + recordedRefundsMinor);", "const outstandingMinor = Math.max(0, netSalesMinor - recordedReceiptsMinor);")
    return types, contracts, service, checkout, detail, reports


def main() -> None:
    for path in (PAGE_PATH, TOOLS_PATH, CATALOG_PATH, APP_SHELL_PATH, ROUTER_PATH, BUSINESS_TOOLS_PATH, BUSINESS_TOOLS_DATA_PATH, TYPES_PATH, WORKFLOW_CONTRACTS_PATH, SALES_WORKFLOW_PATH, CHECKOUT_PATH, SALE_DETAIL_PATH, REPORTS_DATA_PATH, MAIN_PATH, BRAND_CSS_PATH, BRAND_LOGO_PATH, BRAND_FAVICON_PATH, INDEX_PATH):
        if not path.exists():
            fail(f"required source file is missing: {path.relative_to(ROOT)}")

    page = PAGE_PATH.read_text(encoding="utf-8")
    tools = TOOLS_PATH.read_text(encoding="utf-8")
    catalog = CATALOG_PATH.read_text(encoding="utf-8")
    app_shell = APP_SHELL_PATH.read_text(encoding="utf-8")
    router = ROUTER_PATH.read_text(encoding="utf-8")
    types = TYPES_PATH.read_text(encoding="utf-8")
    workflow_contracts = WORKFLOW_CONTRACTS_PATH.read_text(encoding="utf-8")
    sales_workflow = SALES_WORKFLOW_PATH.read_text(encoding="utf-8")
    checkout = CHECKOUT_PATH.read_text(encoding="utf-8")
    sale_detail = SALE_DETAIL_PATH.read_text(encoding="utf-8")
    reports_data = REPORTS_DATA_PATH.read_text(encoding="utf-8")
    main_tsx = MAIN_PATH.read_text(encoding="utf-8")
    index_html = INDEX_PATH.read_text(encoding="utf-8")

    # Apply LEXA's official identity to the existing shell and load the shared brand system.
    logo_markup = '            <div className="brand-mark">L</div>\n            <div><div className="brand-name">LEXA</div><div className="brand-caption">BUSINESS OPERATING SYSTEM</div></div>'
    logo_replacement = '            <div className="lexa-brand-logo-frame"><img className="lexa-brand-logo" src="/lexa-logo.png" alt="LEXA — Sales, Inventory, Business Management" /></div>'
    if 'className="lexa-brand-logo-frame"' not in app_shell:
        app_shell = replace_once(app_shell, logo_markup, logo_replacement, "official LEXA sidebar logo")

    icon_marker = '  Package, PackageCheck, ReceiptText, Settings, ShoppingCart, Store, Tag, Truck, Users, Wallet, X,\n'
    if 'Moon, Sun' not in app_shell[:app_shell.find('export default function AppShell')]:
        app_shell = replace_once(app_shell, icon_marker, '  Package, PackageCheck, ReceiptText, Settings, ShoppingCart, Store, Tag, Truck, Users, Wallet, X, Moon, Sun,\n', "theme-toggle icons")

    # Theme state is injected into the Simple/Advanced state block below.

    notification_marker = '              <button className="icon-button notification-button" aria-label="Notifications"'
    theme_button = '              <button className="icon-button theme-toggle" type="button" aria-label={theme === \'dark\' ? \'Switch to light mode\' : \'Switch to dark mode\'} title={theme === \'dark\' ? \'Switch to light mode\' : \'Switch to dark mode\'} onClick={() => setTheme((current) => current === \'dark\' ? \'light\' : \'dark\')}>{theme === \'dark\' ? <Sun size={17} /> : <Moon size={17} />}</button>\n' + notification_marker
    if 'className="icon-button theme-toggle"' not in app_shell:
        app_shell = replace_once(app_shell, notification_marker, theme_button, "theme switch control")

    css_import = "import './styles/phase-two.css';\n"
    if "import './styles/lexa-brand.css';" not in main_tsx:
        main_tsx = replace_once(main_tsx, css_import, css_import + "import './styles/lexa-brand.css';\n", "brand stylesheet import")
    if '<link rel="icon" type="image/png" href="/lexa-favicon.png" />' not in index_html:
        index_html = replace_once(index_html, '    <meta name="theme-color" content="#010d27" />', '    <meta name="theme-color" content="#06132f" />\n    <link rel="icon" type="image/png" href="/lexa-favicon.png" />', "LEXA browser icon and theme color")

    # Fix the reported strict TypeScript errors.
    if "definition.title" in tools:
        count = tools.count("definition.title")
        if count != 2:
            fail(f"previewDataTools.ts: expected two definition.title references, found {count}")
        tools = tools.replace("definition.title", "definition.id")
    elif "definition.id} export contains invalid rows" in tools and "definition.id} export contains duplicate record IDs" in tools:
        print("TypeScript title-reference fix already applied")
    else:
        fail("previewDataTools.ts does not match the expected seed-validation source")

    # Add the shared graph import once.
    if "from './workflowGraph'" not in page:
        marker = "} from './moduleCatalog';\n"
        page = replace_once(page, marker, marker + "import { getCoreScreenShortcuts, getRelatedActions, isDuplicateSensitiveHandoff } from './workflowGraph';\n", "workflow graph import")
    elif "isDuplicateSensitiveHandoff" not in page:
        for old_import in (
            "import { getCoreScreenShortcuts, getRelatedActions } from './workflowGraph';",
            "import { getRelatedActions } from './workflowGraph';",
        ):
            if old_import in page:
                page = replace_once(page, old_import, "import { getCoreScreenShortcuts, getRelatedActions, isDuplicateSensitiveHandoff } from './workflowGraph';", "workflow graph import update")
                break
        else:
            fail("workflow graph import exists in an unsupported shape; refusing an unsafe import edit")

    # Replace the hand-maintained, narrow relation function with the shared, tested graph.
    action_start = "function relatedActions(moduleId: string, record: PreviewRecord): RelatedAction[] {"
    values_start = "function relatedValues(sourceModuleId: string, source: PreviewRecord, targetId: string): FormValues {"
    action_replacement = "function relatedActions(moduleId: string, record: PreviewRecord): RelatedAction[] {\n  return getRelatedActions(moduleId, record);\n}\n\n"
    if "return getRelatedActions(moduleId, record);" not in page:
        page = between(page, action_start, values_start, action_replacement, "related action function")

    # Supply a type-aware fallback for the new hand-offs; existing explicit mappings remain authoritative.
    values_start_index = page.find(values_start)
    module_manager_index = page.find("function ModuleManager(", values_start_index)
    if values_start_index < 0 or module_manager_index < 0:
        fail("relatedValues/ModuleManager markers not found")
    values_chunk = page[values_start_index:module_manager_index]
    if "return genericRelatedValues(sourceModuleId, source, targetId);" not in values_chunk:
        marker = "  return {};\n}\n\n"
        count = values_chunk.count(marker)
        if count != 1:
            fail(f"relatedValues fallback: expected one terminal return {{}} block, found {count}")
        values_chunk = values_chunk.replace(marker, "  return genericRelatedValues(sourceModuleId, source, targetId);\n}\n\n", 1)
        page = page[:values_start_index] + generic_values_source() + values_chunk + page[module_manager_index:]
    elif "function genericRelatedValues(" not in page:
        fail("generic related-value call exists without its helper")

    # Preserve a human-readable source reference on every generated downstream draft.
    old_values = "const values = { ...initialValues(target), ...relatedValues(module.id, source, targetId), sourceModuleId: module.id, sourceRecordId: source.id };"
    new_values = "const sourceReferenceField = REFERENCE_FIELDS[module.id];\n    const sourceReference = sourceReferenceField ? (source[sourceReferenceField] ?? source.id) : source.id;\n    const values = { ...initialValues(target), ...relatedValues(module.id, source, targetId), sourceModuleId: module.id, sourceRecordId: source.id, sourceReference };"
    if old_values in page:
        page = replace_once(page, old_values, new_values, "source reference metadata")
    elif "const sourceReference = sourceReferenceField ? (source[sourceReferenceField] ?? source.id) : source.id;" not in page:
        fail("createRelatedPreview source-value line was not found")

    # Prevent duplicate drafts only for one-to-one conversions; payments and shipments can legitimately repeat.
    duplicate_guard = (
        "    if (isDuplicateSensitiveHandoff(module.id, targetId)) {\n"
        "      const existingRows = await previewDataService.list(previewScope, targetId, target.initial);\n"
        "      const existing = existingRows.find((row) => row.sourceModuleId === module.id && row.sourceRecordId === source.id && !['Cancelled', 'Void', 'Voided', 'Rejected', 'Lost'].includes(row.status));\n"
        "      if (existing) {\n"
        "        const targetReferenceField = REFERENCE_FIELDS[targetId];\n"
        "        const existingReference = targetReferenceField ? (existing[targetReferenceField] ?? existing.id) : existing.id;\n"
        "        toast.error('Related draft already exists', { description: `${target.title} ${existingReference} is already linked to this source. Open the target register to review or edit it instead of creating a duplicate.` });\n"
        "        navigate('/modules/' + targetId);\n"
        "        return;\n"
        "      }\n"
        "    }\n"
    )
    if "if (isDuplicateSensitiveHandoff(module.id, targetId))" not in page:
        page = replace_once(page, "    const sourceReferenceField = REFERENCE_FIELDS[module.id];", duplicate_guard + "    const sourceReferenceField = REFERENCE_FIELDS[module.id];", "one-to-one duplicate protection")

    # Add navigation-only shortcuts into the seven existing core workflow screens.
    # The target is one exact JSX prefix so we do not accidentally alter other action bars.
    ui_old = "<div className=\"phase-modal-actions\">{!module.readOnly && <>{relatedActions(module.id, detail).map((action) => <button key={action.targetId} className=\"button button-secondary\" title={action.description} onClick={() => createRelatedPreview(action.targetId, detail)}><ArrowRight size={15} /> {action.label}</button>)}"
    ui_new = "<div className=\"phase-modal-actions\">{getCoreScreenShortcuts(module.id).map((action) => <button key={action.path} className=\"button button-secondary\" title={action.description} onClick={() => navigate(action.path)}><ArrowUpRight size={15} /> {action.label}</button>)}{!module.readOnly && <>{relatedActions(module.id, detail).map((action) => <button key={action.targetId} className=\"button button-secondary\" title={action.description} onClick={() => createRelatedPreview(action.targetId, detail)}><ArrowRight size={15} /> {action.label}</button>)}"
    if "getCoreScreenShortcuts(module.id).map((action) => <button key={action.path}" not in page:
        page = replace_once(page, ui_old, ui_new, "core screen shortcuts in record details")

    # Automatically add a *preview* activity note after creating a related draft. This is not a secure audit log.
    event_marker = """      const targetRows = await previewDataService.save(previewScope, targetId, linked, target.initial);
      queryClient.setQueryData(['phase-preview', workspace.id, branch.id, targetId], targetRows);
      void queryClient.invalidateQueries({ queryKey: ['phase-preview-reports', workspace.id, branch.id] });
      setStorageMode(previewDataService.getPersistenceMode());
      setDetail(null);
      toast.success('Related draft created', { description: 'Saved in the browser-local preview workspace only. No live module, stock or ledger was changed.' });
      navigate('/modules/' + targetId);"""
    event_replacement = """      const targetRows = await previewDataService.save(previewScope, targetId, linked, target.initial);
      queryClient.setQueryData(['phase-preview', workspace.id, branch.id, targetId], targetRows);
      if (targetId !== 'audit') {
        const auditModule = getModuleDefinition('audit');
        if (auditModule) {
          try {
            const now = new Date().toISOString();
            const targetReferenceField = REFERENCE_FIELDS[targetId];
            const targetReference = targetReferenceField ? (linked[targetReferenceField] ?? linked.id) : linked.id;
            const auditRecord: PreviewRecord = {
              id: 'AUD-LINK-' + Date.now().toString(36).toUpperCase(),
              updatedAt: now,
              status: 'Recorded',
              eventDate: now.slice(0, 10),
              actor: 'Preview workspace user',
              action: 'Related draft created',
              entity: target.title,
              reference: targetReference,
              detail: `${target.title} ${targetReference} was prepared from ${module.title} ${sourceReference}. Preview only; no live posting occurred.`,
              sourceModuleId: module.id,
              sourceRecordId: source.id,
              sourceReference,
            };
            const auditRows = await previewDataService.save(previewScope, 'audit', auditRecord, auditModule.initial);
            queryClient.setQueryData(['phase-preview', workspace.id, branch.id, 'audit'], auditRows);
          } catch (auditError) {
            toast.warning('Related draft saved, but its preview note failed', { description: auditError instanceof Error ? auditError.message : 'The local audit-preview register could not be updated.' });
          }
        }
      }
      void queryClient.invalidateQueries({ queryKey: ['phase-preview-reports', workspace.id, branch.id] });
      setStorageMode(previewDataService.getPersistenceMode());
      setDetail(null);
      toast.success('Related draft created', { description: 'Saved in the browser-local preview workspace only. A local activity note was recorded where storage allowed. No live module, stock or ledger was changed.' });
      navigate('/modules/' + targetId);"""
    if event_marker in page:
        page = replace_once(page, event_marker, event_replacement, "preview activity note")
    elif "const auditRecord: PreviewRecord" not in page:
        fail("createRelatedPreview save block not found")

    # Extend the payment prefill with a payroll run without changing the existing invoice/expense branches.
    old_payment = """    const isExpense = sourceModuleId === 'expenses';
    return {
      paymentNumber: (moneyIn ? 'RCPT-PRE-' : 'PAY-PRE-') + Date.now().toString().slice(-7),
      direction: moneyIn ? 'Money in' : 'Money out',
      partyType: moneyIn ? 'Customer' : isSupplierBill ? 'Supplier' : 'Other',
      partyName: moneyIn ? source.customer ?? '' : isSupplierBill ? source.supplier ?? '' : source.payee ?? '',
      paymentDate: today, method: 'Bank transfer (recorded)', account: 'Main bank account', reference: '',
      amount: isExpense ? source.total ?? source.amount ?? '0' : source.amountDue ?? '0',
      notes: 'Draft created from ' + (source.invoiceNumber ?? source.billNumber ?? source.expenseNumber ?? source.id) + '. Review and allocate manually; no external payment is initiated.',
      status: 'Pending',
    };"""
    new_payment = """    const isExpense = sourceModuleId === 'expenses';
    const isPayroll = sourceModuleId === 'payroll';
    return {
      paymentNumber: (moneyIn ? 'RCPT-PRE-' : 'PAY-PRE-') + Date.now().toString().slice(-7),
      direction: moneyIn ? 'Money in' : 'Money out',
      partyType: moneyIn ? 'Customer' : isSupplierBill ? 'Supplier' : 'Other',
      partyName: moneyIn ? source.customer ?? '' : isSupplierBill ? source.supplier ?? '' : isPayroll ? ('Payroll run ' + (source.payrollReference ?? source.id)) : source.payee ?? '',
      paymentDate: today, method: 'Bank transfer (recorded)', account: 'Main bank account', reference: '',
      amount: isPayroll ? source.netPay ?? '0' : isExpense ? source.total ?? source.amount ?? '0' : source.amountDue ?? '0',
      notes: 'Draft created from ' + (source.invoiceNumber ?? source.billNumber ?? source.expenseNumber ?? source.payrollReference ?? source.id) + '. Review and allocate manually; no external payment is initiated.',
      status: 'Pending',
    };"""
    if old_payment in page:
        page = replace_once(page, old_payment, new_payment, "payroll payment prefill")
    elif "const isPayroll = sourceModuleId === 'payroll';" not in page:
        fail("payment prefill block not found")

    # Make the audit module description accurately reflect generated local preview notes.
    old_description = "description: 'Browse sample operational events to shape the future audit trail and exception review interface.',"
    new_description = "description: 'Browse seeded sample events and browser-local preview workflow notes. This is not a trusted security audit source.',"
    if old_description in catalog:
        catalog = replace_once(catalog, old_description, new_description, "audit module description")
    old_workflow = "workflow: 'A production audit log must be generated by trusted server-side actions and be tamper-resistant. This module is read-only sample data and is not a security audit source.',"
    new_workflow = "workflow: 'Related preview-draft actions can append local activity notes for review and traceability. A production audit log must still be generated by trusted server-side actions and be tamper-resistant; these notes are not a security audit source.',"
    if old_workflow in catalog:
        catalog = replace_once(catalog, old_workflow, new_workflow, "audit module workflow text")


    # Add a Business Tools screen for cash-up, tax guidance, local import/export, recovery and mobile capture.
    route_marker = "      { path: 'settings', lazy: async () => ({ Component: (await import('../modules/settings/SettingsPage')).default }) },"
    route_entry = "      { path: 'business-tools', lazy: async () => ({ Component: (await import('../modules/tools/BusinessToolsPage')).default }) },\n"
    if "path: 'business-tools'" not in router:
        router = replace_once(router, route_marker, route_entry + route_marker, "business tools route")

    nav_marker = "    { to: '/modules/audit', label: 'Activity & audit log', icon: Activity },"
    nav_entry = "    { to: '/business-tools', label: 'Business tools', icon: Settings },\n"
    if "to: '/business-tools'" not in app_shell:
        app_shell = replace_once(app_shell, nav_marker, nav_entry + nav_marker, "business tools navigation link")

    # Keep the default menu simple and mobile-focused, with an event-driven switch to Advanced navigation.
    mobile_state = "  const [mobileNavOpen, setMobileNavOpen] = useState(false);"
    mode_state = '''  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [uiMode, setUiMode] = useState<'simple' | 'advanced'>(() => localStorage.getItem('lexa.ui.mode') === 'advanced' ? 'advanced' : 'simple');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('lexa.ui.theme') === 'dark' ? 'dark' : 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('lexa.ui.theme', theme);
  }, [theme]);
  useEffect(() => {
    const handleModeChange = (event: Event) => {
      const mode = (event as CustomEvent<'simple' | 'advanced'>).detail;
      if (mode === 'simple' || mode === 'advanced') setUiMode(mode);
    };
    window.addEventListener('lexa:ui-mode-change', handleModeChange);
    return () => window.removeEventListener('lexa:ui-mode-change', handleModeChange);
  }, []);
  const visibleNavSections = uiMode === 'advanced' ? navSections : [
    { title: 'WORKSPACE', items: (navSections[0]?.items ?? []).filter((item) => item.to === '/' || item.to === '/workspace') },
    { title: 'QUICK ACTIONS', items: [
      { to: '/checkout', label: 'Sell', icon: ShoppingCart },
      { to: '/modules/purchases', label: 'Buy', icon: ShoppingCart },
      { to: '/modules/expenses', label: 'Expense', icon: ReceiptText },
      { to: '/inventory', label: 'Stock', icon: Package },
      { to: '/modules/customers', label: 'Money owed', icon: Users },
      { to: '/business-tools', label: 'Business tools', icon: Settings },
      { to: '/settings', label: 'Settings', icon: Settings },
    ] },
  ];'''
    if "const visibleNavSections = uiMode === 'advanced'" not in app_shell:
        app_shell = replace_once(app_shell, mobile_state, mode_state, "simple/advanced menu state")
    if "{visibleNavSections.map((section) => (" not in app_shell:
        app_shell = replace_once(app_shell, "{navSections.map((section) => (", "{visibleNavSections.map((section) => (", "visible navigation sections")

    old_banner = """<div className="local-status-banner phase-two-shell-banner"><span className="status-dot" /><span><strong>Phase 2 frontend build</strong> — core records retain their existing behaviour; new modules use clearly labelled preview data until connected to your existing backend.</span><button onClick={() => navigate('/modules')}>Module map <Command size={12} /></button></div>"""
    new_banner = """<div className="local-status-banner phase-two-shell-banner"><span className="status-dot" /><span><strong>Local-first frontend</strong> — core workspace, product, stock, sale and return records are stored on this device. Expanded module registers are separate previews and do not post to the core ledgers; cloud sync is not connected.</span><button onClick={() => navigate('/business-tools')}>Business tools <Settings size={12} /></button></div>"""
    if old_banner in app_shell:
        app_shell = replace_once(app_shell, old_banner, new_banner, "accurate local-first capability banner")

    old_footer = """<footer className="app-footer"><span>LEXA Workspace · Phase 2 frontend</span><span>New module previews are not backend-connected <span className="footer-dot">•</span> Existing records untouched</span></footer>"""
    new_footer = """<footer className="app-footer"><span>LEXA Workspace · Local-first frontend</span><span>Core records stay in this browser <span className="footer-dot">•</span> Cloud sync and server roles are not connected</span></footer>"""
    if old_footer in app_shell:
        app_shell = replace_once(app_shell, old_footer, new_footer, "accurate local-first capability footer")

    # Complete split-tender sales, customer credit identity, and later instalment collection in core screens.
    types, workflow_contracts, sales_workflow, checkout, sale_detail, reports_data = apply_core_credit_workflow(
        types, workflow_contracts, sales_workflow, checkout, sale_detail, reports_data
    )

    # Validate all required transformations before writing any file.
    if "definition.title" in tools:
        fail("TypeScript seed error fix did not complete")
    if "from './workflowGraph'" not in page or "return getRelatedActions(moduleId, record);" not in page or "getCoreScreenShortcuts(module.id)" not in page or "isDuplicateSensitiveHandoff" not in page:
        fail("workflow graph import/delegation/core shortcuts/duplicate protection are missing")
    if "function genericRelatedValues(" not in page or "sourceReference," not in page:
        fail("generic mapping or source reference metadata is missing")
    if "AUD-LINK-" not in page:
        fail("preview activity note code is missing")
    if "path: 'business-tools'" not in router or "to: '/business-tools'" not in app_shell or "visibleNavSections.map((section) => (" not in app_shell:
        fail("Business Tools route or Simple/Advanced navigation changes are missing")
    if "const [paymentLines, setPaymentLines]" not in checkout or "Add split-payment line" not in checkout or "REQUIRED FOR CREDIT" not in checkout:
        fail("core checkout split-tender / credit requirements are missing")
    if "async receivePayment(input: ReceivePaymentInput)" not in sales_workflow or "Record instalment" not in sale_detail:
        fail("core later-payment collection is missing")
    if "customerPhone?: string;" not in types or "promisedPaymentDate?: string;" not in types:
        fail("core credit sale contact or promised-date types are missing")
    if 'className="lexa-brand-logo-frame"' not in app_shell or 'className="icon-button theme-toggle"' not in app_shell:
        fail("LEXA wordmark or theme toggle missing from application shell")
    if "import './styles/lexa-brand.css';" not in main_tsx:
        fail("LEXA brand stylesheet import is missing")
    if not BRAND_CSS_PATH.is_file() or not BRAND_LOGO_PATH.is_file() or not BRAND_FAVICON_PATH.is_file():
        fail("LEXA brand stylesheet, official logo or favicon asset is missing")

    PAGE_PATH.write_text(page, encoding="utf-8")
    TOOLS_PATH.write_text(tools, encoding="utf-8")
    CATALOG_PATH.write_text(catalog, encoding="utf-8")
    APP_SHELL_PATH.write_text(app_shell, encoding="utf-8")
    ROUTER_PATH.write_text(router, encoding="utf-8")
    TYPES_PATH.write_text(types, encoding="utf-8")
    WORKFLOW_CONTRACTS_PATH.write_text(workflow_contracts, encoding="utf-8")
    SALES_WORKFLOW_PATH.write_text(sales_workflow, encoding="utf-8")
    CHECKOUT_PATH.write_text(checkout, encoding="utf-8")
    SALE_DETAIL_PATH.write_text(sale_detail, encoding="utf-8")
    REPORTS_DATA_PATH.write_text(reports_data, encoding="utf-8")
    MAIN_PATH.write_text(main_tsx, encoding="utf-8")
    INDEX_PATH.write_text(index_html, encoding="utf-8")
    print("Applied LEXA module workflow completion changes:")
    print(" - corrected the PreviewModuleSeed strict TypeScript error")
    print(" - enabled the shared status-aware workflow graph")
    print(" - added generic related-field mapping and source references")
    print(" - protected one-to-one hand-offs from duplicate target drafts")
    print(" - recorded local preview activity notes for related hand-offs")
    print(" - clarified that activity notes are not a trusted security audit log")
    print(" - added Business Tools: local cash-up, compliance guidance, backups, CSV imports/exports and device capture")
    print(" - enabled Simple / Advanced navigation modes")
    print(" - added split-tender payments, customer-required credit, promised dates and later instalments")
    print(" - derived paid / part-paid / overdue status from sales, returns and payment records")
    print(" - corrected receivable calculation so refunds are not treated as amounts still owed")
    print(" - applied LEXA midnight/royal-blue/cyan/emerald/gold brand tokens across existing UI")
    print(" - replaced the placeholder sidebar mark with the supplied official LEXA logo")
    print(" - added the LEXA favicon and matching browser theme colour")
    print(" - added persisted light/dark mode and responsive theme overrides")

if __name__ == '__main__':
    main()
