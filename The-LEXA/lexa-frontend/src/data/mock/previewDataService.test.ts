import { describe, expect, it } from 'vitest';
import { createLocalModuleRecordService } from '../local/moduleRecords';
import type { PreviewRecord } from '../../modules/operations/moduleCatalog';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  seed(key: string, value: string) { this.values.set(key, value); }
}

const scope = { workspaceId: 'ws-alpha', branchId: 'branch-main' };
const otherScope = { workspaceId: 'ws-beta', branchId: 'branch-main' };
const oldSampleRows: PreviewRecord[] = [
  { id: 'CUS-001', status: 'Active', updatedAt: '2026-10-28T00:00:00.000Z', customerCode: 'CUS-001', name: 'Sample must not be seeded' },
];
const created: PreviewRecord = {
  id: 'CUS-002', status: 'Draft', updatedAt: '2026-10-28T01:00:00.000Z', customerCode: 'CUS-002', name: 'Real entered customer',
};

describe('local development record adapter', () => {
  it('starts empty and ignores catalogue defaults rather than seeding demo rows', async () => {
    const service = createLocalModuleRecordService({ storage: new MemoryStorage() });
    await expect(service.list(scope, 'customers', oldSampleRows)).resolves.toEqual([]);
    expect(service.getPersistenceMode()).toBe('browser-local');
  });

  it('saves entered records and persists them between service instances', async () => {
    const storage = new MemoryStorage();
    const first = createLocalModuleRecordService({ storage });
    const saved = await first.save(scope, 'customers', created, oldSampleRows);
    expect(saved.map((row) => row.id)).toEqual(['CUS-002']);
    const second = createLocalModuleRecordService({ storage });
    await expect(second.list(scope, 'customers')).resolves.toEqual(saved);
  });

  it('isolates data by workspace, branch, and module with no implicit seed records', async () => {
    const service = createLocalModuleRecordService({ storage: new MemoryStorage() });
    await service.save(scope, 'customers', created);
    await expect(service.list(otherScope, 'customers', oldSampleRows)).resolves.toEqual([]);
    await expect(service.list(scope, 'suppliers', oldSampleRows)).resolves.toEqual([]);
    await expect(service.list(scope, 'customers')).resolves.toHaveLength(1);
  });

  it('updates status without duplicating a record and rejects a missing record', async () => {
    const service = createLocalModuleRecordService({ storage: new MemoryStorage() });
    await service.save(scope, 'customers', created);
    const updated = await service.updateStatus(scope, 'customers', 'CUS-002', 'On hold');
    expect(updated).toHaveLength(1);
    expect(updated[0]?.status).toBe('On hold');
    await expect(service.updateStatus(scope, 'customers', 'MISSING', 'Active')).rejects.toThrow(/no longer exists/i);
  });

  it('clears the register on reset rather than restoring starter records', async () => {
    const service = createLocalModuleRecordService({ storage: new MemoryStorage() });
    await service.save(scope, 'customers', created);
    await expect(service.reset(scope, 'customers', oldSampleRows)).resolves.toEqual([]);
  });

  it('recovers from malformed stored JSON into an empty register', async () => {
    const storage = new MemoryStorage();
    storage.seed('lexa.module-records.v3:ws-alpha:branch-main:customers', '{not-json');
    const service = createLocalModuleRecordService({ storage });
    await expect(service.list(scope, 'customers', oldSampleRows)).resolves.toEqual([]);
  });

  it('uses memory-only storage when browser persistence is unavailable', async () => {
    const blockedStorage = { getItem: () => { throw new Error('storage blocked'); }, setItem: () => { throw new Error('storage blocked'); } };
    const service = createLocalModuleRecordService({ storage: blockedStorage });
    await expect(service.save(scope, 'customers', created)).resolves.toHaveLength(1);
    expect(service.getPersistenceMode()).toBe('memory-only');
    await expect(service.list(scope, 'customers')).resolves.toHaveLength(1);
  });

  it('returns defensive copies so callers cannot mutate stored data by reference', async () => {
    const service = createLocalModuleRecordService({ storage: new MemoryStorage() });
    await service.save(scope, 'customers', created);
    const rows = await service.list(scope, 'customers');
    if (rows[0]) rows[0].name = 'mutated by caller';
    await expect(service.list(scope, 'customers')).resolves.toEqual([created]);
  });
});
