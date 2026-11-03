import { apiClient } from './apiClient';
export interface SellingPriceList {
 id:string;code:string;name:string;currency:string;startsAt:string|null;endsAt:string|null;active:boolean;
 items?:Array<{productId:string;variantId:string|null;unitPriceMinor:number;taxCodeId:string|null}>;
}
const base=(workspaceId:string)=>'/workspaces/'+encodeURIComponent(workspaceId)+'/catalog/price-lists';
export const apiSellingPrices={
 list:(workspaceId:string)=>apiClient.get<SellingPriceList[]>(base(workspaceId)),
 active:(workspaceId:string)=>apiClient.get<SellingPriceList[]>(base(workspaceId)+'/active'),
 create:(workspaceId:string,record:{code:string;name:string;currency:string;startsAt?:string;endsAt?:string})=>
   apiClient.post<SellingPriceList>(base(workspaceId),record,crypto.randomUUID()),
 addProduct:(workspaceId:string,listId:string,input:{productId:string;unitPriceMinor:number})=>
   apiClient.post(base(workspaceId)+'/'+encodeURIComponent(listId)+'/items',input,crypto.randomUUID()),
 activate:(workspaceId:string,listId:string)=>apiClient.post(base(workspaceId)+'/'+encodeURIComponent(listId)+'/activate',{},crypto.randomUUID()),
 deactivate:(workspaceId:string,listId:string)=>apiClient.post(base(workspaceId)+'/'+encodeURIComponent(listId)+'/deactivate',{},crypto.randomUUID()),
};

