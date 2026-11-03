
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hasPermission, type Permission } from '../authorization/role-policy';
const num=(v:unknown)=>{const n=Number(v??0);return Number.isFinite(n)?n:0;};
export function daysInPeriod(from:string,to:string){
 const d=(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000+1;
 if(!Number.isInteger(d)||d<1||d>366)throw new Error('Date window must be 1–366 days');
 return {days:d,previousFrom:new Date(Date.parse(from+'T00:00:00Z')-d*86400000).toISOString().slice(0,10),previousTo:new Date(Date.parse(from+'T00:00:00Z')-86400000).toISOString().slice(0,10)};
}
@Injectable()
export class ReportInsightsService {
 constructor(private readonly db:PrismaService){}
 async build(tenantId:string,branchId:string,from:string,to:string,timezone:string,currency:string,role:string,base:Record<string,any>){
 const previous=daysInPeriod(from,to);
 return this.db.runWithTenantContext({tenantId},async()=>{
 const [salesTrend,receipts,purchase,delivery,manufacturing,people,projects,cash,prev]=await Promise.all([
 this.db.$queryRaw<Array<{day:string;amount:bigint}>>`
  SELECT (created_at AT TIME ZONE ${timezone})::date::text AS day, COALESCE(SUM(total_minor),0)::bigint AS amount
  FROM sales WHERE tenant_id=${tenantId}::uuid AND branch_id=${branchId}::uuid AND status='completed'
  AND (created_at AT TIME ZONE ${timezone})::date BETWEEN ${from}::date AND ${to}::date GROUP BY 1 ORDER BY 1`,
 this.db.$queryRaw<Array<{day:string;method:string;amount:bigint}>>`
  SELECT (COALESCE(p.recorded_at,p.created_at) AT TIME ZONE ${timezone})::date::text AS day,
   COALESCE(NULLIF(p.method_label,''),NULLIF(p.method_category,''),p.method,'Other') AS method,
   COALESCE(SUM(p.amount_minor),0)::bigint AS amount
  FROM sale_payments p JOIN sales s ON s.tenant_id=p.tenant_id AND s.id=p.sale_id
  WHERE p.tenant_id=${tenantId}::uuid AND s.branch_id=${branchId}::uuid AND s.status='completed'
    AND p.kind='receipt' AND (COALESCE(p.recorded_at,p.created_at) AT TIME ZONE ${timezone})::date BETWEEN ${from}::date AND ${to}::date
  GROUP BY 1,2`,
 this.db.$queryRaw<Array<{orders:number;requests:number}>>`SELECT
   (SELECT COUNT(*)::int FROM commerce_purchase_orders WHERE tenant_id=${tenantId}::uuid AND branch_id=${branchId}::uuid) AS orders,
   (SELECT COUNT(*)::int FROM procurement_purchase_requests WHERE tenant_id=${tenantId}::uuid AND branch_id=${branchId}::uuid) AS requests`,
 this.db.$queryRaw<Array<{total:number;delivered:number}>>`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE status='delivered')::int AS delivered FROM commerce_deliveries WHERE tenant_id=${tenantId}::uuid AND branch_id=${branchId}::uuid`,
 this.db.$queryRaw<Array<{orders:number;inspections:number}>>`SELECT
  (SELECT COUNT(*)::int FROM manufacturing_work_orders WHERE tenant_id=${tenantId}::uuid AND branch_id=${branchId}::uuid) AS orders,
  (SELECT COUNT(*)::int FROM quality_inspections WHERE tenant_id=${tenantId}::uuid AND branch_id=${branchId}::uuid) AS inspections`,
 this.db.$queryRaw<Array<{employees:number;attendance:number}>>`SELECT
  (SELECT COUNT(*)::int FROM hr_employees WHERE tenant_id=${tenantId}::uuid AND branch_id=${branchId}::uuid AND employment_status='active') AS employees,
  (SELECT COUNT(*)::int FROM hr_attendance WHERE tenant_id=${tenantId}::uuid AND branch_id=${branchId}::uuid AND attendance_date BETWEEN ${from}::date AND ${to}::date) AS attendance`,
 this.db.$queryRaw<Array<{total:number;overdue:number;support:number}>>`SELECT
  (SELECT COUNT(*)::int FROM projects WHERE tenant_id=${tenantId}::uuid AND branch_id=${branchId}::uuid) AS total,
  (SELECT COUNT(*)::int FROM project_tasks WHERE tenant_id=${tenantId}::uuid AND branch_id=${branchId}::uuid AND due_at<now() AND status NOT IN('completed','cancelled')) AS overdue,
  (SELECT COUNT(*)::int FROM support_cases WHERE tenant_id=${tenantId}::uuid AND branch_id=${branchId}::uuid AND status NOT IN('resolved','closed')) AS support`,
 this.db.$queryRaw<Array<{sessions:number;expenses:bigint}>>`SELECT
  (SELECT COUNT(*)::int FROM cash_sessions WHERE tenant_id=${tenantId}::uuid AND branch_id=${branchId}::uuid AND status='open') AS sessions,
  (SELECT COALESCE(SUM(total_minor),0)::bigint FROM expenses WHERE tenant_id=${tenantId}::uuid AND branch_id=${branchId}::uuid AND status IN('approved','posted','paid') AND expense_date BETWEEN ${from}::date AND ${to}::date) AS expenses`,
 this.db.$queryRaw<Array<{amount:bigint}>>`
  SELECT COALESCE(SUM(total_minor),0)::bigint AS amount FROM sales WHERE tenant_id=${tenantId}::uuid AND branch_id=${branchId}::uuid AND status='completed'
  AND (created_at AT TIME ZONE ${timezone})::date BETWEEN ${previous.previousFrom}::date AND ${previous.previousTo}::date`
 ]);
 const s=base.sales??{},i=base.inventory??{},gl=base.generalLedger??{},ar=base.receivables??{},ap=base.payables??{};
 type Metric={label:string;value:number;unit:'money'|'count'|'units';basis:'period'|'current'};
 const metric=(label:string,val:unknown,unit:Metric['unit']='count',basis:Metric['basis']='period'):Metric=>({label,value:num(val),unit,basis});
 const family=(key:string,title:string,permission:Permission,source:string,link:string,metrics:Metric[])=>({key,title,available:hasPermission(role,permission),source,link,metrics:hasPermission(role,permission)?metrics:[]});
 const p=purchase[0],d=delivery[0],m=manufacturing[0],h=people[0],j=projects[0],c=cash[0],f=hasPermission(role,'finance.read');
 const families=[
 family('executive','Executive performance','reports.read','sales, sale_returns, sale_payments, posted ledgers','/',[metric('Net sales',s.netSalesMinor,'money'),metric('Receipts',s.receiptsMinor,'money'),metric('Transactions',s.count),...(f?[metric('Receivables',ar.outstandingMinor,'money','current')]:[])]),
 family('sales','Sales & POS','sales.read','sales, sale_returns, sale_payments','/sales',[metric('Completed sales',s.count),metric('Gross sales',s.grossMinor,'money'),metric('Returns',s.returnsMinor,'money'),metric('Net sales',s.netSalesMinor,'money')]),
 family('payments','Cash & payments','finance.read','sale_payments, cash_sessions','/modules/cash-sessions',[metric('Receipts',s.receiptsMinor,'money'),metric('Open cash sessions',c?.sessions,'count','current')]),
 family('inventory','Inventory & stock','inventory.read','stock_movements, products','/inventory',[metric('Stocked products',i.productsWithStock,'count','current'),metric('Units on hand',i.netUnits,'units','current'),metric('Reorder alerts',i.atOrBelowReorder,'count','current')]),
 family('procurement','Purchasing & suppliers','procurement.read','commerce_purchase_orders, procurement_purchase_requests','/modules/purchases',[metric('Purchase orders',p?.orders,'count','current'),metric('Purchase requests',p?.requests,'count','current'),...(f?[metric('Supplier balances due',ap.outstandingMinor,'money','current')]:[])]),
 family('finance','Finance & accounting','finance.read','ledger_journals, ledger_journal_lines, expenses','/modules/accounting',[metric('Posted revenue',gl.revenueMinor,'money'),metric('Posted expenses',gl.expenseMinor,'money'),metric('Approved expenses',c?.expenses,'money'),metric('Receivables',ar.outstandingMinor,'money','current'),metric('Payables',ap.outstandingMinor,'money','current'),metric('Trial balance difference',gl.trialBalanceDifferenceMinor,'money','current')]),
 family('customers','Customers & growth','crm.read','module_records, support_cases','/modules/customers',[metric('Customer records',base.crm?.customerRecords,'count','current'),metric('Leads',base.crm?.leads,'count','current'),metric('Open support cases',j?.support,'count','current')]),
 family('people','People & payroll','people.read','hr_employees, hr_attendance','/modules/employees',[metric('Active employees',h?.employees,'count','current'),metric('Attendance records',h?.attendance)]),
 family('logistics','Delivery & logistics','fulfilment.read','commerce_deliveries','/modules/deliveries',[metric('Deliveries',d?.total,'count','current'),metric('Delivered',d?.delivered,'count','current')]),
 family('production','Production & quality','manufacturing.read','manufacturing_work_orders, quality_inspections','/modules/work-orders',[metric('Work orders',m?.orders,'count','current'),metric('Inspections',m?.inspections,'count','current')]),
 family('projects','Projects & services','projects.read','projects, project_tasks, support_cases','/modules/projects',[metric('Projects',j?.total,'count','current'),metric('Overdue tasks',j?.overdue,'count','current')]),
 family('compliance','Compliance & controls','finance.read','ledger_journals, cash_sessions, tax records','/modules/accounting',[metric('Ledger difference',gl.trialBalanceDifferenceMinor,'money','current'),metric('Open cash sessions',c?.sessions,'count','current')])
 ];
 const plot=new Map<string,{label:string;salesMinor:number;receiptsMinor:number}>();
 for(const row of salesTrend)plot.set(row.day,{label:row.day,salesMinor:num(row.amount),receiptsMinor:0});
 for(const row of receipts){const v=plot.get(row.day)??{label:row.day,salesMinor:0,receiptsMinor:0};v.receiptsMinor+=num(row.amount);plot.set(row.day,v)}
 const methods=new Map<string,number>();
 for(const row of receipts)methods.set(row.method,(methods.get(row.method)??0)+num(row.amount));
 const prevGross=num(prev[0]?.amount),currentGross=num(s.grossMinor);
 const alerts:Array<{title:string;detail:string;link:string}>=[];
 if(hasPermission(role,'inventory.read')&&num(i.atOrBelowReorder)>0)alerts.push({title:'Stock needs attention',detail:'Review items at or below reorder levels.',link:'/inventory'});
 if(f&&num(ar.overdueMinor)>0)alerts.push({title:'Overdue customer balances',detail:'Review outstanding invoices and collection dates.',link:'/modules/sales-invoices'});
 return {currency,period:{from,to,timezone,...previous},families,trend:[...plot.values()].sort((a,b)=>a.label.localeCompare(b.label)),paymentMethods:f?[...methods].map(([label,amountMinor])=>({label,amountMinor})):[],comparison:{previousGrossMinor:prevGross,currentGrossMinor:currentGross,changePercent:prevGross>0?Math.round((currentGross-prevGross)/prevGross*10000)/100:null},alerts,generatedAt:new Date().toISOString(),sourceNotes:base.sourceNotes??[],assurance:'Verified operational records, period flows separated from current snapshots. No AI-generated accounting figures.'};
 });
 }
}

