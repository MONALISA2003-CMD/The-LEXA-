import {
  BadRequestException, Controller, ForbiddenException, Get, Param, Post, Body, Query, Req,
  ServiceUnavailableException, UnauthorizedException, UseGuards, Put,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertBranchAccess } from '../authorization/branch-scope';
import { hasPermission, isWorkspaceAdministrator, isOwnerRole, type Permission } from '../authorization/role-policy';
import { CsrfGuard } from '../core/csrf.guard';
import { AiRouterService, classifyWorkload } from './ai-router.service';
import { quickOperationalAnswer } from './operations-analytics';
import { businessPreflight, professionalAnswer } from './ai-response';
import { ReportInsightsService, daysInPeriod } from './report-insights.service';

const AI_RESERVATION_MICROS = 50_000; // $0.05 reservation; the current free/developer router settles successful calls to zero cost
const AI_MAX_INPUT_CHARS = 2_000;
const FREE_MODEL_ALIAS = 'lexa-business-free';
type Scope = 'overview' | 'sales' | 'inventory' | 'finance' | 'customers' | 'people';

function cookie(request: FastifyRequest, name: string): string | undefined {
  for (const item of (request.headers.cookie ?? '').split(';')) {
    const index = item.indexOf('=');
    if (index < 0 || item.slice(0, index).trim() !== name) continue;
    try { return decodeURIComponent(item.slice(index + 1).trim()); } catch { return undefined; }
  }
  return undefined;
}
function sha(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function dateOnly(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${label} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException(`${label} is not a valid date.`);
  return value;
}
function safeText(value: unknown, label: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`${label} is required and must be no longer than ${max} characters.`);
  return value.trim();
}
function number(value: unknown): number { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }
function providerForAlias(_alias: string): string { return 'lexa_native_free_router'; }

@Controller('workspaces/:workspaceId/branches/:branchId')
export class Workstream8Controller {
  constructor(private readonly prisma: PrismaService, private readonly aiRouter: AiRouterService, private readonly reportInsights: ReportInsightsService) {}

