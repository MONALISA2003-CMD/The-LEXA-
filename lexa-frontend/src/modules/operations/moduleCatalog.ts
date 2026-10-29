import type { LucideIcon } from 'lucide-react';
import {
  Activity, ArrowLeftRight, Banknote, BarChart3, BookOpen, Building2, ClipboardList,
  FileText, HandCoins, PackageCheck, ReceiptText, Truck, Users, Wallet, ShoppingCart, Tag, UserRound, Clock3, RotateCcw, Boxes, Plug, Target,
} from 'lucide-react';

export type FieldKind = 'text' | 'email' | 'tel' | 'number' | 'date' | 'select' | 'textarea';
export type ColumnKind = 'text' | 'money' | 'date' | 'status' | 'number';
export interface ModuleField {
  key: string;
  label: string;
  kind?: FieldKind;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: string[];
  min?: number;
  step?: number;
  fullWidth?: boolean;
}
export interface ModuleColumn { key: string; label: string; kind?: ColumnKind; }
export interface PreviewRecord { id: string; updatedAt: string; status: string; [key: string]: string; }
export interface ModuleDefinition {
  id: string;
  title: string;
  group: string;
  description: string;
  workflow: string;
  icon: LucideIcon;
  fields: ModuleField[];
  columns: ModuleColumn[];
  initial: PreviewRecord[];
  dateKey?: string;
  amountKey?: string;
  readOnly?: boolean;
  singular: string;
}


const status = (options: string[]): ModuleField => ({ key: 'status', label: 'Status', kind: 'select', required: true, options });
const text = (key: string, label: string, required = true, placeholder = ''): ModuleField => ({ key, label, kind: 'text', required, placeholder });
const amount = (key: string, label: string, required = true, help = ''): ModuleField => {
  const fractional = /amount|price|cost|balance|limit|value|depreciation|taxable|percent|rate|residual|life|paid|received/i.test(key);
  return { key, label, kind: 'number', required, min: 0, step: fractional ? 0.01 : 1, help };
};
const date = (key: string, label: string, required = true): ModuleField => ({ key, label, kind: 'date', required });
const select = (key: string, label: string, options: string[], required = true): ModuleField => ({ key, label, kind: 'select', options, required });

