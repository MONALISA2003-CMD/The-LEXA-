import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './database';
import { localSalesWorkflow } from './sales-workflow';

const timestamp = '2026-10-29T00:00:00.000Z';

async function resetDatabase(): Promise<void> {
  await db.open();
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  await db.workspaces.add({
    id: 'ws-credit-test', businessName: 'Credit Test Shop', businessType: 'retail', currency: 'UGX',
    timezone: 'Africa/Kampala', enabledModules: ['products', 'inventory', 'checkout', 'sales'],
    createdAt: timestamp, updatedAt: timestamp,
  });
  await db.branches.add({ id: 'br-credit-test', workspaceId: 'ws-credit-test', name: 'Main', createdAt: timestamp, updatedAt: timestamp });
  await db.products.add({
    id: 'prd-credit-test', workspaceId: 'ws-credit-test', name: 'Test item', sku: 'TEST-001',
    costPriceMinor: 4000, sellingPriceMinor: 10000, lowStockThreshold: 0, trackStock: false,
    active: true, createdAt: timestamp, updatedAt: timestamp,
  });
}

const saleBase = {
  workspaceId: 'ws-credit-test', branchId: 'br-credit-test',
  items: [{ productId: 'prd-credit-test', quantity: 1 }],
};

describe('core credit sale and instalment workflow', () => {
  beforeEach(resetDatabase);

  it('requires a named customer and phone when any amount remains unpaid', async () => {
    await expect(localSalesWorkflow.completeSale({
      ...saleBase, payments: [{ method: 'cash', amountMinor: 4000 }], customerName: 'A customer',
    })).rejects.toThrow(/credit sales require a named customer and phone/i);
    expect(await db.sales.count()).toBe(0);
    expect(await db.payments.count()).toBe(0);
  });

  it('records split payments, creates a promised date, and closes the balance through instalments', async () => {
    const { sale } = await localSalesWorkflow.completeSale({
      ...saleBase,
      customerName: 'A customer', customerPhone: '0700000000',
      payments: [
        { method: 'cash', amountMinor: 2500 },
        { method: 'mtn_momo', amountMinor: 2500, reference: 'MOMO-TEST-1' },
      ],
    });
    expect(sale.customerPhone).toBe('0700000000');
    expect(sale.promisedPaymentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await db.payments.where('saleId').equals(sale.id).count()).toBe(2);

    await expect(localSalesWorkflow.receivePayment({
      workspaceId: 'ws-credit-test', branchId: 'br-credit-test', saleId: sale.id,
      method: 'airtel_money', amountMinor: 5001,
    })).rejects.toThrow(/exceeds the outstanding balance/i);
    expect(await db.payments.where('saleId').equals(sale.id).count()).toBe(2);

    const first = await localSalesWorkflow.receivePayment({
      workspaceId: 'ws-credit-test', branchId: 'br-credit-test', saleId: sale.id,
      method: 'cash', amountMinor: 2000,
    });
    expect(first.outstandingMinor).toBe(3000);
    const final = await localSalesWorkflow.receivePayment({
      workspaceId: 'ws-credit-test', branchId: 'br-credit-test', saleId: sale.id,
      method: 'bank_transfer', amountMinor: 3000, reference: 'BANK-TEST-2',
    });
    expect(final.outstandingMinor).toBe(0);
    expect(await db.payments.where('saleId').equals(sale.id).count()).toBe(4);
  });
});
