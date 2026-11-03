import { apiClient } from './apiClient';

export type IntelligenceScope = 'overview' | 'sales' | 'inventory' | 'finance' | 'customers' | 'people';
export interface IntelligenceStatus {
  enabled: boolean;
  serviceConfigured: boolean;
  entitled: boolean;
  canRun: boolean;
  canExtract: boolean;
  canRunBusiness: boolean;
  canRunHelp: boolean;
  canManageFeatures: boolean;
  canViewSupportDiagnostics: boolean;
  businessAvailable: boolean;
  publicHelpAvailable: boolean;
  providersAvailable?: string[];
  paidTierEnabled?: boolean;
  availability: 'available_on_request' | 'unavailable';
  coreLexaImpact: 'none';
  explanation: string;
}
export interface IntelligenceAnswer {
  answer: string;
  scope: IntelligenceScope;
  assurance: string;
  requestId: string;
  usage: { inputTokens: number; outputTokens: number; reservedBudgetMicros: number };
}
export interface IntelligenceUsage {
  periodStart: string | null;
  periodEnd: string | null;
  meters: Array<{ meter_key: string; period_start: string; quantity: number; amount_micros: number; updated_at: string }>;
  recentAiActivity: Array<{ purpose: string; data_class: string; status: string; provider?: string; model_alias?: string; provider_model?: string | null; input_tokens: number; output_tokens: number; reserved_micros: number; reported_cost_micros?: number | null; created_at: string }>;
  contentLogging: string;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export interface BusinessBrief {mode:'automated';generatedAt:string;observations:string[];sources:string[];notice:string}
export const apiIntelligence = {
  brief(workspaceId:string,branchId:string):Promise<BusinessBrief> {return apiClient.get<BusinessBrief>(`/workspaces/${encodeURIComponent(workspaceId)}/branches/${encodeURIComponent(branchId)}/intelligence/brief`);},

  status(workspaceId: string, branchId: string) {
    return apiClient.get<IntelligenceStatus>(`/workspaces/${encodeURIComponent(workspaceId)}/branches/${encodeURIComponent(branchId)}/intelligence/status`);
  },
  help(workspaceId: string, branchId: string, question: string) {
    return apiClient.post<IntelligenceAnswer>(`/workspaces/${encodeURIComponent(workspaceId)}/branches/${encodeURIComponent(branchId)}/intelligence/help`, { question });
  },
  explain(workspaceId: string, branchId: string, question: string, scope: IntelligenceScope) {
    return apiClient.post<IntelligenceAnswer>(`/workspaces/${encodeURIComponent(workspaceId)}/branches/${encodeURIComponent(branchId)}/intelligence/explain`, { question, scope });
  },
  plans(workspaceId: string, branchId: string) {
    return apiClient.get<{ plans: Array<{ plan_key: string; display_name: string; max_users: number; max_branches: number; ai_requests_monthly: number; ai_budget_micros_monthly: number; features: Record<string, boolean> }>; billing: string }>(`/workspaces/${encodeURIComponent(workspaceId)}/branches/${encodeURIComponent(branchId)}/saas/plans`);
  },
  usage(workspaceId: string, branchId: string) {
    return apiClient.get<IntelligenceUsage>(`/workspaces/${encodeURIComponent(workspaceId)}/branches/${encodeURIComponent(branchId)}/saas/usage`);
  },
  entitlements(workspaceId: string, branchId: string) {
    return apiClient.get<{ subscription: Record<string, unknown>; features: Record<string, boolean> }>(`/workspaces/${encodeURIComponent(workspaceId)}/branches/${encodeURIComponent(branchId)}/saas/entitlements`);
  },
  setFeatureOverride(workspaceId: string, branchId: string, featureKey: string, enabled: boolean, reason: string) {
    return apiClient.put<{ feature_key: string; enabled: boolean; reason: string; expires_at: string | null }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/branches/${encodeURIComponent(branchId)}/saas/features/${encodeURIComponent(featureKey)}`,
      { enabled, reason },
    );
  },
  supportDiagnostics(workspaceId: string, branchId: string) {
    return apiClient.get<{ diagnostics: { active_members: number; branches: number; ai_requests_30d: number; ai_failures_30d: number }; access: string }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/branches/${encodeURIComponent(branchId)}/saas/support-diagnostics`,
    );
  },
  async extract(workspaceId: string, branchId: string, file: File) {
    if (file.size < 1 || file.size > 5 * 1024 * 1024) throw new Error('Choose a file smaller than 5 MiB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    return apiClient.post<{ filename: string; text: string; pages: number | null; characters: number; warnings: string[]; assurance: string; requestId: string }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/branches/${encodeURIComponent(branchId)}/intelligence/extract`,
      { filename: file.name, mimeType: file.type || 'application/octet-stream', contentBase64: encodeBase64(bytes) },
    );
  },
};
