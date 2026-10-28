import type { CompleteSaleInput, RecordReturnInput, Sale, SaleReturn } from '../../domain/shared/types';

export interface SaleCompletionResult {
  sale: Sale;
}

export interface ReturnRecordingResult {
  returnRecord: SaleReturn;
}

export interface SalesWorkflow {
  completeSale(input: CompleteSaleInput): Promise<SaleCompletionResult>;
  recordReturn(input: RecordReturnInput): Promise<ReturnRecordingResult>;
}
