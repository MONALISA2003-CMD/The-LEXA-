import { apiClient } from './apiClient';

export type PlatformRole = 'super_admin'|'billing_manager'|'support_agent'|'operations_manager'|'auditor';
export type SubscriptionStatus = 'pending'|'active'|'suspended'|'legacy';
export interface SubscriptionStatusResponse {
  workspaceId: string; businessName: string; status: SubscriptionStatus;
  operational: boolean; canManageBilling:boolean; expiresAt: string|null; remainingDays: number;
  priceUGX: number; periodDays: number; paymentInstructions: string; whatsappNumber: string|null; supportPhone:string;
  latestPayment: { id:string; payment_reference:string; status:string; created_at:string; review_note:string|null }|null;
}
export interface PlatformProfile { role:PlatformRole; mfaEnabled:boolean; requiresMfa:boolean; priceUGX:number; periodDays:number }
export interface PlatformBusiness { tenant_id:string; business_name:string; owner_email:string|null; status:SubscriptionStatus; activated_at:string|null; paid_through:string|null; created_at:string }
export interface PlatformPayment { id:string; tenant_id:string; business_name:string; owner_email:string|null; payment_reference:string; method:string; transaction_reference:string|null; verified_reference:string|null; claim_message:string|null; amount_ugx:number; status:string; created_at:string; reviewed_at:string|null; review_note:string|null }
export interface PlatformUser {user_id:string;tenant_id:string;business_name:string;email:string;display_name:string|null;membership_role:string;membership_status:string;joined_at:string;updated_at:string}
export interface PlatformSummary {
  checkedAt:string;subscriptionPriceUGX:number;
  businesses:{businesses:number;active:number;pending:number;legacy:number;expiring:number;expired:number};
  payments:{submitted:number;cash_collected:number;last_30_days:number};openSupportCases:number;incidentAlerts:{critical:number;high:number};
}
export interface PlatformRevenue { currency:'UGX';priceUGX:number;totals:{total:number;last_30_days:number;payments:number};trend:Array<{day:string;revenue:number;payments:number}> }
export interface PlatformHealth {
  checkedAt:string;api:{status:string};database:{status:string};render:{status:string;reason:string};vercel:{status:string;reason:string};
  redis:{status:string};scanner:{status:string};worker:{status:string;lastSeenAt:string|null};
  observability:{sentryConfigured:boolean;otelConfigured:boolean};
  billing:{pending_payment_reviews:number;oldest_payment_hours:number|null;expiring:number};
  recommendations:Array<{severity:'high'|'medium'|'info';title:string;description:string;action:string}>;
}
export interface PlatformSupportCase {id:string;tenant_id:string;business_name:string;subject:string;description:string;status:string;priority:string;created_at:string;updated_at:string}
export interface PlatformIncident {id:string;category:string;title:string;description:string;severity:string;status:string;created_at:string;updated_at:string}
export interface PlatformAudit {id:string;actor_user_id:string;tenant_id:string|null;action:string;details:Record<string,unknown>;created_at:string}

const base='/platform-admin';
const business = (id:string) => `/workspaces/${encodeURIComponent(id)}/platform-billing`;
export const apiPlatformAdministration = {
  profile:() => apiClient.get<PlatformProfile>(`${base}/profile`),
  overview:() => apiClient.get<PlatformSummary>(`${base}/overview`),
  businesses:(q='',offset=0) => apiClient.get<PlatformBusiness[]>(`${base}/businesses`,{q,limit:50,offset}),
  users:(q='',offset=0) => apiClient.get<PlatformUser[]>(`${base}/users`,{q,limit:50,offset}),
  business:(id:string)=>apiClient.get<{business:PlatformBusiness;payments:PlatformPayment[];periods:Array<{starts_at:string;ends_at:string;amount_ugx:number;created_at:string}>}>(`${base}/businesses/${encodeURIComponent(id)}`),
  payments:(status='submitted')=>apiClient.get<PlatformPayment[]>(`${base}/payments`,{status}),
  approve:(id:string,verifiedReference:string,note:string)=>apiClient.post(`${base}/payments/${encodeURIComponent(id)}/approve`,{verifiedReference,note,confirmation:'I_VERIFIED_RECEIPT'}),
  reject:(id:string,reason:string)=>apiClient.post(`${base}/payments/${encodeURIComponent(id)}/reject`,{reason}),
  access:(tenantId:string,status:'suspended'|'reinstate',reason:string)=>apiClient.post(`${base}/businesses/${encodeURIComponent(tenantId)}/access`,{status,reason}),
  transitionLegacy:(tenantId:string,reason:string)=>apiClient.post(`${base}/businesses/${encodeURIComponent(tenantId)}/enroll`,{confirmation:'I_APPROVE_BILLING_TRANSITION',reason}),
  revenue:()=>apiClient.get<PlatformRevenue>(`${base}/revenue`),
  health:()=>apiClient.get<PlatformHealth>(`${base}/health`),
  support:()=>apiClient.get<PlatformSupportCase[]>(`${base}/support`),
  supportStatus:(id:string,status:string)=>apiClient.post(`${base}/support/${encodeURIComponent(id)}/status`,{status}),
  incidents:()=>apiClient.get<PlatformIncident[]>(`${base}/incidents`),
  createIncident:(input:{title:string;description:string;severity:string;category:string})=>apiClient.post(`${base}/incidents`,input),
  incidentStatus:(id:string,status:string)=>apiClient.post(`${base}/incidents/${encodeURIComponent(id)}/status`,{status}),
  audit:()=>apiClient.get<PlatformAudit[]>(`${base}/audit`),
};
export const apiPlatformBilling = {
  status:(workspaceId:string)=>apiClient.get<SubscriptionStatusResponse>(`${business(workspaceId)}/status`),
  payments:(workspaceId:string)=>apiClient.get<PlatformPayment[]>(`${business(workspaceId)}/payments`),
  submit:(workspaceId:string,method:string,transactionReference:string,message:string)=>apiClient.post(`${business(workspaceId)}/payments`,{method,transactionReference,message}),
  support:(workspaceId:string)=>apiClient.get<Array<{id:string;subject:string;description:string;status:string;created_at:string}>>(`${business(workspaceId)}/support`),
  openSupport:(workspaceId:string,subject:string,description:string)=>apiClient.post(`${business(workspaceId)}/support`,{subject,description}),
};
