import { useEffect, useMemo, useState, type FormEvent, type HTMLInputTypeAttribute } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { getCoreScreenShortcuts, getRelatedActions, isDuplicateSensitiveHandoff } from './workflowGraph';
import { calculateRecord, nextStatus, safeNumber, validateRecord, type FormValues } from './previewRules';
import { usePreviewDataService } from '../../data/providers/PreviewDataServiceProvider';
import type { PreviewScope } from '../../data/contracts/previewData';
import { moduleAccentForGroup, moduleAccentForPath } from '../../domain/shared/moduleAccents';
import { filterPreviewRecords, paginatePreviewRecords } from './previewSelectors';
import { getPreviewDateRange, loadPreviewReportSnapshot, REPORT_NAMES, REPORT_PERIODS, type PreviewReportName, type PreviewReportUnit, type ReportPeriod } from '../../data/mock/previewReports';
import DocumentLineItemsEditor from './DocumentLineItemsEditor';
import { getDocumentLineConfig, readDocumentLines, syncDocumentLines, validateDocumentLines } from './documentLines';
import { journalTotals, readAssemblyComponents, readJournalLines, syncAssemblyComponents, syncJournalLines, validateAssemblyComponents, validateJournalLines } from './structuredEntries';
import { AssemblyComponentsEditor, JournalLinesEditor } from './StructuredEntryEditors';

const CLOSED_STATES = ['Paid', 'Received', 'Reconciled', 'Posted', 'Active', 'Accepted', 'Accepted externally', 'Completed', 'Delivered', 'Approved', 'Disposed', 'Reviewed'];
const ATTENTION_STATES = ['Draft', 'Pending', 'Overdue', 'Disputed', 'Needs review', 'Rejected externally', 'Needs inspection', 'On hold', 'Invited', 'Reconciliation needed', 'Requested', 'In transit', 'Partially received', 'Ready for integration', 'Review', 'Late', 'Delivery failed', 'Restricted', 'Matching', 'Reopened', 'Error', 'Not connected', 'Configuration needed', 'Needs attention', 'Failed', 'Short pick', 'Exception', 'Expired', 'Quarantined', 'Rejected', 'Blocked', 'Variance review', 'Review needed', 'Missing mapping'];


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
const REFERENCE_FIELDS: Record<string, string> = {
  leads: 'leadCode', 'cash-sessions': 'sessionNumber', boms: 'bomCode', 'job-cards': 'jobCardNumber', leave: 'leaveRequestNumber', replenishment: 'replenishmentNumber', packages: 'packageNumber', timesheets: 'timesheetNumber',
  contacts: 'contactCode', campaigns: 'campaignCode', 'sales-teams': 'salespersonCode', 'item-bundles': 'bundleCode', picklists: 'picklistNumber', 'cost-centers': 'costCenterCode', budgets: 'budgetCode', integrations: 'integrationCode', 'recurring-invoices': 'scheduleCode',
  customers: 'customerCode', suppliers: 'supplierCode', quotations: 'quoteNumber', 'sales-orders': 'orderNumber',
  'sales-invoices': 'invoiceNumber', purchases: 'poNumber', 'purchase-invoices': 'billNumber', receiving: 'receiptNumber',
  expenses: 'expenseNumber', payments: 'paymentNumber', accounting: 'journalNumber', assets: 'assetCode',
  'tax-documents': 'internalReference', 'stock-counts': 'countNumber', 'stock-transfers': 'transferNumber',
  'price-lists': 'priceListCode', deliveries: 'deliveryNumber', warehouses: 'locationCode', employees: 'employeeCode',
  attendance: 'attendanceReference', payroll: 'payrollReference', 'bank-reconciliation': 'reconciliationNumber',
  'purchase-requests': 'requestNumber', rfqs: 'rfqNumber', 'supplier-quotes': 'quoteNumber',
};
const REFERENCE_PREFIXES: Record<string, string> = {
  leads: 'LEAD', 'cash-sessions': 'POS', boms: 'BOM', 'job-cards': 'JOB', leave: 'LR', replenishment: 'REPL', packages: 'PKG', timesheets: 'TIME',
  contacts: 'CON', campaigns: 'CMP', 'sales-teams': 'REP', 'item-bundles': 'BND', picklists: 'PICK', 'cost-centers': 'CC', budgets: 'BUD', integrations: 'INT', 'recurring-invoices': 'RECINV',
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
    else if (field.kind === 'date' && field.required !== false && (field.key === module.dateKey || field.key.toLowerCase().includes('date'))) result[field.key] = today;
    else result[field.key] = '';
  }
  if (module.id === 'leads') { result.probability = '10'; result.estimatedValue = '0'; }
  if (module.id === 'cash-sessions') { result.openingFloat = '0'; result.cashSales = '0'; result.cashRefunds = '0'; result.cashDrops = '0'; result.countedCash = '0'; }
  if (module.id === 'boms') { result.outputQuantity = '1'; result.unitMaterialCost = '0'; }
  if (module.id === 'job-cards') { result.plannedHours = '1'; result.actualHours = '0'; }
  if (module.id === 'leave') result.daysRequested = '1';
  if (module.id === 'replenishment') { result.onHand = '0'; result.reorderPoint = '10'; result.averageDailyDemand = '1'; result.leadTimeDays = '7'; result.safetyStock = '5'; }
  if (module.id === 'packages') { result.packageCount = '1'; result.weightKg = '0'; result.courier = 'Own fleet'; }
  if (module.id === 'timesheets') { result.hours = '1'; result.billableHours = '0'; result.hourlyRate = '0'; }
  if (module.id === 'campaigns') { result.budget = '0'; result.actualSpend = '0'; result.leadsGenerated = '0'; result.opportunitiesCreated = '0'; }
  if (module.id === 'sales-teams') { result.salesTarget = '0'; result.salesAchieved = '0'; result.commissionRate = '0'; }
  if (module.id === 'item-bundles') { result.componentCount = '1'; result.unitCost = '0'; result.sellingPrice = '0'; }
  if (module.id === 'picklists') { result.lineCount = '1'; result.unitsToPick = '1'; result.unitsPicked = '0'; }
  if (module.id === 'budgets') { result.budgetAmount = '0'; result.actualAmount = '0'; result.committedAmount = '0'; result.forecastAmount = '0'; }
  if (module.id === 'integrations') { result.recordsProcessed = '0'; result.environment = 'Development'; }
  if (module.id === 'recurring-invoices') { result.taxRate = '18'; result.quantity = '1'; result.unitPrice = '0'; result.taxTreatment = 'Standard rated'; }
  if (['quotations', 'sales-orders'].includes(module.id)) { result.discountPercent = '0'; result.taxRate = '18'; result.quantity = '1'; }
  if (['sales-invoices', 'purchases', 'purchase-invoices'].includes(module.id)) { result.taxRate = '18'; result.quantity = '1'; result.amountPaid = '0'; }
  if (module.id === 'sales-invoices') result.amountReceived = '0';
  if (module.id === 'expenses') { result.taxRate = '0'; result.amount = '0'; }
  if (['sales-returns', 'purchase-returns'].includes(module.id)) { result.taxRate = '18'; result.quantity = '1'; }
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
  let normalized = result;
  if (module.id === 'accounting') normalized = syncJournalLines(normalized, readJournalLines(normalized));
  if (module.id === 'boms' || module.id === 'item-bundles') normalized = syncAssemblyComponents(module.id, normalized, readAssemblyComponents(module.id, normalized));
  const lineConfig = getDocumentLineConfig(module.id);
  return lineConfig ? syncDocumentLines(module.id, normalized, readDocumentLines(module.id, normalized)) : normalized;
}
function fieldType(field: ModuleField): HTMLInputTypeAttribute {
  if (field.kind === 'email' || field.kind === 'tel' || field.kind === 'date' || field.kind === 'number') return field.kind;
  return 'text';
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
    const groups = ['WORKSPACE', 'CRM', 'SELLING', 'INVENTORY', 'LOGISTICS', 'PROCUREMENT', 'MANUFACTURING', 'FINANCE', 'PEOPLE & PAYROLL', 'INSIGHTS', 'ADMINISTRATION'];
    return groups.map((group) => ({ group, items: combined.filter((item) => item.group === group) })).filter((group) => group.items.length > 0);
  }, [search]);
  const visibleModuleCount = groupedLinks.reduce((count, group) => count + group.items.length, 0);


  return (
    <div className="page-stack phase-two-page">
      <div className="page-heading-row"><div><div className="eyebrow eyebrow-blue">LEXA MODULE MAP</div><h2>All business modules</h2><p>One operational workspace for day-to-day trading, stock, finance, reporting and administration.</p></div><span className="soft-badge"><Boxes size={14} /> {EXISTING_MODULE_LINKS.length + PHASE_TWO_LINKS.length} module screens</span></div>
      <section className="section-card phase-two-directory-toolbar"><div><h3>Find a module</h3><p>{visibleModuleCount} matching screens · search names, functions or module group.</p></div><label className="phase-two-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search modules…" aria-label="Search all modules" />{search && <button type="button" className="phase-clear-filters" aria-label="Clear module search" onClick={() => setSearch('')}>Clear</button>}</label></section>
      {visibleModuleCount === 0 && <div className="empty-state"><div className="empty-icon"><Search size={22} /></div><h3>No modules match your search</h3><p>Try a different module name, workflow term or group.</p></div>}
      {groupedLinks.map(({ group, items }) => (
        <section className="module-group" key={group} data-module-accent={moduleAccentForGroup(group)}>
          <div className="module-group-heading"><span>{group}</span><span>{items.length} screens</span></div>
          <div className="module-directory-grid">
            {items.map((item) => { const Icon = item.icon; return <Link className="module-directory-card" data-module-accent={moduleAccentForPath(item.to)} to={item.to} key={item.to}><span className="module-directory-icon"><Icon size={20} /></span><span className="module-directory-copy"><strong>{item.title}</strong><small>{item.description}</small></span><ArrowUpRight size={16} className="module-directory-arrow" /></Link>; })}
          </div>
        </section>
      ))}
    </div>
  );
}

