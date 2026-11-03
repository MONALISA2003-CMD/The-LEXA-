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
export interface DeliveryAgent {
  id: string; displayName: string; phone?: string; agentType: string; transportDescription?: string;
  employeeRecordId?: string; active: boolean; notes?: string; defaultBranchId?: string;
}
export interface DispatchableSaleLine {
  saleLineId: string; productId: string; productName: string; sku: string; variantId?: string | null; lotId?: string | null;
  soldQuantity: number; reservedQuantity: number; legacyReservedQuantity?: number; legacyMappingRequired?: boolean; dispatchableQuantity: number; unitSellingMinor: number; lineSellingMinor: number; unitCostMinor: number;
}
export interface DispatchableSale { sale: { id: string; receiptNumber: string; totalMinor: number; customerName?: string; customerPhone?: string }; lines: DispatchableSaleLine[] }
export interface DispatchRecord {
  id: string; deliveryNumber: string; saleId?: string; receiptNumber?: string; recipientName?: string; recipientPhone?: string;
  deliveryAddress?: string; destinationArea?: string; destinationTown?: string; deliveryMethod: string; status: string;
  expectedDate?: string; createdAt: string; deliveredAt?: string; deliveryExpenseMinor: number; expectedCollectionMinor: number;
  agentId?: string; agentName?: string; goodsSellingMinor: number; goodsCostMinor: number; itemCount: number;
}
export interface DispatchDetail {
  delivery: DispatchRecord & { deliveryInstructions?: string; transportDetails?: string; agentPhone?: string };
  items: Array<{ id: string; saleLineId: string; productId: string; productName: string; sku: string; variantId?: string | null; lotId?: string | null; serialIds?: string[]; quantity: number; unitSellingMinor: number; totalSellingMinor: number; unitCostMinor: number; totalCostMinor: number }>;
  events: Array<{ id: string; previousStatus?: string | null; newStatus: string; actorUserId?: string | null; actorName?: string | null; occurredAt: string; reason?: string | null; locationLabel?: string | null; recipientName?: string | null }>;
  collectionReports: Array<{ id: string; amountReportedMinor: number; amountRemittedMinor: number; amountAcceptedMinor: number; status: string; reportedAt: string; notes?: string | null; varianceReason?: string | null }>;
}
export interface DispatchCreateInput {
  saleId: string; items: Array<{ saleLineId: string; quantity: number }>; deliveryMethod: string; deliveryAgentId?: string;
  recipientName?: string; recipientPhone?: string; deliveryAddress?: string; destinationArea?: string; destinationTown?: string;
  deliveryInstructions?: string; transportDetails?: string; expectedDate?: string; deliveryExpenseMinor?: number; expectedCollectionMinor?: number;
}
export interface CollectionReport {
  id: string; deliveryId: string; deliveryNumber: string; saleId: string; agentId?: string; agentName?: string;
  amountReportedMinor: number; amountRemittedMinor: number; amountAcceptedMinor: number; outstandingReportedMinor: number;
  status: string; reportedAt: string; notes?: string; varianceReason?: string;
}
export interface DeliveryReport {
  currency: string; timezone: string; from?: string | null; to?: string | null;
  totals: {
    dispatchCount: number; openCount: number; failedOrReturnedCount: number; goodsSellingMinor: number; goodsCostMinor: number;
    deliveryExpenseMinor: number; expectedCollectionMinor: number; collectionReportedMinor: number; collectionRemittedMinor: number;
    collectionAcceptedMinor: number; riderHeldOutstandingMinor: number; varianceCount: number;
  };
  byMethod: Array<{ deliveryMethod: string; count: number; goodsSellingMinor: number; goodsCostMinor: number }>;
  byAgent: Array<{ agentId: string; agentName: string; dispatchCount: number; deliveredCount: number; failedOrReturnedCount: number; deliveryExpenseMinor: number; reportedMinor: number; remittedMinor: number; acceptedMinor: number }>;
  byDestination: Array<{ destination: string; count: number; deliveryExpenseMinor: number }>;
  byStatus: Array<{ status: string; count: number }>;
}
export interface DeliveryAgentHistory {
  agent: { id: string; displayName: string; phone?: string | null; agentType: string; active: boolean };
  deliveries: Array<{ id: string; deliveryNumber: string; saleId?: string; receiptNumber?: string; status: string; deliveryMethod: string; destinationArea?: string; destinationTown?: string; deliveryExpenseMinor: number; dispatchedAt: string; deliveredAt?: string | null; goodsSellingMinor: number; goodsCostMinor: number }>;
  collectionReports: Array<{ id: string; deliveryNumber: string; reportedMinor: number; remittedMinor: number; acceptedMinor: number; status: string; reportedAt: string; varianceReason?: string | null; notes?: string | null }>;
}

