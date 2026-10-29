import type { PreviewRecord } from '../../modules/operations/moduleCatalog';

/** Active business scope. The server must validate the authenticated user's access to both IDs. */
export interface ModuleRecordScope {
  workspaceId: string;
  branchId: string;
}

export type DataPersistenceMode = 'server' | 'browser-local' | 'memory-only';

/** Runtime-agnostic contract for list/create/update/status operations used by register screens. */
export interface ModuleRecordService {
  list(scope: ModuleRecordScope, moduleId: string, emptyInitial?: PreviewRecord[]): Promise<PreviewRecord[]>;
  save(scope: ModuleRecordScope, moduleId: string, record: PreviewRecord, emptyInitial?: PreviewRecord[]): Promise<PreviewRecord[]>;
  replace(scope: ModuleRecordScope, moduleId: string, records: PreviewRecord[], emptyInitial?: PreviewRecord[]): Promise<PreviewRecord[]>;
  updateStatus(scope: ModuleRecordScope, moduleId: string, recordId: string, status: string, emptyInitial?: PreviewRecord[]): Promise<PreviewRecord[]>;
  reset(scope: ModuleRecordScope, moduleId: string, emptyInitial?: PreviewRecord[]): Promise<PreviewRecord[]>;
  getPersistenceMode(): DataPersistenceMode;
}

// Compatibility type aliases for the existing isolated unit tests. Production UI uses ModuleRecordService.
export type PreviewScope = ModuleRecordScope;
export type PreviewPersistenceMode = DataPersistenceMode;
export type PreviewDataService = ModuleRecordService;
