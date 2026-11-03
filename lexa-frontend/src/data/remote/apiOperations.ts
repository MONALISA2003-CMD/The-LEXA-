import { apiClient } from './apiClient';
const enc=(value:string)=>encodeURIComponent(value);
const root=(workspaceId:string,branchId:string)=>`/workspaces/${enc(workspaceId)}/branches/${enc(branchId)}/operations`;
export const apiOperations={
  overview:(workspaceId:string,branchId:string)=>apiClient.get<any>(`${root(workspaceId,branchId)}/overview`),
  alerts:(workspaceId:string,branchId:string)=>apiClient.get<any[]>(`${root(workspaceId,branchId)}/alerts`),
  rules:(workspaceId:string,branchId:string)=>apiClient.get<any[]>(`${root(workspaceId,branchId)}/alert-rules`),
  updateRule:(workspaceId:string,branchId:string,ruleKey:string,input:unknown)=>apiClient.put<any>(`${root(workspaceId,branchId)}/alert-rules/${enc(ruleKey)}`,input),
  acknowledge:(workspaceId:string,branchId:string,id:string)=>apiClient.post(`${root(workspaceId,branchId)}/alerts/${enc(id)}/acknowledge`,{},crypto.randomUUID()),
  resolve:(workspaceId:string,branchId:string,id:string)=>apiClient.post(`${root(workspaceId,branchId)}/alerts/${enc(id)}/resolve`,{},crypto.randomUUID()),
  emailDeliveries:(workspaceId:string,branchId:string)=>apiClient.get<any[]>(`${root(workspaceId,branchId)}/email-deliveries`),
  retryEmail:(workspaceId:string,branchId:string,id:string)=>apiClient.post(`${root(workspaceId,branchId)}/email-deliveries/${enc(id)}/retry`,{},crypto.randomUUID()),
};