  private async access(request: FastifyRequest, workspaceId: string, branchId: string, permission: Permission) {
    const token = cookie(request, 'lexa_session');
    if (!token) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Sign in to continue.' });
    const session = await this.prisma.session.findFirst({ where: { tokenHash: sha(token), expiresAt: { gt: new Date() } }, select: { userId: true } });
    if (!session) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Your session has expired. Sign in again.' });
    this.prisma.enterTenantContext(workspaceId, session.userId);
    const [membership, branch] = await this.prisma.runWithTenantContext({tenantId:workspaceId,userId:session.userId},()=>Promise.all([
      this.prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: workspaceId, userId: session.userId } }, select: { status: true, role: true } }),
      this.prisma.branch.findFirst({ where: { id: branchId, tenantId: workspaceId }, select: { id: true, currency: true, timezone: true } }),
    ]));
    if (!membership || membership.status !== 'ACTIVE') throw new UnauthorizedException({ code: 'WORKSPACE_ACCESS_DENIED', message: 'Workspace access is unavailable.' });
    if (!branch) throw new UnauthorizedException({ code: 'BRANCH_ACCESS_DENIED', message: 'Branch access is unavailable.' });
    await this.prisma.runWithTenantContext({tenantId:workspaceId,userId:session.userId},()=>assertBranchAccess(this.prisma, workspaceId, branchId, session.userId, membership.role));
    if ((permission === 'intelligence.read' || permission === 'intelligence.run') && !isOwnerRole(membership.role)) throw new ForbiddenException({ code: 'OWNER_ONLY', message: 'Only the business owner can use LEXA Intelligence.' });
    if (!hasPermission(membership.role, permission)) throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Your workspace role does not permit this operation.', permission });
    return { userId: session.userId, role: membership.role, branch };
  }

  private async rollBillingPeriod(tenantId: string): Promise<void> {
    // Preserve the subscription's billing-day anchor and catch up if several
    // cycles elapsed while the tenant was inactive. The subscription row is
    // locked by the AI reservation transaction; read-only endpoints may call
    // this update idempotently before presenting current usage.
    await this.prisma.$executeRaw`
      WITH RECURSIVE next_period(period_start,period_end) AS (
        SELECT current_period_start,current_period_end FROM tenant_subscriptions
        WHERE tenant_id=${tenantId}::uuid AND current_period_end<=CURRENT_DATE
        UNION ALL
        SELECT period_end,(period_end+interval '1 month')::date FROM next_period
        WHERE period_end<=CURRENT_DATE
      )
      UPDATE tenant_subscriptions SET
        current_period_start=(SELECT period_start FROM next_period ORDER BY period_end DESC LIMIT 1),
        current_period_end=(SELECT period_end FROM next_period ORDER BY period_end DESC LIMIT 1),
        updated_at=now()
      WHERE tenant_id=${tenantId}::uuid AND current_period_end<=CURRENT_DATE`;
  }

  private async hasFeature(tenantId: string, featureKey: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ enabled: boolean }>>`
      SELECT COALESCE(o.enabled,pf.enabled,false) AS enabled
      FROM tenant_subscriptions s
      JOIN saas_plan_features pf ON pf.plan_key=s.plan_key AND pf.feature_key=${featureKey}
      LEFT JOIN tenant_feature_overrides o ON o.tenant_id=s.tenant_id AND o.feature_key=${featureKey}
        AND (o.expires_at IS NULL OR o.expires_at>now())
      WHERE s.tenant_id=${tenantId}::uuid AND s.status IN ('trialing','active') LIMIT 1`;
    return rows[0]?.enabled === true;
  }

  private async aggregate(workspaceId: string, branchId: string, from?: string, to?: string, role?: string, advancedAnalytics = false) {
    return this.prisma.runWithTenantContext({tenantId:workspaceId},async()=>{
    const fromValue = from ?? null;
    const toValue = to ?? null;
    const [salesRows, stockRows, arRows, apRows, glRows, crmRows, controlRows] = await Promise.all([
      this.prisma.$queryRaw<any[]>`
        SELECT count(*) FILTER(WHERE s.status='completed')::int AS sales_count,COALESCE(sum(s.total_minor) FILTER(WHERE s.status='completed'),0)::bigint AS gross_sales_minor,
          COALESCE((SELECT sum(r.total_minor) FROM sale_returns r WHERE r.tenant_id=${workspaceId}::uuid AND r.branch_id=${branchId}::uuid AND r.created_at::date BETWEEN COALESCE(${fromValue}::date,'1900-01-01') AND COALESCE(${toValue}::date,'2999-12-31')),0)::bigint AS returns_minor,
          (SELECT count(*)::int FROM sale_returns r WHERE r.tenant_id=${workspaceId}::uuid AND r.branch_id=${branchId}::uuid AND r.created_at::date BETWEEN COALESCE(${fromValue}::date,'1900-01-01') AND COALESCE(${toValue}::date,'2999-12-31')) AS returns_count,
          COALESCE(sum(CASE WHEN s.status='completed' THEN s.total_minor ELSE 0 END),0)::bigint AS completed_gross_minor,
          COALESCE((SELECT sum(p.amount_minor) FROM sale_payments p JOIN sales ps ON ps.tenant_id=p.tenant_id AND ps.id=p.sale_id WHERE p.tenant_id=${workspaceId}::uuid AND ps.branch_id=${branchId}::uuid AND ps.status='completed' AND p.kind='receipt' AND p.created_at::date BETWEEN COALESCE(${fromValue}::date,'1900-01-01') AND COALESCE(${toValue}::date,'2999-12-31')),0)::bigint AS receipts_minor,
          COALESCE((SELECT sum(p.amount_minor) FROM sale_payments p JOIN sales ps ON ps.tenant_id=p.tenant_id AND ps.id=p.sale_id WHERE p.tenant_id=${workspaceId}::uuid AND ps.branch_id=${branchId}::uuid AND ps.status='completed' AND p.kind='refund' AND p.created_at::date BETWEEN COALESCE(${fromValue}::date,'1900-01-01') AND COALESCE(${toValue}::date,'2999-12-31')),0)::bigint AS refunds_minor
        FROM sales s WHERE s.tenant_id=${workspaceId}::uuid AND s.branch_id=${branchId}::uuid
          AND s.created_at::date BETWEEN COALESCE(${fromValue}::date,'1900-01-01') AND COALESCE(${toValue}::date,'2999-12-31')`,
      this.prisma.$queryRaw<any[]>`
        WITH balances AS (SELECT product_id,sum(quantity_delta)::numeric(18,3) AS quantity
          FROM stock_movements WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid
          GROUP BY product_id)
        SELECT count(*)::int AS tracked_products,
          count(*) FILTER(WHERE COALESCE(b.quantity,0)>0)::int AS products_with_stock,
          COALESCE(sum(COALESCE(b.quantity,0)),0)::numeric(18,3) AS net_units,
          CASE WHEN ${Boolean(role && hasPermission(role, 'finance.read'))} THEN COALESCE(sum(COALESCE(b.quantity,0)*p.cost_price_minor),0)::bigint ELSE NULL END AS inventory_cost_minor,
          count(*) FILTER(WHERE COALESCE(b.quantity,0)<=p.low_stock_threshold)::int AS at_or_below_reorder
        FROM products p LEFT JOIN balances b ON b.product_id=p.id
        WHERE p.tenant_id=${workspaceId}::uuid AND p.active=true AND p.track_stock=true`,
      role && hasPermission(role, 'finance.read') ? this.prisma.$queryRaw<any[]>`
        SELECT count(*)::int AS invoice_count,COALESCE(sum(i.total_minor),0)::bigint AS billed_minor,
          COALESCE(sum(COALESCE(a.applied_minor,0)),0)::bigint AS applied_minor,
          COALESCE(sum(GREATEST(0,i.total_minor-COALESCE(a.applied_minor,0))),0)::bigint AS outstanding_minor,
          count(*) FILTER(WHERE i.due_date<CURRENT_DATE AND i.total_minor>COALESCE(a.applied_minor,0))::int AS overdue_count,
          COALESCE(sum(CASE WHEN i.due_date<CURRENT_DATE THEN GREATEST(0,i.total_minor-COALESCE(a.applied_minor,0)) ELSE 0 END),0)::bigint AS overdue_minor
        FROM ar_customer_invoices i LEFT JOIN LATERAL (
          SELECT sum(CASE WHEN r.kind='receipt' THEN x.amount_minor ELSE -x.amount_minor END)::bigint AS applied_minor
          FROM ar_customer_receipt_allocations x JOIN ar_customer_receipts r ON r.tenant_id=x.tenant_id AND r.id=x.receipt_id
          WHERE x.tenant_id=i.tenant_id AND x.invoice_id=i.id
        ) a ON true
        WHERE i.tenant_id=${workspaceId}::uuid AND i.branch_id=${branchId}::uuid AND i.status IN ('issued','partially_paid','paid')` : Promise.resolve([]),
      role && hasPermission(role, 'finance.read') ? this.prisma.$queryRaw<any[]>`
        SELECT count(*)::int AS bill_count,COALESCE(sum(i.total_minor),0)::bigint AS billed_minor,
          COALESCE(sum(COALESCE(a.applied_minor,0)),0)::bigint AS applied_minor,
          COALESCE(sum(GREATEST(0,i.total_minor-COALESCE(a.applied_minor,0))),0)::bigint AS outstanding_minor,
          count(*) FILTER(WHERE i.due_date<CURRENT_DATE AND i.total_minor>COALESCE(a.applied_minor,0))::int AS overdue_count,
          COALESCE(sum(CASE WHEN i.due_date<CURRENT_DATE THEN GREATEST(0,i.total_minor-COALESCE(a.applied_minor,0)) ELSE 0 END),0)::bigint AS overdue_minor
        FROM ap_supplier_invoices i LEFT JOIN LATERAL (
          SELECT sum(x.amount_minor)::bigint AS applied_minor FROM ap_supplier_payment_allocations x
          WHERE x.tenant_id=i.tenant_id AND x.invoice_id=i.id
        ) a ON true
        WHERE i.tenant_id=${workspaceId}::uuid AND i.branch_id=${branchId}::uuid AND i.status IN ('approved','partially_paid','paid')` : Promise.resolve([]),
      role && hasPermission(role, 'finance.read') ? this.prisma.$queryRaw<any[]>`
        SELECT COALESCE(sum(CASE WHEN a.account_type='revenue' AND j.entry_date BETWEEN COALESCE(${fromValue}::date,'1900-01-01') AND COALESCE(${toValue}::date,'2999-12-31') THEN l.credit_minor-l.debit_minor ELSE 0 END),0)::bigint AS revenue_minor,
          COALESCE(sum(CASE WHEN a.account_type='expense' AND j.entry_date BETWEEN COALESCE(${fromValue}::date,'1900-01-01') AND COALESCE(${toValue}::date,'2999-12-31') THEN l.debit_minor-l.credit_minor ELSE 0 END),0)::bigint AS expense_minor,
          COALESCE(sum(l.debit_minor),0)::bigint AS debits_minor,COALESCE(sum(l.credit_minor),0)::bigint AS credits_minor,
          count(DISTINCT j.id)::int AS posted_journals
        FROM ledger_journals j JOIN ledger_journal_lines l ON l.tenant_id=j.tenant_id AND l.journal_id=j.id
        JOIN ledger_accounts a ON a.tenant_id=l.tenant_id AND a.id=l.account_id
        WHERE j.tenant_id=${workspaceId}::uuid AND j.branch_id=${branchId}::uuid AND j.status='posted'` : Promise.resolve([]),
      role && hasPermission(role, 'crm.read') ? this.prisma.$queryRaw<any[]>`
        SELECT count(*) FILTER(WHERE module_id='customers')::int AS customer_records,
          count(*) FILTER(WHERE module_id='leads')::int AS leads,
          count(*) FILTER(WHERE module_id='opportunities')::int AS opportunities
        FROM module_records WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid` : Promise.resolve([]),
      role && hasPermission(role, 'finance.read') ? this.prisma.$queryRaw<any[]>`
        SELECT
          COALESCE(sum(CASE WHEN a.system_key='accounts_receivable' THEN l.debit_minor-l.credit_minor ELSE 0 END),0)::bigint AS ar_control_minor,
          COALESCE(sum(CASE WHEN a.system_key='accounts_payable' THEN l.credit_minor-l.debit_minor ELSE 0 END),0)::bigint AS ap_control_minor,
          COALESCE(sum(CASE WHEN a.system_key='inventory' THEN l.debit_minor-l.credit_minor ELSE 0 END),0)::bigint AS inventory_control_minor
        FROM ledger_journals j
        JOIN ledger_journal_lines l ON l.tenant_id=j.tenant_id AND l.journal_id=j.id
        JOIN ledger_accounts a ON a.tenant_id=l.tenant_id AND a.id=l.account_id
        WHERE j.tenant_id=${workspaceId}::uuid AND j.branch_id=${branchId}::uuid AND j.status='posted'` : Promise.resolve([]),
    ]);
    const s = salesRows[0] ?? {}; const st = stockRows[0] ?? {}; const ar = arRows[0] ?? {}; const ap = apRows[0] ?? {}; const gl = glRows[0] ?? {}; const crm = crmRows[0] ?? {}; const controls = controlRows[0] ?? {};
    const result: Record<string, unknown> = {
      period: { from: from ?? null, to: to ?? null },
      sales: { count: number(s.sales_count), grossMinor: number(s.completed_gross_minor), returnsCount: number(s.returns_count), returnsMinor: number(s.returns_minor), netSalesMinor: number(s.completed_gross_minor)-number(s.returns_minor), receiptsMinor: number(s.receipts_minor), refundsMinor: number(s.refunds_minor) },
      inventory: { trackedProducts: number(st.tracked_products), productsWithStock: number(st.products_with_stock), netUnits: number(st.net_units), inventoryCostMinor: role && hasPermission(role, 'finance.read') && st.inventory_cost_minor !== null ? number(st.inventory_cost_minor) : null, atOrBelowReorder: number(st.at_or_below_reorder), valuationBasis: 'Current movement-derived quantity multiplied by current product cost price; stock is a current snapshot, not a period movement total.' },
      sourceNotes: ['Sales and returns are flow measures from completed sales and sale_returns in the selected date range.', 'Stock on hand and cost value are current snapshots derived from stock_movements and each active tracked product’s current cost price.', 'Finance totals are shown only to roles with finance.read.', 'AR/AP are current outstanding snapshots from issued invoice and allocation ledgers; they are not historical period-end reconstructions.', 'GL balances and control accounts use posted journals only; revenue and expense flows use the selected accounting dates.', 'CRM and HR counts appear only when the plan and the current user role both permit advanced analytics; no names, employee details or compensation are included.'],
      generatedAt: new Date().toISOString(),
    };
    if (role && hasPermission(role, 'finance.read')) {
      const arOutstanding = number(ar.outstanding_minor);
      const apOutstanding = number(ap.outstanding_minor);
      const arControl = number(controls.ar_control_minor);
      const apControl = number(controls.ap_control_minor);
      result.receivables = { invoiceCount: number(ar.invoice_count), billedMinor: number(ar.billed_minor), appliedMinor: number(ar.applied_minor), outstandingMinor: arOutstanding, overdueCount: number(ar.overdue_count), overdueMinor: number(ar.overdue_minor), reconciliation: { glControlBalanceMinor: arControl, subledgerBalanceMinor: arOutstanding, differenceMinor: arControl-arOutstanding, status: arControl===arOutstanding?'matched':'review' }, balanceBasis: 'Current open invoice balances after all recorded allocations, compared with the current posted AR control account; not a historical period-end balance.' };
      result.payables = { billCount: number(ap.bill_count), billedMinor: number(ap.billed_minor), appliedMinor: number(ap.applied_minor), outstandingMinor: apOutstanding, overdueCount: number(ap.overdue_count), overdueMinor: number(ap.overdue_minor), reconciliation: { glControlBalanceMinor: apControl, subledgerBalanceMinor: apOutstanding, differenceMinor: apControl-apOutstanding, status: apControl===apOutstanding?'matched':'review' }, balanceBasis: 'Current approved bill balances after all recorded payment allocations, compared with the current posted AP control account; not a historical period-end balance.' };
      const inventoryControl = number(controls.inventory_control_minor);
      result.generalLedger = { postedJournals: number(gl.posted_journals), revenueMinor: number(gl.revenue_minor), expenseMinor: number(gl.expense_minor), debitsMinor: number(gl.debits_minor), creditsMinor: number(gl.credits_minor), trialBalanceDifferenceMinor: number(gl.debits_minor)-number(gl.credits_minor), inventoryControlBalanceMinor: inventoryControl, inventoryValuationReferenceDifferenceMinor: inventoryControl-number(st.inventory_cost_minor), balanceBasis: 'Current posted-ledger balances for this branch. Inventory difference is indicative only because the operational valuation uses current product cost, not a historical cost-layer reconstruction.' };
    }
    if (role && hasPermission(role, 'crm.read')) result.crm = { customerRecords: number(crm.customer_records), leads: number(crm.leads), opportunities: number(crm.opportunities) };
    if (advancedAnalytics && role && hasPermission(role, 'people.read')) {
      const hr = await this.prisma.$queryRaw<any[]>`
        SELECT count(*) FILTER(WHERE employment_status='active')::int AS active_employees,
          count(*)::int AS employee_records,
          (SELECT count(*)::int FROM hr_attendance h WHERE h.tenant_id=${workspaceId}::uuid AND h.branch_id=${branchId}::uuid
             AND h.attendance_date BETWEEN COALESCE(${fromValue}::date,'1900-01-01') AND COALESCE(${toValue}::date,'2999-12-31')) AS attendance_records,
          (SELECT count(*)::int FROM hr_attendance h WHERE h.tenant_id=${workspaceId}::uuid AND h.branch_id=${branchId}::uuid
             AND h.status='present' AND h.attendance_date BETWEEN COALESCE(${fromValue}::date,'1900-01-01') AND COALESCE(${toValue}::date,'2999-12-31')) AS present_records
        FROM hr_employees WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid`;
      result.people = { activeEmployees: number(hr[0]?.active_employees), employeeRecords: number(hr[0]?.employee_records), attendanceRecords: number(hr[0]?.attendance_records), presentRecords: number(hr[0]?.present_records) };
    }
    return result;
    });
  }

  @Get('reports/authoritative')
  async authoritativeReport(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string,
    @Query('from') fromValue: string | undefined, @Query('to') toValue: string | undefined, @Req() request: FastifyRequest) {
    const actor = await this.access(request, workspaceId, branchId, 'reports.read');
    if (!(await this.hasFeature(workspaceId, 'analytics.authoritative'))) throw new ForbiddenException({ code: 'FEATURE_NOT_ENTITLED', message: 'Authoritative reporting is not included in this workspace plan.' });
    const from = dateOnly(fromValue, 'from'); const to = dateOnly(toValue, 'to');
    if (from && to && from > to) throw new BadRequestException('The report start date must not be after the end date.');
    const branch = actor.branch;
    const advancedAnalytics = await this.hasFeature(workspaceId, 'analytics.advanced');
    return { ...(await this.aggregate(workspaceId, branchId, from, to, actor.role, advancedAnalytics)), currency: branch.currency, timezone: branch.timezone, assurance: 'Calculated from LEXA operational and posted-ledger records. No generic module JSON amount fields are used.' };
  }

  @Get('reports/library')
  async reportLibrary(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,
    @Query('from') fromInput:string|undefined,@Query('to') toInput:string|undefined,@Req() request:FastifyRequest){
    const actor=await this.access(request,workspaceId,branchId,'reports.read');
    if(!(await this.hasFeature(workspaceId,'analytics.authoritative')))throw new ForbiddenException({code:'FEATURE_NOT_ENTITLED',message:'Reports not included for this workspace.'});
    const now=new Intl.DateTimeFormat('sv-SE',{timeZone:actor.branch.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const from=dateOnly(fromInput,'from')??new Date(Date.parse(now+'T00:00:00Z')-29*86400000).toISOString().slice(0,10);
    const to=dateOnly(toInput,'to')??now;
    try{daysInPeriod(from,to);}catch{throw new BadRequestException('Choose 1–366 days for your report.');}
    const base=await this.aggregate(workspaceId,branchId,from,to,actor.role,await this.hasFeature(workspaceId,'analytics.advanced'));
    return this.reportInsights.build(workspaceId,branchId,from,to,actor.branch.timezone,actor.branch.currency,actor.role,base);
  }
  @Get('intelligence/brief')
  async brief(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Req() request:FastifyRequest){
    const actor=await this.access(request,workspaceId,branchId,'intelligence.read');
    if(!(await this.hasFeature(workspaceId,'analytics.authoritative')))throw new ForbiddenException({code:'FEATURE_NOT_ENTITLED'});
    const facts=await this.aggregate(workspaceId,branchId,undefined,undefined,actor.role,false);
    const s=facts.sales as Record<string,unknown>??{},i=facts.inventory as Record<string,unknown>??{};
    const observations:string[]=[];
    if(Number(s.count??0)>0)observations.push('Completed sales: '+Number(s.count).toLocaleString('en-UG')+'. Net sales: '+actor.branch.currency+' '+Number(s.netSalesMinor??0).toLocaleString('en-UG')+'.');
    else observations.push('No completed sales are recorded yet. Record genuine transactions to unlock sales insights.');
    if(hasPermission(actor.role,'inventory.read')&&Number(i.atOrBelowReorder??0)>0)observations.push(Number(i.atOrBelowReorder)+' products are at or below reorder levels.');
    const ar=facts.receivables as Record<string,unknown>|undefined;
    if(hasPermission(actor.role,'finance.read')&&Number(ar?.overdueMinor??0)>0)observations.push('Some customer invoices are overdue; review receivables and payment dates.');
    return {mode:'automated',generatedAt:new Date().toISOString(),observations,sources:['Completed sales and returns','Stock movements','Authorized outstanding balances'],notice:'Calculated directly from LEXA records; not a response generated by an AI model.'};
  }

  @Get('saas/plans')
  async planCatalogue(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() request: FastifyRequest) {
    await this.access(request, workspaceId, branchId, 'saas.read');
    const plans = await this.prisma.$queryRaw<any[]>`
      SELECT p.plan_key,p.display_name,p.max_users,p.max_branches,p.ai_requests_monthly,p.ai_budget_micros_monthly,
        COALESCE(jsonb_object_agg(f.feature_key,f.enabled) FILTER(WHERE f.feature_key IS NOT NULL),'{}'::jsonb) AS features
      FROM saas_plans p LEFT JOIN saas_plan_features f ON f.plan_key=p.plan_key
      WHERE p.active=true GROUP BY p.plan_key ORDER BY CASE p.plan_key WHEN 'starter' THEN 1 WHEN 'growth' THEN 2 WHEN 'professional' THEN 3 ELSE 4 END`;
    return { plans: plans.map((plan) => ({ ...plan, ai_budget_micros_monthly: number(plan.ai_budget_micros_monthly) })), billing: 'Plan limits and entitlements are enforced by the LEXA backend. Online payments and automated subscription renewal are not enabled by this workstream.' };
  }

  @Get('saas/entitlements')
  async entitlements(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() request: FastifyRequest) {
    await this.access(request, workspaceId, branchId, 'saas.read');
    await this.rollBillingPeriod(workspaceId);
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT s.plan_key,s.status,s.current_period_start,s.current_period_end,p.display_name,p.max_users,p.max_branches,
        p.ai_requests_monthly,p.ai_budget_micros_monthly,
        (SELECT count(*)::int FROM memberships m WHERE m.tenant_id=s.tenant_id AND m.status='ACTIVE') AS active_users,
        (SELECT count(*)::int FROM branches b WHERE b.tenant_id=s.tenant_id) AS active_branches,
        COALESCE(jsonb_object_agg(f.feature_key,COALESCE(o.enabled,f.enabled)) FILTER(WHERE f.feature_key IS NOT NULL),'{}'::jsonb) AS features
      FROM tenant_subscriptions s JOIN saas_plans p ON p.plan_key=s.plan_key
      LEFT JOIN saas_plan_features f ON f.plan_key=s.plan_key
      LEFT JOIN tenant_feature_overrides o ON o.tenant_id=s.tenant_id AND o.feature_key=f.feature_key AND (o.expires_at IS NULL OR o.expires_at>now())
      WHERE s.tenant_id=${workspaceId}::uuid GROUP BY s.tenant_id,p.plan_key`;
    if (!rows.length) throw new ServiceUnavailableException('SaaS plan configuration is not available. Apply the Workstream 8 database migration.');
    const subscription = { ...rows[0], ai_budget_micros_monthly: number(rows[0].ai_budget_micros_monthly), active_users: number(rows[0].active_users), active_branches: number(rows[0].active_branches) };
    return { subscription, features: subscription.features };
  }

  @Get('saas/usage')
  async usage(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() request: FastifyRequest) {
    await this.access(request, workspaceId, branchId, 'saas.read');
    await this.rollBillingPeriod(workspaceId);
    if (!(await this.hasFeature(workspaceId, 'saas.usage_view'))) throw new ForbiddenException({ code: 'FEATURE_NOT_ENTITLED', message: 'Usage visibility is not enabled for this workspace.' });
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT u.meter_key,u.period_start,u.quantity,u.amount_micros,u.updated_at
      FROM tenant_usage_counters u JOIN tenant_subscriptions s ON s.tenant_id=u.tenant_id
      WHERE u.tenant_id=${workspaceId}::uuid AND u.period_start=s.current_period_start ORDER BY u.meter_key`;
    const recent = await this.prisma.$queryRaw<any[]>`
      SELECT period_start,purpose,data_class,status,provider,model_alias,provider_model,input_tokens,output_tokens,reserved_micros,reported_cost_micros,created_at
      FROM ai_usage_events WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid
      ORDER BY created_at DESC LIMIT 20`;
    const subscription = await this.prisma.$queryRaw<any[]>`SELECT current_period_start,current_period_end FROM tenant_subscriptions WHERE tenant_id=${workspaceId}::uuid LIMIT 1`;
    return { periodStart: subscription[0]?.current_period_start ?? null, periodEnd: subscription[0]?.current_period_end ?? null,
      meters: rows.map((row) => ({ ...row, quantity: number(row.quantity), amount_micros: number(row.amount_micros) })),
      recentAiActivity: recent.map((row) => ({ ...row, input_tokens: number(row.input_tokens), output_tokens: number(row.output_tokens), reserved_micros: number(row.reserved_micros), reported_cost_micros: row.reported_cost_micros === null ? null : number(row.reported_cost_micros) })), contentLogging: 'Prompt and response content is never stored in LEXA usage records. The AI meter reserves a conservative per-request budget, then settles to the native router reported cost; failures retain the reserve.' };
  }

  @Get('saas/support-diagnostics')
  async supportDiagnostics(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() request: FastifyRequest) {
    const actor = await this.access(request, workspaceId, branchId, 'support.read');
    if (!isWorkspaceAdministrator(actor.role) && !hasPermission(actor.role, 'support.write')) throw new ForbiddenException('Support diagnostics require an administrator or authorised support operator.');
    await this.prisma.$executeRaw`INSERT INTO tenant_support_access_audit(tenant_id,actor_user_id,access_type,reason,metadata)
      VALUES(${workspaceId}::uuid,${actor.userId}::uuid,'diagnostics','Workspace administrator opened the tenant support diagnostics view.','{"scope":"tenant_metadata_only"}'::jsonb)`;
    const counts = await this.prisma.$queryRaw<any[]>`
      SELECT (SELECT count(*)::int FROM memberships WHERE tenant_id=${workspaceId}::uuid AND status='ACTIVE') AS active_members,
        (SELECT count(*)::int FROM branches WHERE tenant_id=${workspaceId}::uuid) AS branches,
        (SELECT count(*)::int FROM ai_usage_events WHERE tenant_id=${workspaceId}::uuid AND created_at>now()-interval '30 days') AS ai_requests_30d,
        (SELECT count(*)::int FROM ai_usage_events WHERE tenant_id=${workspaceId}::uuid AND status='failed' AND created_at>now()-interval '30 days') AS ai_failures_30d`;
    return { diagnostics: counts[0] ?? {}, access: 'Tenant-scoped metadata only. No cross-tenant customer records or credentials are exposed.' };
  }

  @Put('saas/features/:featureKey')
  @UseGuards(CsrfGuard)
  async setFeatureOverride(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string,
    @Param('featureKey') featureKey: string, @Body() body: any, @Req() request: FastifyRequest) {
    const actor = await this.access(request, workspaceId, branchId, 'saas.manage');
    if (!isWorkspaceAdministrator(actor.role)) throw new ForbiddenException('Only a workspace owner or administrator can manage feature overrides.');
    if (!(await this.hasFeature(workspaceId, 'saas.feature_management'))) throw new ForbiddenException({ code: 'FEATURE_NOT_ENTITLED', message: 'Feature management is available on the Enterprise plan.' });
    const allowed = new Set(['analytics.advanced','intelligence.explain','intelligence.document_extract','saas.usage_view']);
    if (!allowed.has(featureKey)) throw new BadRequestException('This feature cannot be changed through a workspace override.');
    if (typeof body?.enabled !== 'boolean') throw new BadRequestException('enabled must be true or false.');
    const reason = safeText(body?.reason, 'Change reason', 500);
    const expiresAt = body?.expiresAt ? new Date(String(body.expiresAt)) : null;
    if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date() || expiresAt.getTime() > Date.now() + 366*86400_000)) throw new BadRequestException('expiresAt must be a future date within one year.');
    return this.prisma.$transaction(async (tx: any) => {
      const rows = await tx.$queryRaw<any[]>`
        INSERT INTO tenant_feature_overrides(tenant_id,feature_key,enabled,reason,expires_at,updated_by_user_id)
        VALUES(${workspaceId}::uuid,${featureKey},${body.enabled},${reason},${expiresAt},${actor.userId}::uuid)
        ON CONFLICT(tenant_id,feature_key) DO UPDATE SET enabled=EXCLUDED.enabled,reason=EXCLUDED.reason,
          expires_at=EXCLUDED.expires_at,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()
        RETURNING feature_key,enabled,reason,expires_at,updated_at`;
      await tx.$executeRaw`
        INSERT INTO audit_events(id,tenant_id,branch_id,actor_user_id,action,resource_type,resource_id,metadata)
        VALUES(gen_random_uuid(),${workspaceId}::uuid,${branchId}::uuid,${actor.userId}::uuid,'saas.feature.override','tenant_feature_override',${featureKey},${JSON.stringify({ enabled: body.enabled, reason, expiresAt: expiresAt?.toISOString() ?? null })}::jsonb)`;
      return rows[0];
    });
  }

  private async reserveAi(tenantId: string, branchId: string, actorUserId: string, requestId: string, purpose: 'business_explanation'|'document_extraction', dataClass: 'public'|'internal_aggregate'|'confidential_aggregate'|'restricted', modelAlias: string | null) {
    const reservedMicros = dataClass === 'confidential_aggregate' || dataClass === 'public' ? AI_RESERVATION_MICROS : 0;
    return this.prisma.runWithTenantContext({ tenantId, userId: actorUserId }, () => this.prisma.$transaction(async (tx: any) => {
      const plans = await tx.$queryRaw<any[]>`
        SELECT p.ai_requests_monthly,p.ai_budget_micros_monthly,s.status,s.current_period_start
        FROM tenant_subscriptions s JOIN saas_plans p ON p.plan_key=s.plan_key
        WHERE s.tenant_id=${tenantId}::uuid FOR UPDATE OF s`;
      const plan = plans[0];
      if (!plan || !['active','trialing'].includes(String(plan.status))) throw new ForbiddenException({ code: 'SUBSCRIPTION_INACTIVE', message: 'AI features are unavailable while this subscription is inactive.' });
      await tx.$executeRaw`
        WITH RECURSIVE next_period(period_start,period_end) AS (
          SELECT current_period_start,current_period_end FROM tenant_subscriptions
          WHERE tenant_id=${tenantId}::uuid AND current_period_end<=CURRENT_DATE
          UNION ALL
          SELECT period_end,(period_end+interval '1 month')::date FROM next_period
          WHERE period_end<=CURRENT_DATE
        )
        UPDATE tenant_subscriptions SET
          current_period_start=(SELECT period_start FROM next_period ORDER BY period_end DESC LIMIT 1),
          current_period_end=(SELECT period_end FROM next_period ORDER BY period_end DESC LIMIT 1),
          updated_at=now()
        WHERE tenant_id=${tenantId}::uuid AND current_period_end<=CURRENT_DATE`;
      const refreshed = await tx.$queryRaw<any[]>`SELECT current_period_start FROM tenant_subscriptions WHERE tenant_id=${tenantId}::uuid`;
      const period = refreshed[0]?.current_period_start ?? plan.current_period_start;
      const counters = await tx.$queryRaw<any[]>`
        INSERT INTO tenant_usage_counters(tenant_id,meter_key,period_start,quantity,amount_micros)
        SELECT ${tenantId}::uuid,'ai',${period}::date,1,${reservedMicros}
        WHERE ${number(plan.ai_requests_monthly)}>=1 AND ${number(plan.ai_budget_micros_monthly)}>=${reservedMicros}
        ON CONFLICT(tenant_id,meter_key,period_start) DO UPDATE SET quantity=tenant_usage_counters.quantity+1,
          amount_micros=tenant_usage_counters.amount_micros+${reservedMicros},updated_at=now()
        WHERE tenant_usage_counters.quantity<${number(plan.ai_requests_monthly)}
          AND tenant_usage_counters.amount_micros+${reservedMicros}<=${number(plan.ai_budget_micros_monthly)}
        RETURNING quantity,amount_micros`;
      if (!counters.length) {
        const current = await tx.$queryRaw<Array<{quantity: bigint; amount_micros: bigint}>>`
          SELECT quantity,amount_micros FROM tenant_usage_counters
          WHERE tenant_id=${tenantId}::uuid AND meter_key='ai' AND period_start=${period}::date`;
        const used = Number(current[0]?.quantity ?? 0);
        const reserved = Number(current[0]?.amount_micros ?? 0);
        const quotaReached = number(plan.ai_requests_monthly) < 1 || used >= number(plan.ai_requests_monthly)
          || reserved + reservedMicros > number(plan.ai_budget_micros_monthly);
        if (quotaReached) throw new ForbiddenException({ code: 'AI_USAGE_LIMIT_REACHED', message: 'Your business assistant allowance is full for this period.' });
        throw new ServiceUnavailableException({ code: 'AI_USAGE_RECORD_UNAVAILABLE', message: 'The business assistant could not record this request. Please try again.' });
      }
      const event = await tx.$queryRaw<any[]>`
        INSERT INTO ai_usage_events(tenant_id,branch_id,actor_user_id,request_id,period_start,purpose,data_class,provider,model_alias,status,reserved_micros,correlation_id)
        VALUES(${tenantId}::uuid,${branchId}::uuid,${actorUserId}::uuid,${requestId},${period}::date,${purpose},${dataClass},${modelAlias ? providerForAlias(modelAlias) : null},${modelAlias},'reserved',${reservedMicros},${requestId})
        RETURNING id::text`;
      return { eventId: event[0].id, quantity: number(counters[0].quantity), reservedMicros };
    }));
  }

  private async completeAi(tenantId: string, eventId: string, status: 'succeeded'|'failed', values: { inputTokens?: number; outputTokens?: number; latencyMs?: number; policyCode?: string; reportedCostMicros?: number | null; providerModel?: string | null }) {
    await this.prisma.runWithTenantContext({ tenantId }, () => this.prisma.$transaction(async (tx: any) => {
      const events = await tx.$queryRaw<any[]>`
        UPDATE ai_usage_events SET status=${status},input_tokens=${Math.max(0,Math.floor(values.inputTokens ?? 0))},
          output_tokens=${Math.max(0,Math.floor(values.outputTokens ?? 0))},latency_ms=${values.latencyMs ?? null},
          policy_code=${values.policyCode ?? null},reported_cost_micros=${values.reportedCostMicros ?? null},provider_model=${values.providerModel?.slice(0,120) ?? null},completed_at=now()
        WHERE id=${eventId}::uuid AND tenant_id=${tenantId}::uuid AND status='reserved'
        RETURNING period_start,reserved_micros`;
      const event=events[0];
      if (event && status === 'failed') {
        // A failed provider request is not a successfully delivered Intelligence answer.
        // Release both the request slot and the reserved free-tier allowance atomically.
        await tx.$executeRaw`
          UPDATE tenant_usage_counters SET quantity=GREATEST(0,quantity-1),
            amount_micros=GREATEST(0,amount_micros-${number(event.reserved_micros)}),updated_at=now()
          WHERE tenant_id=${tenantId}::uuid AND meter_key='ai' AND period_start=${event.period_start}::date`;
      }
      if (event && status==='succeeded' && values.reportedCostMicros !== null && values.reportedCostMicros !== undefined) {
        const actual=Math.max(0,Math.floor(values.reportedCostMicros));
        await tx.$executeRaw`
          UPDATE tenant_usage_counters SET amount_micros=GREATEST(0,amount_micros-${number(event.reserved_micros)}+${actual}),updated_at=now()
          WHERE tenant_id=${tenantId}::uuid AND meter_key='ai' AND period_start=${event.period_start}::date`;
      }
    }));
  }

  @Get('intelligence/status')
  async intelligenceStatus(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() request: FastifyRequest) {
    const actor = await this.access(request, workspaceId, branchId, 'intelligence.run');
    const enabled = process.env.LEXA_AI_ENABLED === 'true';
    const router = this.aiRouter.status();
    const canManageFeatures = isWorkspaceAdministrator(actor.role) && await this.hasFeature(workspaceId, 'saas.feature_management');
    const canViewSupportDiagnostics = isWorkspaceAdministrator(actor.role) || hasPermission(actor.role, 'support.write');
    const entitled = await this.hasFeature(workspaceId, 'intelligence.explain');
    const canRun = hasPermission(actor.role, 'intelligence.run');
    const serviceConfigured = router.configured;
    const businessAvailable = enabled; // Built-in business analyses do not require a model provider.
    // Compatibility fields for older clients. LEXA now exposes one business assistant and one provider router.
    const publicHelpAvailable = enabled;
    const businessReady = enabled && entitled; // Built-in business calculations also work without an external model.
    return {
      enabled: businessReady,
      serviceConfigured,
      entitled,
      canRun,
      canRunBusiness: canRun && businessReady,
      canRunHelp: canRun && businessReady,
      canExtract: false,
      businessAvailable,
      publicHelpAvailable,
      providersAvailable: router.providers,
      paidTierEnabled: router.paidTierEnabled,
      canManageFeatures,
      canViewSupportDiagnostics,
      availability: businessReady ? 'available_on_request' : 'unavailable',
      coreLexaImpact: 'none',
      explanation: businessReady
        ? 'LEXA is ready to help with business records and approved actions.'
        : 'LEXA Intelligence is unavailable for this business account.',
    };
  }

  @Post('intelligence/explain')
  @UseGuards(CsrfGuard)
  async explain(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Body() body: any, @Req() request: FastifyRequest) {
    const actor = await this.access(request, workspaceId, branchId, 'intelligence.run');
    if (process.env.LEXA_AI_ENABLED !== 'true') throw new ServiceUnavailableException({ code: 'INTELLIGENCE_UNAVAILABLE', message: 'LEXA Intelligence is not currently enabled.' });
    if (!(await this.hasFeature(workspaceId, 'intelligence.explain'))) throw new ForbiddenException({ code: 'FEATURE_NOT_ENTITLED', message: 'LEXA AI is not included in this workspace plan.' });
    const question = safeText(body?.question, 'Business question', AI_MAX_INPUT_CHARS);
    const sensitiveQuestion = /\b(?:salary|payroll|employee name|customer name|personal details|phone number|email address|bank account|account number|national id|passport|medical record|password|api key|specific employee|specific customer|individual record)\b/i.test(question)
      || /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(question)
      || /(?:\+?\d[\d ().-]{7,}\d)/.test(question);
    if (sensitiveQuestion) throw new BadRequestException('LEXA AI can analyse aggregate business information, but it cannot process individual personal, payroll, identity or credential details.');
    const scope = (['overview','sales','inventory','finance','customers','people'].includes(body?.scope) ? body.scope : 'overview') as Scope;
    if (scope === 'finance' && !hasPermission(actor.role, 'finance.read')) throw new ForbiddenException('Your role cannot request finance explanations.');
    if (scope === 'people' && !hasPermission(actor.role, 'people.read')) throw new ForbiddenException('Your role cannot request workforce summaries.');
    if (scope === 'customers' && !hasPermission(actor.role, 'crm.read')) throw new ForbiddenException('Your role cannot request customer summaries.');
    const advancedAnalytics = await this.hasFeature(workspaceId, 'analytics.advanced');
    if ((scope === 'customers' || scope === 'people') && !advancedAnalytics) throw new ForbiddenException({ code: 'FEATURE_NOT_ENTITLED', message: 'Customer and workforce summaries require the advanced analytics entitlement.' });
    const requestId = randomUUID();
    const firstReply = businessPreflight(question);
    if (firstReply) return { answer: firstReply, scope, requestId, mode: 'business', usage: { inputTokens: 0, outputTokens: 0, reservedBudgetMicros: 0 } };
    const facts = await this.aggregate(workspaceId, branchId, undefined, undefined, actor.role, advancedAnalytics);
    const allowedFacts: Record<string, unknown> = scope === 'sales' ? { sales: facts.sales }
      : scope === 'inventory' ? { inventory: facts.inventory }
      : scope === 'finance' ? { sales: facts.sales, receivables: facts.receivables, payables: facts.payables, generalLedger: facts.generalLedger }
      : scope === 'customers' ? { crm: facts.crm ?? {} }
      : scope === 'people' ? { people: facts.people ?? {} }
      : facts;
    if (classifyWorkload(question) === 'complex') return {
      answer: 'This request requires a detailed paid analysis. No paid service has been used or charged. Contact LEXA to authorize a separate review.',
      scope, requestId, mode: 'paid_inquiry',
      usage: { inputTokens: 0, outputTokens: 0, reservedBudgetMicros: 0 },
    };
    const quick = await quickOperationalAnswer({ question, scope, facts: allowedFacts, currency: actor.branch.currency });
    if (quick) return { answer: professionalAnswer(quick, scope), scope, requestId, mode: 'calculated', usage: { inputTokens: 0, outputTokens: 0, reservedBudgetMicros: 0 } };
    if (!this.aiRouter.status().configured) throw new ServiceUnavailableException({ code: 'AI_PROVIDER_UNAVAILABLE', message: 'Live business analysis is temporarily unavailable. Stock, sales and other recorded totals remain available.' });
    const reservation = await this.reserveAi(workspaceId, branchId, actor.userId, requestId, 'business_explanation', 'confidential_aggregate', FREE_MODEL_ALIAS);
    const started = Date.now();
    try {
      const result = await this.aiRouter.complete({ requestId, question, scope, currency: actor.branch.currency, facts: allowedFacts });
      await this.completeAi(workspaceId, reservation.eventId, 'succeeded', {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: Date.now() - started,
        reportedCostMicros: result.costMicros,
        providerModel: `${result.provider}:${result.model}`,
      });
      return {
        answer: professionalAnswer(result.answer, scope),
        scope,
        assurance: 'Based on permission-filtered LEXA business aggregates. Individual customer and employee records are excluded. AI is read-only and cannot post or change ERP records.',
        requestId,
        usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, reservedBudgetMicros: reservation.reservedMicros, provider: result.provider, model: result.model },
      };
    } catch {
      await this.completeAi(workspaceId, reservation.eventId, 'failed', { latencyMs: Date.now() - started, policyCode: 'AI_PROVIDER_FALLBACKS_EXHAUSTED' });
      throw new ServiceUnavailableException({ code: 'INTELLIGENCE_UNAVAILABLE', message: 'LEXA could not reach an available AI provider. Your business records and core workflows are unaffected.', requestId });
    }
  }

  // Backward-compatible route: old clients are redirected to the same business assistant.
  @Post('intelligence/help')
  @UseGuards(CsrfGuard)
  async productHelp(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Body() body: any, @Req() request: FastifyRequest) {
    return this.explain(workspaceId, branchId, { question: body?.question, scope: 'overview' }, request);
  }

  @Post('intelligence/extract')
  @UseGuards(CsrfGuard)
  async extractDocument(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Body() _body: any, @Req() request: FastifyRequest) {
    await this.access(request, workspaceId, branchId, 'intelligence.run');
    if (!(await this.hasFeature(workspaceId, 'intelligence.document_extract'))) throw new ForbiddenException({ code: 'FEATURE_NOT_ENTITLED', message: 'Document extraction is not included in this workspace plan.' });
    throw new ServiceUnavailableException({ code: 'DOCUMENT_EXTRACTION_NOT_ENABLED', message: 'Document extraction will be enabled in a later production phase. LEXA AI business responses are available independently.' });
  }
}
