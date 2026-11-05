import { apiClient } from './apiClient';

const at = (value: string) => encodeURIComponent(value);
const equipment = (workspaceId: string, branchId: string) =>
  `/workspaces/${at(workspaceId)}/branches/${at(branchId)}/equipment`;
const freshKey = () => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID() : `equipment-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export type EquipmentFlag = 'electronicsCatalogueV2'|'phoneIdentifierRegistryV2'|'accessoryFitmentV2'|'equipmentServiceV2'|'applianceFulfilmentV2';
export type EquipmentReleaseStatus = {flags:Record<EquipmentFlag,boolean>;requiresStagingAcceptance:boolean};
export type EquipmentUpgrade = {id:string;status:'draft'|'approved'|'applied'|'cancelled';serialId:string;initialCostMinor:number;partsCostMinor:number;labourCostMinor:number};
export type EquipmentDelivery = {id:string;state:'reserved'|'picked'|'dispatched'|'delivered'|'delivery_failed'|'returned_to_warehouse'|'cancelled';serialId:string;saleLineId:string};
export type EquipmentHistory = {unitId:string;productId:string;currentStatus:string;configuration:Array<{id:string;recordedAt:string;initialCostMinor:number;addedCostMinor:number;resultingCostMinor:number}>;fulfilment:EquipmentDelivery|null;warranty:Array<{id:string;issueSummary:string;status:string;createdAt:string}>;meters:Array<{id:string;totalCount:string;colourCount:string;createdAt:string}>};
export type WarrantyCaseStatus = 'opened'|'inspecting'|'repair_approved'|'repairing'|'rejected'|'closed'|'replaced';
export type WarrantyCoverageDecision = 'seller_warranty'|'goodwill'|'manufacturer_warranty'|'out_of_warranty'|'not_covered';
export type WarrantyCaseRecord = {id:string;serialId:string;saleLineId:string;status:WarrantyCaseStatus;issueSummary:string;createdByUserId:string;createdAt:string;resolvedAt:string|null};
export type WarrantyCaseDetail = WarrantyCaseRecord & {
 events:Array<{id:string;previousStatus:string;nextStatus:string;coverageDecision:WarrantyCoverageDecision|null;evidenceReference:string;notes:string;createdAt:string}>;
 parts:Array<{id:string;productId:string;quantity:string;totalCostMinor:number;evidenceReference:string;postedAt:string}>;
};
export type WarrantyPartIssue = {productId:string;variantId?:string;warehouseId:string;lotId:string;quantity:string;evidenceReference:string};
export type EquipmentModelReport = {productId:string;modelId:string|null;receivedCount:number;soldCount:number;availableCount:number;ageDays:string|null;unknownCostLines:number;grossMarginMinor:string|null};
export type EquipmentReconciliation = {unbalancedReceivingBatches:Array<{batchId:string;expected:number;posted:string;difference:string}>;paymentOvercollections:Array<{saleId:string;due:string;received:string;refunded:string}>;status:'requires_review'|'no_discrepancies_found';scope:string;generatedAt:string};

/** Canonical exact-unit endpoints. Browser reads do not mutate inventory. */
export const apiEquipmentService = {
  rollout:(w:string,b:string)=>apiClient.get<EquipmentReleaseStatus>(`${equipment(w,b)}/rollout-status`),
  history:(w:string,b:string,serialId:string)=>apiClient.get<EquipmentHistory>(`${equipment(w,b)}/serials/${at(serialId)}/service-history`),
  modelReport:(w:string,b:string)=>apiClient.get<EquipmentModelReport[]>(`${equipment(w,b)}/reports/physical-units`),
  reconciliation:(w:string,b:string)=>apiClient.get<EquipmentReconciliation>(`${equipment(w,b)}/reports/reconciliation`),
  pendingUpgrades:(w:string,b:string)=>apiClient.get<EquipmentUpgrade[]>(`${equipment(w,b)}/upgrades`),
  upgradeDraft:(w:string,b:string,input:{serialId:string;beforeSpecs:Record<string,unknown>;afterSpecs:Record<string,unknown>;inspection:Record<string,unknown>;approvedLabourMinor:number;parts:Array<{productId:string;variantId?:string;warehouseId:string;lotId?:string;quantity:number}>},idempotencyKey:string)=>apiClient.post<EquipmentUpgrade>(`${equipment(w,b)}/upgrades`,input,idempotencyKey),
  approveUpgrade:(w:string,b:string,orderId:string)=>apiClient.post<EquipmentUpgrade>(`${equipment(w,b)}/upgrades/${at(orderId)}/approve`,{},freshKey()),
  applyUpgrade:(w:string,b:string,orderId:string)=>apiClient.post<{orderId:string;status:'applied';resultingCostMinor:number;alreadyApplied:boolean}>(`${equipment(w,b)}/upgrades/${at(orderId)}/apply`,{},freshKey()),
  createDelivery:(w:string,b:string,input:{saleLineId:string;serialId:string})=>apiClient.post<EquipmentDelivery>(`${equipment(w,b)}/fulfilments`,input,freshKey()),
  transitionDelivery:(w:string,b:string,deliveryId:string,input:{nextState:EquipmentDelivery['state'];evidenceReference?:string;checklist?:Record<string,unknown>})=>apiClient.post<EquipmentDelivery>(`${equipment(w,b)}/fulfilments/${at(deliveryId)}/transition`,input,freshKey()),
  openWarranty:(w:string,b:string,input:{saleLineId:string;serialId:string;issueSummary:string})=>apiClient.post<{id:string;status:string}>(`${equipment(w,b)}/warranty-cases`,input,freshKey()),
  warrantyCases:(w:string,b:string)=>apiClient.get<WarrantyCaseRecord[]>(`${equipment(w,b)}/warranty-cases`),
  warrantyDetail:(w:string,b:string,caseId:string)=>apiClient.get<WarrantyCaseDetail>(`${equipment(w,b)}/warranty-cases/${at(caseId)}`),
  transitionWarranty:(w:string,b:string,caseId:string,input:{nextStatus:WarrantyCaseStatus;evidenceReference:string;notes:string;coverageDecision?:WarrantyCoverageDecision})=>apiClient.post<WarrantyCaseRecord>(`${equipment(w,b)}/warranty-cases/${at(caseId)}/transition`,input,freshKey()),
  issueWarrantyPart:(w:string,b:string,caseId:string,input:WarrantyPartIssue,key:string)=>apiClient.post<{id:string;quantity:string;totalCostMinor:number}>(`${equipment(w,b)}/warranty-cases/${at(caseId)}/parts`,input,key),
  acceptCustomerRepair:(w:string,b:string,input:{deviceDescription:string;consentReference:string;manufacturerSerial?:string;intakeCondition:Record<string,unknown>})=>apiClient.post<{id:string;status:string}>(`${equipment(w,b)}/customer-repairs`,input,freshKey()),
  recordCopierMeter:(w:string,b:string,input:{serialId:string;totalCount:number;colourCount:number;evidenceReference?:string})=>apiClient.post<{id:string}>(`${equipment(w,b)}/copier-meters`,input,freshKey()),
};
