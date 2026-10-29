import type { ModuleRecordScope, ModuleRecordService } from '../contracts/previewData';
import { MODULE_CATALOG, getModuleDefinition, type PreviewRecord } from '../../modules/operations/moduleCatalog';
import { safeNumber } from '../../modules/operations/previewRules';

export const REPORT_PERIODS = ['Today', 'Last 7 days', 'Last 30 days', 'Last 90 days', 'Year to date', 'Next 7 days', 'Next 30 days', 'Next 90 days'] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const REPORT_NAMES = [
  'Sales & receipts',
  'Sales returns & discounts',
  'Stock overview',
  'Purchases & payables',
  'Receivables ageing',
  'Payables ageing',
  'Expenses',
  'Profit & loss',
  'Balance sheet',
  'Tax summary',
  'Attendance & payroll',
  'Deliveries',
  'Bank reconciliation',
  'Cash & accounts',
  'Procurement pipeline',
  'CRM & pipeline',
  'Replenishment & expiry',
  'Production & quality',
  'POS cash-up',
  'Projects & timesheets',
  'Project cost & budget',
  'Support queue',
  'Packages & fulfilment',
  'Leave & HR',
  'Sales campaigns & representatives',
  'Budgets vs actual',
  'Picklist fulfilment',
  'Integration health',
  'Recurring billing forecast',
  'Master-data coverage',
] as const;
export type PreviewReportName = (typeof REPORT_NAMES)[number];
export type PreviewReportUnit = 'currency' | 'count' | 'hours';

export interface PreviewReportEntry {
  label: string;
  value: number;
}
export interface PreviewReportMetric {
  label: string;
  value: number;
  unit: PreviewReportUnit;
}
export interface PreviewReportSnapshot {
  report: PreviewReportName;
  period: ReportPeriod;
  currency: string;
  unit: PreviewReportUnit;
  entries: PreviewReportEntry[];
  metrics: PreviewReportMetric[];
  filteredRecordCounts: Record<string, number>;
  generatedAt: string;
  persistenceMode: 'browser-local' | 'memory-only';
  sourceLabel: string;
  interpretationNote: string;
}
export type PreviewRecordsByModule = Record<string, PreviewRecord[]>;

export interface PreviewDateRange {
  from: string;
  to: string;
}

function dateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function getPreviewDateRange(period: ReportPeriod, now = new Date()): PreviewDateRange {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  const futureDays: Record<string, number> = { 'Next 7 days': 7, 'Next 30 days': 30, 'Next 90 days': 90 };
  if (period === 'Today') {
    // start and end intentionally remain the current local calendar date.
  } else if (period === 'Last 7 days') start.setDate(start.getDate() - 6);
  else if (period === 'Last 30 days') start.setDate(start.getDate() - 29);
  else if (period === 'Last 90 days') start.setDate(start.getDate() - 89);
  else if (period === 'Year to date') start.setMonth(0, 1);
  else {
    const endFuture = new Date(end);
    endFuture.setDate(endFuture.getDate() + (futureDays[period] ?? 7) - 1);
    return { from: dateOnly(end), to: dateOnly(endFuture) };
  }
  return { from: dateOnly(start), to: dateOnly(end) };
}

function recordsInPeriod(moduleId: string, rows: PreviewRecord[], range: PreviewDateRange): PreviewRecord[] {
  const dateKey = getModuleDefinition(moduleId)?.dateKey;
  if (!dateKey) return rows.slice();
  return rows.filter((row) => {
    const date = String(row[dateKey] ?? '').slice(0, 10);
    return date >= range.from && date <= range.to;
  });
}

/** Balance / ageing views need older open records through the selected as-of date, not only transactions inside the activity window. */
function recordsAsOf(moduleId: string, rows: PreviewRecord[], asOfDate: string): PreviewRecord[] {
  const dateKey = getModuleDefinition(moduleId)?.dateKey;
  if (!dateKey) return rows.slice();
  return rows.filter((row) => {
    const date = String(row[dateKey] ?? '').slice(0, 10);
    return Boolean(date) && date <= asOfDate;
  });
}

