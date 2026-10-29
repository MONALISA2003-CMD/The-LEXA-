import type {
  Branch, Category, CreateProductInput, CreateWorkspaceInput, PaymentRecord, Product, ReturnLine, Sale, SaleLine, SaleReturn, StockMovement, Workspace,
} from '../../domain/shared/types';

export interface WorkspaceRepository {
  list(): Promise<Workspace[]>;
  getById(workspaceId: string): Promise<Workspace | null>;
  listBranches(workspaceId: string): Promise<Branch[]>;
  create(input: CreateWorkspaceInput): Promise<Workspace>;
  update(workspace: Workspace): Promise<Workspace>;
  createBranch(input: { workspaceId: string; name: string; address?: string }): Promise<Branch>;
}

export interface ProductRepository {
  list(input: { workspaceId: string; search?: string; activeOnly?: boolean }): Promise<Product[]>;
  listCategories(workspaceId: string): Promise<Category[]>;
  create(input: CreateProductInput): Promise<Product>;
  update(product: Product, categoryName?: string): Promise<Product>;
}

export interface InventoryRepository {
  listMovements(input: { workspaceId: string; branchId: string; limit?: number }): Promise<StockMovement[]>;
  recordAdjustment(input: { workspaceId: string; branchId: string; productId: string; quantityDelta: number; reason: string; movementType?: 'opening' | 'adjustment' }): Promise<StockMovement>;
  getBalances(input: { workspaceId: string; branchId: string }): Promise<Map<string, number>>;
}

export interface SalesRepository {
  list(input: { workspaceId: string; limit?: number }): Promise<Sale[]>;
  getSale(input: { workspaceId: string; saleId: string }): Promise<{ sale: Sale; lines: SaleLine[]; returns: SaleReturn[]; returnLines: ReturnLine[]; payments: PaymentRecord[] } | null>;
}
