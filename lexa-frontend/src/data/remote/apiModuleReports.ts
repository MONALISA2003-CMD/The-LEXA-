import type { ModuleReportService } from '../contracts/moduleReports';
import type { PreviewReportName, ReportPeriod, PreviewReportSnapshot } from '../local/moduleReports';
import type { ModuleRecordScope } from '../contracts/previewData';
import { apiClient } from './apiClient';

const enc = (value: string) => encodeURIComponent(value);

export const apiModuleReportService: ModuleReportService = {
  async getSnapshot(scope: ModuleRecordScope, report: PreviewReportName, period: ReportPeriod, currency: string) {
    const result = await apiClient.get<unknown>(`/workspaces/${enc(scope.workspaceId)}/branches/${enc(scope.branchId)}/reports/modules`, { report, period, currency });
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('The backend returned an invalid module report.');
    const snapshot = result as Partial<PreviewReportSnapshot>;
    if (!Array.isArray(snapshot.entries) || !Array.isArray(snapshot.metrics) || !snapshot.filteredRecordCounts || typeof snapshot.generatedAt !== 'string') {
      throw new Error('The backend report response is incomplete. Expected entries, metrics, counts and generatedAt.');
    }
    return { ...snapshot, report, period, currency, persistenceMode: 'server', sourceLabel: snapshot.sourceLabel || 'Backend records' } as PreviewReportSnapshot;
  },
};
