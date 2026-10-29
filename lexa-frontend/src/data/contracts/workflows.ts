import type { CompleteSaleInput, PaymentMethod, PaymentRecord, RecordReturnInput, Sale, SaleReturn } from '../../domain/shared/types';

export interface SaleCompletionResult {
  sale: Sale;
}

export interface ReturnRecordingResult {
  returnRecord: SaleReturn;
}

export interface ReceivePaymentInput {
  workspaceId: string;
  branchId: string;
  saleId: string;
  method: PaymentMethod;
  amountMinor: number;
  reference?: string;
}

export interface ReceivePaymentResult {
  payment: PaymentRecord;
  outstandingMinor: number;
}

export interface SalesWorkflow {
  completeSale(input: CompleteSaleInput): Promise<SaleCompletionResult>;
  receivePayment(input: ReceivePaymentInput): Promise<ReceivePaymentResult>;
  recordReturn(input: RecordReturnInput): Promise<ReturnRecordingResult>;
}
