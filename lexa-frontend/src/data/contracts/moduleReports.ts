import type { ModuleRecordScope } from './previewData';
import type { PreviewReportName, ReportPeriod, PreviewReportSnapshot } from '../local/moduleReports';

export interface ModuleReportService {
  getSnapshot(scope: ModuleRecordScope, report: PreviewReportName, period: ReportPeriod, currency: string): Promise<PreviewReportSnapshot>;
}
