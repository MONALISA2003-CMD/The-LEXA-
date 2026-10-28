import { describe, expect, it } from 'vitest';
import { createPreviewDataService } from './previewDataService';
import type { PreviewRecord } from '../../modules/operations/moduleCatalog';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  seed(key: string, value: string) { this.values.set(key, value); }
}

const scope = { workspaceId: 'ws-alpha', branchId: 'branch-main' };
const otherScope = { workspaceId: 'ws-beta', branchId: 'branch-main' };
const seed: PreviewRecord[] = [
  { id: 'CUS-001', status: 'Active', updatedAt: '2026-10-28T00:00:00.000Z', customerCode: 'CUS-001', name: 'Seed Customer' },
];
const created: PreviewRecord = {
  id: 'CUS-002', status: 'Draft', updatedAt: '2026-10-28T01:00:00.000Z', customerCode: 'CUS-002', name: 'New Customer',
};

describe('preview data service boundary', () => {
  it('loads cloned seed rows, saves records, and persists changes across service instances', async () => {
    const storage = new MemoryStorage();
    const first = createPreviewDataService({ storage });
    const initial = await first.list(scope, 'customers', seed);
    expect(initial).toEqual(seed);
    expect(initial).not.toBe(seed);
    expect(first.getPersistenceMode()).toBe('browser-local');

    const saved = await first.save(scope, 'customers', created, seed);
    expect(saved.map((row) => row.id)).toEqual(['CUS-002', 'CUS-001']);

    const second = createPreviewDataService({ storage });
    await expect(second.list(scope, 'customers', seed)).resolves.toEqual(saved);
  });

  it('isolates data by workspace, branch, and module', async () => {
    const service = createPreviewDataService({ storage: new MemoryStorage() });
    await service.save(scope, 'customers', created, seed);

    await expect(service.list(otherScope, 'customers', seed)).resolves.toEqual(seed);
    await expect(service.list(scope, 'suppliers', seed)).resolves.toEqual(seed);
    await expect(service.list(scope, 'customers', seed)).resolves.toHaveLength(2);
  });

  it('updates status without duplicating the record and rejects a missing record', async () => {
    const service = createPreviewDataService({ storage: new MemoryStorage() });
    const updated = await service.updateStatus(scope, 'customers', 'CUS-001', 'On hold', seed);
    expect(updated).toHaveLength(1);
    expect(updated[0]?.status).toBe('On hold');
    await expect(service.updateStatus(scope, 'customers', 'MISSING', 'Active', seed)).rejects.toThrow(/no longer exists/i);
  });

  it('resets a register to its sample records', async () => {
    const service = createPreviewDataService({ storage: new MemoryStorage() });
    await service.save(scope, 'customers', created, seed);
    await expect(service.reset(scope, 'customers', seed)).resolves.toEqual(seed);
  });

  it('recovers from malformed stored JSON by restoring safe seed data', async () => {
    const storage = new MemoryStorage();
    storage.seed('lexa.phase2.preview.v1:ws-alpha:branch-main:customers', '{not-json');
    const service = createPreviewDataService({ storage });
    await expect(service.list(scope, 'customers', seed)).resolves.toEqual(seed);
    expect(storage.getItem('lexa.phase2.preview.v1:ws-alpha:branch-main:customers')).toContain('CUS-001');
  });

  it('falls back to in-memory session data when browser storage is unavailable', async () => {
    const blockedStorage = {
      getItem: () => { throw new Error('storage blocked'); },
      setItem: () => { throw new Error('storage blocked'); },
    };
    const service = createPreviewDataService({ storage: blockedStorage });
    const saved = await service.save(scope, 'customers', created, seed);
    expect(saved).toHaveLength(2);
    expect(service.getPersistenceMode()).toBe('memory-only');
    await expect(service.list(scope, 'customers', seed)).resolves.toEqual(saved);
  });

  it('returns defensive copies so callers cannot mutate the repository cache by reference', async () => {
    const service = createPreviewDataService({ storage: new MemoryStorage() });
    const list = await service.list(scope, 'customers', seed);
    if (list[0]) list[0].name = 'mutated by caller';
    await expect(service.list(scope, 'customers', seed)).resolves.toEqual(seed);
  });
});
