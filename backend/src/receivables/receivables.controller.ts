import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertBranchAccess } from '../authorization/branch-scope';
import { postLedgerJournal, settlementAccountKey } from '../general-ledger/ledger-posting';
import { CsrfGuard } from '../core/csrf.guard';

type RequestWithBody = FastifyRequest & { body?: unknown };
type JsonObject = Record<string, unknown>;
type Tx = any;

const PAYMENT_METHODS = new Set(['cash', 'mtn_momo', 'airtel_money', 'bank_transfer', 'card_recorded', 'other']);

function cookie(request: FastifyRequest, name: string): string | undefined {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0 || part.slice(0, at).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(at + 1).trim()); } catch { return undefined; }
  }
  return undefined;
}
function sha(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function object(value: unknown, label = 'Request body'): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException(`${label} must be an object.`);
  return value as JsonObject;
}
function text(value: unknown, label: string, max = 180, optional = false): string | undefined {
  if ((value === undefined || value === null || value === '') && optional) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`${label} is required and must be at most ${max} characters.`);
  return value.trim();
}
function uuid(value: string, label: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new BadRequestException(`${label} is invalid.`);
  return value;
}
function calendarDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${label} must use YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new BadRequestException(`${label} is not a valid calendar date.`);
  return value;
}
function minor(value: unknown, label: string, allowZero = false): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(n) || n < (allowZero ? 0 : 1) || n > 2_000_000_000) throw new BadRequestException(`${label} must be a ${allowZero ? 'non-negative' : 'positive'} whole amount in minor currency units.`);
  return n;
}
function documentNumber(prefix: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const day = `${parts.find((part) => part.type === 'year')?.value}${parts.find((part) => part.type === 'month')?.value}${parts.find((part) => part.type === 'day')?.value}`;
  return `${prefix}-${day}-${randomBytes(3).toString('hex').toUpperCase()}`;
}
function majorAmount(minorUnits: number, currency: string): string {
  try {
    const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0;
    return (minorUnits / (10 ** digits)).toString();
  } catch { return String(minorUnits); }
}
function asIsoDate(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
function statusFor(balance: number, received: number, dueDate: string, storedStatus: string): string {
  if (storedStatus === 'draft' || storedStatus === 'void') return storedStatus;
  if (balance <= 0) return 'paid';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date());
  if (dueDate < today) return 'overdue';
  return received > 0 ? 'partially_paid' : 'issued';
}

@Controller('workspaces/:workspaceId/branches/:branchId/receivables')
export class ReceivablesController {
  constructor(private readonly prisma: PrismaService) {}

