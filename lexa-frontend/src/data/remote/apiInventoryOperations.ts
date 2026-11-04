
import {apiClient} from './apiClient';
import type {CommerceScope} from './apiCommerce';
const enc=(value:string)=>encodeURIComponent(value);
const path=(s:CommerceScope)=>`/workspaces/${enc(s.workspaceId)}/branches/${enc(s.branchId)}/supply-chain`;
const inventory=(s:CommerceScope)=>path(s)+'/inventory';
export type RawInventoryRow=Record<string,unknown>;
export interface InventoryProductInsight {
 id:string;name:string;sku:string;categoryId:string|null;onHand:number;reserved:number;quarantined:number;
 available:number;minStock:number;unitCostMinor:number;unitPriceMinor:number;estimatedCostValueMinor:number;
 sold30Days:number;daysOfCover:number|null;lowStock:boolean;lastSold:string|null;
}
export interface InventoryIntelligence{
 asOf:string;periodDays:number;valuationNote:string;
 totals:{products:number;onHand:number;reserved:number;available:number;lowStock:number;estimatedCostMinor:number;expiryRisk:number};
 products:InventoryProductInsight[];
 dailyMovements:Array<{date:string;type:string;quantity:number}>;
 expiring:Array<{id:string;productId:string;batch:string;expiryDate:string;quantity:number;quarantined:number;status:string;daysUntilExpiry:number}>;
 fastSellers:InventoryProductInsight[];
 slowSellers:InventoryProductInsight[];
}
const direct=(s:CommerceScope)=>`/workspaces/${enc(s.workspaceId)}/branches/${enc(s.branchId)}/inventory`;
export const apiInventoryOperations={
 intelligence:(s:CommerceScope)=>apiClient.get<InventoryIntelligence>(direct(s)+'/intelligence'),
 lots:(s:CommerceScope)=>apiClient.get<RawInventoryRow[]>(direct(s)+'/lots'),
 lotHistory:(s:CommerceScope,id:string)=>apiClient.get<{lotId:string;movements:RawInventoryRow[];sales:RawInventoryRow[]}>(direct(s)+'/lots/'+enc(id)+'/history'),
 lotAction:(s:CommerceScope,id:string,action:'quarantine'|'release',reason:string)=>
  apiClient.post<{id:string;status:string}>(direct(s)+'/lots/'+enc(id)+'/'+action,{reason},crypto.randomUUID()),
 policies:(s:CommerceScope)=>apiClient.get<RawInventoryRow[]>(direct(s)+'/replenishment/policies'),
 warehouses:(s:CommerceScope)=>apiClient.get<RawInventoryRow[]>(inventory(s)+'/warehouses'),
 createWarehouse:(s:CommerceScope,data:{code:string;name:string})=>apiClient.post<RawInventoryRow>(inventory(s)+'/warehouses',data,crypto.randomUUID()),
 purchaseOrders:(s:CommerceScope)=>apiClient.get<RawInventoryRow[]>(path(s)+'/procurement/purchase-orders'),
 receive:(s:CommerceScope,poId:string,data:{warehouseId:string;notes?:string;lines:RawInventoryRow[]})=>
  apiClient.post<RawInventoryRow>(path(s)+'/procurement/purchase-orders/'+enc(poId)+'/receipts',data,crypto.randomUUID()),
 counts:(s:CommerceScope)=>apiClient.get<RawInventoryRow[]>(inventory(s)+'/stock-counts'),
 createCount:(s:CommerceScope,data:{warehouseId:string;notes?:string;lines:RawInventoryRow[]})=>
  apiClient.post<RawInventoryRow>(inventory(s)+'/stock-counts',data,crypto.randomUUID()),
 countAction:(s:CommerceScope,id:string,action:'submit'|'review'|'approve')=>
  apiClient.post<RawInventoryRow>(inventory(s)+'/stock-counts/'+enc(id)+'/'+action,{},crypto.randomUUID()),
 transfers:(s:CommerceScope)=>apiClient.get<RawInventoryRow[]>(inventory(s)+'/transfers'),
 createTransfer:(s:CommerceScope,data:{sourceWarehouseId:string;destinationWarehouseId:string;notes?:string;lines:RawInventoryRow[]})=>
  apiClient.post<RawInventoryRow>(inventory(s)+'/transfers',data,crypto.randomUUID()),
 transferAction:(s:CommerceScope,id:string,action:'dispatch'|'receive',data?:RawInventoryRow)=>
  apiClient.post<RawInventoryRow>(inventory(s)+'/transfers/'+enc(id)+'/'+action,data??{},crypto.randomUUID()),
 suggestions:(s:CommerceScope)=>apiClient.get<RawInventoryRow[]>(inventory(s)+'/replenishment/suggestions'),
 savePolicy:(s:CommerceScope,data:RawInventoryRow)=>
  apiClient.post<RawInventoryRow>(inventory(s)+'/replenishment/policies',data,crypto.randomUUID()),
 picklists:(s:CommerceScope)=>apiClient.get<RawInventoryRow[]>(inventory(s)+'/picklists'),
 createPicklist:(s:CommerceScope,data:{warehouseId:string;sourceType?:string;sourceId?:string;lines:RawInventoryRow[]})=>
  apiClient.post<RawInventoryRow>(inventory(s)+'/picklists',data,crypto.randomUUID()),
 recordPick:(s:CommerceScope,id:string,data:RawInventoryRow)=>
  apiClient.post<RawInventoryRow>(inventory(s)+'/picklists/'+enc(id)+'/pick',data,crypto.randomUUID()),
 boms:(s:CommerceScope)=>apiClient.get<RawInventoryRow[]>(path(s)+'/manufacturing/boms'),
 createBom:(s:CommerceScope,data:{productId:string;bomCode?:string;components:RawInventoryRow[]})=>
  apiClient.post<RawInventoryRow>(path(s)+'/manufacturing/boms',data,crypto.randomUUID()),
};

