import type { WorkspaceRepository, ProductRepository, InventoryRepository, SalesRepository } from '../contracts/repositories';
import type { ReportsRepository } from '../contracts/reports';
import type { Branch, Category, CreateProductInput, CreateWorkspaceInput, PaymentRecord, Product, ReturnLine, Sale, SaleLine, SaleReturn, StockMovement, Workspace } from '../../domain/shared/types';
import type { DashboardSnapshot } from '../contracts/reports';
import { apiClient } from './apiClient';

const enc = (value: string) => encodeURIComponent(value);

function listPayload<T>(value: unknown, label: string): T[] {
  const collection = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)
      ? (value as { items: unknown[] }).items
      : null;
  if (!collection) throw new Error(`The backend returned an invalid ${label} collection. Expected an array or { items: [] }.`);
  return collection as T[];
}

function objectPayload<T>(value: unknown, label: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`The backend returned an invalid ${label} response.`);
  return value as T;
}

export const apiWorkspaceRepository: WorkspaceRepository = {
  async list() { return listPayload<Workspace>(await apiClient.get('/workspaces'), 'workspace'); },
  async getById(workspaceId) {
    try { return objectPayload<Workspace>(await apiClient.get(`/workspaces/${enc(workspaceId)}`), 'workspace'); }
    catch (error) {
      if (error instanceof Error && 'status' in error && (error as { status?: number }).status === 404) return null;
      throw error;
    }
  },
  async listBranches(workspaceId) { return listPayload<Branch>(await apiClient.get(`/workspaces/${enc(workspaceId)}/branches`), 'branch'); },
  async create(input: CreateWorkspaceInput) { return objectPayload<Workspace>(await apiClient.post('/workspaces', input, crypto.randomUUID()), 'created workspace'); },
  async update(workspace) { return objectPayload<Workspace>(await apiClient.patch(`/workspaces/${enc(workspace.id)}`, { businessName: workspace.businessName, businessType: workspace.businessType, timezone: workspace.timezone }), 'updated workspace'); },
  async createBranch(input) { return objectPayload<Branch>(await apiClient.post(`/workspaces/${enc(input.workspaceId)}/branches`, { name: input.name, ...(input.address ? { address: input.address } : {}) }, crypto.randomUUID()), 'created branch'); },
};

export const apiProductRepository: ProductRepository = {
  async list({ workspaceId, search, activeOnly }) {
    return listPayload<Product>(await apiClient.get(`/workspaces/${enc(workspaceId)}/products`, { search, activeOnly }), 'product');
  },
  async listCategories(workspaceId) { return listPayload<Category>(await apiClient.get(`/workspaces/${enc(workspaceId)}/categories`), 'category'); },
  async create(input: CreateProductInput) { return objectPayload<Product>(await apiClient.post(`/workspaces/${enc(input.workspaceId)}/products`, input, crypto.randomUUID()), 'created product'); },
  async update(product, categoryName) { return objectPayload<Product>(await apiClient.patch(`/workspaces/${enc(product.workspaceId)}/products/${enc(product.id)}`, { ...product, categoryName }), 'updated product'); },
};

export const apiInventoryRepository: InventoryRepository = {
  async listMovements({ workspaceId, branchId, limit }) {
    return listPayload<StockMovement>(await apiClient.get(`/workspaces/${enc(workspaceId)}/branches/${enc(branchId)}/inventory/movements`, { limit }), 'stock movement');
  },
  async recordAdjustment(input) {
    return objectPayload<StockMovement>(await apiClient.post(`/workspaces/${enc(input.workspaceId)}/branches/${enc(input.branchId)}/inventory/movements`, {
      productId: input.productId, quantityDelta: input.quantityDelta, reason: input.reason, movementType: input.movementType ?? 'adjustment',
    }, crypto.randomUUID()), 'stock movement');
  },
  async getBalances({ workspaceId, branchId }) {
    const response = await apiClient.get<unknown>(`/workspaces/${enc(workspaceId)}/branches/${enc(branchId)}/inventory/balances`);
    const balances = new Map<string, number>();
    if (Array.isArray(response)) {
      for (const row of response) {
        if (!row || typeof row !== 'object') continue;
        const value = row as { productId?: unknown; quantity?: unknown; onHand?: unknown };
        if (typeof value.productId === 'string') balances.set(value.productId, Number(value.quantity ?? value.onHand ?? 0));
      }
      return balances;
    }
    if (response && typeof response === 'object') {
      for (const [key, value] of Object.entries(response as Record<string, unknown>)) {
        const quantity = typeof value === 'number' ? value : value && typeof value === 'object' ? Number((value as { quantity?: unknown; onHand?: unknown }).quantity ?? (value as { onHand?: unknown }).onHand ?? 0) : Number.NaN;
        if (Number.isFinite(quantity)) balances.set(key, quantity);
      }
      return balances;
    }
    throw new Error('The backend returned an invalid inventory balance response.');
  },
};

export const apiSalesRepository: SalesRepository = {
  async list({ workspaceId, limit }) { return listPayload<Sale>(await apiClient.get(`/workspaces/${enc(workspaceId)}/sales`, { limit }), 'sale'); },
  async getSale({ workspaceId, saleId }) {
    try {
      const result = objectPayload<{ sale: Sale; lines: SaleLine[]; returns: SaleReturn[]; returnLines: ReturnLine[]; payments: PaymentRecord[] }>(await apiClient.get(`/workspaces/${enc(workspaceId)}/sales/${enc(saleId)}`), 'sale detail');
      if (!result.sale || !Array.isArray(result.lines) || !Array.isArray(result.returns) || !Array.isArray(result.returnLines) || !Array.isArray(result.payments)) throw new Error('The backend returned incomplete sale detail.');
      return result;
    } catch (error) {
      if (error instanceof Error && 'status' in error && (error as { status?: number }).status === 404) return null;
      throw error;
    }
  },
};

export const apiReportsRepository: ReportsRepository = {
  async getDashboardSnapshot({ workspaceId, branchId }): Promise<DashboardSnapshot> {
    return objectPayload<DashboardSnapshot>(await apiClient.get(`/workspaces/${enc(workspaceId)}/branches/${enc(branchId)}/dashboard`), 'dashboard');
  },
};
