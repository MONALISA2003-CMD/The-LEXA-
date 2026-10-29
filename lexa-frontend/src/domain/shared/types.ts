export type Id = string;
export type PaymentMethod = 'cash' | 'mtn_momo' | 'airtel_money' | 'bank_transfer' | 'card_recorded' | 'other';
export type StockMovementType = 'opening' | 'receiving' | 'sale' | 'return' | 'adjustment' | 'transfer_in' | 'transfer_out' | 'write_off';
export type PaymentKind = 'receipt' | 'refund';

export interface Workspace {
  id: Id;
  businessName: string;
  businessType: string;
  currency: string;
  timezone: string;
  enabledModules: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Branch {
  id: Id;
  workspaceId: Id;
  name: string;
  address?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: Id;
  workspaceId: Id;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: Id;
  workspaceId: Id;
  name: string;
  sku: string;
  barcode?: string;
  brand?: string;
  unitOfMeasure?: string;
  supplierSku?: string;
  categoryId?: Id;
  costPriceMinor: number;
  sellingPriceMinor: number;
  lowStockThreshold: number;
  trackStock: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: Id;
  workspaceId: Id;
  branchId: Id;
  productId: Id;
  type: StockMovementType;
  quantityDelta: number;
  reason: string;
  sourceId?: Id;
  createdAt: string;
}

export interface Sale {
  id: Id;
  receiptNumber: string;
  workspaceId: Id;
  branchId: Id;
  customerName?: string;
  customerPhone?: string;
  promisedPaymentDate?: string;
  totalMinor: number;
  status: 'completed';
  createdAt: string;
}

export interface SaleLine {
  id: Id;
  workspaceId: Id;
  saleId: Id;
  productId: Id;
  productNameSnapshot: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface PaymentRecord {
  id: Id;
  workspaceId: Id;
  saleId: Id;
  kind: PaymentKind;
  method: PaymentMethod;
  amountMinor: number;
  reference?: string;
  createdAt: string;
}

export interface SaleReturn {
  id: Id;
  workspaceId: Id;
  branchId: Id;
  saleId: Id;
  returnNumber: string;
  totalMinor: number;
  reason: string;
  refundRecorded: boolean;
  createdAt: string;
}

export interface ReturnLine {
  id: Id;
  workspaceId: Id;
  returnId: Id;
  originalSaleLineId: Id;
  productId: Id;
  productNameSnapshot: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface AuditEvent {
  id: Id;
  workspaceId: Id;
  branchId?: Id;
  entityType: string;
  entityId: Id;
  action: string;
  reason?: string;
  createdAt: string;
}

export interface CreateWorkspaceInput {
  businessName: string;
  businessType: string;
  currency: string;
  timezone: string;
  branchName: string;
}

export interface CreateProductInput {
  workspaceId: Id;
  name: string;
  sku: string;
  barcode?: string;
  brand?: string;
  unitOfMeasure?: string;
  supplierSku?: string;
  categoryName?: string;
  costPriceMinor: number;
  sellingPriceMinor: number;
  lowStockThreshold: number;
  trackStock: boolean;
}

export interface SaleItemInput {
  productId: Id;
  quantity: number;
}

export interface PaymentInput {
  method: PaymentMethod;
  amountMinor: number;
  reference?: string;
}

export interface CompleteSaleInput {
  workspaceId: Id;
  branchId: Id;
  items: SaleItemInput[];
  payments: PaymentInput[];
  customerName?: string;
  customerPhone?: string;
  promisedPaymentDate?: string;
}

export interface ReturnItemInput {
  saleLineId: Id;
  quantity: number;
}

export interface RecordReturnInput {
  workspaceId: Id;
  branchId: Id;
  saleId: Id;
  items: ReturnItemInput[];
  reason: string;
  recordRefund: boolean;
  refundMethod: PaymentMethod;
}
