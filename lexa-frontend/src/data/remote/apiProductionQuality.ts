import { apiClient } from './apiClient';
import type { CommerceScope } from './apiCommerce';

const enc = encodeURIComponent;
const root = (s: CommerceScope) => `/workspaces/${enc(s.workspaceId)}/branches/${enc(s.branchId)}/supply-chain`;
const idempotency = () => crypto.randomUUID();
export interface BomLine {
  id: string; componentProductId: string; componentName: string; quantityPerOutput: string | number;
  scrapPercent: string | number; operationName: string | null; sequence: number;
}
export interface ManufacturingBom {
  id: string; bom_code: string; product_id: string; product_name: string; output_quantity: string | number;
  status: string; notes: string | null; created_at: string; lines: BomLine[];
}
export interface WorkOrderMaterial {
  id: string; componentProductId: string; componentName: string; requiredQuantity: string | number;
  reservedQuantity: string | number; consumedQuantity: string | number; unitCostMinor: number;
}
export interface ManufacturingWorkOrder {
  id: string; work_order_number: string; bom_id: string; product_id: string; product_name: string;
  warehouse_id: string; warehouse_name: string; planned_quantity: string | number;
  completed_quantity: string | number; actual_material_cost_minor: string | number;
  planned_start: string | null; due_date: string | null; status: string;
  materials: WorkOrderMaterial[];
}
export interface JobStep {
  id: string; sequence: number; stepName: string; status: string; startedAt: string | null;
  completedAt: string | null; actualMinutes: number | null; notes: string | null;
}
export interface ManufacturingJobCard {
  id: string; work_order_id: string; work_order_number: string; product_name: string;
  card_number: string; status: string; created_at: string; steps: JobStep[];
}
export interface InspectionCheck {
  id: string; code: string; description: string; type: 'boolean'|'numeric'|'text';
  required: boolean; minimum: number|null; maximum: number|null; sequence: number;
}
export interface InspectionPlan {
  id: string; plan_code: string; name: string; product_id: string|null; inspection_stage: string;
  active: boolean; checks: InspectionCheck[];
}
export interface QualityInspection {
  id: string; inspection_number: string; plan_id: string; plan_name: string;
  product_id: string; product_name: string; work_order_id: string | null;
  work_order_number: string|null; lot_id: string|null; lot_number: string|null;
  inspected_quantity: string | number; status: string; created_at: string;
  results: Array<{id:string;checkId:string;passed:boolean;numericValue:number|null;textValue:string|null;booleanValue:boolean|null}>;
}
export interface ProductionSupplierProduct {id:string;name:string;sku:string}
export const apiProductionQuality = {
  boms: (s: CommerceScope) => apiClient.get<ManufacturingBom[]>(`${root(s)}/manufacturing/boms`),
  createBom: (s: CommerceScope, body: {productId:string;bomCode?:string;outputQuantity:number;status:'draft'|'active';notes?:string;components:Array<{productId:string;quantityPerOutput:number;scrapPercent:number;operationName?:string;sequence:number}>}) => apiClient.post(`${root(s)}/manufacturing/boms`, body, idempotency()),
  workOrders: (s: CommerceScope) => apiClient.get<ManufacturingWorkOrder[]>(`${root(s)}/manufacturing/work-orders`),
  createWorkOrder: (s: CommerceScope, body: {bomId:string;warehouseId:string;plannedQuantity:number;plannedStart?:string;dueDate?:string}) => apiClient.post(`${root(s)}/manufacturing/work-orders`, body, idempotency()),
  releaseWorkOrder: (s: CommerceScope,id:string) => apiClient.post(`${root(s)}/manufacturing/work-orders/${enc(id)}/release`, {}, idempotency()),
  completeWorkOrder: (s: CommerceScope,id:string,body: {completedQuantity:number;batchNumber?:string;serialNumbers?:string[]}) => apiClient.post(`${root(s)}/manufacturing/work-orders/${enc(id)}/complete`, body, idempotency()),
  jobCards: (s: CommerceScope) => apiClient.get<ManufacturingJobCard[]>(`${root(s)}/manufacturing/job-cards`),
  startJobStep: (s: CommerceScope,cardId:string,stepId:string) => apiClient.post(`${root(s)}/manufacturing/job-cards/${enc(cardId)}/steps/${enc(stepId)}/start`, {}, idempotency()),
  completeJobStep: (s: CommerceScope,cardId:string,stepId:string,body:{actualMinutes:number;notes?:string}) => apiClient.post(`${root(s)}/manufacturing/job-cards/${enc(cardId)}/steps/${enc(stepId)}/complete`,body,idempotency()),
  plans: (s: CommerceScope) => apiClient.get<InspectionPlan[]>(`${root(s)}/quality/plans`),
  createPlan: (s: CommerceScope,body:{planCode?:string;name:string;productId?:string;inspectionStage:'receiving'|'in_process'|'final';checks:Array<{code:string;description:string;type:string;required:boolean;minimum?:number;maximum?:number;sequence:number}>}) => apiClient.post(`${root(s)}/quality/plans`,body,idempotency()),
  inspections: (s: CommerceScope) => apiClient.get<QualityInspection[]>(`${root(s)}/quality/inspections`),
  createInspection: (s: CommerceScope,body:{planId:string;productId:string;workOrderId?:string;lotId?:string;inspectedQuantity:number;sourceType?:string}) => apiClient.post(`${root(s)}/quality/inspections`,body,idempotency()),
  decideInspection: (s: CommerceScope,id:string,body:{decision:'passed'|'failed';notes?:string;results:Array<{checkId:string;booleanValue?:boolean;numericValue?:number;textValue?:string;comments?:string}>}) => apiClient.post(`${root(s)}/quality/inspections/${enc(id)}/decision`,body,idempotency()),
};
