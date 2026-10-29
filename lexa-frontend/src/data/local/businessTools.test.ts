import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './database';
import {
  createLocalDatabaseBackup, importOpeningStockCsv, importProductsCsv,
  restoreLocalDatabaseBackup, validateLocalDatabaseBackup,
} from './businessTools';

const timestamp = '2026-10-29T00:00:00.000Z';

async function resetTables(): Promise<void> {
  await db.open();
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
}

async function seedWorkspace(): Promise<void> {
  await db.workspaces.add({
    id: 'ws-test', businessName: 'Test Shop', businessType: 'retail', currency: 'UGX',
    timezone: 'Africa/Kampala', enabledModules: ['products', 'inventory'], createdAt: timestamp, updatedAt: timestamp,
  });
  await db.branches.add({ id: 'br-test', workspaceId: 'ws-test', name: 'Main', createdAt: timestamp, updatedAt: timestamp });
}

beforeEach(async () => { await resetTables(); });

describe('Business Tools data services', () => {
  it('imports product CSV atomically and blocks duplicate SKU/barcode values', async () => {
    await seedWorkspace();
    const count = await importProductsCsv('ws-test', 'UGX',
      'name,sku,sellingPrice,costPrice,barcode,trackStock,lowStockThreshold\nSugar,SUG-001,4000,3000,10001,true,3\nFlour,FLOUR-001,10000,,10002,yes,5\n');
    expect(count).toBe(2);
    expect((await db.products.where('workspaceId').equals('ws-test').toArray()).map((item) => item.sku).sort()).toEqual(['FLOUR-001', 'SUG-001']);

    await expect(importProductsCsv('ws-test', 'UGX', 'name,sku,sellingPrice\nDuplicate one,DUP-001,1000\nDuplicate two,DUP-001,2000\n')).rejects.toThrow(/already exists or is duplicated/i);
    expect(await db.products.where('workspaceId').equals('ws-test').count()).toBe(2);
  });

  it('imports opening stock in a transaction and refuses a second opening balance', async () => {
    await seedWorkspace();
    await importProductsCsv('ws-test', 'UGX', 'name,sku,sellingPrice,trackStock\nSugar,SUG-001,4000,true\n');
    expect(await importOpeningStockCsv('ws-test', 'br-test', 'sku,quantity,reason\nSUG-001,40,Opening count\n')).toBe(1);
    expect(await db.stockMovements.where('[workspaceId+branchId+productId]').equals(['ws-test', 'br-test', (await db.products.where('sku').equals('SUG-001').first())!.id]).count()).toBe(1);

    await expect(importOpeningStockCsv('ws-test', 'br-test', 'sku,quantity\nSUG-001,10\n')).rejects.toThrow(/opening stock already exists/i);
    expect(await db.stockMovements.where('workspaceId').equals('ws-test').count()).toBe(1);
  });

  it('validates and restores a complete database backup', async () => {
    await seedWorkspace();
    const backup = await createLocalDatabaseBackup();
    expect(validateLocalDatabaseBackup(backup).format).toBe('lexa-local-database-backup');
    const broken = structuredClone(backup) as typeof backup;
    delete broken.tables.products;
    expect(() => validateLocalDatabaseBackup(broken)).toThrow(/tables do not match/i);

    await db.products.add({
      id: 'product-extra', workspaceId: 'ws-test', name: 'Extra', sku: 'EXTRA', costPriceMinor: 0,
      sellingPriceMinor: 100, lowStockThreshold: 0, trackStock: true, active: true, createdAt: timestamp, updatedAt: timestamp,
    });
    const result = await restoreLocalDatabaseBackup(backup);
    expect(result.tablesRestored).toBe(db.tables.length);
    expect(result.recordsRestored).toBe(2);
    expect(await db.products.count()).toBe(0);
    expect(await db.workspaces.count()).toBe(1);
  });
});
