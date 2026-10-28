import { useEffect, useMemo, useState, type FormEvent, type HTMLInputTypeAttribute } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import {
  Activity, ArrowRight, BadgeCheck, BarChart3, Boxes, CalendarDays, Check, ChevronDown, CircleAlert,
  CircleDollarSign, Download, Filter, Plus, RefreshCw, Search, ShieldAlert, X, Eye, Edit3, ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import {
  EXISTING_MODULE_LINKS, PHASE_TWO_LINKS,
  getModuleDefinition, type ModuleDefinition, type ModuleField, type PreviewRecord,
} from './moduleCatalog';

const STORAGE_PREFIX = 'lexa.phase2.preview.v1';
const CLOSED_STATES = ['Paid', 'Received', 'Reconciled', 'Posted', 'Active', 'Accepted', 'Accepted externally', 'Completed', 'Delivered', 'Approved', 'Disposed', 'Reviewed'];
const ATTENTION_STATES = ['Draft', 'Pending', 'Overdue', 'Disputed', 'Needs review', 'Rejected externally', 'Needs inspection', 'On hold', 'Invited', 'Reconciliation needed', 'Requested', 'In transit', 'Partially received', 'Ready for integration', 'Review', 'Late', 'Delivery failed', 'Restricted', 'Matching', 'Reopened'];

type FormValues = Record<string, string>;

function safeNumber(value: string | undefined): number {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}
function effectiveTaxRate(values: FormValues): number {
  if (['Zero-rated', 'Exempt', 'Outside scope'].includes(values.taxTreatment ?? '')) return 0;
  return Math.max(0, safeNumber(values.taxRate));
}
function money(value: number, currency: string): string {
  try { return new Intl.NumberFormat('en-UG', { style: 'currency', currency, maximumFractionDigits: currency === 'UGX' ? 0 : 2 }).format(value); }
  catch { return currency + ' ' + Math.round(value).toLocaleString(); }
}
function displayDate(value: string | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value.length === 10 ? value + 'T00:00:00' : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-UG', { dateStyle: 'medium' }).format(parsed);
}
function dateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function keyFor(workspaceId: string, branchId: string, moduleId: string): string {
  return [STORAGE_PREFIX, workspaceId, branchId, moduleId].join(':');
}
function readRows(storageKey: string, initial: PreviewRecord[]): PreviewRecord[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((row) => row && typeof row.id === 'string' && typeof row.status === 'string')) return parsed as PreviewRecord[];
    }
  } catch { /* A blocked or corrupt preview cache falls back to clean sample records. */ }
  return initial.map((row) => ({ ...row }));
}
const REFERENCE_FIELDS: Record<string, string> = {
  customers: 'customerCode', suppliers: 'supplierCode', quotations: 'quoteNumber', 'sales-orders': 'orderNumber',
  'sales-invoices': 'invoiceNumber', purchases: 'poNumber', 'purchase-invoices': 'billNumber', receiving: 'receiptNumber',
  expenses: 'expenseNumber', payments: 'paymentNumber', accounting: 'journalNumber', assets: 'assetCode',
  'tax-documents': 'internalReference', 'stock-counts': 'countNumber', 'stock-transfers': 'transferNumber',
  'price-lists': 'priceListCode', deliveries: 'deliveryNumber', warehouses: 'locationCode', employees: 'employeeCode',
  attendance: 'attendanceReference', payroll: 'payrollReference', 'bank-reconciliation': 'reconciliationNumber',
  'purchase-requests': 'requestNumber', rfqs: 'rfqNumber', 'supplier-quotes': 'quoteNumber',
};
const REFERENCE_PREFIXES: Record<string, string> = {
  customers: 'CUS', suppliers: 'SUP', quotations: 'QUO', 'sales-orders': 'SO', 'sales-invoices': 'INV',
  purchases: 'PO', 'purchase-invoices': 'BILL', receiving: 'GRN', expenses: 'EXP', payments: 'PAY',
  accounting: 'JRN', assets: 'AST', 'tax-documents': 'TAX', 'stock-counts': 'CNT', 'stock-transfers': 'TRF',
  'price-lists': 'PL', deliveries: 'DLV', warehouses: 'LOC', employees: 'EMP', attendance: 'ATT', payroll: 'PAYRUN',
  'bank-reconciliation': 'REC', 'purchase-requests': 'PR', rfqs: 'RFQ', 'supplier-quotes': 'SQ',
};
function generateReference(moduleId: string): string {
  const prefix = REFERENCE_PREFIXES[moduleId];
  if (!prefix) return '';
  const year = new Date().getFullYear();
  const serial = Date.now().toString().slice(-6);
  return prefix + '-' + year + '-' + serial;
}

