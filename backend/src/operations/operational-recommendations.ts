/**
 * Deterministic operational decisions from already-authorized business evidence.
 * A recommendation is a navigation/review instruction, not a financial or stock command.
 */
export type WorkArea = 'inventory' | 'purchasing' | 'finance' | 'sales' | 'fulfilment' | 'production';
export type WorkPriority = 'urgent' | 'important' | 'routine';
export type Evidence = {
  area: WorkArea;
  code: 'low_stock' | 'expiring_lot' | 'late_purchase' | 'purchase_review' | 'overdue_receivable' | 'supplier_payment_due' | 'delivery_exception' | 'production_review';
  count: number;
  source: string;
  asOf: string;
};
export type OperationalWorkItem = Evidence & {
  id: string;
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
  priority: WorkPriority;
  recommendationType: 'deterministic_rule';
};

const POLICIES: Readonly<Record<Evidence['code'], {
  title: string; single: string; plural: string; actionLabel: string; href: string; priority: WorkPriority;
}>> = {
  low_stock: {title: 'Review stock below reorder levels', single: 'product is at or below its reorder level', plural: 'products are at or below their reorder levels', actionLabel: 'Review stock', href: '/inventory', priority: 'important'},
  expiring_lot: {title: 'Inspect expired and short-dated batches', single: 'available batch is expired or due to expire within 30 days', plural: 'available batches are expired or due to expire within 30 days', actionLabel: 'Inspect batches', href: '/modules/batches', priority: 'urgent'},
  late_purchase: {title: 'Follow up on overdue purchase orders', single: 'purchase order has passed its expected delivery date', plural: 'purchase orders have passed their expected delivery dates', actionLabel: 'Review purchase orders', href: '/modules/purchases', priority: 'important'},
  purchase_review: {title: 'Review purchase requests awaiting approval', single: 'submitted purchase request is awaiting review', plural: 'submitted purchase requests are awaiting review', actionLabel: 'Review requests', href: '/modules/purchase-requests', priority: 'routine'},
  overdue_receivable: {title: 'Review overdue customer invoices', single: 'customer invoice is past due and has a recorded outstanding balance', plural: 'customer invoices are past due and have recorded outstanding balances', actionLabel: 'Review receivables', href: '/modules/sales-invoices', priority: 'urgent'},
  supplier_payment_due: {title: 'Review supplier invoices approaching due date', single: 'approved supplier invoice is due within 7 days', plural: 'approved supplier invoices are due within 7 days', actionLabel: 'Review supplier invoices', href: '/modules/purchase-invoices', priority: 'important'},
  delivery_exception: {title: 'Resolve failed deliveries', single: 'delivery has a failed status', plural: 'deliveries have a failed status', actionLabel: 'Review deliveries', href: '/modules/deliveries', priority: 'important'},
  production_review: {title: 'Review production waiting to start', single: 'released work order has not yet started', plural: 'released work orders have not yet started', actionLabel: 'Review work orders', href: '/modules/work-orders', priority: 'routine'},
};
const ORDER: Record<WorkPriority, number> = {urgent: 0, important: 1, routine: 2};

export function buildOperationalWork(evidence: readonly Evidence[]): OperationalWorkItem[] {
  return evidence.filter(row => Number.isSafeInteger(row.count) && row.count > 0 && POLICIES[row.code] !== undefined)
    .map(row => {
      const policy = POLICIES[row.code];
      return {
        ...row, id: `${row.area}:${row.code}`, title: policy.title,
        detail: `${row.count} ${row.count === 1 ? policy.single : policy.plural}. Check the linked records before taking action.`,
        actionLabel: policy.actionLabel, href: policy.href, priority: policy.priority,
        recommendationType: 'deterministic_rule' as const,
      };
    })
    .sort((a, b) => ORDER[a.priority] - ORDER[b.priority] || a.area.localeCompare(b.area) || a.code.localeCompare(b.code));
}
