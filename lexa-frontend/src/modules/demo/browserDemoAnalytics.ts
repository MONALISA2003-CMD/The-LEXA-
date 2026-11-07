/** Real aggregates over the fictional browser-demo records — not static chart figures. */
import { db } from '../../data/local/database';
import type { DashboardAnalytics, DashboardPeriod } from '../../data/contracts/dashboardAnalytics';
import { fractionDigitsForCurrency } from '../../domain/money/money';

const daysByPeriod: Readonly<Record<DashboardPeriod, number>> = {
  today: 1, '7d': 7, '30d': 30, '90d': 90, '12m': 365,
};

export async function getBrowserDemoAnalytics(
  workspaceId: string, branchId: string, period: DashboardPeriod,
): Promise<DashboardAnalytics> {
  const [sales, payments, products, movements] = await Promise.all([
    db.sales.where('workspaceId').equals(workspaceId).toArray(),
    db.payments.where('workspaceId').equals(workspaceId).toArray(),
    db.products.where('workspaceId').equals(workspaceId).toArray(),
    db.stockMovements.where('workspaceId').equals(workspaceId).toArray(),
  ]);
  const branchSales = sales.filter(sale => sale.branchId === branchId);
  const cutoff = Date.now() - (daysByPeriod[period]-1)*86_400_000 - 86_400_000;
  const matching = branchSales.filter(sale => Date.parse(sale.createdAt) >= cutoff);
  const saleIds = new Set(matching.map(sale => sale.id));
  const factor = 10 ** fractionDigitsForCurrency('UGX');
  const daily = new Map<string,number>();
  for (const sale of matching) {
    const date = sale.createdAt.slice(0,10);
    const label = period === '12m' ? date.slice(0,7) : date;
    daily.set(label, (daily.get(label)??0) + sale.totalMinor/factor);
  }
  const byMethod = new Map<string,number>();
  for (const payment of payments) {
    if (!saleIds.has(payment.saleId) || payment.kind !== 'receipt') continue;
    const name = payment.method==='mobile_money'?'Mobile Money':payment.method==='cash'?'Cash':payment.method.replaceAll('_',' ');
    byMethod.set(name,(byMethod.get(name)??0)+payment.amountMinor/factor);
  }
  const balances = new Map<string,number>();
  for (const movement of movements) {
    if(movement.branchId!==branchId)continue;
    balances.set(movement.productId,(balances.get(movement.productId)??0)+movement.quantityDelta);
  }
  const live=products.filter(product=>product.active&&product.trackStock);
  const low=live.filter(product=>(balances.get(product.id)??0)<=product.lowStockThreshold);
  const out=live.filter(product=>(balances.get(product.id)??0)<=0);
  const total=matching.reduce((sum,sale)=>sum+sale.totalMinor,0)/factor;
  return {
    generatedAt:new Date().toISOString(),period,
    kpis:[
      {key:'demo-transaction-count',label:'Receipts in period',value:matching.length,unit:'number',href:'/sales',description:'Recorded fictional receipts'},
      {key:'demo-average-sale',label:'Average receipt',value:matching.length?total/matching.length:0,unit:'currency',href:'/sales',description:'Calculated from sample receipts'},
    ],
    salesTrend:[...daily.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([label,value])=>({label,value})),
    salesByChannel:[...byMethod.entries()].map(([label,value])=>({label,value})),
    stockHealth:[
      {label:'In stock',value:live.length-low.length},
      {label:'Low stock',value:low.length-out.length},
      {label:'Out of stock',value:out.length},
    ],
    recentActivity:[...branchSales].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,6)
      .map(sale=>({id:sale.id,kind:'sale',summary:`Sample receipt ${sale.receiptNumber} · ${sale.customerName??'Walk-in'}`,occurredAt:sale.createdAt,href:`/sales/${sale.id}`})),
    exceptions:low.slice(0,5).map(product=>({
      id:product.id,severity:'warning' as const,title:`Low stock: ${product.name}`,
      detail:`${balances.get(product.id)??0} units on hand`,href:'/inventory',
    })),
    sourceCoverage:{sales:true,inventory:true,finance:false,crm:false,workforce:false},
  };
}
