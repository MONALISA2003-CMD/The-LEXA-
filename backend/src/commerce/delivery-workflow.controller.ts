import {
  BadRequestException, ConflictException, Controller, ForbiddenException, Get,
  NotFoundException, Param, Post, Patch, Body, Req, Query, UseGuards, UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertBranchAccess } from '../authorization/branch-scope';
import { hasPermission } from '../authorization/role-policy';
import { postLedgerJournal, settlementAccountKey } from '../general-ledger/ledger-posting';
import { CsrfGuard } from '../core/csrf.guard';
import { dispatchableQuantity, isValidDeliveryTransition, outstandingSaleMinor, remainingCollectionMinor } from './increment1-rules';

type Obj = Record<string, unknown>;
type RequestBody = FastifyRequest & { body?: unknown };
type Tx = any;

const PAYMENT_CATEGORIES = new Set(['cash', 'mobile_money', 'bank_transfer', 'card', 'cheque', 'other']);
const DELIVERY_METHODS = new Set(['business_rider', 'independent_rider', 'bus', 'transport_company', 'courier_manual', 'customer_pickup', 'business_employee', 'other']);
const AGENT_TYPES = new Set(['employee', 'internal_rider', 'independent_rider', 'bus_operator', 'transport_partner', 'courier_contact', 'other']);
const INITIAL_STATUSES = new Set(['prepared', 'assigned', 'picked_up', 'in_transit', 'delivered', 'delivery_failed', 'return_pending', 'returned', 'cancelled', 'dispatched']);

function cookie(request: FastifyRequest, name: string): string | undefined {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at >= 0 && part.slice(0, at).trim() === name) {
      try { return decodeURIComponent(part.slice(at + 1).trim()); } catch { return undefined; }
    }
  }
  return undefined;
}
function hash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function object(value: unknown, label = 'Request'): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException(`${label} must be an object.`);
  return value as Obj;
}
function string(value: unknown, label: string, max = 180, optional = false): string | undefined {
  if ((value === undefined || value === null || value === '') && optional) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`${label} is required and must be at most ${max} characters.`);
  return value.trim();
}
function uuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new BadRequestException(`${label} is invalid.`);
  return value;
}
function minor(value: unknown, label: string, allowZero = false): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(n) || n < (allowZero ? 0 : 1) || n > 2_000_000_000) throw new BadRequestException(`${label} must be a valid amount in minor currency units.`);
  return n;
}
function quantity(value: unknown, label = 'Quantity'): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000 || Math.round(n * 1000) !== n * 1000) throw new BadRequestException(`${label} must be greater than zero with at most three decimal places.`);
  return n;
}
function optionalDate(value: unknown, label: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${label} must use YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new BadRequestException(`${label} is not a valid date.`);
  return parsed;
}
function timestamp(value: unknown, label = 'Event time'): Date {
  if (value === undefined || value === null || value === '') return new Date();
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new BadRequestException(`${label} must be a valid ISO date/time.`);
  return new Date(value);
}
function methodForCategory(category: string): string {
  if (category === 'card') return 'card';
  return category;
}
function doc(prefix: string) { return `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(4).toString('hex').toUpperCase()}`; }

@Controller('workspaces/:workspaceId/branches/:branchId/commerce')
export class DeliveryWorkflowController {
  constructor(private readonly prisma: PrismaService) {}