function initialValues(module: ModuleDefinition): FormValues {
  const today = dateInputValue(new Date());
  const result: FormValues = {};
  for (const field of module.fields) {
    if (field.kind === 'select') result[field.key] = field.options?.[0] ?? '';
    else if (field.kind === 'date' && (field.key === module.dateKey || field.key.toLowerCase().includes('date'))) result[field.key] = today;
    else result[field.key] = '';
  }
  if (['quotations', 'sales-orders'].includes(module.id)) { result.discountPercent = '0'; result.taxRate = '18'; result.quantity = '1'; }
  if (['sales-invoices', 'purchases', 'purchase-invoices'].includes(module.id)) { result.taxRate = '18'; result.quantity = '1'; result.amountPaid = '0'; }
  if (module.id === 'sales-invoices') result.amountReceived = '0';
  if (module.id === 'expenses') { result.taxRate = '0'; result.amount = '0'; }
  if (module.id === 'tax-documents') result.taxRate = '18';
  if (module.id === 'assets') { result.residualValue = '0'; result.accumulatedDepreciation = '0'; result.usefulLifeYears = '5'; }
  if (module.id === 'receiving') { result.orderedQuantity = '1'; result.acceptedQuantity = '1'; result.rejectedQuantity = '0'; }
  if (module.id === 'payments') result.amount = '0';
  if (module.id === 'accounting') result.amount = '0';
  if (module.id === 'stock-transfers') result.quantity = '1';
  if (module.id === 'supplier-quotes') { result.taxRate = '18'; result.quantity = '1'; result.deliveryDays = '0'; }
  const referenceField = REFERENCE_FIELDS[module.id];
  if (referenceField) result[referenceField] = generateReference(module.id);
  return result;
}
function valuesFromRecord(module: ModuleDefinition, record: PreviewRecord): FormValues {
  const result: FormValues = {};
  module.fields.forEach((field) => { result[field.key] = record[field.key] ?? (field.kind === 'select' ? field.options?.[0] ?? '' : ''); });
  return result;
}
function calculateRecord(moduleId: string, values: FormValues, existingId?: string): PreviewRecord {
  const result: PreviewRecord = {
    id: existingId ?? ('PRE-' + moduleId.slice(0, 3).toUpperCase() + '-' + Date.now().toString().slice(-7)),
    updatedAt: new Date().toISOString(),
    status: values.status || 'Draft',
    ...values,
  };
  const n = (key: string) => safeNumber(values[key]);
  if (moduleId === 'customers') result.outstandingBalance = String(n('openingBalance'));
  if (moduleId === 'suppliers') result.outstandingPayable = String(n('openingPayable'));
  if (['quotations', 'sales-orders', 'sales-invoices', 'purchases', 'purchase-invoices', 'supplier-quotes'].includes(moduleId)) {
    const isPurchase = moduleId === 'purchases' || moduleId === 'purchase-invoices' || moduleId === 'supplier-quotes';
    const supportsDiscount = moduleId === 'quotations' || moduleId === 'sales-orders';
    const quantity = Math.max(0, n('quantity'));
    const unitPrice = Math.max(0, n(isPurchase ? 'unitCost' : 'unitPrice'));
    const subtotal = quantity * unitPrice;
    const discountAmount = supportsDiscount ? subtotal * Math.max(0, n('discountPercent')) / 100 : 0;
    const taxAmount = Math.max(0, subtotal - discountAmount) * effectiveTaxRate(values) / 100;
    const total = Math.max(0, subtotal - discountAmount + taxAmount);
    result.subtotal = String(Math.round(subtotal * 100) / 100);
    result.discountAmount = String(Math.round(discountAmount * 100) / 100);
    result.taxAmount = String(Math.round(taxAmount * 100) / 100);
    result.total = String(Math.round(total * 100) / 100);
    if (moduleId === 'purchases' || moduleId === 'purchase-invoices') result.amountDue = String(Math.max(0, Math.round((total - n('amountPaid')) * 100) / 100));
    if (moduleId === 'sales-invoices') result.amountDue = String(Math.max(0, Math.round((total - n('amountReceived')) * 100) / 100));
  }
  if (moduleId === 'expenses') {
    const taxAmount = Math.max(0, n('amount')) * effectiveTaxRate(values) / 100;
    result.taxAmount = String(Math.round(taxAmount * 100) / 100);
    result.total = String(Math.round((n('amount') + taxAmount) * 100) / 100);
  }
  if (moduleId === 'stock-counts') result.variance = String(Math.round((n('countedQuantity') - n('expectedQuantity')) * 100) / 100);
  if (moduleId === 'tax-documents') result.taxAmount = String(Math.round((n('taxableAmount') * effectiveTaxRate(values) / 100) * 100) / 100);
  if (moduleId === 'bank-reconciliation') result.difference = String(Math.round((n('statementBalance') - n('bookBalance')) * 100) / 100);
  if (moduleId === 'payroll') result.netPay = String(Math.round(Math.max(0, n('grossPay') - n('deductions')) * 100) / 100);
  if (moduleId === 'attendance') {
    const toMinutes = (value: string) => { const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim()); return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN; };
    const start = toMinutes(values.clockIn ?? ''); const end = toMinutes(values.clockOut ?? '');
    const minutes = Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.max(0, end - start - Math.max(0, n('breakMinutes'))) : 0;
    result.workedHours = String(Math.round((minutes / 60) * 100) / 100);
  }
  if (moduleId === 'assets') {
    const cost = Math.max(0, n('cost'));
    const residual = Math.max(0, n('residualValue'));
    const life = Math.max(0, n('usefulLifeYears'));
    const accumulated = Math.max(0, n('accumulatedDepreciation'));
    result.annualDepreciation = life > 0 ? String(Math.round((Math.max(0, cost - residual) / life) * 100) / 100) : '0';
    result.carryingValue = String(Math.max(residual, cost - accumulated));
  }
  return result;
}
function validateRecord(moduleId: string, values: FormValues, record: PreviewRecord): string | null {
  const n = (key: string) => safeNumber(values[key]);
  if (['quotations', 'sales-orders', 'sales-invoices'].includes(moduleId)) {
    if (n('quantity') <= 0 || n('unitPrice') < 0) return 'Enter a quantity above zero and a valid unit price.';
    if (n('taxRate') < 0 || n('taxRate') > 100) return 'Tax rate must be between 0 and 100% for this preview.';
    if (moduleId === 'quotations' && values.validUntil && values.issueDate && values.validUntil < values.issueDate) return 'The validity date cannot be earlier than the issue date.';
    if (moduleId === 'sales-orders' && values.expectedDate && values.orderDate && values.expectedDate < values.orderDate) return 'Expected delivery cannot be earlier than the order date.';
    if (moduleId === 'sales-invoices' && values.dueDate && values.issueDate && values.dueDate < values.issueDate) return 'Invoice due date cannot be earlier than the issue date.';
    if (['quotations', 'sales-orders'].includes(moduleId) && n('discountPercent') > 100) return 'Discount cannot exceed 100%.';
    if (moduleId === 'sales-invoices' && n('amountReceived') > safeNumber(record.total)) return 'Amount received cannot be greater than the calculated invoice total.';
  }
  if (['purchases', 'purchase-invoices', 'supplier-quotes'].includes(moduleId)) {
    if (n('quantity') <= 0) return 'Quantity ordered / billed must be above zero.';
    if (n('taxRate') < 0 || n('taxRate') > 100) return 'Tax rate must be between 0 and 100% for this preview.';
    if (n('amountPaid') > safeNumber(record.total)) return 'The amount paid cannot be greater than the calculated purchase total.';
    if (moduleId === 'purchase-invoices' && values.dueDate && values.billDate && values.dueDate < values.billDate) return 'Supplier invoice due date cannot be earlier than the bill date.';
    if (moduleId === 'supplier-quotes' && values.validUntil && values.quoteDate && values.validUntil < values.quoteDate) return 'Quote validity cannot end before the quote date.';
  }
  if (moduleId === 'expenses' && n('amount') <= 0) return 'Expense amount must be greater than zero.';
  if (moduleId === 'payroll' && n('employeeCount') <= 0) return 'Include at least one employee in a payroll run preview.';
  if (moduleId === 'tax-codes') {
    if (n('ratePercent') < 0 || n('ratePercent') > 100) return 'Tax rate must be between 0 and 100% in this preview.';
    if (values.effectiveTo && values.effectiveFrom && values.effectiveTo < values.effectiveFrom) return 'Tax-code end date cannot be earlier than its effective start date.';
    if (values.treatment === 'Zero-rated' || values.treatment === 'Exempt' || values.treatment === 'Outside scope') { if (n('ratePercent') !== 0) return 'Zero-rated, exempt and outside-scope preview codes must have a zero rate.'; }
  }
  if (moduleId === 'bank-reconciliation') {
    if ([n('statementLineCount'), n('matchedCount'), n('unmatchedCount')].some((count) => count < 0 || !Number.isInteger(count))) return 'Statement and match counts must be whole numbers of zero or more.';
    if (n('matchedCount') + n('unmatchedCount') > n('statementLineCount')) return 'Matched and unmatched lines cannot exceed the statement line count.';
  }
  if (moduleId === 'price-lists') {
    if (n('sellingPrice') < 0 || n('basePrice') < 0) return 'Prices cannot be negative.';
    if (n('discountPercent') < 0 || n('discountPercent') > 100) return 'Discount must be between 0 and 100%.';
    if (values.validUntil && values.validFrom && values.validUntil < values.validFrom) return 'The end date cannot be earlier than the start date.';
  }
  if (moduleId === 'deliveries' && values.expectedDate && values.dispatchDate && values.expectedDate < values.dispatchDate) return 'Expected arrival cannot be earlier than the dispatch date.';
  if (moduleId === 'payroll') {
    if (n('employeeCount') < 0 || !Number.isInteger(n('employeeCount'))) return 'Employee count must be a whole number of zero or more.';
    if (n('grossPay') < 0 || n('deductions') < 0) return 'Gross pay and deductions cannot be negative.';
    if (n('deductions') > n('grossPay')) return 'Deductions cannot exceed gross pay in this simple preview calculation.';
    if (values.periodStart && values.periodEnd && values.periodEnd < values.periodStart) return 'Payroll period end cannot be before the start date.';
  }
  if (moduleId === 'attendance') {
    const validTime = (value: string) => /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(value.trim());
    if (!validTime(values.clockIn ?? '') || !validTime(values.clockOut ?? '')) return 'Enter clock-in and clock-out in 24-hour HH:MM format.';
    const clockMinutes = (value: string) => { const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim()); return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN; };
    const clockIn = clockMinutes(values.clockIn ?? ''); const clockOut = clockMinutes(values.clockOut ?? '');
    if (clockOut <= clockIn) return 'Clock-out must be later than clock-in. Overnight shifts need a future overnight-shift rule.';
    if (n('breakMinutes') < 0 || n('breakMinutes') >= clockOut - clockIn) return 'Break duration must be shorter than the recorded shift.';
  }
  if (moduleId === 'tax-documents' && (n('taxableAmount') < 0 || n('taxRate') < 0 || n('taxRate') > 100)) return 'Enter a non-negative taxable amount and a tax rate between 0 and 100%.';
  if (moduleId === 'stock-counts' && (n('expectedQuantity') < 0 || n('countedQuantity') < 0)) return 'System and counted quantities cannot be negative.';
  if (moduleId === 'payments' && n('amount') <= 0) return 'Payment amount must be greater than zero.';
  if (moduleId === 'accounting') {
    if (n('amount') <= 0) return 'Journal amount must be greater than zero.';
    if (values.debitAccount === values.creditAccount) return 'Choose different debit and credit accounts.';
  }
  if (moduleId === 'assets') {
    if (n('usefulLifeYears') <= 0) return 'Useful life must be at least one year.';
    if (n('residualValue') > n('cost')) return 'Residual value cannot exceed acquisition cost.';
    if (n('accumulatedDepreciation') > n('cost')) return 'Accumulated depreciation cannot exceed acquisition cost.';
  }
  if (moduleId === 'receiving') {
    if (n('acceptedQuantity') < 0 || n('rejectedQuantity') < 0 || n('acceptedQuantity') + n('rejectedQuantity') <= 0) return 'Enter a positive accepted or rejected quantity.';
    if (n('acceptedQuantity') + n('rejectedQuantity') > n('orderedQuantity')) return 'Accepted and rejected quantities cannot exceed the ordered quantity on this receipt.';
  }
  if (moduleId === 'stock-transfers') {
    if (n('quantity') <= 0) return 'Transfer quantity must be greater than zero.';
    if (values.fromBranch.trim().toLowerCase() === values.toBranch.trim().toLowerCase()) return 'Source and destination branches must be different.';
  }
  return null;
}
function fieldType(field: ModuleField): HTMLInputTypeAttribute {
  if (field.kind === 'email' || field.kind === 'tel' || field.kind === 'date' || field.kind === 'number') return field.kind;
  return 'text';
}
function nextStatus(moduleId: string, current: string): string | undefined {
  const transitions: Record<string, Record<string, string>> = {
    customers: { Active: 'On hold', 'On hold': 'Inactive' },
    'price-lists': { Draft: 'Review', Review: 'Active', Active: 'Expired' },
    'purchase-requests': { Draft: 'Submitted', Submitted: 'Under review', 'Under review': 'Approved', Approved: 'Converted' },
    rfqs: { Draft: 'Sent', Sent: 'Responses received', 'Responses received': 'Evaluated', Evaluated: 'Awarded' },
    'supplier-quotes': { Draft: 'Received', Received: 'Under review', 'Under review': 'Accepted' },
    'chart-of-accounts': { Draft: 'Active', Active: 'Blocked' },
    'tax-codes': { Draft: 'Active', Active: 'Expired' },
    'bank-reconciliation': { Draft: 'Matching', Matching: 'Needs review', 'Needs review': 'Reconciled', Reopened: 'Matching' },
    deliveries: { Draft: 'Picking', Picking: 'Packed', Packed: 'Dispatched', Dispatched: 'In transit', 'In transit': 'Delivered' },
    warehouses: { Active: 'Restricted', Restricted: 'Under maintenance', 'Under maintenance': 'Active' },
    employees: { Active: 'On leave', 'On leave': 'Suspended', Suspended: 'Exited' },
    attendance: { Pending: 'Reviewed', Reviewed: 'Approved' },
    payroll: { Draft: 'Review', Review: 'Approved', Approved: 'Payment prepared', 'Payment prepared': 'Paid' },
    suppliers: { Active: 'On hold', 'On hold': 'Inactive' },
    quotations: { Draft: 'Sent', Sent: 'Accepted' },
    'sales-orders': { Draft: 'Confirmed', Confirmed: 'Partially fulfilled', 'Partially fulfilled': 'Fulfilled', Fulfilled: 'Invoiced' },
    'sales-invoices': { Draft: 'Issued', Issued: 'Partially paid', 'Partially paid': 'Paid' },
    purchases: { Draft: 'Ordered', Ordered: 'Partially received', 'Partially received': 'Received' },
    'purchase-invoices': { Draft: 'Received', Received: 'Approved', Approved: 'Partially paid', 'Partially paid': 'Paid' },
    receiving: { Draft: 'Needs inspection', 'Needs inspection': 'Received' },
    'stock-counts': { Draft: 'Counted', Counted: 'Needs review', 'Needs review': 'Approved', Approved: 'Posted' },
    'tax-documents': { Draft: 'Ready for integration' },
    expenses: { Draft: 'Approved', Approved: 'Paid' },
    payments: { Pending: 'Recorded', Recorded: 'Reconciled' },
    accounting: { Draft: 'Posted' },
    assets: { Active: 'Under maintenance', 'Under maintenance': 'Disposed' },
    'stock-transfers': { Draft: 'Requested', Requested: 'In transit', 'In transit': 'Received' },
    team: { Invited: 'Active', Active: 'Suspended' },
  };
  return transitions[moduleId]?.[current];
}
function cellValue(record: PreviewRecord, key: string, kind: string | undefined, currency: string): string {
  const raw = record[key] ?? '';
  if (!raw) return '—';
  if (kind === 'money') return money(safeNumber(raw), record.currency || currency);
  if (kind === 'date') return displayDate(raw);
  if (kind === 'number') return safeNumber(raw).toLocaleString();
  return raw;
}
function detailValue(module: ModuleDefinition, key: string, value: string, currency: string): string {
  const column = module.columns.find((item) => item.key === key);
  if (column?.kind === 'money' || /amount|balance|limit|price|cost|pay|fee|depreciation|taxable/i.test(key)) return money(safeNumber(value), currency);
  if (column?.kind === 'date' || /date$/i.test(key) || key === 'lastActivity' || key === 'lastActive') return displayDate(value);
  if (column?.kind === 'number') return safeNumber(value).toLocaleString();
  return value || '—';
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const escape = (value: string) => '"' + value.replace(/"/g, '""') + '"';
  const csv = '\uFEFF' + [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function OperationsWorkspacePage() {
  const { moduleId } = useParams();
  const { workspace, branch } = useWorkspace();
  const module = getModuleDefinition(moduleId);
  if (!moduleId) return <ModuleDirectoryPage />;
  if (moduleId === 'reports') return <ReportsPage />;
  if (!module) return <Navigate to="/modules" replace />;
  return <ModuleManager key={module.id + ':' + workspace.id + ':' + branch.id} module={module} />;
}

function ModuleDirectoryPage() {
  const [search, setSearch] = useState('');
  const groupedLinks = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const combined = [...EXISTING_MODULE_LINKS, ...PHASE_TWO_LINKS].filter((item) => !needle || (item.title + ' ' + item.description + ' ' + item.group).toLowerCase().includes(needle));
    const groups = ['WORKSPACE', 'SELLING', 'INVENTORY', 'LOGISTICS', 'PROCUREMENT', 'FINANCE', 'PEOPLE & PAYROLL', 'INSIGHTS', 'ADMINISTRATION'];
    return groups.map((group) => ({ group, items: combined.filter((item) => item.group === group) })).filter((group) => group.items.length > 0);
  }, [search]);
  const visibleModuleCount = groupedLinks.reduce((count, group) => count + group.items.length, 0);
  return (
    <div className="page-stack phase-two-page">
      <div className="page-heading-row"><div><div className="eyebrow eyebrow-blue">LEXA MODULE MAP</div><h2>All business modules</h2><p>One operational workspace for day-to-day trading, stock, finance, reporting and administration.</p></div><span className="soft-badge"><Boxes size={14} /> {EXISTING_MODULE_LINKS.length + PHASE_TWO_LINKS.length} module screens</span></div>
      <section className="section-card phase-two-directory-toolbar"><div><h3>Find a module</h3><p>{visibleModuleCount} matching screens · search names, functions or module group.</p></div><label className="phase-two-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search modules…" aria-label="Search all modules" />{search && <button type="button" className="phase-clear-filters" aria-label="Clear module search" onClick={() => setSearch('')}>Clear</button>}</label></section>
      <div className="phase-two-notice"><span className="phase-two-notice-icon"><ShieldAlert size={18} /></span><div><strong>Frontend build mode</strong><p>Existing workflow screens keep their current data behaviour. New Phase 2 screens are interactive preview forms backed by browser-local demonstration records. They are deliberately not presented as connected to the existing backend/database yet.</p></div></div>
      {visibleModuleCount === 0 && <div className="empty-state"><div className="empty-icon"><Search size={22} /></div><h3>No modules match your search</h3><p>Try a different module name, workflow term or group.</p></div>}
      {groupedLinks.map(({ group, items }) => (
        <section className="module-group" key={group}>
          <div className="module-group-heading"><span>{group}</span><span>{items.length} screens</span></div>
          <div className="module-directory-grid">
            {items.map((item) => { const Icon = item.icon; const preview = item.state.toLowerCase().includes('preview'); return <Link className="module-directory-card" to={item.to} key={item.to}><span className={'module-directory-icon ' + (preview ? 'module-icon-preview' : '')}><Icon size={20} /></span><span className="module-directory-copy"><strong>{item.title}</strong><small>{item.description}</small><span className={'module-state ' + (preview ? 'module-state-preview' : 'module-state-existing')}>{item.state}</span></span><ArrowUpRight size={16} className="module-directory-arrow" /></Link>; })}
          </div>
        </section>
      ))}
      <div className="phase-two-note"><Activity size={16} /><span>Recommended sequence: Customers / Suppliers → Quotations / Purchase orders → Goods receiving → Receipts & payments → Accounting → Reports. A later integration phase will map each screen to the existing API.</span></div>
    </div>
  );
}

type RelatedAction = { targetId: string; label: string; description: string };

function relatedActions(moduleId: string, record: PreviewRecord): RelatedAction[] {
  if (moduleId === 'purchase-requests' && record.status === 'Approved') return [{ targetId: 'rfqs', label: 'Create RFQ draft', description: 'Prepare a request to invite supplier quotations.' }];
  if (moduleId === 'rfqs' && ['Sent', 'Responses received'].includes(record.status)) return [{ targetId: 'supplier-quotes', label: 'Start supplier quote response', description: 'Capture one supplier response; create separate records for other suppliers.' }];
  if (moduleId === 'supplier-quotes' && record.status === 'Accepted') return [{ targetId: 'purchases', label: 'Create purchase-order draft', description: 'Carry the selected quote into a supplier commitment draft.' }];
  if (moduleId === 'customers' && record.status === 'Active') return [{ targetId: 'quotations', label: 'Create quotation draft', description: 'Start a new offer using this customer.' }];
  if (moduleId === 'suppliers' && record.status === 'Active') return [{ targetId: 'purchases', label: 'Create purchase-order draft', description: 'Start a separate supplier commitment.' }];
  if (moduleId === 'quotations' && record.status === 'Accepted') return [{ targetId: 'sales-orders', label: 'Create sales-order draft', description: 'Carry the accepted quote into a new draft order.' }];
  if (moduleId === 'sales-orders' && ['Confirmed', 'Partially fulfilled'].includes(record.status)) return [{ targetId: 'deliveries', label: 'Create delivery draft', description: 'Prepare a separate fulfilment record.' }];
  if (moduleId === 'sales-orders' && record.status === 'Fulfilled') return [{ targetId: 'sales-invoices', label: 'Create invoice draft', description: 'Carry the fulfilled order into invoice preparation.' }];
  if (moduleId === 'purchases' && ['Ordered', 'Partially received', 'Received'].includes(record.status)) return [
    { targetId: 'receiving', label: 'Create goods-receipt draft', description: 'Enter the actual accepted / rejected quantities before saving the receipt.' },
    { targetId: 'purchase-invoices', label: 'Create supplier-bill draft', description: 'Record the supplier’s bill separately from stock receiving.' },
  ];
  if (moduleId === 'sales-invoices' && !['Draft', 'Paid', 'Void'].includes(record.status) && safeNumber(record.amountDue) > 0) return [{ targetId: 'payments', label: 'Create customer-receipt draft', description: 'Create a separate payment preview referencing this invoice.' }];
  if (moduleId === 'purchase-invoices' && !['Draft', 'Paid', 'Void'].includes(record.status) && safeNumber(record.amountDue) > 0) return [{ targetId: 'payments', label: 'Create supplier-payment draft', description: 'Create a separate payment preview referencing this supplier bill.' }];
  if (moduleId === 'expenses' && record.status === 'Approved') return [{ targetId: 'payments', label: 'Prepare expense payment draft', description: 'Create a separate money-out entry for review.' }];
  return [];
}

function relatedValues(sourceModuleId: string, source: PreviewRecord, targetId: string): FormValues {
  const today = dateInputValue(new Date());
  const dueDate = dateInputValue(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  if (sourceModuleId === 'purchase-requests' && targetId === 'rfqs') return { purchaseRequest: source.requestNumber ?? '', issueDate: today, responseDue: source.neededBy ?? dueDate, itemSummary: source.itemSummary ?? '', quantity: source.quantity ?? '1', supplierInvited: source.preferredSupplier ?? '', deliveryAddress: source.branch ?? '', terms: source.justification ?? '', status: 'Draft' };
  if (sourceModuleId === 'rfqs' && targetId === 'supplier-quotes') return { rfqNumber: source.rfqNumber ?? '', supplier: source.supplierInvited ?? '', quoteDate: today, validUntil: dueDate, itemSummary: source.itemSummary ?? '', quantity: source.quantity ?? '1', unitCost: '0', taxTreatment: 'Standard rated', taxRate: '18', deliveryDays: '0', paymentTerms: '30 days', status: 'Draft' };
  if (sourceModuleId === 'supplier-quotes' && targetId === 'purchases') { const expected = dateInputValue(new Date(Date.now() + Math.max(0, safeNumber(source.deliveryDays)) * 86400000)); return { supplier: source.supplier ?? '', orderDate: today, expectedDate: expected, itemSummary: source.itemSummary ?? '', quantity: source.quantity ?? '1', unitCost: source.unitCost ?? '0', taxTreatment: source.taxTreatment ?? 'Standard rated', taxRate: source.taxRate ?? '18', amountPaid: '0', status: 'Draft' }; }
  if (sourceModuleId === 'customers' && targetId === 'quotations') return { customer: source.name ?? '', issueDate: today, validUntil: dueDate, itemSummary: '', quantity: '1', unitPrice: '0', discountPercent: '0', taxTreatment: 'Standard rated', taxRate: '18', status: 'Draft' };
  if (sourceModuleId === 'suppliers' && targetId === 'purchases') return { supplier: source.name ?? '', orderDate: today, expectedDate: dueDate, itemSummary: '', quantity: '1', unitCost: '0', taxTreatment: 'Standard rated', taxRate: '18', amountPaid: '0', status: 'Draft' };
  if (sourceModuleId === 'quotations' && targetId === 'sales-orders') return { customer: source.customer ?? '', orderDate: today, expectedDate: source.validUntil ?? dueDate, itemSummary: source.itemSummary ?? '', quantity: source.quantity ?? '1', unitPrice: source.unitPrice ?? '0', discountPercent: source.discountPercent ?? '0', taxTreatment: source.taxTreatment ?? 'Standard rated', taxRate: source.taxRate ?? '18', status: 'Draft' };
  if (sourceModuleId === 'sales-orders' && targetId === 'deliveries') return { salesOrder: source.orderNumber ?? '', customer: source.customer ?? '', dispatchDate: today, expectedDate: source.expectedDate ?? dueDate, deliveryAddress: '', courier: '', trackingReference: '', deliveryFee: '0', method: 'Own fleet', status: 'Draft' };
  if (sourceModuleId === 'sales-orders' && targetId === 'sales-invoices') return { customer: source.customer ?? '', salesOrderReference: source.orderNumber ?? '', issueDate: today, dueDate, itemSummary: source.itemSummary ?? '', quantity: source.quantity ?? '1', unitPrice: source.unitPrice ?? '0', taxTreatment: source.taxTreatment ?? 'Standard rated', taxRate: source.taxRate ?? '18', amountReceived: '0', status: 'Draft' };
  if (sourceModuleId === 'purchases' && targetId === 'receiving') return { purchaseOrder: source.poNumber ?? '', supplier: source.supplier ?? '', receiptDate: today, product: source.itemSummary ?? '', orderedQuantity: source.quantity ?? '1', acceptedQuantity: '0', rejectedQuantity: '0', warehouse: '', batchNumber: '', status: 'Draft' };
  if (sourceModuleId === 'purchases' && targetId === 'purchase-invoices') return { supplier: source.supplier ?? '', purchaseOrder: source.poNumber ?? '', billDate: today, dueDate, itemSummary: source.itemSummary ?? '', quantity: source.quantity ?? '1', unitCost: source.unitCost ?? '0', taxTreatment: source.taxTreatment ?? 'Standard rated', taxRate: source.taxRate ?? '18', amountPaid: '0', status: 'Draft' };
  if (targetId === 'payments') {
    const moneyIn = sourceModuleId === 'sales-invoices';
    const isSupplierBill = sourceModuleId === 'purchase-invoices';
    const isExpense = sourceModuleId === 'expenses';
    return {
      paymentNumber: (moneyIn ? 'RCPT-PRE-' : 'PAY-PRE-') + Date.now().toString().slice(-7),
      direction: moneyIn ? 'Money in' : 'Money out',
      partyType: moneyIn ? 'Customer' : isSupplierBill ? 'Supplier' : 'Other',
      partyName: moneyIn ? source.customer ?? '' : isSupplierBill ? source.supplier ?? '' : source.payee ?? '',
      paymentDate: today, method: 'Bank transfer (recorded)', account: 'Main bank account', reference: '',
      amount: isExpense ? source.total ?? source.amount ?? '0' : source.amountDue ?? '0',
      notes: 'Draft created from ' + (source.invoiceNumber ?? source.billNumber ?? source.expenseNumber ?? source.id) + '. Review and allocate manually; no external payment is initiated.',
      status: 'Pending',
    };
  }
  return {};
}

function ModuleManager({ module }: { module: ModuleDefinition }) {
  const { workspace, branch } = useWorkspace();
  const navigate = useNavigate();
  const storageKey = keyFor(workspace.id, branch.id, module.id);
  const [rows, setRows] = useState<PreviewRecord[]>(() => readRows(storageKey, module.initial));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pageSize, setPageSize] = useState('10');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PreviewRecord | null>(null);
  const [detail, setDetail] = useState<PreviewRecord | null>(null);
  const [form, setForm] = useState<FormValues>(() => initialValues(module));
  const [saving, setSaving] = useState(false);
  const statuses = useMemo(() => Array.from(new Set(rows.map((row) => row.status).filter(Boolean))).sort(), [rows]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      const searchable = Object.entries(row).filter(([key]) => key !== 'updatedAt').map(([, value]) => value).join(' ').toLowerCase();
      if (needle && !searchable.includes(needle)) return false;
      if (statusFilter !== 'All statuses' && row.status !== statusFilter) return false;
      if (module.dateKey && dateFrom && String(row[module.dateKey] ?? '').slice(0, 10) < dateFrom) return false;
      if (module.dateKey && dateTo && String(row[module.dateKey] ?? '').slice(0, 10) > dateTo) return false;
      return true;
    }).sort((a, b) => String(b[module.dateKey ?? 'updatedAt'] ?? b.updatedAt).localeCompare(String(a[module.dateKey ?? 'updatedAt'] ?? a.updatedAt)));
  }, [rows, search, statusFilter, dateFrom, dateTo, module.dateKey]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / Number(pageSize)));
  const visible = filtered.slice((page - 1) * Number(pageSize), page * Number(pageSize));
  const attentionCount = rows.filter((row) => ATTENTION_STATES.includes(row.status)).length;
  const trackedValue = module.amountKey ? rows.reduce((sum, row) => sum + safeNumber(row[module.amountKey!]), 0) : null;

  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(rows)); } catch { /* Continue in-memory if browser storage is unavailable. */ } }, [storageKey, rows]);
  useEffect(() => { setPage(1); }, [search, statusFilter, dateFrom, dateTo, pageSize]);
  useEffect(() => {
    if (!formOpen && !detail) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setFormOpen(false); setDetail(null); } };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [formOpen, detail]);

  function openNew() { setEditing(null); setForm(initialValues(module)); setFormOpen(true); }
  function openEdit(record: PreviewRecord) { setDetail(null); setEditing(record); setForm(valuesFromRecord(module, record)); setFormOpen(true); }
  function saveForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    try {
      const uniqueField: Record<string, string> = {
        customers: 'customerCode', suppliers: 'supplierCode', quotations: 'quoteNumber', 'sales-orders': 'orderNumber',
        'sales-invoices': 'invoiceNumber', purchases: 'poNumber', 'purchase-invoices': 'billNumber', receiving: 'receiptNumber',
        'price-lists': 'priceListCode', deliveries: 'deliveryNumber', warehouses: 'locationCode', employees: 'employeeCode',
        attendance: 'attendanceReference', payroll: 'payrollReference', accounting: 'journalNumber', 'chart-of-accounts': 'accountCode',
        'tax-codes': 'taxCode', 'bank-reconciliation': 'reconciliationNumber', 'stock-counts': 'countNumber',
        'stock-transfers': 'transferNumber', payments: 'paymentNumber', expenses: 'expenseNumber', assets: 'assetCode',
        'tax-documents': 'internalReference', team: 'email', 'purchase-requests': 'requestNumber', rfqs: 'rfqNumber',
        'supplier-quotes': 'quoteNumber',
      };
      const key = uniqueField[module.id];
      if (key && rows.some((row) => row.id !== editing?.id && String(row[key] ?? '').trim().toLocaleLowerCase() === String(form[key] ?? '').trim().toLocaleLowerCase())) {
        toast.error('That reference already exists in this preview register', { description: 'Use a unique reference before saving.' });
        setSaving(false); return;
      }
      const record = calculateRecord(module.id, form, editing?.id);
      const validation = validateRecord(module.id, form, record);
      if (validation) { toast.error('Check the form', { description: validation }); setSaving(false); return; }
      setRows((current) => editing ? current.map((row) => row.id === editing.id ? record : row) : [record, ...current]);
      setFormOpen(false); setEditing(null); setForm(initialValues(module));
      toast.success(editing ? 'Preview record updated' : 'Preview record created', { description: 'Saved to this browser’s Phase 2 preview workspace only.' });
    } catch (error) { toast.error('Could not save preview record', { description: error instanceof Error ? error.message : 'Please check the form.' }); }
    finally { setSaving(false); }
  }
  function updateStatus(record: PreviewRecord) {
    const next = nextStatus(module.id, record.status);
    if (!next) { toast.info('No further status in the preview workflow'); return; }
    setRows((current) => current.map((row) => row.id === record.id ? { ...row, status: next, updatedAt: new Date().toISOString() } : row));
    setDetail((current) => current?.id === record.id ? { ...current, status: next } : current);
    toast.success('Preview status changed', { description: record.status + ' → ' + next + '. No backend or ledger posting occurred.' });
  }
  function resetRows() {
    if (!window.confirm('Reset the sample records for ' + module.title + '? This affects only this browser’s Phase 2 preview records.')) return;
    setRows(module.initial.map((row) => ({ ...row }))); setSearch(''); setStatusFilter('All statuses'); setDateFrom(''); setDateTo(''); setPage(1);
    toast.success('Sample preview records reset');
  }
  function createRelatedPreview(targetId: string, source: PreviewRecord) {
    const target = getModuleDefinition(targetId);
    if (!target) { toast.error('The target preview module is not available.'); return; }
    const values = { ...initialValues(target), ...relatedValues(module.id, source, targetId) };
    const linked = calculateRecord(targetId, values);
    const targetKey = keyFor(workspace.id, branch.id, targetId);
    const targetRows = readRows(targetKey, target.initial);
    try {
      localStorage.setItem(targetKey, JSON.stringify([linked, ...targetRows]));
    } catch {
      toast.error('Could not store the related preview record', { description: 'Browser storage may be unavailable.' });
      return;
    }
    setDetail(null);
    toast.success('Related draft created', { description: 'Saved in the Phase 2 preview workspace only. No live module, stock or ledger was changed.' });
    navigate('/modules/' + targetId);
  }

  function exportRows() {
    const cols = module.columns;
    downloadCsv('lexa-preview-' + module.id + '.csv', cols.map((column) => column.label), filtered.map((row) => cols.map((column) => row[column.key] ?? '')));
  }
  const amountText = trackedValue === null ? String(rows.length) : money(trackedValue, workspace.currency);
  const recordCountLabel = rows.length === 1 ? 'record' : 'records';

  return (
    <div className="page-stack phase-two-page">
      <div className="page-heading-row phase-two-heading"><div><div className="eyebrow eyebrow-blue">{module.group} / PREVIEW MODULE</div><h2>{module.title}</h2><p>{module.description}</p></div><div className="phase-two-heading-actions"><span className="module-preview-badge"><span />Interactive preview</span>{!module.readOnly && <button className="button button-primary" onClick={openNew}><Plus size={16} /> New {module.singular}</button>}</div></div>
      <div className="phase-two-notice"><span className="phase-two-notice-icon"><ShieldAlert size={18} /></span><div><strong>Preview data only · {workspace.businessName} / {branch.name}</strong><p>These records use a separate browser-local preview store. They do not read from or write to the existing backend, database, stock ledger, accounting ledger, payment provider or access-control system.</p></div></div>
      <div className="module-workflow-strip"><span className="module-workflow-icon"><Activity size={17} /></span><div><strong>Typical workflow</strong><p>{module.workflow}</p></div></div>
      <div className="metric-strip three-metrics phase-two-metrics">
        <div className="mini-metric"><span>Total {recordCountLabel}</span><strong>{rows.length.toLocaleString()}</strong><small>Across this preview module</small></div>
        <div className="mini-metric"><span>Needs attention</span><strong className={attentionCount ? 'warning-value' : ''}>{attentionCount.toLocaleString()}</strong><small>Draft, pending or review states</small></div>
        <div className="mini-metric"><span>{trackedValue === null ? 'Visible data types' : 'Tracked value (preview)'}</span><strong className="phase-two-value">{amountText}</strong><small>{trackedValue === null ? 'Records available to review' : 'Sum of the displayed amount field; not a ledger balance'}</small></div>
      </div>

      <section className="section-card table-card phase-two-table-card">
        <div className="table-toolbar phase-two-table-toolbar"><div><h3>{module.title} register</h3><p>{filtered.length.toLocaleString()} matching {filtered.length === 1 ? 'record' : 'records'} · sample records are labelled by this page’s preview mode</p></div><div className="phase-two-table-actions"><button className="button button-secondary button-small" onClick={exportRows} disabled={!filtered.length}><Download size={14} /> Export CSV</button><button className="button button-secondary button-small" onClick={resetRows}><RefreshCw size={14} /> Reset samples</button></div></div>
        <div className="phase-two-filters">
          <label className="phase-two-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={'Search ' + module.title.toLowerCase() + '…'} aria-label={'Search ' + module.title} /><kbd>/</kbd></label>
          <label className="phase-filter-select"><Filter size={14} /><span className="sr-only">Filter by status</span><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={13} /></label>
          {module.dateKey && <><label className="phase-date-filter"><CalendarDays size={14} /><span className="sr-only">From date</span><input type="date" aria-label="From date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label className="phase-date-filter"><span className="sr-only">To date</span><input type="date" aria-label="To date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label></>}
          {(search || statusFilter !== 'All statuses' || dateFrom || dateTo) && <button className="phase-clear-filters" onClick={() => { setSearch(''); setStatusFilter('All statuses'); setDateFrom(''); setDateTo(''); }}>Clear</button>}
        </div>
        {visible.length === 0 ? <div className="empty-state"><div className="empty-icon"><Search size={22} /></div><h3>No matching records</h3><p>Change the search, status or date filters. New preview records will appear here after you save them.</p>{!module.readOnly && <button className="button button-primary" onClick={openNew}><Plus size={15} /> Add {module.singular}</button>}</div> : <div className="responsive-table-wrap phase-two-table-wrap"><table className="data-table phase-two-table"><thead><tr>{module.columns.map((column) => <th key={column.key}>{column.label}</th>)}<th className="phase-actions-heading">ACTIONS</th></tr></thead><tbody>{visible.map((record) => <tr key={record.id}>{module.columns.map((column) => <td key={column.key} className={column.kind === 'money' ? 'amount-cell' : ''}>{column.kind === 'status' ? <span className={'status-pill ' + (['Active', 'Received', 'Paid', 'Posted', 'Reconciled', 'Accepted', 'Accepted externally', 'Completed', 'Delivered', 'Approved', 'Reviewed', 'Present'].includes(record[column.key] ?? '') ? 'status-good' : ['Draft', 'Pending', 'Ready for integration', 'Needs review', 'Overdue', 'Disputed', 'Rejected externally', 'Needs inspection', 'On hold', 'In transit', 'Review', 'Late', 'Restricted', 'Delivery failed', 'Needs review', 'Blocked', 'Expired', 'Disabled', 'Matching', 'Reopened'].includes(record[column.key] ?? '') ? 'status-warning' : '')}>{record[column.key] || '—'}</span> : cellValue(record, column.key, column.kind, workspace.currency)}</td>)}<td><div className="phase-row-actions"><button className="icon-button table-action" aria-label={'View ' + module.singular} title="View details" onClick={() => setDetail(record)}><Eye size={15} /></button>{!module.readOnly && <button className="icon-button table-action" aria-label={'Edit ' + module.singular} title="Edit preview record" onClick={() => openEdit(record)}><Edit3 size={15} /></button>}</div></td></tr>)}</tbody></table></div>}
        <div className="phase-two-table-footer"><span>Showing {filtered.length ? ((page - 1) * Number(pageSize) + 1).toLocaleString() : 0}–{Math.min(page * Number(pageSize), filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}</span><div className="phase-pagination"><label><span>Rows</span><select aria-label="Rows per page" value={pageSize} onChange={(event) => setPageSize(event.target.value)}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label><button className="button button-secondary button-small" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button><span>Page {page} of {pageCount}</span><button className="button button-secondary button-small" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</button></div></div>
      </section>

      {!module.readOnly && <div className="phase-two-help-row"><CircleAlert size={15} /><span>Use the details action to review a record, edit fields, or move it through the preview status workflow. Status changes are for interface testing and are not approvals or accounting posts.</span></div>}

      {formOpen && <div className="phase-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setFormOpen(false); setEditing(null); } }}><section className="phase-modal" role="dialog" aria-modal="true" aria-labelledby="phase-form-title"><div className="phase-modal-header"><div><div className="eyebrow eyebrow-blue">{module.group} / DATA ENTRY</div><h3 id="phase-form-title">{editing ? 'Edit ' + module.singular : 'New ' + module.singular}</h3><p>Fields and calculated figures are for the Phase 2 interface preview.</p></div><button className="icon-button" aria-label="Close form" onClick={() => { setFormOpen(false); setEditing(null); }}><X size={18} /></button></div><form className="phase-modal-body" onSubmit={saveForm}><div className="phase-form-grid">{module.fields.map((field) => <FieldInput key={field.key} field={field} value={form[field.key] ?? ''} onChange={(value) => setForm((current) => ({ ...current, [field.key]: value }))} currency={workspace.currency} editing={Boolean(editing)} />)}</div><CalculatedFigures moduleId={module.id} values={form} currency={workspace.currency} /><div className="phase-form-disclaimer"><ShieldAlert size={15} /><span>Save creates a browser-local preview record only. It will not update live stock, cash, tax, payment, user-access or accounting records.</span></div><div className="phase-modal-actions"><button type="button" className="button button-secondary" onClick={() => { setFormOpen(false); setEditing(null); }}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save preview record'} <Check size={15} /></button></div></form></section></div>}

      {detail && <div className="phase-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}><section className="phase-modal phase-detail-modal" role="dialog" aria-modal="true" aria-labelledby="phase-detail-title"><div className="phase-modal-header"><div><div className="eyebrow eyebrow-blue">{module.title.toUpperCase()} / RECORD DETAILS</div><h3 id="phase-detail-title">{detail[module.columns[0]?.key ?? 'id'] || detail.id}</h3><p>Reference: {detail.id} · Updated {displayDate(detail.updatedAt)}</p></div><button className="icon-button" aria-label="Close details" onClick={() => setDetail(null)}><X size={18} /></button></div><div className="phase-detail-status"><span className={'status-pill ' + (CLOSED_STATES.includes(detail.status) ? 'status-good' : 'status-warning')}>{detail.status}</span><span className="module-preview-badge"><span /> Browser-local preview</span></div><div className="phase-detail-grid">{Object.entries(detail).filter(([key]) => key !== 'id' && key !== 'updatedAt').map(([key, value]) => <div className="phase-detail-field" key={key}><span>{module.fields.find((field) => field.key === key)?.label ?? module.columns.find((column) => column.key === key)?.label ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())}</span><strong>{detailValue(module, key, value, detail.currency || workspace.currency)}</strong></div>)}</div><div className="phase-modal-actions">{!module.readOnly && <>{relatedActions(module.id, detail).map((action) => <button key={action.targetId} className="button button-secondary" title={action.description} onClick={() => createRelatedPreview(action.targetId, detail)}><ArrowRight size={15} /> {action.label}</button>)}{nextStatus(module.id, detail.status) && <button className="button button-secondary" onClick={() => updateStatus(detail)}><BadgeCheck size={15} /> Advance to {nextStatus(module.id, detail.status)}</button>}<button className="button button-primary" onClick={() => openEdit(detail)}><Edit3 size={15} /> Edit preview record</button></>}<button className="button button-secondary" onClick={() => setDetail(null)}>Close</button></div></section></div>}
    </div>
  );
}

function FieldInput({ field, value, onChange, currency, editing }: { field: ModuleField; value: string; onChange: (value: string) => void; currency: string; editing: boolean }) {
  const className = 'field-label phase-field ' + (field.fullWidth ? 'phase-field-full' : '');
  const shownLabel = field.kind === 'number' && /amount|price|cost|balance|limit|value|depreciation|gross pay|deduction|net pay|delivery fee|monthly pay|payable|receivable/i.test(field.label) ? field.label + ' (' + currency + ')' : field.label;
  return <label className={className}>{shownLabel}{field.required && <span className="required-mark"> *</span>}{field.kind === 'select' ? <select required={Boolean(field.required)} value={value} onChange={(event) => onChange(event.target.value)}>{!field.required && <option value="">Not set</option>}{(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}{value && !(field.options ?? []).includes(value) && <option value={value}>{value}</option>}</select> : field.kind === 'textarea' ? <textarea required={Boolean(field.required)} value={value} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder ?? ''} rows={3} /> : <input required={Boolean(field.required)} type={fieldType(field)} min={field.kind === 'number' ? (field.min ?? 0) : undefined} step={field.kind === 'number' ? (field.step ?? 'any') : undefined} value={value} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder ?? ''} disabled={editing && field.key.endsWith('Number') && !['memberName'].includes(field.key)} />}{field.help && <small className="phase-field-help">{field.help}</small>}</label>;
}

function CalculatedFigures({ moduleId, values, currency }: { moduleId: string; values: FormValues; currency: string }) {
  const n = (key: string) => safeNumber(values[key]);
  let figures: Array<{ label: string; value: string }> = [];
  if (['quotations', 'sales-orders', 'sales-invoices', 'purchases', 'purchase-invoices', 'supplier-quotes'].includes(moduleId)) {
    const isPurchase = moduleId === 'purchases' || moduleId === 'purchase-invoices' || moduleId === 'supplier-quotes';
    const supportsDiscount = moduleId === 'quotations' || moduleId === 'sales-orders';
    const quantity = Math.max(0, n('quantity'));
    const unitPrice = Math.max(0, n(isPurchase ? 'unitCost' : 'unitPrice'));
    const subtotal = quantity * unitPrice;
    const discount = supportsDiscount ? subtotal * Math.max(0, n('discountPercent')) / 100 : 0;
    const tax = Math.max(0, subtotal - discount) * effectiveTaxRate(values) / 100;
    const total = subtotal - discount + tax;
    figures = [{ label: 'Subtotal', value: money(subtotal, currency) }, { label: 'Discount', value: money(discount, currency) }, { label: 'Tax estimate', value: money(tax, currency) }, { label: 'Document total', value: money(total, currency) }];
    if (moduleId === 'purchases' || moduleId === 'purchase-invoices') figures.push({ label: 'Estimated payable remaining', value: money(Math.max(0, total - n('amountPaid')), currency) });
    if (moduleId === 'sales-invoices') figures.push({ label: 'Estimated amount due', value: money(Math.max(0, total - n('amountReceived')), currency) });
  } else if (moduleId === 'bank-reconciliation') {
    figures = [{ label: 'Statement closing balance', value: money(n('statementBalance'), currency) }, { label: 'Book closing balance', value: money(n('bookBalance'), currency) }, { label: 'Unexplained difference', value: money(n('statementBalance') - n('bookBalance'), currency) }, { label: 'Lines not matched', value: n('unmatchedCount').toLocaleString() }];
  } else if (moduleId === 'tax-codes') {
    figures = [{ label: 'Configured rate', value: n('ratePercent').toFixed(2) + '%' }, { label: 'Treatment', value: values.treatment || '—' }, { label: 'Applicability', value: values.appliesTo || '—' }];
  } else if (moduleId === 'tax-documents') {
    const tax = n('taxableAmount') * effectiveTaxRate(values) / 100;
    figures = [{ label: 'Taxable amount', value: money(n('taxableAmount'), currency) }, { label: 'Tax estimate', value: money(tax, currency) }, { label: 'Gross estimate', value: money(n('taxableAmount') + tax, currency) }];
  } else if (moduleId === 'stock-counts') {
    figures = [{ label: 'System quantity', value: n('expectedQuantity').toLocaleString() }, { label: 'Counted quantity', value: n('countedQuantity').toLocaleString() }, { label: 'Variance', value: (n('countedQuantity') - n('expectedQuantity')).toLocaleString() }];
  } else if (moduleId === 'expenses') {
    const tax = n('amount') * effectiveTaxRate(values) / 100;
    figures = [{ label: 'Tax estimate', value: money(tax, currency) }, { label: 'Expense total', value: money(n('amount') + tax, currency) }];
  } else if (moduleId === 'assets') {
    const life = n('usefulLifeYears');
    const annual = life > 0 ? Math.max(0, (n('cost') - n('residualValue')) / life) : 0;
    figures = [{ label: 'Depreciable base', value: money(Math.max(0, n('cost') - n('residualValue')), currency) }, { label: 'Annual straight-line estimate', value: money(annual, currency) }, { label: 'Carrying value estimate', value: money(Math.max(n('residualValue'), n('cost') - n('accumulatedDepreciation')), currency) }];
  } else if (moduleId === 'payroll') {
    figures = [{ label: 'Gross pay entered', value: money(n('grossPay'), currency) }, { label: 'Deductions entered', value: money(n('deductions'), currency) }, { label: 'Net pay estimate', value: money(Math.max(0, n('grossPay') - n('deductions')), currency) }];
  } else if (moduleId === 'attendance') {
    const toMinutes = (value: string) => { const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim()); return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN; };
    const start = toMinutes(values.clockIn ?? ''); const end = toMinutes(values.clockOut ?? '');
    const span = Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : 0;
    const hours = Math.max(0, span - Math.max(0, n('breakMinutes'))) / 60;
    figures = [{ label: 'Clock span', value: span ? (span / 60).toFixed(2) + ' hours' : '—' }, { label: 'Unpaid break', value: n('breakMinutes').toLocaleString() + ' minutes' }, { label: 'Worked hours estimate', value: hours.toFixed(2) }];
  } else if (moduleId === 'price-lists') {
    const base = Math.max(0, n('basePrice')); const sell = Math.max(0, n('sellingPrice'));
    figures = [{ label: 'Reference price', value: money(base, values.currency || currency) }, { label: 'Configured selling price', value: money(sell, values.currency || currency) }, { label: 'Difference vs reference', value: money(sell - base, values.currency || currency) }];
  } else if (moduleId === 'accounting') {
    figures = [{ label: 'Total debit', value: money(n('amount'), currency) }, { label: 'Total credit', value: money(n('amount'), currency) }, { label: 'Difference', value: money(0, currency) }];
  } else if (moduleId === 'receiving') {
    figures = [{ label: 'Accepted quantity', value: n('acceptedQuantity').toLocaleString() }, { label: 'Rejected / damaged', value: n('rejectedQuantity').toLocaleString() }, { label: 'Quantity not yet counted on this receipt', value: Math.max(0, n('orderedQuantity') - n('acceptedQuantity') - n('rejectedQuantity')).toLocaleString() }];
  }
  if (!figures.length) return null;
  return <div className="phase-calculated-panel"><div className="phase-calculated-title"><CircleDollarSign size={15} /> Calculated figures <span>Preview estimate</span></div><div className="phase-calculated-grid">{figures.map((figure) => <div key={figure.label}><span>{figure.label}</span><strong>{figure.value}</strong></div>)}</div></div>;
}

