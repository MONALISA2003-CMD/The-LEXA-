import type { PreviewRecord } from '../../modules/operations/moduleCatalog';

export interface PreviewScope {
  workspaceId: string;
  branchId: string;
}

export type PreviewPersistenceMode = 'browser-local' | 'memory-only';

/**
 * Data boundary for future API mapping. This contract deliberately describes
 * preview-only operations; it is separate from the production business API.
 */
export interface PreviewDataService {
  list(scope: PreviewScope, moduleId: string, seed: PreviewRecord[]): Promise<PreviewRecord[]>;
  save(scope: PreviewScope, moduleId: string, record: PreviewRecord, seed: PreviewRecord[]): Promise<PreviewRecord[]>;
  replace(scope: PreviewScope, moduleId: string, records: PreviewRecord[], seed: PreviewRecord[]): Promise<PreviewRecord[]>;
  updateStatus(scope: PreviewScope, moduleId: string, recordId: string, status: string, seed: PreviewRecord[]): Promise<PreviewRecord[]>;
  reset(scope: PreviewScope, moduleId: string, seed: PreviewRecord[]): Promise<PreviewRecord[]>;
  getPersistenceMode(): PreviewPersistenceMode;
}