  private async access(request: FastifyRequest, workspaceId: string, branchId: string) {
    const token = cookie(request, 'lexa_session');
    if (!token) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Sign in to continue.' });
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = await this.prisma.session.findFirst({ where: { tokenHash, expiresAt: { gt: new Date() } }, select: { userId: true } });
    if (!session) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Sign in again.' });
    // Restore verified business context for this controller, even on read-only routes.
    // A matching active membership and business location are still required below.
    this.prisma.enterTenantContext(workspaceId, session.userId);
    const membership = await this.prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: workspaceId, userId: session.userId } } });
    if (!membership || membership.status !== 'ACTIVE') throw new NotFoundException('Workspace not found.');
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId: workspaceId }, select: { id: true } });
    if (!branch) throw new NotFoundException('Branch not found.');
    await assertBranchAccess(this.prisma, workspaceId, branchId, session.userId, membership.role);
    return { userId: session.userId, role: membership.role };
  }

  private async idem(tx: Tx, tenantId: string, key: string, requestHash: string) {
    const existing = await tx.idempotencyRecord.findUnique({ where: { tenantId_key: { tenantId, key } } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This request key was used with a different payload.' });
      if (existing.status === 'COMPLETED' && existing.responseBody) return existing.responseBody;
      throw new ConflictException({ code: 'REQUEST_IN_PROGRESS', message: 'This request is already being processed.' });
    }
    await tx.idempotencyRecord.create({ data: { tenantId, key, requestHash, status: 'IN_PROGRESS', expiresAt: new Date(Date.now() + 86_400_000) } });
    return null;
  }

  private async finishIdem(tx: Tx, tenantId: string, key: string, response: unknown, status = 201) {
    await tx.idempotencyRecord.update({ where: { tenantId_key: { tenantId, key } }, data: { status: 'COMPLETED', responseStatus: status, responseBody: response as any } });
  }

  private async audit(tx: Tx, tenantId: string, branchId: string, actorId: string, action: string, resourceType: string, resourceId: string, metadata: Obj = {}) {
    await tx.auditEvent.create({ data: { tenantId, branchId, actorUserId: actorId, action, resourceType, resourceId, metadata: metadata as any } });
  }

  private async emitOutbox(tx: Tx, tenantId: string, branchId: string, moduleId: string, recordId: string, eventType: string, payload: Obj, actorId: string, dedupeKey: string) {
    await tx.$executeRaw`INSERT INTO module_domain_events
      (id, tenant_id, branch_id, module_id, record_id, event_type, payload, dedupe_key, actor_user_id)
      VALUES (${randomUUID()}::uuid, ${tenantId}::uuid, ${branchId}::uuid, ${moduleId}, ${recordId}, ${eventType},
        ${JSON.stringify(payload)}::jsonb, ${dedupeKey}, ${actorId}::uuid)
      ON CONFLICT (tenant_id, dedupe_key) DO NOTHING`;
  }

  private idempotencyKey(request: FastifyRequest, label: string) {
    const raw = request.headers['idempotency-key'];
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (!key || key.length > 200) throw new BadRequestException(`Idempotency-Key header is required for ${label}.`);
    return key;
  }

  @Get('delivery-agents')
  async listAgents(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Query('includeInactive') includeInactive: string | undefined, @Req() request: FastifyRequest) {
    await this.access(request, workspaceId, branchId);
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT id, display_name AS "displayName", phone, agent_type AS "agentType",
        transport_description AS "transportDescription", employee_record_id AS "employeeRecordId",
        active, notes, default_branch_id AS "defaultBranchId", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM commerce_delivery_agents
      WHERE tenant_id = ${workspaceId}::uuid AND (default_branch_id IS NULL OR default_branch_id = ${branchId}::uuid)
        AND (${includeInactive === 'true'} OR active = true)
      ORDER BY active DESC, display_name ASC LIMIT 500`;
    return rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString() }));
  }

  @Get('payment-report')
  async paymentReport(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Query('from') fromRaw: string | undefined,
    @Query('to') toRaw: string | undefined,
    @Req() request: FastifyRequest,
  ) {
    const actor = await this.access(request, workspaceId, branchId);
    if (!hasPermission(actor.role, 'sales.read')) throw new ForbiddenException('You do not have permission to view sales payment reports.');
    const from = optionalDate(fromRaw, 'From date');
    const to = optionalDate(toRaw, 'To date');
    if (from && to && from > to) throw new BadRequestException('From date must be on or before to date.');
    const fromDate = from ? from.toISOString().slice(0, 10) : null;
    const toDate = to ? to.toISOString().slice(0, 10) : null;
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId: workspaceId }, select: { timezone: true, currency: true } });
    if (!branch) throw new NotFoundException('Branch not found.');
    const timezone = branch.timezone || 'Africa/Kampala';
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const [salesRows, returnRows, paymentRows, creditRows] = await Promise.all([
      this.prisma.$queryRaw<any[]>`SELECT COUNT(*)::int AS count, COALESCE(SUM(total_minor),0)::bigint AS total_minor
        FROM sales s WHERE s.tenant_id=${workspaceId}::uuid AND s.branch_id=${branchId}::uuid
          AND (${fromDate}::date IS NULL OR (s.created_at AT TIME ZONE ${timezone})::date >= ${fromDate}::date)
          AND (${toDate}::date IS NULL OR (s.created_at AT TIME ZONE ${timezone})::date <= ${toDate}::date)`,
      this.prisma.$queryRaw<any[]>`SELECT COUNT(*)::int AS count, COALESCE(SUM(r.total_minor),0)::bigint AS total_minor
        FROM sale_returns r JOIN sales s ON s.tenant_id=r.tenant_id AND s.id=r.sale_id
        WHERE r.tenant_id=${workspaceId}::uuid AND s.branch_id=${branchId}::uuid
          AND (${fromDate}::date IS NULL OR (r.created_at AT TIME ZONE ${timezone})::date >= ${fromDate}::date)
          AND (${toDate}::date IS NULL OR (r.created_at AT TIME ZONE ${timezone})::date <= ${toDate}::date)`,
      this.prisma.$queryRaw<any[]>`SELECT p.kind, p.method_category AS "methodCategory",
          NULLIF(BTRIM(p.method_label), '') AS "methodLabel",
          COALESCE(u.display_name, u.email, 'Unknown / legacy actor') AS "recordedByName",
          COUNT(*)::int AS count, COALESCE(SUM(p.amount_minor),0)::bigint AS "amountMinor"
        FROM sale_payments p JOIN sales s ON s.tenant_id=p.tenant_id AND s.id=p.sale_id
        LEFT JOIN users u ON u.id=p.recorded_by_user_id
        WHERE p.tenant_id=${workspaceId}::uuid AND s.branch_id=${branchId}::uuid
          AND (${fromDate}::date IS NULL OR (COALESCE(p.recorded_at,p.created_at) AT TIME ZONE ${timezone})::date >= ${fromDate}::date)
          AND (${toDate}::date IS NULL OR (COALESCE(p.recorded_at,p.created_at) AT TIME ZONE ${timezone})::date <= ${toDate}::date)
        GROUP BY p.kind, p.method_category, NULLIF(BTRIM(p.method_label), ''), COALESCE(u.display_name, u.email, 'Unknown / legacy actor')
        ORDER BY p.method_category, NULLIF(BTRIM(p.method_label), ''), p.kind, "recordedByName"`,
      this.prisma.$queryRaw<any[]>`WITH balances AS (
          SELECT s.id, s.receipt_number, s.customer_name, s.customer_phone, s.promised_payment_date,
            GREATEST(0, s.total_minor
              - COALESCE((SELECT SUM(r.total_minor) FROM sale_returns r WHERE r.tenant_id=s.tenant_id AND r.sale_id=s.id),0)
              - COALESCE((SELECT SUM(p.amount_minor) FROM sale_payments p WHERE p.tenant_id=s.tenant_id AND p.sale_id=s.id AND p.kind='receipt'),0)
              + COALESCE((SELECT SUM(p.amount_minor) FROM sale_payments p WHERE p.tenant_id=s.tenant_id AND p.sale_id=s.id AND p.kind='refund'),0)
            )::bigint AS outstanding_minor
          FROM sales s WHERE s.tenant_id=${workspaceId}::uuid AND s.branch_id=${branchId}::uuid AND s.status='completed'
        )
        SELECT COALESCE(SUM(outstanding_minor),0)::bigint AS "outstandingMinor",
          COUNT(*) FILTER (WHERE outstanding_minor>0)::int AS "creditSalesCount",
          COALESCE(SUM(outstanding_minor) FILTER (WHERE outstanding_minor>0 AND promised_payment_date < ${today}::date),0)::bigint AS "overdueMinor",
          COUNT(*) FILTER (WHERE outstanding_minor>0 AND promised_payment_date < ${today}::date)::int AS "overdueCount",
          COALESCE(SUM(outstanding_minor) FILTER (WHERE outstanding_minor>0 AND promised_payment_date >= ${today}::date),0)::bigint AS "notDueMinor",
          COUNT(*) FILTER (WHERE outstanding_minor>0 AND promised_payment_date >= ${today}::date)::int AS "notDueCount",
          COALESCE(SUM(outstanding_minor) FILTER (WHERE outstanding_minor>0 AND promised_payment_date IS NULL),0)::bigint AS "noDueDateMinor",
          COUNT(*) FILTER (WHERE outstanding_minor>0 AND promised_payment_date IS NULL)::int AS "noDueDateCount"
        FROM balances`,
    ]);
    const breakdown = paymentRows.map((row) => ({ ...row, count: Number(row.count), amountMinor: Number(row.amountMinor) }));
    const receiptsMinor = breakdown.filter((row) => row.kind === 'receipt').reduce((sum, row) => sum + row.amountMinor, 0);
    const refundsMinor = breakdown.filter((row) => row.kind === 'refund').reduce((sum, row) => sum + row.amountMinor, 0);
    const grossSalesMinor = Number(salesRows[0]?.total_minor ?? 0);
    const returnsMinor = Number(returnRows[0]?.total_minor ?? 0);
    const credit = creditRows[0] ?? {};
    const creditSales = await this.prisma.$queryRaw<any[]>`WITH balances AS (
        SELECT s.id, s.receipt_number, s.customer_name, s.customer_phone, s.promised_payment_date,
          GREATEST(0, s.total_minor
            - COALESCE((SELECT SUM(r.total_minor) FROM sale_returns r WHERE r.tenant_id=s.tenant_id AND r.sale_id=s.id),0)
            - COALESCE((SELECT SUM(p.amount_minor) FROM sale_payments p WHERE p.tenant_id=s.tenant_id AND p.sale_id=s.id AND p.kind='receipt'),0)
            + COALESCE((SELECT SUM(p.amount_minor) FROM sale_payments p WHERE p.tenant_id=s.tenant_id AND p.sale_id=s.id AND p.kind='refund'),0)
          )::bigint AS "outstandingMinor"
        FROM sales s WHERE s.tenant_id=${workspaceId}::uuid AND s.branch_id=${branchId}::uuid AND s.status='completed'
      )
      SELECT id, receipt_number AS "receiptNumber", customer_name AS "customerName", customer_phone AS "customerPhone",
        promised_payment_date AS "promisedPaymentDate", "outstandingMinor",
        CASE WHEN promised_payment_date IS NULL THEN 'no_due_date' WHEN promised_payment_date < ${today}::date THEN 'overdue' ELSE 'not_due' END AS ageing
      FROM balances WHERE "outstandingMinor">0 ORDER BY CASE WHEN promised_payment_date < ${today}::date THEN 0 WHEN promised_payment_date IS NULL THEN 1 ELSE 2 END, promised_payment_date ASC NULLS FIRST LIMIT 200`;
    return {
      currency: branch.currency,
      timezone,
      from: fromDate,
      to: toDate,
      activity: {
        salesCount: Number(salesRows[0]?.count ?? 0),
        grossSalesMinor,
        returnsCount: Number(returnRows[0]?.count ?? 0),
        returnsMinor,
        netSalesMinor: grossSalesMinor - returnsMinor,
        receiptsMinor,
        refundsMinor,
        methodBreakdown: breakdown,
      },
      credit: {
        outstandingMinor: Number(credit.outstandingMinor ?? 0),
        creditSalesCount: Number(credit.creditSalesCount ?? 0),
        overdueMinor: Number(credit.overdueMinor ?? 0),
        overdueCount: Number(credit.overdueCount ?? 0),
        notDueMinor: Number(credit.notDueMinor ?? 0),
        notDueCount: Number(credit.notDueCount ?? 0),
        noDueDateMinor: Number(credit.noDueDateMinor ?? 0),
        noDueDateCount: Number(credit.noDueDateCount ?? 0),
        sales: creditSales.map((row) => ({ ...row, outstandingMinor: Number(row.outstandingMinor), promisedPaymentDate: row.promisedPaymentDate ? new Date(row.promisedPaymentDate).toISOString().slice(0, 10) : null })),
        asOf: today,
      },
      assurance: 'Payment methods and amounts are business-recorded; LEXA does not verify them with external providers.',
    };
  }

  @Get('delivery-report')
  async deliveryReport(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Query('from') fromRaw: string | undefined,
    @Query('to') toRaw: string | undefined,
    @Req() request: FastifyRequest,
  ) {
    const actor = await this.access(request, workspaceId, branchId);
    if (!hasPermission(actor.role, 'fulfilment.read')) throw new ForbiddenException('You do not have permission to view delivery reports.');
    const from = optionalDate(fromRaw, 'From date');
    const to = optionalDate(toRaw, 'To date');
    if (from && to && from > to) throw new BadRequestException('From date must be on or before to date.');
    const fromDate = from ? from.toISOString().slice(0, 10) : null;
    const toDate = to ? to.toISOString().slice(0, 10) : null;
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId: workspaceId }, select: { timezone: true, currency: true } });
    if (!branch) throw new NotFoundException('Branch not found.');
    const timezone = branch.timezone || 'Africa/Kampala';
    const [totals, methods, agents, destinations, statuses] = await Promise.all([
      this.prisma.$queryRaw<any[]>`SELECT COUNT(*)::int AS "dispatchCount",
        COUNT(*) FILTER (WHERE status NOT IN ('delivered','returned','cancelled'))::int AS "openCount",
        COUNT(*) FILTER (WHERE status IN ('delivery_failed','return_pending','returned'))::int AS "failedOrReturnedCount",
        COALESCE(SUM(delivery_expense_minor),0)::bigint AS "deliveryExpenseMinor",
        COALESCE(SUM(expected_collection_minor),0)::bigint AS "expectedCollectionMinor"
        FROM commerce_deliveries d WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid
          AND (${fromDate}::date IS NULL OR (dispatched_at AT TIME ZONE ${timezone})::date >= ${fromDate}::date)
          AND (${toDate}::date IS NULL OR (dispatched_at AT TIME ZONE ${timezone})::date <= ${toDate}::date)`,
      this.prisma.$queryRaw<any[]>`SELECT delivery_method AS "deliveryMethod", COUNT(DISTINCT d.id)::int AS count,
        COALESCE(SUM(di.total_selling_minor),0)::bigint AS "goodsSellingMinor",
        COALESCE(SUM(di.total_cost_minor),0)::bigint AS "goodsCostMinor"
        FROM commerce_deliveries d LEFT JOIN commerce_delivery_items di ON di.tenant_id=d.tenant_id AND di.delivery_id=d.id
        WHERE d.tenant_id=${workspaceId}::uuid AND d.branch_id=${branchId}::uuid
          AND (${fromDate}::date IS NULL OR (d.dispatched_at AT TIME ZONE ${timezone})::date >= ${fromDate}::date)
          AND (${toDate}::date IS NULL OR (d.dispatched_at AT TIME ZONE ${timezone})::date <= ${toDate}::date)
        GROUP BY delivery_method ORDER BY delivery_method`,
      this.prisma.$queryRaw<any[]>`WITH agent_deliveries AS (
          SELECT a.id AS "agentId", a.display_name AS "agentName", COUNT(d.id)::int AS "dispatchCount",
            COUNT(d.id) FILTER (WHERE d.status='delivered')::int AS "deliveredCount",
            COUNT(d.id) FILTER (WHERE d.status IN ('delivery_failed','return_pending','returned'))::int AS "failedOrReturnedCount",
            COALESCE(SUM(d.delivery_expense_minor),0)::bigint AS "deliveryExpenseMinor"
          FROM commerce_delivery_agents a LEFT JOIN commerce_deliveries d ON d.tenant_id=a.tenant_id AND d.delivery_agent_id=a.id
            AND d.branch_id=${branchId}::uuid
            AND (${fromDate}::date IS NULL OR (d.dispatched_at AT TIME ZONE ${timezone})::date >= ${fromDate}::date)
            AND (${toDate}::date IS NULL OR (d.dispatched_at AT TIME ZONE ${timezone})::date <= ${toDate}::date)
          WHERE a.tenant_id=${workspaceId}::uuid AND (a.default_branch_id IS NULL OR a.default_branch_id=${branchId}::uuid)
          GROUP BY a.id
        ), agent_collections AS (
          SELECT r.delivery_agent_id AS "agentId", COALESCE(SUM(r.amount_reported_minor),0)::bigint AS "reportedMinor",
            COALESCE(SUM(r.amount_remitted_minor),0)::bigint AS "remittedMinor",
            COALESCE(SUM(r.amount_accepted_minor),0)::bigint AS "acceptedMinor"
          FROM commerce_delivery_collection_reports r WHERE r.tenant_id=${workspaceId}::uuid AND r.branch_id=${branchId}::uuid
            AND (${fromDate}::date IS NULL OR (r.reported_at AT TIME ZONE ${timezone})::date >= ${fromDate}::date)
            AND (${toDate}::date IS NULL OR (r.reported_at AT TIME ZONE ${timezone})::date <= ${toDate}::date)
          GROUP BY r.delivery_agent_id
        )
        SELECT d.*, COALESCE(c."reportedMinor",0)::bigint AS "reportedMinor",
          COALESCE(c."remittedMinor",0)::bigint AS "remittedMinor", COALESCE(c."acceptedMinor",0)::bigint AS "acceptedMinor"
        FROM agent_deliveries d LEFT JOIN agent_collections c USING ("agentId") ORDER BY d."agentName"`, 
      this.prisma.$queryRaw<any[]>`SELECT COALESCE(NULLIF(BTRIM(destination_town),''), NULLIF(BTRIM(destination_area),''), 'Unspecified') AS destination,
        COUNT(*)::int AS count, COALESCE(SUM(delivery_expense_minor),0)::bigint AS "deliveryExpenseMinor"
        FROM commerce_deliveries d WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid
          AND (${fromDate}::date IS NULL OR (dispatched_at AT TIME ZONE ${timezone})::date >= ${fromDate}::date)
          AND (${toDate}::date IS NULL OR (dispatched_at AT TIME ZONE ${timezone})::date <= ${toDate}::date)
        GROUP BY 1 ORDER BY count DESC LIMIT 50`,
      this.prisma.$queryRaw<any[]>`SELECT status, COUNT(*)::int AS count FROM commerce_deliveries d
        WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid
          AND (${fromDate}::date IS NULL OR (dispatched_at AT TIME ZONE ${timezone})::date >= ${fromDate}::date)
          AND (${toDate}::date IS NULL OR (dispatched_at AT TIME ZONE ${timezone})::date <= ${toDate}::date)
        GROUP BY status ORDER BY status`,
    ]);
    const collections = await this.prisma.$queryRaw<any[]>`SELECT
        COALESCE(SUM(amount_reported_minor),0)::bigint AS "reportedMinor",
        COALESCE(SUM(amount_remitted_minor),0)::bigint AS "remittedMinor",
        COALESCE(SUM(amount_accepted_minor),0)::bigint AS "acceptedMinor",
        COALESCE(SUM(GREATEST(0,amount_reported_minor-amount_remitted_minor)),0)::bigint AS "outstandingMinor",
        COUNT(*) FILTER (WHERE amount_reported_minor<>amount_accepted_minor)::int AS "varianceCount"
      FROM commerce_delivery_collection_reports r WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid
        AND (${fromDate}::date IS NULL OR (reported_at AT TIME ZONE ${timezone})::date >= ${fromDate}::date)
        AND (${toDate}::date IS NULL OR (reported_at AT TIME ZONE ${timezone})::date <= ${toDate}::date)`;
    const itemTotals = await this.prisma.$queryRaw<any[]>`SELECT COALESCE(SUM(di.total_selling_minor),0)::bigint AS "goodsSellingMinor",
      COALESCE(SUM(di.total_cost_minor),0)::bigint AS "goodsCostMinor"
      FROM commerce_deliveries d JOIN commerce_delivery_items di ON di.tenant_id=d.tenant_id AND di.delivery_id=d.id
      WHERE d.tenant_id=${workspaceId}::uuid AND d.branch_id=${branchId}::uuid
        AND (${fromDate}::date IS NULL OR (d.dispatched_at AT TIME ZONE ${timezone})::date >= ${fromDate}::date)
        AND (${toDate}::date IS NULL OR (d.dispatched_at AT TIME ZONE ${timezone})::date <= ${toDate}::date)`;
    const total = totals[0] ?? {};
    const collection = collections[0] ?? {};
    return {
      currency: branch.currency,
      timezone,
      from: fromDate,
      to: toDate,
      totals: {
        dispatchCount: Number(total.dispatchCount ?? 0),
        openCount: Number(total.openCount ?? 0),
        failedOrReturnedCount: Number(total.failedOrReturnedCount ?? 0),
        goodsSellingMinor: Number(itemTotals[0]?.goodsSellingMinor ?? 0),
        goodsCostMinor: Number(itemTotals[0]?.goodsCostMinor ?? 0),
        deliveryExpenseMinor: Number(total.deliveryExpenseMinor ?? 0),
        expectedCollectionMinor: Number(total.expectedCollectionMinor ?? 0),
        collectionReportedMinor: Number(collection.reportedMinor ?? 0),
        collectionRemittedMinor: Number(collection.remittedMinor ?? 0),
        collectionAcceptedMinor: Number(collection.acceptedMinor ?? 0),
        riderHeldOutstandingMinor: Number(collection.outstandingMinor ?? 0),
        varianceCount: Number(collection.varianceCount ?? 0),
      },
      byMethod: methods.map((row) => ({ ...row, count: Number(row.count), goodsSellingMinor: Number(row.goodsSellingMinor), goodsCostMinor: Number(row.goodsCostMinor) })),
      byAgent: agents.map((row) => ({ ...row, dispatchCount: Number(row.dispatchCount), deliveredCount: Number(row.deliveredCount), failedOrReturnedCount: Number(row.failedOrReturnedCount), deliveryExpenseMinor: Number(row.deliveryExpenseMinor), reportedMinor: Number(row.reportedMinor), remittedMinor: Number(row.remittedMinor), acceptedMinor: Number(row.acceptedMinor) })),
      byDestination: destinations.map((row) => ({ ...row, count: Number(row.count), deliveryExpenseMinor: Number(row.deliveryExpenseMinor) })),
      byStatus: statuses.map((row) => ({ ...row, count: Number(row.count) })),
    };
  }

  @Get('delivery-agents/:agentId/history')
  async agentHistory(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Param('agentId') agentIdRaw: string,
    @Req() request: FastifyRequest,
  ) {
    await this.access(request, workspaceId, branchId);
    const agentId = uuid(agentIdRaw, 'Delivery agent ID');
    const agent = await this.prisma.$queryRaw<any[]>`SELECT id, display_name AS "displayName", phone, agent_type AS "agentType", active
      FROM commerce_delivery_agents WHERE tenant_id=${workspaceId}::uuid AND id=${agentId}::uuid
        AND (default_branch_id IS NULL OR default_branch_id=${branchId}::uuid) LIMIT 1`;
    if (!agent.length) throw new NotFoundException('Delivery agent not found.');
    const deliveries = await this.prisma.$queryRaw<any[]>`SELECT d.id, d.delivery_number AS "deliveryNumber", d.sale_id AS "saleId",
        s.receipt_number AS "receiptNumber", d.status, d.delivery_method AS "deliveryMethod", d.destination_area AS "destinationArea",
        d.destination_town AS "destinationTown", d.delivery_expense_minor AS "deliveryExpenseMinor", d.dispatched_at AS "dispatchedAt",
        d.delivered_at AS "deliveredAt", COALESCE(SUM(di.total_selling_minor),0)::bigint AS "goodsSellingMinor",
        COALESCE(SUM(di.total_cost_minor),0)::bigint AS "goodsCostMinor"
      FROM commerce_deliveries d LEFT JOIN sales s ON s.tenant_id=d.tenant_id AND s.id=d.sale_id
      LEFT JOIN commerce_delivery_items di ON di.tenant_id=d.tenant_id AND di.delivery_id=d.id
      WHERE d.tenant_id=${workspaceId}::uuid AND d.branch_id=${branchId}::uuid AND d.delivery_agent_id=${agentId}::uuid
      GROUP BY d.id,s.receipt_number ORDER BY d.dispatched_at DESC LIMIT 200`;
    const reports = await this.prisma.$queryRaw<any[]>`SELECT r.id, d.delivery_number AS "deliveryNumber",
        r.amount_reported_minor AS "reportedMinor", r.amount_remitted_minor AS "remittedMinor", r.amount_accepted_minor AS "acceptedMinor",
        r.status, r.reported_at AS "reportedAt", r.variance_reason AS "varianceReason", r.notes
      FROM commerce_delivery_collection_reports r JOIN commerce_deliveries d ON d.tenant_id=r.tenant_id AND d.id=r.delivery_id
      WHERE r.tenant_id=${workspaceId}::uuid AND r.branch_id=${branchId}::uuid AND r.delivery_agent_id=${agentId}::uuid
      ORDER BY r.reported_at DESC LIMIT 200`;
    return {
      agent: agent[0],
      deliveries: deliveries.map((row) => ({ ...row, deliveryExpenseMinor: Number(row.deliveryExpenseMinor), goodsSellingMinor: Number(row.goodsSellingMinor), goodsCostMinor: Number(row.goodsCostMinor), dispatchedAt: new Date(row.dispatchedAt).toISOString(), deliveredAt: row.deliveredAt ? new Date(row.deliveredAt).toISOString() : null })),
      collectionReports: reports.map((row) => ({ ...row, reportedMinor: Number(row.reportedMinor), remittedMinor: Number(row.remittedMinor), acceptedMinor: Number(row.acceptedMinor), reportedAt: new Date(row.reportedAt).toISOString() })),
    };
  }

  @Post('delivery-agents')
  @UseGuards(CsrfGuard)
  async createAgent(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Body() raw: unknown, @Req() request: RequestBody) {
    const actor = await this.access(request, workspaceId, branchId);
    const body = object(raw, 'Delivery agent');
    const name = string(body.displayName, 'Display name', 160)!;
    const agentType = string(body.agentType, 'Agent type', 40)!;
    if (!AGENT_TYPES.has(agentType)) throw new BadRequestException('Unsupported delivery agent type.');
    const defaultBranchId = body.defaultBranchId ? uuid(body.defaultBranchId, 'Default branch ID') : branchId;
    const defaultBranch = await this.prisma.branch.findFirst({ where: { id: defaultBranchId, tenantId: workspaceId }, select: { id: true } });
    if (!defaultBranch) throw new NotFoundException('Default branch not found in this workspace.');
    await assertBranchAccess(this.prisma, workspaceId, defaultBranchId, actor.userId, actor.role);
    const phone = string(body.phone, 'Phone', 80, true);
    const transportDescription = string(body.transportDescription, 'Transport description', 200, true);
    const employeeRecordId = string(body.employeeRecordId, 'Employee record ID', 100, true);
    const notes = string(body.notes, 'Notes', 1000, true);
    const key = this.idempotencyKey(request, 'delivery-agent creation');
    const requestHash = hash({ workspaceId, branchId, name, agentType, defaultBranchId, phone, transportDescription, employeeRecordId, notes });
    return this.prisma.$transaction(async (tx) => {
      const duplicate = await this.idem(tx, workspaceId, key, requestHash);
      if (duplicate) return duplicate;
      const id = randomUUID();
      await tx.$executeRaw`INSERT INTO commerce_delivery_agents
        (id, tenant_id, default_branch_id, display_name, phone, agent_type, transport_description, employee_record_id, notes, created_by_user_id, updated_by_user_id)
        VALUES (${id}::uuid, ${workspaceId}::uuid, ${defaultBranchId}::uuid, ${name}, ${phone ?? null}, ${agentType}, ${transportDescription ?? null}, ${employeeRecordId ?? null}, ${notes ?? null}, ${actor.userId}::uuid, ${actor.userId}::uuid)`;
      await this.audit(tx, workspaceId, branchId, actor.userId, 'delivery.agent.created', 'delivery_agent', id, { agentType, displayName: name });
      const response = { id, displayName: name, phone, agentType, transportDescription, employeeRecordId, notes, active: true, defaultBranchId };
      await this.finishIdem(tx, workspaceId, key, response);
      return response;
    });
  }

  @Patch('delivery-agents/:agentId')
  @UseGuards(CsrfGuard)
  async updateAgent(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('agentId') agentIdRaw: string, @Body() raw: unknown, @Req() request: RequestBody) {
    const actor = await this.access(request, workspaceId, branchId);
    const agentId = uuid(agentIdRaw, 'Agent ID');
    const body = object(raw, 'Delivery agent update');
    const key = this.idempotencyKey(request, 'delivery-agent update');
    const requestHash = hash({ workspaceId, branchId, agentId, body });
    return this.prisma.$transaction(async (tx) => {
      const duplicate = await this.idem(tx, workspaceId, key, requestHash);
      if (duplicate) return duplicate;
      const current = await tx.$queryRaw<any[]>`SELECT * FROM commerce_delivery_agents WHERE tenant_id=${workspaceId}::uuid AND id=${agentId}::uuid AND (default_branch_id IS NULL OR default_branch_id=${branchId}::uuid) FOR UPDATE`;
      if (!current.length) throw new NotFoundException('Delivery agent not found.');
      const prior = current[0];
      const displayName = body.displayName === undefined ? String(prior.display_name) : string(body.displayName, 'Display name', 160)!;
      const agentType = body.agentType === undefined ? String(prior.agent_type) : string(body.agentType, 'Agent type', 40)!;
      if (!AGENT_TYPES.has(agentType)) throw new BadRequestException('Unsupported delivery agent type.');
      if (body.active !== undefined && typeof body.active !== 'boolean') throw new BadRequestException('Active must be a boolean.');
      const active = body.active === undefined ? Boolean(prior.active) : body.active;
      const phone = body.phone === undefined ? prior.phone : string(body.phone, 'Phone', 80, true) ?? null;
      const transportDescription = body.transportDescription === undefined ? prior.transport_description : string(body.transportDescription, 'Transport description', 200, true) ?? null;
      const notes = body.notes === undefined ? prior.notes : string(body.notes, 'Notes', 1000, true) ?? null;
      await tx.$executeRaw`UPDATE commerce_delivery_agents SET display_name=${displayName}, phone=${phone}, agent_type=${agentType}, transport_description=${transportDescription}, notes=${notes}, active=${active}, updated_by_user_id=${actor.userId}::uuid, updated_at=CURRENT_TIMESTAMP WHERE tenant_id=${workspaceId}::uuid AND id=${agentId}::uuid`;
      await this.audit(tx, workspaceId, branchId, actor.userId, active ? 'delivery.agent.updated' : 'delivery.agent.deactivated', 'delivery_agent', agentId, { active, agentType, displayName });
      const response = { id: agentId, displayName, phone, agentType, transportDescription, notes, active };
      await this.finishIdem(tx, workspaceId, key, response);
      return response;
    }, { isolationLevel: 'Serializable' });
  }

  @Get('sales/:saleId/dispatchable-lines')
  async dispatchableLines(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('saleId') saleIdRaw: string, @Req() request: FastifyRequest) {
    await this.access(request, workspaceId, branchId);
    const saleId = uuid(saleIdRaw, 'Sale ID');
    const sales = await this.prisma.$queryRaw<any[]>`SELECT id, receipt_number AS "receiptNumber", total_minor AS "totalMinor", customer_name AS "customerName", customer_phone AS "customerPhone" FROM sales WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND id=${saleId}::uuid LIMIT 1`;
    if (!sales.length) throw new NotFoundException('Sale not found in this branch.');
    const lines = await this.prisma.$queryRaw<any[]>`
      SELECT sl.id AS "saleLineId", sl.product_id AS "productId", sl.product_name_snapshot AS "productName",
        p.sku, sl.variant_id AS "variantId", sl.lot_id AS "lotId", sl.serial_ids AS "serialIds",
        sl.quantity::text AS "soldQuantity", sl.unit_price_minor AS "unitSellingMinor",
        sl.line_total_minor AS "lineSellingMinor", sl.unit_cost_minor AS "unitCostMinor",
        (COALESCE(SUM(di.quantity) FILTER (WHERE d.status <> 'cancelled'), 0)
          + COALESCE((SELECT SUM(cfl.quantity) FROM commerce_fulfilment_lines cfl
              JOIN commerce_fulfilments cf ON cf.tenant_id=cfl.tenant_id AND cf.id=cfl.fulfilment_id
              JOIN commerce_deliveries legacy_d ON legacy_d.tenant_id=cf.tenant_id AND legacy_d.fulfilment_id=cf.id
              WHERE cf.tenant_id=sl.tenant_id AND cf.sale_id=sl.sale_id AND cfl.sale_line_id=sl.id
                AND legacy_d.status<>'cancelled'
                AND NOT EXISTS (SELECT 1 FROM commerce_delivery_items existing_di
                  WHERE existing_di.tenant_id=cfl.tenant_id AND existing_di.delivery_id=legacy_d.id AND existing_di.sale_line_id=sl.id)),0))::text AS "reservedQuantity",
        '0'::text AS "legacyReservedQuantity",
        EXISTS (SELECT 1 FROM commerce_fulfilment_lines cfl
          JOIN commerce_fulfilments cf ON cf.tenant_id=cfl.tenant_id AND cf.id=cfl.fulfilment_id
          WHERE cf.tenant_id=sl.tenant_id AND cf.sale_id=sl.sale_id AND cfl.product_id=sl.product_id AND cfl.sale_line_id IS NULL) AS "legacyMappingRequired",
        COALESCE((SELECT SUM(rl.quantity) FROM sale_return_lines rl WHERE rl.tenant_id=sl.tenant_id AND rl.original_sale_line_id=sl.id),0)::text AS "returnedQuantity"
      FROM sale_lines sl
      JOIN products p ON p.id=sl.product_id AND p.tenant_id=sl.tenant_id
      LEFT JOIN commerce_delivery_items di ON di.tenant_id=sl.tenant_id AND di.sale_line_id=sl.id
      LEFT JOIN commerce_deliveries d ON d.tenant_id=di.tenant_id AND d.id=di.delivery_id
      WHERE sl.tenant_id=${workspaceId}::uuid AND sl.sale_id=${saleId}::uuid
      GROUP BY sl.id, p.sku ORDER BY sl.id`;
    return { sale: sales[0], lines: lines.map((line) => {
      const reservedQuantity = Number(line.reservedQuantity) + Number(line.legacyReservedQuantity);
      const legacyMappingRequired = Boolean(line.legacyMappingRequired);
      return { ...line, soldQuantity: Number(line.soldQuantity), reservedQuantity, legacyReservedQuantity: Number(line.legacyReservedQuantity), legacyMappingRequired, returnedQuantity: Number(line.returnedQuantity), dispatchableQuantity: legacyMappingRequired ? 0 : dispatchableQuantity(Number(line.soldQuantity), reservedQuantity, Number(line.returnedQuantity)), unitSellingMinor: Number(line.unitSellingMinor), lineSellingMinor: Number(line.lineSellingMinor), unitCostMinor: Number(line.unitCostMinor), serialIds: line.serialIds ?? [] };
    }) };
  }

  @Post('dispatches')
  @UseGuards(CsrfGuard)
  async createDispatch(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Body() raw: unknown, @Req() request: RequestBody) {
    const actor = await this.access(request, workspaceId, branchId);
    const body = object(raw, 'Dispatch');
    const saleId = uuid(body.saleId, 'Sale ID');
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) throw new BadRequestException('Select between 1 and 100 sale lines to dispatch.');
    const items = body.items.map((rawItem) => {
      const item = object(rawItem, 'Dispatch item');
      return { saleLineId: uuid(item.saleLineId, 'Sale line ID'), quantity: quantity(item.quantity) };
    });
    if (new Set(items.map((item) => item.saleLineId)).size !== items.length) throw new BadRequestException('Each sale line may appear only once in a dispatch.');
    const deliveryMethod = string(body.deliveryMethod ?? 'other', 'Delivery method', 40)!;
    if (!DELIVERY_METHODS.has(deliveryMethod)) throw new BadRequestException('Unsupported delivery method.');
    const agentId = body.deliveryAgentId ? uuid(body.deliveryAgentId, 'Delivery agent ID') : null;
    const recipientName = string(body.recipientName, 'Recipient name', 160, true) ?? null;
    const recipientPhone = string(body.recipientPhone, 'Recipient phone', 80, true) ?? null;
    const address = string(body.deliveryAddress, 'Delivery address', 500, true) ?? null;
    const area = string(body.destinationArea, 'Destination area', 160, true) ?? null;
    const town = string(body.destinationTown, 'Destination town/district', 160, true) ?? null;
    const instructions = string(body.deliveryInstructions, 'Delivery instructions', 1000, true) ?? null;
    const transportDetails = string(body.transportDetails, 'Transport details', 250, true) ?? null;
    const expectedDate = optionalDate(body.expectedDate, 'Expected delivery date');
    const deliveryExpenseMinor = minor(body.deliveryExpenseMinor ?? 0, 'Delivery expense', true);
    const expectedCollectionMinor = minor(body.expectedCollectionMinor ?? 0, 'Expected collection', true);
    const key = this.idempotencyKey(request, 'dispatch creation');
    const requestHash = hash({ workspaceId, branchId, saleId, items, deliveryMethod, agentId, recipientName, recipientPhone, address, area, town, instructions, transportDetails, expectedDate, deliveryExpenseMinor, expectedCollectionMinor });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const duplicate = await this.idem(tx, workspaceId, key, requestHash);
        if (duplicate) return duplicate;
        const lockedSale = await tx.$queryRaw<any[]>`SELECT id FROM sales WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND id=${saleId}::uuid FOR UPDATE`;
        if (!lockedSale.length) throw new NotFoundException('Sale not found in this branch.');
        await tx.$queryRaw`SELECT id FROM sale_lines WHERE tenant_id=${workspaceId}::uuid AND sale_id=${saleId}::uuid ORDER BY id FOR UPDATE`;
        if (agentId) {
          const agents = await tx.$queryRaw<any[]>`SELECT id FROM commerce_delivery_agents WHERE tenant_id=${workspaceId}::uuid AND id=${agentId}::uuid AND active=true AND (default_branch_id IS NULL OR default_branch_id=${branchId}::uuid) FOR SHARE`;
          if (!agents.length) throw new NotFoundException('The selected delivery agent is inactive or outside this branch.');
        }
        const lineIds = items.map((item) => item.saleLineId);
        const selected = await tx.$queryRaw<any[]>`
          SELECT sl.id, sl.product_id, sl.product_name_snapshot, p.sku, sl.variant_id, sl.lot_id, sl.serial_ids,
            sl.quantity::text AS sold_quantity, sl.unit_price_minor, sl.line_total_minor, sl.unit_cost_minor,
            (COALESCE((SELECT SUM(di.quantity) FROM commerce_delivery_items di JOIN commerce_deliveries d ON d.tenant_id=di.tenant_id AND d.id=di.delivery_id WHERE di.tenant_id=sl.tenant_id AND di.sale_line_id=sl.id AND d.status <> 'cancelled'),0)
              + COALESCE((SELECT SUM(cfl.quantity) FROM commerce_fulfilment_lines cfl JOIN commerce_fulfilments cf ON cf.tenant_id=cfl.tenant_id AND cf.id=cfl.fulfilment_id JOIN commerce_deliveries legacy_d ON legacy_d.tenant_id=cf.tenant_id AND legacy_d.fulfilment_id=cf.id WHERE cf.tenant_id=sl.tenant_id AND cf.sale_id=sl.sale_id AND cfl.sale_line_id=sl.id AND legacy_d.status<>'cancelled' AND NOT EXISTS (SELECT 1 FROM commerce_delivery_items existing_di WHERE existing_di.tenant_id=cfl.tenant_id AND existing_di.delivery_id=legacy_d.id AND existing_di.sale_line_id=sl.id)),0))::text AS reserved_quantity,
            EXISTS (SELECT 1 FROM commerce_fulfilment_lines cfl JOIN commerce_fulfilments cf ON cf.tenant_id=cfl.tenant_id AND cf.id=cfl.fulfilment_id WHERE cf.tenant_id=sl.tenant_id AND cf.sale_id=sl.sale_id AND cfl.product_id=sl.product_id AND cfl.sale_line_id IS NULL) AS legacy_mapping_required,
            (SELECT COALESCE(array_agg(DISTINCT active_serial), '{}'::uuid[]) FROM commerce_delivery_items di JOIN commerce_deliveries d ON d.tenant_id=di.tenant_id AND d.id=di.delivery_id CROSS JOIN LATERAL unnest(di.serial_ids) active_serial WHERE di.tenant_id=sl.tenant_id AND di.sale_line_id=sl.id AND d.status <> 'cancelled') AS active_dispatched_serials,
            COALESCE((SELECT array_agg(DISTINCT returned_serial) FROM sale_return_lines rl CROSS JOIN LATERAL unnest(rl.serial_ids) returned_serial WHERE rl.tenant_id=sl.tenant_id AND rl.original_sale_line_id=sl.id), '{}'::uuid[]) AS returned_serial_ids,
            COALESCE((SELECT SUM(rl.quantity) FROM sale_return_lines rl WHERE rl.tenant_id=sl.tenant_id AND rl.original_sale_line_id=sl.id),0)::text AS returned_quantity
          FROM sale_lines sl JOIN products p ON p.id=sl.product_id AND p.tenant_id=sl.tenant_id
          WHERE sl.tenant_id=${workspaceId}::uuid AND sl.sale_id=${saleId}::uuid AND sl.id=ANY(${lineIds}::uuid[])
          ORDER BY sl.id`;
        if (selected.length !== items.length) throw new BadRequestException('A selected sale line does not belong to this sale.');
        const byId = new Map(selected.map((line) => [String(line.id), line]));
        const deliveryNumber = doc('DLV');
        const deliveryId = randomUUID();
        await tx.$executeRaw`INSERT INTO commerce_deliveries
          (id, tenant_id, branch_id, fulfilment_id, sale_id, delivery_number, recipient_name, recipient_phone,
           delivery_address, destination_area, destination_town, delivery_instructions, courier, delivery_method,
           delivery_agent_id, transport_details, expected_date, status, dispatched_at, updated_at,
           delivery_expense_minor, expected_collection_minor, created_by_user_id, updated_by_user_id,
           idempotency_key, request_hash)
          VALUES (${deliveryId}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, NULL, ${saleId}::uuid,
            ${deliveryNumber}, ${recipientName}, ${recipientPhone}, ${address}, ${area}, ${town}, ${instructions},
            ${transportDetails}, ${deliveryMethod}, ${agentId}::uuid, ${transportDetails}, ${expectedDate}::date,
            'prepared', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${deliveryExpenseMinor}, ${expectedCollectionMinor},
            ${actor.userId}::uuid, ${actor.userId}::uuid, ${key}, ${requestHash})`;
        for (const requested of items) {
          const line = byId.get(requested.saleLineId)!;
          const sold = Number(line.sold_quantity);
          const reserved = Number(line.reserved_quantity);
          const returned = Number(line.returned_quantity ?? 0);
          if (line.legacy_mapping_required) throw new ConflictException({ code: 'LEGACY_FULFILMENT_MAPPING_REQUIRED', message: `A previous sales-order fulfilment for ${line.product_name_snapshot} cannot be safely matched to a specific sale line. Resolve the legacy fulfilment mapping before creating another dispatch for this product.` });
          const available = dispatchableQuantity(sold, reserved, returned);
          if (requested.quantity > available + 0.0000001) throw new ConflictException(`Dispatch quantity for ${line.product_name_snapshot} exceeds the remaining dispatchable quantity of ${Math.max(0, available)}.`);
          if (Array.isArray(line.serial_ids) && line.serial_ids.length) {
            if (!Number.isInteger(requested.quantity)) throw new BadRequestException('Serial-tracked products must be dispatched in whole-unit quantities.');
            const usedSerials = new Set([...(line.active_dispatched_serials ?? []), ...(line.returned_serial_ids ?? [])].map(String));
            const availableSerials = line.serial_ids.filter((serialId: string) => !usedSerials.has(String(serialId)));
            if (availableSerials.length < requested.quantity) throw new ConflictException('Selected serial count does not cover this dispatch quantity.');
          }
          const usedSerials = new Set([...(line.active_dispatched_serials ?? []), ...(line.returned_serial_ids ?? [])].map(String));
          const serialIds = Array.isArray(line.serial_ids) && line.serial_ids.length ? line.serial_ids.filter((serialId: string) => !usedSerials.has(String(serialId))).slice(0, requested.quantity) : [];
          const unitSellingMinor = Number(line.unit_price_minor);
          const totalSellingMinor = Math.round(Number(line.line_total_minor) * requested.quantity / sold);
          const unitCostMinor = Number(line.unit_cost_minor);
          const totalCostMinor = Math.round(unitCostMinor * requested.quantity);
          await tx.$executeRaw`INSERT INTO commerce_delivery_items
            (id, tenant_id, delivery_id, sale_line_id, product_id, product_name_snapshot, sku_snapshot,
             variant_id, lot_id, serial_ids, quantity, unit_selling_minor, total_selling_minor, unit_cost_minor, total_cost_minor)
            VALUES (${randomUUID()}::uuid, ${workspaceId}::uuid, ${deliveryId}::uuid, ${requested.saleLineId}::uuid,
              ${String(line.product_id)}::uuid, ${String(line.product_name_snapshot)}, ${String(line.sku)},
              ${line.variant_id}::uuid, ${line.lot_id}::uuid, ${serialIds}::uuid[], ${requested.quantity},
              ${unitSellingMinor}, ${totalSellingMinor}, ${unitCostMinor}, ${totalCostMinor})`;
        }
        await tx.$executeRaw`INSERT INTO commerce_delivery_events
          (tenant_id, branch_id, delivery_id, previous_status, new_status, actor_user_id, idempotency_key, metadata)
          VALUES (${workspaceId}::uuid, ${branchId}::uuid, ${deliveryId}::uuid, NULL, 'prepared', ${actor.userId}::uuid, ${`${deliveryId}:created`}, ${JSON.stringify({ deliveryNumber, deliveryMethod, source: 'pos_sale' })}::jsonb)`;
        await this.audit(tx, workspaceId, branchId, actor.userId, 'delivery.dispatch.created', 'delivery', deliveryId, { deliveryNumber, saleId, itemCount: items.length, deliveryMethod });
        await this.emitOutbox(tx, workspaceId, branchId, 'sales-orders', deliveryId, 'delivery.dispatch.created', { deliveryId, deliveryNumber, saleId, itemCount: items.length, deliveryMethod }, actor.userId, `delivery.dispatch.created:${deliveryId}`);
        const response = { id: deliveryId, deliveryNumber, saleId, status: 'prepared', deliveryMethod, expectedCollectionMinor, deliveryExpenseMinor };
        await this.finishIdem(tx, workspaceId, key, response);
        return response;
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2034') throw new ConflictException({ code: 'DISPATCH_CONCURRENCY_CONFLICT', message: 'Another dispatch changed the remaining quantity. Refresh dispatchable lines and retry with the same key.' });
      throw error;
    }
  }

  @Get('dispatches')
  async listDispatches(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Query('status') status: string | undefined, @Req() request: FastifyRequest) {
    await this.access(request, workspaceId, branchId);
    if (status && !INITIAL_STATUSES.has(status)) throw new BadRequestException('Unsupported delivery status filter.');
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT d.id, d.delivery_number AS "deliveryNumber", d.sale_id AS "saleId", s.receipt_number AS "receiptNumber",
        d.recipient_name AS "recipientName", d.recipient_phone AS "recipientPhone", d.delivery_address AS "deliveryAddress",
        d.destination_area AS "destinationArea", d.destination_town AS "destinationTown", d.delivery_method AS "deliveryMethod",
        d.status, d.expected_date AS "expectedDate", d.dispatched_at AS "createdAt", d.delivered_at AS "deliveredAt",
        d.delivery_expense_minor AS "deliveryExpenseMinor", d.expected_collection_minor AS "expectedCollectionMinor",
        a.id AS "agentId", a.display_name AS "agentName", a.phone AS "agentPhone",
        COALESCE(SUM(di.total_selling_minor),0)::bigint AS "goodsSellingMinor",
        COALESCE(SUM(di.total_cost_minor),0)::bigint AS "goodsCostMinor",
        COUNT(DISTINCT di.id)::int AS "itemCount"
      FROM commerce_deliveries d
      LEFT JOIN sales s ON s.tenant_id=d.tenant_id AND s.id=d.sale_id
      LEFT JOIN commerce_delivery_agents a ON a.tenant_id=d.tenant_id AND a.id=d.delivery_agent_id
      LEFT JOIN commerce_delivery_items di ON di.tenant_id=d.tenant_id AND di.delivery_id=d.id
      WHERE d.tenant_id=${workspaceId}::uuid AND d.branch_id=${branchId}::uuid
        AND (${status ?? null}::text IS NULL OR d.status=${status ?? null})
      GROUP BY d.id, s.receipt_number, a.id ORDER BY d.dispatched_at DESC LIMIT 500`;
    return rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt).toISOString(), ...(row.deliveredAt ? { deliveredAt: new Date(row.deliveredAt).toISOString() } : {}), expectedDate: row.expectedDate ? new Date(row.expectedDate).toISOString().slice(0, 10) : undefined, deliveryExpenseMinor: Number(row.deliveryExpenseMinor), expectedCollectionMinor: Number(row.expectedCollectionMinor), goodsSellingMinor: Number(row.goodsSellingMinor), goodsCostMinor: Number(row.goodsCostMinor) }));
  }

  @Get('dispatches/:deliveryId')
  async getDispatch(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('deliveryId') deliveryIdRaw: string, @Req() request: FastifyRequest) {
    await this.access(request, workspaceId, branchId);
    const deliveryId = uuid(deliveryIdRaw, 'Delivery ID');
    const deliveries = await this.prisma.$queryRaw<any[]>`SELECT d.*, s.receipt_number AS receipt_number, a.display_name AS agent_name, a.phone AS agent_phone FROM commerce_deliveries d LEFT JOIN sales s ON s.tenant_id=d.tenant_id AND s.id=d.sale_id LEFT JOIN commerce_delivery_agents a ON a.tenant_id=d.tenant_id AND a.id=d.delivery_agent_id WHERE d.tenant_id=${workspaceId}::uuid AND d.branch_id=${branchId}::uuid AND d.id=${deliveryId}::uuid LIMIT 1`;
    if (!deliveries.length) throw new NotFoundException('Dispatch not found.');
    const items = await this.prisma.$queryRaw<any[]>`SELECT id, sale_line_id AS "saleLineId", product_id AS "productId", product_name_snapshot AS "productName", sku_snapshot AS sku, variant_id AS "variantId", lot_id AS "lotId", serial_ids AS "serialIds", quantity::text AS quantity, unit_selling_minor AS "unitSellingMinor", total_selling_minor AS "totalSellingMinor", unit_cost_minor AS "unitCostMinor", total_cost_minor AS "totalCostMinor" FROM commerce_delivery_items WHERE tenant_id=${workspaceId}::uuid AND delivery_id=${deliveryId}::uuid ORDER BY created_at`;
    const events = await this.prisma.$queryRaw<any[]>`SELECT e.id, e.previous_status AS "previousStatus", e.new_status AS "newStatus", e.actor_user_id AS "actorUserId", COALESCE(u.display_name, u.email) AS "actorName", e.occurred_at AS "occurredAt", e.reason, e.location_label AS "locationLabel", e.recipient_name AS "recipientName", e.metadata FROM commerce_delivery_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.tenant_id=${workspaceId}::uuid AND e.delivery_id=${deliveryId}::uuid ORDER BY e.occurred_at, e.created_at`;
    const reports = await this.prisma.$queryRaw<any[]>`SELECT id, amount_reported_minor AS "amountReportedMinor", amount_remitted_minor AS "amountRemittedMinor", amount_accepted_minor AS "amountAcceptedMinor", status, reported_at AS "reportedAt", notes, variance_reason AS "varianceReason" FROM commerce_delivery_collection_reports WHERE tenant_id=${workspaceId}::uuid AND delivery_id=${deliveryId}::uuid ORDER BY reported_at DESC`;
    const row = deliveries[0];
    return { delivery: { id: row.id, deliveryNumber: row.delivery_number, saleId: row.sale_id, receiptNumber: row.receipt_number, recipientName: row.recipient_name, recipientPhone: row.recipient_phone, deliveryAddress: row.delivery_address, destinationArea: row.destination_area, destinationTown: row.destination_town, deliveryInstructions: row.delivery_instructions, deliveryMethod: row.delivery_method, agentId: row.delivery_agent_id, agentName: row.agent_name, agentPhone: row.agent_phone, transportDetails: row.transport_details, status: row.status, expectedDate: row.expected_date ? new Date(row.expected_date).toISOString().slice(0,10) : null, deliveredAt: row.delivered_at ? new Date(row.delivered_at).toISOString() : null, deliveryExpenseMinor: Number(row.delivery_expense_minor), expectedCollectionMinor: Number(row.expected_collection_minor) }, items: items.map((item) => ({ ...item, quantity: Number(item.quantity), unitSellingMinor: Number(item.unitSellingMinor), totalSellingMinor: Number(item.totalSellingMinor), unitCostMinor: Number(item.unitCostMinor), totalCostMinor: Number(item.totalCostMinor) })), events: events.map((event) => ({ ...event, occurredAt: new Date(event.occurredAt).toISOString() })), collectionReports: reports.map((report) => ({ ...report, amountReportedMinor: Number(report.amountReportedMinor), amountRemittedMinor: Number(report.amountRemittedMinor), amountAcceptedMinor: Number(report.amountAcceptedMinor), reportedAt: new Date(report.reportedAt).toISOString() })) };
  }

  @Post('dispatches/:deliveryId/events')
  @UseGuards(CsrfGuard)
  async transitionDispatch(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('deliveryId') deliveryIdRaw: string, @Body() raw: unknown, @Req() request: RequestBody) {
    const actor = await this.access(request, workspaceId, branchId);
    const deliveryId = uuid(deliveryIdRaw, 'Delivery ID');
    const body = object(raw, 'Delivery event');
    const nextStatus = string(body.status, 'Next status', 40)!;
    if (!INITIAL_STATUSES.has(nextStatus) || nextStatus === 'dispatched') throw new BadRequestException('Choose a supported delivery lifecycle state.');
    const reason = string(body.reason, 'Reason', 500, true) ?? null;
    const location = string(body.location, 'Location', 200, true) ?? null;
    const recipientName = string(body.recipientName, 'Recipient name', 160, true) ?? null;
    const proofAttachmentId = body.proofAttachmentId ? uuid(body.proofAttachmentId, 'Proof attachment ID') : null;
    const occurredAt = timestamp(body.occurredAt);
    const key = this.idempotencyKey(request, 'delivery lifecycle update');
    const requestHash = hash({ workspaceId, branchId, deliveryId, nextStatus, reason, location, recipientName, proofAttachmentId, occurredAt });
    return this.prisma.$transaction(async (tx) => {
      const duplicate = await this.idem(tx, workspaceId, key, requestHash);
      if (duplicate) return duplicate;
      const rows = await tx.$queryRaw<any[]>`SELECT id, status FROM commerce_deliveries WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND id=${deliveryId}::uuid FOR UPDATE`;
      if (!rows.length) throw new NotFoundException('Dispatch not found.');
      const currentStatus = String(rows[0].status);
      if (!isValidDeliveryTransition(currentStatus, nextStatus)) throw new ConflictException(`Delivery cannot transition from ${currentStatus} to ${nextStatus}.`);
      if (['delivery_failed','return_pending','returned','cancelled'].includes(nextStatus) && !reason) throw new BadRequestException('A reason is required for a failed, return, or cancelled delivery.');
      if (nextStatus === 'delivered' && !recipientName && !proofAttachmentId) throw new BadRequestException('Record the recipient name or proof of delivery when marking a delivery complete.');
      const eventId = randomUUID();
      await tx.$executeRaw`INSERT INTO commerce_delivery_events
        (id, tenant_id, branch_id, delivery_id, previous_status, new_status, actor_user_id, occurred_at, reason, location_label, recipient_name, proof_attachment_id, idempotency_key, metadata)
        VALUES (${eventId}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, ${deliveryId}::uuid, ${currentStatus}, ${nextStatus}, ${actor.userId}::uuid, ${occurredAt}, ${reason}, ${location}, ${recipientName}, ${proofAttachmentId}::uuid, ${`${deliveryId}:${key}`}, ${JSON.stringify({ idempotencyKey: key })}::jsonb)`;
      await tx.$executeRaw`UPDATE commerce_deliveries SET status=${nextStatus},
        assigned_at=CASE WHEN ${nextStatus}='assigned' THEN ${occurredAt} ELSE assigned_at END,
        picked_up_at=CASE WHEN ${nextStatus}='picked_up' THEN ${occurredAt} ELSE picked_up_at END,
        picked_up_by_user_id=CASE WHEN ${nextStatus}='picked_up' THEN ${actor.userId}::uuid ELSE picked_up_by_user_id END,
        delivered_at=CASE WHEN ${nextStatus}='delivered' THEN ${occurredAt} ELSE delivered_at END,
        recipient_confirmation=CASE WHEN ${nextStatus}='delivered' THEN ${recipientName} ELSE recipient_confirmation END,
        failure_reason=CASE WHEN ${nextStatus}='delivery_failed' THEN ${reason} ELSE failure_reason END,
        returned_at=CASE WHEN ${nextStatus}='returned' THEN ${occurredAt} ELSE returned_at END,
        return_reason=CASE WHEN ${nextStatus}='returned' THEN ${reason} ELSE return_reason END,
        updated_by_user_id=${actor.userId}::uuid, updated_at=CURRENT_TIMESTAMP
        WHERE tenant_id=${workspaceId}::uuid AND id=${deliveryId}::uuid`;
      if(nextStatus==='delivered'||nextStatus==='returned'){
        await tx.$executeRaw`UPDATE commerce_packages SET status=${nextStatus},
          delivered_at=CASE WHEN ${nextStatus}='delivered' THEN ${occurredAt} ELSE delivered_at END,
          updated_at=CURRENT_TIMESTAMP
          WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid
          AND delivery_id=${deliveryId}::uuid AND status='dispatched'`;
        await tx.$executeRaw`UPDATE module_records SET
          data=jsonb_set(data,'{status}',to_jsonb(${nextStatus==='delivered'?'Delivered':'Returned'}::text)),
          version=version+1,updated_at=CURRENT_TIMESTAMP
          WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND module_id='packages'
          AND record_id IN(SELECT id::text FROM commerce_packages WHERE tenant_id=${workspaceId}::uuid AND delivery_id=${deliveryId}::uuid)`;
      }
      await this.audit(tx, workspaceId, branchId, actor.userId, 'delivery.lifecycle.changed', 'delivery', deliveryId, { previousStatus: currentStatus, newStatus: nextStatus, reason });
      await this.emitOutbox(tx, workspaceId, branchId, 'sales-orders', deliveryId, 'delivery.lifecycle.changed', { deliveryId, previousStatus: currentStatus, newStatus: nextStatus, occurredAt: occurredAt.toISOString(), reason }, actor.userId, `delivery.lifecycle.changed:${eventId}`);
      const response = { id: deliveryId, previousStatus: currentStatus, status: nextStatus, eventId, occurredAt: occurredAt.toISOString() };
      await this.finishIdem(tx, workspaceId, key, response);
      return response;
    }, { isolationLevel: 'Serializable' });
  }

  @Post('dispatches/:deliveryId/direct-receipts')
  @UseGuards(CsrfGuard)
  async recordDirectReceipt(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('deliveryId') deliveryIdRaw: string, @Body() raw: unknown, @Req() request: RequestBody) {
    const actor = await this.access(request, workspaceId, branchId);
    if (!hasPermission(actor.role, 'sales.write')) throw new ForbiddenException('You do not have permission to record customer receipts.');
    const deliveryId = uuid(deliveryIdRaw, 'Delivery ID');
    const body = object(raw, 'Direct customer receipt');
    const methodCategory = string(body.methodCategory, 'Payment method', 40)!;
    if (!PAYMENT_CATEGORIES.has(methodCategory)) throw new BadRequestException('Unsupported payment method.');
    const amountMinor = minor(body.amountMinor, 'Receipt amount');
    const methodLabel = string(body.methodLabel, 'Provider or bank label', 120, true) ?? null;
    const reference = string(body.reference, 'Receipt reference', 200, true) ?? null;
    const notes = string(body.notes, 'Notes', 500, true) ?? null;
    let cashSessionId = body.cashSessionId ? uuid(body.cashSessionId, 'Cash session ID') : null;
    if (cashSessionId && methodCategory !== 'cash') throw new BadRequestException('A cash session can only be linked to a cash receipt.');
    const receivedAt = body.reportedReceivedAt ? timestamp(body.reportedReceivedAt, 'Payment received time') : null;
    const key = this.idempotencyKey(request, 'direct customer receipt');
    const requestHash = hash({ workspaceId, branchId, deliveryId, methodCategory, amountMinor, methodLabel, reference, notes, cashSessionId, receivedAt });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const duplicate = await this.idem(tx, workspaceId, key, requestHash);
        if (duplicate) return duplicate;
        const deliveries = await tx.$queryRaw<any[]>`SELECT id, sale_id, status FROM commerce_deliveries WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND id=${deliveryId}::uuid FOR UPDATE`;
        if (!deliveries.length) throw new NotFoundException('Dispatch not found.');
        const saleId = String(deliveries[0].sale_id ?? '');
        if (!saleId) throw new ConflictException('This legacy dispatch has no linked POS sale and cannot accept a direct customer receipt.');
        if (!cashSessionId && methodCategory === 'cash') {
          const activeCashSession = await tx.cashSession.findFirst({ where: { tenantId: workspaceId, branchId, openedByUserId: actor.userId, status: 'open' }, select: { id: true } });
          cashSessionId = activeCashSession?.id ?? null;
        }
        if (cashSessionId) {
          const sessions = await tx.$queryRaw<any[]>`SELECT id FROM cash_sessions WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND id=${cashSessionId}::uuid AND status='open' FOR UPDATE`;
          if (!sessions.length) throw new ConflictException('The selected cash session is not open in this branch.');
        }
        const saleRows = await tx.$queryRaw<any[]>`SELECT s.total_minor, s.receipt_number,
          COALESCE((SELECT SUM(p.amount_minor) FROM sale_payments p WHERE p.tenant_id=s.tenant_id AND p.sale_id=s.id AND p.kind='receipt'),0) AS receipts_minor,
          COALESCE((SELECT SUM(p.amount_minor) FROM sale_payments p WHERE p.tenant_id=s.tenant_id AND p.sale_id=s.id AND p.kind='refund'),0) AS refunds_minor,
          COALESCE((SELECT SUM(r.total_minor) FROM sale_returns r WHERE r.tenant_id=s.tenant_id AND r.sale_id=s.id),0) AS returned_total
          FROM sales s WHERE s.tenant_id=${workspaceId}::uuid AND s.branch_id=${branchId}::uuid AND s.id=${saleId}::uuid FOR UPDATE`;
        if (!saleRows.length) throw new NotFoundException('Sale linked to this dispatch was not found.');
        const sale = saleRows[0];
        const balance = outstandingSaleMinor(Number(sale.total_minor), Number(sale.returned_total), Number(sale.receipts_minor), Number(sale.refunds_minor));
        if (amountMinor > balance) throw new ConflictException({ code: 'PAYMENT_EXCEEDS_BALANCE', message: `Receipt exceeds the outstanding sale balance of ${balance} minor units.` });
        const method = methodForCategory(methodCategory);
        const payment = await tx.salePayment.create({ data: {
          tenantId: workspaceId, saleId, deliveryId, kind: 'receipt', method, methodCategory, methodLabel,
          amountMinor, reference, notes, reportedReceivedAt: receivedAt, recordedByUserId: actor.userId,
          recordedAt: new Date(), sourceType: 'customer_receipt', idempotencyKey: `${key}:payment`,
          requestHash, ledgerSource: 'sale_payment_received', cashSessionId,
        } });
        if (cashSessionId) await tx.cashMovement.create({ data: {
          tenantId: workspaceId, branchId, cashSessionId, direction: 'in', category: 'pos_sale_receipt',
          amountMinor: BigInt(amountMinor), referenceType: 'sale_payment', referenceId: payment.id,
          idempotencyKey: `sale-payment:${payment.id}`, createdByUserId: actor.userId,
        } });
        await postLedgerJournal(tx, { tenantId: workspaceId, branchId, actorUserId: actor.userId, sourceType: 'sale_payment_received', sourceId: payment.id, memo: `Direct customer receipt for ${sale.receipt_number}`, lines: [
          { accountKey: settlementAccountKey(method), debitMinor: amountMinor, description: `Direct customer receipt - ${method}` },
          { accountKey: 'accounts_receivable', creditMinor: amountMinor, description: 'Reduce customer balance due' },
        ] });
        await tx.$executeRaw`INSERT INTO commerce_delivery_events
          (tenant_id, branch_id, delivery_id, previous_status, new_status, actor_user_id, idempotency_key, metadata)
          VALUES (${workspaceId}::uuid, ${branchId}::uuid, ${deliveryId}::uuid, NULL, ${String(deliveries[0].status)},
            ${actor.userId}::uuid, ${`${deliveryId}:direct-receipt:${key}`},
            ${JSON.stringify({ type: 'customer.direct_receipt', salePaymentId: payment.id, amountMinor, methodCategory })}::jsonb)`;
        await this.audit(tx, workspaceId, branchId, actor.userId, 'sale.payment.direct_receipt_recorded', 'sale_payment', payment.id, { saleId, deliveryId, amountMinor, methodCategory });
        await this.emitOutbox(tx, workspaceId, branchId, 'sales-invoices', saleId, 'sale.payment.direct_receipt_recorded', { saleId, deliveryId, paymentId: payment.id, amountMinor, methodCategory, outstandingMinor: balance - amountMinor }, actor.userId, `sale.payment.direct_receipt_recorded:${payment.id}`);
        const response = { paymentId: payment.id, deliveryId, saleId, receiptNumber: String(sale.receipt_number), amountMinor, outstandingMinor: balance - amountMinor, methodCategory, recordedAt: payment.recordedAt.toISOString(), message: 'Recorded as received by the business; not verified by a payment provider.' };
        await this.finishIdem(tx, workspaceId, key, response);
        return response;
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2034') throw new ConflictException({ code: 'PAYMENT_CONCURRENCY_CONFLICT', message: 'The sale balance changed during receipt recording. Refresh and retry with the same key.' });
      throw error;
    }
  }

  @Post('dispatches/:deliveryId/collection-reports')
  @UseGuards(CsrfGuard)
  async reportCollection(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('deliveryId') deliveryIdRaw: string, @Body() raw: unknown, @Req() request: RequestBody) {
    const actor = await this.access(request, workspaceId, branchId);
    const deliveryId = uuid(deliveryIdRaw, 'Delivery ID');
    const body = object(raw, 'Collection report');
    if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 20) throw new BadRequestException('Add between 1 and 20 reported collection lines.');
    const lines = body.lines.map((rawLine) => {
      const line = object(rawLine, 'Collection line');
      const category = string(line.methodCategory, 'Payment method category', 40)!;
      if (!PAYMENT_CATEGORIES.has(category)) throw new BadRequestException('Unsupported reported payment method.');
      return { methodCategory: category, methodLabel: string(line.methodLabel, 'Method label', 120, true), amountMinor: minor(line.amountMinor, 'Reported amount'), reference: string(line.reference, 'Reference', 200, true), notes: string(line.notes, 'Notes', 500, true) };
    });
    const amount = lines.reduce((sum, line) => sum + line.amountMinor, 0);
    if (!Number.isSafeInteger(amount) || amount > 2_000_000_000) throw new BadRequestException('Reported collection total is outside the supported range.');
    const notes = string(body.notes, 'Notes', 1000, true) ?? null;
    const key = this.idempotencyKey(request, 'rider collection report');
    const requestHash = hash({ workspaceId, branchId, deliveryId, lines, notes });
    return this.prisma.$transaction(async (tx) => {
      const duplicate = await this.idem(tx, workspaceId, key, requestHash);
      if (duplicate) return duplicate;
      const delivery = await tx.$queryRaw<any[]>`SELECT id, status, delivery_agent_id FROM commerce_deliveries WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND id=${deliveryId}::uuid FOR UPDATE`;
      if (!delivery.length) throw new NotFoundException('Dispatch not found.');
      if (['prepared','assigned','cancelled','returned'].includes(String(delivery[0].status))) throw new ConflictException('A rider collection cannot be reported for a delivery that has not been picked up or has been closed.');
      const reportId = randomUUID();
      await tx.$executeRaw`INSERT INTO commerce_delivery_collection_reports
        (id, tenant_id, branch_id, delivery_id, delivery_agent_id, amount_reported_minor, reported_by_user_id, notes, idempotency_key, request_hash)
        VALUES (${reportId}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, ${deliveryId}::uuid, ${delivery[0].delivery_agent_id}::uuid, ${amount}, ${actor.userId}::uuid, ${notes}, ${key}, ${requestHash})`;
      for (const line of lines) await tx.$executeRaw`INSERT INTO commerce_delivery_collection_lines
        (tenant_id, report_id, method_category, method_label, amount_minor, reference, notes)
        VALUES (${workspaceId}::uuid, ${reportId}::uuid, ${line.methodCategory}, ${line.methodLabel ?? null}, ${line.amountMinor}, ${line.reference ?? null}, ${line.notes ?? null})`;
      await this.audit(tx, workspaceId, branchId, actor.userId, 'delivery.collection.reported', 'delivery_collection_report', reportId, { deliveryId, amountReportedMinor: amount, note: notes, notYetBusinessReceipt: true });
      await this.emitOutbox(tx, workspaceId, branchId, 'sales-orders', reportId, 'delivery.collection.reported', { reportId, deliveryId, amountReportedMinor: amount, lineCount: lines.length, notYetBusinessReceipt: true }, actor.userId, `delivery.collection.reported:${reportId}`);
      const response = { id: reportId, deliveryId, amountReportedMinor: amount, amountRemittedMinor: 0, amountAcceptedMinor: 0, status: 'reported', message: 'Reported by rider — not yet received by business.' };
      await this.finishIdem(tx, workspaceId, key, response);
      return response;
    }, { isolationLevel: 'Serializable' });
  }

  @Get('collection-reports')
  async listCollectionReports(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Query('status') status: string | undefined, @Req() request: FastifyRequest) {
    await this.access(request, workspaceId, branchId);
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT r.id, r.delivery_id AS "deliveryId", d.delivery_number AS "deliveryNumber", d.sale_id AS "saleId",
        r.delivery_agent_id AS "agentId", a.display_name AS "agentName", r.amount_reported_minor AS "amountReportedMinor",
        r.amount_remitted_minor AS "amountRemittedMinor", r.amount_accepted_minor AS "amountAcceptedMinor",
        (r.amount_reported_minor-r.amount_remitted_minor) AS "outstandingReportedMinor", r.status,
        r.reported_by_user_id AS "reportedByUserId", r.reported_at AS "reportedAt", r.notes, r.variance_reason AS "varianceReason"
      FROM commerce_delivery_collection_reports r
      JOIN commerce_deliveries d ON d.tenant_id=r.tenant_id AND d.id=r.delivery_id
      LEFT JOIN commerce_delivery_agents a ON a.tenant_id=r.tenant_id AND a.id=r.delivery_agent_id
      WHERE r.tenant_id=${workspaceId}::uuid AND r.branch_id=${branchId}::uuid
        AND (${status ?? null}::text IS NULL OR r.status=${status ?? null})
      ORDER BY r.reported_at DESC LIMIT 500`;
    return rows.map((row) => ({ ...row, amountReportedMinor: Number(row.amountReportedMinor), amountRemittedMinor: Number(row.amountRemittedMinor), amountAcceptedMinor: Number(row.amountAcceptedMinor), outstandingReportedMinor: Number(row.outstandingReportedMinor), reportedAt: new Date(row.reportedAt).toISOString() }));
  }

  @Post('remittances')
  @UseGuards(CsrfGuard)
  async acceptRemittance(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Body() raw: unknown, @Req() request: RequestBody) {
    const actor = await this.access(request, workspaceId, branchId);
    if (!hasPermission(actor.role, 'cash.manage')) throw new ForbiddenException({ code: 'REMITTANCE_APPROVAL_REQUIRED', message: 'Only an authorised cashier, manager or finance operator may accept rider remittances.' });
    const body = object(raw, 'Remittance');
    const methodCategory = string(body.methodCategory, 'Received method', 40)!;
    if (!PAYMENT_CATEGORIES.has(methodCategory)) throw new BadRequestException('Unsupported received payment method.');
    const methodLabel = string(body.methodLabel, 'Method label', 120, true) ?? null;
    const reference = string(body.reference, 'Remittance reference', 200, true) ?? null;
    const notes = string(body.varianceReason, 'Variance reason', 500, true) ?? null;
    let cashSessionId = body.cashSessionId ? uuid(body.cashSessionId, 'Cash session ID') : null;
    if (cashSessionId && methodCategory !== 'cash') throw new BadRequestException('A cash session can only be linked to a cash remittance.');
    if (!Array.isArray(body.allocations) || body.allocations.length < 1 || body.allocations.length > 100) throw new BadRequestException('Allocate the remittance to between 1 and 100 rider collection reports.');
    const allocations = body.allocations.map((rawAllocation) => {
      const allocation = object(rawAllocation, 'Remittance allocation');
      return { reportId: uuid(allocation.reportId, 'Collection report ID'), amountMinor: minor(allocation.amountMinor, 'Accepted amount') };
    });
    if (new Set(allocations.map((a) => a.reportId)).size !== allocations.length) throw new BadRequestException('A collection report can only appear once in a remittance.');
    const amount = allocations.reduce((sum, a) => sum + a.amountMinor, 0);
    if (!Number.isSafeInteger(amount) || amount > 2_000_000_000) throw new BadRequestException('Accepted remittance total is outside the supported range.');
    const key = this.idempotencyKey(request, 'remittance acceptance');
    const requestHash = hash({ workspaceId, branchId, methodCategory, methodLabel, reference, notes, cashSessionId, allocations });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const duplicate = await this.idem(tx, workspaceId, key, requestHash);
        if (duplicate) return duplicate;
        if (!cashSessionId && methodCategory === 'cash') {
          const activeCashSession = await tx.cashSession.findFirst({ where: { tenantId: workspaceId, branchId, openedByUserId: actor.userId, status: 'open' }, select: { id: true } });
          cashSessionId = activeCashSession?.id ?? null;
        }
        if (cashSessionId) {
          const sessions = await tx.$queryRaw<any[]>`SELECT id FROM cash_sessions WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND id=${cashSessionId}::uuid AND status='open' FOR UPDATE`;
          if (!sessions.length) throw new ConflictException('The selected cash session is not open in this branch.');
        }
        const reportIds = allocations.map((a) => a.reportId);
        const reports = await tx.$queryRaw<any[]>`
          SELECT r.id, r.delivery_id, r.delivery_agent_id, r.amount_reported_minor, r.amount_remitted_minor, d.sale_id
          FROM commerce_delivery_collection_reports r
          JOIN commerce_deliveries d ON d.tenant_id=r.tenant_id AND d.id=r.delivery_id
          WHERE r.tenant_id=${workspaceId}::uuid AND r.branch_id=${branchId}::uuid AND r.id=ANY(${reportIds}::uuid[])
          ORDER BY r.id FOR UPDATE OF r`;
        if (reports.length !== allocations.length) throw new NotFoundException('One or more collection reports were not found in this branch.');
        const reportById = new Map(reports.map((row) => [String(row.id), row]));
        const saleBalances = new Map<string, { balance: number; receiptNumber: string }>();
        for (const allocation of allocations) {
          const report = reportById.get(allocation.reportId)!;
          try { remainingCollectionMinor(Number(report.amount_reported_minor), Number(report.amount_remitted_minor), allocation.amountMinor); }
          catch { throw new ConflictException(`Allocation exceeds the unremitted amount of collection report ${allocation.reportId}.`); }
          const saleId = String(report.sale_id ?? '');
          if (!saleId) throw new ConflictException('The dispatch is not linked to a POS sale, so the remittance cannot create a sale receipt.');
          if (!saleBalances.has(saleId)) {
            const saleRows = await tx.$queryRaw<any[]>`SELECT s.total_minor, s.receipt_number,
              COALESCE((SELECT SUM(p.amount_minor) FROM sale_payments p WHERE p.tenant_id=s.tenant_id AND p.sale_id=s.id AND p.kind='receipt'),0) AS receipts_minor,
              COALESCE((SELECT SUM(p.amount_minor) FROM sale_payments p WHERE p.tenant_id=s.tenant_id AND p.sale_id=s.id AND p.kind='refund'),0) AS refunds_minor,
              COALESCE((SELECT SUM(r.total_minor) FROM sale_returns r WHERE r.tenant_id=s.tenant_id AND r.sale_id=s.id),0) AS returned_total
              FROM sales s WHERE s.tenant_id=${workspaceId}::uuid AND s.branch_id=${branchId}::uuid AND s.id=${saleId}::uuid FOR UPDATE`;
            if (!saleRows.length) throw new NotFoundException('The sale linked to a collection report no longer exists.');
            const row = saleRows[0];
            saleBalances.set(saleId, { balance: outstandingSaleMinor(Number(row.total_minor), Number(row.returned_total), Number(row.receipts_minor), Number(row.refunds_minor)), receiptNumber: String(row.receipt_number) });
          }
          const saleState = saleBalances.get(saleId)!;
          if (allocation.amountMinor > saleState.balance) throw new ConflictException(`Accepted amount exceeds the remaining sale balance for ${saleState.receiptNumber}. Record any direct customer payment first or resolve the variance.`);
          saleState.balance -= allocation.amountMinor;
        }
        const remittanceId = randomUUID();
        const remittanceNumber = doc('RMT');
        const agentIds = [...new Set(reports.map((row) => row.delivery_agent_id ? String(row.delivery_agent_id) : '').filter(Boolean))];
        const remittanceAgentId = agentIds.length === 1 ? agentIds[0] : null;
        await tx.$executeRaw`INSERT INTO commerce_delivery_remittances
          (id, tenant_id, branch_id, remittance_number, delivery_agent_id, amount_received_minor, method_category, method_label, reference, cash_session_id, received_by_user_id, variance_reason, idempotency_key, request_hash)
          VALUES (${remittanceId}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, ${remittanceNumber}, ${remittanceAgentId}::uuid, ${amount}, ${methodCategory}, ${methodLabel}, ${reference}, ${cashSessionId}::uuid, ${actor.userId}::uuid, ${notes}, ${key}, ${requestHash})`;
        for (const allocation of allocations) {
          const report = reportById.get(allocation.reportId)!;
          const saleId = String(report.sale_id);
          const method = methodForCategory(methodCategory);
          const savedPayment = await tx.salePayment.create({ data: {
            tenantId: workspaceId, saleId, kind: 'receipt', method, methodCategory,
            methodLabel: methodLabel ?? null, amountMinor: allocation.amountMinor,
            reference: reference ?? remittanceNumber, notes: 'Accepted rider remittance',
            recordedByUserId: actor.userId, recordedAt: new Date(), sourceType: 'rider_remittance',
            idempotencyKey: `rider-remittance:${remittanceId}:${allocation.reportId}`,
            requestHash, ledgerSource: 'sale_payment_received', cashSessionId,
          } });
          const savedPaymentId = savedPayment.id;
          await tx.$executeRaw`INSERT INTO commerce_delivery_remittance_allocations
            (tenant_id, remittance_id, collection_report_id, amount_minor, sale_payment_id, created_by_user_id)
            VALUES (${workspaceId}::uuid, ${remittanceId}::uuid, ${allocation.reportId}::uuid, ${allocation.amountMinor}, ${savedPaymentId}::uuid, ${actor.userId}::uuid)`;
          if (cashSessionId) await tx.cashMovement.create({ data: { tenantId: workspaceId, branchId, cashSessionId, direction: 'in', category: 'rider_remittance', amountMinor: BigInt(allocation.amountMinor), referenceType: 'sale_payment', referenceId: savedPaymentId, idempotencyKey: `sale-payment:${savedPaymentId}`, createdByUserId: actor.userId } });
          const reportUpdated = await tx.$queryRaw<any[]>`UPDATE commerce_delivery_collection_reports
            SET amount_remitted_minor=amount_remitted_minor+${allocation.amountMinor}, amount_accepted_minor=amount_accepted_minor+${allocation.amountMinor},
              status=CASE WHEN amount_remitted_minor+${allocation.amountMinor}>=amount_reported_minor THEN 'reconciled' ELSE 'partially_remitted' END
            WHERE tenant_id=${workspaceId}::uuid AND id=${allocation.reportId}::uuid RETURNING delivery_id`;
          const deliveryId = String(reportUpdated[0].delivery_id);
          await tx.$executeRaw`INSERT INTO commerce_delivery_events
            (tenant_id, branch_id, delivery_id, previous_status, new_status, actor_user_id, idempotency_key, metadata)
            VALUES (${workspaceId}::uuid, ${branchId}::uuid, ${deliveryId}::uuid, NULL,
              (SELECT status FROM commerce_deliveries WHERE tenant_id=${workspaceId}::uuid AND id=${deliveryId}::uuid),
              ${actor.userId}::uuid, ${`${remittanceId}:${allocation.reportId}`},
              ${JSON.stringify({ type: 'collection.remitted', reportId: allocation.reportId, amountMinor: allocation.amountMinor, remittanceId })}::jsonb)`;
          await postLedgerJournal(tx, { tenantId: workspaceId, branchId, actorUserId: actor.userId, sourceType: 'sale_payment_received', sourceId: savedPaymentId, memo: `Rider remittance ${remittanceNumber} for ${saleBalances.get(saleId)!.receiptNumber}`, lines: [
            { accountKey: settlementAccountKey(method), debitMinor: allocation.amountMinor, description: `Accepted rider funds - ${method}` },
            { accountKey: 'accounts_receivable', creditMinor: allocation.amountMinor, description: 'Reduce customer balance due' },
          ] });
          await this.audit(tx, workspaceId, branchId, actor.userId, 'delivery.remittance.allocated', 'delivery_collection_report', allocation.reportId, { remittanceId, salePaymentId: savedPaymentId, amountMinor: allocation.amountMinor });
        }
        await this.audit(tx, workspaceId, branchId, actor.userId, 'delivery.remittance.accepted', 'delivery_remittance', remittanceId, { remittanceNumber, amountReceivedMinor: amount, allocationCount: allocations.length, methodCategory });
        await this.emitOutbox(tx, workspaceId, branchId, 'sales-orders', remittanceId, 'delivery.remittance.accepted', { remittanceId, remittanceNumber, amountReceivedMinor: amount, allocationCount: allocations.length, methodCategory }, actor.userId, `delivery.remittance.accepted:${remittanceId}`);
        const response = { id: remittanceId, remittanceNumber, amountReceivedMinor: amount, methodCategory, allocationCount: allocations.length, status: 'allocated', acceptedByUserId: actor.userId, receivedAt: new Date().toISOString() };
        await this.finishIdem(tx, workspaceId, key, response);
        return response;
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2034') throw new ConflictException({ code: 'REMITTANCE_CONCURRENCY_CONFLICT', message: 'A collection report or sale balance changed during reconciliation. Refresh and retry with the same key.' });
      throw error;
    }
  }
}
