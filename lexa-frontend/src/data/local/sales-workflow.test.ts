import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './database';
import { localWorkspaceRepository } from './workspaces';
import { localProductRepository } from './products';
import { localInventoryRepository } from './inventory';
import { localSalesRepository } from './sales';
import { localSalesWorkflow } from './sales-workflow';
import { stockOnHand } from '../../domain/inventory/stock';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function setupStock(quantity = 5) {
  const workspace = await localWorkspaceRepository.create({
    businessName: 'Test Traders', businessType: 'retail', currency: 'UGX', timezone: 'Africa/Kampala', branchName: 'Main branch',
  });
  const branch = (await localWorkspaceRepository.listBranches(workspace.id))[0];
  if (!branch) throw new Error('Test branch was not created.');
  const product = await localProductRepository.create({
    workspaceId: workspace.id, name: 'Rice 5kg', sku: 'RICE-5', costPriceMinor: 9000,
    sellingPriceMinor: 12000, lowStockThreshold: 2, trackStock: true,
  });
  await localInventoryRepository.recordAdjustment({
    workspaceId: workspace.id, branchId: branch.id, productId: product.id,
    quantityDelta: quantity, reason: 'Opening stock for test', movementType: 'opening',
  });
  return { workspace, branch, product };
}

describe('local transaction workflow', () => {
  it('commits a sale, sale lines, payment and stock movement together', async () => {
    const { workspace, branch, product } = await setupStock(5);
    const { sale } = await localSalesWorkflow.completeSale({
      workspaceId: workspace.id, branchId: branch.id,
      items: [{ productId: product.id, quantity: 2 }],
      payments: [{ method: 'cash', amountMinor: 24000 }],
    });

    const detail = await localSalesRepository.getSale({ workspaceId: workspace.id, saleId: sale.id });
    const movements = await db.stockMovements.where('[workspaceId+branchId+productId]').equals([workspace.id, branch.id, product.id]).toArray();
    const payments = await db.payments.where('[workspaceId+saleId]').equals([workspace.id, sale.id]).toArray();
    expect(sale.totalMinor).toBe(24000);
    expect(detail?.lines).toHaveLength(1);
    expect(payments).toHaveLength(1);
    expect(stockOnHand(movements)).toBe(3);
  });

  it('leaves the database unchanged when stock validation rejects the sale', async () => {
    const { workspace, branch, product } = await setupStock(1);
    await expect(localSalesWorkflow.completeSale({
      workspaceId: workspace.id, branchId: branch.id,
      items: [{ productId: product.id, quantity: 2 }],
      payments: [{ method: 'cash', amountMinor: 24000 }],
    })).rejects.toThrow(/Not enough stock/);
    expect(await db.sales.where('workspaceId').equals(workspace.id).count()).toBe(0);
    expect(await db.stockMovements.where('[workspaceId+branchId+productId]').equals([workspace.id, branch.id, product.id]).count()).toBe(1);
  });


  it('does not put quarantined or scrapped returns back into saleable stock', async () => {
    const { workspace, branch, product } = await setupStock(5);
    const { sale } = await localSalesWorkflow.completeSale({
      workspaceId: workspace.id, branchId: branch.id,
      items: [{ productId: product.id, quantity: 2 }],
      payments: [{ method: 'cash', amountMinor: 24000 }],
    });
    const line = (await db.saleLines.where('[workspaceId+saleId]').equals([workspace.id, sale.id]).toArray())[0];
    if (!line) throw new Error('Sale line was not saved.');
    await localSalesWorkflow.recordReturn({
      workspaceId: workspace.id, branchId: branch.id, saleId: sale.id,
      items: [{ saleLineId: line.id, quantity: 1, disposition: 'quarantine' }],
      reason: 'Needs inspection', recordRefund: false, refundMethod: 'cash',
    });
    const movements = await db.stockMovements.where('[workspaceId+branchId+productId]').equals([workspace.id, branch.id, product.id]).toArray();
    const detail = await localSalesRepository.getSale({ workspaceId: workspace.id, saleId: sale.id });
    expect(stockOnHand(movements)).toBe(3);
    expect(detail?.returnLines[0]?.disposition).toBe('quarantine');
  });

  it('records a return against the original sale and rejects excess returns', async () => {
    const { workspace, branch, product } = await setupStock(5);
    const { sale } = await localSalesWorkflow.completeSale({
      workspaceId: workspace.id, branchId: branch.id,
      items: [{ productId: product.id, quantity: 2 }],
      payments: [{ method: 'cash', amountMinor: 24000 }],
    });
    const firstLine = (await db.saleLines.where('[workspaceId+saleId]').equals([workspace.id, sale.id]).toArray())[0];
    if (!firstLine) throw new Error('Sale line was not saved.');
    const result = await localSalesWorkflow.recordReturn({
      workspaceId: workspace.id, branchId: branch.id, saleId: sale.id,
      items: [{ saleLineId: firstLine.id, quantity: 1 }], reason: 'Damaged pack', recordRefund: true, refundMethod: 'cash',
    });
    expect(result.returnRecord.saleId).toBe(sale.id);
    expect(result.returnRecord.totalMinor).toBe(12000);
    await expect(localSalesWorkflow.recordReturn({
      workspaceId: workspace.id, branchId: branch.id, saleId: sale.id,
      items: [{ saleLineId: firstLine.id, quantity: 2 }], reason: 'Excess test', recordRefund: false, refundMethod: 'cash',
    })).rejects.toThrow(/Only 1 remain returnable/);
    const movements = await db.stockMovements.where('[workspaceId+branchId+productId]').equals([workspace.id, branch.id, product.id]).toArray();
    const payments = await db.payments.where('[workspaceId+saleId]').equals([workspace.id, sale.id]).toArray();
    expect(stockOnHand(movements)).toBe(4);
    expect(payments.some((payment) => payment.kind === 'refund')).toBe(true);
    expect(await db.returns.where('[workspaceId+saleId]').equals([workspace.id, sale.id]).count()).toBe(1);
  });
});
