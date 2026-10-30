import { apiClient } from './apiClient';

const enc = (value: string) => encodeURIComponent(value);
export interface CommerceLine {
  id?: string;
  orderLineId?: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  quantityFulfilled?: number;
  quantityAccepted?: number;
  quantityRejected?: number;
  unitPriceMinor?: number;
  unitCostMinor?: number;
  lineTotalMinor: number;
}
export interface CommerceOrder {
  id: string;
  orderNumber: string;
  customerRecordId?: string;
  customerName?: string;
  deliveryAddress?: string;
  courier?: string;
  supplierRecordId?: string;
  supplierName?: string;
  expectedDate?: string;
  status: string;
  totalMinor: number;
  createdAt: string;
  lines: CommerceLine[];
}
export interface CommerceScope { workspaceId: string; branchId: string; }
export interface CommerceCreateOrderInput {
  customerRecordId?: string;
  customerName?: string;
  deliveryAddress?: string;
  courier?: string;
  supplierRecordId?: string;
  supplierName?: string;
  expectedDate?: string;
  lines: Array<{ productId: string; quantity: number }>;
}
export interface GoodsReceiptInput {
  reason?: string;
  lines: Array<{ orderLineId: string; acceptedQuantity: number; rejectedQuantity: number; rejectionReason?: string; batchNumber?: string; expiryDate?: string }>;
}

function base(scope: CommerceScope) {
  return `/workspaces/${enc(scope.workspaceId)}/branches/${enc(scope.branchId)}/commerce`;
}
function record<T>(value: unknown, label: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`The backend returned an invalid ${label} response.`);
  return value as T;
}
function list<T>(value: unknown, label: string): T[] {
  if (!Array.isArray(value)) throw new Error(`The backend returned an invalid ${label} collection.`);
  return value as T[];
}
export const apiCommerce = {
  async listSalesOrders(scope: CommerceScope) { return list<CommerceOrder>(await apiClient.get(`${base(scope)}/sales-orders`), 'sales order'); },
  async createSalesOrder(scope: CommerceScope, input: CommerceCreateOrderInput) { return record<CommerceOrder>(await apiClient.post(`${base(scope)}/sales-orders`, input), 'created sales order'); },
  async confirmSalesOrder(scope: CommerceScope, orderId: string) { return record<{ id: string; status: string }>(await apiClient.post(`${base(scope)}/sales-orders/${enc(orderId)}/confirm`, {}), 'sales-order confirmation'); },
  async fulfilSalesOrder(scope: CommerceScope, orderId: string, lines?: Array<{ orderLineId: string; quantity: number }>) { return record<{ fulfilmentId: string; fulfilmentNumber: string; deliveryId: string; deliveryNumber: string; saleId: string; status: string; totalMinor: number }>(await apiClient.post(`${base(scope)}/sales-orders/${enc(orderId)}/fulfil`, lines ? { lines } : {}), 'fulfilment'); },
  async listPurchaseOrders(scope: CommerceScope) { return list<CommerceOrder>(await apiClient.get(`${base(scope)}/purchase-orders`), 'purchase order'); },
  async createPurchaseOrder(scope: CommerceScope, input: CommerceCreateOrderInput) { return record<CommerceOrder>(await apiClient.post(`${base(scope)}/purchase-orders`, input), 'created purchase order'); },
  async orderPurchaseOrder(scope: CommerceScope, orderId: string) { return record<{ id: string; status: string }>(await apiClient.post(`${base(scope)}/purchase-orders/${enc(orderId)}/order`, {}), 'purchase-order confirmation'); },
  async receivePurchaseOrder(scope: CommerceScope, orderId: string, input: GoodsReceiptInput) { return record<{ id: string; receiptNumber: string; status: string; accepted: number; rejected: number; purchaseOrderStatus: string }>(await apiClient.post(`${base(scope)}/purchase-orders/${enc(orderId)}/receipts`, input), 'goods receipt'); },
  async listDeliveries(scope: CommerceScope) { return list<{ id: string; deliveryNumber: string; recipientName?: string; deliveryAddress?: string; salesOrderNumber: string; fulfilmentNumber: string; expectedDate?: string; status: string; trackingReference?: string; courier?: string; dispatchedAt: string; deliveredAt?: string }>(await apiClient.get(`${base(scope)}/deliveries`), 'delivery'); },
  async updateDelivery(scope: CommerceScope, deliveryId: string, input: { status: 'in_transit' | 'delivered' | 'delivery_failed'; trackingReference?: string }) { return record<{ id: string; status: string; trackingReference?: string }>(await apiClient.patch(`${base(scope)}/deliveries/${enc(deliveryId)}/status`, input), 'delivery update'); },
  async convertLead(scope: CommerceScope, leadRecordId: string) { return record<{ customerRecordId: string; alreadyConverted?: boolean }>(await apiClient.post(`${base(scope)}/crm/leads/${enc(leadRecordId)}/convert`, {}), 'lead conversion'); },
};