  private async access(request: FastifyRequest, workspaceId: string, branchId: string) {
    const token = cookie(request, 'lexa_session');
    if (!token) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Sign in to continue.' });
    const session = await this.prisma.session.findFirst({
      where: { tokenHash: sha(token), expiresAt: { gt: new Date() } },
      select: { userId: true },
    });
    if (!session) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Sign in again.' });
    const membership = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: workspaceId, userId: session.userId } },
    });
    if (!membership || membership.status !== 'ACTIVE') throw new NotFoundException('Workspace not found.');
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId: workspaceId },
      select: { id: true, currency: true },
    });
    if (!branch) throw new NotFoundException('Branch not found.');
    await assertBranchAccess(this.prisma, workspaceId, branchId, session.userId, membership.role);
    return { userId: session.userId, role: membership.role, currency: branch.currency };
  }

  private async writeModuleRecord(tx: Tx, workspaceId: string, branchId: string, moduleId: string, recordId: string, data: JsonObject) {
    await tx.$queryRaw`SELECT set_config('lexa.ar_invoice_write', 'on', true)`;
    await tx.$executeRaw`INSERT INTO module_records
      (id, tenant_id, branch_id, module_id, record_id, data, version)
      VALUES (${randomUUID()}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, ${moduleId}, ${recordId}, ${JSON.stringify(data)}::jsonb, 1)
      ON CONFLICT (tenant_id, branch_id, module_id, record_id)
      DO UPDATE SET data = EXCLUDED.data, version = module_records.version + 1, updated_at = CURRENT_TIMESTAMP`;
  }

  private async event(tx: Tx, workspaceId: string, branchId: string, recordId: string, eventType: string, payload: JsonObject, actorId: string, dedupeKey: string) {
    await tx.$executeRaw`INSERT INTO module_domain_events
      (id, tenant_id, branch_id, module_id, record_id, event_type, payload, dedupe_key, actor_user_id)
      VALUES (${randomUUID()}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, 'sales-invoices', ${recordId}, ${eventType}, ${JSON.stringify(payload)}::jsonb, ${dedupeKey}, ${actorId}::uuid)
      ON CONFLICT (tenant_id, dedupe_key) DO NOTHING`;
  }

  private async audit(tx: Tx, tenantId: string, actorId: string, action: string, resourceType: string, resourceId: string) {
    await tx.auditEvent.create({ data: { tenantId, actorUserId: actorId, action, resourceType, resourceId } });
  }

  private async allocatedForInvoice(tx: Tx, invoiceId: string): Promise<number> {
    const rows = await tx.$queryRaw<Array<{ amount: number | string | bigint }>>`
      SELECT COALESCE(SUM(a.amount_minor), 0)::bigint AS amount
      FROM ar_customer_receipt_allocations a
      JOIN ar_customer_receipts r ON r.id = a.receipt_id
      WHERE a.invoice_id = ${invoiceId}::uuid AND r.kind = 'receipt'
    `;
    return Number(rows[0]?.amount ?? 0);
  }

  private async invoiceModuleData(tx: Tx, invoiceId: string, statusOverride?: string) {
    const rows = await tx.$queryRaw<any[]>`
      SELECT i.*, COALESCE(p.received_minor, 0)::bigint AS received_minor,
             COALESCE(l.item_summary, '') AS item_summary,
             COALESCE(l.quantity_total, 0)::numeric AS quantity_total,
             s.receipt_number AS sale_reference
      FROM ar_customer_invoices i
      LEFT JOIN sales s ON s.id = i.source_sale_id AND s.tenant_id = i.tenant_id
      LEFT JOIN (
        SELECT a.invoice_id, SUM(CASE WHEN r.kind = 'refund' THEN -a.amount_minor ELSE a.amount_minor END) AS received_minor
        FROM ar_customer_receipt_allocations a JOIN ar_customer_receipts r ON r.id = a.receipt_id
        GROUP BY a.invoice_id
      ) p ON p.invoice_id = i.id
      LEFT JOIN (
        SELECT invoice_id, string_agg(product_name_snapshot, '; ' ORDER BY product_name_snapshot) AS item_summary,
               SUM(quantity) AS quantity_total
        FROM ar_customer_invoice_lines GROUP BY invoice_id
      ) l ON l.invoice_id = i.id
      WHERE i.id = ${invoiceId}::uuid LIMIT 1
    `;
    const row = rows[0];
    if (!row) throw new NotFoundException('Invoice not found.');
    const received = Number(row.received_minor ?? 0);
    const total = Number(row.total_minor);
    const dueDate = asIsoDate(row.due_date) ?? '';
    const status = statusOverride ?? statusFor(total - received, received, dueDate, row.status);
    return {
      id: row.id,
      invoiceNumber: row.invoice_number,
      customer: row.customer_name,
      customerName: row.customer_name,
      customerRecordId: row.customer_record_id ?? undefined,
      salesOrderReference: row.sale_reference ?? row.source_sale_id,
      sourceSaleId: row.source_sale_id,
      issueDate: asIsoDate(row.issue_date) ?? '',
      dueDate,
      itemSummary: row.item_summary,
      quantity: String(row.quantity_total ?? 0),
      total: majorAmount(total, String(row.currency ?? 'UGX')),
      amountReceived: majorAmount(Math.max(0, received), String(row.currency ?? 'UGX')),
      amountDue: majorAmount(Math.max(0, total - received), String(row.currency ?? 'UGX')),
      status: status === 'partially_paid' ? 'Partially paid' : status === 'overdue' ? 'Overdue' : status.charAt(0).toUpperCase() + status.slice(1),
    };
  }

  @Get('eligible-sales')
  async eligibleSales(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest) {
    await this.access(req, workspaceId, branchId);
    return this.prisma.$queryRaw<any[]>`
      SELECT s.id, s.receipt_number AS "receiptNumber", s.customer_name AS "customerName",
             s.customer_phone AS "customerPhone", s.total_minor AS "totalMinor",
             s.created_at AS "createdAt", COUNT(sl.id)::int AS "lineCount",
             COALESCE(SUM(sl.quantity), 0)::numeric AS "quantityTotal"
      FROM sales s
      JOIN sale_lines sl ON sl.sale_id = s.id AND sl.tenant_id = s.tenant_id
      WHERE s.tenant_id = ${workspaceId}::uuid AND s.branch_id = ${branchId}::uuid
        AND s.status = 'completed' AND s.total_minor > 0 AND NULLIF(trim(s.customer_name), '') IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM ar_customer_invoices i WHERE i.tenant_id = s.tenant_id AND i.source_sale_id = s.id AND i.status <> 'void')
        AND NOT EXISTS (SELECT 1 FROM sale_returns sr WHERE sr.tenant_id = s.tenant_id AND sr.sale_id = s.id)
      GROUP BY s.id
      ORDER BY s.created_at DESC LIMIT 200
    `;
  }

  @Get('invoices')
  async listInvoices(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest) {
    await this.access(req, workspaceId, branchId);
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT i.*, COALESCE(p.received_minor, 0)::bigint AS received_minor,
             COALESCE(l.lines, '[]'::jsonb) AS lines
      FROM ar_customer_invoices i
      LEFT JOIN (
        SELECT a.invoice_id, SUM(CASE WHEN r.kind = 'refund' THEN -a.amount_minor ELSE a.amount_minor END) AS received_minor
        FROM ar_customer_receipt_allocations a JOIN ar_customer_receipts r ON r.id = a.receipt_id
        GROUP BY a.invoice_id
      ) p ON p.invoice_id = i.id
      LEFT JOIN (
        SELECT invoice_id, jsonb_agg(jsonb_build_object(
          'id', id, 'productName', product_name_snapshot, 'quantity', quantity,
          'unitPriceMinor', unit_price_minor, 'lineTotalMinor', line_total_minor
        ) ORDER BY id) AS lines
        FROM ar_customer_invoice_lines GROUP BY invoice_id
      ) l ON l.invoice_id = i.id
      WHERE i.tenant_id = ${workspaceId}::uuid AND i.branch_id = ${branchId}::uuid
      ORDER BY COALESCE(i.issue_date, i.created_at::date) DESC, i.created_at DESC LIMIT 300
    `;
    return rows.map((row) => {
      const received = Number(row.received_minor ?? 0);
      const total = Number(row.total_minor);
      const dueDate = asIsoDate(row.due_date) ?? '';
      return {
        id: row.id,
        invoiceNumber: row.invoice_number,
        sourceSaleId: row.source_sale_id,
        customerName: row.customer_name,
        customerRecordId: row.customer_record_id ?? undefined,
        customerPhone: row.customer_phone ?? undefined,
        currency: row.currency,
        issueDate: asIsoDate(row.issue_date),
        dueDate,
        issuedAt: row.issued_at?.toISOString?.() ?? row.issued_at,
        subtotalMinor: Number(row.subtotal_minor),
        taxMinor: Number(row.tax_minor),
        totalMinor: total,
        receivedMinor: Math.max(0, received),
        balanceDueMinor: Math.max(0, total - received),
        status: statusFor(total - received, received, dueDate, row.status),
        notes: row.notes ?? undefined,
        lines: row.lines ?? [],
      };
    });
  }

  @Post('invoices')
  @UseGuards(CsrfGuard)
  async createInvoice(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Body() raw: unknown, @Req() req: RequestWithBody) {
    const actor = await this.access(req, workspaceId, branchId);
    const body = object(raw);
    const saleId = uuid(text(body.saleId, 'Completed sale ID', 80)!, 'Sale ID');
    const issueDate = calendarDate(body.issueDate, 'Invoice date');
    const dueDate = calendarDate(body.dueDate, 'Due date');
    if (dueDate < issueDate) throw new BadRequestException('The due date cannot be earlier than the invoice date.');
    const notes = text(body.notes, 'Invoice note', 1000, true) ?? null;

    const invoiceId = randomUUID();
    const invoiceNumber = documentNumber('INV');
    try {
      await this.prisma.$transaction(async (tx) => {
        const sales = await tx.$queryRaw<any[]>`
          SELECT s.*, t.currency,
                 (SELECT o.customer_record_id FROM commerce_fulfilments f
                   JOIN commerce_sales_orders o ON o.id = f.order_id
                  WHERE f.sale_id = s.id ORDER BY f.created_at DESC LIMIT 1) AS customer_record_id
          FROM sales s JOIN tenants t ON t.id = s.tenant_id
          WHERE s.id = ${saleId}::uuid AND s.tenant_id = ${workspaceId}::uuid AND s.branch_id = ${branchId}::uuid
          FOR UPDATE OF s
        `;
        const sale = sales[0];
        if (!sale) throw new NotFoundException('Completed sale was not found in this branch.');
        if (sale.status !== 'completed') throw new ConflictException('Only completed sales can be invoiced.');
        if (Number(sale.total_minor) <= 0) throw new ConflictException('A zero-value sale cannot be issued as a customer invoice.');
        if (!sale.customer_name || !String(sale.customer_name).trim()) throw new BadRequestException('This sale has no customer name. Add a customer to the sale before invoicing it.');
        const returns = await tx.saleReturn.count({ where: { tenantId: workspaceId, saleId } });
        if (returns) throw new ConflictException('A sale with a recorded return must be reconciled through a credit note before invoicing.');
        const existing = await tx.$queryRaw<any[]>`SELECT id FROM ar_customer_invoices WHERE tenant_id = ${workspaceId}::uuid AND source_sale_id = ${saleId}::uuid AND status <> 'void' LIMIT 1`;
        if (existing.length) throw new ConflictException('This sale already has a customer invoice. Open that invoice from the receivables register.');
        const lines = await tx.$queryRaw<any[]>`
          SELECT sl.id, sl.product_id, sl.product_name_snapshot, sl.quantity, sl.unit_price_minor, sl.line_total_minor
          FROM sale_lines sl WHERE sl.tenant_id = ${workspaceId}::uuid AND sl.sale_id = ${saleId}::uuid ORDER BY sl.id
        `;
        if (!lines.length) throw new ConflictException('A sale without item lines cannot be invoiced.');
        const lineTotal = lines.reduce((sum, line) => sum + Number(line.line_total_minor), 0);
        if (lineTotal !== Number(sale.total_minor)) throw new ConflictException('The sale total does not reconcile with its line totals. Resolve the sale before issuing an invoice.');
        await tx.$executeRaw`INSERT INTO ar_customer_invoices
          (id, tenant_id, branch_id, invoice_number, source_sale_id, customer_record_id, customer_name,
           customer_phone, currency, status, subtotal_minor, tax_minor, total_minor, issue_date,
           due_date, notes, created_by_user_id)
          VALUES (${invoiceId}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, ${invoiceNumber},
           ${saleId}::uuid, ${sale.customer_record_id ?? null}, ${String(sale.customer_name)},
           ${sale.customer_phone ?? null}, ${String(sale.currency ?? actor.currency)}, 'draft',
           ${lineTotal}, 0, ${lineTotal}, ${issueDate}::date, ${dueDate}::date, ${notes}, ${actor.userId}::uuid)`;
        for (const line of lines) {
          await tx.$executeRaw`INSERT INTO ar_customer_invoice_lines
            (id, tenant_id, branch_id, invoice_id, source_sale_line_id, product_id,
             product_name_snapshot, quantity, unit_price_minor, line_total_minor)
            VALUES (${randomUUID()}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, ${invoiceId}::uuid,
             ${line.id}::uuid, ${line.product_id}::uuid, ${line.product_name_snapshot},
             ${String(line.quantity)}::numeric, ${Number(line.unit_price_minor)}, ${Number(line.line_total_minor)})`;
        }
        const record = {
          id: invoiceId, invoiceNumber, customer: String(sale.customer_name),
          salesOrderReference: String(sale.receipt_number), issueDate, dueDate,
          itemSummary: lines.map((line) => String(line.product_name_snapshot)).join('; '),
          quantity: String(lines.reduce((sum, line) => sum + Number(line.quantity), 0)),
          total: majorAmount(lineTotal, String(sale.currency ?? actor.currency)), amountReceived: '0', amountDue: majorAmount(lineTotal, String(sale.currency ?? actor.currency)), status: 'Draft',
          sourceSaleId: saleId,
        };
        await this.writeModuleRecord(tx, workspaceId, branchId, 'sales-invoices', invoiceId, record);
        await this.event(tx, workspaceId, branchId, invoiceId, 'customer_invoice.draft_created', { invoiceNumber, sourceSaleId: saleId, totalMinor: lineTotal }, actor.userId, `ar-invoice-draft:${invoiceId}`);
        await this.audit(tx, workspaceId, actor.userId, 'customer_invoice.draft_created', 'customer_invoice', invoiceId);
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('An invoice already exists for this sale. Refresh the register.');
      throw error;
    }
    const invoices = await this.listInvoices(workspaceId, branchId, req);
    return invoices.find((invoice: any) => invoice.id === invoiceId) ?? { id: invoiceId, invoiceNumber, status: 'draft' };
  }

  @Post('invoices/:invoiceId/issue')
  @UseGuards(CsrfGuard)
  async issueInvoice(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('invoiceId') invoiceIdValue: string, @Req() req: FastifyRequest) {
    const actor = await this.access(req, workspaceId, branchId);
    const invoiceId = uuid(invoiceIdValue, 'Invoice ID');
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<any[]>`
        SELECT * FROM ar_customer_invoices WHERE id = ${invoiceId}::uuid
          AND tenant_id = ${workspaceId}::uuid AND branch_id = ${branchId}::uuid FOR UPDATE
      `;
      const invoice = rows[0];
      if (!invoice) throw new NotFoundException('Invoice not found in this branch.');
      if (invoice.status !== 'draft') throw new ConflictException('Only a draft invoice can be issued.');
      const returns = await tx.saleReturn.count({ where: { tenantId: workspaceId, saleId: invoice.source_sale_id } });
      if (returns) throw new ConflictException('A credit note is required before invoicing a sale with returns.');
      // Receipts entered before the invoice was issued are projected into AR once, not reposted.
      await tx.$executeRaw`INSERT INTO ar_customer_receipts
        (id, tenant_id, branch_id, receipt_number, customer_name, payment_date, kind, method,
         reference, amount_minor, source, source_sale_payment_id, created_by_user_id, created_at)
        SELECT sp.id, sp.tenant_id, s.branch_id,
          'POS-' || upper(substr(replace(sp.id::text, '-', ''), 1, 12)), i.customer_name,
          sp.created_at::date, 'receipt', sp.method, sp.reference, sp.amount_minor,
          'sale_payment', sp.id, ${actor.userId}::uuid, sp.created_at
        FROM sale_payments sp
        JOIN sales s ON s.id = sp.sale_id AND s.tenant_id = sp.tenant_id
        JOIN ar_customer_invoices i ON i.source_sale_id = s.id AND i.tenant_id = s.tenant_id
        WHERE i.id = ${invoiceId}::uuid AND sp.kind = 'receipt'
        ON CONFLICT (tenant_id, source_sale_payment_id) WHERE source_sale_payment_id IS NOT NULL DO NOTHING`;
      await tx.$executeRaw`INSERT INTO ar_customer_receipt_allocations
        (id, tenant_id, branch_id, receipt_id, invoice_id, sale_payment_id, amount_minor, created_at)
        SELECT sp.id, sp.tenant_id, s.branch_id, sp.id, ${invoiceId}::uuid, sp.id, sp.amount_minor, sp.created_at
        FROM sale_payments sp
        JOIN sales s ON s.id = sp.sale_id AND s.tenant_id = sp.tenant_id
        WHERE sp.tenant_id = ${workspaceId}::uuid AND sp.sale_id = ${invoice.source_sale_id}::uuid AND sp.kind = 'receipt'
        ON CONFLICT (tenant_id, sale_payment_id) WHERE sale_payment_id IS NOT NULL DO NOTHING`;
      await tx.$executeRaw`UPDATE ar_customer_invoices SET status = 'issued', issued_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${invoiceId}::uuid`;
      const received = await this.allocatedForInvoice(tx, invoiceId);
      const balance = Math.max(0, Number(invoice.total_minor) - received);
      const nextStatus = balance <= 0 ? 'paid' : received > 0 ? 'partially_paid' : 'issued';
      await tx.$executeRaw`UPDATE ar_customer_invoices SET status = ${nextStatus}, updated_at = CURRENT_TIMESTAMP WHERE id = ${invoiceId}::uuid`;
      const data = await this.invoiceModuleData(tx, invoiceId);
      await this.writeModuleRecord(tx, workspaceId, branchId, 'sales-invoices', invoiceId, data);
      await this.event(tx, workspaceId, branchId, invoiceId, 'customer_invoice.issued', { invoiceNumber: invoice.invoice_number, receivedMinor: received, balanceDueMinor: balance }, actor.userId, `ar-invoice-issued:${invoiceId}`);
      await this.audit(tx, workspaceId, actor.userId, 'customer_invoice.issued', 'customer_invoice', invoiceId);
    }, { isolationLevel: 'Serializable' });
    const invoices = await this.listInvoices(workspaceId, branchId, req);
    return invoices.find((invoice) => invoice.id === invoiceId) ?? { id: invoiceId, status: 'issued' };
  }

  @Post('invoices/:invoiceId/void')
  @UseGuards(CsrfGuard)
  async voidDraftInvoice(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('invoiceId') invoiceIdValue: string, @Req() req: FastifyRequest) {
    const actor = await this.access(req, workspaceId, branchId);
    const invoiceId = uuid(invoiceIdValue, 'Invoice ID');
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<any[]>`
        SELECT * FROM ar_customer_invoices WHERE id = ${invoiceId}::uuid
          AND tenant_id = ${workspaceId}::uuid AND branch_id = ${branchId}::uuid FOR UPDATE
      `;
      const invoice = rows[0];
      if (!invoice) throw new NotFoundException('Invoice not found in this branch.');
      if (invoice.status !== 'draft') throw new ConflictException('Only a draft invoice can be voided. Issued invoices require a credit note.');
      await tx.$executeRaw`UPDATE ar_customer_invoices SET status = 'void', updated_at = CURRENT_TIMESTAMP WHERE id = ${invoiceId}::uuid`;
      const data = await this.invoiceModuleData(tx, invoiceId);
      await this.writeModuleRecord(tx, workspaceId, branchId, 'sales-invoices', invoiceId, data);
      await this.event(tx, workspaceId, branchId, invoiceId, 'customer_invoice.draft_voided', { invoiceNumber: invoice.invoice_number }, actor.userId, `ar-invoice-voided:${invoiceId}`);
      await this.audit(tx, workspaceId, actor.userId, 'customer_invoice.draft_voided', 'customer_invoice', invoiceId);
    }, { isolationLevel: 'Serializable' });
    const invoices = await this.listInvoices(workspaceId, branchId, req);
    return invoices.find((invoice) => invoice.id === invoiceId) ?? { id: invoiceId, status: 'void' };
  }

  private async receiptById(workspaceId: string, branchId: string, receiptId: string) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT r.id, r.receipt_number AS "receiptNumber", r.customer_name AS "customerName",
             r.payment_date AS "paymentDate", r.method, r.reference, r.amount_minor AS "amountMinor",
             r.source, r.created_at AS "createdAt",
             COALESCE(jsonb_agg(jsonb_build_object(
               'invoiceId', i.id, 'invoiceNumber', i.invoice_number, 'amountMinor', a.amount_minor
             ) ORDER BY i.invoice_number) FILTER (WHERE i.id IS NOT NULL), '[]'::jsonb) AS allocations
      FROM ar_customer_receipts r
      LEFT JOIN ar_customer_receipt_allocations a ON a.receipt_id = r.id
      LEFT JOIN ar_customer_invoices i ON i.id = a.invoice_id
      WHERE r.tenant_id = ${workspaceId}::uuid AND r.branch_id = ${branchId}::uuid AND r.id = ${receiptId}::uuid
      GROUP BY r.id LIMIT 1
    `;
    const row = rows[0];
    if (!row) return undefined;
    return { ...row, paymentDate: asIsoDate(row.paymentDate), amountMinor: Number(row.amountMinor), createdAt: row.createdAt?.toISOString?.() ?? row.createdAt, allocations: row.allocations ?? [] };
  }

  @Get('receipts')
  async listReceipts(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest) {
    await this.access(req, workspaceId, branchId);
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT r.id, r.receipt_number AS "receiptNumber", r.customer_name AS "customerName",
             r.payment_date AS "paymentDate", r.method, r.reference, r.amount_minor AS "amountMinor",
             r.source, r.created_at AS "createdAt",
             COALESCE(jsonb_agg(jsonb_build_object(
               'invoiceId', i.id, 'invoiceNumber', i.invoice_number, 'amountMinor', a.amount_minor
             ) ORDER BY i.invoice_number) FILTER (WHERE i.id IS NOT NULL), '[]'::jsonb) AS allocations
      FROM ar_customer_receipts r
      LEFT JOIN ar_customer_receipt_allocations a ON a.receipt_id = r.id
      LEFT JOIN ar_customer_invoices i ON i.id = a.invoice_id
      WHERE r.tenant_id = ${workspaceId}::uuid AND r.branch_id = ${branchId}::uuid
      GROUP BY r.id ORDER BY r.payment_date DESC, r.created_at DESC LIMIT 300
    `;
    return rows.map((row) => ({ ...row, paymentDate: asIsoDate(row.paymentDate), amountMinor: Number(row.amountMinor), createdAt: row.createdAt?.toISOString?.() ?? row.createdAt, allocations: row.allocations ?? [] }));
  }

  @Post('receipts')
  @UseGuards(CsrfGuard)
  async recordReceipt(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Body() raw: unknown, @Req() req: RequestWithBody, @Headers('idempotency-key') idempotencyHeader?: string) {
    const actor = await this.access(req, workspaceId, branchId);
    const body = object(raw);
    const paymentDate = calendarDate(body.paymentDate, 'Payment date');
    const method = text(body.method, 'Payment method', 40)!;
    if (!PAYMENT_METHODS.has(method)) throw new BadRequestException('Choose a supported recorded payment method.');
    const reference = text(body.reference, 'Payment reference', 200, true) ?? null;
    const amountMinor = minor(body.amountMinor, 'Receipt amount');
    const allocationsValue = body.allocations;
    if (!Array.isArray(allocationsValue) || !allocationsValue.length || allocationsValue.length > 100) throw new BadRequestException('Allocate the receipt to at least one invoice.');
    const allocations = allocationsValue.map((entry) => {
      const item = object(entry, 'Receipt allocation');
      return { invoiceId: uuid(text(item.invoiceId, 'Invoice ID', 80)!, 'Invoice ID'), amountMinor: minor(item.amountMinor, 'Allocation amount') };
    });
    if (new Set(allocations.map((item) => item.invoiceId)).size !== allocations.length) throw new BadRequestException('An invoice may appear only once per receipt. Combine its allocation amount.');
    allocations.sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));
    const allocatedTotal = allocations.reduce((sum, item) => sum + item.amountMinor, 0);
    if (allocatedTotal !== amountMinor) throw new BadRequestException('The receipt amount must equal the sum of its invoice allocations. Unallocated cash advances are not supported in this increment.');
    const idempotencyKey = text(idempotencyHeader, 'Idempotency-Key', 200)!;
    const requestHash = sha(JSON.stringify({ workspaceId, branchId, paymentDate, method, reference, amountMinor, allocations }));
    const prior = await this.prisma.$queryRaw<any[]>`
      SELECT id, request_hash FROM ar_customer_receipts WHERE tenant_id = ${workspaceId}::uuid AND idempotency_key = ${idempotencyKey} LIMIT 1
    `;
    if (prior.length) {
      if (prior[0].request_hash !== requestHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This request key was used for different receipt data.' });
      return this.receiptById(workspaceId, branchId, String(prior[0].id));
    }

    const receiptId = randomUUID();
    const receiptNumber = documentNumber('AR-RCPT');
    try {
      await this.prisma.$transaction(async (tx) => {
      const invoiceRows = await tx.$queryRaw<any[]>`
        SELECT i.*, COALESCE(p.received_minor, 0)::bigint AS received_minor
        FROM ar_customer_invoices i
        LEFT JOIN (
          SELECT a.invoice_id, SUM(CASE WHEN r.kind = 'refund' THEN -a.amount_minor ELSE a.amount_minor END) AS received_minor
          FROM ar_customer_receipt_allocations a JOIN ar_customer_receipts r ON r.id = a.receipt_id
          GROUP BY a.invoice_id
        ) p ON p.invoice_id = i.id
        WHERE i.tenant_id = ${workspaceId}::uuid AND i.branch_id = ${branchId}::uuid
          AND i.id = ANY(${allocations.map((a) => a.invoiceId)}::uuid[])
        ORDER BY i.id FOR UPDATE OF i
      `;
      if (invoiceRows.length !== allocations.length) throw new NotFoundException('One or more invoices were not found in this branch.');
      const customerNames = new Set(invoiceRows.map((row) => String(row.customer_name).trim().toLowerCase()));
      if (customerNames.size !== 1) throw new BadRequestException('A single receipt can only allocate to invoices for the same customer.');
      const byId = new Map(invoiceRows.map((row) => [String(row.id), row]));
      for (const allocation of allocations) {
        const row = byId.get(allocation.invoiceId)!;
        if (!['issued', 'partially_paid'].includes(row.status)) throw new ConflictException(`Invoice ${row.invoice_number} is not open for receipts.`);
        const balance = Math.max(0, Number(row.total_minor) - Number(row.received_minor ?? 0));
        if (allocation.amountMinor > balance) throw new ConflictException(`Allocation for ${row.invoice_number} exceeds its outstanding balance of ${balance} minor units.`);
      }
      const customerName = String(invoiceRows[0].customer_name);
      await tx.$executeRaw`INSERT INTO ar_customer_receipts
        (id, tenant_id, branch_id, receipt_number, customer_name, payment_date, kind, method,
         reference, amount_minor, source, idempotency_key, request_hash, created_by_user_id)
        VALUES (${receiptId}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, ${receiptNumber},
         ${customerName}, ${paymentDate}::date, 'receipt', ${method}, ${reference}, ${amountMinor},
         'accounts_receivable', ${idempotencyKey}, ${requestHash}, ${actor.userId}::uuid)`;
      await tx.$queryRaw`SELECT set_config('lexa.ar_internal', 'on', true)`;
      for (const allocation of allocations) {
        const invoice = byId.get(allocation.invoiceId)!;
        const salePayment = await tx.salePayment.create({ data: {
          tenantId: workspaceId,
          saleId: String(invoice.source_sale_id),
          kind: 'receipt',
          method,
          amountMinor: allocation.amountMinor,
          reference: reference ?? receiptNumber,
          ledgerSource: 'customer_receipt_recorded',
          createdAt: new Date(`${paymentDate}T00:00:00.000Z`),
        } });
        await tx.$executeRaw`INSERT INTO ar_customer_receipt_allocations
          (id, tenant_id, branch_id, receipt_id, invoice_id, sale_payment_id, amount_minor)
          VALUES (${randomUUID()}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, ${receiptId}::uuid,
           ${allocation.invoiceId}::uuid, ${salePayment.id}::uuid, ${allocation.amountMinor})`;
        const received = await this.allocatedForInvoice(tx, allocation.invoiceId);
        const balance = Math.max(0, Number(invoice.total_minor) - received);
        const nextStatus = balance <= 0 ? 'paid' : 'partially_paid';
        await tx.$executeRaw`UPDATE ar_customer_invoices SET status = ${nextStatus}, updated_at = CURRENT_TIMESTAMP WHERE id = ${allocation.invoiceId}::uuid`;
        const data = await this.invoiceModuleData(tx, allocation.invoiceId);
        await this.writeModuleRecord(tx, workspaceId, branchId, 'sales-invoices', allocation.invoiceId, data);
        await this.event(tx, workspaceId, branchId, allocation.invoiceId, 'customer_invoice.receipt_allocated', { receiptId, receiptNumber, amountMinor: allocation.amountMinor, balanceDueMinor: balance }, actor.userId, `ar-allocation:${salePayment.id}`);
      }
      await postLedgerJournal(tx,{tenantId:workspaceId,branchId,actorUserId:actor.userId,sourceType:'customer_receipt_recorded',sourceId:receiptId,memo:`Customer receipt ${receiptNumber}`,entryDate:paymentDate,lines:[
        {accountKey:settlementAccountKey(method),debitMinor:amountMinor,description:`Customer funds received - ${method}`},
        {accountKey:'accounts_receivable',creditMinor:amountMinor,description:`Settle customer invoices - ${receiptNumber}`},
      ]});
      await this.audit(tx, workspaceId, actor.userId, 'customer_receipt.recorded', 'customer_receipt', receiptId);
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      const details = error as { code?: string; meta?: { code?: string }; message?: string };
      const uniqueConflict = details.code === 'P2002' || details.code === 'P2034' || details.meta?.code === '23505' || String(details.message ?? '').includes('23505');
      if (!uniqueConflict) throw error;
      const raced = await this.prisma.$queryRaw<any[]>`
        SELECT id, request_hash FROM ar_customer_receipts
        WHERE tenant_id = ${workspaceId}::uuid AND idempotency_key = ${idempotencyKey} LIMIT 1
      `;
      if (!raced.length) throw error;
      if (raced[0].request_hash !== requestHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This request key was used for different receipt data.' });
      return this.receiptById(workspaceId, branchId, String(raced[0].id));
    }
    return this.receiptById(workspaceId, branchId, receiptId);
  }

  @Get('summary')
  async summary(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest) {
    await this.access(req, workspaceId, branchId);
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT i.id, i.total_minor, i.due_date, i.status,
             COALESCE(p.received_minor, 0)::bigint AS received_minor
      FROM ar_customer_invoices i
      LEFT JOIN (
        SELECT a.invoice_id, SUM(CASE WHEN r.kind = 'refund' THEN -a.amount_minor ELSE a.amount_minor END) AS received_minor
        FROM ar_customer_receipt_allocations a JOIN ar_customer_receipts r ON r.id = a.receipt_id
        GROUP BY a.invoice_id
      ) p ON p.invoice_id = i.id
      WHERE i.tenant_id = ${workspaceId}::uuid AND i.branch_id = ${branchId}::uuid
        AND i.status NOT IN ('draft','void')
    `;
    const today = new Date();
    const isoToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(today);
    const dayAge = (date: string) => Math.max(0, Math.floor((Date.parse(`${isoToday}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000));
    const summary = { invoiceCount: rows.length, openCount: 0, overdueCount: 0, outstandingMinor: 0, overdueMinor: 0, currentMinor: 0, days1to30Minor: 0, days31to60Minor: 0, days61to90Minor: 0, over90Minor: 0 };
    for (const row of rows) {
      const balance = Math.max(0, Number(row.total_minor) - Number(row.received_minor ?? 0));
      if (balance <= 0) continue;
      summary.openCount += 1;
      summary.outstandingMinor += balance;
      const dueDate = asIsoDate(row.due_date) ?? isoToday;
      const age = dayAge(dueDate);
      if (dueDate >= isoToday) summary.currentMinor += balance;
      else {
        summary.overdueCount += 1;
        summary.overdueMinor += balance;
        if (age <= 30) summary.days1to30Minor += balance;
        else if (age <= 60) summary.days31to60Minor += balance;
        else if (age <= 90) summary.days61to90Minor += balance;
        else summary.over90Minor += balance;
      }
    }
    return summary;
  }
}