function base(scope: CommerceScope) {
  return `/workspaces/${enc(scope.workspaceId)}/branches/${enc(scope.branchId)}/commerce`;
}
function record<T>(value: unknown, label: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`We could not load the ${label} information. Please try again.`);
  return value as T;
}
function list<T>(value: unknown, label: string): T[] {
  if (!Array.isArray(value)) throw new Error(`We could not load the ${label} information. Please try again.`);
  return value as T[];
}
export const apiCommerce = {
  async listSalesOrders(scope: CommerceScope) { return list<CommerceOrder>(await apiClient.get(`${base(scope)}/sales-orders`), 'sales order'); },
  async createSalesOrder(scope: CommerceScope, input: CommerceCreateOrderInput) { return record<CommerceOrder>(await apiClient.post(`${base(scope)}/sales-orders`, input), 'created sales order'); },
  async confirmSalesOrder(scope: CommerceScope, orderId: string) { return record<{ id: string; status: string }>(await apiClient.post(`${base(scope)}/sales-orders/${enc(orderId)}/confirm`, {}), 'sales-order confirmation'); },
  async fulfilSalesOrder(scope: CommerceScope, orderId: string, input: { lines?: Array<{ orderLineId: string; quantity: number }>; deliveryMethod?: string; deliveryAgentId?: string; recipientName?: string; recipientPhone?: string; destinationArea?: string; destinationTown?: string; deliveryInstructions?: string; transportDetails?: string; expectedCollectionMinor?: number; deliveryExpenseMinor?: number } = {}) { return record<{ fulfilmentId: string; fulfilmentNumber: string; deliveryId: string; deliveryNumber: string; saleId: string; status: string; totalMinor: number }>(await apiClient.post(`${base(scope)}/sales-orders/${enc(orderId)}/fulfil`, input, crypto.randomUUID()), 'fulfilment'); },
  async listPurchaseOrders(scope: CommerceScope) { return list<CommerceOrder>(await apiClient.get(`${base(scope)}/purchase-orders`), 'purchase order'); },
  async createPurchaseOrder(scope: CommerceScope, input: CommerceCreateOrderInput) { return record<CommerceOrder>(await apiClient.post(`${base(scope)}/purchase-orders`, input), 'created purchase order'); },
  async orderPurchaseOrder(scope: CommerceScope, orderId: string) { return record<{ id: string; status: string }>(await apiClient.post(`${base(scope)}/purchase-orders/${enc(orderId)}/order`, {}), 'purchase-order confirmation'); },
  async receivePurchaseOrder(scope: CommerceScope, orderId: string, input: GoodsReceiptInput) { return record<{ id: string; receiptNumber: string; status: string; accepted: number; rejected: number; purchaseOrderStatus: string }>(await apiClient.post(`${base(scope)}/purchase-orders/${enc(orderId)}/receipts`, input), 'goods receipt'); },
  async listDeliveries(scope: CommerceScope) { return list<{ id: string; deliveryNumber: string; recipientName?: string; deliveryAddress?: string; salesOrderNumber: string; fulfilmentNumber: string; expectedDate?: string; status: string; trackingReference?: string; courier?: string; dispatchedAt: string; deliveredAt?: string }>(await apiClient.get(`${base(scope)}/deliveries`), 'delivery'); },
  async updateDelivery(scope: CommerceScope, deliveryId: string, input: { status: 'in_transit' | 'delivered' | 'delivery_failed'; trackingReference?: string }) { return record<{ id: string; status: string; trackingReference?: string }>(await apiClient.patch(`${base(scope)}/deliveries/${enc(deliveryId)}/status`, input), 'delivery update'); },
  async listDeliveryAgents(scope: CommerceScope, includeInactive = false) { return list<DeliveryAgent>(await apiClient.get(`${base(scope)}/delivery-agents`, { includeInactive }), 'delivery agent'); },
  async getDeliveryReport(scope: CommerceScope, filters: { from?: string; to?: string } = {}) { return record<DeliveryReport>(await apiClient.get(`${base(scope)}/delivery-report`, filters), 'delivery report'); },
  async getPaymentReport(scope: CommerceScope, filters: { from?: string; to?: string } = {}) { return record<any>(await apiClient.get(`${base(scope)}/payment-report`, filters), 'payment report'); },
  async getDeliveryAgentHistory(scope: CommerceScope, agentId: string) { return record<DeliveryAgentHistory>(await apiClient.get(`${base(scope)}/delivery-agents/${enc(agentId)}/history`), 'delivery agent history'); },
  async createDeliveryAgent(scope: CommerceScope, input: { displayName: string; phone?: string; agentType: string; transportDescription?: string; notes?: string }) { return record<DeliveryAgent>(await apiClient.post(`${base(scope)}/delivery-agents`, input, crypto.randomUUID()), 'delivery agent'); },
  async updateDeliveryAgent(scope: CommerceScope, agentId: string, input: { active?: boolean; displayName?: string; phone?: string; agentType?: string; transportDescription?: string; notes?: string }) { return record<DeliveryAgent>(await apiClient.patch(`${base(scope)}/delivery-agents/${enc(agentId)}`, input, { 'Idempotency-Key': crypto.randomUUID() }), 'delivery agent update'); },
  async getDispatchableLines(scope: CommerceScope, saleId: string) { return record<DispatchableSale>(await apiClient.get(`${base(scope)}/sales/${enc(saleId)}/dispatchable-lines`), 'dispatchable sale'); },
  async createDispatch(scope: CommerceScope, input: DispatchCreateInput) { return record<{ id: string; deliveryNumber: string; saleId: string; status: string; deliveryMethod: string; expectedCollectionMinor: number; deliveryExpenseMinor: number }>(await apiClient.post(`${base(scope)}/dispatches`, input, crypto.randomUUID()), 'dispatch'); },
  async listDispatches(scope: CommerceScope, status?: string) { return list<DispatchRecord>(await apiClient.get(`${base(scope)}/dispatches`, { status }), 'dispatch'); },
  async getDispatch(scope: CommerceScope, deliveryId: string) { return record<DispatchDetail>(await apiClient.get(`${base(scope)}/dispatches/${enc(deliveryId)}`), 'dispatch detail'); },
  async updateDispatchStatus(scope: CommerceScope, deliveryId: string, input: { status: string; reason?: string; recipientName?: string; location?: string }) { return record<{ id: string; status: string; previousStatus: string }>(await apiClient.post(`${base(scope)}/dispatches/${enc(deliveryId)}/events`, input, crypto.randomUUID()), 'dispatch status'); },
  async reportRiderCollection(scope: CommerceScope, deliveryId: string, input: { lines: Array<{ methodCategory: string; methodLabel?: string; amountMinor: number; reference?: string; notes?: string }>; notes?: string }) { return record<{ id: string; deliveryId: string; amountReportedMinor: number; status: string; message: string }>(await apiClient.post(`${base(scope)}/dispatches/${enc(deliveryId)}/collection-reports`, input, crypto.randomUUID()), 'rider collection report'); },
  async recordDirectReceipt(scope: CommerceScope, deliveryId: string, input: { methodCategory: string; methodLabel?: string; amountMinor: number; reference?: string; notes?: string; reportedReceivedAt?: string }) { return record<{ paymentId: string; deliveryId: string; saleId: string; amountMinor: number; outstandingMinor: number; methodCategory: string; message: string }>(await apiClient.post(`${base(scope)}/dispatches/${enc(deliveryId)}/direct-receipts`, input, crypto.randomUUID()), 'direct customer receipt'); },
  async listCollectionReports(scope: CommerceScope, status?: string) { return list<CollectionReport>(await apiClient.get(`${base(scope)}/collection-reports`, { status }), 'collection report'); },
  async acceptRemittance(scope: CommerceScope, input: { methodCategory: string; methodLabel?: string; reference?: string; cashSessionId?: string; varianceReason?: string; allocations: Array<{ reportId: string; amountMinor: number }> }) { return record<{ id: string; remittanceNumber: string; amountReceivedMinor: number; status: string; allocationCount: number }>(await apiClient.post(`${base(scope)}/remittances`, input, crypto.randomUUID()), 'rider remittance'); },
  async convertLead(scope: CommerceScope, leadRecordId: string) { return record<{ customerRecordId: string; alreadyConverted?: boolean }>(await apiClient.post(`${base(scope)}/crm/leads/${enc(leadRecordId)}/convert`, {}), 'lead conversion'); },
};
