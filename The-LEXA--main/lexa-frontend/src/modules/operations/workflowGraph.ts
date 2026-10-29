import type { PreviewRecord } from './moduleCatalog';
import { MODULE_CATALOG } from './moduleCatalog';

export interface WorkflowAction {
  targetId: string;
  label: string;
  description: string;
}

export interface CoreScreenShortcut {
  path: string;
  label: string;
  description: string;
}

export interface WorkflowEdge extends WorkflowAction {
  sourceId: string;
  /** When omitted, a draft hand-off may be prepared from any source status. */
  statuses?: readonly string[];
  /** Avoid offering a receipt/payment action when there is no outstanding amount. */
  positiveValueField?: string;
}

const edge = (
  sourceId: string,
  targetId: string,
  label: string,
  description: string,
  statuses?: readonly string[],
  positiveValueField?: string,
): WorkflowEdge => ({
  sourceId,
  targetId,
  label,
  description,
  ...(statuses !== undefined ? { statuses } : {}),
  ...(positiveValueField !== undefined ? { positiveValueField } : {}),
});

/**
 * Frontend preview workflow map. Every hand-off creates a separate preview draft with
 * source module/record metadata; it does not post to inventory, the GL, a payment rail,
 * tax authority, payroll provider, email service or the backend.
 */
