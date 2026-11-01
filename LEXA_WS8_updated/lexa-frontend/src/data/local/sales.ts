import { db } from './database';
import type { SalesRepository } from '../contracts/repositories';

export const localSalesRepository: SalesRepository = {
  async list({ workspaceId, limit = 100 }) {
    return db.sales.where('[workspaceId+createdAt]').between([workspaceId, ''], [workspaceId, '\uffff']).reverse().limit(limit).toArray();
  },

  async getSale({ workspaceId, saleId }) {
    const sale = await db.sales.get(saleId);
    if (!sale || sale.workspaceId !== workspaceId) return null;
    const [lines, returns, payments] = await Promise.all([
      db.saleLines.where('[workspaceId+saleId]').equals([workspaceId, saleId]).toArray(),
      db.returns.where('[workspaceId+saleId]').equals([workspaceId, saleId]).toArray(),
      db.payments.where('[workspaceId+saleId]').equals([workspaceId, saleId]).toArray(),
    ]);
    const returnIds = new Set(returns.map((record) => record.id));
    const candidateReturnLines = lines.length
      ? await db.returnLines.where('originalSaleLineId').anyOf(lines.map((line) => line.id)).toArray()
      : [];
    const returnLines = candidateReturnLines.filter((line) => returnIds.has(line.returnId));
    return { sale, lines, returns, returnLines, payments };
  },
};
