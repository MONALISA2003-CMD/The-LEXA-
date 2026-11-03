import { apiClient } from './apiClient';
const enc=encodeURIComponent;
const path=(workspaceId:string,branchId:string)=>`/workspaces/${enc(workspaceId)}/branches/${enc(branchId)}/crm`;
export interface CustomerGrowthSummary {
 asOf:string;period:string;
 counts:{leads:number;opportunities:number;contacts:number;campaigns:number;salespeople:number;customers:number;dueFollowUps:number;openOpportunities:number;weightedPipeline:number};
 leadPipeline:Record<string,number>;opportunityPipeline:Record<string,{count:number;value:number;weighted:number}>;
 salesByCustomer:Record<string,{count:number;totalMinor:number}>;
 salesByOpportunity:Record<string,{count:number;totalMinor:number}>;
 salesByEmployee:Record<string,{count:number;totalMinor:number}>;
 campaignPerformance:Array<{id:string;name:string;leads:number;deals:number;completedSalesMinor:number;budget:number;recordedSpend:number;channel:string;status:string}>;
 sourceNote:string;
}
export interface GrowthPerson {employeeId:string;userId:string;name:string;title:string;department:string;employeeNumber:string;role:string}
export interface GrowthActivity {id:string;activityType:string;summary:string;happenedAt:string;nextFollowUpOn:string|null}
export interface CheckoutGrowthChoices {
 customers:Array<{id:string;name:string;phone:string}>;
 opportunities:Array<{id:string;name:string;customerId:string;campaignId:string}>;
 salespeople:Array<{id:string;name:string}>;
}
export const apiCustomerGrowth={
 summary:(workspaceId:string,branchId:string)=>apiClient.get<CustomerGrowthSummary>(`${path(workspaceId,branchId)}/summary`),
 people:(workspaceId:string,branchId:string)=>apiClient.get<GrowthPerson[]>(`${path(workspaceId,branchId)}/people`),
 choices:(workspaceId:string,branchId:string)=>apiClient.get<CheckoutGrowthChoices>(`${path(workspaceId,branchId)}/choices`),
 activities:(workspaceId:string,branchId:string,moduleId:string,recordId:string)=>apiClient.get<GrowthActivity[]>(`${path(workspaceId,branchId)}/activities/${enc(moduleId)}/${enc(recordId)}`),
 addActivity:(workspaceId:string,branchId:string,moduleId:string,recordId:string,input:{activityType:string;summary:string;nextFollowUpOn?:string})=>
   apiClient.post<{id:string;created:boolean}>(`${path(workspaceId,branchId)}/activities/${enc(moduleId)}/${enc(recordId)}`,input,crypto.randomUUID()),
 convert:(workspaceId:string,branchId:string,moduleId:string,recordId:string)=>
   apiClient.post<{id:string;moduleId:string;existing:boolean}>(`${path(workspaceId,branchId)}/convert/${enc(moduleId)}/${enc(recordId)}`,{},crypto.randomUUID()),
};
