import type { Product, Sale, StockMovement } from '../../domain/shared/types';

export interface DashboardSnapshot {
  activeProductCount: number;
  lowStockCount: number;
  itemsInStock: number;
  grossSalesMinor: number;
  returnsMinor: number;
  netSalesMinor: number;
  recordedReceiptsMinor: number;
  recordedRefundsMinor: number;
  outstandingMinor: number;
  saleCount: number;
  recentSales: Sale[];
  recentMovements: StockMovement[];
  lowStockProducts: Array<{ product: Product; onHand: number }>;
}

export interface ReportsRepository {
  getDashboardSnapshot(input: { workspaceId: string; branchId: string }): Promise<DashboardSnapshot>;
}
