import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './database';
import { localProductRepository } from './products';
import type { CreateProductInput } from '../../domain/shared/types';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const productInput = (overrides: Partial<CreateProductInput> = {}): CreateProductInput => ({
  workspaceId: 'ws-product-tests',
  name: 'Rice 5kg',
  sku: 'RICE-005',
  barcode: '6160000000051',
  brand: 'Demo Foods',
  unitOfMeasure: 'Bag',
  supplierSku: 'SUP-RICE-5',
  categoryName: 'Groceries',
  costPriceMinor: 900000,
  sellingPriceMinor: 1200000,
  lowStockThreshold: 3,
  trackStock: true,
  ...overrides,
});

describe('product catalogue integrity', () => {
  it('persists and searches barcode and brand metadata', async () => {
    const created = await localProductRepository.create(productInput());
    expect(created).toMatchObject({ barcode: '6160000000051', brand: 'Demo Foods', unitOfMeasure: 'Bag', supplierSku: 'SUP-RICE-5' });
    await expect(localProductRepository.list({ workspaceId: created.workspaceId, search: '6160000000051', activeOnly: false })).resolves.toHaveLength(1);
    await expect(localProductRepository.list({ workspaceId: created.workspaceId, search: 'demo foods', activeOnly: false })).resolves.toHaveLength(1);
  });

  it('enforces case-insensitive SKU and barcode uniqueness within a workspace', async () => {
    await localProductRepository.create(productInput());
    await expect(localProductRepository.create(productInput({ name: 'Duplicate SKU', sku: 'rice-005', barcode: 'OTHER' }))).rejects.toThrow(/SKU/i);
    await expect(localProductRepository.create(productInput({ name: 'Duplicate barcode', sku: 'RICE-SECOND', barcode: '6160000000051' }))).rejects.toThrow(/Barcode/i);
    await expect(localProductRepository.create(productInput({ workspaceId: 'ws-other' }))).resolves.toMatchObject({ workspaceId: 'ws-other' });
  });

  it('allows optional metadata and category to be cleared on update', async () => {
    const created = await localProductRepository.create(productInput());
    const changed = { ...created, name: 'Rice bag' };
    delete changed.barcode;
    delete changed.brand;
    delete changed.unitOfMeasure;
    delete changed.supplierSku;
    const updated = await localProductRepository.update(changed, '');
    expect(updated).not.toHaveProperty('barcode');
    expect(updated).not.toHaveProperty('brand');
    expect(updated).not.toHaveProperty('supplierSku');
    expect(updated.categoryId).toBeUndefined();
    expect(updated.unitOfMeasure).toBeUndefined();
  });

  it('does not include inactive products in the default active list', async () => {
    const created = await localProductRepository.create(productInput());
    await localProductRepository.update({ ...created, active: false });
    await expect(localProductRepository.list({ workspaceId: created.workspaceId })).resolves.toHaveLength(0);
    await expect(localProductRepository.list({ workspaceId: created.workspaceId, activeOnly: false })).resolves.toHaveLength(1);
  });
});