function isLiveSalesInvoice(row: PreviewRecord): boolean {
  return ['Issued', 'Partially paid', 'Paid', 'Overdue'].includes(row.status);
}
function isLiveSupplierBill(row: PreviewRecord): boolean {
  return ['Received', 'Approved', 'Partially paid', 'Paid', 'Overdue', 'Disputed'].includes(row.status);
}
function total(rows: PreviewRecord[], key: string): number {
  return round(rows.reduce((sum, row) => sum + safeNumber(row[key]), 0));
}
function count(rows: PreviewRecord[], predicate: (row: PreviewRecord) => boolean = () => true): number {
  return rows.filter(predicate).length;
}
function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
function sumBy(rows: PreviewRecord[], groupKey: string, valueKey: string): Array<{ label: string; value: number }> {
  const groups = new Map<string, number>();
  for (const row of rows) {
    const label = String(row[groupKey] ?? 'Other').trim() || 'Other';
    groups.set(label, (groups.get(label) ?? 0) + safeNumber(row[valueKey]));
  }
  return [...groups.entries()].map(([label, value]) => ({ label, value: round(value) })).sort((a, b) => b.value - a.value);
}
function daysOverdue(dueDate: string, today: string): number {
  if (!dueDate || dueDate >= today) return 0;
  const due = Date.parse(dueDate.slice(0, 10) + 'T00:00:00Z');
  const asAt = Date.parse(today + 'T00:00:00Z');
  return Number.isFinite(due) && Number.isFinite(asAt) ? Math.max(0, Math.floor((asAt - due) / 86400000)) : 0;
}
function ageing(rows: PreviewRecord[], range: PreviewDateRange): PreviewReportEntry[] {
  const open = rows.filter((row) => safeNumber(row.amountDue) > 0 && !['Void', 'Cancelled', 'Rejected'].includes(row.status));
  return [
    { label: 'Not yet due', value: round(open.filter((row) => !row.dueDate || String(row.dueDate) >= range.to).reduce((sum, row) => sum + safeNumber(row.amountDue), 0)) },
    { label: '1–30 days overdue', value: round(open.filter((row) => { const d = daysOverdue(String(row.dueDate ?? ''), range.to); return d >= 1 && d <= 30; }).reduce((sum, row) => sum + safeNumber(row.amountDue), 0)) },
    { label: '31–60 days overdue', value: round(open.filter((row) => { const d = daysOverdue(String(row.dueDate ?? ''), range.to); return d >= 31 && d <= 60; }).reduce((sum, row) => sum + safeNumber(row.amountDue), 0)) },
    { label: '61+ days overdue', value: round(open.filter((row) => daysOverdue(String(row.dueDate ?? ''), range.to) >= 61).reduce((sum, row) => sum + safeNumber(row.amountDue), 0)) },
  ];
}

/**
 * Pure report builder. All values are derived from the records entered for the selected business and branch;
 * there are no period multipliers or baked-in monetary totals.
 */
