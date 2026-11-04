import { db } from './database';
import type { ProductRepository } from '../contracts/repositories';
import { createId, nowIso } from '../../domain/shared/ids';
import type { Category, CreateProductInput, Product } from '../../domain/shared/types';
import { assertNonNegativeSafeInteger } from '../../domain/money/money';
import { validateProductDraft } from '../../domain/catalog/industryCatalog';

export const localProductRepository: ProductRepository = {
  async list({ workspaceId, search, activeOnly = true }) {
    let products = await db.products.where('workspaceId').equals(workspaceId).toArray();
    if (activeOnly) products = products.filter((product) => product.active);
    const query = search?.trim().toLocaleLowerCase();
    if (query) {
      products = products.filter((product) =>
        product.name.toLocaleLowerCase().includes(query) || product.sku.toLocaleLowerCase().includes(query) || (product.barcode ?? '').toLocaleLowerCase().includes(query) || (product.brand ?? '').toLocaleLowerCase().includes(query),
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
    if(input.productType){const failures=validateProductDraft(input.productType,Object.fromEntries(Object.entries(input.attributes??{}).map(([k,v])=>[k,String(v)])),{trackStock:input.trackStock,trackLot:input.trackLot===true,trackSerial:input.trackSerial===true},[]);if(failures.length)throw new Error(failures.join(' '));}

    const timestamp = nowIso();
    const productId = createId('prd');
    let categoryId: string | undefined;

    await db.transaction('rw', db.products, db.categories, async () => {
      const productsInWorkspace = await db.products.where('workspaceId').equals(input.workspaceId).toArray();
      const duplicate = productsInWorkspace.find((item) => item.sku.trim().toLocaleLowerCase() === sku.toLocaleLowerCase());
      if (duplicate) throw new Error(`SKU “${sku}” is already used by ${duplicate.name}.`);
      const barcode = input.barcode?.trim();
      if (barcode) {
        const barcodeDuplicate = productsInWorkspace.find((item) => (item.barcode ?? '').trim().toLocaleLowerCase() === barcode.toLocaleLowerCase());
        if (barcodeDuplicate) throw new Error(`Barcode “${barcode}” is already used by ${barcodeDuplicate.name}.`);
      }
      const categoryName = input.categoryName?.trim();
      if (input.categoryId) {
        const selectedCategory = await db.categories.get(input.categoryId);
        if (!selectedCategory || selectedCategory.workspaceId !== input.workspaceId) {
          throw new Error('Category does not belong to this workspace.');
        }
        categoryId = selectedCategory.id;
      } else if (categoryName) {
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
        ...(input.barcode?.trim() ? { barcode: input.barcode.trim() } : {}),
        ...(input.brand?.trim() ? { brand: input.brand.trim() } : {}),
        ...(input.unitOfMeasure?.trim() ? { unitOfMeasure: input.unitOfMeasure.trim() } : {}),
        ...(input.supplierSku?.trim() ? { supplierSku: input.supplierSku.trim() } : {}),
        ...(categoryId ? { categoryId } : {}),
        costPriceMinor: input.costPriceMinor,
        sellingPriceMinor: input.sellingPriceMinor,
        lowStockThreshold: input.lowStockThreshold,
        ...(input.productType?{productType:input.productType}:{}),
        ...(input.attributes?{attributes:input.attributes}:{}),
        trackStock: input.trackStock,trackLot:input.trackLot===true,trackSerial:input.trackSerial===true,
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

  async update(product, categoryNameInput) {
    const name = product.name.trim();
    const sku = product.sku.trim();
    if (!name || !sku) throw new Error('Product name and SKU are required.');
    assertNonNegativeSafeInteger(product.costPriceMinor, 'Cost price');
    assertNonNegativeSafeInteger(product.sellingPriceMinor, 'Selling price');
    assertNonNegativeSafeInteger(product.lowStockThreshold, 'Low-stock threshold');
    if(product.productType){const failures=validateProductDraft(product.productType,Object.fromEntries(Object.entries(product.attributes??{}).map(([k,v])=>[k,String(v)])),{trackStock:product.trackStock,trackLot:product.trackLot===true,trackSerial:product.trackSerial===true},[]);if(failures.length)throw new Error(failures.join(' '));}
    const cleanBarcode = product.barcode?.trim() ?? '';
    let updated: Product | undefined;
    await db.transaction('rw', db.products, db.categories, async () => {
      const productsInWorkspace = await db.products.where('workspaceId').equals(product.workspaceId).toArray();
      const duplicateSku = productsInWorkspace.find((item) => item.sku.trim().toLocaleLowerCase() === sku.toLocaleLowerCase() && item.id !== product.id);
      if (duplicateSku) throw new Error(`SKU “${sku}” is already in use.`);
      const duplicateBarcode = cleanBarcode && productsInWorkspace.find((item) => (item.barcode ?? '').trim().toLocaleLowerCase() === cleanBarcode.toLocaleLowerCase() && item.id !== product.id);
      if (duplicateBarcode) throw new Error(`Barcode “${cleanBarcode}” is already used by ${duplicateBarcode.name}.`);

      const categoryName = categoryNameInput?.trim();
      let categoryId = product.categoryId;
      if (categoryName) {
        let category = await db.categories.where('[workspaceId+name]').equals([product.workspaceId, categoryName]).first();
        if (!category) {
          category = {
            id: createId('cat'), workspaceId: product.workspaceId, name: categoryName,
            createdAt: nowIso(), updatedAt: nowIso(),
          };
          await db.categories.add(category);
        }
        categoryId = category.id;
      } else if (categoryId) {
        const selectedCategory = await db.categories.get(categoryId);
        if (!selectedCategory || selectedCategory.workspaceId !== product.workspaceId) {
          throw new Error('Category does not belong to this workspace.');
        }
      }

      const nextProduct: Product = { ...product, name, sku, updatedAt: nowIso() };
      if (cleanBarcode) nextProduct.barcode = cleanBarcode;
      else delete nextProduct.barcode;
      const cleanBrand = product.brand?.trim();
      if (cleanBrand) nextProduct.brand = cleanBrand;
      else delete nextProduct.brand;
      const cleanUnit = product.unitOfMeasure?.trim();
      if (cleanUnit) nextProduct.unitOfMeasure = cleanUnit;
      else delete nextProduct.unitOfMeasure;
      const cleanSupplierSku = product.supplierSku?.trim();
      if (cleanSupplierSku) nextProduct.supplierSku = cleanSupplierSku;
      else delete nextProduct.supplierSku;
      if (categoryId) nextProduct.categoryId = categoryId;
      else delete nextProduct.categoryId;
      updated = nextProduct;
      await db.products.put(nextProduct);
    });
    if (!updated) throw new Error('Product was not updated. Please try again.');
    return updated;
  },
};
