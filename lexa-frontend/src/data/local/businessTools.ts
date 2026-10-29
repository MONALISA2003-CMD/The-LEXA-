import { db } from './database';
import { createId, nowIso } from '../../domain/shared/ids';
import { parseMajorAmount } from '../../domain/money/money';
import type { Product, Sale, SaleReturn, StockMovement, PaymentRecord } from '../../domain/shared/types';

export interface BusinessToolsSnapshot {
  products: Product[];
  sales: Sale[];
  returns: SaleReturn[];
  payments: PaymentRecord[];
  movements: StockMovement[];
}

export async function loadBusinessToolsSnapshot(workspaceId: string, branchId: string): Promise<BusinessToolsSnapshot> {
  const [products, sales, returns, payments, movements] = await Promise.all([
    db.products.where('workspaceId').equals(workspaceId).toArray(),
    db.sales.where('workspaceId').equals(workspaceId).toArray(),
    db.returns.where('workspaceId').equals(workspaceId).toArray(),
    db.payments.where('workspaceId').equals(workspaceId).toArray(),
    db.stockMovements.where('[workspaceId+branchId+createdAt]')
      .between([workspaceId, branchId, ''], [workspaceId, branchId, '\uffff']).toArray(),
  ]);
  return { products, sales: sales.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), returns, payments, movements };
}

export interface LocalDatabaseBackup {
  format: 'lexa-local-database-backup';
  version: 1;
  createdAt: string;
  database: 'lexa-local';
  tables: Record<string, unknown[]>;
}

export async function createLocalDatabaseBackup(): Promise<LocalDatabaseBackup> {
  const entries = await Promise.all(db.tables.map(async (table) => [table.name, await table.toArray()] as const));
  return {
    format: 'lexa-local-database-backup',
    version: 1,
    createdAt: nowIso(),
    database: 'lexa-local',
    tables: Object.fromEntries(entries),
  };
}

export function validateLocalDatabaseBackup(value: unknown): LocalDatabaseBackup {
  if (!value || typeof value !== 'object') throw new Error('This file is not a LEXA local database backup.');
  const backup = value as Record<string, unknown>;
  if (backup.format !== 'lexa-local-database-backup' || backup.version !== 1 || backup.database !== 'lexa-local') {
    throw new Error('Unsupported backup format or version. Select a backup created by this LEXA frontend.');
  }
  if (typeof backup.createdAt !== 'string' || !backup.tables || typeof backup.tables !== 'object' || Array.isArray(backup.tables)) {
    throw new Error('The backup is missing required metadata or table data.');
  }
  const tables = backup.tables as Record<string, unknown>;
  const expected = db.tables.map((table) => table.name).sort();
  const actual = Object.keys(tables).sort();
  if (expected.length !== actual.length || expected.some((name, index) => name !== actual[index])) {
    throw new Error('The backup tables do not match this installed LEXA data version. Nothing was changed.');
  }
  for (const name of expected) {
    const rows = tables[name];
    if (!Array.isArray(rows)) throw new Error(`The ${name} table is not a valid array.`);
    const ids = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || typeof (row as Record<string, unknown>).id !== 'string') {
        throw new Error(`The ${name} table contains a record without a valid id.`);
      }
      const id = (row as Record<string, string>).id;
      if (ids.has(id)) throw new Error(`The ${name} table contains duplicate record id ${id}.`);
      ids.add(id);
    }
  }
  return backup as unknown as LocalDatabaseBackup;
}

export async function restoreLocalDatabaseBackup(value: unknown): Promise<{ tablesRestored: number; recordsRestored: number }> {
  const backup = validateLocalDatabaseBackup(value);
  let recordCount = 0;
  const tables = db.tables;
  // One IndexedDB transaction makes this restore all-or-nothing across the existing core tables.
  await db.transaction('rw', tables, async () => {
    for (const table of tables) {
      const rows = backup.tables[table.name];
      if (!rows) throw new Error(`The ${table.name} table is missing from this backup.`);
      await table.clear();
      if (rows.length) await table.bulkPut(rows as never[]);
      recordCount += rows.length;
    }
  });
  return { tablesRestored: tables.length, recordsRestored: recordCount };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell.trim()); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell.trim()); cell = '';
      if (row.some((item) => item.length)) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw new Error('The CSV has an unclosed quote. Please correct the file and retry.');
  row.push(cell.trim());
  if (row.some((item) => item.length)) rows.push(row);
  if (rows.length < 2) throw new Error('The CSV must include a header row and at least one data row.');
  const header = rows[0];
  if (!header) throw new Error('The CSV header row is missing.');
  const width = header.length;
  if (rows.some((item) => item.length !== width)) throw new Error('The CSV has inconsistent column counts. Export it again and keep each row aligned.');
  return rows;
}

