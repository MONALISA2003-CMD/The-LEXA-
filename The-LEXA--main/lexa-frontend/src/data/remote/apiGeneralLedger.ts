import { apiClient } from './apiClient';

export interface LedgerScope { workspaceId: string; branchId: string; }
export interface LedgerAccount { id: string; accountCode: string; accountName: string; accountType: string; normalBalance: string; systemKey?: string; isActive: boolean; }
export interface LedgerLineInput { accountId: string; debitMinor?: number; creditMinor?: number; description?: string; }
export interface LedgerJournalInput { entryDate: string; memo: string; lines: LedgerLineInput[]; }
export interface LedgerJournal { id: string; journalNumber: string; entryDate: string; memo: string; status: 'draft' | 'posted'; sourceType?: string; sourceId?: string; reversalOfId?: string; debitMinor: number; creditMinor: number; createdAt: string; postedAt?: string; lines: Array<{ id: string; lineNumber: number; accountId: string; accountCode: string; accountName: string; description?: string; debitMinor: number; creditMinor: number }>; }
export interface LedgerSourceWorkflowReconciliation {
  sourceType: string;
  expectedCount: number;
  postedCount: number;
  missingCount: number;
  unpostedCount: number;
  unbalancedCount: number;
  amountMismatchCount: number;
  missingIds: string[];
  unpostedIds: string[];
  unbalancedIds: string[];
  amountMismatchIds: string[];
}
export interface LedgerSourceReconciliation {
  workspaceId: string;
  branchId: string;
  checkedAt: string;
  healthy: boolean;
  expectedCount: number;
  postedCount: number;
  missingCount: number;
  unpostedCount: number;
  unbalancedCount: number;
  amountMismatchCount: number;
  orphanJournalCount: number;
  orphanJournalIds: string[];
  workflows: LedgerSourceWorkflowReconciliation[];
  note: string;
}

const base = (scope: LedgerScope) => `/workspaces/${encodeURIComponent(scope.workspaceId)}/branches/${encodeURIComponent(scope.branchId)}/ledger`;
function list<T>(value: unknown, label: string): T[] { if (!Array.isArray(value)) throw new Error(`The backend returned an invalid ${label} collection.`); return value as T[]; }
function record<T>(value: unknown, label: string): T { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`The backend returned an invalid ${label} response.`); return value as T; }

export const apiGeneralLedger = {
  async accounts(scope: LedgerScope) { return list<LedgerAccount>(await apiClient.get(`${base(scope)}/accounts`), 'ledger account'); },
  async createAccount(scope: LedgerScope, input: { accountCode: string; accountName: string; accountType: string; normalBalance: 'debit' | 'credit' }) { return record<LedgerAccount>(await apiClient.post(`${base(scope)}/accounts`, input), 'created ledger account'); },
  async periods(scope: LedgerScope) { return list<{ id: string; periodKey: string; startsOn: string; endsOn: string; status: string }>(await apiClient.get(`${base(scope)}/periods`), 'accounting period'); },
  async closePeriod(scope: LedgerScope, periodId: string) { return record<{ id: string; status: string }>(await apiClient.post(`${base(scope)}/periods/${encodeURIComponent(periodId)}/close`, {}), 'closed accounting period'); },
  async journals(scope: LedgerScope, filters: { from?: string; to?: string } = {}) { return list<LedgerJournal>(await apiClient.get(`${base(scope)}/journals`, filters), 'ledger journal'); },
  async createJournal(scope: LedgerScope, input: LedgerJournalInput) { return record<LedgerJournal>(await apiClient.post(`${base(scope)}/journals`, input, crypto.randomUUID()), 'created ledger journal'); },
  async postJournal(scope: LedgerScope, journalId: string) { return record<LedgerJournal>(await apiClient.post(`${base(scope)}/journals/${encodeURIComponent(journalId)}/post`, {}), 'posted ledger journal'); },
  async reverseJournal(scope: LedgerScope, journalId: string, reason: string) { return record<LedgerJournal>(await apiClient.post(`${base(scope)}/journals/${encodeURIComponent(journalId)}/reverse`, { reason }), 'reversal journal'); },
  async trialBalance(scope: LedgerScope, asOf?: string) { return list<{ id: string; accountCode: string; accountName: string; accountType: string; debitMinor: number; creditMinor: number; netDebitMinor: number }>(await apiClient.get(`${base(scope)}/reports/trial-balance`, { asOf }), 'trial balance'); },
  async profitAndLoss(scope: LedgerScope, filters: { from?: string; to?: string } = {}) { return record<{ from: string; to: string; revenueMinor: number; expensesMinor: number; netProfitMinor: number; accounts: Array<{ id: string; accountCode: string; accountName: string; accountType: string; amountMinor: number }> }>(await apiClient.get(`${base(scope)}/reports/profit-and-loss`, filters), 'profit and loss report'); },
  async balanceSheet(scope: LedgerScope, asOf?: string) { return record<{ asOf: string; totalAssetsMinor: number; totalLiabilitiesMinor: number; totalEquityMinor: number; accumulatedEarningsMinor: number; liabilitiesAndEquityMinor: number; accounts: Array<{ id: string; accountCode: string; accountName: string; accountType: string; balanceMinor: number }> }>(await apiClient.get(`${base(scope)}/reports/balance-sheet`, { asOf }), 'balance sheet'); },
  async accountActivity(scope: LedgerScope, accountId: string, filters: { from?: string; to?: string } = {}) { return list<Record<string, unknown>>(await apiClient.get(`${base(scope)}/accounts/${encodeURIComponent(accountId)}/activity`, filters), 'account activity'); },
  async sourceReconciliation(scope: LedgerScope) { return record<LedgerSourceReconciliation>(await apiClient.get(`${base(scope)}/reports/source-reconciliation`), 'source-to-ledger reconciliation'); },
};
