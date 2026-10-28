import { db } from './database';
import type { InventoryRepository } from '../contracts/repositories';
import { createId, nowIso } from '../../domain/shared/ids';
import { stockOnHand } from '../../domain/inventory/stock';
import type { StockMovement } from '../../domain/shared/types';

export const localInventoryRepository: InventoryRepository = {
  async listMovements({ workspaceId, branchId, limit = 100 }) {
    const items = await db.stockMovements.where('[workspaceId+branchId+createdAt]')
      .between([workspaceId, branchId, DexieMinDate()], [workspaceId, branchId, '\uffff'])
      .reverse().limit(limit).toArray();
    return items;
  },

  async recordAdjustment({ workspaceId, branchId, productId, quantityDelta, reason, movementType = 'adjustment' }) {
    const cleanReason = reason.trim();
    if (!Number.isSafeInteger(quantityDelta) || quantityDelta === 0) throw new Error('Adjustment quantity must be a non-zero whole number.');
    if (!cleanReason) throw new Error('A reason is required for every stock adjustment.');
    if (movementType === 'opening' && quantityDelta <= 0) throw new Error('Opening stock must be a positive quantity.');
    const timestamp = nowIso();
    const movement: StockMovement = {
      id: createId('mov'), workspaceId, branchId, productId,
      type: movementType, quantityDelta, reason: cleanReason, createdAt: timestamp,
    };
    await db.transaction('rw', db.products, db.stockMovements, db.branches, db.auditEvents, async () => {
      const product = await db.products.get(productId);
      const branch = await db.branches.get(branchId);
      if (!product || product.workspaceId !== workspaceId) throw new Error('Product not found in this workspace.');
      if (!branch || branch.workspaceId !== workspaceId) throw new Error('Branch not found in this workspace.');
      if (!product.trackStock) throw new Error('Stock tracking is disabled for this product.');
      const currentMovements = await db.stockMovements.where('[workspaceId+branchId+productId]').equals([workspaceId, branchId, productId]).toArray();
      if (movementType === 'opening' && currentMovements.length > 0) {
        throw new Error('Opening stock has already been recorded for this product at this branch. Use a stock adjustment to correct the balance.');
      }
      const current = stockOnHand(currentMovements);
      if (current + quantityDelta < 0) throw new Error(`This adjustment would make stock negative. Current stock: ${current}.`);
      await db.stockMovements.add(movement);
      await db.auditEvents.add({
        id: createId('audit'), workspaceId, branchId, entityType: 'stock_movement', entityId: movement.id,
        action: movementType === 'opening' ? 'opening_stock_recorded' : 'adjustment_recorded', reason: cleanReason, createdAt: timestamp,
      });
    });
    return movement;
  },

  async getBalances({ workspaceId, branchId }) {
    const movements = await db.stockMovements.where('[workspaceId+branchId+createdAt]')
      .between([workspaceId, branchId, DexieMinDate()], [workspaceId, branchId, '\uffff']).toArray();
    const balances = new Map<string, number>();
    for (const movement of movements) {
      balances.set(movement.productId, (balances.get(movement.productId) ?? 0) + movement.quantityDelta);
    }
    return balances;
  },
};

function DexieMinDate(): string {
  return '';
}