type RelatedAction = { targetId: string; label: string; description: string };

function relatedActions(moduleId: string, record: PreviewRecord): RelatedAction[] {
  return getRelatedActions(moduleId, record);
}

function genericRelatedValues(sourceModuleId: string, source: PreviewRecord, targetId: string): FormValues {
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
      actor: 'Workspace user',
      action: 'Review note created',
      entity: sourceTitle,
      reference: sourceReference,
      detail: `Review note for ${sourceTitle} ${sourceReference}. This is an activity note, not a security audit event or a posted business transaction.`,
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
    result.notes = 'Payment record for payroll run ' + (source.payrollReference ?? source.id) + '; no external transfer is initiated.';
  }
  return result;
}

function relatedValues(sourceModuleId: string, source: PreviewRecord, targetId: string): FormValues {
  const today = dateInputValue(new Date());
  const dueDate = dateInputValue(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  if (sourceModuleId === 'purchase-requests' && targetId === 'rfqs') return { purchaseRequest: source.requestNumber ?? '', issueDate: today, responseDue: source.neededBy ?? dueDate, itemSummary: source.itemSummary ?? '', quantity: source.quantity ?? '1', supplierInvited: source.preferredSupplier ?? '', deliveryAddress: source.branch ?? '', terms: source.justification ?? '', status: 'Draft' };
  if (sourceModuleId === 'rfqs' && targetId === 'supplier-quotes') return { rfqNumber: source.rfqNumber ?? '', supplier: source.supplierInvited ?? '', quoteDate: today, validUntil: dueDate, itemSummary: source.itemSummary ?? '', quantity: source.quantity ?? '1', unitCost: '0', taxTreatment: 'Standard rated', taxRate: '18', deliveryDays: '0', paymentTerms: '30 days', status: 'Draft' };
  if (sourceModuleId === 'supplier-quotes' && targetId === 'purchases') { const expected = dateInputValue(new Date(Date.now() + Math.max(0, safeNumber(source.deliveryDays)) * 86400000)); return { supplier: source.supplier ?? '', orderDate: today, expectedDate: expected, itemSummary: source.itemSummary ?? '', quantity: source.quantity ?? '1', unitCost: source.unitCost ?? '0', taxTreatment: source.taxTreatment ?? 'Standard rated', taxRate: source.taxRate ?? '18', amountPaid: '0', status: 'Draft' }; }
  if (sourceModuleId === 'opportunities' && targetId === 'sales-orders') return { customer: source.company ?? source.contactName ?? '', orderDate: today, expectedDate: source.expectedCloseDate ?? dueDate, itemSummary: source.nextAction ?? ('Opportunity: ' + (source.opportunityCode ?? source.company ?? '')), quantity: '1', unitPrice: source.amount ?? '0', discountPercent: '0', taxTreatment: 'Standard rated', taxRate: '18', status: 'Draft' };
  if (sourceModuleId === 'sales-invoices' && targetId === 'sales-returns') return { sourceInvoice: source.invoiceNumber ?? '', customer: source.customer ?? '', returnDate: today, reason: 'Customer changed mind', itemDescription: source.itemSummary ?? '', quantity: '1', unitPrice: source.unitPrice ?? '0', taxTreatment: source.taxTreatment ?? 'Standard rated', taxRate: source.taxRate ?? '18', resolution: 'Customer credit', status: 'Draft' };
  if (sourceModuleId === 'purchase-invoices' && targetId === 'purchase-returns') return { sourcePurchaseOrder: source.purchaseOrder ?? source.billNumber ?? '', supplier: source.supplier ?? '', returnDate: today, reason: 'Other', itemDescription: source.itemSummary ?? '', quantity: '1', unitCost: source.unitCost ?? '0', taxTreatment: source.taxTreatment ?? 'Standard rated', taxRate: source.taxRate ?? '18', status: 'Draft' };
  if (sourceModuleId === 'receiving' && targetId === 'quality') return { sourceType: 'Goods receipt', sourceReference: source.receiptNumber ?? '', item: source.product ?? '', inspectionDate: today, inspector: '', inspectedQuantity: String(Math.max(1, safeNumber(source.acceptedQuantity) + safeNumber(source.rejectedQuantity))), acceptedQuantity: source.acceptedQuantity ?? '0', rejectedQuantity: source.rejectedQuantity ?? '0', defectType: 'None identified', notes: '', status: 'Draft' };
  if (sourceModuleId === 'work-orders' && targetId === 'quality') return { sourceType: 'Production order', sourceReference: source.workOrderNumber ?? '', item: source.productName ?? '', inspectionDate: today, inspector: '', inspectedQuantity: source.completedQuantity ?? source.plannedQuantity ?? '1', acceptedQuantity: source.completedQuantity ?? source.plannedQuantity ?? '1', rejectedQuantity: '0', defectType: 'None identified', notes: '', status: 'Draft' };
  if (sourceModuleId === 'customers' && targetId === 'quotations') return { customer: source.name ?? '', issueDate: today, validUntil: dueDate, itemSummary: '', quantity: '1', unitPrice: '0', discountPercent: '0', taxTreatment: 'Standard rated', taxRate: '18', status: 'Draft' };
  if (sourceModuleId === 'suppliers' && targetId === 'purchases') return { supplier: source.name ?? '', orderDate: today, expectedDate: dueDate, itemSummary: '', quantity: '1', unitCost: '0', taxTreatment: 'Standard rated', taxRate: '18', amountPaid: '0', status: 'Draft' };
  if (sourceModuleId === 'quotations' && targetId === 'sales-orders') return { customer: source.customer ?? '', orderDate: today, expectedDate: source.validUntil ?? dueDate, itemSummary: source.itemSummary ?? '', quantity: source.quantity ?? '1', unitPrice: source.unitPrice ?? '0', discountPercent: source.discountPercent ?? '0', taxTreatment: source.taxTreatment ?? 'Standard rated', taxRate: source.taxRate ?? '18', status: 'Draft' };
  if (sourceModuleId === 'sales-orders' && targetId === 'deliveries') return { salesOrder: source.orderNumber ?? '', customer: source.customer ?? '', dispatchDate: today, expectedDate: source.expectedDate ?? dueDate, deliveryAddress: '', courier: '', trackingReference: '', deliveryFee: '0', method: 'Own fleet', status: 'Draft' };
  if (sourceModuleId === 'sales-orders' && targetId === 'sales-invoices') return { customer: source.customer ?? '', salesOrderReference: source.orderNumber ?? '', issueDate: today, dueDate, itemSummary: source.itemSummary ?? '', quantity: source.quantity ?? '1', unitPrice: source.unitPrice ?? '0', taxTreatment: source.taxTreatment ?? 'Standard rated', taxRate: source.taxRate ?? '18', amountReceived: '0', status: 'Draft' };
  if (sourceModuleId === 'purchases' && targetId === 'receiving') return { purchaseOrder: source.poNumber ?? '', supplier: source.supplier ?? '', receiptDate: today, product: source.itemSummary ?? '', orderedQuantity: source.quantity ?? '1', acceptedQuantity: '0', rejectedQuantity: '0', warehouse: '', batchNumber: '', status: 'Draft' };
  if (sourceModuleId === 'purchases' && targetId === 'purchase-invoices') return { supplier: source.supplier ?? '', purchaseOrder: source.poNumber ?? '', billDate: today, dueDate, itemSummary: source.itemSummary ?? '', quantity: source.quantity ?? '1', unitCost: source.unitCost ?? '0', taxTreatment: source.taxTreatment ?? 'Standard rated', taxRate: source.taxRate ?? '18', amountPaid: '0', status: 'Draft' };
  if (sourceModuleId === 'leads' && targetId === 'opportunities') return { company: source.company ?? '', contactName: source.contactName ?? '', email: source.email ?? '', source: source.source ?? 'Other', owner: source.owner ?? '', createdDate: today, expectedCloseDate: source.expectedCloseDate ?? dueDate, amount: source.estimatedValue ?? '0', probability: source.probability ?? '10', nextAction: source.nextAction ?? '', status: 'New' };
  if (sourceModuleId === 'sales-orders' && targetId === 'packages') return { salesOrder: source.orderNumber ?? '', customer: source.customer ?? '', packageDate: today, itemSummary: source.itemSummary ?? '', packageCount: '1', weightKg: '0', courier: 'Own fleet', trackingReference: '', status: 'Not shipped' };
  if (sourceModuleId === 'packages' && targetId === 'deliveries') return { salesOrder: source.salesOrder ?? '', customer: source.customer ?? '', dispatchDate: today, expectedDate: dueDate, deliveryAddress: '', courier: source.courier ?? '', trackingReference: source.trackingReference ?? '', deliveryFee: '0', method: 'Own fleet', status: 'Draft' };
  if (sourceModuleId === 'work-orders' && targetId === 'job-cards') return { workOrderNumber: source.workOrderNumber ?? '', operation: 'Assembly', workstation: '', operator: '', plannedHours: '1', actualHours: '0', startDate: today, endDate: '', outputReference: source.productName ?? '', status: 'Draft' };
  if (sourceModuleId === 'boms' && targetId === 'work-orders') return { workOrderNumber: '', productSKU: source.finishedProductSKU ?? '', productName: source.finishedProductName ?? '', bomReference: source.bomCode ?? '', plannedQuantity: source.outputQuantity ?? '1', completedQuantity: '0', unitCost: source.unitMaterialCost ?? '0', startDate: today, targetDate: dueDate, status: 'Draft' };
  if (sourceModuleId === 'replenishment' && targetId === 'purchases') return { supplier: source.preferredSupplier ?? '', orderDate: today, expectedDate: source.needByDate ?? dueDate, itemSummary: (source.productSKU ?? '') + ' · ' + (source.productName ?? ''), quantity: source.recommendedQuantity ?? '1', unitCost: '0', taxTreatment: 'Standard rated', taxRate: '18', amountPaid: '0', status: 'Draft' };
  if (sourceModuleId === 'cash-sessions' && targetId === 'bank-reconciliation') return { account: source.terminal ?? 'Cash till', statementDate: source.sessionDate ?? today, statementReference: source.sessionNumber ?? '', openingBalance: source.openingFloat ?? '0', statementBalance: source.countedCash ?? '0', bookBalance: source.expectedCash ?? '0', statementLineCount: '0', matchedCount: '0', unmatchedCount: '0', preparedBy: source.closedBy ?? source.openedBy ?? '', status: 'Draft' };
  if (sourceModuleId === 'campaigns' && targetId === 'leads') return { company: '', contactName: '', phone: '', email: '', source: source.name ?? 'Campaign', owner: source.owner ?? '', createdDate: today, expectedCloseDate: dueDate, estimatedValue: '0', probability: '10', nextAction: 'Follow up from campaign ' + (source.campaignCode ?? ''), status: 'New' };
  if (sourceModuleId === 'picklists' && targetId === 'packages') return { salesOrder: source.salesOrder ?? '', customer: '', packageDate: today, itemSummary: 'Picked from ' + (source.picklistNumber ?? '') + '; ' + (source.unitsPicked ?? '0') + ' units', packageCount: '1', weightKg: '0', courier: 'Own fleet', trackingReference: '', status: 'Not shipped' };
  if (sourceModuleId === 'item-bundles' && targetId === 'work-orders') return { productName: source.bundleName ?? '', bomReference: source.bundleCode ?? '', startDate: today, targetDate: dueDate, plannedQuantity: '1', completedQuantity: '0', unitCost: source.unitCost ?? '0', priority: 'Normal', status: 'Draft' };
  if (sourceModuleId === 'recurring-invoices' && targetId === 'sales-invoices') return { customer: source.customer ?? '', salesOrderReference: '', issueDate: today, dueDate, itemSummary: source.description ?? 'Recurring invoice draft', quantity: source.quantity ?? '1', unitPrice: source.unitPrice ?? '0', taxTreatment: source.taxTreatment ?? 'Standard rated', taxRate: source.taxRate ?? '18', amountReceived: '0', status: 'Draft' };
  if (targetId === 'payments') {
    const moneyIn = sourceModuleId === 'sales-invoices';
    const isSupplierBill = sourceModuleId === 'purchase-invoices';
    const isExpense = sourceModuleId === 'expenses';
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
    };
  }
  return genericRelatedValues(sourceModuleId, source, targetId);
}

