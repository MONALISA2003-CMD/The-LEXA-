import type { DashboardAnalytics, DashboardPeriod } from '../contracts/dashboardAnalytics';
import { apiClient } from './apiClient';
const enc = (value: string) => encodeURIComponent(value);

export const apiDashboard = {
  async getOverview(workspaceId: string, branchId: string, period: DashboardPeriod, signal?: AbortSignal): Promise<DashboardAnalytics> {
    const response = await apiClient.get<unknown>(`/workspaces/${enc(workspaceId)}/branches/${enc(branchId)}/analytics/overview`, { period, compare: true }, signal);
    if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('The backend returned an invalid overview analytics response.');
    const result = response as Partial<DashboardAnalytics>;
    if (typeof result.generatedAt !== 'string' || !Array.isArray(result.kpis) || !Array.isArray(result.salesTrend) || !Array.isArray(result.salesByChannel) || !Array.isArray(result.stockHealth) || !Array.isArray(result.recentActivity) || !Array.isArray(result.exceptions)) {
      throw new Error('Overview analytics response is incomplete. Expected generatedAt, KPIs, trend, breakdowns, activity and exceptions.');
    }
    for (const kpi of result.kpis) if (!kpi || typeof kpi.key !== 'string' || typeof kpi.label !== 'string' || typeof kpi.value !== 'number' || !Number.isFinite(kpi.value)) throw new Error('Overview analytics included an invalid KPI.');
    return { ...result, period, comparisonPeriod: result.comparisonPeriod ?? 'Previous comparable period' } as DashboardAnalytics;
  },
};
