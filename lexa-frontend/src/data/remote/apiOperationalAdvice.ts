import { apiClient } from './apiClient';

export type OperationalArea = 'inventory' | 'purchasing' | 'finance' | 'sales' | 'fulfilment' | 'production';
export type OperationalPriority = 'urgent' | 'important' | 'routine';
export interface OperationalWorkItem {
  id: string;
  area: OperationalArea;
  code: string;
  count: number;
  source: string;
  asOf: string;
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
  priority: OperationalPriority;
  recommendationType: 'deterministic_rule';
}
export interface OperationalAdviceSnapshot {
  generatedAt: string;
  workspaceId: string;
  branchId: string;
  source: 'authoritative_operational_records';
  notice: string;
  items: OperationalWorkItem[];
}
const encode = (id: string) => encodeURIComponent(id);
export const apiOperationalAdvice = {
  async list(workspaceId: string, branchId: string, signal?: AbortSignal): Promise<OperationalAdviceSnapshot> {
    const result = await apiClient.get<OperationalAdviceSnapshot>(
      `/workspaces/${encode(workspaceId)}/branches/${encode(branchId)}/operational-advice`, undefined, signal);
    if (!result || result.source !== 'authoritative_operational_records' || !Array.isArray(result.items) ||
      result.workspaceId !== workspaceId || result.branchId !== branchId ||
      result.items.some(item => typeof item.id !== 'string' || typeof item.title !== 'string' ||
        !Number.isSafeInteger(item.count) || item.count < 1 || !item.href.startsWith('/') || item.href.startsWith('//'))) {
      throw new Error('The operational work queue returned invalid records.');
    }
    return result;
  },
};
