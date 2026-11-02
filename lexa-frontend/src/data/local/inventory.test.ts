import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './database';
import { localWorkspaceRepository } from './workspaces';
import { localProductRepository } from './products';
import { localInventoryRepository } from './inventory';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('local inventory movement rules', () => {
  it('does not allow recording opening stock twice for a product and branch', async () => {
    const workspace = await localWorkspaceRepository.create({
      businessName: 'Inventory Test', businessType: 'retail', currency: 'UGX', timezone: 'Africa/Kampala', branchName: 'Main branch',
    });
    const branch = (await localWorkspaceRepository.listBranches(workspace.id))[0];
    if (!branch) throw new Error('Test branch was not created.');
    const product = await localProductRepository.create({
      workspaceId: workspace.id, name: 'Test item', sku: 'TEST-1', costPriceMinor: 100, sellingPriceMinor: 150,
      lowStockThreshold: 1, trackStock: true,
    });

    await localInventoryRepository.recordAdjustment({
      workspaceId: workspace.id, branchId: branch.id, productId: product.id,
      quantityDelta: 10, reason: 'Initial count', movementType: 'opening',
    });
    await expect(localInventoryRepository.recordAdjustment({
      workspaceId: workspace.id, branchId: branch.id, productId: product.id,
      quantityDelta: 10, reason: 'Duplicate initial count', movementType: 'opening',
    })).rejects.toThrow(/Opening stock has already been recorded/);
    await expect(localInventoryRepository.recordAdjustment({
      workspaceId: workspace.id, branchId: branch.id, productId: product.id,
      quantityDelta: 2, reason: 'Count correction', movementType: 'adjustment',
    })).resolves.toMatchObject({ type: 'adjustment', quantityDelta: 2 });
  });
});
