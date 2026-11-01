import type { ModuleReportService } from '../contracts/moduleReports';
import { localModuleRecordService } from '../local/moduleRecords';
import { loadPreviewReportSnapshot } from '../local/moduleReports';
import { apiModuleReportService } from '../remote/apiModuleReports';
import { isApiProvider } from '../remote/runtimeConfig';

const localModuleReportService: ModuleReportService = {
  getSnapshot(scope, report, period, currency) {
    return loadPreviewReportSnapshot(localModuleRecordService, scope, report, period, currency);
  },
};

/** Reports in API mode always come from the server; no browser-side fallback is permitted. */
export const moduleReportService = isApiProvider ? apiModuleReportService : localModuleReportService;
