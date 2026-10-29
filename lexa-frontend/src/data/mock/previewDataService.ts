import type { PreviewDataService, PreviewPersistenceMode, PreviewScope } from '../contracts/previewData';
import type { PreviewRecord } from '../../modules/operations/moduleCatalog';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
interface PreviewServiceOptions {
  storage?: StorageLike | null;
  prefix?: string;
}

const DEFAULT_PREFIX = 'lexa.module-records.v2';

function cloneRows(rows: PreviewRecord[]): PreviewRecord[] {
  return rows.map((row) => ({ ...row }));
}
function isPreviewRecordArray(value: unknown): value is PreviewRecord[] {
  return Array.isArray(value) && value.every((row) => Boolean(row) && typeof row.id === 'string' && typeof row.status === 'string' && typeof row.updatedAt === 'string');
}
function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Creates an injectable browser-local module store. Tests can pass isolated storage or null. */
export function createPreviewDataService(options: PreviewServiceOptions = {}): PreviewDataService {
  const prefix = options.prefix ?? DEFAULT_PREFIX;
  const storageWasProvided = Object.prototype.hasOwnProperty.call(options, 'storage');
  const storage = storageWasProvided ? (options.storage ?? null) : browserStorage();
  const memory = new Map<string, PreviewRecord[]>();
  let persistenceMode: PreviewPersistenceMode = storage ? 'browser-local' : 'memory-only';

  const keyFor = (scope: PreviewScope, moduleId: string) =>
    [prefix, scope.workspaceId, scope.branchId, moduleId].join(':');

  function persist(key: string, rows: PreviewRecord[]): PreviewRecord[] {
    const copied = cloneRows(rows);
    memory.set(key, copied);
    try {
      if (!storage) throw new Error('Browser storage is not available.');
      storage.setItem(key, JSON.stringify(copied));
      persistenceMode = 'browser-local';
    } catch {
      persistenceMode = 'memory-only';
    }
    return cloneRows(copied);
  }

  function load(key: string, seed: PreviewRecord[]): PreviewRecord[] {
    const inMemory = memory.get(key);
    if (inMemory) return cloneRows(inMemory);
    try {
      const raw = storage?.getItem(key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isPreviewRecordArray(parsed)) {
          memory.set(key, cloneRows(parsed));
          persistenceMode = 'browser-local';
          return cloneRows(parsed);
        }
      }
    } catch {
      persistenceMode = 'memory-only';
    }
    return persist(key, seed);
  }

  return {
    async list(scope, moduleId, seed) {
      return load(keyFor(scope, moduleId), seed);
    },
    async save(scope, moduleId, record, seed) {
      const key = keyFor(scope, moduleId);
      const current = load(key, seed);
      const exists = current.some((item) => item.id === record.id);
      const next = exists ? current.map((item) => item.id === record.id ? { ...record } : item) : [{ ...record }, ...current];
      return persist(key, next);
    },
    async replace(scope, moduleId, records, _seed) {
      const uniqueIds = new Set(records.map((record) => record.id));
      if (uniqueIds.size !== records.length) throw new Error(`The ${moduleId} preview bundle contains duplicate record IDs.`);
      if (records.some((record) => typeof record.id !== 'string' || !record.id || typeof record.status !== 'string' || typeof record.updatedAt !== 'string')) throw new Error(`The ${moduleId} preview bundle contains an invalid record.`);
      return persist(keyFor(scope, moduleId), records);
    },
    async updateStatus(scope, moduleId, recordId, status, seed) {
      const key = keyFor(scope, moduleId);
      const current = load(key, seed);
      if (!current.some((item) => item.id === recordId)) throw new Error('This record no longer exists. Reload the register and try again.');
      return persist(key, current.map((item) => item.id === recordId ? { ...item, status, updatedAt: new Date().toISOString() } : item));
    },
    async reset(scope, moduleId, seed) {
      return persist(keyFor(scope, moduleId), seed);
    },
    getPersistenceMode() {
      return persistenceMode;
    },
  };
}

/** Browser-local implementation, with memory-only fallback if storage is blocked. */
export const previewDataService = createPreviewDataService();