function headerMap(headers: string[]): Map<string, number> {
  return new Map(headers.map((header, index) => [header.trim().toLowerCase().replace(/[ _-]+/g, ''), index]));
}

function optionalCell(row: string[], map: Map<string, number>, field: string, fallback = ''): string {
  const column = map.get(field);
  return column === undefined ? fallback : (row[column] ?? fallback);
}

function requiredCell(row: string[], map: Map<string, number>, field: string, rowNumber: number): string {
  const column = map.get(field.toLowerCase().replace(/[ _-]+/g, ''));
  const value = column === undefined ? '' : (row[column] ?? '').trim();
  if (!value) throw new Error(`CSV row ${rowNumber}: required column/value "${field}" is missing.`);
  return value;
}

export async function importProductsCsv(workspaceId: string, currency: string, text: string): Promise<number> {
  const rows = parseCsv(text);
  const headers = rows[0];
  if (!headers) throw new Error('The CSV header row is missing.');
  const map = headerMap(headers);
  const existing = await db.products.where('workspaceId').equals(workspaceId).toArray();
  const skuSet = new Set(existing.map((item) => item.sku.trim().toLowerCase()));
  const barcodeSet = new Set(existing.map((item) => (item.barcode ?? '').trim().toLowerCase()).filter(Boolean));
  const parsed = rows.slice(1).map((row, index) => {
    const rowNumber = index + 2;
    const name = requiredCell(row, map, 'name', rowNumber);
    const sku = requiredCell(row, map, 'sku', rowNumber);
    const barcode = optionalCell(row, map, 'barcode');
    const brand = optionalCell(row, map, 'brand');
    const unitOfMeasure = optionalCell(row, map, 'unitofmeasure');
    const categoryName = optionalCell(row, map, 'categoryname');
    const costText = optionalCell(row, map, 'costprice') || optionalCell(row, map, 'costpriceminor') || '0';
    const sellText = optionalCell(row, map, 'sellingprice') || optionalCell(row, map, 'sellingpriceminor');
    if (!sellText) throw new Error(`CSV row ${rowNumber}: sellingPrice is required.`);
    const costPriceMinor = map.has('costpriceminor') ? Number(costText) : parseMajorAmount(costText, currency);
    const sellingPriceMinor = map.has('sellingpriceminor') ? Number(sellText) : parseMajorAmount(sellText, currency);
    const thresholdText = optionalCell(row, map, 'lowstockthreshold', '0') || '0';
    const lowStockThreshold = Number(thresholdText);
    const trackText = optionalCell(row, map, 'trackstock', 'true').trim().toLowerCase();
    if (map.has('trackstock') && !['true', 'yes', '1', 'y', 'false', 'no', '0', 'n'].includes(trackText)) throw new Error(`CSV row ${rowNumber}: trackStock must be true/false or yes/no.`);
    const trackStock = ['true', 'yes', '1', 'y'].includes(trackText);
    if (!Number.isSafeInteger(costPriceMinor) || costPriceMinor < 0 || !Number.isSafeInteger(sellingPriceMinor) || sellingPriceMinor < 0) throw new Error(`CSV row ${rowNumber}: prices must be valid non-negative amounts in ${currency}.`);
    if (!Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0) throw new Error(`CSV row ${rowNumber}: lowStockThreshold must be a non-negative whole number.`);
    if (skuSet.has(sku.toLowerCase())) throw new Error(`CSV row ${rowNumber}: SKU "${sku}" already exists or is duplicated in this import.`);
    skuSet.add(sku.toLowerCase());
    if (barcode?.trim()) {
      if (barcodeSet.has(barcode.trim().toLowerCase())) throw new Error(`CSV row ${rowNumber}: barcode "${barcode}" already exists or is duplicated in this import.`);
      barcodeSet.add(barcode.trim().toLowerCase());
    }
    return { name, sku, barcode: barcode?.trim() ?? '', brand: brand?.trim() ?? '', unitOfMeasure: unitOfMeasure?.trim() ?? '', categoryName: categoryName?.trim() ?? '', costPriceMinor, sellingPriceMinor, lowStockThreshold, trackStock };
  });

  const timestamp = nowIso();
  let imported = 0;
  await db.transaction('rw', db.products, db.categories, db.auditEvents, async () => {
    const categoryRows = await db.categories.where('workspaceId').equals(workspaceId).toArray();
    const categoryByName = new Map(categoryRows.map((item) => [item.name.toLowerCase(), item]));
    const products = [] as Product[];
    for (const input of parsed) {
      let categoryId: string | undefined;
      if (input.categoryName) {
        let category = categoryByName.get(input.categoryName.toLowerCase());
        if (!category) {
          category = { id: createId('cat'), workspaceId, name: input.categoryName, createdAt: timestamp, updatedAt: timestamp };
          await db.categories.add(category);
          categoryByName.set(input.categoryName.toLowerCase(), category);
        }
        categoryId = category.id;
      }
      products.push({
        id: createId('prd'), workspaceId, name: input.name, sku: input.sku,
        ...(input.barcode ? { barcode: input.barcode } : {}), ...(input.brand ? { brand: input.brand } : {}),
        ...(input.unitOfMeasure ? { unitOfMeasure: input.unitOfMeasure } : {}), ...(categoryId ? { categoryId } : {}),
        costPriceMinor: input.costPriceMinor, sellingPriceMinor: input.sellingPriceMinor,
        lowStockThreshold: input.lowStockThreshold, trackStock: input.trackStock, active: true,
        createdAt: timestamp, updatedAt: timestamp,
      });
    }
    const firstProduct = products[0];
    if (!firstProduct) throw new Error('No valid product rows were found in the CSV. Nothing was imported.');
    await db.products.bulkAdd(products);
    await db.auditEvents.add({ id: createId('audit'), workspaceId, entityType: 'product_import', entityId: firstProduct.id, action: 'products_imported', reason: `${products.length} product records imported from validated CSV`, createdAt: timestamp });
    imported = products.length;
  });
  return imported;
}

