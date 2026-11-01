import { apiClient } from './apiClient';

const enc = (value: string) => encodeURIComponent(value);

export interface ReceivablesScope { workspaceId: string; branchId: string; }
export interface EligibleSale {
  id: string;
  receiptNumber: string;
  customerName: string;
  customerPhone?: string | null;
  totalMinor: number;
  createdAt: string;
  lineCount: number;
  quantityTotal: number;
}
export interface ReceivablesInvoiceLine {
  id: string;
  productName: string;
  quantity: number | string;
  unitPriceMinor: number;
  lineTotalMinor: number;
}
export type ReceivablesInvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'void';
export interface ReceivablesInvoice {
  id: string;
  invoiceNumber: string;
  sourceSaleId: string;
  customerName: string;
  customerRecordId?: string;
  customerPhone?: string;
  currency: string;
  issueDate?: string;
  dueDate: string;
  issuedAt?: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  receivedMinor: number;
  balanceDueMinor: number;
  status: ReceivablesInvoiceStatus;
  notes?: string;
  lines: ReceivablesInvoiceLine[];
}
export interface ReceivablesAllocation {
  invoiceId: string;
  invoiceNumber: string;
  amountMinor: number;
}
export interface CustomerReceipt {
  id: string;
  receiptNumber: string;
  customerName: string;
  paymentDate: string;
  method: string;
  reference?: string;
  amountMinor: number;
  source: string;
  createdAt: string;
  allocations: ReceivablesAllocation[];
}
export interface ReceivablesSummary {
  invoiceCount: number;
  openCount: number;
  overdueCount: number;
  outstandingMinor: number;
  overdueMinor: number;
  currentMinor: number;
  days1to30Minor: number;
  days31to60Minor: number;
  days61to90Minor: number;
  over90Minor: number;
}

function base(scope: ReceivablesScope) {
  return `/workspaces/${enc(scope.workspaceId)}/branches/${enc(scope.branchId)}/receivables`;
}
function collection<T>(value: unknown, label: string): T[] {
  if (!Array.isArray(value)) throw new Error(`The backend returned an invalid ${label} collection.`);
  return value as T[];
}
function record<T>(value: unknown, label: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`The backend returned an invalid ${label} response.`);
  return value as T;
}

export const apiReceivables = {
  async listEligibleSales(scope: ReceivablesScope) {
    return collection<EligibleSale>(await apiClient.get(`${base(scope)}/eligible-sales`), 'eligible sale');
  },
  async listInvoices(scope: ReceivablesScope) {
    return collection<ReceivablesInvoice>(await apiClient.get(`${base(scope)}/invoices`), 'customer invoice');
  },
  async createInvoice(scope: ReceivablesScope, input: { saleId: string; issueDate: string; dueDate: string; notes?: string }) {
    return record<ReceivablesInvoice>(await apiClient.post(`${base(scope)}/invoices`, input, crypto.randomUUID()), 'created customer invoice');
  },
  async issueInvoice(scope: ReceivablesScope, invoiceId: string) {
    return record<ReceivablesInvoice>(await apiClient.post(`${base(scope)}/invoices/${enc(invoiceId)}/issue`, {}, crypto.randomUUID()), 'issued customer invoice');
  },
  async voidDraftInvoice(scope: ReceivablesScope, invoiceId: string) {
    return record<ReceivablesInvoice>(await apiClient.post(`${base(scope)}/invoices/${enc(invoiceId)}/void`, {}, crypto.randomUUID()), 'voided customer invoice');
  },
  async listReceipts(scope: ReceivablesScope) {
    return collection<CustomerReceipt>(await apiClient.get(`${base(scope)}/receipts`), 'customer receipt');
  },
  async recordReceipt(scope: ReceivablesScope, input: {
    paymentDate: string;
    method: string;
    reference?: string;
    amountMinor: number;
    allocations: Array<{ invoiceId: string; amountMinor: number }>;
    idempotencyKey?: string;
  }) {
    const { idempotencyKey, ...body } = input;
    return record<CustomerReceipt>(await apiClient.post(`${base(scope)}/receipts`, body, idempotencyKey ?? crypto.randomUUID()), 'customer receipt');
  },
  async summary(scope: ReceivablesScope) {
    return record<ReceivablesSummary>(await apiClient.get(`${base(scope)}/summary`), 'accounts-receivable summary');
  },
};
