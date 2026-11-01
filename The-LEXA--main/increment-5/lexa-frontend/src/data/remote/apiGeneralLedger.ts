import { apiClient } from './apiClient';

const enc = (value: string) => encodeURIComponent(value);
export interface GeneralLedgerScope { workspaceId: string; branchId: string; }
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'COST_OF_SALES' | 'EXPENSE';
export type AccountControlKey = 'CASH' | 'AR' | 'AP' | 'INVENTORY';
export interface GeneralLedgerAccount {
  id: string; code: string; name: string; accountType: AccountType; normalBalance: 'DEBIT' | 'CREDIT';
  parentId?: string | null; parentCode?: string | null; controlKey?: string | null; isSystem: boolean; isActive: boolean;
  description?: string | null; mappings: Array<{ key: string }>;
}
export interface AccountingPeriod {
  id: string; name: string; startDate: string; endDate: string; status: 'open' | 'closed';
  closedAt?: string | null; reopenedAt?: string | null; closedBy?: string | null;
}
export interface GeneralLedgerLine {
  id?: string; accountId: string; accountCode: string; accountName: string; description?: string;
  debitMinor: number; creditMinor: number;
}
export interface GeneralLedgerJournal {
  id: string; journalNumber: string; postingDate: string; reference?: string | null; description: string;
  currency: string; sourceType?: string | null; sourceId?: string | null; eventType: string; status: 'draft' | 'posted' | 'void';
  debitTotalMinor: number; creditTotalMinor: number; postedAt?: string | null; lines: GeneralLedgerLine[];
}
export interface PostingRule {
  eventType: string; label: string; description: string; enabled: boolean;
  lines: Array<{ lineNumber: number; mappingKey: string; side: 'DEBIT' | 'CREDIT'; amountBasis: string }>;
}
export interface AccountMapping {
  mappingKey: string; accountId: string; accountCode: string; accountName: string; accountType: AccountType; isActive: boolean;
}
export interface TrialBalance {
  asAt: string; rows: Array<{ id: string; code: string; name: string; accountType: AccountType; normalBalance: string; debitMinor: number; creditMinor: number; balanceMinor: number }>;
  totals: { debitMinor: number; creditMinor: number; differenceMinor: number; isBalanced: boolean };
}
export interface ProfitAndLoss {
  from: string; to: string; currency: string;
  rows: Array<{ id: string; code: string; name: string; accountType: AccountType; normalBalance: string; debitMinor: number; creditMinor: number; netMinor: number }>;
  totals: { revenueMinor: number; costOfSalesMinor: number; grossProfitMinor: number; expensesMinor: number; netProfitMinor: number };
}
export interface BalanceSheet {
  asAt: string; currency: string;
  assets: Array<{ id: string; code: string; name: string; accountType: string; normalBalance: string; balanceMinor: number }>;
  liabilities: Array<{ id: string; code: string; name: string; accountType: string; normalBalance: string; balanceMinor: number }>;
  equity: Array<{ id: string; code: string; name: string; accountType: string; normalBalance: string; balanceMinor: number }>;
  currentEarningsMinor: number;
  totals: { assetsMinor: number; liabilitiesMinor: number; equityMinor: number; liabilitiesAndEquityMinor: number; differenceMinor: number };
}
export interface ReconciliationReport {
  rows: Array<{ key: string; label: string; ledgerMinor: number; sourceMinor: number; differenceMinor: number; status: 'matched' | 'review'; basis: string }>;
  matched: number; needsReview: number;
}
function base(scope: GeneralLedgerScope) {
  return `/workspaces/${enc(scope.workspaceId)}/branches/${enc(scope.branchId)}/general-ledger`;
}
function array<T>(value: unknown, label: string): T[] {
  if (!Array.isArray(value)) throw new Error(`The backend returned an invalid ${label} collection.`);
  return value as T[];
}
function record<T>(value: unknown, label: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`The backend returned an invalid ${label} response.`);
  return value as T;
}
export const apiGeneralLedger = {
  async accounts(scope: GeneralLedgerScope) { return array<GeneralLedgerAccount>(await apiClient.get(`${base(scope)}/accounts`), 'chart of accounts'); },
  async createAccount(scope: GeneralLedgerScope, input: { code: string; name: string; accountType: AccountType; parentId?: string; controlKey?: AccountControlKey; description?: string }) {
    return record<GeneralLedgerAccount>(await apiClient.post(`${base(scope)}/accounts`, input, crypto.randomUUID()), 'created account');
  },
  async updateAccount(scope: GeneralLedgerScope, accountId: string, input: { name?: string; description?: string; isActive?: boolean }) {
    return record<{ id: string; updated: boolean }>(await apiClient.patch(`${base(scope)}/accounts/${enc(accountId)}`, input), 'updated account');
  },
  async periods(scope: GeneralLedgerScope) { return array<AccountingPeriod>(await apiClient.get(`${base(scope)}/periods`), 'accounting period'); },
  async createPeriod(scope: GeneralLedgerScope, input: { name: string; startDate: string; endDate: string }) {
    return record<AccountingPeriod>(await apiClient.post(`${base(scope)}/periods`, input, crypto.randomUUID()), 'created accounting period');
  },
  async setPeriodStatus(scope: GeneralLedgerScope, periodId: string, status: 'open' | 'closed') {
    return record<{ id: string; status: string }>(await apiClient.patch(`${base(scope)}/periods/${enc(periodId)}`, { status }), 'accounting period update');
  },
  async journals(scope: GeneralLedgerScope, filters?: { from?: string; to?: string; status?: string }) {
    return array<GeneralLedgerJournal>(await apiClient.get(`${base(scope)}/journals`, filters), 'journal');
  },
  async createJournal(scope: GeneralLedgerScope, input: { postingDate: string; reference?: string; description: string; currency: string; lines: Array<{ accountId: string; description?: string; debitMinor: number; creditMinor: number }> }) {
    return record<{ id: string; journalNumber: string; status: string }>(await apiClient.post(`${base(scope)}/journals`, input, crypto.randomUUID()), 'created journal');
  },
  async voidJournal(scope: GeneralLedgerScope, journalId: string) {
    return record<{ id: string; status: string }>(await apiClient.post(`${base(scope)}/journals/${enc(journalId)}/void`, {}, crypto.randomUUID()), 'journal void');
  },
  async postJournal(scope: GeneralLedgerScope, journalId: string) {
    return record<{ id: string; status: string }>(await apiClient.post(`${base(scope)}/journals/${enc(journalId)}/post`, {}, crypto.randomUUID()), 'journal posting');
  },
  async reverseJournal(scope: GeneralLedgerScope, journalId: string, postingDate: string) {
    return record<{ id: string; journalNumber: string; status: string }>(await apiClient.post(`${base(scope)}/journals/${enc(journalId)}/reverse`, { postingDate }, crypto.randomUUID()), 'journal reversal');
  },
  async journalAudit(scope: GeneralLedgerScope, journalId: string) {
    return array<{ id: string; action: string; details: Record<string, unknown>; createdAt: string; actorName?: string }>(await apiClient.get(`${base(scope)}/journals/${enc(journalId)}/audit`), 'journal audit');
  },
  async postingRules(scope: GeneralLedgerScope) { return array<PostingRule>(await apiClient.get(`${base(scope)}/posting-rules`), 'posting rule'); },
  async setPostingRule(scope: GeneralLedgerScope, eventType: string, enabled: boolean) {
    return record<{ eventType: string; enabled: boolean }>(await apiClient.patch(`${base(scope)}/posting-rules/${enc(eventType)}`, { enabled }), 'posting rule update');
  },
  async mappings(scope: GeneralLedgerScope) { return array<AccountMapping>(await apiClient.get(`${base(scope)}/mappings`), 'account mapping'); },
  async updateMapping(scope: GeneralLedgerScope, mappingKey: string, accountId: string) {
    return record<AccountMapping>(await apiClient.patch(`${base(scope)}/mappings/${enc(mappingKey)}`, { accountId }), 'account mapping update');
  },
  async trialBalance(scope: GeneralLedgerScope, asAt: string) {
    return record<TrialBalance>(await apiClient.get(`${base(scope)}/trial-balance`, { asAt }), 'trial balance');
  },
  async profitAndLoss(scope: GeneralLedgerScope, from: string, to: string) {
    return record<ProfitAndLoss>(await apiClient.get(`${base(scope)}/profit-and-loss`, { from, to }), 'profit and loss statement');
  },
  async balanceSheet(scope: GeneralLedgerScope, asAt: string) {
    return record<BalanceSheet>(await apiClient.get(`${base(scope)}/balance-sheet`, { asAt }), 'balance sheet');
  },
  async reconciliation(scope: GeneralLedgerScope) {
    return record<ReconciliationReport>(await apiClient.get(`${base(scope)}/reconciliation`), 'reconciliation report');
  },
};
