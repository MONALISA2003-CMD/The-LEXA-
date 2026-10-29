import type { ModuleRecordScope, ModuleRecordService } from '../contracts/previewData';
import type { PreviewRecord } from '../../modules/operations/moduleCatalog';
import { apiClient } from './apiClient';

function enc(value: string): string { return encodeURIComponent(value); }
function validateList(value: unknown, moduleId: string): PreviewRecord[] {
  const candidate = Array.isArray(value) ? value : value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items) ? (value as { items: unknown[] }).items : null;
  if (!candidate || !candidate.every((row) => Boolean(row) && typeof row === 'object' && typeof (row as PreviewRecord).id === 'string' && typeof (row as PreviewRecord).status === 'string' && typeof (row as PreviewRecord).updatedAt === 'string')) {
    throw new Error(`The backend returned an invalid record list for ${moduleId}. Expected { id, status, updatedAt } on each record.`);
  }
  return candidate as PreviewRecord[];
}

function collectionPath(scope: ModuleRecordScope, moduleId: string): string {
  return `/workspaces/${enc(scope.workspaceId)}/branches/${enc(scope.branchId)}/modules/${enc(moduleId)}/records`;
}

/** API-backed implementation. Empty catalogue defaults are ignored; the server is authoritative. */
export const apiModuleRecordService: ModuleRecordService = {
  async list(scope, moduleId) {
    return validateList(await apiClient.get<unknown>(collectionPath(scope, moduleId)), moduleId);
  },
  async save(scope, moduleId, record) {
    await apiClient.put(`${collectionPath(scope, moduleId)}/${enc(record.id)}`, record);
    return validateList(await apiClient.get<unknown>(collectionPath(scope, moduleId)), moduleId);
  },
  async replace(scope, moduleId, records) {
    await apiClient.put(collectionPath(scope, moduleId), { records });
    return validateList(await apiClient.get<unknown>(collectionPath(scope, moduleId)), moduleId);
  },
  async updateStatus(scope, moduleId, recordId, status) {
    await apiClient.patch(`${collectionPath(scope, moduleId)}/${enc(recordId)}/status`, { status });
    return validateList(await apiClient.get<unknown>(collectionPath(scope, moduleId)), moduleId);
  },
  async reset(scope, moduleId) {
    await apiClient.delete(collectionPath(scope, moduleId));
    return [];
  },
  getPersistenceMode() { return 'server'; },
};
