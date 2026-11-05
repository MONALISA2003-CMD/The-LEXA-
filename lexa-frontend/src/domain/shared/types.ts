export type Id = string;
export type PaymentMethod = 'cash' | 'mobile_money' | 'mtn_momo' | 'airtel_money' | 'bank_transfer' | 'card' | 'card_recorded' | 'cheque' | 'other';
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
  parentId?: Id | null;
  templateKey?: string | null;
  catalogCode?: string | null;
  taxonomyVersion?: number | null;
  attributeSchema?: Array<{key:string;label:string;kind:'text'|'number'|'select';options?:string[];required?:boolean}>;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: Id;
  workspaceId: Id;
  name: string;
  sku: string;
  productType?: string;
  attributes?: Record<string,string|number|boolean>;
  barcode?: string;
  brand?: string;
  catalogBrandId?: Id;
  catalogModelId?: Id;
  unitOfMeasure?: string;
  supplierSku?: string;
  categoryId?: Id;
  costPriceMinor: number;
  sellingPriceMinor: number;
  lowStockThreshold: number;
  trackStock: boolean;
  trackLot?: boolean;
  trackSerial?: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: Id;
  workspaceId: Id;
  branchId: Id;
  productId: Id;
  variantId?: Id;
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
  cashierUserId?: string;
  cashTenderedMinor?: number;
  cashChangeMinor?: number;
  receiptBusinessSnapshot?: {
    businessName:string;legalName:string;address:string;city:string;district:string;
    phone:string;email:string;website:string;taxIdentificationNumber:string;
    registrationNumber:string;timezone:string;currency:string;cashierName:string;
  };
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
  variantDescriptionSnapshot?:string|null;
  unitNameSnapshot?:string|null;
  serialNumbersSnapshot?:string[];
  warrantyMonthsSnapshot?:number|null;
  skuSnapshot?:string|null;
  barcodeSnapshot?:string|null;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  taxMinor?:number;
  taxableMinor?:number;
  taxRateBasisPoints?:number;
  taxCodeSnapshot?:string|null;
  serialIds?:string[];
  unitOfMeasureId?:string|null;
}

export interface PaymentRecord {
  id: Id;
  workspaceId: Id;
  saleId: Id;
  kind: PaymentKind;
  method: PaymentMethod;
  methodCategory?: 'cash' | 'mobile_money' | 'bank_transfer' | 'card' | 'cheque' | 'other';
  methodLabel?: string;
  amountMinor: number;
  reference?: string;
  notes?: string;
  reportedReceivedAt?: string;
  recordedByUserId?: string;
  recordedByName?: string;
  reversalOfPaymentId?: string;
  recordedAt?: string;
  sourceType?: string;
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
  disposition?: ReturnDisposition;
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
  industries?: string[];
  currency: string;
  timezone: string;
  branchName: string;
}

export interface CreateProductInput {
  workspaceId: Id;
  name: string;
  sku: string;
  productType?: string;
  attributes?: Record<string,string|number|boolean>;
  categoryId?: Id;
  barcode?: string;
  brand?: string;
  catalogBrandId?: Id;
  catalogModelId?: Id;
  unitOfMeasure?: string;
  supplierSku?: string;
  categoryName?: string;
  costPriceMinor: number;
  sellingPriceMinor: number;
  lowStockThreshold: number;
  trackStock: boolean;
  trackLot?: boolean;
  trackSerial?: boolean;
}

export interface SaleItemInput {
  productId: Id;
  quantity: number;
  variantId?: Id;
  lotId?: Id;
  serialIds?: Id[];
  priceListId?: Id;
}

export interface PaymentInput {
  method: PaymentMethod;
  methodLabel?: string;
  amountMinor: number;
  reference?: string;
  notes?: string;
  reportedReceivedAt?: string;
}

export interface CompleteSaleInput {
  workspaceId: Id;
  branchId: Id;
  items: SaleItemInput[];
  cashTenderedMinor?:number;
  payments: PaymentInput[];
  customerRecordId?: string;
  opportunityRecordId?: string;
  salespersonEmployeeId?: string;
  customerName?: string;
  customerPhone?: string;
  promisedPaymentDate?: string;
}

export type ReturnDisposition = 'restock' | 'quarantine' | 'scrap';

export interface ReturnItemInput {
  saleLineId: Id;
  quantity: number;
  disposition?: ReturnDisposition;
}

export interface RecordReturnInput {
  workspaceId: Id;
  branchId: Id;
  saleId: Id;
  items: ReturnItemInput[];
  reason: string;
  recordRefund: boolean;
  refundMethod: PaymentMethod;
  refundPaymentId?: Id;
}
