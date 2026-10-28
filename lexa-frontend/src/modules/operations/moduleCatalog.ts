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

function seed(prefix: string, rows: Array<Record<string, string>>): PreviewRecord[] {
  return rows.map((row, index) => ({
    id: prefix + '-' + String(index + 1).padStart(3, '0'),
    updatedAt: '2026-10-28T08:00:00.000Z',
    status: row.status ?? 'Draft',
    ...row,
  }));
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
    workflow: 'Customer → quotation or sale → invoice / receipt → payment allocation → customer statement. Balance figures here are frontend-preview data until the API is connected.',
    amountKey: 'outstandingBalance',
    fields: [text('customerCode', 'Customer code'), text('name', 'Customer / business name'), select('customerType', 'Customer type', ['Company', 'Individual', 'Government / institution']), { ...text('phone', 'Phone number'), kind: 'tel' }, { ...text('email', 'Email address', false), kind: 'email' }, text('tin', 'TIN / tax reference', false), { key: 'billingAddress', label: 'Billing address', kind: 'textarea', fullWidth: true, required: false }, amount('creditLimit', 'Credit limit (major currency units)'), amount('openingBalance', 'Opening balance / amount owed'), select('paymentTerms', 'Payment terms', ['Immediate', '7 days', '14 days', '30 days', '60 days']), status(['Active', 'On hold', 'Inactive'])],
    columns: [{ key: 'customerCode', label: 'CODE' }, { key: 'name', label: 'CUSTOMER' }, { key: 'phone', label: 'PHONE' }, { key: 'outstandingBalance', label: 'OUTSTANDING', kind: 'money' }, { key: 'creditLimit', label: 'CREDIT LIMIT', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('CUS', [
      { customerCode: 'CUS-0001', name: 'Kampala Retail Mart', customerType: 'Company', phone: '+256 700 000 101', email: 'accounts@example.test', tin: '1000000000', billingAddress: 'Kampala, Uganda', creditLimit: '2500000', openingBalance: '540000', outstandingBalance: '540000', paymentTerms: '30 days', lastActivity: '2026-10-27', status: 'Active' },
      { customerCode: 'CUS-0002', name: 'Nakasero Foods', customerType: 'Company', phone: '+256 700 000 102', email: '', tin: '', billingAddress: 'Central Division', creditLimit: '1500000', openingBalance: '0', outstandingBalance: '0', paymentTerms: '14 days', lastActivity: '2026-10-24', status: 'Active' },
      { customerCode: 'CUS-0003', name: 'Walk-in corporate buyer', customerType: 'Company', phone: '+256 700 000 103', email: '', tin: '', billingAddress: 'Kampala', creditLimit: '0', openingBalance: '185000', outstandingBalance: '185000', paymentTerms: 'Immediate', lastActivity: '2026-10-22', status: 'On hold' },
    ]),
  },
  {
    id: 'suppliers', title: 'Suppliers', singular: 'supplier', group: 'PROCUREMENT', icon: Truck,
    description: 'Maintain supplier contact details, tax references, payment terms and opening payable balances.',
    workflow: 'Supplier → purchase order → goods received → supplier invoice → payment → supplier statement. The preview form does not post payables.',
    amountKey: 'outstandingPayable',
    fields: [text('supplierCode', 'Supplier code'), text('name', 'Supplier / business name'), { ...text('phone', 'Phone number'), kind: 'tel' }, { ...text('email', 'Email address', false), kind: 'email' }, text('tin', 'TIN / tax reference', false), { key: 'address', label: 'Address', kind: 'textarea', required: false, fullWidth: true }, select('paymentTerms', 'Payment terms', ['Cash on delivery', '7 days', '14 days', '30 days', '60 days']), amount('openingPayable', 'Opening payable balance'), status(['Active', 'On hold', 'Inactive'])],
    columns: [{ key: 'supplierCode', label: 'CODE' }, { key: 'name', label: 'SUPPLIER' }, { key: 'phone', label: 'PHONE' }, { key: 'paymentTerms', label: 'TERMS' }, { key: 'outstandingPayable', label: 'PAYABLE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('SUP', [
      { supplierCode: 'SUP-0001', name: 'East Africa Wholesale Ltd', phone: '+256 700 000 201', email: 'sales@example.test', tin: '2000000000', address: 'Industrial Area, Kampala', paymentTerms: '30 days', openingPayable: '1280000', outstandingPayable: '1280000', status: 'Active' },
      { supplierCode: 'SUP-0002', name: 'Fresh Supply Co.', phone: '+256 700 000 202', email: '', tin: '', address: 'Nakawa, Kampala', paymentTerms: '7 days', openingPayable: '420000', outstandingPayable: '420000', status: 'Active' },
      { supplierCode: 'SUP-0003', name: 'Office Essentials', phone: '+256 700 000 203', email: '', tin: '', address: 'Kampala', paymentTerms: 'Cash on delivery', openingPayable: '0', outstandingPayable: '0', status: 'On hold' },
    ]),
  },
  {
    id: 'sales-orders', title: 'Sales orders', singular: 'sales order', group: 'SELLING', icon: ShoppingCart,
    description: 'Capture a customer commitment, promised delivery date, line estimate, discounts and taxes before fulfilment or invoicing.',
    workflow: 'Draft → confirm order → fulfil/dispatch → issue invoice → allocate receipts. An order in this preview does not reserve stock, create a tax invoice or post revenue.',
    dateKey: 'orderDate', amountKey: 'total',
    fields: [text('orderNumber', 'Sales order number'), text('customer', 'Customer'), date('orderDate', 'Order date'), date('expectedDate', 'Expected delivery date'), text('itemSummary', 'Item / service description'), amount('quantity', 'Quantity'), amount('unitPrice', 'Unit selling price before tax'), amount('discountPercent', 'Discount (%)'), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)'), status(['Draft', 'Confirmed', 'Partially fulfilled', 'Fulfilled', 'Invoiced', 'Cancelled'])],
    columns: [{ key: 'orderNumber', label: 'SALES ORDER' }, { key: 'customer', label: 'CUSTOMER' }, { key: 'orderDate', label: 'ORDER DATE', kind: 'date' }, { key: 'expectedDate', label: 'EXPECTED', kind: 'date' }, { key: 'total', label: 'ESTIMATED TOTAL', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('SO', [
      { orderNumber: 'SO-2026-018', customer: 'Kampala Retail Mart', orderDate: '2026-10-27', expectedDate: '2026-10-30', itemSummary: 'Mixed grocery stock', quantity: '60', unitPrice: '18500', discountPercent: '2', taxRate: '18', subtotal: '1110000', discountAmount: '22200', taxAmount: '195804', total: '1283604', status: 'Confirmed' },
      { orderNumber: 'SO-2026-017', customer: 'Nakasero Foods', orderDate: '2026-10-25', expectedDate: '2026-10-29', itemSummary: 'Packaging supplies', quantity: '30', unitPrice: '12000', discountPercent: '0', taxRate: '18', subtotal: '360000', discountAmount: '0', taxAmount: '64800', total: '424800', status: 'Partially fulfilled' },
    ]),
  },
  {
    id: 'sales-invoices', title: 'Sales invoices', singular: 'sales invoice', group: 'SELLING', icon: ReceiptText,
    description: 'Track invoice references, customer, issue and due dates, billable lines, tax estimate, received amount and remaining amount due.',
    workflow: 'Invoice draft → issue from an approved sales workflow → allocate customer receipt → reconcile → customer statement. Preview records are not statutory invoices and do not post receivables.',
    dateKey: 'issueDate', amountKey: 'total',
    fields: [text('invoiceNumber', 'Invoice number'), text('customer', 'Customer'), text('salesOrderReference', 'Sales order reference', false), date('issueDate', 'Issue date'), date('dueDate', 'Due date'), text('itemSummary', 'Item / service description'), amount('quantity', 'Quantity'), amount('unitPrice', 'Unit price before tax'), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)'), amount('amountReceived', 'Amount received'), status(['Draft', 'Issued', 'Partially paid', 'Paid', 'Overdue', 'Void'])],
    columns: [{ key: 'invoiceNumber', label: 'INVOICE' }, { key: 'customer', label: 'CUSTOMER' }, { key: 'salesOrderReference', label: 'SALES ORDER' }, { key: 'issueDate', label: 'ISSUED', kind: 'date' }, { key: 'dueDate', label: 'DUE DATE', kind: 'date' }, { key: 'total', label: 'TOTAL', kind: 'money' }, { key: 'amountDue', label: 'AMOUNT DUE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('INV', [
      { invoiceNumber: 'INV-2026-104', customer: 'Kampala Retail Mart', salesOrderReference: 'SO-2026-018', issueDate: '2026-10-27', dueDate: '2026-11-26', itemSummary: 'Wholesale grocery order', quantity: '60', unitPrice: '18500', taxRate: '18', amountReceived: '500000', subtotal: '1110000', taxAmount: '199800', total: '1309800', amountDue: '809800', status: 'Partially paid' },
      { invoiceNumber: 'INV-2026-103', customer: 'Nakasero Foods', salesOrderReference: 'SO-2026-017', issueDate: '2026-10-23', dueDate: '2026-11-06', itemSummary: 'Packaging supplies', quantity: '30', unitPrice: '12000', taxRate: '18', amountReceived: '424800', subtotal: '360000', taxAmount: '64800', total: '424800', amountDue: '0', status: 'Paid' },
    ]),
  },
  {
    id: 'quotations', title: 'Quotations', singular: 'quotation', group: 'SELLING', icon: FileText,
    description: 'Prepare an offer with customer, validity dates, quantity, unit price, discounts, taxes and a calculated total.',
    workflow: 'Draft → send to customer → accept / decline → convert to an order or sale. No live email, invoice, or stock posting is triggered in preview mode.',
    dateKey: 'issueDate', amountKey: 'total',
    fields: [text('quoteNumber', 'Quotation number'), text('customer', 'Customer'), date('issueDate', 'Issue date'), date('validUntil', 'Valid until'), text('itemSummary', 'Item / service description'), amount('quantity', 'Quantity'), amount('unitPrice', 'Unit price before tax'), amount('discountPercent', 'Discount (%)', true), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)', true), status(['Draft', 'Sent', 'Accepted', 'Declined', 'Expired'])],
    columns: [{ key: 'quoteNumber', label: 'QUOTE' }, { key: 'customer', label: 'CUSTOMER' }, { key: 'issueDate', label: 'ISSUED', kind: 'date' }, { key: 'validUntil', label: 'VALID UNTIL', kind: 'date' }, { key: 'total', label: 'TOTAL', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('QUO', [
      { quoteNumber: 'QUO-2026-014', customer: 'Kampala Retail Mart', issueDate: '2026-10-27', validUntil: '2026-11-10', itemSummary: 'Mixed grocery stock', quantity: '60', unitPrice: '18500', discountPercent: '2', taxRate: '18', subtotal: '1110000', discountAmount: '22200', taxAmount: '195804', total: '1283604', status: 'Sent' },
      { quoteNumber: 'QUO-2026-013', customer: 'Nakasero Foods', issueDate: '2026-10-24', validUntil: '2026-11-07', itemSummary: 'Packaging materials', quantity: '30', unitPrice: '12000', discountPercent: '0', taxRate: '18', subtotal: '360000', discountAmount: '0', taxAmount: '64800', total: '424800', status: 'Accepted' },
      { quoteNumber: 'QUO-2026-012', customer: 'Office Essentials', issueDate: '2026-10-20', validUntil: '2026-10-30', itemSummary: 'Office supplies', quantity: '12', unitPrice: '42000', discountPercent: '0', taxRate: '0', subtotal: '504000', discountAmount: '0', taxAmount: '0', total: '504000', status: 'Draft' },
    ]),
  },
  {
    id: 'purchases', title: 'Purchase orders', singular: 'purchase order', group: 'PROCUREMENT', icon: ClipboardList,
    description: 'Track a supplier commitment, expected delivery, quantities, rates, taxes, amount paid and remaining commitment.',
    workflow: 'Purchase order records what the business intends to buy. It does not itself increase stock or settle a supplier balance; record a separate goods receipt and payment.',
    dateKey: 'orderDate', amountKey: 'total',
    fields: [text('poNumber', 'Purchase order number'), text('supplier', 'Supplier'), date('orderDate', 'Order date'), date('expectedDate', 'Expected delivery'), text('itemSummary', 'Item / service description'), amount('quantity', 'Quantity ordered'), amount('unitCost', 'Unit cost before tax'), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)'), amount('amountPaid', 'Amount already paid'), status(['Draft', 'Ordered', 'Partially received', 'Received', 'Cancelled'])],
    columns: [{ key: 'poNumber', label: 'PURCHASE ORDER' }, { key: 'supplier', label: 'SUPPLIER' }, { key: 'orderDate', label: 'ORDER DATE', kind: 'date' }, { key: 'expectedDate', label: 'EXPECTED', kind: 'date' }, { key: 'total', label: 'ORDER TOTAL', kind: 'money' }, { key: 'amountDue', label: 'EST. DUE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('PO', [
      { poNumber: 'PO-2026-031', supplier: 'East Africa Wholesale Ltd', orderDate: '2026-10-27', expectedDate: '2026-10-30', itemSummary: 'General merchandise', quantity: '80', unitCost: '14500', taxRate: '18', amountPaid: '0', subtotal: '1160000', taxAmount: '208800', total: '1368800', amountDue: '1368800', status: 'Ordered' },
      { poNumber: 'PO-2026-030', supplier: 'Fresh Supply Co.', orderDate: '2026-10-25', expectedDate: '2026-10-26', itemSummary: 'Fresh packaged goods', quantity: '50', unitCost: '8500', taxRate: '0', amountPaid: '150000', subtotal: '425000', taxAmount: '0', total: '425000', amountDue: '275000', status: 'Partially received' },
      { poNumber: 'PO-2026-029', supplier: 'Office Essentials', orderDate: '2026-10-22', expectedDate: '2026-10-24', itemSummary: 'Paper and stationery', quantity: '20', unitCost: '23000', taxRate: '18', amountPaid: '542800', subtotal: '460000', taxAmount: '82800', total: '542800', amountDue: '0', status: 'Received' },
    ]),
  },
  {
    id: 'purchase-invoices', title: 'Supplier invoices', singular: 'supplier invoice', group: 'PROCUREMENT', icon: ReceiptText,
    description: 'Track supplier bill references, linked purchase order, issue and due dates, item/cost estimate, tax, payments and remaining payable.',
    workflow: 'Link the supplier bill to the related purchase order and receipt when available → approve invoice → allocate supplier payment → reconcile. This preview does not post accounts payable.',
    dateKey: 'billDate', amountKey: 'amountDue',
    fields: [text('billNumber', 'Supplier invoice / bill number'), text('supplier', 'Supplier'), text('purchaseOrder', 'Purchase order reference', false), date('billDate', 'Bill date'), date('dueDate', 'Due date'), text('itemSummary', 'Item / service description'), amount('quantity', 'Quantity billed'), amount('unitCost', 'Unit cost before tax'), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)'), amount('amountPaid', 'Amount paid'), status(['Draft', 'Received', 'Approved', 'Partially paid', 'Paid', 'Overdue', 'Disputed', 'Void'])],
    columns: [{ key: 'billNumber', label: 'SUPPLIER BILL' }, { key: 'supplier', label: 'SUPPLIER' }, { key: 'purchaseOrder', label: 'PURCHASE ORDER' }, { key: 'billDate', label: 'BILL DATE', kind: 'date' }, { key: 'total', label: 'TOTAL', kind: 'money' }, { key: 'amountDue', label: 'AMOUNT DUE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('BILL', [
      { billNumber: 'BILL-2026-058', supplier: 'East Africa Wholesale Ltd', purchaseOrder: 'PO-2026-031', billDate: '2026-10-27', dueDate: '2026-11-26', itemSummary: 'General merchandise', quantity: '80', unitCost: '14500', taxRate: '18', amountPaid: '500000', subtotal: '1160000', taxAmount: '208800', total: '1368800', amountDue: '868800', status: 'Partially paid' },
      { billNumber: 'BILL-2026-057', supplier: 'Fresh Supply Co.', purchaseOrder: 'PO-2026-030', billDate: '2026-10-25', dueDate: '2026-11-01', itemSummary: 'Fresh packaged goods', quantity: '50', unitCost: '8500', taxRate: '0', amountPaid: '425000', subtotal: '425000', taxAmount: '0', total: '425000', amountDue: '0', status: 'Paid' },
    ]),
  },
  {
    id: 'receiving', title: 'Goods receiving', singular: 'goods receipt', group: 'INVENTORY', icon: PackageCheck,
    description: 'Capture what physically arrived against a purchase order, including accepted and rejected quantities and warehouse traceability.',
    workflow: 'Purchase order → goods receipt → stock ledger. A partial receipt must leave the unreceived quantity open. These preview records do not change the live stock ledger.',
    dateKey: 'receiptDate',
    fields: [text('receiptNumber', 'Goods receipt number'), text('purchaseOrder', 'Purchase order reference'), text('supplier', 'Supplier'), date('receiptDate', 'Receipt date'), text('product', 'Product / item'), amount('orderedQuantity', 'Ordered quantity'), amount('acceptedQuantity', 'Accepted quantity'), amount('rejectedQuantity', 'Rejected / damaged quantity'), text('warehouse', 'Receiving warehouse'), text('batchNumber', 'Batch / lot reference', false), date('expiryDate', 'Expiry date', false), status(['Draft', 'Received', 'Needs inspection', 'Rejected'])],
    columns: [{ key: 'receiptNumber', label: 'RECEIPT' }, { key: 'purchaseOrder', label: 'PURCHASE ORDER' }, { key: 'supplier', label: 'SUPPLIER' }, { key: 'receiptDate', label: 'RECEIVED', kind: 'date' }, { key: 'acceptedQuantity', label: 'ACCEPTED', kind: 'number' }, { key: 'rejectedQuantity', label: 'REJECTED', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('GRN', [
      { receiptNumber: 'GRN-2026-021', purchaseOrder: 'PO-2026-030', supplier: 'Fresh Supply Co.', receiptDate: '2026-10-26', product: 'Packaged goods', orderedQuantity: '50', acceptedQuantity: '42', rejectedQuantity: '2', warehouse: 'Main store', batchNumber: 'B-1026-A', expiryDate: '2027-04-26', status: 'Needs inspection' },
      { receiptNumber: 'GRN-2026-020', purchaseOrder: 'PO-2026-029', supplier: 'Office Essentials', receiptDate: '2026-10-24', product: 'A4 paper cartons', orderedQuantity: '20', acceptedQuantity: '20', rejectedQuantity: '0', warehouse: 'Main store', batchNumber: '', expiryDate: '', status: 'Received' },
    ]),
  },
  {
    id: 'expenses', title: 'Expenses', singular: 'expense', group: 'FINANCE', icon: ReceiptText,
    description: 'Capture operating expenses with date, category, payee, account, reference, tax estimate and approval/payment status.',
    workflow: 'Draft expense → approve → record payment → include in reports. Saving a preview expense does not move money or post a general-ledger entry.',
    dateKey: 'expenseDate', amountKey: 'total',
    fields: [text('expenseNumber', 'Expense reference'), date('expenseDate', 'Expense date'), select('category', 'Expense category', ['Rent', 'Transport', 'Utilities', 'Salaries', 'Marketing', 'Repairs', 'Office supplies', 'Bank charges', 'Other']), text('payee', 'Payee / vendor'), select('account', 'Payment account', ['Cash till', 'Main bank account', 'MTN Mobile Money', 'Airtel Money', 'Unpaid / payable']), text('reference', 'Receipt / invoice reference', false), amount('amount', 'Amount before tax'), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)'), { key: 'notes', label: 'Notes', kind: 'textarea', fullWidth: true, required: false }, status(['Draft', 'Approved', 'Paid', 'Rejected'])],
    columns: [{ key: 'expenseNumber', label: 'REFERENCE' }, { key: 'expenseDate', label: 'DATE', kind: 'date' }, { key: 'category', label: 'CATEGORY' }, { key: 'payee', label: 'PAYEE' }, { key: 'total', label: 'TOTAL', kind: 'money' }, { key: 'account', label: 'ACCOUNT' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('EXP', [
      { expenseNumber: 'EXP-2026-044', expenseDate: '2026-10-27', category: 'Transport', payee: 'Local delivery partner', account: 'Cash till', reference: 'DEL-1027', amount: '85000', taxRate: '0', taxAmount: '0', total: '85000', notes: 'Stock delivery', status: 'Approved' },
      { expenseNumber: 'EXP-2026-043', expenseDate: '2026-10-25', category: 'Utilities', payee: 'Electricity', account: 'Main bank account', reference: 'UTL-1025', amount: '210000', taxRate: '0', taxAmount: '0', total: '210000', notes: 'Monthly bill', status: 'Paid' },
      { expenseNumber: 'EXP-2026-042', expenseDate: '2026-10-23', category: 'Repairs', payee: 'Store maintenance', account: 'Unpaid / payable', reference: '', amount: '135000', taxRate: '0', taxAmount: '0', total: '135000', notes: '', status: 'Draft' },
    ]),
  },
  {
    id: 'money-accounts', title: 'Money accounts', singular: 'money account', group: 'FINANCE', icon: Wallet,
    description: 'Preview cash tills, bank accounts and mobile-money wallets with opening and current balances.',
    workflow: 'Account opening balance + posted receipts − posted payments ± transfers = reconciled balance. In this preview the balance is an editable sample figure, not a live bank balance.',
    fields: [text('accountName', 'Account name'), select('accountType', 'Account type', ['Cash till', 'Bank', 'Mobile money', 'Petty cash', 'Clearing']), text('accountNumber', 'Account / wallet reference', false), select('currency', 'Currency', ['UGX', 'USD', 'KES']), amount('openingBalance', 'Opening balance'), amount('currentBalance', 'Current balance (preview)'), text('branchName', 'Branch'), status(['Active', 'Inactive', 'Reconciliation needed'])],
    columns: [{ key: 'accountName', label: 'ACCOUNT' }, { key: 'accountType', label: 'TYPE' }, { key: 'accountNumber', label: 'REFERENCE' }, { key: 'openingBalance', label: 'OPENING', kind: 'money' }, { key: 'currentBalance', label: 'CURRENT BALANCE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('ACC', [
      { accountName: 'Main cash till', accountType: 'Cash till', accountNumber: 'CASH-01', currency: 'UGX', openingBalance: '1200000', currentBalance: '1645000', branchName: 'Main branch', status: 'Active' },
      { accountName: 'Operating bank account', accountType: 'Bank', accountNumber: 'BANK-01', currency: 'UGX', openingBalance: '8000000', currentBalance: '7360000', branchName: 'Main branch', status: 'Active' },
      { accountName: 'MTN Mobile Money', accountType: 'Mobile money', accountNumber: 'MOMO-01', currency: 'UGX', openingBalance: '350000', currentBalance: '486000', branchName: 'Main branch', status: 'Reconciliation needed' },
    ]),
  },
  {
    id: 'payments', title: 'Receipts & payments', singular: 'payment record', group: 'FINANCE', icon: HandCoins,
    description: 'Capture customer receipts, supplier payments, advances and transfers with a reference to the party and money account.',
    workflow: 'Choose money in / money out / transfer → select party and account → enter amount and method → reconcile against the related invoice or bill. Preview entries do not initiate transfers.',
    dateKey: 'paymentDate', amountKey: 'amount',
    fields: [text('paymentNumber', 'Payment / receipt number'), select('direction', 'Direction', ['Money in', 'Money out', 'Account transfer']), select('partyType', 'Party type', ['Customer', 'Supplier', 'Employee', 'Other', 'Internal transfer']), text('partyName', 'Party / beneficiary'), date('paymentDate', 'Transaction date'), select('method', 'Payment method', ['Cash', 'MTN Mobile Money (recorded)', 'Airtel Money (recorded)', 'Bank transfer (recorded)', 'Card (recorded)', 'Other']), select('account', 'Cash / bank / wallet account', ['Cash till', 'Main bank account', 'MTN Mobile Money', 'Airtel Money']), text('reference', 'External reference', false), amount('amount', 'Amount'), { key: 'notes', label: 'Notes / invoice allocation', kind: 'textarea', fullWidth: true, required: false }, status(['Pending', 'Recorded', 'Reconciled', 'Cancelled'])],
    columns: [{ key: 'paymentNumber', label: 'REFERENCE' }, { key: 'direction', label: 'DIRECTION' }, { key: 'paymentDate', label: 'DATE', kind: 'date' }, { key: 'partyName', label: 'PARTY' }, { key: 'method', label: 'METHOD' }, { key: 'amount', label: 'AMOUNT', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('PAY', [
      { paymentNumber: 'RCPT-2026-104', direction: 'Money in', partyType: 'Customer', partyName: 'Kampala Retail Mart', paymentDate: '2026-10-27', method: 'Bank transfer (recorded)', account: 'Main bank account', reference: 'TRX-DEMO-104', amount: '300000', notes: 'Partial settlement of opening balance', status: 'Reconciled' },
      { paymentNumber: 'PAY-2026-078', direction: 'Money out', partyType: 'Supplier', partyName: 'Fresh Supply Co.', paymentDate: '2026-10-26', method: 'MTN Mobile Money (recorded)', account: 'MTN Mobile Money', reference: 'MOMO-DEMO-078', amount: '150000', notes: 'Part payment for PO-2026-030', status: 'Recorded' },
      { paymentNumber: 'RCPT-2026-103', direction: 'Money in', partyType: 'Customer', partyName: 'Nakasero Foods', paymentDate: '2026-10-24', method: 'Cash', account: 'Cash till', reference: '', amount: '180000', notes: '', status: 'Pending' },
    ]),
  },
  {
    id: 'accounting', title: 'Accounting journals', singular: 'journal entry', group: 'FINANCE', icon: BookOpen,
    description: 'Prepare a balanced journal voucher with posting date, debit account, credit account, amount and a review state.',
    workflow: 'Use routine sales, purchases, receipts and supplier payments in their operational modules. Journals are for controlled adjustments; total debits must equal total credits before posting.',
    dateKey: 'journalDate', amountKey: 'amount',
    fields: [text('journalNumber', 'Journal reference'), date('journalDate', 'Posting date'), text('description', 'Narration / description'), select('debitAccount', 'Debit account', ['Cash', 'Bank', 'Accounts receivable', 'Inventory', 'Expenses', 'Fixed assets', 'Tax recoverable']), select('creditAccount', 'Credit account', ['Bank', 'Cash', 'Accounts payable', 'Sales income', 'Capital', 'Accumulated depreciation', 'Tax payable']), amount('amount', 'Journal amount'), text('sourceReference', 'Supporting document reference', false), status(['Draft', 'Posted', 'Voided'])],
    columns: [{ key: 'journalNumber', label: 'JOURNAL' }, { key: 'journalDate', label: 'DATE', kind: 'date' }, { key: 'description', label: 'NARRATION' }, { key: 'debitAccount', label: 'DEBIT ACCOUNT' }, { key: 'creditAccount', label: 'CREDIT ACCOUNT' }, { key: 'amount', label: 'DEBIT = CREDIT', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('JRN', [
      { journalNumber: 'JRN-2026-011', journalDate: '2026-10-27', description: 'Opening petty cash correction', debitAccount: 'Cash', creditAccount: 'Capital', amount: '250000', sourceReference: 'OPENING-01', status: 'Draft' },
      { journalNumber: 'JRN-2026-010', journalDate: '2026-10-25', description: 'Monthly depreciation estimate', debitAccount: 'Expenses', creditAccount: 'Accumulated depreciation', amount: '125000', sourceReference: 'DEP-OCT', status: 'Posted' },
    ]),
  },
  {
    id: 'assets', title: 'Fixed assets', singular: 'fixed asset', group: 'FINANCE', icon: Building2,
    description: 'Track asset register details, acquisition cost, residual value, useful life and a preview of straight-line depreciation.',
    workflow: 'Acquire asset → record supplier document → classify asset → calculate depreciation → review disposal. Depreciation figures here are estimates and are not posted to the ledger.',
    dateKey: 'acquisitionDate', amountKey: 'carryingValue',
    fields: [text('assetCode', 'Asset tag / code'), text('name', 'Asset name'), select('category', 'Asset category', ['Equipment', 'Furniture', 'Motor vehicle', 'Computer / IT', 'Leasehold improvement', 'Other']), text('location', 'Location / branch'), date('acquisitionDate', 'Acquisition date'), amount('cost', 'Acquisition cost'), amount('residualValue', 'Residual value'), amount('usefulLifeYears', 'Useful life (years)'), amount('accumulatedDepreciation', 'Accumulated depreciation'), text('assetAccount', 'Asset account'), status(['Active', 'Under maintenance', 'Disposed'])],
    columns: [{ key: 'assetCode', label: 'ASSET TAG' }, { key: 'name', label: 'ASSET' }, { key: 'category', label: 'CATEGORY' }, { key: 'acquisitionDate', label: 'ACQUIRED', kind: 'date' }, { key: 'cost', label: 'COST', kind: 'money' }, { key: 'carryingValue', label: 'CARRYING VALUE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('AST', [
      { assetCode: 'AST-0001', name: 'Store shelving', category: 'Furniture', location: 'Main branch', acquisitionDate: '2026-01-10', cost: '2500000', residualValue: '250000', usefulLifeYears: '5', accumulatedDepreciation: '125000', annualDepreciation: '450000', carryingValue: '2375000', assetAccount: 'Fixed assets', status: 'Active' },
      { assetCode: 'AST-0002', name: 'POS computer', category: 'Computer / IT', location: 'Main branch', acquisitionDate: '2026-03-06', cost: '1800000', residualValue: '180000', usefulLifeYears: '3', accumulatedDepreciation: '350000', annualDepreciation: '540000', carryingValue: '1450000', assetAccount: 'Fixed assets', status: 'Active' },
    ]),
  },
  {
    id: 'stock-counts', title: 'Stock counts', singular: 'stock count', group: 'INVENTORY', icon: PackageCheck,
    description: 'Plan a count, compare physical quantity to the system quantity, document the variance and capture an approval/status trail.',
    workflow: 'Open count → count physical stock → explain variance → review/approve → post a controlled stock adjustment. This preview calculates differences but does not change the stock ledger.',
    dateKey: 'countDate',
    fields: [text('countNumber', 'Stock count reference'), date('countDate', 'Count date'), text('product', 'Product / SKU'), amount('expectedQuantity', 'System quantity'), amount('countedQuantity', 'Physically counted quantity'), text('reason', 'Variance explanation', false), status(['Draft', 'Counted', 'Needs review', 'Approved', 'Posted', 'Cancelled'])],
    columns: [{ key: 'countNumber', label: 'COUNT' }, { key: 'countDate', label: 'DATE', kind: 'date' }, { key: 'product', label: 'PRODUCT' }, { key: 'expectedQuantity', label: 'SYSTEM QTY', kind: 'number' }, { key: 'countedQuantity', label: 'COUNTED QTY', kind: 'number' }, { key: 'variance', label: 'VARIANCE', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('CNT', [
      { countNumber: 'CNT-2026-006', countDate: '2026-10-28', product: 'RICE-005 · Rice 5kg', expectedQuantity: '120', countedQuantity: '118', variance: '-2', reason: 'Two units damaged; review write-off', status: 'Needs review' },
      { countNumber: 'CNT-2026-005', countDate: '2026-10-26', product: 'SOAP-001 · Laundry soap', expectedQuantity: '64', countedQuantity: '64', variance: '0', reason: 'No difference', status: 'Counted' },
    ]),
  },
  {
    id: 'tax-documents', title: 'Tax documents & EFRIS', singular: 'tax document', group: 'FINANCE', icon: BookOpen,
    description: 'Prepare fiscal-document data and track a reference returned by an authorized external process. No submission to URA is performed here.',
    workflow: 'Validate source invoice and taxpayer/customer details → prepare fiscalization request → later API integration submits to EFRIS → store the external receipt number, verification code and response. This page is not an EFRIS connection.',
    dateKey: 'issueDate', amountKey: 'taxAmount',
    fields: [text('internalReference', 'Internal tax-document reference'), text('sourceInvoice', 'Source sales invoice'), text('customerTIN', 'Customer TIN / tax reference', false), date('issueDate', 'Document date'), amount('taxableAmount', 'Taxable amount'), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)'), text('externalReceiptNumber', 'External e-receipt / invoice number', false), text('verificationCode', 'External verification code', false), { key: 'notes', label: 'Tax / exemption notes', kind: 'textarea', required: false, fullWidth: true }, status(['Draft', 'Ready for integration', 'Submitted externally', 'Accepted externally', 'Rejected externally', 'Cancelled'])],
    columns: [{ key: 'internalReference', label: 'REFERENCE' }, { key: 'sourceInvoice', label: 'SOURCE INVOICE' }, { key: 'issueDate', label: 'DATE', kind: 'date' }, { key: 'taxableAmount', label: 'TAXABLE AMOUNT', kind: 'money' }, { key: 'taxAmount', label: 'TAX ESTIMATE', kind: 'money' }, { key: 'externalReceiptNumber', label: 'EXTERNAL REF' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('TAX', [
      { internalReference: 'TAX-2026-014', sourceInvoice: 'INV-2026-104', customerTIN: '1000000000', issueDate: '2026-10-27', taxableAmount: '1110000', taxRate: '18', taxAmount: '199800', externalReceiptNumber: '', verificationCode: '', notes: 'Sample only — not submitted to URA', status: 'Ready for integration' },
      { internalReference: 'TAX-2026-013', sourceInvoice: 'INV-2026-103', customerTIN: '', issueDate: '2026-10-23', taxableAmount: '360000', taxRate: '18', taxAmount: '64800', externalReceiptNumber: '', verificationCode: '', notes: 'Sample only — no fiscal response received', status: 'Draft' },
    ]),
  },
  {
    id: 'stock-transfers', title: 'Stock transfers', singular: 'stock transfer', group: 'INVENTORY', icon: ArrowLeftRight,
    description: 'Record internal stock movement between branches, including source, destination, product, quantity, reason and receipt status.',
    workflow: 'Draft → request → dispatch / in transit → receive at destination. Confirmed transfers must later create paired stock ledger movements; this preview does not change on-hand stock.',
    dateKey: 'transferDate',
    fields: [text('transferNumber', 'Transfer reference'), text('fromBranch', 'Source branch'), text('toBranch', 'Destination branch'), date('transferDate', 'Transfer date'), text('product', 'Product / SKU'), amount('quantity', 'Quantity transferred'), select('reason', 'Reason', ['Replenishment', 'Inter-branch sale fulfilment', 'Stock balancing', 'Other']), status(['Draft', 'Requested', 'In transit', 'Received', 'Cancelled'])],
    columns: [{ key: 'transferNumber', label: 'TRANSFER' }, { key: 'fromBranch', label: 'FROM' }, { key: 'toBranch', label: 'TO' }, { key: 'transferDate', label: 'DATE', kind: 'date' }, { key: 'product', label: 'PRODUCT' }, { key: 'quantity', label: 'QTY', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('TRF', [
      { transferNumber: 'TRF-2026-008', fromBranch: 'Main branch', toBranch: 'Ntinda branch', transferDate: '2026-10-27', product: 'RICE-005 · Rice 5kg', quantity: '24', reason: 'Replenishment', status: 'In transit' },
      { transferNumber: 'TRF-2026-007', fromBranch: 'Main branch', toBranch: 'Entebbe branch', transferDate: '2026-10-24', product: 'SOAP-001 · Laundry soap', quantity: '36', reason: 'Stock balancing', status: 'Received' },
    ]),
  },
  {
    id: 'team', title: 'Team & access', singular: 'team member', group: 'ADMINISTRATION', icon: Users,
    description: 'Review a proposed staff directory, role assignment, branch scope and member status before the future auth integration.',
    workflow: 'Invite → accept invitation → assign role and permitted branches → review access. Changes on this page are demonstration records only: they do not create users or enforce permissions.',
    dateKey: 'lastActive',
    fields: [text('memberName', 'Full name'), { ...text('email', 'Work email'), kind: 'email' }, select('role', 'Role', ['Owner / administrator', 'Business manager', 'Branch manager', 'Cashier', 'Inventory operator', 'Accountant', 'Read only']), text('branches', 'Allowed branches (preview)'), date('lastActive', 'Last active date', false), status(['Invited', 'Active', 'Suspended'])],
    columns: [{ key: 'memberName', label: 'TEAM MEMBER' }, { key: 'email', label: 'EMAIL' }, { key: 'role', label: 'ROLE' }, { key: 'branches', label: 'BRANCH SCOPE' }, { key: 'lastActive', label: 'LAST ACTIVE', kind: 'date' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('USR', [
      { memberName: 'Alex Manager', email: 'manager@example.test', role: 'Business manager', branches: 'All branches (preview)', lastActive: '2026-10-28', status: 'Active' },
      { memberName: 'Pat Cashier', email: 'cashier@example.test', role: 'Cashier', branches: 'Main branch', lastActive: '2026-10-27', status: 'Active' },
      { memberName: 'Finance Reviewer', email: 'finance@example.test', role: 'Accountant', branches: 'All branches (preview)', lastActive: '2026-10-26', status: 'Invited' },
    ]),
  },
  {
    id: 'price-lists', title: 'Price lists & pricing', singular: 'price list', group: 'SELLING', icon: Tag,
    description: 'Prepare customer-group or product-specific pricing with valid dates, discounts and an explicit currency.',
    workflow: 'Draft price list → review prices and dates → activate for a selling channel/customer group. These sample rules do not affect the existing checkout prices yet.',
    dateKey: 'validFrom',
    fields: [text('priceListCode', 'Price-list code'), text('listName', 'Price-list name'), select('appliesTo', 'Applies to', ['All customers', 'Retail', 'Wholesale', 'Named customer', 'Branch promotion']), text('customerOrGroup', 'Customer / group', false), text('productOrCategory', 'Product, SKU or category'), select('currency', 'Currency', ['UGX', 'USD', 'KES']), amount('basePrice', 'Reference / base price'), amount('sellingPrice', 'Price to charge'), amount('discountPercent', 'Discount (%)'), date('validFrom', 'Valid from'), date('validUntil', 'Valid until'), status(['Draft', 'Review', 'Active', 'Expired', 'Inactive'])],
    columns: [{ key: 'priceListCode', label: 'CODE' }, { key: 'listName', label: 'PRICE LIST' }, { key: 'appliesTo', label: 'CUSTOMER SCOPE' }, { key: 'productOrCategory', label: 'PRODUCT / CATEGORY' }, { key: 'sellingPrice', label: 'SELLING PRICE', kind: 'money' }, { key: 'validFrom', label: 'VALID FROM', kind: 'date' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('PL', [
      { priceListCode: 'PL-RTL-01', listName: 'Retail standard', appliesTo: 'Retail', customerOrGroup: 'Retail', productOrCategory: 'RICE-005 · Rice 5kg', currency: 'UGX', basePrice: '20000', sellingPrice: '20000', discountPercent: '0', validFrom: '2026-10-01', validUntil: '2026-12-31', status: 'Active' },
      { priceListCode: 'PL-WHS-01', listName: 'Wholesale tier 1', appliesTo: 'Wholesale', customerOrGroup: 'Wholesale', productOrCategory: 'Mixed grocery category', currency: 'UGX', basePrice: '20000', sellingPrice: '18500', discountPercent: '7.5', validFrom: '2026-10-01', validUntil: '2026-12-31', status: 'Review' },
    ]),
  },
  {
    id: 'deliveries', title: 'Deliveries & fulfilment', singular: 'delivery', group: 'LOGISTICS', icon: Truck,
    description: 'Track picking, dispatch, courier, destination, expected arrival, proof-of-delivery references and delivery fees.',
    workflow: 'Sales order → pick/pack → dispatch → delivery in transit → proof of delivery → close. A preview delivery will not change sales-order fulfilment or stock.',
    dateKey: 'dispatchDate', amountKey: 'deliveryFee',
    fields: [text('deliveryNumber', 'Delivery reference'), text('salesOrder', 'Sales order reference'), text('customer', 'Customer / recipient'), { key: 'deliveryAddress', label: 'Delivery address', kind: 'textarea', fullWidth: true }, date('dispatchDate', 'Dispatch date'), date('expectedDate', 'Expected arrival'), text('courier', 'Courier / driver'), text('trackingReference', 'Tracking / proof reference', false), amount('deliveryFee', 'Delivery fee'), select('method', 'Delivery method', ['Own fleet', 'Courier', 'Customer collection', 'Third-party logistics']), status(['Draft', 'Picking', 'Packed', 'Dispatched', 'In transit', 'Delivered', 'Delivery failed', 'Cancelled'])],
    columns: [{ key: 'deliveryNumber', label: 'DELIVERY' }, { key: 'salesOrder', label: 'SALES ORDER' }, { key: 'customer', label: 'CUSTOMER' }, { key: 'dispatchDate', label: 'DISPATCHED', kind: 'date' }, { key: 'expectedDate', label: 'EXPECTED', kind: 'date' }, { key: 'courier', label: 'COURIER / DRIVER' }, { key: 'deliveryFee', label: 'DELIVERY FEE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('DLV', [
      { deliveryNumber: 'DLV-2026-016', salesOrder: 'SO-2026-018', customer: 'Kampala Retail Mart', deliveryAddress: 'Kampala Central', dispatchDate: '2026-10-28', expectedDate: '2026-10-29', courier: 'LEXA Fleet 01', trackingReference: 'POD-DEMO-016', deliveryFee: '25000', method: 'Own fleet', status: 'Dispatched' },
      { deliveryNumber: 'DLV-2026-015', salesOrder: 'SO-2026-017', customer: 'Nakasero Foods', deliveryAddress: 'Nakasero, Kampala', dispatchDate: '2026-10-27', expectedDate: '2026-10-28', courier: 'City Courier', trackingReference: '', deliveryFee: '18000', method: 'Courier', status: 'In transit' },
    ]),
  },
  {
    id: 'warehouses', title: 'Warehouses & locations', singular: 'warehouse / location', group: 'INVENTORY', icon: Building2,
    description: 'Plan the physical locations used for receiving, storage, picking, dispatch, stock counting and inter-branch movement.',
    workflow: 'Create a location → assign a branch and supervisor → receive/move stock into the location → count and reconcile. These location records do not create a stock ledger.',
    fields: [text('locationCode', 'Location code'), text('name', 'Warehouse / location name'), text('branch', 'Branch'), select('locationType', 'Location type', ['Warehouse', 'Store room', 'Retail floor', 'Dispatch area', 'Quarantine / returns', 'Virtual']), text('address', 'Address / zone'), text('binRange', 'Aisle / rack / bin range', false), amount('capacityUnits', 'Capacity (units, optional)', false), text('supervisor', 'Responsible supervisor', false), status(['Active', 'Restricted', 'Under maintenance', 'Inactive'])],
    columns: [{ key: 'locationCode', label: 'LOCATION CODE' }, { key: 'name', label: 'LOCATION' }, { key: 'branch', label: 'BRANCH' }, { key: 'locationType', label: 'TYPE' }, { key: 'binRange', label: 'AISLE / BIN' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('LOC', [
      { locationCode: 'WH-MAIN', name: 'Main warehouse', branch: 'Main branch', locationType: 'Warehouse', address: 'Industrial Area, Kampala', binRange: 'A01–D12', capacityUnits: '5000', supervisor: 'Pat Inventory', status: 'Active' },
      { locationCode: 'RETURNS-QA', name: 'Returns quarantine', branch: 'Main branch', locationType: 'Quarantine / returns', address: 'Main warehouse · Zone Q', binRange: 'Q01–Q04', capacityUnits: '150', supervisor: 'Alex Manager', status: 'Active' },
    ]),
  },
  {
    id: 'employees', title: 'Employees & HR directory', singular: 'employee', group: 'PEOPLE & PAYROLL', icon: UserRound,
    description: 'Maintain the staff directory, employment status, department, position, assigned branch and agreed monthly pay reference.',
    workflow: 'Create employee profile → assign role/branch in access control → record attendance → prepare a reviewed payroll run. Employee directory records do not create login accounts.',
    dateKey: 'startDate', amountKey: 'baseMonthlyPay',
    fields: [text('employeeCode', 'Employee number'), text('fullName', 'Full name'), { ...text('workEmail', 'Work email', false), kind: 'email' }, { ...text('phone', 'Phone number'), kind: 'tel' }, text('department', 'Department'), text('jobTitle', 'Job title'), text('branch', 'Home branch'), date('startDate', 'Start date'), select('employmentType', 'Engagement type', ['Permanent', 'Fixed term', 'Part time', 'Casual', 'Contractor']), amount('baseMonthlyPay', 'Base monthly pay (reference)'), status(['Active', 'On leave', 'Suspended', 'Exited'])],
    columns: [{ key: 'employeeCode', label: 'EMPLOYEE NO.' }, { key: 'fullName', label: 'EMPLOYEE' }, { key: 'department', label: 'DEPARTMENT' }, { key: 'jobTitle', label: 'POSITION' }, { key: 'branch', label: 'BRANCH' }, { key: 'baseMonthlyPay', label: 'BASE PAY REF.', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('EMP', [
      { employeeCode: 'EMP-0001', fullName: 'Alex Manager', workEmail: 'manager@example.test', phone: '+256 700 100 101', department: 'Operations', jobTitle: 'Business manager', branch: 'Main branch', startDate: '2024-02-01', employmentType: 'Permanent', baseMonthlyPay: '1800000', status: 'Active' },
      { employeeCode: 'EMP-0002', fullName: 'Pat Inventory', workEmail: 'inventory@example.test', phone: '+256 700 100 102', department: 'Inventory', jobTitle: 'Inventory operator', branch: 'Main branch', startDate: '2025-05-12', employmentType: 'Permanent', baseMonthlyPay: '900000', status: 'Active' },
    ]),
  },
  {
    id: 'attendance', title: 'Attendance & shifts', singular: 'attendance record', group: 'PEOPLE & PAYROLL', icon: Clock3,
    description: 'Capture staff attendance, shifts, clock-in/out, breaks, attendance exception notes and calculated hours for review.',
    workflow: 'Publish shift plan → capture clock-in/out → review missing punches and lateness → approve attendance → send approved hours to payroll. Preview hours are not an official time clock.',
    dateKey: 'attendanceDate',
    fields: [text('attendanceReference', 'Attendance reference'), text('employee', 'Employee'), date('attendanceDate', 'Attendance date'), select('shift', 'Shift', ['Morning', 'Day', 'Evening', 'Night', 'Split shift', 'Off day']), { ...text('clockIn', 'Clock-in time (HH:MM)'), placeholder: '08:30' }, { ...text('clockOut', 'Clock-out time (HH:MM)'), placeholder: '17:00' }, amount('breakMinutes', 'Unpaid break (minutes)', false), text('exceptionNote', 'Late / missing punch explanation', false), status(['Pending', 'Present', 'Late', 'Absent', 'Leave', 'Reviewed', 'Approved'])],
    columns: [{ key: 'attendanceReference', label: 'REFERENCE' }, { key: 'employee', label: 'EMPLOYEE' }, { key: 'attendanceDate', label: 'DATE', kind: 'date' }, { key: 'shift', label: 'SHIFT' }, { key: 'clockIn', label: 'IN' }, { key: 'clockOut', label: 'OUT' }, { key: 'workedHours', label: 'HOURS', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('ATT', [
      { attendanceReference: 'ATT-2026-1028-01', employee: 'Pat Inventory', attendanceDate: '2026-10-28', shift: 'Morning', clockIn: '08:02', clockOut: '17:03', breakMinutes: '60', workedHours: '8.02', exceptionNote: '', status: 'Reviewed' },
      { attendanceReference: 'ATT-2026-1028-02', employee: 'Alex Manager', attendanceDate: '2026-10-28', shift: 'Day', clockIn: '08:35', clockOut: '17:00', breakMinutes: '60', workedHours: '7.42', exceptionNote: 'Late arrival noted', status: 'Late' },
    ]),
  },
  {
    id: 'payroll', title: 'Payroll run preview', singular: 'payroll run', group: 'PEOPLE & PAYROLL', icon: Wallet,
    description: 'Prepare a payroll batch summary with period, headcount, gross pay, deductions and net pay for review.',
    workflow: 'Collect approved attendance and employment changes → prepare gross pay → apply validated statutory and approved deductions → review/approve → pay and post to the ledger. This screen only performs gross minus entered deductions.',
    dateKey: 'periodStart', amountKey: 'netPay',
    fields: [text('payrollReference', 'Payroll run reference'), date('periodStart', 'Period start'), date('periodEnd', 'Period end'), amount('employeeCount', 'Employees included'), amount('grossPay', 'Gross pay for the run'), amount('deductions', 'Total deductions entered'), text('preparedBy', 'Prepared by'), text('reviewReference', 'Review / approval reference', false), status(['Draft', 'Review', 'Approved', 'Payment prepared', 'Paid', 'Reopened'])],
    columns: [{ key: 'payrollReference', label: 'PAYROLL RUN' }, { key: 'periodStart', label: 'PERIOD START', kind: 'date' }, { key: 'periodEnd', label: 'PERIOD END', kind: 'date' }, { key: 'employeeCount', label: 'STAFF', kind: 'number' }, { key: 'grossPay', label: 'GROSS PAY', kind: 'money' }, { key: 'deductions', label: 'DEDUCTIONS', kind: 'money' }, { key: 'netPay', label: 'NET PAY ESTIMATE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('PAYRUN', [
      { payrollReference: 'PAYRUN-2026-10', periodStart: '2026-10-01', periodEnd: '2026-10-31', employeeCount: '2', grossPay: '2700000', deductions: '270000', netPay: '2430000', preparedBy: 'Alex Manager', reviewReference: '', status: 'Review' },
    ]),
  },
  {
    id: 'chart-of-accounts', title: 'Chart of accounts', singular: 'general-ledger account', group: 'FINANCE', icon: BookOpen,
    description: 'Define the controlled ledger account structure used by journal entries, reports and later API-backed transaction posting.',
    workflow: 'Review standard account classes → define parent/child accounts → map operational modules and tax codes → restrict posting and lock accounts when used. This preview does not post journal entries.',
    fields: [text('accountCode', 'Account code'), text('accountName', 'Account name'), select('accountType', 'Account class', ['Asset', 'Liability', 'Equity', 'Income', 'Cost of sales', 'Expense']), select('normalBalance', 'Normal balance', ['Debit', 'Credit']), text('parentAccount', 'Parent / control account', false), select('reconciliationRequired', 'Reconciliation required', ['No', 'Yes']), text('description', 'Account purpose', false), status(['Draft', 'Active', 'Blocked', 'Archived'])],
    columns: [{ key: 'accountCode', label: 'ACCOUNT CODE' }, { key: 'accountName', label: 'ACCOUNT NAME' }, { key: 'accountType', label: 'CLASS' }, { key: 'normalBalance', label: 'NORMAL BALANCE' }, { key: 'parentAccount', label: 'PARENT ACCOUNT' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('COA', [
      { accountCode: '1000', accountName: 'Cash on hand', accountType: 'Asset', normalBalance: 'Debit', parentAccount: 'Current assets', reconciliationRequired: 'Yes', description: 'Cash tills and petty cash', status: 'Active' },
      { accountCode: '1100', accountName: 'Bank accounts', accountType: 'Asset', normalBalance: 'Debit', parentAccount: 'Current assets', reconciliationRequired: 'Yes', description: 'Bank balances by account', status: 'Active' },
      { accountCode: '1200', accountName: 'Inventory', accountType: 'Asset', normalBalance: 'Debit', parentAccount: 'Current assets', reconciliationRequired: 'No', description: 'Inventory valuation control', status: 'Active' },
      { accountCode: '2100', accountName: 'Accounts payable', accountType: 'Liability', normalBalance: 'Credit', parentAccount: 'Current liabilities', reconciliationRequired: 'Yes', description: 'Supplier subledger control', status: 'Active' },
      { accountCode: '4000', accountName: 'Sales income', accountType: 'Income', normalBalance: 'Credit', parentAccount: 'Income', reconciliationRequired: 'No', description: 'Sales revenue', status: 'Active' },
    ]),
  },
  {
    id: 'tax-codes', title: 'Tax codes & rules', singular: 'tax code', group: 'FINANCE', icon: ReceiptText,
    description: 'Maintain explicit tax treatments, rates, effective dates and the intended sales/purchase ledger mapping.',
    workflow: 'Create a tax code → choose treatment and applicability → set effective period and tax accounts → validate with the finance owner → map the backend tax configuration. Preview codes are not legal tax advice or an EFRIS submission.',
    dateKey: 'effectiveFrom',
    fields: [text('taxCode', 'Tax code'), text('taxName', 'Tax name / description'), select('treatment', 'Treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope', 'Special treatment']), amount('ratePercent', 'Rate (%)'), select('appliesTo', 'Applies to', ['Sales', 'Purchases', 'Sales and purchases']), select('priceBasis', 'Price basis', ['Exclusive of tax', 'Inclusive of tax']), date('effectiveFrom', 'Effective from'), date('effectiveTo', 'Effective until', false), text('outputTaxAccount', 'Output-tax ledger account', false), text('inputTaxAccount', 'Input-tax ledger account', false), text('exemptionReason', 'Supporting legal / exemption note', false), status(['Draft', 'Active', 'Expired', 'Disabled'])],
    columns: [{ key: 'taxCode', label: 'CODE' }, { key: 'taxName', label: 'TAX TREATMENT' }, { key: 'treatment', label: 'TREATMENT' }, { key: 'ratePercent', label: 'RATE (%)', kind: 'number' }, { key: 'appliesTo', label: 'APPLIES TO' }, { key: 'effectiveFrom', label: 'EFFECTIVE FROM', kind: 'date' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('TAXCODE', [
      { taxCode: 'VAT-STD', taxName: 'Standard rated VAT (reference)', treatment: 'Standard rated', ratePercent: '18', appliesTo: 'Sales and purchases', priceBasis: 'Exclusive of tax', effectiveFrom: '2026-01-01', effectiveTo: '', outputTaxAccount: 'Tax payable', inputTaxAccount: 'Tax recoverable', exemptionReason: 'Confirm applicability, registrations and current rules with the finance owner.', status: 'Active' },
      { taxCode: 'VAT-ZERO', taxName: 'Zero-rated supply', treatment: 'Zero-rated', ratePercent: '0', appliesTo: 'Sales', priceBasis: 'Exclusive of tax', effectiveFrom: '2026-01-01', effectiveTo: '', outputTaxAccount: 'Tax payable', inputTaxAccount: '', exemptionReason: 'Confirm eligibility and supporting documentation before use.', status: 'Active' },
      { taxCode: 'VAT-EXEMPT', taxName: 'Exempt supply', treatment: 'Exempt', ratePercent: '0', appliesTo: 'Sales and purchases', priceBasis: 'Exclusive of tax', effectiveFrom: '2026-01-01', effectiveTo: '', outputTaxAccount: '', inputTaxAccount: '', exemptionReason: 'Enter the applicable exemption basis; exempt is not interchangeable with zero-rated.', status: 'Active' },
    ]),
  },
  {
    id: 'bank-reconciliation', title: 'Bank reconciliation', singular: 'reconciliation run', group: 'FINANCE', icon: Banknote,
    description: 'Prepare a statement-to-book reconciliation with statement reference, opening/closing figures, match counts and an unexplained difference.',
    workflow: 'Import or enter statement → match each line to recorded money movements → investigate unmatched fees/transfers → review difference → approve reconciliation. These totals are manually entered preview figures; no bank feed is connected.',
    dateKey: 'statementDate',
    fields: [text('reconciliationNumber', 'Reconciliation reference'), select('account', 'Cash / bank account', ['Main bank account', 'Cash till', 'MTN Mobile Money', 'Airtel Money']), date('statementDate', 'Statement end date'), text('statementReference', 'Statement / file reference'), amount('openingBalance', 'Statement opening balance'), amount('statementBalance', 'Statement closing balance'), amount('bookBalance', 'Book closing balance'), amount('statementLineCount', 'Statement lines'), amount('matchedCount', 'Matched lines'), amount('unmatchedCount', 'Unmatched lines'), text('preparedBy', 'Prepared by'), status(['Draft', 'Matching', 'Needs review', 'Reconciled', 'Reopened'])],
    columns: [{ key: 'reconciliationNumber', label: 'RECONCILIATION' }, { key: 'account', label: 'ACCOUNT' }, { key: 'statementDate', label: 'AS AT', kind: 'date' }, { key: 'statementBalance', label: 'STATEMENT BALANCE', kind: 'money' }, { key: 'bookBalance', label: 'BOOK BALANCE', kind: 'money' }, { key: 'difference', label: 'DIFFERENCE', kind: 'money' }, { key: 'unmatchedCount', label: 'UNMATCHED', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('REC', [
      { reconciliationNumber: 'REC-2026-10-01', account: 'Main bank account', statementDate: '2026-10-27', statementReference: 'BANK-DEMO-OCT', openingBalance: '4500000', statementBalance: '6175000', bookBalance: '6125000', difference: '50000', statementLineCount: '38', matchedCount: '35', unmatchedCount: '3', preparedBy: 'Alex Manager', status: 'Needs review' },
      { reconciliationNumber: 'REC-2026-09-01', account: 'Main bank account', statementDate: '2026-09-30', statementReference: 'BANK-DEMO-SEP', openingBalance: '3900000', statementBalance: '4500000', bookBalance: '4500000', difference: '0', statementLineCount: '42', matchedCount: '42', unmatchedCount: '0', preparedBy: 'Finance Reviewer', status: 'Reconciled' },
    ]),
  },
  {
    id: 'purchase-requests', title: 'Purchase requests', singular: 'purchase request', group: 'PROCUREMENT', icon: ClipboardList,
    description: 'Capture internal purchasing needs with requester, branch, required date, quantity, justification, priority and approval state.',
    workflow: 'Draft request → submit for review → approve/reject → issue an RFQ or approved purchase order. This is a demand/approval record; it does not order, receive or expense stock.',
    dateKey: 'requestDate',
    fields: [text('requestNumber', 'Request reference'), text('requestedBy', 'Requested by'), text('branch', 'Branch / cost centre'), date('requestDate', 'Request date'), date('neededBy', 'Required by'), text('itemSummary', 'Item / service description'), amount('quantity', 'Quantity requested'), select('priority', 'Priority', ['Routine', 'Important', 'Urgent']), text('preferredSupplier', 'Suggested supplier (optional)', false), { key: 'justification', label: 'Business justification', kind: 'textarea', fullWidth: true }, status(['Draft', 'Submitted', 'Under review', 'Approved', 'Rejected', 'Converted', 'Cancelled'])],
    columns: [{ key: 'requestNumber', label: 'REQUEST' }, { key: 'requestedBy', label: 'REQUESTER' }, { key: 'branch', label: 'BRANCH / COST CENTRE' }, { key: 'neededBy', label: 'NEEDED BY', kind: 'date' }, { key: 'itemSummary', label: 'REQUIREMENT' }, { key: 'priority', label: 'PRIORITY' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('PR', [
      { requestNumber: 'PR-2026-021', requestedBy: 'Pat Inventory', branch: 'Main branch', requestDate: '2026-10-28', neededBy: '2026-11-02', itemSummary: 'Rice 5kg · replenishment', quantity: '120', priority: 'Important', preferredSupplier: 'East Africa Wholesale Ltd', justification: 'Replenish stock below target level.', status: 'Approved' },
      { requestNumber: 'PR-2026-020', requestedBy: 'Alex Manager', branch: 'Main branch', requestDate: '2026-10-27', neededBy: '2026-11-10', itemSummary: 'Receipt paper rolls', quantity: '50', priority: 'Routine', preferredSupplier: 'Office Essentials', justification: 'Routine POS consumables.', status: 'Under review' },
    ]),
  },
  {
    id: 'rfqs', title: 'Requests for quotation', singular: 'request for quotation', group: 'PROCUREMENT', icon: FileText,
    description: 'Invite suppliers to quote against a shared requirement, set a response deadline and retain the commercial terms for comparison.',
    workflow: 'Approved purchase request → issue RFQ to one or more suppliers → capture supplier quote responses → evaluate price/lead time/terms → award. RFQ status does not send email automatically.',
    dateKey: 'issueDate',
    fields: [text('rfqNumber', 'RFQ reference'), text('purchaseRequest', 'Purchase request reference', false), date('issueDate', 'Issue date'), date('responseDue', 'Response deadline'), text('itemSummary', 'Item / service description'), amount('quantity', 'Quantity requested'), { key: 'supplierInvited', label: 'Supplier invited (one supplier per preview record)', kind: 'text', fullWidth: true }, text('deliveryAddress', 'Delivery / service location', false), text('terms', 'Delivery, warranty or payment terms', false), status(['Draft', 'Sent', 'Responses received', 'Evaluated', 'Awarded', 'Cancelled'])],
    columns: [{ key: 'rfqNumber', label: 'RFQ' }, { key: 'purchaseRequest', label: 'REQUEST' }, { key: 'supplierInvited', label: 'SUPPLIER' }, { key: 'issueDate', label: 'ISSUED', kind: 'date' }, { key: 'responseDue', label: 'RESPONSE DUE', kind: 'date' }, { key: 'itemSummary', label: 'REQUIREMENT' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('RFQ', [
      { rfqNumber: 'RFQ-2026-011', purchaseRequest: 'PR-2026-021', issueDate: '2026-10-28', responseDue: '2026-10-31', itemSummary: 'Rice 5kg · replenishment', quantity: '120', supplierInvited: 'East Africa Wholesale Ltd', deliveryAddress: 'Main warehouse, Kampala', terms: 'Quote including delivery and VAT treatment.', status: 'Sent' },
      { rfqNumber: 'RFQ-2026-010', purchaseRequest: 'PR-2026-020', issueDate: '2026-10-25', responseDue: '2026-10-29', itemSummary: 'Receipt paper rolls', quantity: '50', supplierInvited: 'Office Essentials', deliveryAddress: 'Main branch', terms: 'State lead time and payment terms.', status: 'Responses received' },
    ]),
  },
  {
    id: 'supplier-quotes', title: 'Supplier quotations', singular: 'supplier quotation', group: 'PROCUREMENT', icon: FileText,
    description: 'Record a supplier’s quoted unit cost, tax treatment, delivery lead time, validity, payment terms and estimated total for evaluation.',
    workflow: 'Capture one quote per supplier → compare comparable tax/price/lead-time terms → accept or decline → create the winning purchase order. This preview does not commit spend or create stock.',
    dateKey: 'quoteDate', amountKey: 'total',
    fields: [text('quoteNumber', 'Supplier quote reference'), text('rfqNumber', 'RFQ reference', false), text('supplier', 'Supplier'), date('quoteDate', 'Quote date'), date('validUntil', 'Quote valid until'), text('itemSummary', 'Quoted item / service'), amount('quantity', 'Quoted quantity'), amount('unitCost', 'Quoted unit cost before tax'), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)'), amount('deliveryDays', 'Lead time (days)'), select('paymentTerms', 'Payment terms', ['Cash on delivery', '7 days', '14 days', '30 days', '60 days']), status(['Draft', 'Received', 'Under review', 'Accepted', 'Declined', 'Expired'])],
    columns: [{ key: 'quoteNumber', label: 'SUPPLIER QUOTE' }, { key: 'rfqNumber', label: 'RFQ' }, { key: 'supplier', label: 'SUPPLIER' }, { key: 'quoteDate', label: 'QUOTED', kind: 'date' }, { key: 'unitCost', label: 'UNIT COST', kind: 'money' }, { key: 'total', label: 'EST. TOTAL', kind: 'money' }, { key: 'deliveryDays', label: 'LEAD TIME (DAYS)', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('SQ', [
      { quoteNumber: 'SQ-2026-013', rfqNumber: 'RFQ-2026-011', supplier: 'East Africa Wholesale Ltd', quoteDate: '2026-10-28', validUntil: '2026-11-07', itemSummary: 'Rice 5kg · replenishment', quantity: '120', unitCost: '14500', taxTreatment: 'Standard rated', taxRate: '18', deliveryDays: '3', paymentTerms: '30 days', subtotal: '1740000', taxAmount: '313200', total: '2053200', status: 'Received' },
      { quoteNumber: 'SQ-2026-012', rfqNumber: 'RFQ-2026-011', supplier: 'Fresh Supply Co.', quoteDate: '2026-10-28', validUntil: '2026-11-03', itemSummary: 'Rice 5kg · replenishment', quantity: '120', unitCost: '14800', taxTreatment: 'Standard rated', taxRate: '18', deliveryDays: '2', paymentTerms: '7 days', subtotal: '1776000', taxAmount: '319680', total: '2095680', status: 'Under review' },
    ]),
  },
  {
    id: 'audit', title: 'Activity & audit log', singular: 'audit event', group: 'ADMINISTRATION', icon: Activity,
    description: 'Browse sample operational events to shape the future audit trail and exception review interface.',
    workflow: 'A production audit log must be generated by trusted server-side actions and be tamper-resistant. This module is read-only sample data and is not a security audit source.',
    dateKey: 'eventDate', readOnly: true,
    fields: [],
    columns: [{ key: 'eventDate', label: 'DATE & TIME', kind: 'date' }, { key: 'actor', label: 'ACTOR' }, { key: 'action', label: 'ACTION' }, { key: 'entity', label: 'RECORD TYPE' }, { key: 'reference', label: 'REFERENCE' }, { key: 'detail', label: 'DETAIL' }],
    initial: seed('AUD', [
      { eventDate: '2026-10-28', actor: 'Alex Manager', action: 'Reviewed', entity: 'Purchase order', reference: 'PO-2026-031', detail: 'Checked expected delivery date', status: 'Recorded' },
      { eventDate: '2026-10-27', actor: 'Pat Cashier', action: 'Created', entity: 'Sale', reference: 'RCPT-2026-104', detail: 'Sample receipt recorded', status: 'Recorded' },
      { eventDate: '2026-10-26', actor: 'Inventory operator', action: 'Updated', entity: 'Goods receipt', reference: 'GRN-2026-021', detail: 'Inspection required for rejected units', status: 'Recorded' },
    ]),
  },
  {
    id: 'opportunities', title: 'CRM opportunities', singular: 'opportunity', group: 'SELLING', icon: Users,
    description: 'Track potential deals from qualification through proposal, negotiation and outcome, including probability-weighted pipeline value.',
    workflow: 'Lead → qualify → estimate value and close date → follow up → won/lost. A won opportunity can seed a sales-order draft; it does not reserve stock or recognize revenue.',
    dateKey: 'expectedCloseDate', amountKey: 'weightedValue',
    fields: [text('opportunityCode', 'Opportunity reference'), text('company', 'Company / prospect'), text('contactName', 'Contact name'), { ...text('email', 'Contact email', false), kind: 'email' }, select('source', 'Lead source', ['Referral', 'Walk-in', 'Website', 'Campaign', 'Phone', 'Partner', 'Other']), text('owner', 'Opportunity owner'), date('createdDate', 'Created date'), date('expectedCloseDate', 'Expected close date'), amount('amount', 'Estimated deal value'), amount('probability', 'Win probability (%)'), { key: 'nextAction', label: 'Next action', kind: 'textarea', required: false, fullWidth: true }, status(['New', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'])],
    columns: [{ key: 'opportunityCode', label: 'OPPORTUNITY' }, { key: 'company', label: 'PROSPECT' }, { key: 'owner', label: 'OWNER' }, { key: 'expectedCloseDate', label: 'EXPECTED CLOSE', kind: 'date' }, { key: 'amount', label: 'ESTIMATED VALUE', kind: 'money' }, { key: 'weightedValue', label: 'WEIGHTED VALUE', kind: 'money' }, { key: 'status', label: 'STAGE', kind: 'status' }],
    initial: seed('OPP', [
      { opportunityCode: 'OPP-2026-022', company: 'Kampala Retail Mart', contactName: 'Alex Buyer', email: 'buyer@example.test', source: 'Referral', owner: 'Sales manager', createdDate: '2026-10-20', expectedCloseDate: '2026-11-15', amount: '4800000', probability: '70', weightedValue: '3360000', nextAction: 'Confirm volume and delivery dates', status: 'Proposal' },
      { opportunityCode: 'OPP-2026-021', company: 'Lakeside Supplies', contactName: 'Grace N.', email: '', source: 'Website', owner: 'Sales manager', createdDate: '2026-10-18', expectedCloseDate: '2026-11-12', amount: '2300000', probability: '35', weightedValue: '805000', nextAction: 'Arrange product demonstration', status: 'Qualified' },
      { opportunityCode: 'OPP-2026-020', company: 'Central Office Group', contactName: 'Sam K.', email: '', source: 'Campaign', owner: 'Sales lead', createdDate: '2026-10-12', expectedCloseDate: '2026-10-30', amount: '1250000', probability: '90', weightedValue: '1125000', nextAction: 'Confirm purchase decision', status: 'Negotiation' },
    ]),
  },
  {
    id: 'sales-returns', title: 'Sales returns & credit notes', singular: 'sales return', group: 'SELLING', icon: RotateCcw,
    description: 'Record return reason, source invoice, returned quantity, tax estimate and proposed customer credit/refund for review.',
    workflow: 'Link the original sale/invoice → inspect returned goods → approve credit → allocate refund or customer credit. This preview does not change inventory or issue a statutory credit note.',
    dateKey: 'returnDate', amountKey: 'creditAmount',
    fields: [text('returnNumber', 'Return reference'), text('sourceInvoice', 'Original sales invoice / receipt'), text('customer', 'Customer'), date('returnDate', 'Return date'), select('reason', 'Return reason', ['Damaged', 'Wrong item', 'Quality issue', 'Over-supplied', 'Customer changed mind', 'Other']), text('itemDescription', 'Item / SKU and condition'), amount('quantity', 'Quantity returned'), amount('unitPrice', 'Original unit selling price'), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)'), select('resolution', 'Proposed resolution', ['Customer credit', 'Refund review', 'Replacement', 'Inspect first']), status(['Draft', 'Needs inspection', 'Reviewed', 'Approved', 'Credited', 'Rejected'])],
    columns: [{ key: 'returnNumber', label: 'RETURN' }, { key: 'sourceInvoice', label: 'SOURCE INVOICE' }, { key: 'customer', label: 'CUSTOMER' }, { key: 'returnDate', label: 'RETURN DATE', kind: 'date' }, { key: 'quantity', label: 'QTY', kind: 'number' }, { key: 'creditAmount', label: 'CREDIT ESTIMATE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('SRET', [
      { returnNumber: 'SRET-2026-006', sourceInvoice: 'INV-2026-104', customer: 'Kampala Retail Mart', returnDate: '2026-10-27', reason: 'Damaged', itemDescription: 'Mixed grocery stock · carton damage', quantity: '2', unitPrice: '18500', taxTreatment: 'Standard rated', taxRate: '18', subtotal: '37000', taxAmount: '6660', creditAmount: '43660', resolution: 'Customer credit', status: 'Needs inspection' },
      { returnNumber: 'SRET-2026-005', sourceInvoice: 'INV-2026-101', customer: 'Nakasero Foods', returnDate: '2026-10-23', reason: 'Wrong item', itemDescription: 'Packaging supplies', quantity: '1', unitPrice: '12000', taxTreatment: 'Standard rated', taxRate: '18', subtotal: '12000', taxAmount: '2160', creditAmount: '14160', resolution: 'Replacement', status: 'Reviewed' },
    ]),
  },
  {
    id: 'purchase-returns', title: 'Supplier returns & debit notes', singular: 'supplier return', group: 'PROCUREMENT', icon: RotateCcw,
    description: 'Track goods returned to suppliers, source receipt/bill, rejected quantities, proposed debit amount and supplier-credit follow-up.',
    workflow: 'Link supplier receipt/bill → document reason and quantity → dispatch return → obtain supplier credit → allocate it against the payable. This preview does not reverse live stock or accounts payable.',
    dateKey: 'returnDate', amountKey: 'debitAmount',
    fields: [text('returnNumber', 'Return reference'), text('sourcePurchaseOrder', 'Purchase order / goods receipt'), text('supplier', 'Supplier'), date('returnDate', 'Return date'), select('reason', 'Return reason', ['Damaged', 'Out of specification', 'Expired', 'Wrong item', 'Over-supplied', 'Other']), text('itemDescription', 'Item / SKU and condition'), amount('quantity', 'Quantity returned'), amount('unitCost', 'Original unit cost'), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)'), status(['Draft', 'Needs inspection', 'Approved', 'Dispatched', 'Credit requested', 'Credit received', 'Rejected'])],
    columns: [{ key: 'returnNumber', label: 'RETURN' }, { key: 'sourcePurchaseOrder', label: 'SOURCE DOCUMENT' }, { key: 'supplier', label: 'SUPPLIER' }, { key: 'returnDate', label: 'RETURN DATE', kind: 'date' }, { key: 'quantity', label: 'QTY', kind: 'number' }, { key: 'debitAmount', label: 'DEBIT ESTIMATE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('PRET', [
      { returnNumber: 'PRET-2026-003', sourcePurchaseOrder: 'GRN-2026-021', supplier: 'East Africa Wholesale Ltd', returnDate: '2026-10-27', reason: 'Damaged', itemDescription: 'General merchandise · broken packaging', quantity: '3', unitCost: '14500', taxTreatment: 'Standard rated', taxRate: '18', subtotal: '43500', taxAmount: '7830', debitAmount: '51330', status: 'Credit requested' },
      { returnNumber: 'PRET-2026-002', sourcePurchaseOrder: 'PO-2026-030', supplier: 'Fresh Supply Co.', returnDate: '2026-10-22', reason: 'Out of specification', itemDescription: 'Fresh packaged goods', quantity: '2', unitCost: '8500', taxTreatment: 'Zero-rated', taxRate: '0', subtotal: '17000', taxAmount: '0', debitAmount: '17000', status: 'Approved' },
    ]),
  },
  {
    id: 'projects', title: 'Projects & cost tracking', singular: 'project', group: 'ADMINISTRATION', icon: ClipboardList,
    description: 'Plan work with an owner, customer, dates, approved budget, actual cost estimate and progress.',
    workflow: 'Create project → assign owner and dates → record tasks/costs → review budget variance → close. Budget and cost figures here are illustrative and do not post into accounting.',
    dateKey: 'targetEndDate', amountKey: 'budget',
    fields: [text('projectCode', 'Project code'), text('name', 'Project name'), text('customer', 'Customer / internal department'), text('owner', 'Project owner'), date('startDate', 'Start date'), date('targetEndDate', 'Target end date'), amount('budget', 'Approved budget'), amount('actualCost', 'Actual cost estimate'), amount('progressPercent', 'Progress (%)'), status(['Draft', 'Active', 'On hold', 'Completed', 'Cancelled'])],
    columns: [{ key: 'projectCode', label: 'PROJECT' }, { key: 'name', label: 'PROJECT NAME' }, { key: 'owner', label: 'OWNER' }, { key: 'targetEndDate', label: 'TARGET END', kind: 'date' }, { key: 'budget', label: 'BUDGET', kind: 'money' }, { key: 'budgetVariance', label: 'BUDGET REMAINING', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('PRJ', [
      { projectCode: 'PRJ-2026-008', name: 'New branch setup', customer: 'Internal', owner: 'Operations manager', startDate: '2026-10-01', targetEndDate: '2026-11-30', budget: '18000000', actualCost: '7250000', progressPercent: '40', budgetVariance: '10750000', status: 'Active' },
      { projectCode: 'PRJ-2026-007', name: 'Warehouse relabelling', customer: 'Internal', owner: 'Inventory lead', startDate: '2026-10-10', targetEndDate: '2026-10-31', budget: '2500000', actualCost: '1950000', progressPercent: '80', budgetVariance: '550000', status: 'Active' },
    ]),
  },
  {
    id: 'tasks', title: 'Tasks & work queue', singular: 'task', group: 'ADMINISTRATION', icon: Activity,
    description: 'Track actionable work with project link, owner, priority, due date, estimated hours and completion status.',
    workflow: 'Create task → assign owner → start work → record effort/blockers → complete and review. Preview tasks do not create external notifications or enforce staff permissions.',
    dateKey: 'dueDate',
    fields: [text('taskCode', 'Task reference'), text('title', 'Task title'), text('project', 'Project / workstream'), text('assignedTo', 'Assigned to'), select('priority', 'Priority', ['Low', 'Normal', 'High', 'Urgent']), date('startDate', 'Start date'), date('dueDate', 'Due date'), amount('estimatedHours', 'Estimated hours'), amount('actualHours', 'Actual hours'), { key: 'blocker', label: 'Blocker / notes', kind: 'textarea', fullWidth: true, required: false }, status(['Open', 'In progress', 'Blocked', 'Done', 'Cancelled'])],
    columns: [{ key: 'taskCode', label: 'TASK' }, { key: 'title', label: 'TASK TITLE' }, { key: 'assignedTo', label: 'OWNER' }, { key: 'priority', label: 'PRIORITY' }, { key: 'dueDate', label: 'DUE DATE', kind: 'date' }, { key: 'estimatedHours', label: 'EST. HOURS', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('TASK', [
      { taskCode: 'TASK-2026-032', title: 'Verify opening stock', project: 'Warehouse relabelling', assignedTo: 'Inventory lead', priority: 'High', startDate: '2026-10-27', dueDate: '2026-10-29', estimatedHours: '4', actualHours: '1.5', blocker: '', status: 'In progress' },
      { taskCode: 'TASK-2026-031', title: 'Confirm supplier delivery', project: 'New branch setup', assignedTo: 'Procurement officer', priority: 'Urgent', startDate: '2026-10-26', dueDate: '2026-10-28', estimatedHours: '1', actualHours: '0.5', blocker: 'Waiting for supplier', status: 'Blocked' },
    ]),
  },
  {
    id: 'support', title: 'Customer support cases', singular: 'support case', group: 'ADMINISTRATION', icon: HandCoins,
    description: 'Track customer issues, channels, priority, owner, response deadline and resolution without losing the conversation reference.',
    workflow: 'Open case → triage → assign → investigate → resolve → close or reopen. No email/SMS or external help-desk synchronization is connected in preview mode.',
    dateKey: 'createdDate',
    fields: [text('ticketNumber', 'Ticket reference'), date('createdDate', 'Created date'), text('customer', 'Customer'), text('contact', 'Contact / phone', false), select('channel', 'Channel', ['Phone', 'Email', 'In person', 'Website', 'WhatsApp (recorded)', 'Other']), select('category', 'Category', ['Order status', 'Product quality', 'Delivery', 'Billing', 'Returns', 'Account access', 'Other']), select('priority', 'Priority', ['Low', 'Normal', 'High', 'Urgent']), text('subject', 'Issue summary'), { key: 'description', label: 'Issue details', kind: 'textarea', fullWidth: true }, text('assignedTo', 'Assigned to'), date('responseDue', 'Response due date'), { key: 'resolution', label: 'Resolution notes', kind: 'textarea', fullWidth: true, required: false }, status(['New', 'Triaged', 'In progress', 'Waiting on customer', 'Resolved', 'Closed', 'Reopened'])],
    columns: [{ key: 'ticketNumber', label: 'TICKET' }, { key: 'createdDate', label: 'CREATED', kind: 'date' }, { key: 'customer', label: 'CUSTOMER' }, { key: 'subject', label: 'ISSUE' }, { key: 'priority', label: 'PRIORITY' }, { key: 'assignedTo', label: 'OWNER' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('CASE', [
      { ticketNumber: 'CASE-2026-015', createdDate: '2026-10-27', customer: 'Kampala Retail Mart', contact: '+256 700 000 101', channel: 'Phone', category: 'Delivery', priority: 'High', subject: 'Short delivery on order SO-2026-018', description: 'Customer reports that two cartons were not received.', assignedTo: 'Customer service', responseDue: '2026-10-29', resolution: '', status: 'In progress' },
      { ticketNumber: 'CASE-2026-014', createdDate: '2026-10-25', customer: 'Nakasero Foods', contact: '', channel: 'Email', category: 'Billing', priority: 'Normal', subject: 'Clarification of invoice tax', description: 'Customer requests a breakdown of the estimated tax line.', assignedTo: 'Accounts team', responseDue: '2026-10-28', resolution: '', status: 'Waiting on customer' },
    ]),
  },
  {
    id: 'work-orders', title: 'Production & assembly orders', singular: 'work order', group: 'INVENTORY', icon: ShoppingCart,
    description: 'Preview planned production or kit assembly, target quantities, progress, dates and estimated material cost.',
    workflow: 'Plan order → confirm materials and recipe/BOM → release → record production and scrap → quality inspect → receive finished goods. This page does not consume components or create finished stock.',
    dateKey: 'targetDate', amountKey: 'plannedCost',
    fields: [text('workOrderNumber', 'Work-order reference'), text('productCode', 'Finished product / assembly SKU'), text('productName', 'Finished product / assembly'), text('branch', 'Production branch / location'), date('startDate', 'Start date'), date('targetDate', 'Target completion date'), amount('plannedQuantity', 'Planned output quantity'), amount('completedQuantity', 'Completed output quantity'), amount('unitCost', 'Estimated cost per unit'), status(['Draft', 'Planned', 'In progress', 'Quality check', 'Completed', 'On hold', 'Cancelled'])],
    columns: [{ key: 'workOrderNumber', label: 'WORK ORDER' }, { key: 'productCode', label: 'OUTPUT SKU' }, { key: 'productName', label: 'OUTPUT' }, { key: 'targetDate', label: 'TARGET DATE', kind: 'date' }, { key: 'plannedQuantity', label: 'PLANNED', kind: 'number' }, { key: 'completionPercent', label: 'PROGRESS (%)', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('WO', [
      { workOrderNumber: 'WO-2026-008', productCode: 'KIT-HOME-01', productName: 'Household starter bundle', branch: 'Main branch', startDate: '2026-10-27', targetDate: '2026-10-30', plannedQuantity: '50', completedQuantity: '18', unitCost: '42000', plannedCost: '2100000', completionPercent: '36', status: 'In progress' },
      { workOrderNumber: 'WO-2026-007', productCode: 'KIT-OFFICE-02', productName: 'Office essentials kit', branch: 'Warehouse', startDate: '2026-10-23', targetDate: '2026-10-27', plannedQuantity: '25', completedQuantity: '25', unitCost: '58000', plannedCost: '1450000', completionPercent: '100', status: 'Quality check' },
    ]),
  },
  {
    id: 'quality', title: 'Quality inspections', singular: 'quality inspection', group: 'INVENTORY', icon: PackageCheck,
    description: 'Capture acceptance checks for received goods, production output or customer returns, including inspected, accepted and rejected quantities.',
    workflow: 'Open inspection → identify source and item → count samples/units → record defects → accept, reject or request rework. Accepted quantities do not post to stock in preview mode.',
    dateKey: 'inspectionDate',
    fields: [text('inspectionNumber', 'Inspection reference'), select('sourceType', 'Inspection source', ['Goods receipt', 'Production order', 'Customer return', 'Supplier return']), text('sourceReference', 'Source reference'), text('item', 'Product / SKU'), date('inspectionDate', 'Inspection date'), text('inspector', 'Inspector'), amount('inspectedQuantity', 'Quantity inspected'), amount('acceptedQuantity', 'Quantity accepted'), amount('rejectedQuantity', 'Quantity rejected'), select('defectType', 'Defect classification', ['None identified', 'Packaging damage', 'Wrong specification', 'Expiry / shelf-life', 'Functionality', 'Contamination risk', 'Other']), { key: 'notes', label: 'Findings / corrective action', kind: 'textarea', fullWidth: true, required: false }, status(['Draft', 'Inspection', 'Accepted', 'Rejected', 'Needs rework'])],
    columns: [{ key: 'inspectionNumber', label: 'INSPECTION' }, { key: 'sourceType', label: 'SOURCE TYPE' }, { key: 'sourceReference', label: 'SOURCE REF.' }, { key: 'item', label: 'ITEM' }, { key: 'inspectionDate', label: 'DATE', kind: 'date' }, { key: 'rejectedQuantity', label: 'REJECTED', kind: 'number' }, { key: 'status', label: 'RESULT', kind: 'status' }],
    initial: seed('QI', [
      { inspectionNumber: 'QI-2026-011', sourceType: 'Goods receipt', sourceReference: 'GRN-2026-021', item: 'Mixed merchandise cartons', inspectionDate: '2026-10-27', inspector: 'Quality reviewer', inspectedQuantity: '24', acceptedQuantity: '21', rejectedQuantity: '3', defectType: 'Packaging damage', notes: 'Segregate damaged units; request supplier credit.', status: 'Needs rework' },
      { inspectionNumber: 'QI-2026-010', sourceType: 'Production order', sourceReference: 'WO-2026-007', item: 'Office essentials kit', inspectionDate: '2026-10-27', inspector: 'Warehouse lead', inspectedQuantity: '25', acceptedQuantity: '25', rejectedQuantity: '0', defectType: 'None identified', notes: 'Ready for finished-goods receiving after final review.', status: 'Accepted' },
    ]),
  },
  {
    id: 'batches', title: 'Batch, serial & expiry tracking', singular: 'tracked lot', group: 'INVENTORY', icon: PackageCheck,
    description: 'Trace lot/batch or serial identifiers by product, supplier, warehouse, received quantity and expiry date.',
    workflow: 'Record receipt lot/serial → set storage location and expiry → quarantine/release as required → trace consumption, return or recall. This preview does not alter stock balances.',
    dateKey: 'receivedDate',
    fields: [text('trackingReference', 'Batch / serial reference'), select('trackingType', 'Tracking type', ['Batch / lot', 'Serial number', 'Expiry lot']), text('productSKU', 'Product SKU'), text('productName', 'Product name'), text('supplier', 'Supplier'), text('warehouse', 'Warehouse / bin'), date('receivedDate', 'Received date'), date('expiryDate', 'Expiry date', false), amount('receivedQuantity', 'Received quantity'), amount('availableQuantity', 'Available quantity'), text('supplierLot', 'Supplier lot / certificate', false), status(['In stock', 'Quarantined', 'Expired', 'Recalled', 'Depleted'])],
    columns: [{ key: 'trackingReference', label: 'BATCH / SERIAL' }, { key: 'productSKU', label: 'SKU' }, { key: 'productName', label: 'PRODUCT' }, { key: 'warehouse', label: 'LOCATION' }, { key: 'expiryDate', label: 'EXPIRY', kind: 'date' }, { key: 'availableQuantity', label: 'AVAILABLE', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('LOT', [
      { trackingReference: 'LOT-RICE-2610-A', trackingType: 'Batch / lot', productSKU: 'RICE-005', productName: 'Rice 5kg', supplier: 'East Africa Wholesale Ltd', warehouse: 'Main store / A-01', receivedDate: '2026-10-27', expiryDate: '2027-10-27', receivedQuantity: '48', availableQuantity: '42', supplierLot: 'EA-RICE-1007', status: 'In stock' },
      { trackingReference: 'LOT-DAIRY-2610-B', trackingType: 'Expiry lot', productSKU: 'DAIRY-002', productName: 'Long-life milk', supplier: 'Fresh Supply Co.', warehouse: 'Cool storage / B-02', receivedDate: '2026-10-20', expiryDate: '2026-11-04', receivedQuantity: '120', availableQuantity: '36', supplierLot: 'FS-MILK-420', status: 'In stock' },
    ]),
  },
  {
    id: 'leads', title: 'Leads & prospect tracking', singular: 'lead', group: 'CRM', icon: Users,
    description: 'Capture prospects, source, contacts, owner, estimated value and the next action before qualification.',
    workflow: 'Capture → contact → qualify → create an opportunity or mark lost. Email campaigns, lead scoring models and external CRM sync are not connected in this preview.',
    dateKey: 'createdDate', amountKey: 'estimatedValue',
    fields: [text('leadCode', 'Lead reference'), text('company', 'Company / prospect'), text('contactName', 'Contact person'), { ...text('email', 'Email address', false), kind: 'email' }, { ...text('phone', 'Phone number', false), kind: 'tel' }, select('source', 'Lead source', ['Referral', 'Website', 'Walk-in', 'Campaign', 'Partner', 'Social media', 'Other']), text('owner', 'Lead owner'), date('createdDate', 'Created date'), date('expectedCloseDate', 'Expected close date', false), amount('estimatedValue', 'Estimated deal value'), amount('probability', 'Qualification probability (%)'), text('nextAction', 'Next action'), status(['New', 'Contacted', 'Qualified', 'Converted', 'Lost'])],
    columns: [{ key: 'leadCode', label: 'LEAD' }, { key: 'company', label: 'PROSPECT' }, { key: 'contactName', label: 'CONTACT' }, { key: 'source', label: 'SOURCE' }, { key: 'createdDate', label: 'CREATED', kind: 'date' }, { key: 'estimatedValue', label: 'EST. VALUE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('LEAD', [
      { leadCode: 'LEAD-2026-034', company: 'Kawempe Trade Centre', contactName: 'Mariam K.', email: 'mariam@example.test', phone: '+256 700 000 301', source: 'Referral', owner: 'Sales manager', createdDate: '2026-10-27', expectedCloseDate: '2026-11-12', estimatedValue: '4200000', probability: '25', nextAction: 'Confirm required product mix', status: 'Qualified' },
      { leadCode: 'LEAD-2026-033', company: 'Victoria Office Mart', contactName: 'Daniel O.', email: 'daniel@example.test', phone: '+256 700 000 302', source: 'Website', owner: 'Sales lead', createdDate: '2026-10-25', expectedCloseDate: '2026-11-20', estimatedValue: '2750000', probability: '10', nextAction: 'Schedule discovery call', status: 'New' },
      { leadCode: 'LEAD-2026-032', company: 'Central Schools Network', contactName: 'Rose A.', email: '', phone: '+256 700 000 303', source: 'Partner', owner: 'Sales manager', createdDate: '2026-10-22', expectedCloseDate: '2026-11-05', estimatedValue: '6800000', probability: '60', nextAction: 'Share term quotation', status: 'Contacted' },
    ]),
  },
  {
    id: 'cash-sessions', title: 'POS sessions & cash-up', singular: 'POS cash session', group: 'SELLING', icon: Banknote,
    description: 'Reconcile an operator’s opening float, cash sales, cash refunds, cash drops and counted drawer balance at shift close.',
    workflow: 'Open session → record sales/refunds/drops → count drawer → investigate over/short variance → review and close. The preview does not read the live checkout ledger or move money.',
    dateKey: 'sessionDate', amountKey: 'expectedCash',
    fields: [text('sessionNumber', 'Session reference'), text('terminal', 'Terminal / till'), date('sessionDate', 'Business date'), text('openedBy', 'Opened by'), amount('openingFloat', 'Opening float'), amount('cashSales', 'Cash sales recorded'), amount('cashRefunds', 'Cash refunds recorded'), amount('cashDrops', 'Cash drops / safe deposits'), amount('countedCash', 'Counted cash at close'), text('closedBy', 'Counted / closed by', false), { key: 'closingNotes', label: 'Variance explanation / notes', kind: 'textarea', fullWidth: true, required: false }, status(['Open', 'Count entered', 'Variance review', 'Reviewed', 'Closed'])],
    columns: [{ key: 'sessionNumber', label: 'SESSION' }, { key: 'terminal', label: 'TERMINAL' }, { key: 'sessionDate', label: 'BUSINESS DATE', kind: 'date' }, { key: 'openingFloat', label: 'OPENING FLOAT', kind: 'money' }, { key: 'expectedCash', label: 'EXPECTED CASH', kind: 'money' }, { key: 'countedCash', label: 'COUNTED CASH', kind: 'money' }, { key: 'variance', label: 'OVER / SHORT', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('CASHSES', [
      { sessionNumber: 'POS-2026-1028-01', terminal: 'Front counter', sessionDate: '2026-10-28', openedBy: 'Pat Cashier', openingFloat: '150000', cashSales: '480000', cashRefunds: '25000', cashDrops: '100000', expectedCash: '505000', countedCash: '500000', variance: '-5000', closedBy: 'Pat Cashier', closingNotes: 'Short by UGX 5,000; manager review requested.', status: 'Variance review' },
      { sessionNumber: 'POS-2026-1027-02', terminal: 'Warehouse counter', sessionDate: '2026-10-27', openedBy: 'Chris Store', openingFloat: '100000', cashSales: '350000', cashRefunds: '0', cashDrops: '50000', expectedCash: '400000', countedCash: '400000', variance: '0', closedBy: 'Chris Store', closingNotes: '', status: 'Closed' },
    ]),
  },
  {
    id: 'boms', title: 'Bills of materials / recipes', singular: 'bill of materials', group: 'MANUFACTURING', icon: ClipboardList,
    description: 'Define a finished product, planned output, component summary, version and estimated material cost for simple assembly or production.',
    workflow: 'Draft BOM → review component requirements → activate version → plan work order → issue materials → record output and quality. This compact preview does not reserve or consume stock.',
    dateKey: 'effectiveFrom', amountKey: 'estimatedMaterialCost',
    fields: [text('bomCode', 'BOM reference'), text('finishedProductSKU', 'Finished product SKU'), text('finishedProductName', 'Finished product name'), text('version', 'BOM version'), amount('outputQuantity', 'Output quantity per run'), { key: 'componentSummary', label: 'Components and quantities', kind: 'textarea', fullWidth: true, required: true, placeholder: 'Example: Body × 1; screws × 4; packaging × 1' }, amount('unitMaterialCost', 'Estimated material cost per output unit'), date('effectiveFrom', 'Effective from'), date('effectiveTo', 'Effective until', false), status(['Draft', 'Review', 'Active', 'Superseded', 'Archived'])],
    columns: [{ key: 'bomCode', label: 'BOM' }, { key: 'finishedProductSKU', label: 'FINISHED SKU' }, { key: 'finishedProductName', label: 'FINISHED PRODUCT' }, { key: 'version', label: 'VERSION' }, { key: 'outputQuantity', label: 'OUTPUT QTY', kind: 'number' }, { key: 'estimatedMaterialCost', label: 'RUN COST ESTIMATE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('BOM', [
      { bomCode: 'BOM-2026-004', finishedProductSKU: 'KIT-OFF-01', finishedProductName: 'Office essentials kit', version: '1.0', outputQuantity: '1', componentSummary: 'Notebook × 2; pen × 3; folder × 1; package × 1', unitMaterialCost: '18500', estimatedMaterialCost: '18500', effectiveFrom: '2026-10-01', effectiveTo: '', status: 'Active' },
      { bomCode: 'BOM-2026-003', finishedProductSKU: 'KIT-CLEAN-01', finishedProductName: 'Cleaning starter kit', version: '2.0', outputQuantity: '1', componentSummary: 'Soap × 2; cloth × 3; gloves × 1', unitMaterialCost: '24000', estimatedMaterialCost: '24000', effectiveFrom: '2026-09-01', effectiveTo: '', status: 'Review' },
    ]),
  },
  {
    id: 'job-cards', title: 'Production job cards', singular: 'job card', group: 'MANUFACTURING', icon: ClipboardList,
    description: 'Track the operation, workstation, assigned operator, planned and actual hours, and completion state for a production work order.',
    workflow: 'Work order → job card by operation → record labour/time → record output → inspection. These time figures do not post payroll or consume inventory.',
    dateKey: 'startDate', amountKey: 'hoursVariance',
    fields: [text('jobCardNumber', 'Job-card reference'), text('workOrderNumber', 'Work-order reference'), text('operation', 'Operation / step'), text('workstation', 'Workstation / equipment'), text('operator', 'Assigned operator'), amount('plannedHours', 'Planned hours'), amount('actualHours', 'Actual hours recorded'), date('startDate', 'Planned / actual start date'), date('endDate', 'Completion date', false), text('outputReference', 'Output / scrap note', false), status(['Draft', 'Ready', 'In progress', 'Paused', 'Completed', 'Needs review'])],
    columns: [{ key: 'jobCardNumber', label: 'JOB CARD' }, { key: 'workOrderNumber', label: 'WORK ORDER' }, { key: 'operation', label: 'OPERATION' }, { key: 'workstation', label: 'WORKSTATION' }, { key: 'operator', label: 'OPERATOR' }, { key: 'plannedHours', label: 'PLANNED HRS', kind: 'number' }, { key: 'actualHours', label: 'ACTUAL HRS', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('JOB', [
      { jobCardNumber: 'JOB-2026-014', workOrderNumber: 'WO-2026-008', operation: 'Assembly', workstation: 'Bench A', operator: 'Pat Inventory', plannedHours: '2', actualHours: '1.5', startDate: '2026-10-28', endDate: '', outputReference: 'First 12 units completed', status: 'In progress' },
      { jobCardNumber: 'JOB-2026-013', workOrderNumber: 'WO-2026-007', operation: 'Final packing', workstation: 'Packing station', operator: 'Chris Store', plannedHours: '3', actualHours: '3.5', startDate: '2026-10-27', endDate: '2026-10-27', outputReference: 'Overrun due to relabelling', status: 'Completed' },
    ]),
  },
  {
    id: 'leave', title: 'Leave requests', singular: 'leave request', group: 'PEOPLE & PAYROLL', icon: Clock3,
    description: 'Capture staff leave dates, leave type, requested days, approver and approval state before HR and payroll integration.',
    workflow: 'Employee request → manager review → approve/reject → adjust attendance/payroll according to policy. Requested days in this screen are calendar-day estimates and are not deducted from a leave balance.',
    dateKey: 'startDate',
    fields: [text('leaveRequestNumber', 'Leave request reference'), text('employee', 'Employee'), select('leaveType', 'Leave type', ['Annual', 'Sick', 'Maternity / paternity', 'Compassionate', 'Unpaid', 'Study', 'Other']), date('startDate', 'Start date'), date('endDate', 'End date'), amount('daysRequested', 'Requested calendar days'), text('reason', 'Reason / handover note', false), text('approver', 'Approver', false), status(['Requested', 'Approved', 'Rejected', 'Cancelled', 'Taken'])],
    columns: [{ key: 'leaveRequestNumber', label: 'REQUEST' }, { key: 'employee', label: 'EMPLOYEE' }, { key: 'leaveType', label: 'TYPE' }, { key: 'startDate', label: 'START', kind: 'date' }, { key: 'endDate', label: 'END', kind: 'date' }, { key: 'daysRequested', label: 'CALENDAR DAYS', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('LEAVE', [
      { leaveRequestNumber: 'LR-2026-018', employee: 'Alex Manager', leaveType: 'Annual', startDate: '2026-11-02', endDate: '2026-11-04', daysRequested: '3', reason: 'Family travel', approver: 'Business owner', status: 'Requested' },
      { leaveRequestNumber: 'LR-2026-017', employee: 'Pat Inventory', leaveType: 'Sick', startDate: '2026-10-20', endDate: '2026-10-20', daysRequested: '1', reason: 'Medical appointment', approver: 'Alex Manager', status: 'Approved' },
    ]),
  },
  {
    id: 'replenishment', title: 'Reorder planning', singular: 'replenishment rule', group: 'INVENTORY', icon: ArrowLeftRight,
    description: 'Estimate replenishment quantity from on-hand stock, reorder point, average demand, supplier lead time and safety stock.',
    workflow: 'Review demand and current stock → calculate recommended quantity → prepare purchase order → receive and reconcile stock. Recommendation is a planning estimate, not an automatic purchase.',
    dateKey: 'reviewDate',
    fields: [text('replenishmentNumber', 'Planning reference'), text('productSKU', 'Product SKU'), text('productName', 'Product'), text('warehouse', 'Warehouse / branch'), date('reviewDate', 'Review date'), amount('onHand', 'On-hand quantity'), amount('reorderPoint', 'Reorder point'), amount('averageDailyDemand', 'Average daily demand'), amount('leadTimeDays', 'Supplier lead time (days)'), amount('safetyStock', 'Safety stock quantity'), text('preferredSupplier', 'Preferred supplier', false), status(['Review needed', 'Reviewed', 'Draft PO created', 'Ordered', 'On hold'])],
    columns: [{ key: 'replenishmentNumber', label: 'PLAN' }, { key: 'productSKU', label: 'SKU' }, { key: 'productName', label: 'PRODUCT' }, { key: 'warehouse', label: 'LOCATION' }, { key: 'onHand', label: 'ON HAND', kind: 'number' }, { key: 'recommendedQuantity', label: 'RECOMMENDED QTY', kind: 'number' }, { key: 'needByDate', label: 'EST. NEED BY', kind: 'date' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('REPL', [
      { replenishmentNumber: 'REPL-2026-014', productSKU: 'DAIRY-002', productName: 'Long-life milk', warehouse: 'Main store', reviewDate: '2026-10-28', onHand: '36', reorderPoint: '60', averageDailyDemand: '8', leadTimeDays: '4', safetyStock: '15', preferredSupplier: 'Fresh Supply Co.', recommendedQuantity: '11', needByDate: '2026-10-31', status: 'Review needed' },
      { replenishmentNumber: 'REPL-2026-013', productSKU: 'RICE-005', productName: 'Rice 5kg', warehouse: 'Main store', reviewDate: '2026-10-27', onHand: '42', reorderPoint: '30', averageDailyDemand: '3', leadTimeDays: '3', safetyStock: '12', preferredSupplier: 'East Africa Wholesale Ltd', recommendedQuantity: '0', needByDate: '2026-11-06', status: 'Reviewed' },
    ]),
  },
  {
    id: 'packages', title: 'Packages & packing slips', singular: 'package record', group: 'LOGISTICS', icon: PackageCheck,
    description: 'Prepare package references, customer, sales order, packed items, cartons, weight, courier and tracking before dispatch.',
    workflow: 'Confirmed sales order → create one or more packages → ship/track → confirm delivery. Packages and deliveries are separate preview records; neither fulfils stock or sends carrier requests.',
    dateKey: 'packageDate',
    fields: [text('packageNumber', 'Package reference'), text('salesOrder', 'Sales order reference'), text('customer', 'Customer'), date('packageDate', 'Package date'), text('itemSummary', 'Packed items / quantities'), amount('packageCount', 'Number of packages'), amount('weightKg', 'Total weight (kg)'), text('courier', 'Courier / own fleet', false), text('trackingReference', 'Tracking reference', false), status(['Not shipped', 'Shipped', 'Delivered', 'Exception'])],
    columns: [{ key: 'packageNumber', label: 'PACKAGE' }, { key: 'salesOrder', label: 'SALES ORDER' }, { key: 'customer', label: 'CUSTOMER' }, { key: 'packageDate', label: 'PACKED', kind: 'date' }, { key: 'packageCount', label: 'PACKAGES', kind: 'number' }, { key: 'courier', label: 'COURIER' }, { key: 'trackingReference', label: 'TRACKING' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('PKG', [
      { packageNumber: 'PKG-2026-041', salesOrder: 'SO-2026-018', customer: 'Kampala Retail Mart', packageDate: '2026-10-28', itemSummary: 'Mixed grocery stock · 4 cartons', packageCount: '4', weightKg: '68.5', courier: 'Own fleet', trackingReference: 'LEXA-DEMO-041', status: 'Not shipped' },
      { packageNumber: 'PKG-2026-040', salesOrder: 'SO-2026-017', customer: 'Nakasero Foods', packageDate: '2026-10-26', itemSummary: 'Packaging supplies · 2 cartons', packageCount: '2', weightKg: '24', courier: 'City Courier', trackingReference: 'CC-DEMO-099', status: 'Shipped' },
    ]),
  },
  {
    id: 'contacts', title: 'Contacts & addresses', singular: 'contact', group: 'CRM', icon: Users,
    description: 'Keep reusable people, communication preferences and follow-up dates linked to a customer, supplier, lead or employee.',
    workflow: 'Party → contact / address → quotation, order, invoice or case. Keep a person as a contact instead of creating a duplicate customer record for every employee or location.',
    dateKey: 'nextFollowUp',
    fields: [text('contactCode', 'Contact reference'), select('partyType', 'Linked party type', ['Customer', 'Supplier', 'Lead', 'Employee', 'Other']), text('partyName', 'Linked party / organization'), text('contactName', 'Contact full name'), text('jobTitle', 'Job title', false), { ...text('email', 'Email address', false), kind: 'email' }, { ...text('phone', 'Phone number', false), kind: 'tel' }, select('preferredChannel', 'Preferred contact method', ['Phone', 'Email', 'WhatsApp', 'In person', 'Other'], false), date('nextFollowUp', 'Next follow-up date', false), { key: 'notes', label: 'Notes', kind: 'textarea', fullWidth: true, required: false }, status(['Active', 'Inactive'])],
    columns: [{ key: 'contactCode', label: 'CONTACT' }, { key: 'contactName', label: 'NAME' }, { key: 'partyName', label: 'PARTY' }, { key: 'partyType', label: 'TYPE' }, { key: 'phone', label: 'PHONE' }, { key: 'nextFollowUp', label: 'FOLLOW-UP', kind: 'date' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('CON', [
      { contactCode: 'CON-2026-011', partyType: 'Customer', partyName: 'Kampala Retail Mart', contactName: 'Grace N.', jobTitle: 'Accounts manager', email: 'grace@example.test', phone: '+256 700 000 111', preferredChannel: 'Email', nextFollowUp: '2026-10-30', notes: 'Invoice and delivery coordination', status: 'Active' },
      { contactCode: 'CON-2026-010', partyType: 'Supplier', partyName: 'East Africa Wholesale Ltd', contactName: 'Daniel K.', jobTitle: 'Sales representative', email: 'daniel@example.test', phone: '+256 700 000 212', preferredChannel: 'Phone', nextFollowUp: '2026-10-29', notes: 'Confirm order lead time', status: 'Active' },
    ]),
  },
  {
    id: 'campaigns', title: 'Campaigns & acquisition', singular: 'campaign', group: 'CRM', icon: Target,
    description: 'Track lead-generation campaign channels, owner, period, spend and sourced lead / opportunity counts.',
    workflow: 'Plan campaign → record campaign activity in CRM → compare spend and sourced pipeline. Attribution must be recorded consistently; this preview does not send email or advertising.',
    dateKey: 'startDate', amountKey: 'actualSpend',
    fields: [text('campaignCode', 'Campaign reference'), text('name', 'Campaign name'), select('channel', 'Channel', ['Referral', 'In-store', 'Field sales', 'Email', 'Social', 'Website', 'Event', 'Partner', 'Other']), text('owner', 'Campaign owner'), date('startDate', 'Start date'), date('endDate', 'End date'), amount('budget', 'Budget'), amount('actualSpend', 'Actual spend'), amount('leadsGenerated', 'Leads generated'), amount('opportunitiesCreated', 'Opportunities created'), status(['Draft', 'Planned', 'Active', 'Completed', 'Cancelled'])],
    columns: [{ key: 'campaignCode', label: 'CAMPAIGN' }, { key: 'name', label: 'NAME' }, { key: 'channel', label: 'CHANNEL' }, { key: 'startDate', label: 'START', kind: 'date' }, { key: 'budget', label: 'BUDGET', kind: 'money' }, { key: 'actualSpend', label: 'SPEND', kind: 'money' }, { key: 'leadsGenerated', label: 'LEADS', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('CMP', [
      { campaignCode: 'CMP-2026-006', name: 'October neighbourhood outreach', channel: 'Field sales', owner: 'Alex Manager', startDate: '2026-10-01', endDate: '2026-10-31', budget: '850000', actualSpend: '620000', leadsGenerated: '42', opportunitiesCreated: '11', status: 'Active' },
      { campaignCode: 'CMP-2026-005', name: 'Wholesale customer referrals', channel: 'Referral', owner: 'Sales lead', startDate: '2026-09-01', endDate: '2026-09-30', budget: '300000', actualSpend: '245000', leadsGenerated: '28', opportunitiesCreated: '8', status: 'Completed' },
    ]),
  },
  {
    id: 'sales-teams', title: 'Sales team & territories', singular: 'sales performance record', group: 'CRM', icon: Users,
    description: 'Review salesperson ownership, territory, target, achieved sales and an indicative commission estimate.',
    workflow: 'Assign account / territory → record sales activity → review target achievement. Commission is illustrative only and does not create payroll or a payment.',
    dateKey: 'periodEnd',
    fields: [text('salespersonCode', 'Salesperson reference'), text('salesperson', 'Salesperson name'), text('territory', 'Territory / area'), { ...text('email', 'Work email', false), kind: 'email' }, date('periodEnd', 'Target period end'), amount('salesTarget', 'Sales target'), amount('salesAchieved', 'Achieved sales value'), amount('commissionRate', 'Indicative commission (%)'), status(['Active', 'On leave', 'Inactive'])],
    columns: [{ key: 'salespersonCode', label: 'CODE' }, { key: 'salesperson', label: 'SALESPERSON' }, { key: 'territory', label: 'TERRITORY' }, { key: 'salesTarget', label: 'TARGET', kind: 'money' }, { key: 'salesAchieved', label: 'ACHIEVED', kind: 'money' }, { key: 'achievementPercent', label: 'ACHIEVEMENT', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('REP', [
      { salespersonCode: 'REP-001', salesperson: 'Alex Manager', territory: 'Kampala Central', email: 'alex@example.test', periodEnd: '2026-10-31', salesTarget: '15000000', salesAchieved: '11800000', commissionRate: '2', achievementPercent: '78.67', indicativeCommission: '236000', status: 'Active' },
      { salespersonCode: 'REP-002', salesperson: 'Pat Sales', territory: 'Greater Kampala', email: 'pat@example.test', periodEnd: '2026-10-31', salesTarget: '9000000', salesAchieved: '9700000', commissionRate: '1.5', achievementPercent: '107.78', indicativeCommission: '145500', status: 'Active' },
    ]),
  },
  {
    id: 'item-bundles', title: 'Item bundles & composite items', singular: 'item bundle', group: 'INVENTORY', icon: Boxes,
    description: 'Define a sellable bundle with a component summary, expected component count, unit cost and bundle price.',
    workflow: 'Define the bundle → validate components and quantity rules → use it in a sale or production plan. Component stock deduction is not connected in this interface preview.',
    amountKey: 'sellingPrice',
    fields: [text('bundleCode', 'Bundle reference'), text('bundleName', 'Bundle name'), text('sku', 'Bundle SKU'), { key: 'componentsSummary', label: 'Component items and quantities', kind: 'textarea', required: true, fullWidth: true, help: 'Preview summary only; this is not yet a structured component-line editor.' }, amount('componentCount', 'Number of component lines'), amount('unitCost', 'Estimated component cost per bundle'), amount('sellingPrice', 'Selling price per bundle'), status(['Draft', 'Review', 'Active', 'Inactive'])],
    columns: [{ key: 'bundleCode', label: 'BUNDLE' }, { key: 'bundleName', label: 'NAME' }, { key: 'sku', label: 'SKU' }, { key: 'componentCount', label: 'COMPONENT LINES', kind: 'number' }, { key: 'unitCost', label: 'COST ESTIMATE', kind: 'money' }, { key: 'sellingPrice', label: 'SELLING PRICE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('BND', [
      { bundleCode: 'BND-2026-004', bundleName: 'Home starter pack', sku: 'BND-HOME-01', componentsSummary: 'Rice 5kg × 1; cooking oil 1L × 2; sugar 2kg × 1', componentCount: '3', unitCost: '52000', sellingPrice: '65000', grossMargin: '13000', marginPercent: '20', status: 'Active' },
      { bundleCode: 'BND-2026-003', bundleName: 'Office supply kit', sku: 'BND-OFFICE-01', componentsSummary: 'Exercise books × 10; pens × 12; files × 5', componentCount: '3', unitCost: '28500', sellingPrice: '36000', grossMargin: '7500', marginPercent: '20.83', status: 'Review' },
    ]),
  },
  {
    id: 'picklists', title: 'Warehouse picklists', singular: 'picklist', group: 'LOGISTICS', icon: PackageCheck,
    description: 'Assign picking work from a confirmed order, measure requested versus picked units, and record short picks before packing.',
    workflow: 'Confirmed order → picklist assigned → pick and verify → report short picks → create package → dispatch. This preview does not change stock balances.',
    dateKey: 'pickDate',
    fields: [text('picklistNumber', 'Picklist reference'), text('salesOrder', 'Sales order reference'), text('warehouse', 'Warehouse'), text('picker', 'Assigned picker'), date('pickDate', 'Pick date'), amount('lineCount', 'Distinct item lines'), amount('unitsToPick', 'Units to pick'), amount('unitsPicked', 'Units picked'), status(['Draft', 'Assigned', 'Picking', 'Picked', 'Partially picked', 'Short pick', 'Cancelled'])],
    columns: [{ key: 'picklistNumber', label: 'PICKLIST' }, { key: 'salesOrder', label: 'ORDER' }, { key: 'warehouse', label: 'WAREHOUSE' }, { key: 'picker', label: 'PICKER' }, { key: 'unitsToPick', label: 'REQUESTED', kind: 'number' }, { key: 'unitsPicked', label: 'PICKED', kind: 'number' }, { key: 'pickPercent', label: 'PICKED %', kind: 'number' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('PICK', [
      { picklistNumber: 'PICK-2026-012', salesOrder: 'SO-2026-018', warehouse: 'Main store', picker: 'Pat Inventory', pickDate: '2026-10-28', lineCount: '5', unitsToPick: '60', unitsPicked: '44', unitsOutstanding: '16', pickPercent: '73.33', status: 'Picking' },
      { picklistNumber: 'PICK-2026-011', salesOrder: 'SO-2026-017', warehouse: 'Main store', picker: 'Alex Warehouse', pickDate: '2026-10-27', lineCount: '3', unitsToPick: '30', unitsPicked: '30', unitsOutstanding: '0', pickPercent: '100', status: 'Picked' },
    ]),
  },
  {
    id: 'cost-centers', title: 'Cost centres', singular: 'cost centre', group: 'FINANCE', icon: BookOpen,
    description: 'Structure departments, branches or projects so later posted costs can be attributed and compared.',
    workflow: 'Create cost-centre hierarchy → assign transactions and budgets → review actual / committed amounts. These preview definitions do not post ledger allocations.',
    fields: [text('costCenterCode', 'Cost-centre code'), text('name', 'Cost-centre name'), text('parentCostCenter', 'Parent cost centre', false), text('department', 'Department / function'), text('manager', 'Responsible manager'), status(['Active', 'Inactive'])],
    columns: [{ key: 'costCenterCode', label: 'CODE' }, { key: 'name', label: 'COST CENTRE' }, { key: 'parentCostCenter', label: 'PARENT' }, { key: 'department', label: 'DEPARTMENT' }, { key: 'manager', label: 'MANAGER' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('CC', [
      { costCenterCode: 'CC-ADM', name: 'Administration', parentCostCenter: 'Business', department: 'Corporate', manager: 'Business owner', status: 'Active' },
      { costCenterCode: 'CC-WH', name: 'Warehouse operations', parentCostCenter: 'Operations', department: 'Inventory', manager: 'Warehouse lead', status: 'Active' },
      { costCenterCode: 'CC-SALES', name: 'Sales & distribution', parentCostCenter: 'Commercial', department: 'Sales', manager: 'Sales lead', status: 'Active' },
    ]),
  },
  {
    id: 'budgets', title: 'Budgets & forecasts', singular: 'budget line', group: 'FINANCE', icon: Wallet,
    description: 'Compare approved budget, actual and committed spend and a forecast for a defined period and cost centre.',
    workflow: 'Draft budget → review → approve → compare actual / committed / forecast amounts. This view is a planning control, not a general-ledger report.',
    dateKey: 'periodStart', amountKey: 'budgetAmount',
    fields: [text('budgetCode', 'Budget reference'), text('fiscalYear', 'Fiscal year'), date('periodStart', 'Period start'), date('periodEnd', 'Period end'), text('costCenter', 'Cost centre'), text('accountCategory', 'Account / category'), amount('budgetAmount', 'Approved budget'), amount('actualAmount', 'Actual spend'), amount('committedAmount', 'Committed spend'), amount('forecastAmount', 'Forecast spend'), status(['Draft', 'Review', 'Approved', 'Closed'])],
    columns: [{ key: 'budgetCode', label: 'BUDGET' }, { key: 'fiscalYear', label: 'YEAR' }, { key: 'costCenter', label: 'COST CENTRE' }, { key: 'accountCategory', label: 'CATEGORY' }, { key: 'budgetAmount', label: 'BUDGET', kind: 'money' }, { key: 'actualAmount', label: 'ACTUAL', kind: 'money' }, { key: 'variance', label: 'VARIANCE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('BUD', [
      { budgetCode: 'BUD-2026-021', fiscalYear: '2026', periodStart: '2026-10-01', periodEnd: '2026-10-31', costCenter: 'Warehouse operations', accountCategory: 'Transport & delivery', budgetAmount: '1800000', actualAmount: '1420000', committedAmount: '180000', forecastAmount: '1720000', variance: '380000', utilisationPercent: '78.89', status: 'Approved' },
      { budgetCode: 'BUD-2026-020', fiscalYear: '2026', periodStart: '2026-10-01', periodEnd: '2026-10-31', costCenter: 'Administration', accountCategory: 'Utilities', budgetAmount: '900000', actualAmount: '840000', committedAmount: '65000', forecastAmount: '960000', variance: '60000', utilisationPercent: '93.33', status: 'Review' },
    ]),
  },
  {
    id: 'integrations', title: 'Integration status', singular: 'integration status record', group: 'INTEGRATION & CONTROL', icon: Plug,
    description: 'Catalogue future connections and their test state without entering credentials or implying a live connection exists.',
    workflow: 'Select provider → configure secrets securely in backend / deployment settings → run test connection → inspect logs → enable. This page is a status checklist only; it never stores tokens or secrets.',
    dateKey: 'lastCheckedAt',
    fields: [text('integrationCode', 'Integration reference'), select('provider', 'Provider / system', ['Existing LEXA API', 'Neon database API', 'Supabase authentication', 'Render service', 'Vercel deployment', 'URA / EFRIS', 'Mobile money', 'Bank feed', 'Carrier / delivery', 'Email / notifications', 'Other']), text('purpose', 'Purpose'), select('environment', 'Environment', ['Development', 'Preview', 'Production']), date('lastCheckedAt', 'Last checked date', false), amount('recordsProcessed', 'Records processed in last test'), select('status', 'Connection status', ['Not connected', 'Configuration needed', 'Ready for test', 'Test passed', 'Error', 'Paused']), text('lastResult', 'Last test result', false), { key: 'lastError', label: 'Last error / missing configuration', kind: 'textarea', fullWidth: true, required: false }],
    columns: [{ key: 'integrationCode', label: 'REFERENCE' }, { key: 'provider', label: 'PROVIDER' }, { key: 'purpose', label: 'PURPOSE' }, { key: 'environment', label: 'ENVIRONMENT' }, { key: 'lastCheckedAt', label: 'LAST CHECK', kind: 'date' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('INT', [
      { integrationCode: 'INT-LEXA-API', provider: 'Existing LEXA API', purpose: 'Business data API', environment: 'Preview', lastCheckedAt: '2026-10-28', recordsProcessed: '0', status: 'Configuration needed', lastResult: 'Not tested from this frontend', lastError: 'API base URL and auth contract need to be mapped.' },
      { integrationCode: 'INT-EFRIS', provider: 'URA / EFRIS', purpose: 'Tax-document exchange', environment: 'Development', lastCheckedAt: '', recordsProcessed: '0', status: 'Not connected', lastResult: 'No request made', lastError: 'Requires compliant backend integration and URA testing.' },
      { integrationCode: 'INT-MOMO', provider: 'Mobile money', purpose: 'Payment initiation / confirmation', environment: 'Development', lastCheckedAt: '', recordsProcessed: '0', status: 'Not connected', lastResult: 'No request made', lastError: 'Provider credentials and verified callback workflow are not configured.' },
    ]),
  },
  {
    id: 'recurring-invoices', title: 'Recurring billing schedules', singular: 'recurring invoice schedule', group: 'SELLING', icon: ReceiptText,
    description: 'Prepare repeating customer invoice schedules with frequency, start / next-run dates, rate and tax estimate.',
    workflow: 'Draft schedule → review billing frequency and customer consent → activate in backend scheduler → review generated invoice. Saving a preview does not schedule jobs or create invoices automatically.',
    dateKey: 'nextRunDate', amountKey: 'total',
    fields: [text('scheduleCode', 'Schedule reference'), text('customer', 'Customer'), text('description', 'Invoice description'), select('frequency', 'Frequency', ['Weekly', 'Monthly', 'Quarterly', 'Yearly']), date('startDate', 'Start date'), date('nextRunDate', 'Next run date'), date('endDate', 'End date', false), amount('quantity', 'Quantity'), amount('unitPrice', 'Unit price before tax'), select('taxTreatment', 'Tax treatment', ['Standard rated', 'Zero-rated', 'Exempt', 'Outside scope']), amount('taxRate', 'Tax rate (%)'), status(['Draft', 'Review', 'Active', 'Paused', 'Ended'])],
    columns: [{ key: 'scheduleCode', label: 'SCHEDULE' }, { key: 'customer', label: 'CUSTOMER' }, { key: 'frequency', label: 'FREQUENCY' }, { key: 'nextRunDate', label: 'NEXT RUN', kind: 'date' }, { key: 'total', label: 'INVOICE ESTIMATE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('RECINV', [
      { scheduleCode: 'RECINV-2026-003', customer: 'Kampala Retail Mart', description: 'Monthly store-support package', frequency: 'Monthly', startDate: '2026-08-01', nextRunDate: '2026-11-01', endDate: '', quantity: '1', unitPrice: '250000', taxTreatment: 'Standard rated', taxRate: '18', subtotal: '250000', taxAmount: '45000', total: '295000', status: 'Review' },
      { scheduleCode: 'RECINV-2026-002', customer: 'Nakasero Foods', description: 'Monthly packaging replenishment service', frequency: 'Monthly', startDate: '2026-06-01', nextRunDate: '2026-11-01', endDate: '2026-12-01', quantity: '1', unitPrice: '120000', taxTreatment: 'Zero-rated', taxRate: '0', subtotal: '120000', taxAmount: '0', total: '120000', status: 'Paused' },
    ]),
  },
  {
    id: 'timesheets', title: 'Timesheets & billable time', singular: 'timesheet entry', group: 'PEOPLE & PAYROLL', icon: Activity,
    description: 'Record project/task time, employee, work date, billable hours and an estimated amount for project-cost review.',
    workflow: 'Enter time → submit for manager review → approve → use for project cost or customer billing. This preview does not post payroll, project actuals or invoices automatically.',
    dateKey: 'workDate', amountKey: 'billableAmount',
    fields: [text('timesheetNumber', 'Timesheet reference'), text('employee', 'Employee'), text('project', 'Project / cost centre'), text('task', 'Task / activity'), date('workDate', 'Work date'), amount('hours', 'Total hours'), amount('billableHours', 'Billable hours'), amount('hourlyRate', 'Reference hourly rate'), { key: 'notes', label: 'Work description', kind: 'textarea', fullWidth: true, required: false }, status(['Draft', 'Submitted', 'Approved', 'Rejected', 'Invoiced'])],
    columns: [{ key: 'timesheetNumber', label: 'ENTRY' }, { key: 'employee', label: 'EMPLOYEE' }, { key: 'project', label: 'PROJECT' }, { key: 'workDate', label: 'WORK DATE', kind: 'date' }, { key: 'hours', label: 'HOURS', kind: 'number' }, { key: 'billableHours', label: 'BILLABLE', kind: 'number' }, { key: 'billableAmount', label: 'BILLABLE ESTIMATE', kind: 'money' }, { key: 'status', label: 'STATUS', kind: 'status' }],
    initial: seed('TIME', [
      { timesheetNumber: 'TIME-2026-104', employee: 'Alex Manager', project: 'PRJ-2026-008', task: 'Branch setup planning', workDate: '2026-10-27', hours: '4', billableHours: '0', hourlyRate: '45000', billableAmount: '0', notes: 'Internal implementation work', status: 'Approved' },
      { timesheetNumber: 'TIME-2026-103', employee: 'Pat Inventory', project: 'PRJ-2026-007', task: 'Warehouse relabelling', workDate: '2026-10-27', hours: '6', billableHours: '4', hourlyRate: '18000', billableAmount: '72000', notes: 'Billable external support hours estimate', status: 'Submitted' },
    ]),
  },
];

export const REPORT_MODULE = {
  id: 'reports', title: 'Reports & analytics', group: 'INSIGHTS', icon: BarChart3,
  description: 'A report centre for sales, stock, purchasing, receivables, payables, expenses and financial summaries.',
};

export const EXISTING_MODULE_LINKS = [
  { to: '/', title: 'Dashboard', description: 'Saved sales, receipts, stock-on-hand and low-stock alerts.', group: 'WORKSPACE', icon: Activity, state: 'Existing workflow' },
  { to: '/workspace', title: 'Business & branches', description: 'Workspace profile and branch configuration.', group: 'WORKSPACE', icon: Building2, state: 'Existing workflow' },
  { to: '/checkout', title: 'Checkout / POS', description: 'Cart, stock validation, recorded payments and receipt creation.', group: 'SELLING', icon: Banknote, state: 'Existing workflow' },
  { to: '/sales', title: 'Sales & returns', description: 'Sale history, receipt details, payment trail and linked returns.', group: 'SELLING', icon: ReceiptText, state: 'Existing workflow' },
  { to: '/products', title: 'Products', description: 'Product catalogue, prices, categories and stock thresholds.', group: 'INVENTORY', icon: ClipboardList, state: 'Existing workflow' },
  { to: '/inventory', title: 'Inventory', description: 'Stock balances, adjustments and movement ledger.', group: 'INVENTORY', icon: PackageCheck, state: 'Existing workflow' },
  { to: '/settings', title: 'Settings', description: 'Current local workspace settings and implementation status.', group: 'ADMINISTRATION', icon: Building2, state: 'Existing workflow' },
];

export const PHASE_TWO_LINKS = [
  ...MODULE_CATALOG.map((module) => ({ to: '/modules/' + module.id, title: module.title, description: module.description, group: module.group, icon: module.icon, state: module.readOnly ? 'Preview · read only' : 'Preview · interactive' })),
  { to: '/modules/reports', title: REPORT_MODULE.title, description: REPORT_MODULE.description, group: 'INSIGHTS', icon: REPORT_MODULE.icon, state: 'Preview · sample figures' },
];

export function getModuleDefinition(id: string | undefined): ModuleDefinition | undefined {
  return MODULE_CATALOG.find((module) => module.id === id);
}
