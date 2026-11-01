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
  methodLabel?: string;
  notes?: string;
  reportedReceivedAt?: string;
}

export interface ReceivePaymentResult {
  payment: PaymentRecord;
  outstandingMinor: number;
}


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

export interface SalesWorkflow {
  completeSale(input: CompleteSaleInput): Promise<SaleCompletionResult>;
  receivePayment(input: ReceivePaymentInput): Promise<ReceivePaymentResult>;
  getPaymentReport(input: { workspaceId: string; branchId: string; from?: string; to?: string }): Promise<SalePaymentReport>;
  recordReturn(input: RecordReturnInput): Promise<ReturnRecordingResult>;
}
