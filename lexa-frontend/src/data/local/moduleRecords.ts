import type { DataPersistenceMode, ModuleRecordScope, ModuleRecordService } from '../contracts/previewData';
import type { PreviewRecord } from '../../modules/operations/moduleCatalog';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
interface LocalModuleRecordOptions { storage?: StorageLike | null; prefix?: string; }

const CURRENT_PREFIX = 'lexa.module-records.v3';
const LEGACY_PREFIX = 'lexa.module-records.v2';

function clone(rows: PreviewRecord[]): PreviewRecord[] { return rows.map((row) => ({ ...row })); }
function validRows(value: unknown): value is PreviewRecord[] {
  return Array.isArray(value) && value.every((row) => Boolean(row) && typeof row.id === 'string' && typeof row.status === 'string' && typeof row.updatedAt === 'string');
}
function browserStorage(): StorageLike | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

/**
 * Explicit local-development adapter. It never seeds records from the module catalogue.
 * Existing user-entered v2 records are migrated forward; no sample/default rows are created.
 */
export function createLocalModuleRecordService(options: LocalModuleRecordOptions = {}): ModuleRecordService {
  const prefix = options.prefix ?? CURRENT_PREFIX;
  const storage = Object.prototype.hasOwnProperty.call(options, 'storage') ? (options.storage ?? null) : browserStorage();
  const memory = new Map<string, PreviewRecord[]>();
  let persistenceMode: DataPersistenceMode = storage ? 'browser-local' : 'memory-only';
  const keyFor = (scope: ModuleRecordScope, moduleId: string) => [prefix, scope.workspaceId, scope.branchId, moduleId].join(':');

  function persist(key: string, rows: PreviewRecord[]): PreviewRecord[] {
    const copied = clone(rows); memory.set(key, copied);
    try {
      if (!storage) throw new Error('Browser storage unavailable');
      storage.setItem(key, JSON.stringify(copied)); persistenceMode = 'browser-local';
    } catch { persistenceMode = 'memory-only'; }
    return clone(copied);
  }

  function load(key: string, scope: ModuleRecordScope, moduleId: string): PreviewRecord[] {
    const inMemory = memory.get(key);
    if (inMemory) return clone(inMemory);
    try {
      const raw = storage?.getItem(key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (validRows(parsed)) { memory.set(key, clone(parsed)); return clone(parsed); }
      }
      // One-time forward migration preserves saved user records without reusing catalogue seeds.
      const legacyKey = [LEGACY_PREFIX, scope.workspaceId, scope.branchId, moduleId].join(':');
      const legacyRaw = storage?.getItem(legacyKey);
      if (legacyRaw) {
        const legacy: unknown = JSON.parse(legacyRaw);
        if (validRows(legacy)) return persist(key, legacy);
      }
    } catch { persistenceMode = 'memory-only'; }
    return persist(key, []);
  }

  return {
    async list(scope, moduleId) { return load(keyFor(scope, moduleId), scope, moduleId); },
    async save(scope, moduleId, record) {
      if (!record.id || !record.status || !record.updatedAt) throw new Error('A module record needs an ID, status and update timestamp.');
      const key = keyFor(scope, moduleId); const rows = load(key, scope, moduleId);
      return persist(key, rows.some((row) => row.id === record.id)
        ? rows.map((row) => row.id === record.id ? { ...record } : row)
        : [{ ...record }, ...rows]);
    },
    async replace(scope, moduleId, records) {
      if (new Set(records.map((record) => record.id)).size !== records.length) throw new Error(`The ${moduleId} record list contains duplicate IDs.`);
      if (!validRows(records)) throw new Error(`The ${moduleId} record list contains an invalid record.`);
      return persist(keyFor(scope, moduleId), records);
    },
    async updateStatus(scope, moduleId, recordId, status) {
      const key = keyFor(scope, moduleId); const rows = load(key, scope, moduleId);
      if (!rows.some((row) => row.id === recordId)) throw new Error('This record no longer exists. Reload the register and try again.');
      return persist(key, rows.map((row) => row.id === recordId ? { ...row, status, updatedAt: new Date().toISOString() } : row));
    },
    async reset(scope, moduleId) { return persist(keyFor(scope, moduleId), []); },
    getPersistenceMode() { return persistenceMode; },
  };
}

export const localModuleRecordService = createLocalModuleRecordService();
