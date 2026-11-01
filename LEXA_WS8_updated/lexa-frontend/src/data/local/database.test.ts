import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, LOCAL_DATABASE_SCHEMA_V1 } from './database';

// Verify that a real v1 on-device database upgrades without losing return rows.
describe('local database schema upgrades', () => {
  beforeEach(async () => {
    await db.delete();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('adds the workspace/branch return index while preserving v1 data', async () => {
    const legacy = new Dexie('lexa-local');
    legacy.version(1).stores(LOCAL_DATABASE_SCHEMA_V1);
    await legacy.open();
    await legacy.table('returns').put({
      id: 'return-v1',
      workspaceId: 'workspace-v1',
      branchId: 'branch-v1',
      saleId: 'sale-v1',
      returnNumber: 'RET-0001',
      totalMinor: 2500,
      reason: 'Legacy record',
      refundRecorded: false,
      createdAt: '2026-10-31T10:00:00.000Z',
    });
    legacy.close();

    await db.open();
    const migrated = await db.returns
      .where('[workspaceId+branchId]')
      .equals(['workspace-v1', 'branch-v1'])
      .toArray();

    expect(migrated).toHaveLength(1);
    expect(migrated[0]?.id).toBe('return-v1');
  });
});