export async function importOpeningStockCsv(workspaceId: string, branchId: string, text: string): Promise<number> {
  const rows = parseCsv(text);
  const headers = rows[0];
  if (!headers) throw new Error('The CSV header row is missing.');
  const map = headerMap(headers);
  const parsed = rows.slice(1).map((row, index) => {
    const rowNumber = index + 2;
    const sku = requiredCell(row, map, 'sku', rowNumber);
    const quantityText = requiredCell(row, map, 'quantity', rowNumber);
    const quantity = Number(quantityText);
    const reason = optionalCell(row, map, 'reason', 'Opening stock imported from validated CSV');
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error(`CSV row ${rowNumber}: opening quantity must be a positive whole number.`);
    if (!reason.trim()) throw new Error(`CSV row ${rowNumber}: reason cannot be blank.`);
    return { sku, quantity, reason: reason.trim(), rowNumber };
  });
  const skuSet = new Set<string>();
  for (const row of parsed) {
    const normalized = row.sku.trim().toLowerCase();
    if (skuSet.has(normalized)) throw new Error(`CSV row ${row.rowNumber}: SKU "${row.sku}" is duplicated in this import.`);
    skuSet.add(normalized);
  }

  let imported = 0;
  await db.transaction('rw', db.products, db.stockMovements, db.branches, db.auditEvents, async () => {
    const branch = await db.branches.get(branchId);
    if (!branch || branch.workspaceId !== workspaceId) throw new Error('The selected branch does not belong to this business.');
    const products = await db.products.where('workspaceId').equals(workspaceId).toArray();
    const bySku = new Map(products.map((item) => [item.sku.trim().toLowerCase(), item]));
    const movements = [] as StockMovement[];
    for (const row of parsed) {
      const product = bySku.get(row.sku.trim().toLowerCase());
      if (!product) throw new Error(`CSV row ${row.rowNumber}: SKU "${row.sku}" was not found. Import products first.`);
      if (!product.trackStock) throw new Error(`CSV row ${row.rowNumber}: stock tracking is disabled for ${product.name}.`);
      const prior = await db.stockMovements.where('[workspaceId+branchId+productId]').equals([workspaceId, branchId, product.id]).toArray();
      if (prior.length) throw new Error(`Opening stock already exists for ${product.name}; use the stock adjustment screen instead.`);
      movements.push({ id: createId('mov'), workspaceId, branchId, productId: product.id, type: 'opening', quantityDelta: row.quantity, reason: row.reason, createdAt: nowIso() });
    }
    const firstMovement = movements[0];
    if (!firstMovement) throw new Error('No valid opening-stock rows were found in the CSV. Nothing was imported.');
    await db.stockMovements.bulkAdd(movements);
    const timestamp = nowIso();
    await db.auditEvents.add({ id: createId('audit'), workspaceId, branchId, entityType: 'stock_movement', entityId: firstMovement.id, action: 'opening_stock_imported', reason: `${movements.length} opening balances imported from validated CSV`, createdAt: timestamp });
    imported = movements.length;
  });
  return imported;
}
