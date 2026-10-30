import {
  BadRequestException, Body, ConflictException, Controller, Get, Headers,
  NotFoundException, Param, Post, Req, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertBranchAccess } from '../authorization/branch-scope';
import { postLedgerJournal, settlementAccountKey } from '../general-ledger/ledger-posting';
import { CsrfGuard } from '../core/csrf.guard';

type Obj = Record<string, unknown>;
type ReqBody = FastifyRequest & { body?: unknown };
type Tx = any;
const PAYMENT_METHODS = new Set(['cash', 'bank_transfer', 'mtn_momo', 'airtel_money', 'cheque', 'card_recorded', 'other']);
const PAYMENT_ACCOUNTS = new Set(['Cash till', 'Main bank account', 'MTN Mobile Money', 'Airtel Money']);

function cookie(request: FastifyRequest, name: string): string | undefined {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0 || part.slice(0, at).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(at + 1).trim()); } catch { return undefined; }
  }
  return undefined;
}
function sha(value: string) { return createHash('sha256').update(value).digest('hex'); }
function object(value: unknown, label = 'Request'): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException(`${label} must be an object.`);
  return value as Obj;
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
function dateValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${label} must use YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new BadRequestException(`${label} is not a valid date.`);
  return value;
}
function qty(value: unknown, label = 'Quantity'): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000 || Math.round(n * 1000) !== n * 1000) throw new BadRequestException(`${label} must be positive with at most three decimal places.`);
  return n;
}
function amount(value: unknown, label: string, allowZero = false): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(n) || n < (allowZero ? 0 : 1) || n > 2_000_000_000) throw new BadRequestException(`${label} is outside the supported amount range.`);
  return n;
}
function doc(prefix: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const day = `${parts.find(p => p.type === 'year')?.value}${parts.find(p => p.type === 'month')?.value}${parts.find(p => p.type === 'day')?.value}`;
  return `${prefix}-${day}-${randomBytes(3).toString('hex').toUpperCase()}`;
}
function isoDate(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
function todayKampala() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date()); }
function statusFor(stored: string, balance: number, paid: number, dueDate: string) {
  if (stored === 'draft' || stored === 'void') return stored;
  if (balance <= 0) return 'paid';
  if (dueDate < todayKampala()) return 'overdue';
  return paid > 0 ? 'partially_paid' : 'approved';
}
function currencyDigits(currency: string) {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0; }
  catch { return 0; }
}
function major(minor: number, currency: string) { return (minor / (10 ** currencyDigits(currency))).toString(); }

@Controller('workspaces/:workspaceId/branches/:branchId/payables')
export class PayablesController {
  constructor(private readonly prisma: PrismaService) {}

