import type { SalesWorkflow, ReceivePaymentInput } from '../contracts/workflows';
import type { CompleteSaleInput, RecordReturnInput, Sale, SaleReturn, PaymentRecord } from '../../domain/shared/types';
import { apiClient } from './apiClient';

export interface SalePaymentReport {
  currency: string; timezone: string; from?: string | null; to?: string | null;
  activity: {
    salesCount: number; grossSalesMinor: number; returnsCount: number; returnsMinor: number; netSalesMinor: number;
    receiptsMinor: number; refundsMinor: number;
    methodBreakdown: Array<{ kind: string; methodCategory: string; methodLabel?: string | null; recordedByName: string; count: number; amountMinor: number }>;
  };
  credit: {
    outstandingMinor: number; creditSalesCount: number; overdueMinor: number; overdueCount: number; notDueMinor: number; notDueCount: number;
    noDueDateMinor: number; noDueDateCount: number; asOf: string;
    sales: Array<{ id: string; receiptNumber: string; customerName?: string | null; customerPhone?: string | null; promisedPaymentDate?: string | null; outstandingMinor: number; ageing: string }>;
  };
  assurance: string;
}

const enc = (value: string) => encodeURIComponent(value);
function unwrap<T>(value: unknown, label: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`The backend returned an invalid ${label} response.`);
  return value as T;
}

export const apiSalesWorkflow: SalesWorkflow = {
  async getPaymentReport(input: { workspaceId: string; branchId: string; from?: string; to?: string }) {
    const params = { ...(input.from ? { from: input.from } : {}), ...(input.to ? { to: input.to } : {}) };
    return unwrap<SalePaymentReport>(await apiClient.get(`/workspaces/${enc(input.workspaceId)}/branches/${enc(input.branchId)}/commerce/payment-report`, params), 'sales payment report');
  },
  async completeSale(input: CompleteSaleInput) {
    const body = { items: input.items, payments: input.payments, ...(input.customerName ? { customerName: input.customerName } : {}), ...(input.customerPhone ? { customerPhone: input.customerPhone } : {}), ...(input.promisedPaymentDate ? { promisedPaymentDate: input.promisedPaymentDate } : {}) };
    const result = unwrap<{ sale: Sale }>(await apiClient.post(`/workspaces/${enc(input.workspaceId)}/branches/${enc(input.branchId)}/sales/complete`, body, crypto.randomUUID()), 'sale completion');
    return { sale: result.sale };
  },
  async receivePayment(input: ReceivePaymentInput) {
    const result = unwrap<{ payment: PaymentRecord; outstandingMinor: number }>(await apiClient.post(`/workspaces/${enc(input.workspaceId)}/branches/${enc(input.branchId)}/sales/${enc(input.saleId)}/payments`, { method: input.method, amountMinor: input.amountMinor, ...(input.reference ? { reference: input.reference } : {}), ...(input.methodLabel ? { methodLabel: input.methodLabel } : {}), ...(input.notes ? { notes: input.notes } : {}), ...(input.reportedReceivedAt ? { reportedReceivedAt: input.reportedReceivedAt } : {}) }, crypto.randomUUID()), 'payment');
    return result;
  },
  async recordReturn(input: RecordReturnInput) {
    const result = unwrap<{ returnRecord: SaleReturn }>(await apiClient.post(`/workspaces/${enc(input.workspaceId)}/branches/${enc(input.branchId)}/sales/${enc(input.saleId)}/returns`, { items: input.items, reason: input.reason, recordRefund: input.recordRefund, refundMethod: input.refundMethod, ...(input.refundPaymentId ? { refundPaymentId: input.refundPaymentId } : {}) }, crypto.randomUUID()), 'return');
    return result;
  },
};
