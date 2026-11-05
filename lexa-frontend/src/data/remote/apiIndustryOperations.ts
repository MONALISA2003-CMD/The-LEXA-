import {apiClient} from './apiClient';

const encode = (value:string) => encodeURIComponent(value);
const scope = (workspaceId:string,branchId:string) =>
  `/workspaces/${encode(workspaceId)}/branches/${encode(branchId)}/industry-operations`;
const key = () => typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID() : `production-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export type StockFormulaComponent = {id:string;formulaId:string;productId:string;variantId:string|null;unitCode:string;quantity:string};
export type StockFormula = {id:string;name:string;kind:'decant'|'tester'|'recipe'|'production'|'assembly';outputProductId:string;outputVariantId:string|null;outputQuantity:string;status:'draft'|'approved'|'retired';components:StockFormulaComponent[]};
export type StockOrder = {id:string;formulaId:string;warehouseId:string;status:'draft'|'approved'|'completed'|'cancelled';batches:number;outputLotNumber:string|null;saleLineId:string|null;journalId:string|null;inputs:Array<{formulaComponentId:string;sourceLotId:string;requiredQuantity:string;wasteQuantity:string}>};
export type Warehouse = {id:string;name:string;code:string;active:boolean};
export type EligibleSaleLine = {id:string;productId:string;variantId:string|null;description:string;quantity:string;receiptNumber:string};
export type MeasuredSaleLine = {id:string;receiptNumber:string;description:string;quantity:string;unitName:string};
export type MeasuredCut = {id:string;saleLineId:string;wasteQuantity:string;reason:string;status:'pending'|'posted'|'cancelled';wasteCostMinor:number|null};
export type BusinessDivision = {id:string;code:string;name:string;active:boolean};
export type DivisionReport = {branchId:string;groups:Array<{division_id:string|null;division_name:string;gross_minor:string;refund_minor:string;known_cost_minor:string;unknown_cost_lines:number;line_count:number}>;notes:string};

export const apiIndustryOperations = {
  rollout:(w:string,b:string)=>apiClient.get<{postingEnabled:boolean;requiresApprovedFormula:boolean;requiresSeparateApprover:boolean}>(`${scope(w,b)}/rollout-status`),
  formulas:(w:string,b:string)=>apiClient.get<StockFormula[]>(`${scope(w,b)}/formulas`),
  createFormula:(w:string,b:string,data:{name:string;kind:StockFormula['kind'];outputProductId:string;outputVariantId?:string;outputQuantity:string;components:Array<{productId:string;variantId?:string;quantity:string;unitCode:string}>})=>apiClient.post<StockFormula>(`${scope(w,b)}/formulas`,data,key()),
  approveFormula:(w:string,b:string,id:string)=>apiClient.post<StockFormula>(`${scope(w,b)}/formulas/${encode(id)}/approve`,{},key()),
  orders:(w:string,b:string)=>apiClient.get<StockOrder[]>(`${scope(w,b)}/orders`),
  createOrder:(w:string,b:string,data:{formulaId:string;warehouseId:string;batches:number;outputLotNumber?:string;saleLineId?:string;inputs:Array<{formulaComponentId:string;sourceLotId:string;wasteQuantity:string}>})=>apiClient.post<StockOrder>(`${scope(w,b)}/orders`,data,key()),
  approveOrder:(w:string,b:string,id:string)=>apiClient.post<StockOrder>(`${scope(w,b)}/orders/${encode(id)}/approve`,{},key()),
  completeOrder:(w:string,b:string,id:string)=>apiClient.post<{orderId:string;status:'completed';journalId:string;alreadyCompleted:boolean}>(`${scope(w,b)}/orders/${encode(id)}/complete`,{},key()),
  pendingMenus:(w:string,b:string)=>apiClient.get<EligibleSaleLine[]>(`${scope(w,b)}/pending-menu-lines`),
  measuredLines:(w:string,b:string)=>apiClient.get<MeasuredSaleLine[]>(`${scope(w,b)}/eligible-measured-lines`),
  measuredCuts:(w:string,b:string)=>apiClient.get<MeasuredCut[]>(`${scope(w,b)}/measured-cuts`),
  requestCut:(w:string,b:string,input:{saleLineId:string;wasteQuantity:string;reason:string})=>apiClient.post<MeasuredCut>(`${scope(w,b)}/measured-cuts`,input,key()),
  approveCut:(w:string,b:string,id:string)=>apiClient.post<MeasuredCut>(`${scope(w,b)}/measured-cuts/${encode(id)}/approve`,{},key()),
  divisions:(w:string,b:string)=>apiClient.get<BusinessDivision[]>(`${scope(w,b)}/divisions`),
  divisionAssignments:(w:string,b:string)=>apiClient.get<Array<{productId:string;divisionId:string}>>(`${scope(w,b)}/divisions/assignments`),
  createDivision:(w:string,b:string,data:{code:string;name:string})=>apiClient.post<BusinessDivision>(`${scope(w,b)}/divisions`,data,key()),
  assignDivision:(w:string,b:string,divisionId:string,productId:string)=>apiClient.post(`${scope(w,b)}/divisions/${encode(divisionId)}/products/${encode(productId)}`,{},key()),
  salesReport:(w:string,b:string)=>apiClient.get<DivisionReport>(`${scope(w,b)}/divisions/sales-report`),
  demandReview:(w:string,b:string,warehouseId:string)=>apiClient.get<{asOf:string;algorithmVersion:string;warehouseId:string;notes:string;items:Array<{productId:string;variantId:string|null;forecastDaily:string|null;recommendedPurchaseUnits:string|null;observations:number;model:string;windowStart:string|null;windowEnd:string;validationMae:string|null;baselineMae:string|null;warnings:string[];requiresApproval:boolean;postingAllowed:boolean}>}>(`${scope(w,b)}/demand-review/${encode(warehouseId)}`),
  conversions:(w:string,b:string)=>apiClient.get<Array<{id:string;productId:string;fromUnit:string;toUnit:string;numerator:string;denominator:string;version:number;evidenceReference:string}>>(`${scope(w,b)}/unit-conversions`),
  publishConversion:(w:string,b:string,data:{productId:string;variantId?:string;fromUnit:string;toUnit:string;numerator:string;denominator:string;evidenceReference:string})=>apiClient.post(`${scope(w,b)}/unit-conversions`,data,key()),
};
