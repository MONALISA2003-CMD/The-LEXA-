
import { apiClient } from './apiClient';
import type { CommerceScope } from './apiCommerce';

export interface LogisticsPackageLine {
 id:string;orderLineId:string;productId:string;productName:string;sku:string;quantity:number;
}
export type LogisticsPackageStatus = 'packed'|'sealed'|'dispatched'|'delivered'|'returned'|'cancelled';
export interface LogisticsPackage {
 id:string;packageNumber:string;orderId:string;orderNumber:string;deliveryId:string|null;deliveryNumber:string|null;
 customerName:string;recipientName:string;recipientPhone:string;deliveryAddress:string;status:LogisticsPackageStatus;
 weightKg:number|null;lengthCm:number|null;widthCm:number|null;heightCm:number|null;
 handlingNotes:string;sealNumber:string;trackingReference:string;packedAt:string;sealedAt:string|null;deliveredAt:string|null;
 lines:LogisticsPackageLine[];
}
export interface LogisticsPackageCreate {
 orderId:string;recipientName?:string;recipientPhone?:string;deliveryAddress?:string;
 weightKg?:number|null|undefined;lengthCm?:number|null|undefined;widthCm?:number|null|undefined;heightCm?:number|null|undefined;
 handlingNotes?:string;sealNumber?:string;
 lines:Array<{orderLineId:string;quantity:number}>;
}
const enc=(v:string)=>encodeURIComponent(v);
const base=(s:CommerceScope)=>`/workspaces/${enc(s.workspaceId)}/branches/${enc(s.branchId)}/logistics/packages`;
export const apiLogisticsPackages={
 list:(s:CommerceScope)=>apiClient.get<LogisticsPackage[]>(base(s)),
 summary:(s:CommerceScope)=>apiClient.get<{total:number;statuses:Array<{status:LogisticsPackageStatus;count:number}>}>(base(s)+'/summary'),
 create:(s:CommerceScope,input:LogisticsPackageCreate)=>apiClient.post<LogisticsPackage>(base(s),input,crypto.randomUUID()),
 seal:(s:CommerceScope,id:string)=>apiClient.post<LogisticsPackage>(base(s)+'/'+enc(id)+'/seal',{},crypto.randomUUID()),
 cancel:(s:CommerceScope,id:string,reason:string)=>apiClient.post<LogisticsPackage>(base(s)+'/'+enc(id)+'/cancel',{reason},crypto.randomUUID()),
};