const CORE_WORKFLOW_EDGES: WorkflowEdge[] = [
  edge('contacts', 'leads', 'Create lead draft', 'Carry contact details into prospect qualification.', ['Active']),
  edge('contacts', 'customers', 'Prepare customer master draft', 'Prepare a customer record from this contact; review duplicates before saving.', ['Active']),
  edge('leads', 'opportunities', 'Create opportunity draft', 'Carry the qualified prospect into the deal pipeline.', ['Contacted', 'Qualified']),
  edge('campaigns', 'leads', 'Capture campaign lead', 'Carry the campaign source into a new prospect record.', ['Planned', 'Active']),
  edge('campaigns', 'opportunities', 'Create campaign opportunity', 'Prepare a deal record attributed to this campaign.', ['Active']),
  edge('sales-teams', 'opportunities', 'Prepare owned opportunity', 'Use the salesperson/territory as context for a deal draft.', ['Active']),
  edge('sales-teams', 'campaigns', 'Prepare campaign draft', 'Carry the owner/territory context into campaign planning.', ['Active']),
  edge('customers', 'quotations', 'Create quotation draft', 'Start a new offer using this customer.', ['Active']),
  edge('customers', 'sales-orders', 'Create sales-order draft', 'Prepare an order for an existing customer.', ['Active']),
  edge('customers', 'support', 'Create support case', 'Open a customer-support record with the customer context.', ['Active']),
  edge('customers', 'contacts', 'Add customer contact', 'Prepare another contact/address record for this customer.', ['Active']),
  edge('opportunities', 'quotations', 'Prepare deal quotation', 'Carry the prospect and estimated value into a quote draft.', ['Qualified', 'Proposal', 'Negotiation', 'Won']),
  edge('opportunities', 'sales-orders', 'Create won-deal order', 'Prepare an unposted order for a won opportunity.', ['Won']),
  edge('quotations', 'sales-orders', 'Convert accepted quote to order', 'Create a separate order draft while retaining the accepted quotation.', ['Accepted']),
  edge('price-lists', 'quotations', 'Prepare priced quotation', 'Carry the price-list reference into a quotation draft; verify actual line prices.', ['Active']),
  edge('price-lists', 'sales-orders', 'Prepare priced order', 'Carry the price-list reference into an order draft; prices still require review.', ['Active']),
  edge('sales-orders', 'picklists', 'Create warehouse picklist', 'Prepare picking work before packing and dispatch.', ['Confirmed', 'Partially fulfilled', 'Fulfilled']),
  edge('sales-orders', 'packages', 'Create package draft', 'Prepare a packing slip separately from stock fulfilment.', ['Confirmed', 'Partially fulfilled', 'Fulfilled']),
  edge('sales-orders', 'deliveries', 'Create delivery draft', 'Prepare a distinct fulfilment/delivery record.', ['Confirmed', 'Partially fulfilled', 'Fulfilled']),
  edge('sales-orders', 'sales-invoices', 'Prepare customer invoice', 'Create a separate invoice draft referencing the sales order.', ['Confirmed', 'Partially fulfilled', 'Fulfilled']),
  edge('picklists', 'packages', 'Create package from picklist', 'Carry the picked quantity and order reference into a package draft.', ['Picked', 'Partially picked']),
  edge('packages', 'deliveries', 'Create delivery tracking draft', 'Carry courier, tracking and sales-order context into delivery tracking.', ['Shipped', 'Delivered', 'Exception']),
  edge('deliveries', 'sales-invoices', 'Prepare invoice after delivery', 'Prepare an invoice draft from a delivery; confirm quantities and price before issue.', ['Delivered']),
  edge('sales-invoices', 'payments', 'Prepare customer receipt', 'Prepare a separate receipt draft for the open invoice balance.', ['Issued', 'Partially paid', 'Overdue'], 'amountDue'),
  edge('sales-invoices', 'sales-returns', 'Create customer credit-note draft', 'Prepare a separately reviewed return/credit; no stock or invoice posting occurs.', ['Issued', 'Partially paid', 'Paid', 'Overdue']),
  edge('sales-invoices', 'tax-documents', 'Prepare tax-document draft', 'Carry invoice values into a tax-readiness draft; no URA/EFRIS request is sent.', ['Issued', 'Partially paid', 'Paid', 'Overdue']),
  edge('sales-returns', 'quality', 'Prepare returned-goods inspection', 'Inspect returned items before making any live stock disposition.', ['Needs inspection', 'Reviewed', 'Approved']),
  edge('recurring-invoices', 'sales-invoices', 'Prepare invoice occurrence', 'Create a one-time invoice draft; this does not schedule or run recurring billing.', ['Active']),
  edge('suppliers', 'purchases', 'Create purchase-order draft', 'Start a supplier commitment draft.', ['Active']),
  edge('suppliers', 'rfqs', 'Invite supplier to RFQ', 'Prepare an RFQ carrying the selected supplier context.', ['Active']),
  edge('suppliers', 'supplier-quotes', 'Capture supplier quotation', 'Record a supplier offer for comparison.', ['Active']),
  edge('purchase-requests', 'rfqs', 'Create RFQ from approved request', 'Carry need, quantity and justification into the RFQ draft.', ['Approved']),
  edge('rfqs', 'supplier-quotes', 'Capture supplier response', 'Create a supplier response linked to this RFQ; separate suppliers remain separate records.', ['Sent', 'Responses received', 'Evaluated']),
  edge('supplier-quotes', 'purchases', 'Create purchase order from quote', 'Carry the selected supplier quote into a separate order draft.', ['Accepted']),
  edge('purchases', 'receiving', 'Create goods-receipt draft', 'Record accepted and rejected quantities for this purchase order.', ['Ordered', 'Partially received', 'Received']),
  edge('purchases', 'purchase-invoices', 'Create supplier-bill draft', 'Record the supplier invoice separately from goods receiving.', ['Ordered', 'Partially received', 'Received']),
  edge('receiving', 'quality', 'Create goods inspection', 'Review accepted/rejected units; this does not change the stock ledger.', ['Received', 'Needs inspection']),
  edge('receiving', 'batches', 'Prepare batch/serial record', 'Carry receipt and item references into tracking setup; not a live stock allocation.', ['Received', 'Needs inspection']),
  edge('receiving', 'purchase-invoices', 'Prepare invoice from receipt', 'Prepare a supplier invoice draft from the goods receipt; reconcile against the bill.', ['Received']),
  edge('purchase-invoices', 'payments', 'Prepare supplier payment', 'Prepare a separate payment draft for an outstanding supplier bill.', ['Received', 'Approved', 'Partially paid', 'Overdue', 'Disputed'], 'amountDue'),
  edge('purchase-invoices', 'purchase-returns', 'Create supplier debit-note draft', 'Prepare a supplier return/debit-note draft; no payable or stock posting occurs.', ['Received', 'Approved', 'Partially paid', 'Paid', 'Overdue', 'Disputed']),
  edge('purchase-invoices', 'tax-documents', 'Prepare purchase tax document', 'Carry supplier bill details into a tax-readiness draft.', ['Received', 'Approved', 'Partially paid', 'Paid', 'Overdue']),
  edge('purchase-returns', 'quality', 'Inspect supplier-return goods', 'Prepare a quality review before goods disposition.', ['Needs inspection', 'Approved', 'Dispatched']),
  edge('expenses', 'payments', 'Prepare expense payment', 'Prepare a separate money-out draft for the approved expense.', ['Approved'], 'total'),
  edge('expenses', 'projects', 'Allocate expense to project', 'Prepare a project-cost record referencing the expense; actuals are not posted.', ['Approved', 'Paid']),
  edge('money-accounts', 'bank-reconciliation', 'Prepare reconciliation', 'Start a statement reconciliation for this money account; no bank feed is connected.', ['Active', 'Reconciliation needed']),
  edge('money-accounts', 'payments', 'Prepare account payment', 'Prepare a payment draft with the selected account as context.', ['Active']),
  edge('payments', 'bank-reconciliation', 'Prepare reconciliation draft', 'Compare a recorded payment against a separately entered statement.', ['Recorded', 'Reconciled']),
  edge('cash-sessions', 'bank-reconciliation', 'Reconcile cash session', 'Carry the cash-up figures into a separate reconciliation draft.', ['Reviewed', 'Closed', 'Variance review']),
  edge('bank-reconciliation', 'money-accounts', 'Review money-account mapping', 'Prepare a follow-up account review from a reconciliation exception.', ['Needs review', 'Reopened']),
  edge('chart-of-accounts', 'bank-reconciliation', 'Prepare account reconciliation', 'Carry the selected account into a reconciliation draft; confirm account and balances.', ['Active']),
  edge('tax-codes', 'tax-documents', 'Prepare tax document', 'Carry the selected tax code into a tax-readiness record.', ['Active']),
  edge('tax-codes', 'sales-invoices', 'Prepare invoice with tax-code context', 'Prepare an invoice draft; the tax code must be reviewed before issue.', ['Active']),
  edge('assets', 'projects', 'Track asset under project', 'Prepare a project-cost reference for asset deployment; no depreciation posting occurs.', ['Active', 'Under maintenance']),
  edge('warehouses', 'stock-transfers', 'Prepare stock transfer', 'Carry source warehouse context into a transfer draft.', ['Active']),
  edge('warehouses', 'stock-counts', 'Prepare stock count', 'Prepare a count record for this warehouse; no inventory quantity is adjusted.', ['Active']),
  edge('warehouses', 'replenishment', 'Plan warehouse replenishment', 'Prepare a reorder review for the selected warehouse.', ['Active']),
  edge('stock-transfers', 'stock-counts', 'Verify transfer quantities', 'Prepare a stock-count review after transfer receipt; no core ledger changes.', ['Received']),
  edge('stock-counts', 'replenishment', 'Review variance and reorder', 'Prepare reorder planning after a count variance is reviewed.', ['Needs review', 'Approved', 'Posted']),
  edge('batches', 'quality', 'Inspect batch/serial', 'Prepare a quality inspection using the selected batch/serial reference.', ['Quarantined', 'Expired', 'Recalled']),
  edge('batches', 'receiving', 'Review batch receipt', 'Prepare a follow-up receipt review for this batch/serial reference.', ['Quarantined', 'In stock']),
  edge('replenishment', 'purchases', 'Create replenishment purchase', 'Carry the suggested reorder quantity into a separate PO draft.', ['Reviewed', 'Draft PO created', 'Ordered']),
  edge('boms', 'work-orders', 'Create production work order', 'Carry BOM output and material estimate into a production draft.', ['Active']),
  edge('boms', 'item-bundles', 'Prepare bundle from BOM', 'Prepare an item-bundle record using the bill-of-materials reference.', ['Active']),
  edge('item-bundles', 'work-orders', 'Prepare assembly work order', 'Use the bundle definition as a production draft reference.', ['Active']),
  edge('work-orders', 'job-cards', 'Create production job card', 'Assign an operation and track labour against the production order.', ['Planned', 'In progress']),
  edge('work-orders', 'quality', 'Create production inspection', 'Prepare a quality inspection for completed production quantity.', ['Quality check', 'Completed']),
  edge('work-orders', 'batches', 'Prepare finished batch record', 'Prepare batch/serial traceability metadata for production output.', ['Quality check', 'Completed']),
  edge('work-orders', 'timesheets', 'Prepare production time entry', 'Carry production reference into a time-entry draft.', ['In progress', 'Completed']),
  edge('work-orders', 'tasks', 'Create production task', 'Prepare a task linked to the production order.', ['Planned', 'In progress', 'On hold']),
  edge('job-cards', 'timesheets', 'Create job time entry', 'Carry operation and operator context into a timesheet draft.', ['Ready', 'In progress', 'Completed']),
  edge('quality', 'work-orders', 'Prepare rework order', 'Create a separate rework draft for a rejected lot; confirm scope manually.', ['Rejected', 'Needs rework']),
  edge('projects', 'tasks', 'Create project task', 'Create a separately tracked task for the project.', ['Active', 'On hold']),
  edge('projects', 'timesheets', 'Create project time entry', 'Record project labour for review and costing.', ['Active']),
  edge('projects', 'expenses', 'Prepare project expense', 'Prepare an expense estimate associated with the project.', ['Active']),
  edge('projects', 'budgets', 'Prepare project budget', 'Prepare a budget/forecast entry for the project.', ['Draft', 'Active']),
  edge('tasks', 'timesheets', 'Record time against task', 'Prepare a timesheet referencing this task.', ['In progress', 'Done']),
  edge('tasks', 'support', 'Raise support follow-up', 'Prepare a support case if the task is blocked by a customer issue.', ['Blocked', 'Cancelled']),
  edge('employees', 'attendance', 'Prepare attendance entry', 'Carry employee context into a daily attendance record.', ['Active', 'On leave']),
  edge('employees', 'leave', 'Prepare leave request', 'Prepare a leave request for the employee.', ['Active']),
  edge('employees', 'payroll', 'Include employee in payroll review', 'Prepare a payroll review record; statutory payroll calculations are not performed.', ['Active', 'On leave']),
  edge('employees', 'timesheets', 'Prepare employee time entry', 'Carry employee identity into a timesheet draft.', ['Active']),
  edge('attendance', 'payroll', 'Prepare payroll attendance review', 'Carry attendance totals as review context; do not treat as statutory payroll.', ['Reviewed', 'Approved']),
  edge('leave', 'payroll', 'Review leave impact in payroll', 'Carry approved leave context into payroll review.', ['Approved', 'Taken']),
  edge('payroll', 'payments', 'Prepare payroll payment', 'Prepare a separate payment preview; no bank/mobile-money transfer occurs.', ['Approved', 'Payment prepared'], 'netPay'),
  edge('cost-centers', 'budgets', 'Prepare cost-centre budget', 'Carry the cost-centre reference into a budget draft.', ['Active']),
  edge('cost-centers', 'projects', 'Set project cost centre', 'Prepare a project record using the cost-centre reference.', ['Active']),
  edge('budgets', 'cost-centers', 'Review cost-centre allocation', 'Prepare a cost-centre follow-up for budget review.', ['Review', 'Approved']),
  edge('support', 'tasks', 'Create support follow-up task', 'Create a task linked to the support issue.', ['New', 'Triaged', 'In progress', 'Waiting on customer', 'Reopened']),
  edge('support', 'contacts', 'Add case contact', 'Prepare a contact/address record from the case contact details.', ['New', 'Triaged', 'In progress', 'Waiting on customer', 'Reopened']),
  edge('team', 'employees', 'Prepare employee directory record', 'Carry member identity into a separate HR directory draft; this does not create a user account.', ['Active', 'Invited']),
  edge('integrations', 'support', 'Create integration follow-up case', 'Record an investigation task for a failed or unconfigured connector.', ['Error', 'Configuration needed', 'Not connected', 'Paused']),
];

