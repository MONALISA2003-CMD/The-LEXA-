import { apiClient } from './apiClient';

export interface AuthoritativeReports {
  currency: string;
  timezone: string;
  period: { from: string | null; to: string | null };
  sales: { count: number; grossMinor: number; returnsCount: number; returnsMinor: number; netSalesMinor: number; receiptsMinor: number; refundsMinor: number };
  inventory: { trackedProducts: number; productsWithStock: number; netUnits: number; inventoryCostMinor: number | null; atOrBelowReorder: number; valuationBasis: string };
  receivables?: { invoiceCount: number; billedMinor: number; appliedMinor: number; outstandingMinor: number; overdueCount: number; overdueMinor: number; reconciliation: { glControlBalanceMinor: number; subledgerBalanceMinor: number; differenceMinor: number; status: 'matched' | 'review' }; balanceBasis: string };
  payables?: { billCount: number; billedMinor: number; appliedMinor: number; outstandingMinor: number; overdueCount: number; overdueMinor: number; reconciliation: { glControlBalanceMinor: number; subledgerBalanceMinor: number; differenceMinor: number; status: 'matched' | 'review' }; balanceBasis: string };
  generalLedger?: { postedJournals: number; revenueMinor: number; expenseMinor: number; debitsMinor: number; creditsMinor: number; trialBalanceDifferenceMinor: number; inventoryControlBalanceMinor: number; inventoryValuationReferenceDifferenceMinor: number; balanceBasis: string };
  crm?: { customerRecords: number; leads: number; opportunities: number };
  people?: { activeEmployees: number; employeeRecords: number; attendanceRecords: number; presentRecords: number };
  sourceNotes: string[];
  generatedAt: string;
  assurance: string;
}

export interface Library {
  currency:string;
  period:{from:string;to:string;timezone:string;days:number;previousFrom:string;previousTo:string};
  generatedAt:string;
  families:Array<{key:string;title:string;available:boolean;source:string;link:string;metrics:Array<{label:string;value:number;unit:'money'|'count'|'units';basis:'period'|'current'}>}>;
  trend:Array<{label:string;salesMinor:number;receiptsMinor:number}>;
  paymentMethods:Array<{label:string;amountMinor:number}>;
  comparison:{previousGrossMinor:number;currentGrossMinor:number;changePercent:number|null};
  alerts:Array<{title:string;detail:string;link:string}>;
  sourceNotes:string[];
  assurance:string;
}

export const apiReports = {
  library(workspaceId:string,branchId:string,from:string,to:string):Promise<Library> { return apiClient.get<Library>(`/workspaces/${encodeURIComponent(workspaceId)}/branches/${encodeURIComponent(branchId)}/reports/library?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`); },
  authoritative(workspaceId: string, branchId: string, from?: string, to?: string) {
    return apiClient.get<AuthoritativeReports>(
      `/workspaces/${encodeURIComponent(workspaceId)}/branches/${encodeURIComponent(branchId)}/reports/authoritative`,
      { ...(from ? { from } : {}), ...(to ? { to } : {}) },
    );
  },
};
