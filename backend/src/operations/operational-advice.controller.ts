import { BadRequestException, Controller, Get, NotFoundException, Param, Req, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertBranchAccess } from '../authorization/branch-scope';
import { hasPermission } from '../authorization/role-policy';
import { buildOperationalWork, type Evidence } from './operational-recommendations';

function sessionCookie(request: FastifyRequest): string | undefined {
  for (const entry of (request.headers.cookie ?? '').split(';')) {
    const at = entry.indexOf('=');
    if (at >= 0 && entry.slice(0, at).trim() === 'lexa_session') {
      try { return decodeURIComponent(entry.slice(at + 1).trim()); } catch { return undefined; }
    }
  }
  return undefined;
}

/** A read-only, bounded operational work queue scoped by existing RBAC and branch access. */
@Controller('workspaces/:workspaceId/branches/:branchId/operational-advice')
export class OperationalAdviceController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() request: FastifyRequest) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid.test(workspaceId) || !uuid.test(branchId)) throw new BadRequestException('Business or branch identifier is invalid.');
    const token = sessionCookie(request);
    if (!token) throw new UnauthorizedException('Sign in to review your work.');
    const session = await this.prisma.session.findFirst({
      where: { tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: {gt: new Date()} },
      select: {userId: true},
    });
    if (!session) throw new UnauthorizedException('Your session has expired.');
    this.prisma.enterTenantContext(workspaceId, session.userId);
    const member = await this.prisma.membership.findUnique({
      where: {tenantId_userId: {tenantId: workspaceId, userId: session.userId}},
      select: {role: true, status: true},
    });
    if (!member || member.status !== 'ACTIVE') throw new NotFoundException('Business not available.');
    const branch = await this.prisma.branch.findFirst({where: {tenantId: workspaceId, id: branchId}, select: {id: true}});
    if (!branch) throw new NotFoundException('Branch not available.');
    await assertBranchAccess(this.prisma, workspaceId, branchId, session.userId, member.role);

    const generatedAt = new Date().toISOString();
    const evidence: Evidence[] = [];
    const collect = async (area: Evidence['area'], code: Evidence['code'], source: string, query: () => Promise<Array<{count: bigint | number}>>) => {
      const rows = await query();
      const count = Number(rows[0]?.count ?? 0);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid evidence count.');
      evidence.push({area, code, source, count, asOf: generatedAt});
    };

    // Fail closed on query errors. A missing read is never displayed as zero exceptions.
    if (hasPermission(member.role, 'inventory.read')) {
      await collect('inventory', 'low_stock', 'products + stock_movements + stock_reservations', () => this.prisma.$queryRaw<Array<{count: bigint}>>`
        SELECT count(*)::bigint AS count FROM products p
        LEFT JOIN (SELECT product_id, SUM(quantity_delta) AS on_hand FROM stock_movements
          WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid GROUP BY product_id) movements ON movements.product_id=p.id
        LEFT JOIN (SELECT product_id, SUM(quantity) AS reserved FROM stock_reservations
          WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND status='active' GROUP BY product_id) reservations ON reservations.product_id=p.id
        WHERE p.tenant_id=${workspaceId}::uuid AND p.active=true AND p.track_stock=true
          AND (movements.product_id IS NOT NULL OR reservations.product_id IS NOT NULL)
          AND COALESCE(movements.on_hand,0)-COALESCE(reservations.reserved,0)<=p.low_stock_threshold`);
      await collect('inventory', 'expiring_lot', 'inventory_lots', () => this.prisma.$queryRaw<Array<{count: bigint}>>`
        SELECT count(*)::bigint AS count FROM inventory_lots
        WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid
          AND status='available' AND quantity_on_hand>quantity_quarantined
          AND expiry_date IS NOT NULL AND expiry_date<=((current_timestamp AT TIME ZONE 'Africa/Kampala')::date + 30)`);
    }
    if (hasPermission(member.role, 'procurement.read')) {
      await collect('purchasing', 'late_purchase', 'commerce_purchase_orders', () => this.prisma.$queryRaw<Array<{count: bigint}>>`
        SELECT count(*)::bigint AS count FROM commerce_purchase_orders
        WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid
          AND status IN ('ordered','partially_received') AND expected_date IS NOT NULL
          AND expected_date<(current_timestamp AT TIME ZONE 'Africa/Kampala')::date`);
      if (hasPermission(member.role, 'procurement.approve') || hasPermission(member.role, 'approval.decide')) {
        await collect('purchasing', 'purchase_review', 'procurement_purchase_requests', () => this.prisma.$queryRaw<Array<{count: bigint}>>`
          SELECT count(*)::bigint AS count FROM procurement_purchase_requests
          WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND status='submitted'`);
      }
    }
    if (hasPermission(member.role, 'finance.read')) {
      await collect('finance', 'overdue_receivable', 'ar_customer_invoices + ar_customer_receipt_allocations', () => this.prisma.$queryRaw<Array<{count: bigint}>>`
        SELECT count(*)::bigint AS count FROM ar_customer_invoices i
        LEFT JOIN (SELECT a.invoice_id,
          SUM(CASE WHEN r.kind='refund' THEN -a.amount_minor ELSE a.amount_minor END) AS paid
          FROM ar_customer_receipt_allocations a JOIN ar_customer_receipts r
            ON r.tenant_id=a.tenant_id AND r.id=a.receipt_id
          WHERE a.tenant_id=${workspaceId}::uuid AND a.branch_id=${branchId}::uuid GROUP BY a.invoice_id) allocations
          ON allocations.invoice_id=i.id
        WHERE i.tenant_id=${workspaceId}::uuid AND i.branch_id=${branchId}::uuid
          AND i.status NOT IN ('draft','void','paid')
          AND i.due_date<(current_timestamp AT TIME ZONE 'Africa/Kampala')::date
          AND i.total_minor>COALESCE(allocations.paid,0)`);
      await collect('finance', 'supplier_payment_due', 'ap_supplier_invoices', () => this.prisma.$queryRaw<Array<{count: bigint}>>`
        SELECT count(*)::bigint AS count FROM ap_supplier_invoices
        WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid
          AND status IN ('approved','partially_paid')
          AND due_date BETWEEN (current_timestamp AT TIME ZONE 'Africa/Kampala')::date
            AND ((current_timestamp AT TIME ZONE 'Africa/Kampala')::date + 7)`);
    }
    if (hasPermission(member.role, 'manufacturing.read')) {
      await collect('production', 'production_review', 'manufacturing_work_orders', () => this.prisma.$queryRaw<Array<{count: bigint}>>`
        SELECT count(*)::bigint AS count FROM manufacturing_work_orders
        WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND status='released'`);
    }
    if (hasPermission(member.role, 'fulfilment.read')) {
      await collect('fulfilment', 'delivery_exception', 'commerce_deliveries', () => this.prisma.$queryRaw<Array<{count: bigint}>>`
        SELECT count(*)::bigint AS count FROM commerce_deliveries
        WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND status='delivery_failed'`);
    }
    return {generatedAt, workspaceId, branchId, source: 'authoritative_operational_records',
      notice: 'Review suggestions only. No inventory, payment, purchase or journal is posted by this service.',
      items: buildOperationalWork(evidence)};
  }
}
