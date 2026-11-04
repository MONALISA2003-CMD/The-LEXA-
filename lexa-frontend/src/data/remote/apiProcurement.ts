import { apiClient } from './apiClient';

/** All purchasing data is resolved from governed, tenant-scoped transactions. */
export type ProcurementScope = { workspaceId: string; branchId: string };
const enc = encodeURIComponent;
const root = ({workspaceId,branchId}: ProcurementScope) => `/workspaces/${enc(workspaceId)}/branches/${enc(branchId)}/supply-chain/procurement`;
const newKey = () => crypto.randomUUID();
export type Supplier = { id:string; supplier_code:string; name:string; status:'active'|'inactive'|'blocked'; currency:string; email?:string|null; phone?:string|null; address?:string|null; tax_number?:string|null; payment_terms?:string|null; lead_time_days:number };
export type PurchaseRequestLine = { id:string; productId:string; productName:string; sku:string; quantity:number|string; requiredDate?:string|null };
export type PurchaseRequest = { id:string; request_number:string; title:string; status:string; required_date?:string|null; delivery_location?:string|null; notes?:string|null; project_id?:string|null; created_at:string; lines:PurchaseRequestLine[] };
export type RfqLine = { id:string; productId:string; productName:string; sku:string; quantity:number|string; requiredDate?:string|null };
export type RfqInvitation = { supplierId:string; supplierName:string; status:string; invitedAt:string };
export type Rfq = { id:string; rfq_number:string; purchase_request_id:string; title:string; status:string; currency:string; response_deadline?:string|null; issued_at?:string|null; created_at:string; project_id?:string|null; lines:RfqLine[]; invitations:RfqInvitation[] };
export type SupplierQuoteLine = { rfqLineId:string; productId:string; productName:string; quantity:number|string; unitCostMinor:number|string; lineTotalMinor:number|string };
export type SupplierQuote = { id:string; quotation_number:string; rfq_id:string; rfq_number?:string; supplier_id:string; supplier_name:string; currency:string; valid_until:string; lead_time_days:number; delivery_terms?:string|null; payment_terms?:string|null; subtotal_minor:number|string; status:string; lines:SupplierQuoteLine[] };
export type Award = { id:string; award_number:string; rfq_id:string; rfq_number:string; quotation_id:string; supplier_id:string; supplier_name:string; amount_minor:number|string; currency:string; status:string; approved_at?:string|null; created_at:string; approval_count:number|string };
export type PurchaseOrderLine = { id:string; productId:string; productName:string; sku:string; quantity:number|string; quantityAccepted:number|string; quantityRejected:number|string; unitCostMinor:number|string };
export type PurchaseOrder = { id:string; order_number:string; supplier_name?:string; supplier_id?:string; status:string; currency?:string; total_minor:number|string; award_id?:string|null; purchase_request_id?:string|null; project_id?:string|null; created_at:string; lines:PurchaseOrderLine[] };
export type SupplierReturnLine = { productName:string; sku:string; quantity:number|string; unitCostMinor:number|string; reason:string };
export type SupplierReturn = { id:string; return_number:string; supplier_id:string; supplier_name:string; purchase_order_id?:string|null; status:string; reason:string; total_minor:number|string; currency:string; created_at:string; lines:SupplierReturnLine[] };

export const apiProcurement = {
  suppliers:(s:ProcurementScope)=>apiClient.get<Supplier[]>(`${root(s)}/suppliers`),
  createSupplier:(s:ProcurementScope,input:Record<string,unknown>)=>apiClient.post<Supplier>(`${root(s)}/suppliers`,input,newKey()),
  updateSupplier:(s:ProcurementScope,id:string,input:Record<string,unknown>)=>apiClient.patch<Supplier>(`${root(s)}/suppliers/${enc(id)}`,input),
  requests:(s:ProcurementScope)=>apiClient.get<PurchaseRequest[]>(`${root(s)}/purchase-requests`),
  createRequest:(s:ProcurementScope,input:Record<string,unknown>)=>apiClient.post<PurchaseRequest>(`${root(s)}/purchase-requests`,input,newKey()),
  submitRequest:(s:ProcurementScope,id:string)=>apiClient.post(`${root(s)}/purchase-requests/${enc(id)}/submit`,{},newKey()),
  decideRequest:(s:ProcurementScope,id:string,decision:'approved'|'rejected',comments?:string)=>apiClient.post(`${root(s)}/purchase-requests/${enc(id)}/decision`,{decision,comments},newKey()),
  rfqs:(s:ProcurementScope)=>apiClient.get<Rfq[]>(`${root(s)}/rfqs`),
  createRfq:(s:ProcurementScope,input:Record<string,unknown>)=>apiClient.post<Rfq>(`${root(s)}/rfqs`,input,newKey()),
  invite:(s:ProcurementScope,id:string,supplierIds:string[])=>apiClient.post(`${root(s)}/rfqs/${enc(id)}/invitations`,{supplierIds},newKey()),
  issueRfq:(s:ProcurementScope,id:string)=>apiClient.post(`${root(s)}/rfqs/${enc(id)}/issue`,{},newKey()),
  quotes:(s:ProcurementScope)=>apiClient.get<SupplierQuote[]>(`${root(s)}/quotations`),
  compareQuotes:(s:ProcurementScope,rfqId:string)=>apiClient.get<SupplierQuote[]>(`${root(s)}/rfqs/${enc(rfqId)}/quotations`),
  recordQuote:(s:ProcurementScope,id:string,input:Record<string,unknown>)=>apiClient.post(`${root(s)}/rfqs/${enc(id)}/quotations`,input,newKey()),
  awards:(s:ProcurementScope)=>apiClient.get<Award[]>(`${root(s)}/awards`),
  award:(s:ProcurementScope,quotationId:string,notes?:string)=>apiClient.post(`${root(s)}/awards`,{quotationId,notes},newKey()),
  decideAward:(s:ProcurementScope,id:string,approved:boolean,comments?:string)=>apiClient.post(`${root(s)}/awards/${enc(id)}/${approved?'approve':'reject'}`,{comments},newKey()),
  orders:(s:ProcurementScope)=>apiClient.get<PurchaseOrder[]>(`${root(s)}/purchase-orders`),
  warehouses:(s:ProcurementScope)=>apiClient.get<Array<{id:string;code:string;name:string;active:boolean}>>(`${root(s).replace('/procurement','')}/inventory/warehouses`),
  approveReturn:(s:ProcurementScope,id:string)=>apiClient.post(`${root(s)}/supplier-returns/${enc(id)}/approve`,{},newKey()),
  dispatchReturn:(s:ProcurementScope,id:string)=>apiClient.post(`${root(s)}/supplier-returns/${enc(id)}/dispatch`,{},newKey()),
  creditReturn:(s:ProcurementScope,id:string,noteNumber:string,amountMinor:number)=>apiClient.post(`${root(s)}/supplier-returns/${enc(id)}/credit-note`,{noteNumber,amountMinor},newKey()),
  returns:(s:ProcurementScope)=>apiClient.get<SupplierReturn[]>(`${root(s)}/supplier-returns`),
  createReturn:(s:ProcurementScope,input:Record<string,unknown>)=>apiClient.post(`${root(s)}/supplier-returns`,input,newKey()),
};