function ModuleManager({ module }: { module: ModuleDefinition }) {
  const { workspace, branch } = useWorkspace();
  const navigate = useNavigate();
  const previewDataService = usePreviewDataService();
  const previewScope: PreviewScope = { workspaceId: workspace.id, branchId: branch.id };
  const queryClient = useQueryClient();
  const previewQueryKey = ['module-register', workspace.id, branch.id, module.id] as const;
  const previewQuery = useQuery({
    queryKey: previewQueryKey,
    queryFn: () => previewDataService.list(previewScope, module.id, module.initial),
  });
  const rows = previewQuery.data ?? [];
  const lineConfig = getDocumentLineConfig(module.id);
  const [, setStorageMode] = useState<'browser-local' | 'memory-only'>(previewDataService.getPersistenceMode());
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
  const lineItems = useMemo(() => readDocumentLines(module.id, form), [module.id, form]);
  const [saving, setSaving] = useState(false);
  const statuses = useMemo(() => Array.from(new Set(rows.map((row) => row.status).filter(Boolean))).sort(), [rows]);
  const filtered = useMemo(() => filterPreviewRecords(rows, module, { search, status: statusFilter, dateFrom, dateTo }), [rows, module, search, statusFilter, dateFrom, dateTo]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / Number(pageSize)));
  const visible = paginatePreviewRecords(filtered, page, Number(pageSize));
  const attentionCount = rows.filter((row) => ATTENTION_STATES.includes(row.status)).length;
  const trackedValue = module.amountKey && rows.length ? rows.reduce((sum, row) => sum + safeNumber(row[module.amountKey!]), 0) : null;

  useEffect(() => { if (previewQuery.isSuccess) setStorageMode(previewDataService.getPersistenceMode()); }, [previewQuery.isSuccess, previewQuery.dataUpdatedAt]);

  useEffect(() => { setPage(1); }, [search, statusFilter, dateFrom, dateTo, pageSize]);
  useEffect(() => {
    if (!formOpen && !detail) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setFormOpen(false); setDetail(null); } };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [formOpen, detail]);

  function openNew() { setEditing(null); setForm(initialValues(module)); setFormOpen(true); }
  function openEdit(record: PreviewRecord) { setDetail(null); setEditing(record); setForm(valuesFromRecord(module, record)); setFormOpen(true); }
  async function saveForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    try {
      const structuredValidation = module.id === 'accounting'
        ? validateJournalLines(form)
        : validateAssemblyComponents(module.id, form);
      if (structuredValidation) { toast.error('Check the entry lines', { description: structuredValidation }); setSaving(false); return; }
      const lineValidation = validateDocumentLines(module.id, form);
      if (lineValidation) { toast.error('Check the document lines', { description: lineValidation }); setSaving(false); return; }
      let normalizedValues = form;
      if (module.id === 'accounting') normalizedValues = syncJournalLines(normalizedValues, readJournalLines(normalizedValues));
      if (module.id === 'boms' || module.id === 'item-bundles') normalizedValues = syncAssemblyComponents(module.id, normalizedValues, readAssemblyComponents(module.id, normalizedValues));
      const valuesToSave = lineConfig ? syncDocumentLines(module.id, normalizedValues, readDocumentLines(module.id, normalizedValues)) : normalizedValues;
      const uniqueField: Record<string, string> = {
        leads: 'leadCode', 'cash-sessions': 'sessionNumber', boms: 'bomCode', 'job-cards': 'jobCardNumber', leave: 'leaveRequestNumber', replenishment: 'replenishmentNumber', packages: 'packageNumber', timesheets: 'timesheetNumber',
        contacts: 'contactCode', campaigns: 'campaignCode', 'sales-teams': 'salespersonCode', 'item-bundles': 'bundleCode', picklists: 'picklistNumber', 'cost-centers': 'costCenterCode', budgets: 'budgetCode', integrations: 'integrationCode', 'recurring-invoices': 'scheduleCode',
        opportunities: 'opportunityCode', 'sales-returns': 'returnNumber', 'purchase-returns': 'returnNumber', projects: 'projectCode', tasks: 'taskCode', support: 'ticketNumber', 'work-orders': 'workOrderNumber', quality: 'inspectionNumber', batches: 'trackingReference',
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
      if (key && rows.some((row) => row.id !== editing?.id && String(row[key] ?? '').trim().toLocaleLowerCase() === String(valuesToSave[key] ?? '').trim().toLocaleLowerCase())) {
        toast.error('That reference already exists in this register', { description: 'Use a unique reference before saving.' });
        setSaving(false); return;
      }
      const record = calculateRecord(module.id, valuesToSave, editing?.id);
      const validation = validateRecord(module.id, valuesToSave, record);
      if (validation) { toast.error('Check the form', { description: validation }); setSaving(false); return; }
      const nextRows = await previewDataService.save(previewScope, module.id, record, module.initial);
      queryClient.setQueryData(previewQueryKey, nextRows);
      void queryClient.invalidateQueries({ queryKey: ['module-reports', workspace.id, branch.id] });
      setStorageMode(previewDataService.getPersistenceMode());
      setFormOpen(false); setEditing(null); setForm(initialValues(module));
      toast.success(editing ? 'Record updated' : 'Record created', { description: previewDataService.getPersistenceMode() === 'browser-local' ? 'Saved on this device for the active business and branch.' : 'Browser storage is unavailable; this record will be lost when the session ends.' });
    } catch (error) { toast.error('Could not save record', { description: error instanceof Error ? error.message : 'Please check the form.' }); }
    finally { setSaving(false); }
  }
  async function updateStatus(record: PreviewRecord) {
    const next = nextStatus(module.id, record.status);
    if (!next) { toast.info('There are no further status steps for this record'); return; }
    try {
      const nextRows = await previewDataService.updateStatus(previewScope, module.id, record.id, next, module.initial);
      queryClient.setQueryData(previewQueryKey, nextRows);
      void queryClient.invalidateQueries({ queryKey: ['module-reports', workspace.id, branch.id] });
      const updated = nextRows.find((row) => row.id === record.id);
      if (updated) setDetail(updated);
      setStorageMode(previewDataService.getPersistenceMode());
      toast.success('Status updated', { description: record.status + ' → ' + next + '. No connected server or ledger posting occurred.' });
    } catch (error) { toast.error('Could not change status', { description: error instanceof Error ? error.message : 'Try again.' }); }
  }

  async function createRelatedPreview(targetId: string, source: PreviewRecord) {
    const target = getModuleDefinition(targetId);
    if (!target) { toast.error('The destination module is unavailable.'); return; }
    if (isDuplicateSensitiveHandoff(module.id, targetId)) {
      const existingRows = await previewDataService.list(previewScope, targetId, target.initial);
      const existing = existingRows.find((row) => row.sourceModuleId === module.id && row.sourceRecordId === source.id && !['Cancelled', 'Void', 'Voided', 'Rejected', 'Lost'].includes(row.status));
      if (existing) {
        const targetReferenceField = REFERENCE_FIELDS[targetId];
        const existingReference = targetReferenceField ? (existing[targetReferenceField] ?? existing.id) : existing.id;
        toast.error('Related draft already exists', { description: `${target.title} ${existingReference} is already linked to this source. Open the target register to review or edit it instead of creating a duplicate.` });
        navigate('/modules/' + targetId);
        return;
      }
    }
    const sourceReferenceField = REFERENCE_FIELDS[module.id];
    const sourceReference = sourceReferenceField ? (source[sourceReferenceField] ?? source.id) : source.id;
    const values = { ...initialValues(target), ...relatedValues(module.id, source, targetId), sourceModuleId: module.id, sourceRecordId: source.id, sourceReference };
    const linked = calculateRecord(targetId, values);
    try {
      const targetRows = await previewDataService.save(previewScope, targetId, linked, target.initial);
      queryClient.setQueryData(['module-register', workspace.id, branch.id, targetId], targetRows);
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
              actor: 'Workspace user',
              action: 'Related draft created',
              entity: target.title,
              reference: targetReference,
              detail: `${target.title} ${targetReference} was prepared from ${module.title} ${sourceReference}. This activity note does not create a posting in the core ledgers.`,
              sourceModuleId: module.id,
              sourceRecordId: source.id,
              sourceReference,
            };
            const auditRows = await previewDataService.save(previewScope, 'audit', auditRecord, auditModule.initial);
            queryClient.setQueryData(['module-register', workspace.id, branch.id, 'audit'], auditRows);
          } catch (auditError) {
            toast.warning('Related draft saved, but the activity note could not be saved', { description: auditError instanceof Error ? auditError.message : 'The local activity register could not be updated.' });
          }
        }
      }
      void queryClient.invalidateQueries({ queryKey: ['module-reports', workspace.id, branch.id] });
      setStorageMode(previewDataService.getPersistenceMode());
      setDetail(null);
      toast.success('Related draft created', { description: 'Saved on this device. The related core stock and accounting ledgers were not changed.' });
      navigate('/modules/' + targetId);
    } catch (error) { toast.error('Could not save the related record', { description: error instanceof Error ? error.message : 'Browser storage may be unavailable.' }); }
  }

  function exportRows() {
    const cols = module.columns;
    downloadCsv('lexa-records-' + module.id + '.csv', cols.map((column) => column.label), filtered.map((row) => cols.map((column) => row[column.key] ?? '')));
  }
  const amountText = trackedValue === null ? String(rows.length) : money(trackedValue, workspace.currency);
  const recordCountLabel = rows.length === 1 ? 'record' : 'records';

  return (
    <div className="page-stack phase-two-page" data-module-accent={moduleAccentForPath("/modules/" + module.id)}>
      <div className="page-heading-row module-heading"><div><div className="eyebrow eyebrow-blue">{module.group} / MODULE REGISTER</div><h2>{module.title}</h2><p>{module.description}</p></div><div className="phase-two-heading-actions"><span className="module-preview-badge"><span />Saved on this device</span>{!module.readOnly && <button className="button button-primary" onClick={openNew}><Plus size={16} /> New {module.singular}</button>}</div></div>
      <div className="module-workflow-strip"><span className="module-workflow-icon"><Activity size={17} /></span><div><strong>Typical workflow</strong><p>{module.workflow}</p></div></div>
      <div className="metric-strip three-metrics phase-two-metrics">
        <div className="mini-metric"><span>Total {recordCountLabel}</span><strong>{rows.length.toLocaleString()}</strong><small>In this register</small></div>
        <div className="mini-metric"><span>Needs attention</span><strong className={attentionCount ? 'warning-value' : ''}>{attentionCount.toLocaleString()}</strong><small>Draft, pending or review states</small></div>
        <div className="mini-metric"><span>{trackedValue === null ? 'Visible data types' : 'Tracked value'}</span><strong className="phase-two-value">{amountText}</strong><small>{trackedValue === null ? 'Available after records are added' : 'Calculated from this register; not a ledger balance'}</small></div>
      </div>

      <section className="section-card table-card phase-two-table-card">
        <div className="table-toolbar phase-two-table-toolbar"><div><h3>{module.title} register</h3><p>{filtered.length.toLocaleString()} matching {filtered.length === 1 ? 'record' : 'records'} · records in the active business and branch</p></div><div className="phase-two-table-actions"><button className="button button-secondary button-small" onClick={exportRows} disabled={!filtered.length}><Download size={14} /> Export CSV</button></div></div>
        <div className="phase-two-filters">
          <label className="phase-two-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={'Search ' + module.title.toLowerCase() + '…'} aria-label={'Search ' + module.title} /><kbd>/</kbd></label>
          <label className="phase-filter-select"><Filter size={14} /><span className="sr-only">Filter by status</span><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={13} /></label>
          {module.dateKey && <><label className="phase-date-filter"><CalendarDays size={14} /><span className="sr-only">From date</span><input type="date" aria-label="From date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label className="phase-date-filter"><span className="sr-only">To date</span><input type="date" aria-label="To date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label></>}
          {(search || statusFilter !== 'All statuses' || dateFrom || dateTo) && <button className="phase-clear-filters" onClick={() => { setSearch(''); setStatusFilter('All statuses'); setDateFrom(''); setDateTo(''); }}>Clear</button>}
        </div>
        {dateFrom && dateTo && dateFrom > dateTo && <div className="inline-warning" role="alert">The start date must be on or before the end date.</div>}
        {previewQuery.isError ? <div className="inline-error"><strong>Could not load this register.</strong><span>{previewQuery.error instanceof Error ? previewQuery.error.message : 'Check browser storage and retry.'}</span><button className="button button-secondary button-small" onClick={() => void previewQuery.refetch()}>Retry load</button></div> : previewQuery.isLoading ? <div className="loading-state">Loading records…</div> : visible.length === 0 ? <div className="empty-state"><div className="empty-icon"><Search size={22} /></div><h3>No matching records</h3><p>Change the search, status or date filters. New records will appear here after you save them.</p>{!module.readOnly && <button className="button button-primary" onClick={openNew}><Plus size={15} /> Add {module.singular}</button>}</div> : <div className="responsive-table-wrap phase-two-table-wrap"><table className="data-table phase-two-table"><thead><tr>{module.columns.map((column) => <th key={column.key}>{column.label}</th>)}<th className="phase-actions-heading">ACTIONS</th></tr></thead><tbody>{visible.map((record) => <tr key={record.id}>{module.columns.map((column) => <td key={column.key} className={column.kind === 'money' ? 'amount-cell' : ''}>{column.kind === 'status' ? <span className={'status-pill ' + (['Active', 'Received', 'Paid', 'Posted', 'Reconciled', 'Accepted', 'Accepted externally', 'Completed', 'Delivered', 'Approved', 'Reviewed', 'Present'].includes(record[column.key] ?? '') ? 'status-good' : ['Draft', 'Pending', 'Ready for integration', 'Needs review', 'Overdue', 'Disputed', 'Rejected externally', 'Needs inspection', 'On hold', 'In transit', 'Review', 'Late', 'Restricted', 'Delivery failed', 'Needs review', 'Blocked', 'Expired', 'Disabled', 'Matching', 'Reopened', 'Error', 'Not connected', 'Configuration needed', 'Needs attention', 'Failed', 'Short pick', 'Exception', 'Quarantined', 'Blocked', 'Variance review', 'Review needed', 'Missing mapping'].includes(record[column.key] ?? '') ? 'status-warning' : '')}>{record[column.key] || '—'}</span> : cellValue(record, column.key, column.kind, workspace.currency)}</td>)}<td><div className="phase-row-actions"><button className="icon-button table-action" aria-label={'View ' + module.singular} title="View details" onClick={() => setDetail(record)}><Eye size={15} /></button>{!module.readOnly && <button className="icon-button table-action" aria-label={'Edit ' + module.singular} title="Edit record" onClick={() => openEdit(record)}><Edit3 size={15} /></button>}</div></td></tr>)}</tbody></table></div>}
        <div className="phase-two-table-footer"><span>Showing {filtered.length ? ((page - 1) * Number(pageSize) + 1).toLocaleString() : 0}–{Math.min(page * Number(pageSize), filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}</span><div className="phase-pagination"><label><span>Rows</span><select aria-label="Rows per page" value={pageSize} onChange={(event) => setPageSize(event.target.value)}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label><button className="button button-secondary button-small" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button><span>Page {page} of {pageCount}</span><button className="button button-secondary button-small" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</button></div></div>
      </section>

      {!module.readOnly && <div className="phase-two-help-row"><CircleAlert size={15} /><span>Use the details action to review a record, edit fields, or move it through the available status workflow. Status updates do not substitute for a required approval or accounting entry.</span></div>}

      {formOpen && <div className="phase-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setFormOpen(false); setEditing(null); } }}><section className="phase-modal" role="dialog" aria-modal="true" aria-labelledby="phase-form-title"><div className="phase-modal-header"><div><div className="eyebrow eyebrow-blue">{module.group} / DATA ENTRY</div><h3 id="phase-form-title">{editing ? 'Edit ' + module.singular : 'New ' + module.singular}</h3><p>Enter the record details and review calculated figures before saving.</p></div><button className="icon-button" aria-label="Close form" onClick={() => { setFormOpen(false); setEditing(null); }}><X size={18} /></button></div><form className="phase-modal-body" onSubmit={saveForm}>{lineConfig && <DocumentLineItemsEditor config={lineConfig} lines={lineItems} currency={workspace.currency} onChange={(lines) => setForm((current) => syncDocumentLines(module.id, current, lines))} />}{module.id === 'accounting' && <JournalLinesEditor values={form} currency={workspace.currency} onChange={setForm} />}{(module.id === 'boms' || module.id === 'item-bundles') && <AssemblyComponentsEditor moduleId={module.id} values={form} currency={workspace.currency} onChange={setForm} />}<div className="phase-form-grid">{module.fields.filter((field) => {
          if (lineConfig && [lineConfig.descriptionKey, 'quantity', lineConfig.priceKey].includes(field.key)) return false;
          if (module.id === 'accounting' && ['debitAccount', 'creditAccount', 'amount'].includes(field.key)) return false;
          if (module.id === 'boms' && ['componentSummary', 'unitMaterialCost'].includes(field.key)) return false;
          if (module.id === 'item-bundles' && ['componentsSummary', 'componentCount', 'unitCost'].includes(field.key)) return false;
          return true;
        }).map((field) => <FieldInput key={field.key} field={field} value={form[field.key] ?? ''} onChange={(value) => setForm((current) => ({ ...current, [field.key]: value }))} currency={workspace.currency} editing={Boolean(editing)} />)}</div><CalculatedFigures moduleId={module.id} values={form} currency={workspace.currency} /><div className="phase-form-disclaimer"><ShieldAlert size={15} /><span>Save stores this record in the active workspace on this device. It does not transfer money, submit tax documents or create accounting entries.</span></div><div className="phase-modal-actions"><button type="button" className="button button-secondary" onClick={() => { setFormOpen(false); setEditing(null); }}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save record'} <Check size={15} /></button></div></form></section></div>}

      {detail && <div className="phase-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}><section className="phase-modal phase-detail-modal" role="dialog" aria-modal="true" aria-labelledby="phase-detail-title"><div className="phase-modal-header"><div><div className="eyebrow eyebrow-blue">{module.title.toUpperCase()} / RECORD DETAILS</div><h3 id="phase-detail-title">{detail[module.columns[0]?.key ?? 'id'] || detail.id}</h3><p>Reference: {detail.id} · Updated {displayDate(detail.updatedAt)}</p></div><button className="icon-button" aria-label="Close details" onClick={() => setDetail(null)}><X size={18} /></button></div><div className="phase-detail-status"><span className={'status-pill ' + (CLOSED_STATES.includes(detail.status) ? 'status-good' : 'status-warning')}>{detail.status}</span><span className="module-preview-badge"><span /> Saved on this device</span></div><div className="phase-detail-grid">{Object.entries(detail).filter(([key]) => key !== 'id' && key !== 'updatedAt').map(([key, value]) => <div className="phase-detail-field" key={key}><span>{module.fields.find((field) => field.key === key)?.label ?? module.columns.find((column) => column.key === key)?.label ?? ({ sourceModuleId: 'Source module', sourceRecordId: 'Source record' } as Record<string, string>)[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())}</span><strong>{detailValue(module, key, value, detail.currency || workspace.currency)}</strong></div>)}</div><div className="phase-modal-actions">{getCoreScreenShortcuts(module.id).map((action) => <button key={action.path} className="button button-secondary" title={action.description} onClick={() => navigate(action.path)}><ArrowUpRight size={15} /> {action.label}</button>)}{!module.readOnly && <>{relatedActions(module.id, detail).map((action) => <button key={action.targetId} className="button button-secondary" title={action.description} onClick={() => createRelatedPreview(action.targetId, detail)}><ArrowRight size={15} /> {action.label}</button>)}{nextStatus(module.id, detail.status) && <button className="button button-secondary" onClick={() => updateStatus(detail)}><BadgeCheck size={15} /> Advance to {nextStatus(module.id, detail.status)}</button>}<button className="button button-primary" onClick={() => openEdit(detail)}><Edit3 size={15} /> Edit record</button></>}<button className="button button-secondary" onClick={() => setDetail(null)}>Close</button></div></section></div>}
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
  const computed = calculateRecord(moduleId, values);
  let figures: Array<{ label: string; value: string }> = [];
  if (['quotations', 'sales-orders', 'sales-invoices', 'purchases', 'purchase-invoices', 'supplier-quotes', 'sales-returns', 'purchase-returns'].includes(moduleId)) {
    figures = [
      { label: 'Subtotal', value: money(safeNumber(computed.subtotal), currency) },
      { label: 'Discount', value: money(safeNumber(computed.discountAmount), currency) },
      { label: 'Tax estimate', value: money(safeNumber(computed.taxAmount), currency) },
      { label: 'Document total', value: money(safeNumber(computed.total), currency) },
    ];
    if (moduleId === 'purchases' || moduleId === 'purchase-invoices') figures.push({ label: 'Estimated payable remaining', value: money(safeNumber(computed.amountDue), currency) });
    if (moduleId === 'sales-returns') figures.push({ label: 'Estimated customer credit', value: money(safeNumber(computed.creditAmount), currency) });
    if (moduleId === 'purchase-returns') figures.push({ label: 'Estimated supplier debit', value: money(safeNumber(computed.debitAmount), currency) });
    if (moduleId === 'sales-invoices') figures.push({ label: 'Estimated amount due', value: money(safeNumber(computed.amountDue), currency) });
  } else if (moduleId === 'opportunities') {
    figures = [{ label: 'Estimated deal value', value: money(n('amount'), currency) }, { label: 'Win probability', value: n('probability').toFixed(1) + '%' }, { label: 'Weighted pipeline value', value: money(safeNumber(computed.weightedValue), currency) }];
  } else if (moduleId === 'projects') {
    figures = [{ label: 'Approved budget', value: money(n('budget'), currency) }, { label: 'Cost estimate', value: money(n('actualCost'), currency) }, { label: 'Budget remaining / variance', value: money(safeNumber(computed.budgetVariance), currency) }, { label: 'Progress', value: n('progressPercent').toFixed(1) + '%' }];
  } else if (moduleId === 'tasks') {
    figures = [{ label: 'Estimated hours', value: n('estimatedHours').toFixed(1) }, { label: 'Actual hours', value: n('actualHours').toFixed(1) }, { label: 'Hours variance', value: safeNumber(computed.hoursVariance).toFixed(1) }];
  } else if (moduleId === 'work-orders') {
    figures = [{ label: 'Planned output', value: n('plannedQuantity').toLocaleString() }, { label: 'Completed output', value: n('completedQuantity').toLocaleString() }, { label: 'Completion', value: safeNumber(computed.completionPercent).toFixed(1) + '%' }, { label: 'Planned cost estimate', value: money(safeNumber(computed.plannedCost), currency) }];
  } else if (moduleId === 'quality') {
    figures = [{ label: 'Inspected', value: n('inspectedQuantity').toLocaleString() }, { label: 'Accepted', value: n('acceptedQuantity').toLocaleString() }, { label: 'Rejected', value: n('rejectedQuantity').toLocaleString() }, { label: 'Reject rate', value: safeNumber(computed.rejectionRate).toFixed(1) + '%' }];
  } else if (moduleId === 'leads') {
    figures = [{ label: 'Estimated value', value: money(n('estimatedValue'), currency) }, { label: 'Win probability', value: n('probability').toFixed(1) + '%' }, { label: 'Weighted pipeline estimate', value: money(safeNumber(computed.weightedValue), currency) }];
  } else if (moduleId === 'cash-sessions') {
    figures = [{ label: 'Expected cash', value: money(safeNumber(computed.expectedCash), currency) }, { label: 'Counted cash', value: money(n('countedCash'), currency) }, { label: 'Over / short', value: money(safeNumber(computed.variance), currency) }];
  } else if (moduleId === 'boms') {
    figures = [{ label: 'Component lines', value: readAssemblyComponents(moduleId, values).length.toLocaleString() }, { label: 'Output quantity', value: n('outputQuantity').toLocaleString() }, { label: 'Estimated unit material cost', value: money(n('unitMaterialCost'), currency) }, { label: 'Estimated run cost', value: money(safeNumber(computed.estimatedMaterialCost), currency) }];
  } else if (moduleId === 'job-cards') {
    figures = [{ label: 'Planned hours', value: n('plannedHours').toFixed(2) }, { label: 'Actual hours', value: n('actualHours').toFixed(2) }, { label: 'Hour variance', value: safeNumber(computed.hoursVariance).toFixed(2) }];
  } else if (moduleId === 'leave') {
    figures = [{ label: 'Start date', value: displayDate(values.startDate) }, { label: 'End date', value: displayDate(values.endDate) }, { label: 'Calendar days estimate', value: safeNumber(computed.daysRequested).toLocaleString() }];
  } else if (moduleId === 'replenishment') {
    figures = [{ label: 'Days of cover estimate', value: computed.daysCover === '—' ? 'No demand rate' : safeNumber(computed.daysCover).toFixed(2) + ' days' }, { label: 'Reorder point', value: n('reorderPoint').toLocaleString() }, { label: 'Recommended quantity', value: safeNumber(computed.recommendedQuantity).toLocaleString() }];
  } else if (moduleId === 'packages') {
    figures = [{ label: 'Packages', value: n('packageCount').toLocaleString() }, { label: 'Weight estimate', value: n('weightKg').toFixed(2) + ' kg' }, { label: 'Tracking reference', value: values.trackingReference || 'Not entered' }];
  } else if (moduleId === 'timesheets') {
    figures = [{ label: 'Total hours', value: n('hours').toFixed(2) }, { label: 'Billable hours', value: n('billableHours').toFixed(2) }, { label: 'Billable amount estimate', value: money(safeNumber(computed.billableAmount), currency) }];
  } else if (moduleId === 'campaigns') {
    figures = [{ label: 'Budget remaining', value: money(n('budget') - n('actualSpend'), currency) }, { label: 'Estimated cost per lead', value: computed.costPerLead === '—' ? 'No leads yet' : money(safeNumber(computed.costPerLead), currency) }, { label: 'Opportunity / lead ratio', value: safeNumber(computed.opportunityConversionPercent).toFixed(1) + '%' }];
  } else if (moduleId === 'sales-teams') {
    figures = [{ label: 'Target achievement', value: computed.achievementPercent === '—' ? 'No target entered' : safeNumber(computed.achievementPercent).toFixed(1) + '%' }, { label: 'Sales achieved', value: money(n('salesAchieved'), currency) }, { label: 'Indicative commission estimate', value: money(safeNumber(computed.indicativeCommission), currency) }];
  } else if (moduleId === 'item-bundles') {
    figures = [{ label: 'Estimated bundle cost', value: money(n('unitCost'), currency) }, { label: 'Estimated selling price', value: money(n('sellingPrice'), currency) }, { label: 'Estimated gross margin', value: money(safeNumber(computed.grossMargin), currency) }, { label: 'Margin percentage', value: safeNumber(computed.marginPercent).toFixed(1) + '%' }, { label: 'Component lines', value: readAssemblyComponents(moduleId, values).length.toLocaleString() }];
  } else if (moduleId === 'picklists') {
    figures = [{ label: 'Units to pick', value: n('unitsToPick').toLocaleString() }, { label: 'Units picked', value: n('unitsPicked').toLocaleString() }, { label: 'Units outstanding', value: safeNumber(computed.unitsOutstanding).toLocaleString() }, { label: 'Pick completion', value: safeNumber(computed.pickPercent).toFixed(1) + '%' }];
  } else if (moduleId === 'budgets') {
    figures = [{ label: 'Approved budget', value: money(n('budgetAmount'), currency) }, { label: 'Budget remaining after actuals', value: money(safeNumber(computed.variance), currency) }, { label: 'After committed spend', value: money(safeNumber(computed.availableBudget), currency) }, { label: 'Forecast variance', value: money(safeNumber(computed.forecastVariance), currency) }];
  } else if (moduleId === 'integrations') {
    figures = [{ label: 'Environment', value: values.environment || '—' }, { label: 'Last test', value: values.lastResult || 'Not tested' }, { label: 'Records processed', value: n('recordsProcessed').toLocaleString() }];
  } else if (moduleId === 'bank-reconciliation') {
    figures = [
      { label: 'Statement closing balance', value: money(n('statementBalance'), currency) },
      { label: 'Book closing balance', value: money(n('bookBalance'), currency) },
      { label: 'Unexplained difference', value: money(safeNumber(computed.difference), currency) },
      { label: 'Lines not matched', value: n('unmatchedCount').toLocaleString() },
    ];
  } else if (moduleId === 'tax-codes') {
    figures = [{ label: 'Configured rate', value: n('ratePercent').toFixed(2) + '%' }, { label: 'Treatment', value: values.treatment || '—' }, { label: 'Applicability', value: values.appliesTo || '—' }];
  } else if (moduleId === 'tax-documents') {
    const tax = safeNumber(computed.taxAmount);
    figures = [{ label: 'Taxable amount', value: money(n('taxableAmount'), currency) }, { label: 'Tax estimate', value: money(tax, currency) }, { label: 'Gross estimate', value: money(n('taxableAmount') + tax, currency) }];
  } else if (moduleId === 'stock-counts') {
    figures = [{ label: 'System quantity', value: n('expectedQuantity').toLocaleString() }, { label: 'Counted quantity', value: n('countedQuantity').toLocaleString() }, { label: 'Variance', value: safeNumber(computed.variance).toLocaleString() }];
  } else if (moduleId === 'expenses') {
    figures = [{ label: 'Tax estimate', value: money(safeNumber(computed.taxAmount), currency) }, { label: 'Expense total', value: money(safeNumber(computed.total), currency) }];
  } else if (moduleId === 'assets') {
    figures = [
      { label: 'Depreciable base', value: money(Math.max(0, n('cost') - n('residualValue')), currency) },
      { label: 'Annual straight-line estimate', value: money(safeNumber(computed.annualDepreciation), currency) },
      { label: 'Carrying value estimate', value: money(safeNumber(computed.carryingValue), currency) },
    ];
  } else if (moduleId === 'payroll') {
    figures = [{ label: 'Gross pay entered', value: money(n('grossPay'), currency) }, { label: 'Deductions entered', value: money(n('deductions'), currency) }, { label: 'Net pay estimate', value: money(safeNumber(computed.netPay), currency) }];
  } else if (moduleId === 'attendance') {
    const toMinutes = (value: string) => { const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim()); return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN; };
    const start = toMinutes(values.clockIn ?? ''); const end = toMinutes(values.clockOut ?? '');
    const span = Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : 0;
    figures = [{ label: 'Clock span', value: span ? (span / 60).toFixed(2) + ' hours' : '—' }, { label: 'Unpaid break', value: n('breakMinutes').toLocaleString() + ' minutes' }, { label: 'Worked hours estimate', value: safeNumber(computed.workedHours).toFixed(2) }];
  } else if (moduleId === 'price-lists') {
    const base = Math.max(0, n('basePrice')); const sell = Math.max(0, n('sellingPrice'));
    figures = [{ label: 'Reference price', value: money(base, values.currency || currency) }, { label: 'Configured selling price', value: money(sell, values.currency || currency) }, { label: 'Difference vs reference', value: money(sell - base, values.currency || currency) }];
  } else if (moduleId === 'accounting') {
    const totals = journalTotals(readJournalLines(values));
    figures = [{ label: 'Journal lines', value: readJournalLines(values).length.toLocaleString() }, { label: 'Total debit', value: money(totals.debit, currency) }, { label: 'Total credit', value: money(totals.credit, currency) }, { label: 'Difference', value: money(totals.difference, currency) }];
  } else if (moduleId === 'receiving') {
    figures = [{ label: 'Accepted quantity', value: n('acceptedQuantity').toLocaleString() }, { label: 'Rejected / damaged', value: n('rejectedQuantity').toLocaleString() }, { label: 'Quantity not yet counted on this receipt', value: Math.max(0, n('orderedQuantity') - n('acceptedQuantity') - n('rejectedQuantity')).toLocaleString() }];
  }
  if (!figures.length) return null;
  return <div className="phase-calculated-panel"><div className="phase-calculated-title"><CircleDollarSign size={15} /> Calculated figures <span>Calculated estimate</span></div><div className="phase-calculated-grid">{figures.map((figure) => <div key={figure.label}><span>{figure.label}</span><strong>{figure.value}</strong></div>)}</div></div>;
}