function ReportsPage() {
  const { workspace, branch } = useWorkspace();
  const navigate = useNavigate();
  const [period, setPeriod] = useState('Last 30 days');
  const [report, setReport] = useState('Sales & receipts');
  const reportOptions: Record<string, Array<{ label: string; value: number }>> = {
    'Sales & receipts': [{ label: 'Week 1', value: 3.2 }, { label: 'Week 2', value: 4.1 }, { label: 'Week 3', value: 2.8 }, { label: 'Week 4', value: 5.4 }],
    'Sales returns & discounts': [{ label: 'Returns', value: 0.7 }, { label: 'Discounts', value: 0.45 }, { label: 'Voids pending review', value: 0.12 }, { label: 'Net sales', value: 4.6 }],
    'Stock overview': [{ label: 'Fast-moving SKUs', value: 44 }, { label: 'Steady SKUs', value: 31 }, { label: 'Low-stock SKUs', value: 13 }, { label: 'No-movement SKUs', value: 18 }],
    'Purchases & payables': [{ label: 'Open orders', value: 4.8 }, { label: 'Received', value: 3.7 }, { label: 'Supplier bills', value: 2.9 }, { label: 'Settled', value: 2.1 }],
    'Receivables ageing': [{ label: 'Not yet due', value: 3.7 }, { label: '1–30 days', value: 1.6 }, { label: '31–60 days', value: 0.8 }, { label: '61+ days', value: 0.35 }],
    'Payables ageing': [{ label: 'Not yet due', value: 2.8 }, { label: '1–30 days', value: 1.4 }, { label: '31–60 days', value: 0.75 }, { label: '61+ days', value: 0.2 }],
    'Expenses': [{ label: 'Transport', value: 1.4 }, { label: 'Utilities', value: 2.2 }, { label: 'Rent', value: 3.1 }, { label: 'Other', value: 1.7 }],
    'Profit & loss preview': [{ label: 'Revenue', value: 18.45 }, { label: 'Cost of sales', value: 11.4 }, { label: 'Operating expenses', value: 3.2 }, { label: 'Net result', value: 3.85 }],
    'Balance sheet preview': [{ label: 'Assets', value: 22.8 }, { label: 'Liabilities', value: 7.4 }, { label: 'Equity', value: 15.4 }, { label: 'Unreconciled', value: 0.28 }],
    'Tax summary preview': [{ label: 'Standard rated base', value: 6.4 }, { label: 'Zero rated base', value: 1.2 }, { label: 'Exempt base', value: 0.9 }, { label: 'Draft tax estimate', value: 1.15 }],
    'Attendance & payroll': [{ label: 'Shifts scheduled', value: 420 }, { label: 'Attendance confirmed', value: 389 }, { label: 'Exceptions pending', value: 14 }, { label: 'Absence records', value: 17 }],
    'Deliveries': [{ label: 'Ready to pick', value: 32 }, { label: 'Out for delivery', value: 18 }, { label: 'Delivered', value: 114 }, { label: 'Exceptions', value: 4 }],
    'Bank reconciliation': [{ label: 'Statement closing', value: 24.5 }, { label: 'Book closing', value: 24.08 }, { label: 'Matched value', value: 21.8 }, { label: 'Unexplained difference', value: 0.42 }],
    'Cash & accounts': [{ label: 'Cash', value: 2.4 }, { label: 'Bank', value: 5.1 }, { label: 'Mobile money', value: 1.2 }, { label: 'Unreconciled', value: 1.7 }],
  };
  const periodScale: Record<string, number> = { Today: 0.07, 'Last 7 days': 0.24, 'Last 30 days': 1, 'Last 90 days': 2.7, 'Year to date': 9.6 };
  const scale = periodScale[period] ?? 1;
  const countReports = new Set(['Stock overview', 'Attendance & payroll', 'Deliveries']);
  const isCountReport = countReports.has(report);
  const chartUnit = isCountReport ? 'illustrative count' : 'illustrative millions of ' + workspace.currency;
  const rawChart = reportOptions[report] ?? reportOptions['Sales & receipts'] ?? [];
  const chart = rawChart.map((item) => ({ ...item, displayedValue: isCountReport ? Math.max(0, Math.round(item.value * scale)) : item.value * scale }));
  const max = Math.max(1, ...chart.map((item) => item.displayedValue));
  const reportLinks: Array<[string, string, string]> = [
    ['Sales & returns', 'Net sales, discounts, payment mix, top items and refund trends.', '/sales'],
    ['Stock valuation', 'On-hand quantity, movement ledger, cost estimates and low stock.', '/inventory'],
    ['Purchases & payables', 'Open purchase orders, goods receipts, supplier bills and payments.', '/modules/purchases'],
    ['Receivables ageing', 'Customer balances grouped by due date and outstanding days.', '/modules/customers'],
    ['Payables ageing', 'Supplier balances, due dates, terms and settlement history.', '/modules/suppliers'],
    ['Expenses & cash flow', 'Spend by category, money account movements and reconciliation.', '/modules/expenses'],
    ['P&L and balance sheet', 'Revenue, costs, expenses, assets, liabilities and equity from posted entries.', '/modules/accounting'],
    ['Tax summary & tax codes', 'Preview taxable, zero-rated and exempt totals from configured treatment.', '/modules/tax-codes'],
    ['Bank reconciliation', 'Matched statement lines, book balance and unexplained differences.', '/modules/bank-reconciliation'],
    ['Payroll & attendance', 'Employee shifts, attendance exceptions and payroll-run estimates.', '/modules/payroll'],
    ['Delivery fulfilment', 'Pick lists, dispatch status, delivered orders and exceptions.', '/modules/deliveries'],
    ['Procurement pipeline', 'Requests, supplier enquiries, quotations and purchase order drafts.', '/modules/purchase-requests'],
  ];
  function exportReport() { downloadCsv('lexa-sample-report-' + report.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv', ['Category', chartUnit, 'Selected period', 'Branch'], chart.map((item) => [item.label, String(Number(item.displayedValue.toFixed(2))), period, branch.name])); }
  return (
    <div className="page-stack phase-two-page">
      <div className="page-heading-row"><div><div className="eyebrow eyebrow-blue">INSIGHTS / REPORT CENTRE</div><h2>Reports & analytics</h2><p>Browse the planned report pack and test the dashboard controls before connecting them to live API responses.</p></div><button className="button button-secondary" onClick={exportReport}><Download size={15} /> Export sample CSV</button></div>
      <div className="phase-two-notice"><span className="phase-two-notice-icon"><ShieldAlert size={18} /></span><div><strong>Illustrative report figures</strong><p>All chart values below are sample figures for interface review. They are not calculated from your backend or the current local sales database, and must not be used for business or tax decisions.</p></div></div>
      <section className="section-card phase-report-controls"><div><span className="eyebrow eyebrow-blue">REPORT CONFIGURATION</span><h3>Choose a report view</h3><p>Period and report selection are interactive; live data binding comes in the later integration phase.</p></div><div className="phase-report-control-fields"><label className="field-label">Report<select value={report} onChange={(event) => setReport(event.target.value)}>{Object.keys(reportOptions).map((option) => <option key={option}>{option}</option>)}</select></label><label className="field-label">Reporting period<select value={period} onChange={(event) => setPeriod(event.target.value)}><option>Today</option><option>Last 7 days</option><option>Last 30 days</option><option>Last 90 days</option><option>Year to date</option></select></label></div></section>
      <div className="metric-strip four-metrics phase-report-metrics"><div className="mini-metric"><span>Net sales (sample)</span><strong>{money(18450000 * scale, workspace.currency)}</strong><small>After sample returns</small></div><div className="mini-metric"><span>Purchases committed</span><strong>{money(4820000 * scale, workspace.currency)}</strong><small>Illustrative open purchase orders</small></div><div className="mini-metric"><span>Expenses recorded</span><strong>{money(1630000 * scale, workspace.currency)}</strong><small>Illustrative period spend</small></div><div className="mini-metric"><span>Receivables estimate</span><strong>{money(725000 * scale, workspace.currency)}</strong><small>Illustrative customer balances</small></div></div>
      <div className="phase-report-layout"><section className="section-card phase-report-chart"><div className="section-card-heading"><span className="heading-icon blue-icon"><BarChart3 size={18} /></span><div><h3>{report}</h3><p>{period} · {branch.name} · illustrative preview</p></div></div><div className="phase-bars">{chart.map((item) => <div className="phase-bar-row" key={item.label}><span>{item.label}</span><div className="phase-bar-track"><span style={{ width: (item.displayedValue / max * 100) + '%' }} /></div><strong>{isCountReport ? item.displayedValue.toLocaleString() : item.displayedValue.toFixed(1) + 'm'}</strong></div>)}</div><div className="phase-report-chart-footnote">Figures are illustrative and scaled for the selected period ({period}). Units: {isCountReport ? 'sample counts' : 'millions of ' + workspace.currency}. These are not live transactions.</div></section>
        <section className="section-card phase-report-questions"><div className="section-card-heading"><span className="heading-icon amber-icon"><BarChart3 size={18} /></span><div><h3>Report pack</h3><p>Operational reports expected as modules connect</p></div></div>{reportLinks.map(([title, description, to]) => <button className="phase-report-link" key={title} onClick={() => navigate(to)}><span><strong>{title}</strong><small>{description}</small></span><ArrowRight size={15} /></button>)}</section></div>
      <div className="phase-two-note"><Activity size={16} /><span>Accounting reports require a reconciled chart of accounts and posted source transactions. Uganda EFRIS / tax submission is a separate integration and compliance workstream, not part of these sample report screens.</span></div>
    </div>
  );
}
