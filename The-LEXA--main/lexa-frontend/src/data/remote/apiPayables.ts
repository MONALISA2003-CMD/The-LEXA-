import { apiClient } from './apiClient';

const enc = (value: string) => encodeURIComponent(value);
export interface PayablesScope { workspaceId: string; branchId: string; }
export interface PayablesReceiptLine {
  receiptLineId: string; receiptId: string; receiptNumber: string; receiptDate?: string;
  purchaseOrderLineId: string; productId: string; productName: string; sku: string;
  acceptedQuantity: number; invoicedQuantity: number; availableQuantity: number; unitCostMinor: number;
}
export interface PayablesPurchaseOrder {
  id: string; orderNumber: string; supplierRecordId?: string; supplierName: string;
  expectedDate?: string; status: string; totalMinor: number; receiptLines: PayablesReceiptLine[];
}
export interface PayablesInvoiceLine {
  id: string; productName: string; receiptNumber: string; quantity: number;
  unitCostMinor: number; lineTotalMinor: number;
}
export type PayablesInvoiceStatus = 'draft' | 'approved' | 'partially_paid' | 'paid' | 'overdue' | 'void';
export interface PayablesInvoice {
  id: string; invoiceNumber: string; supplierInvoiceNumber: string; purchaseOrderId: string;
  purchaseOrderNumber: string; supplierRecordId?: string; supplierName: string; currency: string;
  billDate: string; dueDate: string; subtotalMinor: number; taxMinor: number; totalMinor: number;
  paidMinor: number; balanceDueMinor: number; status: PayablesInvoiceStatus; notes?: string; lines: PayablesInvoiceLine[];
}
export interface PayablesAllocation { invoiceId: string; invoiceNumber: string; supplierInvoiceNumber: string; amountMinor: number; }
export interface SupplierPayment {
  id: string; paymentNumber: string; supplierName: string; supplierRecordId?: string;
  paymentDate: string; method: string; account: string; reference?: string; amountMinor: number;
  currency: string; allocations: PayablesAllocation[];
}
export interface PayablesSummary {
  invoiceCount: number; openCount: number; overdueCount: number; outstandingMinor: number;
  overdueMinor: number; currentMinor: number; days1to30Minor: number; days31to60Minor: number;
  days61to90Minor: number; over90Minor: number;
}
export interface PayablesReconciliation {
  id: string; purchaseOrderNumber: string; supplierName: string; status: string;
  purchaseOrderTotalMinor: number; acceptedQuantity: number; receivedValueMinor: number;
  billedSubtotalMinor: number; billedPoValueMinor: number; unbilledReceivedMinor: number; billVarianceMinor: number;
  invoicedTotalMinor: number; paidMinor: number; payableBalanceMinor: number;
}
function base(scope: PayablesScope) { return `/workspaces/${enc(scope.workspaceId)}/branches/${enc(scope.branchId)}/payables`; }
function array<T>(value: unknown, label: string): T[] {
  if (!Array.isArray(value)) throw new Error(`The backend returned an invalid ${label} collection.`);
  return value as T[];
}
function record<T>(value: unknown, label: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`The backend returned an invalid ${label} response.`);
  return value as T;
}
export const apiPayables = {
  async purchaseOrders(scope: PayablesScope) { return array<PayablesPurchaseOrder>(await apiClient.get(`${base(scope)}/purchase-orders`), 'purchase-order receipt'); },
  async invoices(scope: PayablesScope) { return array<PayablesInvoice>(await apiClient.get(`${base(scope)}/invoices`), 'supplier invoice'); },
  async createInvoice(scope: PayablesScope, input: { purchaseOrderId: string; supplierInvoiceNumber: string; billDate: string; dueDate: string; taxMinor: number; notes?: string; lines: Array<{ receiptLineId: string; quantity: number; unitCostMinor?: number }> }) {
    return record<{ id: string; invoiceNumber: string; status: string; totalMinor: number }>(await apiClient.post(`${base(scope)}/invoices`, input, crypto.randomUUID()), 'created supplier invoice');
  },
  async approveInvoice(scope: PayablesScope, invoiceId: string) { return record<{ id: string; status: string }>(await apiClient.post(`${base(scope)}/invoices/${enc(invoiceId)}/approve`, {}, crypto.randomUUID()), 'supplier invoice approval'); },
  async voidDraftInvoice(scope: PayablesScope, invoiceId: string) { return record<{ id: string; status: string }>(await apiClient.post(`${base(scope)}/invoices/${enc(invoiceId)}/void`, {}, crypto.randomUUID()), 'supplier invoice void'); },
  async payments(scope: PayablesScope) { return array<SupplierPayment>(await apiClient.get(`${base(scope)}/payments`), 'supplier payment'); },
  async recordPayment(scope: PayablesScope, input: { paymentDate: string; method: string; account: string; reference?: string; allocations: Array<{ invoiceId: string; amountMinor: number }> }) {
    return record<SupplierPayment>(await apiClient.post(`${base(scope)}/payments`, input, crypto.randomUUID()), 'supplier payment');
  },
  async summary(scope: PayablesScope) { return record<PayablesSummary>(await apiClient.get(`${base(scope)}/summary`), 'accounts-payable summary'); },
  async reconciliation(scope: PayablesScope) { return array<PayablesReconciliation>(await apiClient.get(`${base(scope)}/reconciliation`), 'purchase reconciliation'); },
};
