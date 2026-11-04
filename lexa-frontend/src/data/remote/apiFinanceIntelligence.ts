import { apiClient } from './apiClient';
const enc = encodeURIComponent;
const base = (w: string, b: string) => `/workspaces/${enc(w)}/branches/${enc(b)}/finance`;
const idempotencyKey = () => crypto.randomUUID();
export type FinanceMonth = { month: string; revenueMinor: string; expenseMinor: string; inflowMinor: string; outflowMinor: string };
export type FinanceOverview = { source: 'posted_ledger'; workspaceId: string; branchId: string; generatedAt: string; hasActivity: boolean; postedJournalCount: number; recordedCashBalanceMinor: string; monthly: FinanceMonth[] };
export type FinanceBudget = { id: string; costCentreId: string; costCentreName: string; accountingPeriodId: string; periodKey: string; status: 'draft' | 'submitted' | 'approved'; version: number; plannedMinor: string; actualMinor: string; committedMinor: null; createdAt: string };
export type CashForecast = { history: Array<{ month: string; inflowMinor: number; outflowMinor: number; netMinor: number }>; forecast: Array<{ month: string; inflowMinor: number; outflowMinor: number; netMinor: number }>; method: string; hasData: boolean; disclaimer: string; source: 'posted_cash_ledger'; generatedAt: string };
function typedRecord<T>(value: unknown): T {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Finance response did not contain the expected record.');
  return value as T;
}
export const apiFinanceIntelligence = {
  overview: async (w: string, b: string) => typedRecord<FinanceOverview>(await apiClient.get(`${base(w,b)}/overview`)),
  budgets: async (w: string, b: string) => {
    const data = await apiClient.get<unknown>(`${base(w,b)}/budgets`);
    if (!Array.isArray(data)) throw new Error('The budget register could not be verified.');
    return data as FinanceBudget[];
  },
  createBudget: (w: string, b: string, input: { costCentreId: string; accountingPeriodId: string; plannedMinor: number }) => apiClient.post(`${base(w,b)}/budgets`, input, idempotencyKey()),
  submitBudget: (w: string, b: string, id: string) => apiClient.post(`${base(w,b)}/budgets/${enc(id)}/submit`, {}, idempotencyKey()),
  approveBudget: (w: string, b: string, id: string) => apiClient.post(`${base(w,b)}/budgets/${enc(id)}/approve`, {}, idempotencyKey()),
  cashForecast: async (w: string, b: string) => typedRecord<CashForecast>(await apiClient.get(`${base(w,b)}/analysis/cash-forecast`)),
};
