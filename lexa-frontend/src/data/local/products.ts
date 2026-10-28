import { db } from './database';
import type { ProductRepository } from '../contracts/repositories';
import { createId, nowIso } from '../../domain/shared/ids';
import type { Category, CreateProductInput, Product } from '../../domain/shared/types';
import { assertNonNegativeSafeInteger } from '../../domain/money/money';

export const localProductRepository: ProductRepository = {
  async list({ workspaceId, search, activeOnly = true }) {
    let products = await db.products.where('workspaceId').equals(workspaceId).toArray();
    if (activeOnly) products = products.filter((product) => product.active);
    const query = search?.trim().toLocaleLowerCase();
    if (query) {
      products = products.filter((product) =>
        product.name.toLocaleLowerCase().includes(query) || product.sku.toLocaleLowerCase().includes(query),
      );
    }
    return products.sort((a, b) => a.name.localeCompare(b.name));
  },

  async listCategories(workspaceId) {
    return db.categories.where('workspaceId').equals(workspaceId).sortBy('name');
  },

  async create(input: CreateProductInput) {
    const name = input.name.trim();
    const sku = input.sku.trim();
    if (!name) throw new Error('Product name is required.');
    if (!sku) throw new Error('SKU or barcode is required.');
    assertNonNegativeSafeInteger(input.costPriceMinor, 'Cost price');
    assertNonNegativeSafeInteger(input.sellingPriceMinor, 'Selling price');
    assertNonNegativeSafeInteger(input.lowStockThreshold, 'Low-stock threshold');

    const timestamp = nowIso();
    const productId = createId('prd');
    let categoryId: string | undefined;

    await db.transaction('rw', db.products, db.categories, async () => {
      const duplicate = await db.products.where('[workspaceId+sku]').equals([input.workspaceId, sku]).first();
      if (duplicate) throw new Error(`SKU “${sku}” is already used by ${duplicate.name}.`);
      const categoryName = input.categoryName?.trim();
      if (categoryName) {
        let category = await db.categories.where('[workspaceId+name]').equals([input.workspaceId, categoryName]).first();
        if (!category) {
          const newCategory: Category = {
            id: createId('cat'),
            workspaceId: input.workspaceId,
            name: categoryName,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          await db.categories.add(newCategory);
          category = newCategory;
        }
        categoryId = category.id;
      }
      const product: Product = {
        id: productId,
        workspaceId: input.workspaceId,
        name,
        sku,
        ...(categoryId ? { categoryId } : {}),
        costPriceMinor: input.costPriceMinor,
        sellingPriceMinor: input.sellingPriceMinor,
        lowStockThreshold: input.lowStockThreshold,
        trackStock: input.trackStock,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await db.products.add(product);
    });
    const created = await db.products.get(productId);
    if (!created) throw new Error('Product was not saved. Please try again.');
    return created;
  },

  async update(product) {
    const name = product.name.trim();
    const sku = product.sku.trim();
    if (!name || !sku) throw new Error('Product name and SKU are required.');
    assertNonNegativeSafeInteger(product.costPriceMinor, 'Cost price');
    assertNonNegativeSafeInteger(product.sellingPriceMinor, 'Selling price');
    const duplicate = await db.products.where('[workspaceId+sku]').equals([product.workspaceId, sku]).first();
    if (duplicate && duplicate.id !== product.id) throw new Error(`SKU “${sku}” is already in use.`);
    const updated = { ...product, name, sku, updatedAt: nowIso() };
    await db.products.put(updated);
    return updated;
  },
};