  private async access(request: FastifyRequest, workspaceId: string, branchId: string) {
    const token = cookie(request, 'lexa_session');
    if (!token) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Sign in to continue.' });
    const session = await this.prisma.session.findFirst({ where: { tokenHash: sha(token), expiresAt: { gt: new Date() } }, select: { userId: true } });
    if (!session) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Sign in again.' });
    const member = await this.prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: workspaceId, userId: session.userId } } });
    if (!member || member.status !== 'ACTIVE') throw new NotFoundException('Workspace not found.');
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId: workspaceId }, select: { id: true } });
    if (!branch) throw new NotFoundException('Branch not found.');
    await assertBranchAccess(this.prisma, workspaceId, branchId, session.userId, member.role);
    return { userId: session.userId, role: member.role };
  }

  private async audit(tx: Tx, tenantId: string, actorId: string, action: string, type: string, id: string) {
    await tx.auditEvent.create({ data: { tenantId, actorUserId: actorId, action, resourceType: type, resourceId: id } });
  }

  private async event(tx: Tx, tenantId: string, branchId: string, moduleId: string, recordId: string, type: string, payload: Obj, actorId: string, dedupe: string) {
    await tx.$executeRaw`INSERT INTO module_domain_events
      (id,tenant_id,branch_id,module_id,record_id,event_type,payload,dedupe_key,actor_user_id)
      VALUES (${randomUUID()}::uuid,${tenantId}::uuid,${branchId}::uuid,${moduleId},${recordId},${type},${JSON.stringify(payload)}::jsonb,${dedupe},${actorId}::uuid)
      ON CONFLICT (tenant_id,dedupe_key) DO NOTHING`;
  }

  private async moduleRecord(tx: Tx, tenantId: string, branchId: string, moduleId: string, recordId: string, data: Obj) {
    await tx.$executeRaw`INSERT INTO module_records (id,tenant_id,branch_id,module_id,record_id,data,version)
      VALUES (${randomUUID()}::uuid,${tenantId}::uuid,${branchId}::uuid,${moduleId},${recordId},${JSON.stringify(data)}::jsonb,1)
      ON CONFLICT (tenant_id,branch_id,module_id,record_id)
      DO UPDATE SET data=EXCLUDED.data,version=module_records.version+1,updated_at=CURRENT_TIMESTAMP`;
  }

  private async link(tx: Tx, tenantId: string, branchId: string, sourceModule: string, sourceId: string, targetModule: string, targetId: string, actorId: string) {
    await tx.$executeRaw`INSERT INTO module_record_links
      (id,tenant_id,branch_id,source_module_id,source_record_id,target_module_id,target_record_id,relation_type,created_by_user_id)
      VALUES (${randomUUID()}::uuid,${tenantId}::uuid,${branchId}::uuid,${sourceModule},${sourceId},${targetModule},${targetId},'accounts_payable_source',${actorId}::uuid)
      ON CONFLICT (tenant_id,branch_id,source_module_id,source_record_id,target_module_id,target_record_id,relation_type)
      DO NOTHING`;
  }

  private async invoiceProjection(tx: Tx, tenantId: string, branchId: string, invoiceId: string) {
    const rows = await tx.$queryRaw<any[]>`SELECT i.*,COALESCE(p.paid_minor,0)::bigint AS paid_minor,po.order_number
      FROM ap_supplier_invoices i JOIN commerce_purchase_orders po ON po.id=i.purchase_order_id
      LEFT JOIN (SELECT invoice_id,SUM(amount_minor)::bigint AS paid_minor FROM ap_supplier_payment_allocations GROUP BY invoice_id) p ON p.invoice_id=i.id
      WHERE i.id=${invoiceId}::uuid AND i.tenant_id=${tenantId}::uuid AND i.branch_id=${branchId}::uuid LIMIT 1`;
    const row = rows[0];
    if (!row) throw new NotFoundException('Supplier invoice not found.');
    const paid = Number(row.paid_minor ?? 0); const total = Number(row.total_minor); const balance = Math.max(0, total - paid);
    const stored = String(row.status); const dueDate = isoDate(row.due_date) ?? todayKampala(); const status = statusFor(stored, balance, paid, dueDate);
    const data = {
      id: invoiceId, billNumber: row.supplier_invoice_number, invoiceNumber: row.invoice_number,
      supplier: row.supplier_name, supplierRecordId: row.supplier_record_id ?? '', purchaseOrder: row.order_number,
      purchaseOrderId: row.purchase_order_id, billDate: isoDate(row.bill_date), dueDate,
      subtotalMinor: String(row.subtotal_minor), taxMinor: String(row.tax_minor), totalMinor: String(total),
      total: major(total, row.currency), amountPaid: major(paid, row.currency), amountDue: major(balance, row.currency),
      currency: row.currency, status: status === 'partially_paid' ? 'Partially paid' : status === 'overdue' ? 'Overdue' : status === 'approved' ? 'Approved' : status === 'paid' ? 'Paid' : status === 'void' ? 'Void' : 'Draft',
      notes: row.notes ?? '', createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    };
    await this.moduleRecord(tx, tenantId, branchId, 'purchase-invoices', invoiceId, data);
  }

  private async invoiceCreateResult(tenantId: string, branchId: string, invoiceId: string) {
    const rows = await this.prisma.$queryRaw<any[]>`SELECT id,invoice_number,status,total_minor FROM ap_supplier_invoices WHERE id=${invoiceId}::uuid AND tenant_id=${tenantId}::uuid AND branch_id=${branchId}::uuid LIMIT 1`;
    const row = rows[0];
    if (!row) throw new NotFoundException('Supplier invoice was not found after saving.');
    return { id: row.id, invoiceNumber: row.invoice_number, status: row.status, totalMinor: Number(row.total_minor) };
  }

  @Get('purchase-orders')
  async purchaseOrders(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest) {
    await this.access(req, workspaceId, branchId);
    const rows = await this.prisma.$queryRaw<any[]>`SELECT po.id AS purchase_order_id,po.order_number,po.supplier_record_id,po.supplier_name,po.expected_date,po.status AS purchase_order_status,po.total_minor,
      pol.id AS purchase_order_line_id,pol.product_id,pol.product_name_snapshot,pol.sku_snapshot,pol.unit_cost_minor,
      gr.id AS receipt_id,gr.receipt_number,gr.created_at AS receipt_created_at,grl.id AS receipt_line_id,
      grl.quantity_accepted::numeric AS accepted_quantity,COALESCE(billed.invoiced_quantity,0)::numeric AS invoiced_quantity
      FROM commerce_purchase_orders po
      JOIN commerce_goods_receipts gr ON gr.purchase_order_id=po.id AND gr.tenant_id=po.tenant_id AND gr.branch_id=po.branch_id AND gr.status='posted'
      JOIN commerce_goods_receipt_lines grl ON grl.receipt_id=gr.id AND grl.tenant_id=gr.tenant_id
      JOIN commerce_purchase_order_lines pol ON pol.id=grl.purchase_order_line_id AND pol.order_id=po.id AND pol.tenant_id=po.tenant_id
      LEFT JOIN (SELECT ail.receipt_line_id,SUM(ail.quantity) AS invoiced_quantity FROM ap_supplier_invoice_lines ail JOIN ap_supplier_invoices ai ON ai.id=ail.invoice_id WHERE ai.status<>'void' GROUP BY ail.receipt_line_id) billed ON billed.receipt_line_id=grl.id
      WHERE po.tenant_id=${workspaceId}::uuid AND po.branch_id=${branchId}::uuid
        AND grl.quantity_accepted>COALESCE(billed.invoiced_quantity,0)
      ORDER BY po.created_at DESC,gr.created_at ASC,pol.product_name_snapshot ASC`;
    const orders = new Map<string, any>();
    for (const row of rows) {
      const id = String(row.purchase_order_id);
      if (!orders.has(id)) orders.set(id, { id, orderNumber: row.order_number, supplierRecordId: row.supplier_record_id ?? undefined, supplierName: row.supplier_name, expectedDate: isoDate(row.expected_date), status: row.purchase_order_status, totalMinor: Number(row.total_minor), receiptLines: [] });
      const accepted = Number(row.accepted_quantity); const invoiced = Number(row.invoiced_quantity);
      orders.get(id).receiptLines.push({
        receiptLineId: row.receipt_line_id, receiptId: row.receipt_id, receiptNumber: row.receipt_number,
        receiptDate: isoDate(row.receipt_created_at), purchaseOrderLineId: row.purchase_order_line_id,
        productId: row.product_id, productName: row.product_name_snapshot, sku: row.sku_snapshot,
        acceptedQuantity: accepted, invoicedQuantity: invoiced, availableQuantity: Math.max(0, accepted - invoiced),
        unitCostMinor: Number(row.unit_cost_minor),
      });
    }
    return [...orders.values()];
  }

  @Get('invoices')
  async invoices(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest) {
    await this.access(req, workspaceId, branchId);
    const rows = await this.prisma.$queryRaw<any[]>`SELECT i.*,COALESCE(p.paid_minor,0)::bigint AS paid_minor,COALESCE(l.lines,'[]'::jsonb) AS lines,po.order_number
      FROM ap_supplier_invoices i JOIN commerce_purchase_orders po ON po.id=i.purchase_order_id
      LEFT JOIN (SELECT invoice_id,SUM(amount_minor)::bigint AS paid_minor FROM ap_supplier_payment_allocations GROUP BY invoice_id) p ON p.invoice_id=i.id
      LEFT JOIN (SELECT il.invoice_id,jsonb_agg(jsonb_build_object('id',il.id,'productName',il.product_name_snapshot,'receiptNumber',il.receipt_number_snapshot,'quantity',il.quantity,'unitCostMinor',il.unit_cost_minor,'lineTotalMinor',il.line_total_minor)) AS lines FROM ap_supplier_invoice_lines il GROUP BY il.invoice_id) l ON l.invoice_id=i.id
      WHERE i.tenant_id=${workspaceId}::uuid AND i.branch_id=${branchId}::uuid ORDER BY i.created_at DESC LIMIT 500`;
    return rows.map((row) => {
      const paid = Number(row.paid_minor ?? 0); const total = Number(row.total_minor); const balance = Math.max(0, total - paid); const due = isoDate(row.due_date) ?? todayKampala();
      return { id: row.id, invoiceNumber: row.invoice_number, supplierInvoiceNumber: row.supplier_invoice_number, purchaseOrderId: row.purchase_order_id, purchaseOrderNumber: row.order_number, supplierRecordId: row.supplier_record_id ?? undefined, supplierName: row.supplier_name, currency: row.currency, billDate: isoDate(row.bill_date), dueDate: due, subtotalMinor: Number(row.subtotal_minor), taxMinor: Number(row.tax_minor), totalMinor: total, paidMinor: paid, balanceDueMinor: balance, status: statusFor(row.status, balance, paid, due), notes: row.notes ?? undefined, lines: (row.lines ?? []).map((line: any) => ({ ...line, quantity: Number(line.quantity), unitCostMinor: Number(line.unitCostMinor), lineTotalMinor: Number(line.lineTotalMinor) })) };
    });
  }

  @Post('invoices')
  @UseGuards(CsrfGuard)
  async createInvoice(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Body() raw: unknown, @Headers('idempotency-key') idempotencyHeader: string | undefined, @Req() req: ReqBody) {
    const actor = await this.access(req, workspaceId, branchId); const body = object(raw);
    const idempotencyKey = text(idempotencyHeader, 'Idempotency key', 200)!;
    const purchaseOrderId = uuid(text(body.purchaseOrderId, 'Purchase order ID', 80)!, 'Purchase order ID');
    const supplierInvoiceNumber = text(body.supplierInvoiceNumber, 'Supplier invoice number', 100)!;
    const billDate = dateValue(body.billDate, 'Bill date'); const dueDate = dateValue(body.dueDate, 'Due date');
    if (dueDate < billDate) throw new BadRequestException('Due date cannot be earlier than the bill date.');
    const taxMinor = amount(body.taxMinor ?? 0, 'Tax amount', true);
    const notes = text(body.notes, 'Invoice notes', 1000, true) ?? null;
    if (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > 100) throw new BadRequestException('Select at least one accepted goods-receipt line.');
    const requested = body.lines.map((value) => { const line = object(value, 'Invoice line'); return { receiptLineId: uuid(text(line.receiptLineId, 'Goods receipt line ID', 80)!, 'Goods receipt line ID'), quantity: qty(line.quantity), unitCostMinor: line.unitCostMinor === undefined ? undefined : amount(line.unitCostMinor, 'Supplier unit cost', true) }; });
    if (new Set(requested.map(line => line.receiptLineId)).size !== requested.length) throw new BadRequestException('A supplier invoice cannot repeat a goods-receipt line.');
    const normalized = { purchaseOrderId, supplierInvoiceNumber: supplierInvoiceNumber.trim().toUpperCase(), billDate, dueDate, taxMinor, notes, lines: [...requested].sort((a, b) => a.receiptLineId.localeCompare(b.receiptLineId)) };
    const requestHash = sha(JSON.stringify(normalized));
    const existing = await this.prisma.$queryRaw<any[]>`SELECT id,request_hash FROM ap_supplier_invoices WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND idempotency_key=${idempotencyKey} LIMIT 1`;
    if (existing.length) {
      if (existing[0].request_hash !== requestHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This request key was already used for different supplier invoice data.' });
      return this.invoiceCreateResult(workspaceId, branchId, String(existing[0].id));
    }

    try {
    const invoiceId = await this.prisma.$transaction(async (tx) => {
      const raced = await tx.$queryRaw<any[]>`SELECT id,request_hash FROM ap_supplier_invoices WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND idempotency_key=${idempotencyKey} LIMIT 1`;
      if (raced.length) {
        if (raced[0].request_hash !== requestHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This request key was already used for different supplier invoice data.' });
        return String(raced[0].id);
      }
      const orders = await tx.$queryRaw<any[]>`SELECT po.* FROM commerce_purchase_orders po WHERE po.id=${purchaseOrderId}::uuid AND po.tenant_id=${workspaceId}::uuid AND po.branch_id=${branchId}::uuid FOR UPDATE`;
      const po = orders[0]; if (!po) throw new NotFoundException('Purchase order not found.');
      if (!['partially_received', 'received'].includes(po.status)) throw new ConflictException('The purchase order must have accepted goods receipts before it can be invoiced.');
      const tenant = await tx.tenant.findUnique({ where: { id: workspaceId }, select: { currency: true } }); const currency = tenant?.currency ?? 'UGX';
      const invoiceId = randomUUID(); const invoiceNumber = doc('AP'); const prepared: any[] = []; let subtotalMinor = 0;
      for (const item of requested) {
        const matches = await tx.$queryRaw<any[]>`SELECT grl.id AS receipt_line_id,gr.id AS receipt_id,gr.receipt_number,gr.status AS receipt_status,pol.id AS purchase_order_line_id,pol.product_id,pol.product_name_snapshot,pol.unit_cost_minor,grl.quantity_accepted::numeric AS accepted_quantity,
          COALESCE((SELECT SUM(ail.quantity) FROM ap_supplier_invoice_lines ail JOIN ap_supplier_invoices ai ON ai.id=ail.invoice_id WHERE ail.receipt_line_id=grl.id AND ai.status<>'void'),0)::numeric AS invoiced_quantity
          FROM commerce_goods_receipt_lines grl JOIN commerce_goods_receipts gr ON gr.id=grl.receipt_id AND grl.tenant_id=gr.tenant_id
          JOIN commerce_purchase_order_lines pol ON pol.id=grl.purchase_order_line_id AND pol.tenant_id=gr.tenant_id
          WHERE grl.id=${item.receiptLineId}::uuid AND gr.purchase_order_id=${purchaseOrderId}::uuid AND gr.tenant_id=${workspaceId}::uuid AND gr.branch_id=${branchId}::uuid AND gr.status='posted'
          FOR UPDATE OF grl,pol`;
        const row = matches[0]; if (!row) throw new BadRequestException('A selected goods-receipt line does not belong to this purchase order and branch.');
        const available = Number(row.accepted_quantity) - Number(row.invoiced_quantity);
        if (item.quantity > available + 0.0000001) throw new ConflictException(`${row.product_name_snapshot}: only ${available} accepted, unbilled units remain.`);
        const unitCostMinor = item.unitCostMinor ?? Number(row.unit_cost_minor);
        const lineTotalMinor = Math.round(item.quantity * unitCostMinor);
        if (!Number.isSafeInteger(lineTotalMinor) || lineTotalMinor < 0 || lineTotalMinor > 2_000_000_000) throw new BadRequestException('An invoice line exceeds the supported amount range.');
        subtotalMinor += lineTotalMinor;
        if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor > 2_000_000_000) throw new BadRequestException('Supplier invoice total exceeds the supported amount range.');
        prepared.push({ ...row, ...item, unitCostMinor, lineTotalMinor });
      }
      const totalMinor = amount(subtotalMinor + taxMinor, 'Invoice total', true);
      await tx.$executeRaw`INSERT INTO ap_supplier_invoices
        (id,tenant_id,branch_id,purchase_order_id,supplier_record_id,supplier_name,supplier_invoice_number,invoice_number,currency,bill_date,due_date,subtotal_minor,tax_minor,total_minor,status,notes,idempotency_key,request_hash,created_by_user_id)
        VALUES (${invoiceId}::uuid,${workspaceId}::uuid,${branchId}::uuid,${purchaseOrderId}::uuid,${po.supplier_record_id},${po.supplier_name},${supplierInvoiceNumber},${invoiceNumber},${currency},${billDate}::date,${dueDate}::date,${subtotalMinor},${taxMinor},${totalMinor},'draft',${notes},${idempotencyKey},${requestHash},${actor.userId}::uuid)`;
      for (const line of prepared) await tx.$executeRaw`INSERT INTO ap_supplier_invoice_lines
        (id,tenant_id,invoice_id,purchase_order_line_id,receipt_line_id,product_id,product_name_snapshot,receipt_number_snapshot,quantity,unit_cost_minor,line_total_minor)
        VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${invoiceId}::uuid,${line.purchase_order_line_id}::uuid,${line.receipt_line_id}::uuid,${line.product_id}::uuid,${line.product_name_snapshot},${line.receipt_number},${String(line.quantity)}::numeric,${line.unitCostMinor},${line.lineTotalMinor})`;
      await this.invoiceProjection(tx, workspaceId, branchId, invoiceId);
      await this.link(tx, workspaceId, branchId, 'purchases', purchaseOrderId, 'purchase-invoices', invoiceId, actor.userId);
      for (const receiptId of [...new Set(prepared.map((line) => String(line.receipt_id ?? '')))].filter(Boolean)) {
        await this.link(tx, workspaceId, branchId, 'receiving', receiptId, 'purchase-invoices', invoiceId, actor.userId);
      }
      await this.event(tx, workspaceId, branchId, 'purchase-invoices', invoiceId, 'supplier_invoice.created', { invoiceNumber, supplierInvoiceNumber, purchaseOrderId, subtotalMinor, taxMinor, totalMinor }, actor.userId, `ap-invoice-created:${invoiceId}`);
      await this.audit(tx, workspaceId, actor.userId, 'supplier_invoice.created', 'supplier_invoice', invoiceId);
      return invoiceId;
    }, { isolationLevel: 'Serializable' });
    return this.invoiceCreateResult(workspaceId, branchId, invoiceId);
    } catch (error) {
      const raced = await this.prisma.$queryRaw<any[]>`SELECT id,request_hash FROM ap_supplier_invoices WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND idempotency_key=${idempotencyKey} LIMIT 1`;
      if (raced.length) {
        if (raced[0].request_hash !== requestHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This request key was already used for different supplier invoice data.' });
        return this.invoiceCreateResult(workspaceId, branchId, String(raced[0].id));
      }
      const details = error as { code?: string; meta?: { code?: string }; message?: string };
      if (details.code === 'P2002' || details.meta?.code === '23505' || String(details.message ?? '').includes('23505')) {
        throw new ConflictException('A supplier bill with this supplier invoice number already exists for this supplier.');
      }
      throw error;
    }
  }

  @Post('invoices/:invoiceId/approve')
  @UseGuards(CsrfGuard)
  async approveInvoice(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('invoiceId') invoiceId: string, @Req() req: FastifyRequest) {
    const actor = await this.access(req, workspaceId, branchId); uuid(invoiceId, 'Supplier invoice ID');
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<any[]>`SELECT * FROM ap_supplier_invoices WHERE id=${invoiceId}::uuid AND tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid FOR UPDATE`;
      const invoice = rows[0]; if (!invoice) throw new NotFoundException('Supplier invoice not found.');
      if (['approved','partially_paid','paid'].includes(invoice.status)) return { id: invoiceId, status: invoice.status };
      if (invoice.status !== 'draft') throw new ConflictException('Only a draft supplier invoice can be approved.');
      const lines = await tx.$queryRaw<any[]>`SELECT receipt_line_id,quantity FROM ap_supplier_invoice_lines WHERE invoice_id=${invoiceId}::uuid`;
      if (!lines.length) throw new ConflictException('The supplier invoice has no receipt-matched lines.');
      for (const line of lines) {
        const check = await tx.$queryRaw<any[]>`SELECT grl.quantity_accepted::numeric AS accepted,
          COALESCE((SELECT SUM(ail.quantity) FROM ap_supplier_invoice_lines ail JOIN ap_supplier_invoices ai ON ai.id=ail.invoice_id WHERE ail.receipt_line_id=grl.id AND ai.status NOT IN ('void','draft')),0)::numeric AS already_approved
          FROM commerce_goods_receipt_lines grl WHERE grl.id=${line.receipt_line_id}::uuid AND grl.tenant_id=${workspaceId}::uuid FOR UPDATE`;
        if (!check.length || Number(check[0].accepted) < Number(check[0].already_approved) + Number(line.quantity) - 0.0000001) throw new ConflictException('The received quantity is no longer available for this invoice.');
      }
      const receivedCostRows = await tx.$queryRaw<any[]>`SELECT COALESCE(ROUND(SUM(ail.quantity*pol.unit_cost_minor)),0)::bigint AS received_cost_minor
        FROM ap_supplier_invoice_lines ail JOIN commerce_purchase_order_lines pol ON pol.id=ail.purchase_order_line_id AND pol.tenant_id=ail.tenant_id
        WHERE ail.tenant_id=${workspaceId}::uuid AND ail.invoice_id=${invoiceId}::uuid`;
      const receivedCostMinor = Number(receivedCostRows[0]?.received_cost_minor ?? 0);
      const invoiceSubtotalMinor = Number(invoice.subtotal_minor);
      const invoiceTaxMinor = Number(invoice.tax_minor);
      const priceVarianceMinor = invoiceSubtotalMinor - receivedCostMinor;
      const postingLines: Array<{accountKey:string;debitMinor?:number;creditMinor?:number;description?:string}> = [];
      if(receivedCostMinor > 0) postingLines.push({accountKey:'goods_received_not_invoiced',debitMinor:receivedCostMinor,description:`Clear received-goods accrual - ${invoice.invoice_number}`});
      if(priceVarianceMinor > 0) postingLines.push({accountKey:'purchase_price_variance',debitMinor:priceVarianceMinor,description:`Supplier price variance - ${invoice.invoice_number}`});
      if(priceVarianceMinor < 0) postingLines.push({accountKey:'purchase_price_variance',creditMinor:Math.abs(priceVarianceMinor),description:`Supplier price variance credit - ${invoice.invoice_number}`});
      if(invoiceTaxMinor > 0) postingLines.push({accountKey:'input_tax',debitMinor:invoiceTaxMinor,description:`Recoverable input tax - ${invoice.invoice_number}`});
      postingLines.push({accountKey:'accounts_payable',creditMinor:Number(invoice.total_minor),description:`Supplier payable - ${invoice.invoice_number}`});
      await postLedgerJournal(tx,{tenantId:workspaceId,branchId,actorUserId:actor.userId,sourceType:'supplier_invoice_approved',sourceId:invoiceId,memo:`Supplier invoice ${invoice.invoice_number}`,entryDate:isoDate(invoice.bill_date),lines:postingLines});
      await tx.$executeRaw`UPDATE ap_supplier_invoices SET status='approved',approved_by_user_id=${actor.userId}::uuid,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=${invoiceId}::uuid`;
      await this.invoiceProjection(tx, workspaceId, branchId, invoiceId);
      await this.event(tx, workspaceId, branchId, 'purchase-invoices', invoiceId, 'supplier_invoice.approved', { invoiceNumber: invoice.invoice_number, totalMinor: invoice.total_minor }, actor.userId, `ap-invoice-approved:${invoiceId}`);
      await this.audit(tx, workspaceId, actor.userId, 'supplier_invoice.approved', 'supplier_invoice', invoiceId);
      return { id: invoiceId, status: 'approved' };
    }, { isolationLevel: 'Serializable' });
  }

  @Post('invoices/:invoiceId/void')
  @UseGuards(CsrfGuard)
  async voidDraftInvoice(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('invoiceId') invoiceId: string, @Req() req: FastifyRequest) {
    const actor = await this.access(req, workspaceId, branchId); uuid(invoiceId, 'Supplier invoice ID');
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<any[]>`SELECT * FROM ap_supplier_invoices WHERE id=${invoiceId}::uuid AND tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid FOR UPDATE`;
      const invoice = rows[0]; if (!invoice) throw new NotFoundException('Supplier invoice not found.');
      if (invoice.status === 'void') return { id: invoiceId, status: 'void' };
      if (invoice.status !== 'draft') throw new ConflictException('Only a draft supplier invoice can be voided.');
      await tx.$executeRaw`UPDATE ap_supplier_invoices SET status='void',updated_at=CURRENT_TIMESTAMP WHERE id=${invoiceId}::uuid`;
      await this.invoiceProjection(tx, workspaceId, branchId, invoiceId);
      await this.event(tx, workspaceId, branchId, 'purchase-invoices', invoiceId, 'supplier_invoice.voided', {}, actor.userId, `ap-invoice-void:${invoiceId}`);
      await this.audit(tx, workspaceId, actor.userId, 'supplier_invoice.voided', 'supplier_invoice', invoiceId);
      return { id: invoiceId, status: 'void' };
    }, { isolationLevel: 'Serializable' });
  }

  @Get('payments')
  async payments(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest) {
    await this.access(req, workspaceId, branchId);
    const rows = await this.prisma.$queryRaw<any[]>`SELECT p.*,COALESCE(a.allocations,'[]'::jsonb) AS allocations
      FROM ap_supplier_payments p LEFT JOIN (
        SELECT x.payment_id,jsonb_agg(jsonb_build_object('invoiceId',x.invoice_id,'invoiceNumber',i.invoice_number,'supplierInvoiceNumber',i.supplier_invoice_number,'amountMinor',x.amount_minor)) AS allocations
        FROM ap_supplier_payment_allocations x JOIN ap_supplier_invoices i ON i.id=x.invoice_id GROUP BY x.payment_id
      ) a ON a.payment_id=p.id WHERE p.tenant_id=${workspaceId}::uuid AND p.branch_id=${branchId}::uuid ORDER BY p.payment_date DESC,p.created_at DESC LIMIT 500`;
    return rows.map((row) => ({ id: row.id, paymentNumber: row.payment_number, supplierName: row.supplier_name, supplierRecordId: row.supplier_record_id ?? undefined, paymentDate: isoDate(row.payment_date), method: row.method, reference: row.reference ?? undefined, account: row.account, amountMinor: Number(row.amount_minor), currency: row.currency, allocations: (row.allocations ?? []).map((a: any) => ({ ...a, amountMinor: Number(a.amountMinor) })) }));
  }

  private async paymentById(tenantId: string, branchId: string, paymentId: string) {
    const rows = await this.prisma.$queryRaw<any[]>`SELECT p.*,COALESCE(a.allocations,'[]'::jsonb) AS allocations
      FROM ap_supplier_payments p LEFT JOIN (
        SELECT x.payment_id,jsonb_agg(jsonb_build_object('invoiceId',x.invoice_id,'invoiceNumber',i.invoice_number,'supplierInvoiceNumber',i.supplier_invoice_number,'amountMinor',x.amount_minor)) AS allocations
        FROM ap_supplier_payment_allocations x JOIN ap_supplier_invoices i ON i.id=x.invoice_id GROUP BY x.payment_id
      ) a ON a.payment_id=p.id WHERE p.id=${paymentId}::uuid AND p.tenant_id=${tenantId}::uuid AND p.branch_id=${branchId}::uuid LIMIT 1`;
    const row = rows[0]; if (!row) throw new NotFoundException('Supplier payment not found.');
    return { id: row.id, paymentNumber: row.payment_number, supplierName: row.supplier_name, supplierRecordId: row.supplier_record_id ?? undefined, paymentDate: isoDate(row.payment_date), method: row.method, reference: row.reference ?? undefined, account: row.account, amountMinor: Number(row.amount_minor), currency: row.currency, allocations: (row.allocations ?? []).map((a: any) => ({ ...a, amountMinor: Number(a.amountMinor) })) };
  }

  @Post('payments')
  @UseGuards(CsrfGuard)
  async recordPayment(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Body() raw: unknown, @Headers('idempotency-key') idempotencyHeader: string | undefined, @Req() req: ReqBody) {
    const actor = await this.access(req, workspaceId, branchId); const body = object(raw);
    const idempotencyKey = text(idempotencyHeader, 'Idempotency key', 200)!;
    const paymentDate = dateValue(body.paymentDate, 'Payment date'); const method = text(body.method, 'Payment method', 40)!;
    if (!PAYMENT_METHODS.has(method)) throw new BadRequestException('Choose a supported supplier-payment method.');
    const account = text(body.account, 'Payment account', 40)!;
    if (!PAYMENT_ACCOUNTS.has(account)) throw new BadRequestException('Choose a cash, bank or mobile-money account.');
    const reference = text(body.reference, 'Payment reference', 160, true) ?? null;
    if (!Array.isArray(body.allocations) || !body.allocations.length || body.allocations.length > 100) throw new BadRequestException('Allocate the payment to at least one approved supplier invoice.');
    const allocations = body.allocations.map((value) => { const item = object(value, 'Payment allocation'); return { invoiceId: uuid(text(item.invoiceId, 'Invoice ID', 80)!, 'Invoice ID'), amountMinor: amount(item.amountMinor, 'Allocation amount') }; }).sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));
    if (new Set(allocations.map(x => x.invoiceId)).size !== allocations.length) throw new BadRequestException('A payment cannot repeat the same supplier invoice.');
    const totalMinor = allocations.reduce((sum, item) => sum + item.amountMinor, 0);
    amount(totalMinor, 'Payment total');
    const normalized = { paymentDate, method, account, reference, allocations: [...allocations].sort((a,b) => a.invoiceId.localeCompare(b.invoiceId)) };
    const requestHash = sha(JSON.stringify(normalized));
    const existing = await this.prisma.$queryRaw<any[]>`SELECT id,request_hash FROM ap_supplier_payments WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND idempotency_key=${idempotencyKey} LIMIT 1`;
    if (existing.length) {
      if (existing[0].request_hash !== requestHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This request key was already used for different payment data.' });
      return this.paymentById(workspaceId, branchId, String(existing[0].id));
    }

    let paymentId = '';
    try {
      paymentId = await this.prisma.$transaction(async (tx) => {
        const raced = await tx.$queryRaw<any[]>`SELECT id,request_hash FROM ap_supplier_payments WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND idempotency_key=${idempotencyKey} LIMIT 1`;
        if (raced.length) {
          if (raced[0].request_hash !== requestHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This request key was already used for different payment data.' });
          return String(raced[0].id);
        }
        let supplierName = ''; let supplierRecordId: string | null = null; let currency = 'UGX';
        for (const allocation of allocations) {
          const rows = await tx.$queryRaw<any[]>`SELECT i.*,COALESCE(p.paid_minor,0)::bigint AS paid_minor
            FROM ap_supplier_invoices i LEFT JOIN (SELECT invoice_id,SUM(amount_minor)::bigint AS paid_minor FROM ap_supplier_payment_allocations GROUP BY invoice_id) p ON p.invoice_id=i.id
            WHERE i.id=${allocation.invoiceId}::uuid AND i.tenant_id=${workspaceId}::uuid AND i.branch_id=${branchId}::uuid FOR UPDATE OF i`;
          const invoice = rows[0]; if (!invoice) throw new NotFoundException('An invoice in the allocation list was not found in this branch.');
          if (!['approved','partially_paid'].includes(invoice.status)) throw new ConflictException('Only approved and unpaid supplier invoices can receive a payment.');
          if (!supplierName) { supplierName = invoice.supplier_name; supplierRecordId = invoice.supplier_record_id ?? null; currency = invoice.currency; }
          else if (String(invoice.supplier_name).toLowerCase() !== String(supplierName).toLowerCase() || (invoice.supplier_record_id ?? null) !== supplierRecordId || invoice.currency !== currency) throw new BadRequestException('A supplier payment must be allocated to invoices for one supplier and currency.');
          const balance = Number(invoice.total_minor) - Number(invoice.paid_minor ?? 0);
          if (allocation.amountMinor > balance) throw new ConflictException(`${invoice.supplier_invoice_number}: allocation exceeds the outstanding balance of ${balance}.`);
        }
        const id = randomUUID(); const paymentNumber = doc('SPAY');
        await tx.$executeRaw`INSERT INTO ap_supplier_payments
          (id,tenant_id,branch_id,supplier_record_id,supplier_name,payment_number,payment_date,method,account,reference,amount_minor,currency,idempotency_key,request_hash,created_by_user_id)
          VALUES (${id}::uuid,${workspaceId}::uuid,${branchId}::uuid,${supplierRecordId},${supplierName},${paymentNumber},${paymentDate}::date,${method},${account},${reference},${totalMinor},${currency},${idempotencyKey},${requestHash},${actor.userId}::uuid)`;
        const methodLabels: Record<string, string> = { cash: 'Cash', bank_transfer: 'Bank transfer (recorded)', mtn_momo: 'MTN Mobile Money (recorded)', airtel_money: 'Airtel Money (recorded)', cheque: 'Cheque', card_recorded: 'Card (recorded)', other: 'Other' };
        const allocationDescriptions: string[] = [];
        for (const allocation of allocations) {
          const invoiceRef = await tx.$queryRaw<any[]>`SELECT invoice_number,supplier_invoice_number FROM ap_supplier_invoices WHERE id=${allocation.invoiceId}::uuid AND tenant_id=${workspaceId}::uuid`;
          if (invoiceRef[0]) allocationDescriptions.push(`${invoiceRef[0].supplier_invoice_number} (${invoiceRef[0].invoice_number}): ${major(allocation.amountMinor, currency)} ${currency}`);
        }
        await this.moduleRecord(tx, workspaceId, branchId, 'payments', id, {
          id, paymentNumber, direction: 'Money out', partyType: 'Supplier', partyName: supplierName,
          paymentDate, method: methodLabels[method] ?? 'Other', account, reference: reference ?? '', amount: major(totalMinor, currency),
          notes: allocationDescriptions.join('; '), status: 'Recorded', currency, sourceType: 'supplier_invoice_payment',
        });
        for (const allocation of allocations) {
          await tx.$executeRaw`INSERT INTO ap_supplier_payment_allocations (id,tenant_id,payment_id,invoice_id,amount_minor)
            VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${id}::uuid,${allocation.invoiceId}::uuid,${allocation.amountMinor})`;
          const balances = await tx.$queryRaw<any[]>`SELECT i.total_minor,COALESCE(SUM(a.amount_minor),0)::bigint AS paid_minor FROM ap_supplier_invoices i LEFT JOIN ap_supplier_payment_allocations a ON a.invoice_id=i.id WHERE i.id=${allocation.invoiceId}::uuid GROUP BY i.id`;
          const paid = Number(balances[0]?.paid_minor ?? 0); const next = paid >= Number(balances[0]?.total_minor) ? 'paid' : 'partially_paid';
          await tx.$executeRaw`UPDATE ap_supplier_invoices SET status=${next},updated_at=CURRENT_TIMESTAMP WHERE id=${allocation.invoiceId}::uuid`;
          await this.invoiceProjection(tx, workspaceId, branchId, allocation.invoiceId);
          await this.link(tx, workspaceId, branchId, 'purchase-invoices', allocation.invoiceId, 'payments', id, actor.userId);
          await this.event(tx, workspaceId, branchId, 'purchase-invoices', allocation.invoiceId, 'supplier_invoice.payment_allocated', { paymentId: id, paymentNumber, amountMinor: allocation.amountMinor, balanceDueMinor: Math.max(0, Number(balances[0]?.total_minor) - paid) }, actor.userId, `ap-allocation:${id}:${allocation.invoiceId}`);
        }
        const settlementKey = ['cash','bank','mobile_money'].includes(account) ? account : settlementAccountKey(method);
        await postLedgerJournal(tx,{tenantId:workspaceId,branchId,actorUserId:actor.userId,sourceType:'supplier_payment_recorded',sourceId:id,memo:`Supplier payment ${paymentNumber}`,entryDate:paymentDate,lines:[
          {accountKey:'accounts_payable',debitMinor:totalMinor,description:`Settle supplier invoices - ${paymentNumber}`},
          {accountKey:settlementKey,creditMinor:totalMinor,description:`Supplier funds paid - ${account}`},
        ]});
        await this.event(tx, workspaceId, branchId, 'payments', id, 'supplier_payment.recorded', { paymentNumber, supplierName, amountMinor: totalMinor }, actor.userId, `ap-payment:${id}`);
        await this.audit(tx, workspaceId, actor.userId, 'supplier_payment.recorded', 'supplier_payment', id);
        return id;
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      const raced = await this.prisma.$queryRaw<any[]>`SELECT id,request_hash FROM ap_supplier_payments WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND idempotency_key=${idempotencyKey} LIMIT 1`;
      if (raced.length) {
        if (raced[0].request_hash !== requestHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This request key was already used for different payment data.' });
        return this.paymentById(workspaceId, branchId, String(raced[0].id));
      }
      throw error;
    }
    return this.paymentById(workspaceId, branchId, paymentId);
  }

  @Get('summary')
  async summary(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest) {
    await this.access(req, workspaceId, branchId);
    const rows = await this.prisma.$queryRaw<any[]>`SELECT i.total_minor,i.due_date,i.status,COALESCE(p.paid_minor,0)::bigint AS paid_minor
      FROM ap_supplier_invoices i LEFT JOIN (SELECT invoice_id,SUM(amount_minor)::bigint AS paid_minor FROM ap_supplier_payment_allocations GROUP BY invoice_id) p ON p.invoice_id=i.id
      WHERE i.tenant_id=${workspaceId}::uuid AND i.branch_id=${branchId}::uuid AND i.status NOT IN ('draft','void')`;
    const today = todayKampala(); const dayAge = (date: string) => Math.max(0, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000));
    const result = { invoiceCount: rows.length, openCount: 0, overdueCount: 0, outstandingMinor: 0, overdueMinor: 0, currentMinor: 0, days1to30Minor: 0, days31to60Minor: 0, days61to90Minor: 0, over90Minor: 0 };
    for (const row of rows) {
      const balance = Math.max(0, Number(row.total_minor) - Number(row.paid_minor ?? 0)); if (!balance) continue;
      result.openCount++; result.outstandingMinor += balance; const due = isoDate(row.due_date) ?? today;
      if (due >= today) result.currentMinor += balance;
      else { result.overdueCount++; result.overdueMinor += balance; const age = dayAge(due); if (age <= 30) result.days1to30Minor += balance; else if (age <= 60) result.days31to60Minor += balance; else if (age <= 90) result.days61to90Minor += balance; else result.over90Minor += balance; }
    }
    return result;
  }

  @Get('reconciliation')
  async reconciliation(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest) {
    await this.access(req, workspaceId, branchId);
    const rows = await this.prisma.$queryRaw<any[]>`WITH received AS (
        SELECT po.id AS purchase_order_id,COALESCE(ROUND(SUM(grl.quantity_accepted*pol.unit_cost_minor)),0)::bigint AS received_minor,
          COALESCE(SUM(grl.quantity_accepted),0)::numeric AS accepted_quantity
        FROM commerce_purchase_orders po LEFT JOIN commerce_goods_receipts gr ON gr.purchase_order_id=po.id AND gr.tenant_id=po.tenant_id AND gr.branch_id=po.branch_id AND gr.status='posted'
        LEFT JOIN commerce_goods_receipt_lines grl ON grl.receipt_id=gr.id AND grl.tenant_id=gr.tenant_id LEFT JOIN commerce_purchase_order_lines pol ON pol.id=grl.purchase_order_line_id AND pol.tenant_id=po.tenant_id
        WHERE po.tenant_id=${workspaceId}::uuid AND po.branch_id=${branchId}::uuid GROUP BY po.id
      ), billed AS (
        SELECT i.purchase_order_id,SUM(i.subtotal_minor)::bigint AS billed_subtotal_minor,SUM(i.total_minor)::bigint AS billed_total_minor
        FROM ap_supplier_invoices i WHERE i.tenant_id=${workspaceId}::uuid AND i.branch_id=${branchId}::uuid AND i.status NOT IN ('draft','void') GROUP BY i.purchase_order_id
      ), billed_po_value AS (
        SELECT i.purchase_order_id,COALESCE(ROUND(SUM(il.quantity*pol.unit_cost_minor)),0)::bigint AS billed_po_value_minor
        FROM ap_supplier_invoices i JOIN ap_supplier_invoice_lines il ON il.invoice_id=i.id
        JOIN commerce_purchase_order_lines pol ON pol.id=il.purchase_order_line_id AND pol.tenant_id=i.tenant_id AND pol.order_id=i.purchase_order_id
        WHERE i.tenant_id=${workspaceId}::uuid AND i.branch_id=${branchId}::uuid AND i.status NOT IN ('draft','void') GROUP BY i.purchase_order_id
      ), paid AS (
        SELECT i.purchase_order_id,SUM(a.amount_minor)::bigint AS paid_minor FROM ap_supplier_payment_allocations a JOIN ap_supplier_invoices i ON i.id=a.invoice_id
        WHERE i.tenant_id=${workspaceId}::uuid AND i.branch_id=${branchId}::uuid GROUP BY i.purchase_order_id
      )
      SELECT po.id,po.order_number,po.supplier_name,po.status,po.total_minor,COALESCE(r.received_minor,0)::bigint AS received_minor,
        COALESCE(r.accepted_quantity,0)::numeric AS accepted_quantity,COALESCE(b.billed_subtotal_minor,0)::bigint AS billed_subtotal_minor,
        COALESCE(b.billed_total_minor,0)::bigint AS billed_total_minor,COALESCE(bpv.billed_po_value_minor,0)::bigint AS billed_po_value_minor,COALESCE(p.paid_minor,0)::bigint AS paid_minor
      FROM commerce_purchase_orders po LEFT JOIN received r ON r.purchase_order_id=po.id LEFT JOIN billed b ON b.purchase_order_id=po.id LEFT JOIN billed_po_value bpv ON bpv.purchase_order_id=po.id LEFT JOIN paid p ON p.purchase_order_id=po.id
      WHERE po.tenant_id=${workspaceId}::uuid AND po.branch_id=${branchId}::uuid ORDER BY po.created_at DESC LIMIT 500`;
    return rows.map((row) => {
      const received = Number(row.received_minor); const billed = Number(row.billed_subtotal_minor); const billedAtPoCost = Number(row.billed_po_value_minor); const total = Number(row.billed_total_minor); const paid = Number(row.paid_minor);
      return { id: row.id, purchaseOrderNumber: row.order_number, supplierName: row.supplier_name, status: row.status,
        purchaseOrderTotalMinor: Number(row.total_minor), acceptedQuantity: Number(row.accepted_quantity), receivedValueMinor: received,
        billedSubtotalMinor: billed, billedPoValueMinor: billedAtPoCost, unbilledReceivedMinor: Math.max(0, received - billedAtPoCost), billVarianceMinor: billed - billedAtPoCost,
        invoicedTotalMinor: total, paidMinor: paid, payableBalanceMinor: Math.max(0, total - paid) };
    });
  }
}
