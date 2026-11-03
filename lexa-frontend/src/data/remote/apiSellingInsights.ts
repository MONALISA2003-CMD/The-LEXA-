import {apiClient} from './apiClient';
export interface SellingInsights {
 from:string;to:string;asOf:string;currency:string;timezone:string;
 totals:{salesCount:number;grossMinor:number;returnedMinor:number;netMinor:number;receivedMinor:number;refundMinor:number;
  outstandingMinor:number;overdueMinor:number;openCreditSales:number};
 days:Array<{day:string;salesCount:number;grossMinor:number;receivedMinor:number;refundMinor:number;returnsMinor:number}>;
 methods:Array<{method:string;amountMinor:number;count:number}>;
 topProducts:Array<{productId:string;name:string;units:number;grossMinor:number}>;
 returnReasons:Array<{reason:string;count:number;amountMinor:number}>;
 quotations:Array<{status:string;count:number}>;orders:Array<{status:string;count:number}>;
 note:string;
}
export const apiSellingInsights={
 lookup:(workspaceId:string,branchId:string,receipt:string)=>apiClient.get<import('../../domain/shared/types').Sale[]>('/workspaces/'+encodeURIComponent(workspaceId)+'/branches/'+encodeURIComponent(branchId)+'/selling/lookup',{receipt}),
 get:(workspaceId:string,branchId:string,from?:string,to?:string)=>
   apiClient.get<SellingInsights>('/workspaces/'+encodeURIComponent(workspaceId)+'/branches/'+encodeURIComponent(branchId)+'/selling/insights',
     {...(from?{from}:{}),...(to?{to}:{})}),
};

