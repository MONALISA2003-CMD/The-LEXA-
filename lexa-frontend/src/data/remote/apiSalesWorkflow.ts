import type { SalesWorkflow, ReceivePaymentInput } from '../contracts/workflows';
import type { CompleteSaleInput, RecordReturnInput, Sale, SaleReturn, PaymentRecord } from '../../domain/shared/types';
import { apiClient } from './apiClient';

const enc = (value: string) => encodeURIComponent(value);
function unwrap<T>(value: unknown, label: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`The backend returned an invalid ${label} response.`);
  return value as T;
}

export const apiSalesWorkflow: SalesWorkflow = {
  async completeSale(input: CompleteSaleInput) {
    const body = { items: input.items, payments: input.payments, ...(input.customerName ? { customerName: input.customerName } : {}), ...(input.customerPhone ? { customerPhone: input.customerPhone } : {}), ...(input.promisedPaymentDate ? { promisedPaymentDate: input.promisedPaymentDate } : {}) };
    const result = unwrap<{ sale: Sale }>(await apiClient.post(`/workspaces/${enc(input.workspaceId)}/branches/${enc(input.branchId)}/sales/complete`, body, crypto.randomUUID()), 'sale completion');
    return { sale: result.sale };
  },
  async receivePayment(input: ReceivePaymentInput) {
    const result = unwrap<{ payment: PaymentRecord; outstandingMinor: number }>(await apiClient.post(`/workspaces/${enc(input.workspaceId)}/branches/${enc(input.branchId)}/sales/${enc(input.saleId)}/payments`, { method: input.method, amountMinor: input.amountMinor, ...(input.reference ? { reference: input.reference } : {}) }, crypto.randomUUID()), 'payment');
    return result;
  },
  async recordReturn(input: RecordReturnInput) {
    const result = unwrap<{ returnRecord: SaleReturn }>(await apiClient.post(`/workspaces/${enc(input.workspaceId)}/branches/${enc(input.branchId)}/sales/${enc(input.saleId)}/returns`, { items: input.items, reason: input.reason, recordRefund: input.recordRefund, refundMethod: input.refundMethod }, crypto.randomUUID()), 'return');
    return result;
  },
};