export function buildPreviewReportSnapshot(
  source: PreviewRecordsByModule,
  report: PreviewReportName,
  period: ReportPeriod,
  currency: string,
  now = new Date(),
  persistenceMode: PreviewReportSnapshot['persistenceMode'] = 'browser-local',
): PreviewReportSnapshot {
  const range = getPreviewDateRange(period, now);
  const records: PreviewRecordsByModule = {};
  for (const [moduleId, rows] of Object.entries(source)) records[moduleId] = recordsInPeriod(moduleId, rows, range);
  const rows = (id: string) => records[id] ?? [];
  const invoices = rows('sales-invoices');
  const invoicesAsOf = recordsAsOf('sales-invoices', source['sales-invoices'] ?? [], range.to).filter(isLiveSalesInvoice);
  const salesReturns = rows('sales-returns');
  const supplierBills = rows('purchase-invoices');
  const supplierBillsAsOf = recordsAsOf('purchase-invoices', source['purchase-invoices'] ?? [], range.to).filter(isLiveSupplierBill);
  const purchaseReturns = rows('purchase-returns');
  const purchaseOrders = rows('purchases');
  const expenses = rows('expenses');
  const payments = rows('payments');
  const received = total(payments.filter((row) => row.direction === 'Money in' && ['Recorded', 'Reconciled', 'Posted'].includes(row.status)), 'amount');
  const paidOut = total(payments.filter((row) => row.direction === 'Money out' && ['Recorded', 'Reconciled', 'Posted'].includes(row.status)), 'amount');
  const grossSales = total(invoices.filter(isLiveSalesInvoice), 'total');
  const customerCredits = total(salesReturns.filter((row) => ['Approved', 'Credit issued', 'Completed', 'Posted'].includes(row.status)), 'creditAmount');
  const netSales = round(grossSales - customerCredits);
  const purchaseValue = total(purchaseOrders.filter((row) => ['Ordered', 'Partially received', 'Received'].includes(row.status)), 'total');
  const billValue = total(supplierBills.filter(isLiveSupplierBill), 'total');
  const payableDue = total(supplierBillsAsOf, 'amountDue');
  const receivableDue = total(invoicesAsOf, 'amountDue');
  const expenseValue = total(expenses.filter((row) => ['Approved', 'Paid'].includes(row.status)), 'total');
  const outputTax = total(invoices, 'taxAmount');
  const outputCreditTax = total(salesReturns.filter((row) => ['Approved', 'Credit issued', 'Completed', 'Posted'].includes(row.status)), 'taxAmount');
  const inputTax = total(supplierBills.filter(isLiveSupplierBill), 'taxAmount');
  const inputDebitTax = total(purchaseReturns.filter((row) => ['Credit received', 'Completed', 'Posted'].includes(row.status)), 'taxAmount');
  const netTaxEstimate = round(outputTax - outputCreditTax - inputTax + inputDebitTax);
  const bankReconciliations = rows('bank-reconciliation');
  const moneyAccounts = rows('money-accounts');
  const cashSessions = rows('cash-sessions');
  const packageRows = rows('packages');
  const deliveries = rows('deliveries');
  const batches = rows('batches');
  const replenishment = rows('replenishment');
  const workOrders = rows('work-orders');
  const jobCards = rows('job-cards');
  const quality = rows('quality');
  const leads = rows('leads');
  const opportunities = rows('opportunities');
  const projects = rows('projects');
  const tasks = rows('tasks');
  const timesheets = rows('timesheets');
  const support = rows('support');
  const leave = rows('leave');
  const attendance = rows('attendance');
  const payroll = rows('payroll');
  const campaigns = rows('campaigns');
  const salesTeams = rows('sales-teams');
  const picklists = rows('picklists');
  const budgets = rows('budgets');
  const integrations = rows('integrations');
  const recurringInvoices = rows('recurring-invoices');
  // Master-data coverage is independent of the selected activity period.
  const contacts = source['contacts'] ?? [];
  const itemBundles = rows('item-bundles');

  const reportBuilders: Record<PreviewReportName, { unit: PreviewReportUnit; entries: PreviewReportEntry[]; note: string }> = {
    'Sales & receipts': { unit: 'currency', entries: [
      { label: 'Invoice totals', value: grossSales }, { label: 'Customer credit estimates', value: customerCredits }, { label: 'Net sales estimate', value: netSales }, { label: 'Recorded money in', value: received },
    ], note: 'Derived from sales invoices and payment records. These figures are not statutory invoices or payment-provider confirmations.' },
    'Sales returns & discounts': { unit: 'currency', entries: [
      { label: 'Sales credit estimates', value: customerCredits }, { label: 'Invoice discount totals', value: total(invoices, 'discountAmount') }, { label: 'Order discount totals', value: total(rows('sales-orders'), 'discountAmount') }, { label: 'Credit estimate awaiting review', value: total(salesReturns.filter((row) => ['Draft', 'Needs inspection', 'Reviewed'].includes(row.status)), 'creditAmount') },
    ], note: 'Return credit and discount estimates use separate return and discount documents. Review the record workflow before posting a real credit note.' },
    'Stock overview': { unit: 'count', entries: [
      { label: 'Lots / serial records', value: batches.length }, { label: 'Units available in lots', value: total(batches, 'availableQuantity') }, { label: 'Quarantined / recalled lots', value: count(batches, (row) => ['Quarantined', 'Recalled'].includes(row.status)) }, { label: 'Expired lots', value: count(batches, (row) => row.status === 'Expired') },
    ], note: 'Batch data is separate from the core inventory ledger. Use the existing Inventory screen for saved core stock movements.' },
    'Purchases & payables': { unit: 'currency', entries: [
      { label: 'Purchase-order estimates', value: purchaseValue }, { label: 'Supplier-bill totals', value: billValue }, { label: 'Outstanding supplier bills', value: payableDue }, { label: 'Recorded money out', value: paidOut },
    ], note: 'Purchase orders, physical receipts, supplier bills and payments are distinct documents. Values here are calculated estimates, not a posted payable ledger.' },
    'Receivables ageing': { unit: 'currency', entries: ageing(invoicesAsOf, range), note: 'Ageing uses invoice due dates and entered amount-due fields. It is not an account statement from the connected backend.' },
    'Payables ageing': { unit: 'currency', entries: ageing(supplierBillsAsOf, range), note: 'Ageing uses supplier-bill due dates and entered amount-due fields. Reconcile with posted supplier balances before relying on this figure.' },
    'Expenses': { unit: 'currency', entries: sumBy(expenses.filter((row) => ['Approved', 'Paid'].includes(row.status)), 'category', 'total').slice(0, 6), note: 'Grouped from saved expense records by category. No general-ledger posting is performed.' },
    'Profit & loss': { unit: 'currency', entries: [
      { label: 'Net sales estimate', value: netSales }, { label: 'Supplier bill estimate', value: -billValue }, { label: 'Operating expense estimate', value: -expenseValue }, { label: 'Simple operating remainder', value: round(netSales - billValue - expenseValue) },
    ], note: 'A simplified operational estimate, not a valid profit-and-loss statement: purchases are not cost of goods sold, and the figures are not built from posted ledger entries.' },
    'Balance sheet': { unit: 'currency', entries: [
      { label: 'Cash / wallet current balances', value: total(moneyAccounts, 'currentBalance') }, { label: 'Fixed-asset carrying estimates', value: total(rows('assets'), 'carryingValue') }, { label: 'Receivables estimate', value: receivableDue }, { label: 'Payables estimate', value: payableDue },
    ], note: 'This is an unreconciled summary of selected operational balances, not a balanced statutory balance sheet. The real report must come from the actual ledger integration.' },
    'Tax summary': { unit: 'currency', entries: [
      { label: 'Output tax estimate', value: outputTax }, { label: 'Sales-credit tax estimate', value: -outputCreditTax }, { label: 'Input tax estimate', value: -inputTax }, { label: 'Supplier-return tax estimate', value: inputDebitTax }, { label: 'Net tax estimate', value: netTaxEstimate },
    ], note: 'Tax amounts are user-entered / calculated estimates. Rates, eligibility, exemptions and EFRIS submission must be confirmed through the proper Uganda tax workflow.' },
    'Attendance & payroll': { unit: 'count', entries: [
      { label: 'Attendance entries', value: attendance.length }, { label: 'Late / absent records', value: count(attendance, (row) => ['Late', 'Absent'].includes(row.status)) }, { label: 'Payroll runs for review', value: count(payroll, (row) => ['Draft', 'Review', 'Approved', 'Payment prepared'].includes(row.status)) }, { label: 'Leave requests awaiting decision', value: count(leave, (row) => row.status === 'Requested') },
    ], note: 'Attendance and leave are based on records entered in this workspace. Payroll is only gross pay minus entered deductions; it does not calculate statutory taxes or submit payroll.' },
    'Deliveries': { unit: 'count', entries: [
      { label: 'Delivery records', value: deliveries.length }, { label: 'Packages awaiting shipment', value: count(packageRows, (row) => row.status === 'Not shipped') }, { label: 'In transit / shipped', value: count([...packageRows, ...deliveries], (row) => ['Shipped', 'In transit', 'Dispatched'].includes(row.status)) }, { label: 'Delivery exceptions', value: count([...packageRows, ...deliveries], (row) => ['Exception', 'Delivery failed'].includes(row.status)) },
    ], note: 'Packages, delivery records and carrier tracking are separate records. No carrier API is connected.' },
    'Bank reconciliation': { unit: 'currency', entries: [
      { label: 'Statement closing balance', value: total(bankReconciliations, 'statementBalance') }, { label: 'Book closing balance', value: total(bankReconciliations, 'bookBalance') }, { label: 'Unexplained difference', value: total(bankReconciliations, 'difference') }, { label: 'Opening statement balance', value: total(bankReconciliations, 'openingBalance') },
    ], note: 'Statement figures are manually entered in records. This view is not connected to a bank feed or live account balances.' },
    'Cash & accounts': { unit: 'currency', entries: [
      { label: 'Opening money-account balances', value: total(moneyAccounts, 'openingBalance') }, { label: 'Current money-account balances', value: total(moneyAccounts, 'currentBalance') }, { label: 'POS expected cash', value: total(cashSessions, 'expectedCash') }, { label: 'POS counted cash', value: total(cashSessions, 'countedCash') },
    ], note: 'Money-account balances and POS session figures are independent records; they are not reconciled automatically.' },
    'Procurement pipeline': { unit: 'count', entries: [
      { label: 'Purchase requests', value: rows('purchase-requests').length }, { label: 'Supplier RFQs', value: rows('rfqs').length }, { label: 'Supplier quotes awaiting review', value: count(rows('supplier-quotes'), (row) => ['Received', 'Under review'].includes(row.status)) }, { label: 'Open purchase orders', value: count(purchaseOrders, (row) => !['Cancelled', 'Received'].includes(row.status)) },
    ], note: 'Counts show entered documents, not live commitments. An approved request can be used to prepare a separate RFQ or purchase-order draft.' },
    'CRM & pipeline': { unit: 'currency', entries: [
      { label: 'Lead estimated value', value: total(leads, 'estimatedValue') }, { label: 'Lead weighted estimate', value: total(leads, 'weightedValue') }, { label: 'Opportunity weighted estimate', value: total(opportunities, 'weightedValue') }, { label: 'Open sales-order estimate', value: total(rows('sales-orders').filter((row) => !['Cancelled', 'Invoiced'].includes(row.status)), 'total') },
    ], note: 'Prospect and opportunity values are pipeline estimates, not booked revenue. Weighted values depend on entered probability.' },
    'Replenishment & expiry': { unit: 'count', entries: [
      { label: 'Replenishment plans needing review', value: count(replenishment, (row) => safeNumber(row.recommendedQuantity) > 0 && ['Review needed', 'Reviewed'].includes(row.status)) }, { label: 'Quarantined lots', value: count(batches, (row) => row.status === 'Quarantined') }, { label: 'Expired / recalled lots', value: count(batches, (row) => ['Expired', 'Recalled'].includes(row.status)) }, { label: 'Supplier returns in progress', value: count(purchaseReturns, (row) => !['Rejected', 'Credit received'].includes(row.status)) },
    ], note: 'Reorder suggestions are formula estimates from average demand, lead time and safety stock. They do not automatically reserve or purchase inventory.' },
    'Production & quality': { unit: 'count', entries: [
      { label: 'Work orders in progress', value: count(workOrders, (row) => ['Planned', 'In progress', 'Quality check'].includes(row.status)) }, { label: 'Job cards open', value: count(jobCards, (row) => !['Completed'].includes(row.status)) }, { label: 'Quality inspections', value: quality.length }, { label: 'Inspections needing rework', value: count(quality, (row) => ['Needs rework', 'Rejected'].includes(row.status)) },
    ], note: 'Work orders and job cards do not issue components or post finished output. Inventory movements must be added to the integrated production workflow later.' },
    'POS cash-up': { unit: 'currency', entries: [
      { label: 'Expected cash', value: total(cashSessions, 'expectedCash') }, { label: 'Counted cash', value: total(cashSessions, 'countedCash') }, { label: 'Net over / short', value: total(cashSessions, 'variance') }, { label: 'Cash dropped to safe', value: total(cashSessions, 'cashDrops') },
    ], note: 'Cash-up totals come from POS session entries, not the real checkout sales ledger. Integrate the session closing workflow before live use.' },
    'Projects & timesheets': { unit: 'hours', entries: [
      { label: 'Timesheet hours', value: total(timesheets, 'hours') }, { label: 'Billable hours', value: total(timesheets, 'billableHours') }, { label: 'Non-billable hours', value: total(timesheets, 'nonBillableHours') }, { label: 'Task estimated hours', value: total(tasks, 'estimatedHours') },
    ], note: 'Hours support project review; billing, project cost posting and payroll are not linked in this workspace.' },
    'Project cost & budget': { unit: 'currency', entries: [
      { label: 'Project budget estimates', value: total(projects, 'budget') },
      { label: 'Actual project cost estimates', value: total(projects, 'actualCost') },
      { label: 'Budget variance estimates', value: total(projects, 'budgetVariance') },
      { label: 'Billable time estimate', value: total(timesheets, 'billableAmount') },
    ], note: 'Project budgets and actual costs are user-entered entered values. The report is not connected to posted general-ledger entries or customer invoicing.' },
    'Support queue': { unit: 'count', entries: [
      { label: 'Open support cases', value: count(support, (row) => !['Resolved', 'Closed'].includes(row.status)) }, { label: 'Awaiting customer', value: count(support, (row) => row.status === 'Waiting on customer') }, { label: 'Resolved cases', value: count(support, (row) => row.status === 'Resolved') }, { label: 'Closed cases', value: count(support, (row) => row.status === 'Closed') },
    ], note: 'This is a local support queue -up, not an email or customer portal integration.' },
    'Packages & fulfilment': { unit: 'count', entries: [
      { label: 'Packages created', value: packageRows.length }, { label: 'Not shipped', value: count(packageRows, (row) => row.status === 'Not shipped') }, { label: 'Shipped', value: count(packageRows, (row) => row.status === 'Shipped') }, { label: 'Delivered', value: count(packageRows, (row) => row.status === 'Delivered') },
    ], note: 'Packing slips and delivery tracking are separate workflow steps. Carrier events are not received automatically.' },
    'Leave & HR': { unit: 'count', entries: [
      { label: 'Leave requested', value: count(leave, (row) => row.status === 'Requested') }, { label: 'Leave approved', value: count(leave, (row) => row.status === 'Approved') }, { label: 'Attendance exceptions', value: count(attendance, (row) => ['Late', 'Absent'].includes(row.status)) }, { label: 'Active employees in directory', value: count(rows('employees'), (row) => row.status === 'Active') },
    ], note: 'Calendar-day leave estimates and directory statuses do not change employee records or calculate statutory pay.' },
    'Sales campaigns & representatives': { unit: 'currency', entries: [
      { label: 'Campaign budget', value: total(campaigns, 'budget') }, { label: 'Campaign spend', value: total(campaigns, 'actualSpend') }, { label: 'Sales targets', value: total(salesTeams, 'salesTarget') }, { label: 'Sales achieved', value: total(salesTeams, 'salesAchieved') }, { label: 'Indicative commissions', value: total(salesTeams, 'indicativeCommission') },
    ], note: 'Spend, leads and sales achievement are entered records. They are not reconciled to an advertising platform or the posted sales ledger.' },
    'Budgets vs actual': { unit: 'currency', entries: [
      { label: 'Approved budget amount', value: total(budgets.filter((row) => ['Approved', 'Closed'].includes(row.status)), 'budgetAmount') }, { label: 'Actual spend entered', value: total(budgets, 'actualAmount') }, { label: 'Committed spend entered', value: total(budgets, 'committedAmount') }, { label: 'Forecast entered', value: total(budgets, 'forecastAmount') }, { label: 'Remaining after actual and committed', value: total(budgets, 'availableBudget') },
    ], note: 'Budget remaining is calculated per budget line. It is a management estimate, not an accounting commitment or ledger balance.' },
    'Picklist fulfilment': { unit: 'count', entries: [
      { label: 'Picklists', value: picklists.length }, { label: 'Units requested', value: total(picklists, 'unitsToPick') }, { label: 'Units picked', value: total(picklists, 'unitsPicked') }, { label: 'Units outstanding', value: total(picklists, 'unitsOutstanding') }, { label: 'Short / incomplete picklists', value: count(picklists, (row) => ['Short pick', 'Partially picked', 'Picking'].includes(row.status)) },
    ], note: 'Picking totals are saved records. They do not reserve quantities or decrement physical inventory until the real warehouse workflow is integrated.' },
    'Integration health': { unit: 'count', entries: [
      { label: 'Integration records configured', value: integrations.length }, { label: 'Passing test records', value: count(integrations, (row) => row.status === 'Test passed') }, { label: 'Not connected', value: count(integrations, (row) => ['Not connected', 'Configuration needed'].includes(row.status)) }, { label: 'Integration errors', value: count(integrations, (row) => ['Error', 'Failed', 'Needs attention'].includes(row.status)) }, { label: 'Records processed', value: total(integrations, 'recordsProcessed') },
    ], note: 'The integration register documents future connector readiness only. No credentials, test requests or external API calls are made by this frontend.' },
    'Recurring billing forecast': { unit: 'currency', entries: [
      { label: 'Active schedule run-rate estimate', value: total(recurringInvoices.filter((row) => row.status === 'Active'), 'total') }, { label: 'Run-rate awaiting review', value: total(recurringInvoices.filter((row) => ['Draft', 'Review'].includes(row.status)), 'total') }, { label: 'Paused schedule run-rate', value: total(recurringInvoices.filter((row) => row.status === 'Paused'), 'total') }, { label: 'Ended schedule reference value', value: total(recurringInvoices.filter((row) => row.status === 'Ended'), 'total') },
    ], note: 'Recurring amounts are run-rate estimates only. Choose a Next period to review upcoming schedules. No background scheduler executes and no invoice is generated automatically.' },
    'Master-data coverage': { unit: 'count', entries: [
      { label: 'Customer master records', value: rows('customers').length }, { label: 'Suppliers with contact number', value: count(rows('suppliers'), (row) => Boolean(String(row.phone ?? '').trim())) }, { label: 'CRM contacts on file', value: contacts.length }, { label: 'Leads with assigned owner', value: count(rows('leads'), (row) => Boolean(String(row.owner ?? '').trim())) }, { label: 'Bundle / recipe definitions', value: itemBundles.length + count(rows('boms')) }, { label: 'Integration records with missing setup', value: count(integrations, (row) => ['Not connected', 'Configuration needed', 'Missing mapping'].includes(row.status)) },
    ], note: 'Coverage checks apply only to saved records. The core product catalogue is managed by a separate repository and is not counted by this register service.' },
  };

  const selected = reportBuilders[report];
  const attentionItems = count([...invoices, ...supplierBills, ...expenses, ...support, ...leave, ...cashSessions, ...integrations, ...picklists, ...budgets, ...recurringInvoices], (row) => ['Draft', 'Pending', 'Overdue', 'Needs review', 'Variance review', 'Requested', 'Error', 'Not connected', 'Configuration needed', 'Short pick', 'Exception', 'Review'].includes(row.status));
  const metrics: PreviewReportMetric[] = [
    { label: 'Net sales estimate', value: netSales, unit: 'currency' },
    { label: 'Supplier bill balance', value: payableDue, unit: 'currency' },
    { label: 'Expenses estimate', value: expenseValue, unit: 'currency' },
    { label: 'Items requiring review', value: attentionItems, unit: 'count' },
  ];
  return {
    report,
    period,
    currency,
    unit: selected.unit,
    entries: selected.entries,
    metrics,
    filteredRecordCounts: Object.fromEntries(Object.entries(records).map(([id, items]) => [id, items.length])),
    generatedAt: now.toISOString(),
    persistenceMode,
    sourceLabel: persistenceMode === 'browser-local' ? 'Device records' : 'Temporary session records',
    interpretationNote: selected.note,
  };
}

export async function loadPreviewReportSnapshot(
  service: ModuleRecordService,
  scope: ModuleRecordScope,
  report: PreviewReportName,
  period: ReportPeriod,
  currency: string,
  now = new Date(),
): Promise<PreviewReportSnapshot> {
  const loaded = await Promise.all(MODULE_CATALOG.map(async (module) => [module.id, await service.list(scope, module.id, module.initial)] as const));
  const source = Object.fromEntries(loaded) as PreviewRecordsByModule;
  return buildPreviewReportSnapshot(source, report, period, currency, now, service.getPersistenceMode());
}

// Neutral aliases used by the application-facing repository boundary.
export const buildModuleReportSnapshot = buildPreviewReportSnapshot;
export const loadModuleReportSnapshot = loadPreviewReportSnapshot;
export type ModuleReportName = PreviewReportName;
export type ModuleReportUnit = PreviewReportUnit;
export type ModuleReportSnapshot = PreviewReportSnapshot;
