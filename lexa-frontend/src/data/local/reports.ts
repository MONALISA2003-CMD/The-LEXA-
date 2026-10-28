import { db } from './database';
import type { ReportsRepository } from '../contracts/reports';

export const localReportsRepository: ReportsRepository = {
  async getDashboardSnapshot({ workspaceId, branchId }) {
    const [products, movements, sales] = await Promise.all([
      db.products.where('workspaceId').equals(workspaceId).filter((item) => item.active).toArray(),
      db.stockMovements.where('[workspaceId+branchId+createdAt]')
        .between([workspaceId, branchId, ''], [workspaceId, branchId, '\uffff']).toArray(),
      db.sales.where('[workspaceId+branchId+createdAt]')
        .between([workspaceId, branchId, ''], [workspaceId, branchId, '\uffff']).toArray(),
    ]);
    const [payments, returnRecords] = await Promise.all([
      db.payments.where('workspaceId').equals(workspaceId).toArray(),
      db.returns.where('workspaceId').equals(workspaceId).toArray(),
    ]);

    const balanceMap = new Map<string, number>();
    for (const movement of movements) {
      balanceMap.set(movement.productId, (balanceMap.get(movement.productId) ?? 0) + movement.quantityDelta);
    }
    const lowStockProducts = products.filter((product) => {
      if (!product.trackStock) return false;
      return (balanceMap.get(product.id) ?? 0) <= product.lowStockThreshold;
    }).map((product) => ({ product, onHand: balanceMap.get(product.id) ?? 0 }));

    const branchSaleIds = new Set(sales.map((sale) => sale.id));
    const branchPayments = payments.filter((payment) => branchSaleIds.has(payment.saleId));
    const branchReturns = returnRecords.filter((record) => branchSaleIds.has(record.saleId));
    const grossSalesMinor = sales.reduce((sum, sale) => sum + sale.totalMinor, 0);
    const returnsMinor = branchReturns.reduce((sum, record) => sum + record.totalMinor, 0);
    const recordedReceiptsMinor = branchPayments.filter((payment) => payment.kind === 'receipt').reduce((sum, payment) => sum + payment.amountMinor, 0);
    const recordedRefundsMinor = branchPayments.filter((payment) => payment.kind === 'refund').reduce((sum, payment) => sum + payment.amountMinor, 0);
    const netSalesMinor = Math.max(0, grossSalesMinor - returnsMinor);
    const outstandingMinor = Math.max(0, netSalesMinor - recordedReceiptsMinor + recordedRefundsMinor);

    return {
      activeProductCount: products.length,
      lowStockCount: lowStockProducts.length,
      itemsInStock: [...balanceMap.values()].reduce((sum, quantity) => sum + quantity, 0),
      grossSalesMinor,
      returnsMinor,
      netSalesMinor,
      recordedReceiptsMinor,
      recordedRefundsMinor,
      outstandingMinor,
      saleCount: sales.length,
      recentSales: [...sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
      recentMovements: [...movements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
      lowStockProducts: lowStockProducts.sort((a, b) => a.onHand - b.onHand).slice(0, 5),
    };
  },
};