// Every writable module gets a source-to-audit preview action, so no module is a dead end.
const AUDIT_NOTE_EDGES: WorkflowEdge[] = MODULE_CATALOG
  .filter((module) => module.id !== 'audit' && !module.readOnly)
  .map((module) => edge(
    module.id,
    'audit',
    'Create review note',
    'Append a local preview review note with this record reference; not a trusted security audit event.',
  ));

export const WORKFLOW_EDGES: readonly WorkflowEdge[] = [...CORE_WORKFLOW_EDGES, ...AUDIT_NOTE_EDGES];

/** These conversions are one-to-one. Re-running the same source action must not create duplicate target drafts. */
const ONE_TO_ONE_HANDOFFS = new Set([
  'leads->opportunities',
  'opportunities->sales-orders',
  'quotations->sales-orders',
  'purchase-requests->rfqs',
  'supplier-quotes->purchases',
]);

export function isDuplicateSensitiveHandoff(sourceId: string, targetId: string): boolean {
  return ONE_TO_ONE_HANDOFFS.has(`${sourceId}->${targetId}`);
}

const moduleIds = new Set(MODULE_CATALOG.map((module) => module.id));

export function getRelatedActions(moduleId: string, record: PreviewRecord): WorkflowAction[] {
  return WORKFLOW_EDGES
    .filter((item) => item.sourceId === moduleId && moduleIds.has(item.targetId))
    .filter((item) => !item.statuses || item.statuses.includes(record.status))
    .filter((item) => !item.positiveValueField || Number(record[item.positiveValueField] ?? 0) > 0)
    .map(({ targetId, label, description }) => ({ targetId, label, description }));
}


