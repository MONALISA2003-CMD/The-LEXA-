import { db } from './database';
import { createDocumentNumber, createId, nowIso } from '../../domain/shared/ids';
import { calculateSaleTotal, normalizeSaleItems, remainingReturnableQuantity, validatePaymentAllocations } from '../../domain/sales/rules';
import { stockOnHand } from '../../domain/inventory/stock';
import type { CompleteSaleInput, PaymentRecord, Product, RecordReturnInput, ReturnLine, Sale, SaleLine, SaleReturn, StockMovement } from '../../domain/shared/types';
import type { SalesWorkflow } from '../contracts/workflows';

export const localSalesWorkflow: SalesWorkflow = {
  async completeSale(input: CompleteSaleInput) {
    const items = normalizeSaleItems(input.items);
    const timestamp = nowIso();
    const saleId = createId('sale');
    let sale: Sale | undefined;

    // Dexie supports a table array; this keeps the transaction atomic without
    // hitting the TypeScript overload limit for many positional table args.
    await db.transaction('rw', [
      db.workspaces,
      db.branches,
      db.products,
      db.stockMovements,
      db.sales,
      db.saleLines,
      db.payments,
      db.auditEvents,
    ], async () => {
      const workspace = await db.workspaces.get(input.workspaceId);
      const branch = await db.branches.get(input.branchId);
      if (!workspace) throw new Error('Business workspace not found. Select a workspace and try again.');
      if (!branch || branch.workspaceId !== input.workspaceId) throw new Error('Selected branch does not belong to this workspace.');

      const products: Array<{ product: Product; quantity: number }> = [];
      for (const item of items) {
        const product = await db.products.get(item.productId);
        if (!product || product.workspaceId !== input.workspaceId || !product.active) {
          throw new Error('One of the selected products is missing or inactive. Refresh the catalogue and try again.');
        }
        if (product.trackStock) {
          const movements = await db.stockMovements.where('[workspaceId+branchId+productId]')
            .equals([input.workspaceId, input.branchId, product.id]).toArray();
          const current = stockOnHand(movements);
          if (current < item.quantity) throw new Error(`Not enough stock for ${product.name}. Available: ${current}; requested: ${item.quantity}.`);
        }
        products.push({ product, quantity: item.quantity });
      }

      const totalMinor = calculateSaleTotal(products.map(({ product, quantity }) => ({ quantity, unitPriceMinor: product.sellingPriceMinor })));
      const payments = validatePaymentAllocations(input.payments, totalMinor);
      sale = {
        id: saleId,
        receiptNumber: createDocumentNumber('LEXA'),
        workspaceId: input.workspaceId,
        branchId: input.branchId,
        ...(input.customerName?.trim() ? { customerName: input.customerName.trim() } : {}),
        totalMinor,
        status: 'completed',
        createdAt: timestamp,
      };

      const saleLines: SaleLine[] = products.map(({ product, quantity }) => ({
        id: createId('line'), workspaceId: input.workspaceId, saleId,
        productId: product.id, productNameSnapshot: product.name, quantity,
        unitPriceMinor: product.sellingPriceMinor,
        lineTotalMinor: product.sellingPriceMinor * quantity,
      }));
      const stockMovements: StockMovement[] = products.flatMap(({ product, quantity }) => product.trackStock ? [{
        id: createId('mov'), workspaceId: input.workspaceId, branchId: input.branchId,
        productId: product.id, type: 'sale', quantityDelta: -quantity,
        reason: `Sale ${sale?.receiptNumber ?? ''}`.trim(), sourceId: saleId, createdAt: timestamp,
      }] : []);
      const paymentRecords: PaymentRecord[] = payments.map((payment) => ({
        id: createId('pay'), workspaceId: input.workspaceId, saleId, kind: 'receipt',
        method: payment.method, amountMinor: payment.amountMinor,
        ...(payment.reference ? { reference: payment.reference } : {}), createdAt: timestamp,
      }));

      await db.sales.add(sale);
      await db.saleLines.bulkAdd(saleLines);
      if (stockMovements.length) await db.stockMovements.bulkAdd(stockMovements);
      if (paymentRecords.length) await db.payments.bulkAdd(paymentRecords);
      await db.auditEvents.add({
        id: createId('audit'), workspaceId: input.workspaceId, branchId: input.branchId,
        entityType: 'sale', entityId: saleId, action: 'sale_completed', createdAt: timestamp,
      });
    });

    if (!sale) throw new Error('Sale could not be saved. No records were committed.');
    return { sale };
  },

  async recordReturn(input: RecordReturnInput) {
    const reason = input.reason.trim();
    if (!reason) throw new Error('A reason is required for every return.');
    if (input.items.length === 0) throw new Error('Select at least one item to return.');
    const quantities = new Map<string, number>();
    for (const item of input.items) {
      if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new Error('Return quantities must be positive whole numbers.');
      quantities.set(item.saleLineId, (quantities.get(item.saleLineId) ?? 0) + item.quantity);
    }

    const timestamp = nowIso();
    const returnId = createId('ret');
    let returnRecord: SaleReturn | undefined;
    await db.transaction('rw', [
      db.workspaces,
      db.branches,
      db.products,
      db.sales,
      db.saleLines,
      db.returns,
      db.returnLines,
      db.stockMovements,
      db.payments,
      db.auditEvents,
    ], async () => {
      const sale = await db.sales.get(input.saleId);
      const branch = await db.branches.get(input.branchId);
      if (!sale || sale.workspaceId !== input.workspaceId) throw new Error('Original sale not found in this workspace.');
      if (sale.branchId !== input.branchId || !branch || branch.workspaceId !== input.workspaceId) {
        throw new Error('Returns must be recorded against the branch that made the original sale.');
      }
      const originalLines = await db.saleLines.where('[workspaceId+saleId]').equals([input.workspaceId, input.saleId]).toArray();
      const previousReturns = await db.returns.where('[workspaceId+saleId]').equals([input.workspaceId, input.saleId]).toArray();
      const previousLineRecords: ReturnLine[] = [];
      for (const existingReturn of previousReturns) {
        previousLineRecords.push(...await db.returnLines.where('[workspaceId+returnId]').equals([input.workspaceId, existingReturn.id]).toArray());
      }

      const returnLines: ReturnLine[] = [];
      for (const [saleLineId, quantity] of quantities.entries()) {
        const originalLine = originalLines.find((line) => line.id === saleLineId);
        if (!originalLine) throw new Error('A selected item does not belong to the original sale.');
        const returnedBefore = previousLineRecords.filter((line) => line.originalSaleLineId === saleLineId)
          .reduce((sum, line) => sum + line.quantity, 0);
        const remaining = remainingReturnableQuantity(originalLine.quantity, returnedBefore);
        if (quantity > remaining) throw new Error(`Cannot return ${quantity} × ${originalLine.productNameSnapshot}. Only ${remaining} remain returnable.`);
        returnLines.push({
          id: createId('retline'), workspaceId: input.workspaceId, returnId,
          originalSaleLineId: saleLineId, productId: originalLine.productId,
          productNameSnapshot: originalLine.productNameSnapshot, quantity,
          unitPriceMinor: originalLine.unitPriceMinor, lineTotalMinor: originalLine.unitPriceMinor * quantity,
        });
      }

      const totalMinor = returnLines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
      if (!Number.isSafeInteger(totalMinor)) throw new Error('Return total is too large.');
      if (input.recordRefund && totalMinor > 0) {
        const existingPayments = await db.payments.where('[workspaceId+saleId]').equals([input.workspaceId, input.saleId]).toArray();
        const netReceived = existingPayments.reduce((sum, payment) => sum + (payment.kind === 'receipt' ? payment.amountMinor : -payment.amountMinor), 0);
        if (totalMinor > netReceived) throw new Error(`A refund of this amount cannot be recorded because only ${netReceived} has been recorded as received for this sale.`);
      }
      returnRecord = {
        id: returnId, workspaceId: input.workspaceId, branchId: input.branchId, saleId: input.saleId,
        returnNumber: createDocumentNumber('RET'), totalMinor, reason,
        refundRecorded: input.recordRefund, createdAt: timestamp,
      };
      const stockMovements: StockMovement[] = [];
      for (const line of returnLines) {
        const product = await db.products.get(line.productId);
        if (!product || product.workspaceId !== input.workspaceId) throw new Error(`Product for returned line ${line.productNameSnapshot} could not be found.`);
        if (product.trackStock) {
          stockMovements.push({
            id: createId('mov'), workspaceId: input.workspaceId, branchId: input.branchId,
            productId: line.productId, type: 'return', quantityDelta: line.quantity,
            reason: `Return ${returnRecord.returnNumber}: ${reason}`, sourceId: returnId, createdAt: timestamp,
          });
        }
      }
      await db.returns.add(returnRecord);
      await db.returnLines.bulkAdd(returnLines);
      if (stockMovements.length) await db.stockMovements.bulkAdd(stockMovements);
      if (input.recordRefund && totalMinor > 0) {
        await db.payments.add({
          id: createId('pay'), workspaceId: input.workspaceId, saleId: input.saleId,
          kind: 'refund', method: input.refundMethod, amountMinor: totalMinor,
          reference: returnRecord.returnNumber, createdAt: timestamp,
        });
      }
      await db.auditEvents.add({
        id: createId('audit'), workspaceId: input.workspaceId, branchId: input.branchId,
        entityType: 'sale_return', entityId: returnId, action: 'return_recorded', reason, createdAt: timestamp,
      });
    });

    if (!returnRecord) throw new Error('Return could not be saved. No records were committed.');
    return { returnRecord };
  },
};