export const MODULE_CATALOG: ModuleDefinition[] = [
  {
    id: 'customers', title: 'Customers', singular: 'customer', group: 'SELLING', icon: Users,
    description: 'Customer master records, contacts, billing details, credit terms and the balance to reconcile against sales and receipts.',
    workflow: 'Customer → quotation or sale → invoice / receipt → payment allocation → customer statement. Balance figures here are until the opening balances are reconciled with the authoritative accounts.',
    amountKey: 'outstandingBalance',
    fields: [text('customerCode', 'Customer code'), text('name', 'Customer / business name'), select('customerType', 'Customer type', ['Company', 'Individual', 'Government / institution']), { ...text('phone', 'Phone number'), kind: 'tel' }, { ...text('email', 'Email address', false), kind: 'email' }, text('tin', 'TIN / tax reference', false), { key: 'billingAddress', label: 'Billing address', kind: 'textarea', fullWidth: true, required: false }, amount('creditLimit', 'Credit limit (major currency units)'), amount('openingBalance', 'Opening balance / amount owed'), select('paymentTerms', 'Payment terms', ['Immediate', '7 days', '14 days', '30 days', '60 days']), status(['Active', 'On hold', 'Inactive'])],
    columns: [{ key: 'customerCode', label: 'CODE' }, { key: 'name', label: 'CUSTOMER' }, { key: 'phone', label: 'PHONE' }, { key: 'outstandingBalance', label: 'OUTSTANDING', kind: 'money' }, { key: 'creditLimit', label: 'CREDIT LIMIT', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'suppliers', title: 'Suppliers', singular: 'supplier', group: 'PROCUREMENT', icon: Truck,
    description: 'Maintain supplier contact details, tax references, payment terms and opening payable balances.',
    workflow: 'Supplier → purchase order → goods received → supplier invoice → payment → supplier statement. Supplier liabilities must be reconciled with approved purchases and receipts.',
    amountKey: 'outstandingPayable',
    fields: [text('supplierCode', 'Supplier code'), text('name', 'Supplier / business name'), { ...text('phone', 'Phone number'), kind: 'tel' }, { ...text('email', 'Email address', false), kind: 'email' }, text('tin', 'TIN / tax reference', false), { key: 'address', label: 'Address', kind: 'textarea', required: false, fullWidth: true }, select('paymentTerms', 'Payment terms', ['Cash on delivery', '7 days', '14 days', '30 days', '60 days']), amount('openingPayable', 'Opening payable balance'), status(['Active', 'On hold', 'Inactive'])],
    columns: [{ key: 'supplierCode', label: 'CODE' }, { key: 'name', label: 'SUPPLIER' }, { key: 'phone', label: 'PHONE' }, { key: 'paymentTerms', label: 'TERMS' }, { key: 'outstandingPayable', label: 'PAYABLE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'sales-orders', title: 'Sales orders', singular: 'sales order', group: 'SELLING', icon: ShoppingCart,
    description: 'Capture a customer commitment, promised delivery date, line estimate, discounts and taxes before fulfilment or invoicing.',
    workflow: 'Draft → confirm order → fulfil/dispatch → issue invoice → allocate receipts. An order does not reserve stock or post revenue until the relevant stock and invoicing workflows confirm it.',
    dateKey: 'orderDate', amountKey: 'total',
    fields: [text('orderNumber', 'Sales order number'), text('customer', 'Customer'), date('orderDate', 'Order date'), date('expectedDate', 'Expected delivery date'), text('itemSummary', 'Item / service description'), amount('quantity', 'Quantity'), amount('unitPrice', 'Unit selling price before tax'), amount('discountPercent', 'Discount (%)'), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)'), status(['Draft', 'Confirmed', 'Partially fulfilled', 'Fulfilled', 'Invoiced', 'Cancelled'])],
    columns: [{ key: 'orderNumber', label: 'SALES ORDER' }, { key: 'customer', label: 'CUSTOMER' }, { key: 'orderDate', label: 'ORDER DATE', kind: 'date' }, { key: 'expectedDate', label: 'EXPECTED', kind: 'date' }, { key: 'total', label: 'ESTIMATED TOTAL', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'sales-invoices', title: 'Sales invoices', singular: 'sales invoice', group: 'SELLING', icon: ReceiptText,
    description: 'Track invoice references, customer, issue and due dates, billable lines, tax estimate, received amount and remaining amount due.',
    workflow: 'Invoice draft → issue from an approved sales workflow → allocate customer receipt → reconcile → customer statement. Only validated and issued invoices should be included in statutory records.',
    dateKey: 'issueDate', amountKey: 'total',
    fields: [text('invoiceNumber', 'Invoice number'), text('customer', 'Customer'), text('salesOrderReference', 'Sales order reference', false), date('issueDate', 'Issue date'), date('dueDate', 'Due date'), text('itemSummary', 'Item / service description'), amount('quantity', 'Quantity'), amount('unitPrice', 'Unit price before tax'), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)'), amount('amountReceived', 'Amount received'), status(['Draft', 'Issued', 'Partially paid', 'Paid', 'Overdue', 'Void'])],
    columns: [{ key: 'invoiceNumber', label: 'INVOICE' }, { key: 'customer', label: 'CUSTOMER' }, { key: 'salesOrderReference', label: 'SALES ORDER' }, { key: 'issueDate', label: 'ISSUED', kind: 'date' }, { key: 'dueDate', label: 'DUE DATE', kind: 'date' }, { key: 'total', label: 'TOTAL', kind: 'money' }, { key: 'amountDue', label: 'AMOUNT DUE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'quotations', title: 'Quotations', singular: 'quotation', group: 'SELLING', icon: FileText,
    description: 'Prepare an offer with customer, validity dates, quantity, unit price, discounts, taxes and a calculated total.',
    workflow: 'Draft → send to customer → accept / decline → convert to an order or sale. No live email, invoice, or stock posting is triggered until the responsible workflow is confirmed.',
    dateKey: 'issueDate', amountKey: 'total',
    fields: [text('quoteNumber', 'Quotation number'), text('customer', 'Customer'), date('issueDate', 'Issue date'), date('validUntil', 'Valid until'), text('itemSummary', 'Item / service description'), amount('quantity', 'Quantity'), amount('unitPrice', 'Unit price before tax'), amount('discountPercent', 'Discount (%)', true), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)', true), status(['Draft', 'Sent', 'Accepted', 'Declined', 'Expired'])],
    columns: [{ key: 'quoteNumber', label: 'QUOTE' }, { key: 'customer', label: 'CUSTOMER' }, { key: 'issueDate', label: 'ISSUED', kind: 'date' }, { key: 'validUntil', label: 'VALID UNTIL', kind: 'date' }, { key: 'total', label: 'TOTAL', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'purchases', title: 'Purchase orders', singular: 'purchase order', group: 'PROCUREMENT', icon: ClipboardList,
    description: 'Track a supplier commitment, expected delivery, quantities, rates, taxes, amount paid and remaining commitment.',
    workflow: 'Purchase order records what the business intends to buy. It does not itself increase stock or settle a supplier balance; record a separate goods receipt and payment.',
    dateKey: 'orderDate', amountKey: 'total',
    fields: [text('poNumber', 'Purchase order number'), text('supplier', 'Supplier'), date('orderDate', 'Order date'), date('expectedDate', 'Expected delivery'), text('itemSummary', 'Item / service description'), amount('quantity', 'Quantity ordered'), amount('unitCost', 'Unit cost before tax'), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)'), amount('amountPaid', 'Amount already paid'), status(['Draft', 'Ordered', 'Partially received', 'Received', 'Cancelled'])],
    columns: [{ key: 'poNumber', label: 'PURCHASE ORDER' }, { key: 'supplier', label: 'SUPPLIER' }, { key: 'orderDate', label: 'ORDER DATE', kind: 'date' }, { key: 'expectedDate', label: 'EXPECTED', kind: 'date' }, { key: 'total', label: 'ORDER TOTAL', kind: 'money' }, { key: 'amountDue', label: 'EST. DUE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'purchase-invoices', title: 'Supplier invoices', singular: 'supplier invoice', group: 'PROCUREMENT', icon: ReceiptText,
    description: 'Track supplier bill references, linked purchase order, issue and due dates, item/cost estimate, tax, payments and remaining payable.',
    workflow: 'Link the supplier bill to the related purchase order and receipt when available → approve invoice → allocate supplier payment → reconcile. Supplier liabilities must be reconciled through the accounting workflow.',
    dateKey: 'billDate', amountKey: 'amountDue',
    fields: [text('billNumber', 'Supplier invoice / bill number'), text('supplier', 'Supplier'), text('purchaseOrder', 'Purchase order reference', false), date('billDate', 'Bill date'), date('dueDate', 'Due date'), text('itemSummary', 'Item / service description'), amount('quantity', 'Quantity billed'), amount('unitCost', 'Unit cost before tax'), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)'), amount('amountPaid', 'Amount paid'), status(['Draft', 'Received', 'Approved', 'Partially paid', 'Paid', 'Overdue', 'Disputed', 'Void'])],
    columns: [{ key: 'billNumber', label: 'SUPPLIER BILL' }, { key: 'supplier', label: 'SUPPLIER' }, { key: 'purchaseOrder', label: 'PURCHASE ORDER' }, { key: 'billDate', label: 'BILL DATE', kind: 'date' }, { key: 'total', label: 'TOTAL', kind: 'money' }, { key: 'amountDue', label: 'AMOUNT DUE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'receiving', title: 'Goods receiving', singular: 'goods receipt', group: 'INVENTORY', icon: PackageCheck,
    description: 'Capture what physically arrived against a purchase order, including accepted and rejected quantities and warehouse traceability.',
    workflow: 'Purchase order → goods receipt → stock ledger. A partial receipt must leave the unreceived quantity open. Stock balances change only through the stock ledger workflow.',
    dateKey: 'receiptDate',
    fields: [text('receiptNumber', 'Goods receipt number'), text('purchaseOrder', 'Purchase order reference'), text('supplier', 'Supplier'), date('receiptDate', 'Receipt date'), text('product', 'Product / item'), amount('orderedQuantity', 'Ordered quantity'), amount('acceptedQuantity', 'Accepted quantity'), amount('rejectedQuantity', 'Rejected / damaged quantity'), text('warehouse', 'Receiving warehouse'), text('batchNumber', 'Batch / lot reference', false), date('expiryDate', 'Expiry date', false), status(['Draft', 'Received', 'Needs inspection', 'Rejected'])],
    columns: [{ key: 'receiptNumber', label: 'RECEIPT' }, { key: 'purchaseOrder', label: 'PURCHASE ORDER' }, { key: 'supplier', label: 'SUPPLIER' }, { key: 'receiptDate', label: 'RECEIVED', kind: 'date' }, { key: 'acceptedQuantity', label: 'ACCEPTED', kind: 'number' }, { key: 'rejectedQuantity', label: 'REJECTED', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'expenses', title: 'Expenses', singular: 'expense', group: 'FINANCE', icon: ReceiptText,
    description: 'Capture operating expenses with date, category, payee, account, reference, tax estimate and approval/payment status.',
    workflow: 'Draft expense → approve → record payment → include in reports. Approval and payment must be recorded through the corresponding accounting workflows.',
    dateKey: 'expenseDate', amountKey: 'total',
    fields: [text('expenseNumber', 'Expense reference'), date('expenseDate', 'Expense date'), select('category', 'Expense category', ['Rent', 'Transport', 'Utilities', 'Salaries', 'Marketing', 'Repairs', 'Office supplies', 'Bank charges', 'Other']), text('payee', 'Payee / vendor'), select('account', 'Payment account', ['Cash till', 'Main bank account', 'MTN Mobile Money', 'Airtel Money', 'Unpaid / payable']), text('reference', 'Receipt / invoice reference', false), amount('amount', 'Amount before tax'), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)'), { key: 'notes', label: 'Notes', kind: 'textarea', fullWidth: true, required: false }, status(['Draft', 'Approved', 'Paid', 'Rejected'])],
    columns: [{ key: 'expenseNumber', label: 'REFERENCE' }, { key: 'expenseDate', label: 'DATE', kind: 'date' }, { key: 'category', label: 'CATEGORY' }, { key: 'payee', label: 'PAYEE' }, { key: 'total', label: 'TOTAL', kind: 'money' }, { key: 'account', label: 'ACCOUNT' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'money-accounts', title: 'Money accounts', singular: 'money account', group: 'FINANCE', icon: Wallet,
    description: 'cash tills, bank accounts and mobile-money wallets with opening and current balances.',
    workflow: 'Account opening balance + posted receipts − posted payments ± transfers = reconciled balance. Entered balances must be reconciled with your bank or cash ledger.',
    fields: [text('accountName', 'Account name'), select('accountType', 'Account type', ['Cash till', 'Bank', 'Mobile money', 'Petty cash', 'Clearing']), text('accountNumber', 'Account / wallet reference', false), select('currency', 'Currency', ['UGX', 'USD', 'KES']), amount('openingBalance', 'Opening balance'), amount('currentBalance', 'Current balance'), text('branchName', 'Branch'), status(['Active', 'Inactive', 'Reconciliation needed'])],
    columns: [{ key: 'accountName', label: 'ACCOUNT' }, { key: 'accountType', label: 'TYPE' }, { key: 'accountNumber', label: 'REFERENCE' }, { key: 'openingBalance', label: 'OPENING', kind: 'money' }, { key: 'currentBalance', label: 'CURRENT BALANCE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'payments', title: 'Receipts & payments', singular: 'payment record', group: 'FINANCE', icon: HandCoins,
    description: 'Capture customer receipts, supplier payments, advances and transfers with a reference to the party and money account.',
    workflow: 'Choose money in / money out / transfer → select party and account → enter amount and method → reconcile against the related invoice or bill. entries do not initiate transfers.',
    dateKey: 'paymentDate', amountKey: 'amount',
    fields: [text('paymentNumber', 'Payment / receipt number'), select('direction', 'Direction', ['Money in', 'Money out', 'Account transfer']), select('partyType', 'Party type', ['Customer', 'Supplier', 'Employee', 'Other', 'Internal transfer']), text('partyName', 'Party / beneficiary'), date('paymentDate', 'Transaction date'), select('method', 'Payment method', ['Cash', 'MTN Mobile Money (recorded)', 'Airtel Money (recorded)', 'Bank transfer (recorded)', 'Card (recorded)', 'Other']), select('account', 'Cash / bank / wallet account', ['Cash till', 'Main bank account', 'MTN Mobile Money', 'Airtel Money']), text('reference', 'External reference', false), amount('amount', 'Amount'), { key: 'notes', label: 'Notes / invoice allocation', kind: 'textarea', fullWidth: true, required: false }, status(['Pending', 'Recorded', 'Reconciled', 'Cancelled'])],
    columns: [{ key: 'paymentNumber', label: 'REFERENCE' }, { key: 'direction', label: 'DIRECTION' }, { key: 'paymentDate', label: 'DATE', kind: 'date' }, { key: 'partyName', label: 'PARTY' }, { key: 'method', label: 'METHOD' }, { key: 'amount', label: 'AMOUNT', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'accounting', title: 'Accounting journals', singular: 'journal entry', group: 'FINANCE', icon: BookOpen,
    description: 'Prepare a balanced journal voucher with posting date, debit account, credit account, amount and a review state.',
    workflow: 'Use routine sales, purchases, receipts and supplier payments in their operational modules. Journals are for controlled adjustments; total debits must equal total credits before posting.',
    dateKey: 'journalDate', amountKey: 'amount',
    fields: [text('journalNumber', 'Journal reference'), date('journalDate', 'Posting date'), text('description', 'Narration / description'), select('debitAccount', 'Debit account', ['Cash', 'Bank', 'Accounts receivable', 'Inventory', 'Expenses', 'Fixed assets', 'Tax recoverable']), select('creditAccount', 'Credit account', ['Bank', 'Cash', 'Accounts payable', 'Sales income', 'Capital', 'Accumulated depreciation', 'Tax payable']), amount('amount', 'Journal amount'), text('sourceReference', 'Supporting document reference', false), status(['Draft', 'Posted', 'Voided'])],
    columns: [{ key: 'journalNumber', label: 'JOURNAL' }, { key: 'journalDate', label: 'DATE', kind: 'date' }, { key: 'description', label: 'NARRATION' }, { key: 'debitAccount', label: 'DEBIT ACCOUNT' }, { key: 'creditAccount', label: 'CREDIT ACCOUNT' }, { key: 'amount', label: 'DEBIT = CREDIT', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'assets', title: 'Fixed assets', singular: 'fixed asset', group: 'FINANCE', icon: Building2,
    description: 'Track asset details, acquisition cost, residual value, useful life and calculated straight-line depreciation.',
    workflow: 'Acquire asset → record supplier document → classify asset → calculate depreciation → review disposal. Depreciation figures here are estimates and are not posted to the ledger.',
    dateKey: 'acquisitionDate', amountKey: 'carryingValue',
    fields: [text('assetCode', 'Asset tag / code'), text('name', 'Asset name'), select('category', 'Asset category', ['Equipment', 'Furniture', 'Motor vehicle', 'Computer / IT', 'Leasehold improvement', 'Other']), text('location', 'Location / branch'), date('acquisitionDate', 'Acquisition date'), amount('cost', 'Acquisition cost'), amount('residualValue', 'Residual value'), amount('usefulLifeYears', 'Useful life (years)'), amount('accumulatedDepreciation', 'Accumulated depreciation'), text('assetAccount', 'Asset account'), status(['Active', 'Under maintenance', 'Disposed'])],
    columns: [{ key: 'assetCode', label: 'ASSET TAG' }, { key: 'name', label: 'ASSET' }, { key: 'category', label: 'CATEGORY' }, { key: 'acquisitionDate', label: 'ACQUIRED', kind: 'date' }, { key: 'cost', label: 'COST', kind: 'money' }, { key: 'carryingValue', label: 'CARRYING VALUE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'stock-counts', title: 'Stock counts', singular: 'stock count', group: 'INVENTORY', icon: PackageCheck,
    description: 'Plan a count, compare physical quantity to the system quantity, document the variance and capture an approval/status trail.',
    workflow: 'Open count → count physical stock → explain variance → review/approve → post a controlled stock adjustment. Confirmed variances must be posted through the stock movement workflow.',
    dateKey: 'countDate',
    fields: [text('countNumber', 'Stock count reference'), date('countDate', 'Count date'), text('product', 'Product / SKU'), amount('expectedQuantity', 'System quantity'), amount('countedQuantity', 'Physically counted quantity'), text('reason', 'Variance explanation', false), status(['Draft', 'Counted', 'Needs review', 'Approved', 'Posted', 'Cancelled'])],
    columns: [{ key: 'countNumber', label: 'COUNT' }, { key: 'countDate', label: 'DATE', kind: 'date' }, { key: 'product', label: 'PRODUCT' }, { key: 'expectedQuantity', label: 'SYSTEM QTY', kind: 'number' }, { key: 'countedQuantity', label: 'COUNTED QTY', kind: 'number' }, { key: 'variance', label: 'VARIANCE', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'tax-documents', title: 'Tax documents & EFRIS', singular: 'tax document', group: 'FINANCE', icon: BookOpen,
    description: 'Prepare fiscal-document data and record a reference returned by an authorized external process. URA submission requires an active, authorized EFRIS connection.',
    workflow: 'Validate source invoice and taxpayer/customer details → prepare fiscalization request → later API integration submits to EFRIS → store the external receipt number, verification code and response. This page is not an EFRIS connection.',
    dateKey: 'issueDate', amountKey: 'taxAmount',
    fields: [text('internalReference', 'Internal tax-document reference'), text('sourceInvoice', 'Source sales invoice'), text('customerTIN', 'Customer TIN / tax reference', false), date('issueDate', 'Document date'), amount('taxableAmount', 'Taxable amount'), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)'), text('externalReceiptNumber', 'External e-receipt / invoice number', false), text('verificationCode', 'External verification code', false), { key: 'notes', label: 'Tax / exemption notes', kind: 'textarea', required: false, fullWidth: true }, status(['Draft', 'Ready for integration', 'Submitted externally', 'Accepted externally', 'Rejected externally', 'Cancelled'])],
    columns: [{ key: 'internalReference', label: 'REFERENCE' }, { key: 'sourceInvoice', label: 'SOURCE INVOICE' }, { key: 'issueDate', label: 'DATE', kind: 'date' }, { key: 'taxableAmount', label: 'TAXABLE AMOUNT', kind: 'money' }, { key: 'taxAmount', label: 'TAX ESTIMATE', kind: 'money' }, { key: 'externalReceiptNumber', label: 'EXTERNAL REF' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'stock-transfers', title: 'Stock transfers', singular: 'stock transfer', group: 'INVENTORY', icon: ArrowLeftRight,
    description: 'Record internal stock movement between branches, including source, destination, product, quantity, reason and receipt status.',
    workflow: 'Draft → request → dispatch / in transit → receive at destination. Confirmed transfers require paired stock ledger movements before on-hand balances change.',
    dateKey: 'transferDate',
    fields: [text('transferNumber', 'Transfer reference'), text('fromBranch', 'Source branch'), text('toBranch', 'Destination branch'), date('transferDate', 'Transfer date'), text('product', 'Product / SKU'), amount('quantity', 'Quantity transferred'), select('reason', 'Reason', ['Replenishment', 'Inter-branch sale fulfilment', 'Stock balancing', 'Other']), status(['Draft', 'Requested', 'In transit', 'Received', 'Cancelled'])],
    columns: [{ key: 'transferNumber', label: 'TRANSFER' }, { key: 'fromBranch', label: 'FROM' }, { key: 'toBranch', label: 'TO' }, { key: 'transferDate', label: 'DATE', kind: 'date' }, { key: 'product', label: 'PRODUCT' }, { key: 'quantity', label: 'QTY', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'team', title: 'Team & access', singular: 'team member', group: 'ADMINISTRATION', icon: Users,
    description: 'Review a proposed staff directory, role assignment, branch scope and member status before the future auth integration.',
    workflow: 'Invite → accept invitation → assign role and permitted branches → review access. User accounts and permission enforcement require the connected identity and access-control service.',
    dateKey: 'lastActive',
    fields: [text('memberName', 'Full name'), { ...text('email', 'Work email'), kind: 'email' }, select('role', 'Role', ['Owner / administrator', 'Business manager', 'Branch manager', 'Cashier', 'Inventory operator', 'Accountant', 'Read only']), text('branches', 'Allowed branches'), date('lastActive', 'Last active date', false), status(['Invited', 'Active', 'Suspended'])],
    columns: [{ key: 'memberName', label: 'TEAM MEMBER' }, { key: 'email', label: 'EMAIL' }, { key: 'role', label: 'ROLE' }, { key: 'branches', label: 'BRANCH SCOPE' }, { key: 'lastActive', label: 'LAST ACTIVE', kind: 'date' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'price-lists', title: 'Price lists & pricing', singular: 'price list', group: 'SELLING', icon: Tag,
    description: 'Prepare customer-group or product-specific pricing with valid dates, discounts and an explicit currency.',
    workflow: 'Draft price list → review prices and dates → activate for a selling channel/customer group. Checkout prices change only after the price list is approved and activated.',
    dateKey: 'validFrom',
    fields: [text('priceListCode', 'Price-list code'), text('listName', 'Price-list name'), select('appliesTo', 'Applies to', ['All customers', 'Retail', 'Wholesale', 'Named customer', 'Branch promotion']), text('customerOrGroup', 'Customer / group', false), text('productOrCategory', 'Product, SKU or category'), select('currency', 'Currency', ['UGX', 'USD', 'KES']), amount('basePrice', 'Reference / base price'), amount('sellingPrice', 'Price to charge'), amount('discountPercent', 'Discount (%)'), date('validFrom', 'Valid from'), date('validUntil', 'Valid until'), status(['Draft', 'Review', 'Active', 'Expired', 'Inactive'])],
    columns: [{ key: 'priceListCode', label: 'CODE' }, { key: 'listName', label: 'PRICE LIST' }, { key: 'appliesTo', label: 'CUSTOMER SCOPE' }, { key: 'productOrCategory', label: 'PRODUCT / CATEGORY' }, { key: 'sellingPrice', label: 'SELLING PRICE', kind: 'money' }, { key: 'validFrom', label: 'VALID FROM', kind: 'date' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'deliveries', title: 'Deliveries & fulfilment', singular: 'delivery', group: 'LOGISTICS', icon: Truck,
    description: 'Track picking, dispatch, courier, destination, expected arrival, proof-of-delivery references and delivery fees.',
    workflow: 'Sales order → pick/pack → dispatch → delivery in transit → proof of delivery → close. Fulfilment and stock status must be confirmed by the logistics and stock workflows.',
    dateKey: 'dispatchDate', amountKey: 'deliveryFee',
    fields: [text('deliveryNumber', 'Delivery reference'), text('salesOrder', 'Sales order reference'), text('customer', 'Customer / recipient'), { key: 'deliveryAddress', label: 'Delivery address', kind: 'textarea', fullWidth: true }, date('dispatchDate', 'Dispatch date'), date('expectedDate', 'Expected arrival'), text('courier', 'Courier / driver'), text('trackingReference', 'Tracking / proof reference', false), amount('deliveryFee', 'Delivery fee'), select('method', 'Delivery method', ['Own fleet', 'Courier', 'Customer collection', 'Third-party logistics']), status(['Draft', 'Picking', 'Packed', 'Dispatched', 'In transit', 'Delivered', 'Delivery failed', 'Cancelled'])],
    columns: [{ key: 'deliveryNumber', label: 'DELIVERY' }, { key: 'salesOrder', label: 'SALES ORDER' }, { key: 'customer', label: 'CUSTOMER' }, { key: 'dispatchDate', label: 'DISPATCHED', kind: 'date' }, { key: 'expectedDate', label: 'EXPECTED', kind: 'date' }, { key: 'courier', label: 'COURIER / DRIVER' }, { key: 'deliveryFee', label: 'DELIVERY FEE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'warehouses', title: 'Warehouses & locations', singular: 'warehouse / location', group: 'INVENTORY', icon: Building2,
    description: 'Plan the physical locations used for receiving, storage, picking, dispatch, stock counting and inter-branch movement.',
    workflow: 'Create a location → assign a branch and supervisor → receive/move stock into the location → count and reconcile. These location records do not create a stock ledger.',
    fields: [text('locationCode', 'Location code'), text('name', 'Warehouse / location name'), text('branch', 'Branch'), select('locationType', 'Location type', ['Warehouse', 'Store room', 'Retail floor', 'Dispatch area', 'Quarantine / returns', 'Virtual']), text('address', 'Address / zone'), text('binRange', 'Aisle / rack / bin range', false), amount('capacityUnits', 'Capacity (units, optional)', false), text('supervisor', 'Responsible supervisor', false), status(['Active', 'Restricted', 'Under maintenance', 'Inactive'])],
    columns: [{ key: 'locationCode', label: 'LOCATION CODE' }, { key: 'name', label: 'LOCATION' }, { key: 'branch', label: 'BRANCH' }, { key: 'locationType', label: 'TYPE' }, { key: 'binRange', label: 'AISLE / BIN' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'employees', title: 'Employees & HR directory', singular: 'employee', group: 'PEOPLE & PAYROLL', icon: UserRound,
    description: 'Maintain the staff directory, employment status, department, position, assigned branch and agreed monthly pay reference.',
    workflow: 'Create employee profile → assign role/branch in access control → record attendance → prepare a reviewed payroll run. Employee directory records do not create login accounts.',
    dateKey: 'startDate', amountKey: 'baseMonthlyPay',
    fields: [text('employeeCode', 'Employee number'), text('fullName', 'Full name'), { ...text('workEmail', 'Work email', false), kind: 'email' }, { ...text('phone', 'Phone number'), kind: 'tel' }, text('department', 'Department'), text('jobTitle', 'Job title'), text('branch', 'Home branch'), date('startDate', 'Start date'), select('employmentType', 'Engagement type', ['Permanent', 'Fixed term', 'Part time', 'Casual', 'Contractor']), amount('baseMonthlyPay', 'Base monthly pay (reference)'), status(['Active', 'On leave', 'Suspended', 'Exited'])],
    columns: [{ key: 'employeeCode', label: 'EMPLOYEE NO.' }, { key: 'fullName', label: 'EMPLOYEE' }, { key: 'department', label: 'DEPARTMENT' }, { key: 'jobTitle', label: 'POSITION' }, { key: 'branch', label: 'BRANCH' }, { key: 'baseMonthlyPay', label: 'BASE PAY REF.', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'attendance', title: 'Attendance & shifts', singular: 'attendance record', group: 'PEOPLE & PAYROLL', icon: Clock3,
    description: 'Capture staff attendance, shifts, clock-in/out, breaks, attendance exception notes and calculated hours for review.',
    workflow: 'Publish shift plan → capture clock-in/out → review missing punches and lateness → approve attendance → send approved hours to payroll. hours are not an official time clock.',
    dateKey: 'attendanceDate',
    fields: [text('attendanceReference', 'Attendance reference'), text('employee', 'Employee'), date('attendanceDate', 'Attendance date'), select('shift', 'Shift', ['Morning', 'Day', 'Evening', 'Night', 'Split shift', 'Off day']), { ...text('clockIn', 'Clock-in time (HH:MM)'), placeholder: '08:30' }, { ...text('clockOut', 'Clock-out time (HH:MM)'), placeholder: '17:00' }, amount('breakMinutes', 'Unpaid break (minutes)', false), text('exceptionNote', 'Late / missing punch explanation', false), status(['Pending', 'Present', 'Late', 'Absent', 'Leave', 'Reviewed', 'Approved'])],
    columns: [{ key: 'attendanceReference', label: 'REFERENCE' }, { key: 'employee', label: 'EMPLOYEE' }, { key: 'attendanceDate', label: 'DATE', kind: 'date' }, { key: 'shift', label: 'SHIFT' }, { key: 'clockIn', label: 'IN' }, { key: 'clockOut', label: 'OUT' }, { key: 'workedHours', label: 'HOURS', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'payroll', title: 'Payroll runs', singular: 'payroll run', group: 'PEOPLE & PAYROLL', icon: Wallet,
    description: 'Prepare a payroll batch summary with period, headcount, gross pay, deductions and net pay for review.',
    workflow: 'Collect approved attendance and employment changes → prepare gross pay → apply validated statutory and approved deductions → review/approve → pay and post to the ledger. This screen only performs gross minus entered deductions.',
    dateKey: 'periodStart', amountKey: 'netPay',
    fields: [text('payrollReference', 'Payroll run reference'), date('periodStart', 'Period start'), date('periodEnd', 'Period end'), amount('employeeCount', 'Employees included'), amount('grossPay', 'Gross pay for the run'), amount('deductions', 'Total deductions entered'), text('preparedBy', 'Prepared by'), text('reviewReference', 'Review / approval reference', false), status(['Draft', 'Review', 'Approved', 'Payment prepared', 'Paid', 'Reopened'])],
    columns: [{ key: 'payrollReference', label: 'PAYROLL RUN' }, { key: 'periodStart', label: 'PERIOD START', kind: 'date' }, { key: 'periodEnd', label: 'PERIOD END', kind: 'date' }, { key: 'employeeCount', label: 'STAFF', kind: 'number' }, { key: 'grossPay', label: 'GROSS PAY', kind: 'money' }, { key: 'deductions', label: 'DEDUCTIONS', kind: 'money' }, { key: 'netPay', label: 'NET PAY ESTIMATE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'chart-of-accounts', title: 'Chart of accounts', singular: 'general-ledger account', group: 'FINANCE', icon: BookOpen,
    description: 'Define the controlled ledger account structure used by journal entries, reports and later API-backed transaction posting.',
    workflow: 'Review standard account classes → define parent/child accounts → map operational modules and tax codes → restrict posting and lock accounts when used. Journal entries must be approved and posted through the accounting ledger.',
    fields: [text('accountCode', 'Account code'), text('accountName', 'Account name'), select('accountType', 'Account class', ['Asset', 'Liability', 'Equity', 'Income', 'Cost of sales', 'Expense']), select('normalBalance', 'Normal balance', ['Debit', 'Credit']), text('parentAccount', 'Parent / control account', false), select('reconciliationRequired', 'Reconciliation required', ['No', 'Yes']), text('description', 'Account purpose', false), status(['Draft', 'Active', 'Blocked', 'Archived'])],
    columns: [{ key: 'accountCode', label: 'ACCOUNT CODE' }, { key: 'accountName', label: 'ACCOUNT NAME' }, { key: 'accountType', label: 'CLASS' }, { key: 'normalBalance', label: 'NORMAL BALANCE' }, { key: 'parentAccount', label: 'PARENT ACCOUNT' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'tax-codes', title: 'Tax codes & rules', singular: 'tax code', group: 'FINANCE', icon: ReceiptText,
    description: 'Maintain explicit tax treatments, rates, effective dates and the intended sales/purchase ledger mapping.',
    workflow: 'Create a tax code → choose treatment and applicability → set effective period and tax accounts → validate with the finance owner → map the backend tax configuration. codes are not legal tax advice or an EFRIS submission.',
    dateKey: 'effectiveFrom',
    fields: [text('taxCode', 'Tax code'), text('taxName', 'Tax name / description'), select('treatment', 'Treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope', 'Special treatment']), amount('ratePercent', 'Rate (%)'), select('appliesTo', 'Applies to', ['Sales', 'Purchases', 'Sales and purchases']), select('priceBasis', 'Price basis', ['Exclusive of tax', 'Inclusive of tax']), date('effectiveFrom', 'Effective from'), date('effectiveTo', 'Effective until', false), text('outputTaxAccount', 'Output-tax ledger account', false), text('inputTaxAccount', 'Input-tax ledger account', false), text('exemptionReason', 'Supporting legal / exemption note', false), status(['Draft', 'Active', 'Expired', 'Disabled'])],
    columns: [{ key: 'taxCode', label: 'CODE' }, { key: 'taxName', label: 'TAX TREATMENT' }, { key: 'treatment', label: 'TREATMENT' }, { key: 'ratePercent', label: 'RATE (%)', kind: 'number' }, { key: 'appliesTo', label: 'APPLIES TO' }, { key: 'effectiveFrom', label: 'EFFECTIVE FROM', kind: 'date' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'bank-reconciliation', title: 'Bank reconciliation', singular: 'reconciliation run', group: 'FINANCE', icon: Banknote,
    description: 'Prepare a statement-to-book reconciliation with statement reference, opening/closing figures, match counts and an unexplained difference.',
    workflow: 'Import or enter a statement → match each line to recorded money movements → investigate unmatched fees/transfers → review the difference → approve reconciliation. Bank-feed connectivity must be confirmed in Settings.',
    dateKey: 'statementDate',
    fields: [text('reconciliationNumber', 'Reconciliation reference'), select('account', 'Cash / bank account', ['Main bank account', 'Cash till', 'MTN Mobile Money', 'Airtel Money']), date('statementDate', 'Statement end date'), text('statementReference', 'Statement / file reference'), amount('openingBalance', 'Statement opening balance'), amount('statementBalance', 'Statement closing balance'), amount('bookBalance', 'Book closing balance'), amount('statementLineCount', 'Statement lines'), amount('matchedCount', 'Matched lines'), amount('unmatchedCount', 'Unmatched lines'), text('preparedBy', 'Prepared by'), status(['Draft', 'Matching', 'Needs review', 'Reconciled', 'Reopened'])],
    columns: [{ key: 'reconciliationNumber', label: 'RECONCILIATION' }, { key: 'account', label: 'ACCOUNT' }, { key: 'statementDate', label: 'AS AT', kind: 'date' }, { key: 'statementBalance', label: 'STATEMENT BALANCE', kind: 'money' }, { key: 'bookBalance', label: 'BOOK BALANCE', kind: 'money' }, { key: 'difference', label: 'DIFFERENCE', kind: 'money' }, { key: 'unmatchedCount', label: 'UNMATCHED', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'purchase-requests', title: 'Purchase requests', singular: 'purchase request', group: 'PROCUREMENT', icon: ClipboardList,
    description: 'Capture internal purchasing needs with requester, branch, required date, quantity, justification, priority and approval state.',
    workflow: 'Draft request → submit for review → approve/reject → issue an RFQ or approved purchase order. This is a demand/approval record; it does not order, receive or expense stock.',
    dateKey: 'requestDate',
    fields: [text('requestNumber', 'Request reference'), text('requestedBy', 'Requested by'), text('branch', 'Branch / cost centre'), date('requestDate', 'Request date'), date('neededBy', 'Required by'), text('itemSummary', 'Item / service description'), amount('quantity', 'Quantity requested'), select('priority', 'Priority', ['Routine', 'Important', 'Urgent']), text('preferredSupplier', 'Suggested supplier (optional)', false), { key: 'justification', label: 'Business justification', kind: 'textarea', fullWidth: true }, status(['Draft', 'Submitted', 'Under review', 'Approved', 'Rejected', 'Converted', 'Cancelled'])],
    columns: [{ key: 'requestNumber', label: 'REQUEST' }, { key: 'requestedBy', label: 'REQUESTER' }, { key: 'branch', label: 'BRANCH / COST CENTRE' }, { key: 'neededBy', label: 'NEEDED BY', kind: 'date' }, { key: 'itemSummary', label: 'REQUIREMENT' }, { key: 'priority', label: 'PRIORITY' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'rfqs', title: 'Requests for quotation', singular: 'request for quotation', group: 'PROCUREMENT', icon: FileText,
    description: 'Invite suppliers to quote against a shared requirement, set a response deadline and retain the commercial terms for comparison.',
    workflow: 'Approved purchase request → issue RFQ to one or more suppliers → capture supplier quote responses → evaluate price/lead time/terms → award. RFQ status does not send email automatically.',
    dateKey: 'issueDate',
    fields: [text('rfqNumber', 'RFQ reference'), text('purchaseRequest', 'Purchase request reference', false), date('issueDate', 'Issue date'), date('responseDue', 'Response deadline'), text('itemSummary', 'Item / service description'), amount('quantity', 'Quantity requested'), { key: 'supplierInvited', label: 'Supplier invited (one supplier per record)', kind: 'text', fullWidth: true }, text('deliveryAddress', 'Delivery / service location', false), text('terms', 'Delivery, warranty or payment terms', false), status(['Draft', 'Sent', 'Responses received', 'Evaluated', 'Awarded', 'Cancelled'])],
    columns: [{ key: 'rfqNumber', label: 'RFQ' }, { key: 'purchaseRequest', label: 'REQUEST' }, { key: 'supplierInvited', label: 'SUPPLIER' }, { key: 'issueDate', label: 'ISSUED', kind: 'date' }, { key: 'responseDue', label: 'RESPONSE DUE', kind: 'date' }, { key: 'itemSummary', label: 'REQUIREMENT' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'supplier-quotes', title: 'Supplier quotations', singular: 'supplier quotation', group: 'PROCUREMENT', icon: FileText,
    description: 'Record a supplier’s quoted unit cost, tax treatment, delivery lead time, validity, payment terms and estimated total for evaluation.',
    workflow: 'Capture one quote per supplier → compare tax, price, lead time and terms → accept or decline → create the winning purchase order. Approved purchase and receiving workflows must confirm commitments and stock.',
    dateKey: 'quoteDate', amountKey: 'total',
    fields: [text('quoteNumber', 'Supplier quote reference'), text('rfqNumber', 'RFQ reference', false), text('supplier', 'Supplier'), date('quoteDate', 'Quote date'), date('validUntil', 'Quote valid until'), text('itemSummary', 'Quoted item / service'), amount('quantity', 'Quoted quantity'), amount('unitCost', 'Quoted unit cost before tax'), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)'), amount('deliveryDays', 'Lead time (days)'), select('paymentTerms', 'Payment terms', ['Cash on delivery', '7 days', '14 days', '30 days', '60 days']), status(['Draft', 'Received', 'Under review', 'Accepted', 'Declined', 'Expired'])],
    columns: [{ key: 'quoteNumber', label: 'SUPPLIER QUOTE' }, { key: 'rfqNumber', label: 'RFQ' }, { key: 'supplier', label: 'SUPPLIER' }, { key: 'quoteDate', label: 'QUOTED', kind: 'date' }, { key: 'unitCost', label: 'UNIT COST', kind: 'money' }, { key: 'total', label: 'EST. TOTAL', kind: 'money' }, { key: 'deliveryDays', label: 'LEAD TIME (DAYS)', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'audit', title: 'Activity & audit log', singular: 'audit event', group: 'ADMINISTRATION', icon: Activity,
    description: 'Review operational activity notes and exceptions. Security-critical audit events must be recorded by trusted server-side actions.',
    workflow: 'A production audit log must be generated by trusted server-side actions and be tamper-resistant. This module is read-only data and is not a security audit source.',
    dateKey: 'eventDate', readOnly: true,
    fields: [],
    columns: [{ key: 'eventDate', label: 'DATE & TIME', kind: 'date' }, { key: 'actor', label: 'ACTOR' }, { key: 'action', label: 'ACTION' }, { key: 'entity', label: 'RECORD TYPE' }, { key: 'reference', label: 'REFERENCE' }, { key: 'detail', label: 'DETAIL' }],
    initial: [],
  },
  {
    id: 'opportunities', title: 'CRM opportunities', singular: 'opportunity', group: 'SELLING', icon: Users,
    description: 'Track potential deals from qualification through proposal, negotiation and outcome, including probability-weighted pipeline value.',
    workflow: 'Lead → qualify → estimate value and close date → follow up → won/lost. A won opportunity can seed a sales-order draft; it does not reserve stock or recognize revenue.',
    dateKey: 'expectedCloseDate', amountKey: 'weightedValue',
    fields: [text('opportunityCode', 'Opportunity reference'), text('company', 'Company / prospect'), text('contactName', 'Contact name'), { ...text('email', 'Contact email', false), kind: 'email' }, select('source', 'Lead source', ['Referral', 'Walk-in', 'Website', 'Campaign', 'Phone', 'Partner', 'Other']), text('owner', 'Opportunity owner'), date('createdDate', 'Created date'), date('expectedCloseDate', 'Expected close date'), amount('amount', 'Estimated deal value'), amount('probability', 'Win probability (%)'), { key: 'nextAction', label: 'Next action', kind: 'textarea', required: false, fullWidth: true }, status(['New', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'])],
    columns: [{ key: 'opportunityCode', label: 'OPPORTUNITY' }, { key: 'company', label: 'PROSPECT' }, { key: 'owner', label: 'OWNER' }, { key: 'expectedCloseDate', label: 'EXPECTED CLOSE', kind: 'date' }, { key: 'amount', label: 'ESTIMATED VALUE', kind: 'money' }, { key: 'weightedValue', label: 'WEIGHTED VALUE', kind: 'money' }, { key: 'status', label: 'STAGE', kind: 'status' }],
    initial: [],
  },
  {
    id: 'sales-returns', title: 'Sales returns & credit notes', singular: 'sales return', group: 'SELLING', icon: RotateCcw,
    description: 'Record return reason, source invoice, returned quantity, tax estimate and proposed customer credit/refund for review.',
    workflow: 'Link the original sale/invoice → inspect returned goods → approve credit → allocate refund or customer credit. Inventory changes and statutory credit notes must be confirmed through the corresponding workflows.',
    dateKey: 'returnDate', amountKey: 'creditAmount',
    fields: [text('returnNumber', 'Return reference'), text('sourceInvoice', 'Original sales invoice / receipt'), text('customer', 'Customer'), date('returnDate', 'Return date'), select('reason', 'Return reason', ['Damaged', 'Wrong item', 'Quality issue', 'Over-supplied', 'Customer changed mind', 'Other']), text('itemDescription', 'Item / SKU and condition'), amount('quantity', 'Quantity returned'), amount('unitPrice', 'Original unit selling price'), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)'), select('resolution', 'Proposed resolution', ['Customer credit', 'Refund review', 'Replacement', 'Inspect first']), status(['Draft', 'Needs inspection', 'Reviewed', 'Approved', 'Credited', 'Rejected'])],
    columns: [{ key: 'returnNumber', label: 'RETURN' }, { key: 'sourceInvoice', label: 'SOURCE INVOICE' }, { key: 'customer', label: 'CUSTOMER' }, { key: 'returnDate', label: 'RETURN DATE', kind: 'date' }, { key: 'quantity', label: 'QTY', kind: 'number' }, { key: 'creditAmount', label: 'CREDIT ESTIMATE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'purchase-returns', title: 'Supplier returns & debit notes', singular: 'supplier return', group: 'PROCUREMENT', icon: RotateCcw,
    description: 'Track goods returned to suppliers, source receipt/bill, rejected quantities, proposed debit amount and supplier-credit follow-up.',
    workflow: 'Link supplier receipt/bill → document reason and quantity → dispatch return → obtain supplier credit → allocate it against the payable. Reverse stock and accounts payable only through the corresponding approved workflows.',
    dateKey: 'returnDate', amountKey: 'debitAmount',
    fields: [text('returnNumber', 'Return reference'), text('sourcePurchaseOrder', 'Purchase order / goods receipt'), text('supplier', 'Supplier'), date('returnDate', 'Return date'), select('reason', 'Return reason', ['Damaged', 'Out of specification', 'Expired', 'Wrong item', 'Over-supplied', 'Other']), text('itemDescription', 'Item / SKU and condition'), amount('quantity', 'Quantity returned'), amount('unitCost', 'Original unit cost'), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)'), status(['Draft', 'Needs inspection', 'Approved', 'Dispatched', 'Credit requested', 'Credit received', 'Rejected'])],
    columns: [{ key: 'returnNumber', label: 'RETURN' }, { key: 'sourcePurchaseOrder', label: 'SOURCE DOCUMENT' }, { key: 'supplier', label: 'SUPPLIER' }, { key: 'returnDate', label: 'RETURN DATE', kind: 'date' }, { key: 'quantity', label: 'QTY', kind: 'number' }, { key: 'debitAmount', label: 'DEBIT ESTIMATE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'projects', title: 'Projects & cost tracking', singular: 'project', group: 'ADMINISTRATION', icon: ClipboardList,
    description: 'Plan work with an owner, customer, dates, approved budget, actual cost estimate and progress.',
    workflow: 'Create project → assign owner and dates → record tasks/costs → review budget variance → close. Budget and cost figures here are illustrative and do not post into accounting.',
    dateKey: 'targetEndDate', amountKey: 'budget',
    fields: [text('projectCode', 'Project code'), text('name', 'Project name'), text('customer', 'Customer / internal department'), text('owner', 'Project owner'), date('startDate', 'Start date'), date('targetEndDate', 'Target end date'), amount('budget', 'Approved budget'), amount('actualCost', 'Actual cost estimate'), amount('progressPercent', 'Progress (%)'), status(['Draft', 'Active', 'On hold', 'Completed', 'Cancelled'])],
    columns: [{ key: 'projectCode', label: 'PROJECT' }, { key: 'name', label: 'PROJECT NAME' }, { key: 'owner', label: 'OWNER' }, { key: 'targetEndDate', label: 'TARGET END', kind: 'date' }, { key: 'budget', label: 'BUDGET', kind: 'money' }, { key: 'budgetVariance', label: 'BUDGET REMAINING', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'tasks', title: 'Tasks & work queue', singular: 'task', group: 'ADMINISTRATION', icon: Activity,
    description: 'Track actionable work with project link, owner, priority, due date, estimated hours and completion status.',
    workflow: 'Create task → assign owner → start work → record effort/blockers → complete and review. tasks do not create external notifications or enforce staff permissions.',
    dateKey: 'dueDate',
    fields: [text('taskCode', 'Task reference'), text('title', 'Task title'), text('project', 'Project / workstream'), text('assignedTo', 'Assigned to'), select('priority', 'Priority', ['Low', 'Normal', 'High', 'Urgent']), date('startDate', 'Start date'), date('dueDate', 'Due date'), amount('estimatedHours', 'Estimated hours'), amount('actualHours', 'Actual hours'), { key: 'blocker', label: 'Blocker / notes', kind: 'textarea', fullWidth: true, required: false }, status(['Open', 'In progress', 'Blocked', 'Done', 'Cancelled'])],
    columns: [{ key: 'taskCode', label: 'TASK' }, { key: 'title', label: 'TASK TITLE' }, { key: 'assignedTo', label: 'OWNER' }, { key: 'priority', label: 'PRIORITY' }, { key: 'dueDate', label: 'DUE DATE', kind: 'date' }, { key: 'estimatedHours', label: 'EST. HOURS', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'support', title: 'Customer support cases', singular: 'support case', group: 'ADMINISTRATION', icon: HandCoins,
    description: 'Track customer issues, channels, priority, owner, response deadline and resolution without losing the conversation reference.',
    workflow: 'Open case → triage → assign → investigate → resolve → close or reopen. No email/SMS or external help-desk synchronization is connected until the responsible workflow is confirmed.',
    dateKey: 'createdDate',
    fields: [text('ticketNumber', 'Ticket reference'), date('createdDate', 'Created date'), text('customer', 'Customer'), text('contact', 'Contact / phone', false), select('channel', 'Channel', ['Phone', 'Email', 'In person', 'Website', 'WhatsApp (recorded)', 'Other']), select('category', 'Category', ['Order status', 'Product quality', 'Delivery', 'Billing', 'Returns', 'Account access', 'Other']), select('priority', 'Priority', ['Low', 'Normal', 'High', 'Urgent']), text('subject', 'Issue summary'), { key: 'description', label: 'Issue details', kind: 'textarea', fullWidth: true }, text('assignedTo', 'Assigned to'), date('responseDue', 'Response due date'), { key: 'resolution', label: 'Resolution notes', kind: 'textarea', fullWidth: true, required: false }, status(['New', 'Triaged', 'In progress', 'Waiting on customer', 'Resolved', 'Closed', 'Reopened'])],
    columns: [{ key: 'ticketNumber', label: 'TICKET' }, { key: 'createdDate', label: 'CREATED', kind: 'date' }, { key: 'customer', label: 'CUSTOMER' }, { key: 'subject', label: 'ISSUE' }, { key: 'priority', label: 'PRIORITY' }, { key: 'assignedTo', label: 'OWNER' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'work-orders', title: 'Production & assembly orders', singular: 'work order', group: 'INVENTORY', icon: ShoppingCart,
    description: 'planned production or kit assembly, target quantities, progress, dates and estimated material cost.',
    workflow: 'Plan order → confirm materials and recipe/BOM → release → record production and scrap → quality inspect → receive finished goods. This page does not consume components or create finished stock.',
    dateKey: 'targetDate', amountKey: 'plannedCost',
    fields: [text('workOrderNumber', 'Work-order reference'), text('productCode', 'Finished product / assembly SKU'), text('productName', 'Finished product / assembly'), text('branch', 'Production branch / location'), date('startDate', 'Start date'), date('targetDate', 'Target completion date'), amount('plannedQuantity', 'Planned output quantity'), amount('completedQuantity', 'Completed output quantity'), amount('unitCost', 'Estimated cost per unit'), status(['Draft', 'Planned', 'In progress', 'Quality check', 'Completed', 'On hold', 'Cancelled'])],
    columns: [{ key: 'workOrderNumber', label: 'WORK ORDER' }, { key: 'productCode', label: 'OUTPUT SKU' }, { key: 'productName', label: 'OUTPUT' }, { key: 'targetDate', label: 'TARGET DATE', kind: 'date' }, { key: 'plannedQuantity', label: 'PLANNED', kind: 'number' }, { key: 'completionPercent', label: 'PROGRESS (%)', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'quality', title: 'Quality inspections', singular: 'quality inspection', group: 'INVENTORY', icon: PackageCheck,
    description: 'Capture acceptance checks for received goods, production output or customer returns, including inspected, accepted and rejected quantities.',
    workflow: 'Open inspection → identify source and item → count samples/units → record defects → accept, reject or request rework. Accepted quantities do not post to stock until the responsible workflow is confirmed.',
    dateKey: 'inspectionDate',
    fields: [text('inspectionNumber', 'Inspection reference'), select('sourceType', 'Inspection source', ['Goods receipt', 'Production order', 'Customer return', 'Supplier return']), text('sourceReference', 'Source reference'), text('item', 'Product / SKU'), date('inspectionDate', 'Inspection date'), text('inspector', 'Inspector'), amount('inspectedQuantity', 'Quantity inspected'), amount('acceptedQuantity', 'Quantity accepted'), amount('rejectedQuantity', 'Quantity rejected'), select('defectType', 'Defect classification', ['None identified', 'Packaging damage', 'Wrong specification', 'Expiry / shelf-life', 'Functionality', 'Contamination risk', 'Other']), { key: 'notes', label: 'Findings / corrective action', kind: 'textarea', fullWidth: true, required: false }, status(['Draft', 'Inspection', 'Accepted', 'Rejected', 'Needs rework'])],
    columns: [{ key: 'inspectionNumber', label: 'INSPECTION' }, { key: 'sourceType', label: 'SOURCE TYPE' }, { key: 'sourceReference', label: 'SOURCE REF.' }, { key: 'item', label: 'ITEM' }, { key: 'inspectionDate', label: 'DATE', kind: 'date' }, { key: 'rejectedQuantity', label: 'REJECTED', kind: 'number' }, { key: 'status', label: 'RESULT', kind: 'status' }],
    initial: [],
  },
  {
    id: 'batches', title: 'Batch, serial & expiry tracking', singular: 'tracked lot', group: 'INVENTORY', icon: PackageCheck,
    description: 'Trace lot/batch or serial identifiers by product, supplier, warehouse, received quantity and expiry date.',
    workflow: 'Record receipt lot/serial → set storage location and expiry → quarantine/release as required → trace consumption, return or recall. Update stock balances through the confirmed stock-movement workflow.',
    dateKey: 'receivedDate',
    fields: [text('trackingReference', 'Batch / serial reference'), select('trackingType', 'Tracking type', ['Batch / lot', 'Serial number', 'Expiry lot']), text('productSKU', 'Product SKU'), text('productName', 'Product name'), text('supplier', 'Supplier'), text('warehouse', 'Warehouse / bin'), date('receivedDate', 'Received date'), date('expiryDate', 'Expiry date', false), amount('receivedQuantity', 'Received quantity'), amount('availableQuantity', 'Available quantity'), text('supplierLot', 'Supplier lot / certificate', false), status(['In stock', 'Quarantined', 'Expired', 'Recalled', 'Depleted'])],
    columns: [{ key: 'trackingReference', label: 'BATCH / SERIAL' }, { key: 'productSKU', label: 'SKU' }, { key: 'productName', label: 'PRODUCT' }, { key: 'warehouse', label: 'LOCATION' }, { key: 'expiryDate', label: 'EXPIRY', kind: 'date' }, { key: 'availableQuantity', label: 'AVAILABLE', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'leads', title: 'Leads & prospect tracking', singular: 'lead', group: 'CRM', icon: Users,
    description: 'Capture prospects, source, contacts, owner, estimated value and the next action before qualification.',
    workflow: 'Capture → contact → qualify → create an opportunity or mark lost. Email campaigns, lead scoring and external CRM connections must be configured before use.',
    dateKey: 'createdDate', amountKey: 'estimatedValue',
    fields: [text('leadCode', 'Lead reference'), text('company', 'Company / prospect'), text('contactName', 'Contact person'), { ...text('email', 'Email address', false), kind: 'email' }, { ...text('phone', 'Phone number', false), kind: 'tel' }, select('source', 'Lead source', ['Referral', 'Website', 'Walk-in', 'Campaign', 'Partner', 'Social media', 'Other']), text('owner', 'Lead owner'), date('createdDate', 'Created date'), date('expectedCloseDate', 'Expected close date', false), amount('estimatedValue', 'Estimated deal value'), amount('probability', 'Qualification probability (%)'), text('nextAction', 'Next action'), status(['New', 'Contacted', 'Qualified', 'Converted', 'Lost'])],
    columns: [{ key: 'leadCode', label: 'LEAD' }, { key: 'company', label: 'PROSPECT' }, { key: 'contactName', label: 'CONTACT' }, { key: 'source', label: 'SOURCE' }, { key: 'createdDate', label: 'CREATED', kind: 'date' }, { key: 'estimatedValue', label: 'EST. VALUE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'cash-sessions', title: 'POS sessions & cash-up', singular: 'POS cash session', group: 'SELLING', icon: Banknote,
    description: 'Reconcile an operator’s opening float, cash sales, cash refunds, cash drops and counted drawer balance at shift close.',
    workflow: 'Open session → record sales/refunds/drops → count the drawer → investigate over/short variance → review and close. Reconcile the session against the authoritative checkout and cash ledgers before closing.',
    dateKey: 'sessionDate', amountKey: 'expectedCash',
    fields: [text('sessionNumber', 'Session reference'), text('terminal', 'Terminal / till'), date('sessionDate', 'Business date'), text('openedBy', 'Opened by'), amount('openingFloat', 'Opening float'), amount('cashSales', 'Cash sales recorded'), amount('cashRefunds', 'Cash refunds recorded'), amount('cashDrops', 'Cash drops / safe deposits'), amount('countedCash', 'Counted cash at close'), text('closedBy', 'Counted / closed by', false), { key: 'closingNotes', label: 'Variance explanation / notes', kind: 'textarea', fullWidth: true, required: false }, status(['Open', 'Count entered', 'Variance review', 'Reviewed', 'Closed'])],
    columns: [{ key: 'sessionNumber', label: 'SESSION' }, { key: 'terminal', label: 'TERMINAL' }, { key: 'sessionDate', label: 'BUSINESS DATE', kind: 'date' }, { key: 'openingFloat', label: 'OPENING FLOAT', kind: 'money' }, { key: 'expectedCash', label: 'EXPECTED CASH', kind: 'money' }, { key: 'countedCash', label: 'COUNTED CASH', kind: 'money' }, { key: 'variance', label: 'OVER / SHORT', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'boms', title: 'Bills of materials / recipes', singular: 'bill of materials', group: 'MANUFACTURING', icon: ClipboardList,
    description: 'Define a finished product, planned output, component summary, version and estimated material cost for simple assembly or production.',
    workflow: 'Draft BOM → review component requirements → activate version → plan work order → issue materials → record output and quality. Stock is consumed only when the related issue and output movements are posted.',
    dateKey: 'effectiveFrom', amountKey: 'estimatedMaterialCost',
    fields: [text('bomCode', 'BOM reference'), text('finishedProductSKU', 'Finished product SKU'), text('finishedProductName', 'Finished product name'), text('version', 'BOM version'), amount('outputQuantity', 'Output quantity per run'), { key: 'componentSummary', label: 'Components and quantities', kind: 'textarea', fullWidth: true, required: true, placeholder: 'Example: Body × 1; screws × 4; packaging × 1' }, amount('unitMaterialCost', 'Estimated material cost per output unit'), date('effectiveFrom', 'Effective from'), date('effectiveTo', 'Effective until', false), status(['Draft', 'Review', 'Active', 'Superseded', 'Archived'])],
    columns: [{ key: 'bomCode', label: 'BOM' }, { key: 'finishedProductSKU', label: 'FINISHED SKU' }, { key: 'finishedProductName', label: 'FINISHED PRODUCT' }, { key: 'version', label: 'VERSION' }, { key: 'outputQuantity', label: 'OUTPUT QTY', kind: 'number' }, { key: 'estimatedMaterialCost', label: 'RUN COST ESTIMATE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'job-cards', title: 'Production job cards', singular: 'job card', group: 'MANUFACTURING', icon: ClipboardList,
    description: 'Track the operation, workstation, assigned operator, planned and actual hours, and completion state for a production work order.',
    workflow: 'Work order → job card by operation → record labour/time → record output → inspection. These time figures do not post payroll or consume inventory.',
    dateKey: 'startDate', amountKey: 'hoursVariance',
    fields: [text('jobCardNumber', 'Job-card reference'), text('workOrderNumber', 'Work-order reference'), text('operation', 'Operation / step'), text('workstation', 'Workstation / equipment'), text('operator', 'Assigned operator'), amount('plannedHours', 'Planned hours'), amount('actualHours', 'Actual hours recorded'), date('startDate', 'Planned / actual start date'), date('endDate', 'Completion date', false), text('outputReference', 'Output / scrap note', false), status(['Draft', 'Ready', 'In progress', 'Paused', 'Completed', 'Needs review'])],
    columns: [{ key: 'jobCardNumber', label: 'JOB CARD' }, { key: 'workOrderNumber', label: 'WORK ORDER' }, { key: 'operation', label: 'OPERATION' }, { key: 'workstation', label: 'WORKSTATION' }, { key: 'operator', label: 'OPERATOR' }, { key: 'plannedHours', label: 'PLANNED HRS', kind: 'number' }, { key: 'actualHours', label: 'ACTUAL HRS', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'leave', title: 'Leave requests', singular: 'leave request', group: 'PEOPLE & PAYROLL', icon: Clock3,
    description: 'Capture staff leave dates, leave type, requested days, approver and approval state before HR and payroll integration.',
    workflow: 'Employee request → manager review → approve/reject → adjust attendance/payroll according to policy. Requested days in this screen are calendar-day estimates and are not deducted from a leave balance.',
    dateKey: 'startDate',
    fields: [text('leaveRequestNumber', 'Leave request reference'), text('employee', 'Employee'), select('leaveType', 'Leave type', ['Annual', 'Sick', 'Maternity / paternity', 'Compassionate', 'Unpaid', 'Study', 'Other']), date('startDate', 'Start date'), date('endDate', 'End date'), amount('daysRequested', 'Requested calendar days'), text('reason', 'Reason / handover note', false), text('approver', 'Approver', false), status(['Requested', 'Approved', 'Rejected', 'Cancelled', 'Taken'])],
    columns: [{ key: 'leaveRequestNumber', label: 'REQUEST' }, { key: 'employee', label: 'EMPLOYEE' }, { key: 'leaveType', label: 'TYPE' }, { key: 'startDate', label: 'START', kind: 'date' }, { key: 'endDate', label: 'END', kind: 'date' }, { key: 'daysRequested', label: 'CALENDAR DAYS', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'replenishment', title: 'Reorder planning', singular: 'replenishment rule', group: 'INVENTORY', icon: ArrowLeftRight,
    description: 'Estimate replenishment quantity from on-hand stock, reorder point, average demand, supplier lead time and safety stock.',
    workflow: 'Review demand and current stock → calculate recommended quantity → prepare purchase order → receive and reconcile stock. Recommendation is a planning estimate, not an automatic purchase.',
    dateKey: 'reviewDate',
    fields: [text('replenishmentNumber', 'Planning reference'), text('productSKU', 'Product SKU'), text('productName', 'Product'), text('warehouse', 'Warehouse / branch'), date('reviewDate', 'Review date'), amount('onHand', 'On-hand quantity'), amount('reorderPoint', 'Reorder point'), amount('averageDailyDemand', 'Average daily demand'), amount('leadTimeDays', 'Supplier lead time (days)'), amount('safetyStock', 'Safety stock quantity'), text('preferredSupplier', 'Preferred supplier', false), status(['Review needed', 'Reviewed', 'Draft PO created', 'Ordered', 'On hold'])],
    columns: [{ key: 'replenishmentNumber', label: 'PLAN' }, { key: 'productSKU', label: 'SKU' }, { key: 'productName', label: 'PRODUCT' }, { key: 'warehouse', label: 'LOCATION' }, { key: 'onHand', label: 'ON HAND', kind: 'number' }, { key: 'recommendedQuantity', label: 'RECOMMENDED QTY', kind: 'number' }, { key: 'needByDate', label: 'EST. NEED BY', kind: 'date' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'packages', title: 'Packages & packing slips', singular: 'package record', group: 'LOGISTICS', icon: PackageCheck,
    description: 'Prepare package references, customer, sales order, packed items, cartons, weight, courier and tracking before dispatch.',
    workflow: 'Confirmed sales order → create one or more packages → ship/track → confirm delivery. Packages and deliveries are separate records; neither fulfils stock or sends carrier requests.',
    dateKey: 'packageDate',
    fields: [text('packageNumber', 'Package reference'), text('salesOrder', 'Sales order reference'), text('customer', 'Customer'), date('packageDate', 'Package date'), text('itemSummary', 'Packed items / quantities'), amount('packageCount', 'Number of packages'), amount('weightKg', 'Total weight (kg)'), text('courier', 'Courier / own fleet', false), text('trackingReference', 'Tracking reference', false), status(['Not shipped', 'Shipped', 'Delivered', 'Exception'])],
    columns: [{ key: 'packageNumber', label: 'PACKAGE' }, { key: 'salesOrder', label: 'SALES ORDER' }, { key: 'customer', label: 'CUSTOMER' }, { key: 'packageDate', label: 'PACKED', kind: 'date' }, { key: 'packageCount', label: 'PACKAGES', kind: 'number' }, { key: 'courier', label: 'COURIER' }, { key: 'trackingReference', label: 'TRACKING' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'contacts', title: 'Contacts & addresses', singular: 'contact', group: 'CRM', icon: Users,
    description: 'Keep reusable people, communication preferences and follow-up dates linked to a customer, supplier, lead or employee.',
    workflow: 'Party → contact / address → quotation, order, invoice or case. Keep a person as a contact instead of creating a duplicate customer record for every employee or location.',
    dateKey: 'nextFollowUp',
    fields: [text('contactCode', 'Contact reference'), select('partyType', 'Linked party type', ['Customer', 'Supplier', 'Lead', 'Employee', 'Other']), text('partyName', 'Linked party / organization'), text('contactName', 'Contact full name'), text('jobTitle', 'Job title', false), { ...text('email', 'Email address', false), kind: 'email' }, { ...text('phone', 'Phone number', false), kind: 'tel' }, select('preferredChannel', 'Preferred contact method', ['Phone', 'Email', 'WhatsApp', 'In person', 'Other'], false), date('nextFollowUp', 'Next follow-up date', false), { key: 'notes', label: 'Notes', kind: 'textarea', fullWidth: true, required: false }, status(['Active', 'Inactive'])],
    columns: [{ key: 'contactCode', label: 'CONTACT' }, { key: 'contactName', label: 'NAME' }, { key: 'partyName', label: 'PARTY' }, { key: 'partyType', label: 'TYPE' }, { key: 'phone', label: 'PHONE' }, { key: 'nextFollowUp', label: 'FOLLOW-UP', kind: 'date' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'campaigns', title: 'Campaigns & acquisition', singular: 'campaign', group: 'CRM', icon: Target,
    description: 'Track lead-generation campaign channels, owner, period, spend and sourced lead / opportunity counts.',
    workflow: 'Plan campaign → record campaign activity in CRM → compare spend and sourced pipeline. Attribution must be recorded consistently; sending email or advertising requires the relevant connected service.',
    dateKey: 'startDate', amountKey: 'actualSpend',
    fields: [text('campaignCode', 'Campaign reference'), text('name', 'Campaign name'), select('channel', 'Channel', ['Referral', 'In-store', 'Field sales', 'Email', 'Social', 'Website', 'Event', 'Partner', 'Other']), text('owner', 'Campaign owner'), date('startDate', 'Start date'), date('endDate', 'End date'), amount('budget', 'Budget'), amount('actualSpend', 'Actual spend'), amount('leadsGenerated', 'Leads generated'), amount('opportunitiesCreated', 'Opportunities created'), status(['Draft', 'Planned', 'Active', 'Completed', 'Cancelled'])],
    columns: [{ key: 'campaignCode', label: 'CAMPAIGN' }, { key: 'name', label: 'NAME' }, { key: 'channel', label: 'CHANNEL' }, { key: 'startDate', label: 'START', kind: 'date' }, { key: 'budget', label: 'BUDGET', kind: 'money' }, { key: 'actualSpend', label: 'SPEND', kind: 'money' }, { key: 'leadsGenerated', label: 'LEADS', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'sales-teams', title: 'Sales team & territories', singular: 'sales performance record', group: 'CRM', icon: Users,
    description: 'Review salesperson ownership, territory, target, achieved sales and an indicative commission estimate.',
    workflow: 'Assign account / territory → record sales activity → review target achievement. Commission is illustrative only and does not create payroll or a payment.',
    dateKey: 'periodEnd',
    fields: [text('salespersonCode', 'Salesperson reference'), text('salesperson', 'Salesperson name'), text('territory', 'Territory / area'), { ...text('email', 'Work email', false), kind: 'email' }, date('periodEnd', 'Target period end'), amount('salesTarget', 'Sales target'), amount('salesAchieved', 'Achieved sales value'), amount('commissionRate', 'Indicative commission (%)'), status(['Active', 'On leave', 'Inactive'])],
    columns: [{ key: 'salespersonCode', label: 'CODE' }, { key: 'salesperson', label: 'SALESPERSON' }, { key: 'territory', label: 'TERRITORY' }, { key: 'salesTarget', label: 'TARGET', kind: 'money' }, { key: 'salesAchieved', label: 'ACHIEVED', kind: 'money' }, { key: 'achievementPercent', label: 'ACHIEVEMENT', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'item-bundles', title: 'Item bundles & composite items', singular: 'item bundle', group: 'INVENTORY', icon: Boxes,
    description: 'Define a sellable bundle with a component summary, expected component count, unit cost and bundle price.',
    workflow: 'Define the bundle → validate components and quantity rules → use it in a sale or production plan. Component stock deduction is not connected in this interface.',
    amountKey: 'sellingPrice',
    fields: [text('bundleCode', 'Bundle reference'), text('bundleName', 'Bundle name'), text('sku', 'Bundle SKU'), { key: 'componentsSummary', label: 'Component items and quantities', kind: 'textarea', required: true, fullWidth: true, help: 'summary only; this is not yet a structured component-line editor.' }, amount('componentCount', 'Number of component lines'), amount('unitCost', 'Estimated component cost per bundle'), amount('sellingPrice', 'Selling price per bundle'), status(['Draft', 'Review', 'Active', 'Inactive'])],
    columns: [{ key: 'bundleCode', label: 'BUNDLE' }, { key: 'bundleName', label: 'NAME' }, { key: 'sku', label: 'SKU' }, { key: 'componentCount', label: 'COMPONENT LINES', kind: 'number' }, { key: 'unitCost', label: 'COST ESTIMATE', kind: 'money' }, { key: 'sellingPrice', label: 'SELLING PRICE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'picklists', title: 'Warehouse picklists', singular: 'picklist', group: 'LOGISTICS', icon: PackageCheck,
    description: 'Assign picking work from a confirmed order, measure requested versus picked units, and record short picks before packing.',
    workflow: 'Confirmed order → picklist assigned → pick and verify → report short picks → create package → dispatch. Update stock balances through the confirmed warehouse movement workflow.',
    dateKey: 'pickDate',
    fields: [text('picklistNumber', 'Picklist reference'), text('salesOrder', 'Sales order reference'), text('warehouse', 'Warehouse'), text('picker', 'Assigned picker'), date('pickDate', 'Pick date'), amount('lineCount', 'Distinct item lines'), amount('unitsToPick', 'Units to pick'), amount('unitsPicked', 'Units picked'), status(['Draft', 'Assigned', 'Picking', 'Picked', 'Partially picked', 'Short pick', 'Cancelled'])],
    columns: [{ key: 'picklistNumber', label: 'PICKLIST' }, { key: 'salesOrder', label: 'ORDER' }, { key: 'warehouse', label: 'WAREHOUSE' }, { key: 'picker', label: 'PICKER' }, { key: 'unitsToPick', label: 'REQUESTED', kind: 'number' }, { key: 'unitsPicked', label: 'PICKED', kind: 'number' }, { key: 'pickPercent', label: 'PICKED %', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'cost-centers', title: 'Cost centres', singular: 'cost centre', group: 'FINANCE', icon: BookOpen,
    description: 'Structure departments, branches or projects so later posted costs can be attributed and compared.',
    workflow: 'Create a cost-centre hierarchy → assign transactions and budgets → review actual and committed amounts. Post ledger allocations through the approved accounting workflow.',
    fields: [text('costCenterCode', 'Cost-centre code'), text('name', 'Cost-centre name'), text('parentCostCenter', 'Parent cost centre', false), text('department', 'Department / function'), text('manager', 'Responsible manager'), status(['Active', 'Inactive'])],
    columns: [{ key: 'costCenterCode', label: 'CODE' }, { key: 'name', label: 'COST CENTRE' }, { key: 'parentCostCenter', label: 'PARENT' }, { key: 'department', label: 'DEPARTMENT' }, { key: 'manager', label: 'MANAGER' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'budgets', title: 'Budgets & forecasts', singular: 'budget line', group: 'FINANCE', icon: Wallet,
    description: 'Compare approved budget, actual and committed spend and a forecast for a defined period and cost centre.',
    workflow: 'Draft budget → review → approve → compare actual / committed / forecast amounts. This view is a planning control, not a general-ledger report.',
    dateKey: 'periodStart', amountKey: 'budgetAmount',
    fields: [text('budgetCode', 'Budget reference'), text('fiscalYear', 'Fiscal year'), date('periodStart', 'Period start'), date('periodEnd', 'Period end'), text('costCenter', 'Cost centre'), text('accountCategory', 'Account / category'), amount('budgetAmount', 'Approved budget'), amount('actualAmount', 'Actual spend'), amount('committedAmount', 'Committed spend'), amount('forecastAmount', 'Forecast spend'), status(['Draft', 'Review', 'Approved', 'Closed'])],
    columns: [{ key: 'budgetCode', label: 'BUDGET' }, { key: 'fiscalYear', label: 'YEAR' }, { key: 'costCenter', label: 'COST CENTRE' }, { key: 'accountCategory', label: 'CATEGORY' }, { key: 'budgetAmount', label: 'BUDGET', kind: 'money' }, { key: 'actualAmount', label: 'ACTUAL', kind: 'money' }, { key: 'variance', label: 'VARIANCE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'integrations', title: 'Integration status', singular: 'integration status record', group: 'INTEGRATION & CONTROL', icon: Plug,
    description: 'Catalogue future connections and their test state without entering credentials or implying a live connection exists.',
    workflow: 'Select provider → configure secrets securely in backend / deployment settings → run test connection → inspect logs → enable. This page is a status checklist only; it never stores tokens or secrets.',
    dateKey: 'lastCheckedAt',
    fields: [text('integrationCode', 'Integration reference'), select('provider', 'Provider / system', ['Existing LEXA API', 'Neon database API', 'Supabase authentication', 'Render service', 'Vercel deployment', 'URA / EFRIS', 'Mobile money', 'Bank feed', 'Carrier / delivery', 'Email / notifications', 'Other']), text('purpose', 'Purpose'), select('environment', 'Environment', ['Development', 'Staging', 'Production']), date('lastCheckedAt', 'Last checked date', false), amount('recordsProcessed', 'Records processed in last test'), select('status', 'Connection status', ['Not connected', 'Configuration needed', 'Ready for test', 'Test passed', 'Error', 'Paused']), text('lastResult', 'Last test result', false), { key: 'lastError', label: 'Last error / missing configuration', kind: 'textarea', fullWidth: true, required: false }],
    columns: [{ key: 'integrationCode', label: 'REFERENCE' }, { key: 'provider', label: 'PROVIDER' }, { key: 'purpose', label: 'PURPOSE' }, { key: 'environment', label: 'ENVIRONMENT' }, { key: 'lastCheckedAt', label: 'LAST CHECK', kind: 'date' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'recurring-invoices', title: 'Recurring billing schedules', singular: 'recurring invoice schedule', group: 'SELLING', icon: ReceiptText,
    description: 'Prepare repeating customer invoice schedules with frequency, start / next-run dates, rate and tax estimate.',
    workflow: 'Draft schedule → review billing frequency and customer consent → activate the connected billing scheduler → review the generated invoice. Saving this record alone does not schedule jobs or create invoices.',
    dateKey: 'nextRunDate', amountKey: 'total',
    fields: [text('scheduleCode', 'Schedule reference'), text('customer', 'Customer'), text('description', 'Invoice description'), select('frequency', 'Frequency', ['Weekly', 'Monthly', 'Quarterly', 'Yearly']), date('startDate', 'Start date'), date('nextRunDate', 'Next run date'), date('endDate', 'End date', false), amount('quantity', 'Quantity'), amount('unitPrice', 'Unit price before tax'), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)'), status(['Draft', 'Review', 'Active', 'Paused', 'Ended'])],
    columns: [{ key: 'scheduleCode', label: 'SCHEDULE' }, { key: 'customer', label: 'CUSTOMER' }, { key: 'frequency', label: 'FREQUENCY' }, { key: 'nextRunDate', label: 'NEXT RUN', kind: 'date' }, { key: 'total', label: 'INVOICE ESTIMATE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
  {
    id: 'timesheets', title: 'Timesheets & billable time', singular: 'timesheet entry', group: 'PEOPLE & PAYROLL', icon: Activity,
    description: 'Record project/task time, employee, work date, billable hours and an estimated amount for project-cost review.',
    workflow: 'Enter time → submit for manager review → approve → use for project cost or customer billing. Payroll, project costs and invoices must be posted through their approved workflows.',
    dateKey: 'workDate', amountKey: 'billableAmount',
    fields: [text('timesheetNumber', 'Timesheet reference'), text('employee', 'Employee'), text('project', 'Project / cost centre'), text('task', 'Task / activity'), date('workDate', 'Work date'), amount('hours', 'Total hours'), amount('billableHours', 'Billable hours'), amount('hourlyRate', 'Reference hourly rate'), { key: 'notes', label: 'Work description', kind: 'textarea', fullWidth: true, required: false }, status(['Draft', 'Submitted', 'Approved', 'Rejected', 'Invoiced'])],
    columns: [{ key: 'timesheetNumber', label: 'ENTRY' }, { key: 'employee', label: 'EMPLOYEE' }, { key: 'project', label: 'PROJECT' }, { key: 'workDate', label: 'WORK DATE', kind: 'date' }, { key: 'hours', label: 'HOURS', kind: 'number' }, { key: 'billableHours', label: 'BILLABLE', kind: 'number' }, { key: 'billableAmount', label: 'BILLABLE ESTIMATE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: [],
  },
];

export const REPORT_MODULE = {
  id: 'reports', title: 'Reports & analytics', group: 'INSIGHTS', icon: BarChart3,
  description: 'Reports for sales, stock, purchasing, receivables, payables, expenses and financial summaries.',
};

export const EXISTING_MODULE_LINKS = [
  { to: '/', title: 'Dashboard', description: 'Sales, receipts, stock-on-hand and low-stock alerts.', group: 'WORKSPACE', icon: Activity, state: 'Existing workflow' },
  { to: '/workspace', title: 'Business & branches', description: 'Workspace profile and branch configuration.', group: 'WORKSPACE', icon: Building2, state: 'Existing workflow' },
  { to: '/checkout', title: 'Checkout / POS', description: 'Cart, stock validation, recorded payments and receipt creation.', group: 'SELLING', icon: Banknote, state: 'Existing workflow' },
  { to: '/sales', title: 'Sales & returns', description: 'Sale history, receipt details, payment trail and linked returns.', group: 'SELLING', icon: ReceiptText, state: 'Existing workflow' },
  { to: '/products', title: 'Products', description: 'Product catalogue, prices, categories and stock thresholds.', group: 'INVENTORY', icon: ClipboardList, state: 'Existing workflow' },
  { to: '/inventory', title: 'Inventory', description: 'Stock balances, adjustments and movement ledger.', group: 'INVENTORY', icon: PackageCheck, state: 'Existing workflow' },
  { to: '/settings', title: 'Settings', description: 'Business workspace preferences, connected services and data settings.', group: 'ADMINISTRATION', icon: Building2, state: 'Existing workflow' },
];

export const PHASE_TWO_LINKS = [
  ...MODULE_CATALOG.map((module) => ({ to: '/modules/' + module.id, title: module.title, description: module.description, group: module.group, icon: module.icon, state: module.readOnly ? 'Read-only' : 'Available' })),
  { to: '/modules/reports', title: REPORT_MODULE.title, description: REPORT_MODULE.description, group: 'INSIGHTS', icon: REPORT_MODULE.icon, state: 'Available' },
];

export function getModuleDefinition(id: string | undefined): ModuleDefinition | undefined {
  return MODULE_CATALOG.find((module) => module.id === id);
}