function formatReportValue(value: number, unit: PreviewReportUnit, currency: string): string {
  if (unit === 'count') return Math.round(value).toLocaleString();
  if (unit === 'hours') return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' h';
  try {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency', currency,
      maximumFractionDigits: currency === 'UGX' ? 0 : 2,
    }).format(value);
  } catch {
    return currency + ' ' + value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}

function ReportsPage() {
  const { workspace, branch } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const previewDataService = usePreviewDataService();
  const [period, setPeriod] = useState<ReportPeriod>('Last 30 days');
  const [report, setReport] = useState<PreviewReportName>('Sales & receipts');
  const [reportSearch, setReportSearch] = useState('');
  const scope = { workspaceId: workspace.id, branchId: branch.id };
  const snapshotQuery = useQuery({
    queryKey: ['module-reports', workspace.id, branch.id, report, period],
    queryFn: () => loadPreviewReportSnapshot(previewDataService, scope, report, period, workspace.currency),
  });
  const snapshot = snapshotQuery.data;
  const filteredReportNames = REPORT_NAMES.filter((name) => name.toLocaleLowerCase().includes(reportSearch.trim().toLocaleLowerCase()));
  const max = Math.max(1, ...(snapshot?.entries ?? []).map((item) => Math.abs(item.value)));
  const reportLinks: Array<[string, string, string]> = [
    ['Sales & returns', 'Net sales, credits, discounts and payment estimates.', '/sales'],
    ['Stock valuation', 'On-hand quantity and the core stock movement ledger.', '/inventory'],
    ['Purchases & payables', 'Purchase orders, receiving, supplier bills and payments.', '/modules/purchases'],
    ['Receivables ageing', 'Customer invoices grouped by due date.', '/modules/sales-invoices'],
    ['Payables ageing', 'Supplier bills grouped by due date.', '/modules/purchase-invoices'],
    ['Expenses & cash flow', 'Expenses, money accounts, cash-up and reconciliation.', '/modules/expenses'],
    ['P&L and balance sheet', 'Management estimates and account structure.', '/modules/accounting'],
    ['Tax summary', 'Tax treatment and estimate records. Not an EFRIS submission.', '/modules/tax-codes'],
    ['Bank reconciliation', 'Entered statement lines, book balance and differences.', '/modules/bank-reconciliation'],
    ['Payroll & attendance', 'Attendance exceptions, leave and payroll records.', '/modules/payroll'],
    ['Delivery fulfilment', 'Packages, dispatches and delivery exceptions.', '/modules/deliveries'],
    ['Procurement pipeline', 'Requests, RFQs, supplier quotations and purchase drafts.', '/modules/purchase-requests'],
    ['CRM pipeline', 'Leads, opportunities, next actions and weighted values.', '/modules/leads'],
    ['Production & quality', 'BOMs, work orders, job cards and inspections.', '/modules/work-orders'],
  ];

  function exportReport() {
    if (!snapshot) return;
    downloadCsv(
      'lexa-records-report-' + report.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv',
      ['Report', 'Category', 'Value', 'Unit', 'Currency', 'Period', 'From', 'To', 'Branch', 'Data source'],
      snapshot.entries.map((item) => [snapshot.report, item.label, String(Number(item.value.toFixed(2))), snapshot.unit, snapshot.currency, snapshot.period, getPreviewDateRange(snapshot.period).from, getPreviewDateRange(snapshot.period).to, branch.name, snapshot.sourceLabel]),
    );
    toast.success('Report exported', { description: 'CSV contains the currently displayed saved-record report.' });
  }

  return (
    <div className="page-stack phase-two-page" data-module-accent={moduleAccentForPath("/modules/reports")}>
      <div className="page-heading-row">
        <div><div className="eyebrow eyebrow-blue">INSIGHTS / REPORT CENTRE</div><h2>Reports & analytics</h2><p>Report figures are calculated from saved records for the active business and branch. Select a period to refine the results.</p></div>
        <div className="action-group"><button className="button button-secondary" onClick={() => void queryClient.invalidateQueries({ queryKey: ['module-reports', workspace.id, branch.id] })}><RefreshCw size={15} /> Refresh</button><button className="button button-primary" onClick={exportReport} disabled={!snapshot}><Download size={15} /> Export CSV</button></div>
      </div>

      <section className="section-card phase-report-controls">
        <div><span className="eyebrow eyebrow-blue">REPORT CONFIGURATION</span><h3>Choose a report</h3><p>Periods use calendar dates in your current browser timezone.</p></div>
        <div className="phase-report-control-fields">
          <label className="field-label">Report<select aria-label="Select report" value={report} onChange={(event) => setReport(event.target.value as PreviewReportName)}>{REPORT_NAMES.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label className="field-label">Reporting period<select aria-label="Reporting period" value={period} onChange={(event) => setPeriod(event.target.value as ReportPeriod)}>{REPORT_PERIODS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label className="field-label">Find report<input aria-label="Search reports" value={reportSearch} onChange={(event) => setReportSearch(event.target.value)} placeholder="e.g. stock, payroll, bank" /></label>
        </div>
        {reportSearch && <div className="phase-report-search-results" aria-live="polite"><span>{filteredReportNames.length} matching reports</span>{filteredReportNames.length > 0 && <div>{filteredReportNames.map((name) => <button key={name} type="button" className={'phase-report-chip ' + (name === report ? 'phase-report-chip-active' : '')} onClick={() => { setReport(name); setReportSearch(''); }}>{name}</button>)}</div>}</div>}
      </section>

      {snapshotQuery.isError && <div className="inline-error"><strong>Could not load the report</strong><span>{snapshotQuery.error instanceof Error ? snapshotQuery.error.message : 'Try refreshing the report.'}</span><button className="button button-secondary" onClick={() => void snapshotQuery.refetch()}><RefreshCw size={14} /> Retry report</button></div>}
      {snapshot?.metrics?.length ? <div className="metric-strip four-metrics phase-report-metrics">
        {snapshot.metrics.map((metric) => <div className="mini-metric" key={metric.label}><span>{metric.label}</span><strong>{snapshotQuery.isLoading ? '…' : formatReportValue(metric.value, metric.unit, workspace.currency)}</strong><small>{snapshot.period} · saved records</small></div>)}
      </div> : null}

      <div className="phase-report-layout">
        <section className="section-card phase-report-chart">
          <div className="section-card-heading"><span className="heading-icon blue-icon"><BarChart3 size={18} /></span><div><h3>{report}</h3><p>{period} · {branch.name} · {snapshot?.unit === 'currency' ? workspace.currency : snapshot?.unit === 'hours' ? 'hours' : 'records / units'}</p></div></div>
          {snapshotQuery.isLoading ? <div className="loading-state">Calculating from saved records…</div> : !snapshot || !Object.values(snapshot.filteredRecordCounts).some((count) => count > 0) ? <div className="empty-state compact"><div className="empty-icon"><BarChart3 size={20} /></div><h3>No values for this report yet</h3><p>Add records in the associated module and refresh this report.</p></div> : <div className="phase-bars">{snapshot.entries.map((item) => <div className="phase-bar-row" key={item.label}><span title={item.label}>{item.label}</span><div className="phase-bar-track"><span style={{ width: Math.max(0, Math.abs(item.value) / max * 100) + '%', opacity: item.value < 0 ? 0.48 : 1 }} /></div><strong>{formatReportValue(item.value, snapshot.unit, snapshot.currency)}</strong></div>)}</div>}
          {snapshot && <div className="phase-report-chart-footnote">{snapshot.interpretationNote} Date range: {getPreviewDateRange(snapshot.period).from} – {getPreviewDateRange(snapshot.period).to}. Report generated {new Date(snapshot.generatedAt).toLocaleString()}.</div>}
        </section>
        <section className="section-card phase-report-questions"><div className="section-card-heading"><span className="heading-icon amber-icon"><Activity size={18} /></span><div><h3>Open related workflow</h3><p>Go from a report to the operational records behind it.</p></div></div>{reportLinks.map(([title, description, to]) => <button className="phase-report-link" key={title} onClick={() => navigate(to)}><span><strong>{title}</strong><small>{description}</small></span><ArrowRight size={15} /></button>)}</section>
      </div>
    </div>
  );
}