/** Navigation-only shortcuts into the existing core pages; these do not convert preview records. */
const CORE_SCREEN_SHORTCUTS: Record<string, CoreScreenShortcut[]> = {
  customers: [{ path: '/sales', label: 'Open existing sales', description: 'Open the existing core sales and receipt history; preview drafts are not transferred.' }],
  contacts: [{ path: '/sales', label: 'Open existing sales', description: 'Open the existing core sales and receipt workflow.' }],
  suppliers: [{ path: '/inventory', label: 'Open existing inventory', description: 'Open the core stock and movement workflow; supplier preview rows are separate.' }],
  leads: [{ path: '/sales', label: 'Open existing sales', description: 'Open the core sales workflow; the prospect draft is not converted.' }],
  opportunities: [{ path: '/sales', label: 'Open existing sales', description: 'Open the core sales workflow; opportunity records remain previews.' }],
  quotations: [{ path: '/sales', label: 'Open existing sales', description: 'Open the existing sales history; quote preview records are not posted.' }],
  'sales-orders': [{ path: '/checkout', label: 'Open existing checkout', description: 'Open the existing core checkout; preview orders do not enter the cart.' }, { path: '/sales', label: 'Open sales history', description: 'Review existing core receipts and returns.' }],
  'sales-invoices': [{ path: '/sales', label: 'Open existing sales', description: 'Review existing core receipts and returns; preview invoices remain separate.' }],
  'sales-returns': [{ path: '/sales', label: 'Open existing returns', description: 'Open core sales/returns; this preview credit-note does not reverse a live sale.' }],
  purchases: [{ path: '/inventory', label: 'Open existing inventory', description: 'Review core stock balances and movements; purchase previews do not receive stock.' }],
  receiving: [{ path: '/inventory', label: 'Open existing inventory', description: 'Review existing stock movements; preview receiving does not change on-hand stock.' }],
  'purchase-invoices': [{ path: '/modules/reports', label: 'Open report centre', description: 'Review preview reporting; supplier invoices are not posted to a payable ledger.' }],
  'purchase-returns': [{ path: '/inventory', label: 'Open existing inventory', description: 'Review core stock movements; preview supplier returns do not reverse stock.' }],
  expenses: [{ path: '/modules/reports', label: 'Open report centre', description: 'Review available preview reports; expense previews are not ledger entries.' }],
  payments: [{ path: '/sales', label: 'Open existing sales', description: 'Open existing receipts and returns; preview payment drafts do not send or reconcile money.' }],
  'money-accounts': [{ path: '/modules/reports', label: 'Open report centre', description: 'Review available preview reporting; no bank feed is connected.' }],
  'cash-sessions': [{ path: '/checkout', label: 'Open existing checkout', description: 'Open the existing core checkout/POS workflow; preview cash sessions do not close a live till.' }],
  'bank-reconciliation': [{ path: '/modules/reports', label: 'Open report centre', description: 'Review available reporting; no bank statement feed or live ledger is connected.' }],
  products: [{ path: '/products', label: 'Open product catalogue', description: 'Open existing core products. Changes here use the core product repository, not the preview catalogue.' }],
  'price-lists': [{ path: '/products', label: 'Open product catalogue', description: 'Review product master prices; preview price lists do not change core selling prices.' }],
  warehouses: [{ path: '/inventory', label: 'Open existing inventory', description: 'Open the core movement ledger; warehouse preview setup does not create live locations.' }],
  'stock-counts': [{ path: '/inventory', label: 'Open inventory ledger', description: 'Open the core inventory ledger; preview counts do not adjust stock.' }],
  'stock-transfers': [{ path: '/inventory', label: 'Open inventory ledger', description: 'Open the core stock ledger; preview transfers do not move inventory.' }],
  'batches': [{ path: '/inventory', label: 'Open inventory ledger', description: 'Open core stock movements; preview batch/serial rows do not allocate real stock.' }],
  replenishment: [{ path: '/inventory', label: 'Open existing inventory', description: 'Review core stock-on-hand before acting; suggestions here are preview-only.' }],
  'picklists': [{ path: '/inventory', label: 'Open inventory ledger', description: 'Review core stock balances before fulfilment; this preview picklist does not reserve stock.' }],
  packages: [{ path: '/sales', label: 'Open existing sales', description: 'Open core sales/returns; package previews do not create a delivery event.' }],
  deliveries: [{ path: '/sales', label: 'Open existing sales', description: 'Open core sales/returns; delivery tracking remains a preview record.' }],
  boms: [{ path: '/products', label: 'Open product catalogue', description: 'Review core product definitions; BOM components here are not deducted from stock.' }],
  'item-bundles': [{ path: '/products', label: 'Open product catalogue', description: 'Review core products; bundle components do not deduct inventory in preview mode.' }],
  'work-orders': [{ path: '/inventory', label: 'Open inventory ledger', description: 'Review core stock movements; preview work orders do not post material consumption.' }],
  quality: [{ path: '/inventory', label: 'Open inventory ledger', description: 'Review stock state separately; quality preview decisions do not release/quarantine real stock.' }],
  assets: [{ path: '/modules/reports', label: 'Open report centre', description: 'Review available reports; depreciation is not posted to a general ledger.' }],
  accounting: [{ path: '/modules/reports', label: 'Open report centre', description: 'Review available reports; preview journals are not a live general ledger.' }],
  'chart-of-accounts': [{ path: '/modules/reports', label: 'Open report centre', description: 'Review reporting; account mapping is not connected to live transaction posting.' }],
  'tax-codes': [{ path: '/modules/reports', label: 'Open report centre', description: 'Review available reports; tax codes do not submit to a tax authority.' }],
  'tax-documents': [{ path: '/modules/reports', label: 'Open report centre', description: 'Review available preview reports; no URA/EFRIS request is sent.' }],
  team: [{ path: '/settings', label: 'Open workspace settings', description: 'Open current local workspace settings; preview team roles do not enforce permissions.' }],
  employees: [{ path: '/settings', label: 'Open workspace settings', description: 'Open current local workspace settings; this does not connect a real HR identity.' }],
  attendance: [{ path: '/modules/reports', label: 'Open report centre', description: 'Review preview data; attendance does not calculate statutory payroll automatically.' }],
  leave: [{ path: '/modules/reports', label: 'Open report centre', description: 'Review preview data; leave entries do not create payroll postings.' }],
  payroll: [{ path: '/modules/reports', label: 'Open report centre', description: 'Review preview reporting; payroll is not statutory or payable until a verified backend is connected.' }],
  integrations: [{ path: '/settings', label: 'Open workspace settings', description: 'Review current local workspace settings; connector credentials are not stored here.' }],
};

export function getCoreScreenShortcuts(moduleId: string): CoreScreenShortcut[] {
  return CORE_SCREEN_SHORTCUTS[moduleId] ?? [{
    path: '/modules/reports',
    label: 'Open report centre',
    description: 'Open available preview reporting; this navigation does not post or synchronize the current record.',
  }];
}
