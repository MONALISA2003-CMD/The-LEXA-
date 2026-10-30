import type { ModuleRecordScope, ModuleRecordService } from '../contracts/previewData';
import type { PreviewRecord } from '../../modules/operations/moduleCatalog';
import { apiClient } from './apiClient';
import { apiModuleGraph } from './apiModuleGraph';

function enc(value: string): string { return encodeURIComponent(value); }
function collectionPath(scope: ModuleRecordScope, moduleId: string): string {
  return `/workspaces/${enc(scope.workspaceId)}/branches/${enc(scope.branchId)}/modules/${enc(moduleId)}/records`;
}
function validateList(value: unknown, moduleId: string): PreviewRecord[] {
  const candidate = Array.isArray(value) ? value : value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items) ? (value as { items: unknown[] }).items : null;
  if (!candidate || !candidate.every((row) => Boolean(row) && typeof row === 'object' && typeof (row as PreviewRecord).id === 'string' && typeof (row as PreviewRecord).status === 'string' && typeof (row as PreviewRecord).updatedAt === 'string')) {
    throw new Error(`The backend returned an invalid record list for ${moduleId}. Expected { id, status, updatedAt } on each record.`);
  }
  return candidate as PreviewRecord[];
}

async function publishSavedRecord(scope: ModuleRecordScope, moduleId: string, record: PreviewRecord): Promise<void> {
  const sourceModuleId = typeof record.sourceModuleId === 'string' ? record.sourceModuleId : '';
  const sourceRecordId = typeof record.sourceRecordId === 'string' ? record.sourceRecordId : '';
  if (sourceModuleId && sourceRecordId) {
    await apiModuleGraph.link(scope, {
      sourceModuleId,
      sourceRecordId,
      targetModuleId: moduleId,
      targetRecordId: record.id,
      relationType: 'workflow_handoff',
    });
  }
  await apiModuleGraph.recordEvent(scope, {
    moduleId,
    recordId: record.id,
    eventType: 'record.saved',
    payload: {
      status: record.status,
      ...(sourceModuleId ? { sourceModuleId } : {}),
      ...(sourceRecordId ? { sourceRecordId } : {}),
    },
    dedupeKey: `record.saved:${scope.branchId}:${moduleId}:${record.id}:${record.updatedAt}`,
  });
}

/** API-backed collections are namespaced by module, tenant/workspace and branch on the server. */
export const apiModuleRecordService: ModuleRecordService = {
  async list(scope, moduleId) {
    return validateList(await apiClient.get<unknown>(collectionPath(scope, moduleId)), moduleId);
  },
  async save(scope, moduleId, record) {
    await apiClient.put(`${collectionPath(scope, moduleId)}/${enc(record.id)}`, record);
    await publishSavedRecord(scope, moduleId, record);
    return validateList(await apiClient.get<unknown>(collectionPath(scope, moduleId)), moduleId);
  },
  async replace(scope, moduleId, records) {
    await apiClient.put(collectionPath(scope, moduleId), { records });
    await apiModuleGraph.recordEvent(scope, {
      moduleId,
      eventType: 'module.collection_replaced',
      payload: { count: records.length },
      dedupeKey: `collection.replaced:${scope.branchId}:${moduleId}:${new Date().toISOString()}`,
    });
    return validateList(await apiClient.get<unknown>(collectionPath(scope, moduleId)), moduleId);
  },
  async updateStatus(scope, moduleId, recordId, status) {
    const rows = validateList(await apiClient.patch<unknown>(`${collectionPath(scope, moduleId)}/${enc(recordId)}/status`, { status }), moduleId);
    const updated = rows.find((row) => row.id === recordId);
    await apiModuleGraph.recordEvent(scope, {
      moduleId,
      recordId,
      eventType: 'record.status_changed',
      payload: { status },
      dedupeKey: `record.status:${scope.branchId}:${moduleId}:${recordId}:${updated?.updatedAt ?? new Date().toISOString()}`,
    });
    return rows;
  },
  async reset(scope, moduleId) {
    await apiClient.delete(collectionPath(scope, moduleId));
    await apiModuleGraph.recordEvent(scope, {
      moduleId,
      eventType: 'module.collection_cleared',
      payload: {},
      dedupeKey: `collection.cleared:${scope.branchId}:${moduleId}:${new Date().toISOString()}`,
    });
    return [];
  },
  getPersistenceMode() { return 'server'; },
};
