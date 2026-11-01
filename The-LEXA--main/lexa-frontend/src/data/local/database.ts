import Dexie, { type EntityTable } from 'dexie';
import type {
  AuditEvent, Branch, Category, PaymentRecord, Product, ReturnLine, Sale, SaleLine, SaleReturn, StockMovement, Workspace,
} from '../../domain/shared/types';

export class LexaDatabase extends Dexie {
  workspaces!: EntityTable<Workspace, 'id'>;
  branches!: EntityTable<Branch, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  products!: EntityTable<Product, 'id'>;
  stockMovements!: EntityTable<StockMovement, 'id'>;
  sales!: EntityTable<Sale, 'id'>;
  saleLines!: EntityTable<SaleLine, 'id'>;
  payments!: EntityTable<PaymentRecord, 'id'>;
  returns!: EntityTable<SaleReturn, 'id'>;
  returnLines!: EntityTable<ReturnLine, 'id'>;
  auditEvents!: EntityTable<AuditEvent, 'id'>;

  constructor() {
    super('lexa-local');
    this.version(1).stores({
      workspaces: 'id, businessName, createdAt',
      branches: 'id, workspaceId, name, [workspaceId+name]',
      categories: 'id, workspaceId, name, [workspaceId+name]',
      products: 'id, workspaceId, categoryId, name, sku, active, [workspaceId+sku], [workspaceId+name]',
      stockMovements: 'id, workspaceId, branchId, productId, type, createdAt, [workspaceId+branchId+createdAt], [workspaceId+branchId+productId], [workspaceId+productId]',
      sales: 'id, workspaceId, branchId, receiptNumber, status, createdAt, [workspaceId+createdAt], [workspaceId+branchId+createdAt]',
      saleLines: 'id, workspaceId, saleId, productId, [workspaceId+saleId], [saleId+productId]',
      payments: 'id, workspaceId, saleId, kind, method, createdAt, [workspaceId+saleId]',
      returns: 'id, workspaceId, branchId, saleId, returnNumber, createdAt, [workspaceId+saleId]',
      returnLines: 'id, workspaceId, returnId, originalSaleLineId, productId, [workspaceId+returnId], [originalSaleLineId]',
      auditEvents: 'id, workspaceId, branchId, entityType, entityId, action, createdAt, [workspaceId+createdAt]',
    });
  }
}

export const db = new LexaDatabase();
