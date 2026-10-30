import {
  BadRequestException, ConflictException, Controller, Get, NotFoundException, Param, Post, Patch,
  Body, Req, UseGuards, UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertBranchAccess } from '../authorization/branch-scope';
import { postLedgerJournal } from '../general-ledger/ledger-posting';
import { CsrfGuard } from '../core/csrf.guard';

type Obj = Record<string, unknown>;
type ReqBody = FastifyRequest & { body?: unknown };
type Tx = any;

function cookie(request: FastifyRequest, name: string): string | undefined {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at >= 0 && part.slice(0, at).trim() === name) {
      try { return decodeURIComponent(part.slice(at + 1).trim()); } catch { return undefined; }
    }
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
function quantity(value: unknown, label = 'Quantity'): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000 || Math.round(n * 1000) !== n * 1000) throw new BadRequestException(`${label} must be greater than zero with at most three decimal places.`);
  return n;
}
function nonNegativeQuantity(value: unknown, label = 'Quantity'): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000 || Math.round(n * 1000) !== n * 1000) throw new BadRequestException(`${label} must be zero or greater with at most three decimal places.`);
  return n;
}
function dateValue(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${label} must use YYYY-MM-DD.`);
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new BadRequestException(`${label} is not a valid date.`);
  return value;
}
function doc(prefix: string) { return `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex').toUpperCase()}`; }
function uuid(value: string, label: string): string { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new BadRequestException(`${label} is invalid.`); return value; }
function money(n: number, label: string) { if (!Number.isSafeInteger(n) || n < 0 || n > 2_000_000_000) throw new BadRequestException(`${label} is outside the supported amount range.`); return n; }
function majorAmount(minor: number, currency: string): string { try { const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0; return (minor / (10 ** digits)).toString(); } catch { return String(minor); } }

@Controller('workspaces/:workspaceId/branches/:branchId/commerce')
export class CommerceController {
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

  private async event(tx: Tx, workspaceId: string, branchId: string, moduleId: string, recordId: string | null, type: string, payload: Obj, actorId: string, dedupeKey: string) {
    const id = randomUUID();
    await tx.$executeRaw`INSERT INTO module_domain_events
      (id, tenant_id, branch_id, module_id, record_id, event_type, payload, dedupe_key, actor_user_id)
      VALUES (${id}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, ${moduleId}, ${recordId}, ${type}, ${JSON.stringify(payload)}::jsonb, ${dedupeKey}, ${actorId}::uuid)
      ON CONFLICT (tenant_id, dedupe_key) DO NOTHING`;
  }

  private async moduleRecord(tx: Tx, workspaceId: string, branchId: string, moduleId: string, recordId: string, data: Obj) {
    await tx.$executeRaw`INSERT INTO module_records (id, tenant_id, branch_id, module_id, record_id, data, version)
      VALUES (${randomUUID()}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, ${moduleId}, ${recordId}, ${JSON.stringify(data)}::jsonb, 1)
      ON CONFLICT (tenant_id, branch_id, module_id, record_id)
      DO UPDATE SET data = EXCLUDED.data, version = module_records.version + 1, updated_at = CURRENT_TIMESTAMP`;
  }

  private async link(tx: Tx, workspaceId: string, branchId: string, sourceModule: string, sourceId: string, targetModule: string, targetId: string, actorId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`INSERT INTO module_record_links
      (id, tenant_id, branch_id, source_module_id, source_record_id, target_module_id, target_record_id, relation_type, created_by_user_id)
      VALUES (${randomUUID()}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, ${sourceModule}, ${sourceId}, ${targetModule}, ${targetId}, 'workflow_handoff', ${actorId}::uuid)
      ON CONFLICT (tenant_id, branch_id, source_module_id, source_record_id, target_module_id, target_record_id, relation_type)
      DO UPDATE SET relation_type = EXCLUDED.relation_type RETURNING id`;
    await this.event(tx, workspaceId, branchId, sourceModule, sourceId, 'record.linked', { targetModuleId: targetModule, targetRecordId: targetId }, actorId, `commerce-link:${rows[0]!.id}:s`);
    await this.event(tx, workspaceId, branchId, targetModule, targetId, 'record.linked', { sourceModuleId: sourceModule, sourceRecordId: sourceId }, actorId, `commerce-link:${rows[0]!.id}:t`);
  }

  private async moduleRecordExists(tx: Tx, tenantId: string, branchId: string, moduleId: string, recordId: string) {
    const rows = await tx.$queryRaw<Array<{ data: any }>>`SELECT data FROM module_records WHERE tenant_id = ${tenantId}::uuid AND branch_id = ${branchId}::uuid AND module_id = ${moduleId} AND record_id = ${recordId} LIMIT 1`;
    if (!rows.length) throw new NotFoundException(`${moduleId} record was not found in this branch.`);
    return rows[0]!.data as Obj;
  }

  private async productsFor(tx: Tx, tenantId: string, linesValue: unknown, priceKind: 'sell' | 'cost') {
    if (!Array.isArray(linesValue) || !linesValue.length || linesValue.length > 100) throw new BadRequestException('Add between 1 and 100 product lines.');
    const normalized: Array<{ product: any; quantity: number; lineTotal: number }> = [];
    const totalsByProduct = new Map<string, number>();
    let totalMinor = 0;
    for (const raw of linesValue) {
      const line = object(raw, 'Product line');
      const productId = text(line.productId, 'Product', 80)!;
      const qty = quantity(line.quantity);
      const product = await tx.product.findFirst({ where: { id: productId, tenantId, active: true } });
      if (!product) throw new NotFoundException('A selected product is inactive or unavailable.');
      const unit = priceKind === 'sell' ? product.sellingPriceMinor : product.costPriceMinor;
      const lineTotal = money(Math.round(unit * qty), 'Line total');
      totalMinor = money(totalMinor + lineTotal, 'Order total');
      totalsByProduct.set(productId, (totalsByProduct.get(productId) ?? 0) + qty);
      normalized.push({ product, quantity: qty, lineTotal });
    }
    return { lines: normalized, totalsByProduct, totalMinor };
  }

  private async audit(tx: Tx, tenantId: string, actorId: string, action: string, type: string, id: string) {
    await tx.auditEvent.create({ data: { tenantId, actorUserId: actorId, action, resourceType: type, resourceId: id } });
  }

  @Get('sales-orders')
  async listSalesOrders(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest) {
    await this.access(req, workspaceId, branchId);
    const orders = await this.prisma.$queryRaw<any[]>`SELECT o.*, COALESCE(jsonb_agg(jsonb_build_object('id',l.id,'productId',l.product_id,'productName',l.product_name_snapshot,'sku',l.sku_snapshot,'quantity',l.quantity,'quantityFulfilled',l.quantity_fulfilled,'unitPriceMinor',l.unit_price_minor,'lineTotalMinor',l.line_total_minor)) FILTER (WHERE l.id IS NOT NULL), '[]'::jsonb) AS lines
      FROM commerce_sales_orders o LEFT JOIN commerce_sales_order_lines l ON l.order_id = o.id
      WHERE o.tenant_id = ${workspaceId}::uuid AND o.branch_id = ${branchId}::uuid GROUP BY o.id ORDER BY o.created_at DESC LIMIT 250`;
    return orders.map((o) => this.formatOrder(o));
  }

  private formatOrder(o: any) { return { id: o.id, orderNumber: o.order_number, customerRecordId: o.customer_record_id ?? undefined, customerName: o.customer_name ?? undefined, deliveryAddress: o.delivery_address ?? undefined, courier: o.courier ?? undefined, expectedDate: o.expected_date ? new Date(o.expected_date).toISOString().slice(0,10) : undefined, status: o.status, totalMinor: o.total_minor, createdAt: o.created_at instanceof Date ? o.created_at.toISOString() : o.created_at, lines: (o.lines ?? []).map((l: any) => ({ ...l, quantity: Number(l.quantity), quantityFulfilled: Number(l.quantityFulfilled), unitPriceMinor: Number(l.unitPriceMinor), lineTotalMinor: Number(l.lineTotalMinor) })) }; }

  @Post('sales-orders')
  @UseGuards(CsrfGuard)
  async createSalesOrder(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Body() raw: unknown, @Req() req: ReqBody) {
    const actor = await this.access(req, workspaceId, branchId); const body = object(raw);
    const customerId = text(body.customerRecordId, 'Customer record', 160, true) ?? null;
    const customerName = text(body.customerName, 'Customer name', 180, true) ?? null;
    const deliveryAddress = text(body.deliveryAddress, 'Delivery address', 500, true) ?? null;
    const courier = text(body.courier, 'Courier / driver', 160, true) ?? null;
    const expectedDate = dateValue(body.expectedDate, 'Expected delivery date');
    const parsed = await this.prisma.$transaction(async (tx) => {
      if (customerId) { const customer = await this.moduleRecordExists(tx, workspaceId, branchId, 'customers', customerId); if (customer.status && customer.status !== 'Active') throw new ConflictException('The selected customer is not active.'); }
      const values = await this.productsFor(tx, workspaceId, body.lines, 'sell');
      const tenant = await tx.tenant.findUnique({ where: { id: workspaceId }, select: { currency: true } }); const currency = tenant?.currency ?? 'UGX';
      const id = randomUUID(); const orderNumber = doc('SO'); const createdAt = new Date().toISOString();
      await tx.$executeRaw`INSERT INTO commerce_sales_orders (id,tenant_id,branch_id,order_number,customer_record_id,customer_name,delivery_address,courier,expected_date,status,total_minor,created_by_user_id)
        VALUES (${id}::uuid,${workspaceId}::uuid,${branchId}::uuid,${orderNumber},${customerId},${customerName},${deliveryAddress},${courier},${expectedDate}::date,'draft',${values.totalMinor},${actor.userId}::uuid)`;
      for (const line of values.lines) await tx.$executeRaw`INSERT INTO commerce_sales_order_lines (id,tenant_id,order_id,product_id,product_name_snapshot,sku_snapshot,quantity,unit_price_minor,line_total_minor)
        VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${id}::uuid,${line.product.id}::uuid,${line.product.name},${line.product.sku},${String(line.quantity)}::numeric,${line.product.sellingPriceMinor},${line.lineTotal})`;
      await this.moduleRecord(tx,workspaceId,branchId,'sales-orders',id,{ id, orderNumber, customer: customerName ?? '', customerRecordId: customerId ?? '', deliveryAddress: deliveryAddress ?? '', courier: courier ?? '', orderDate: createdAt.slice(0,10), expectedDate: expectedDate ?? '', itemSummary: values.lines.map(l=>l.product.name).join(', '), quantity: String(values.lines.reduce((sum,l)=>sum+l.quantity,0)), unitPrice: values.lines.length ? majorAmount(values.lines[0]!.product.sellingPriceMinor, currency) : '0', total: majorAmount(values.totalMinor, currency), totalMinor: String(values.totalMinor), currency, status:'Draft', createdAt });
      if (customerId) await this.link(tx,workspaceId,branchId,'customers',customerId,'sales-orders',id,actor.userId);
      await this.event(tx,workspaceId,branchId,'sales-orders',id,'sales_order.created',{ orderNumber, totalMinor:values.totalMinor },actor.userId,`sales-order-created:${id}`);
      await this.audit(tx,workspaceId,actor.userId,'sales_order.created','sales_order',id);
      return { id, orderNumber, customerRecordId:customerId ?? undefined, customerName:customerName ?? undefined, deliveryAddress:deliveryAddress ?? undefined, courier:courier ?? undefined, expectedDate:expectedDate ?? undefined, status:'draft', totalMinor:values.totalMinor, createdAt, lines:values.lines.map((l)=>({ productId:l.product.id,productName:l.product.name,sku:l.product.sku,quantity:l.quantity,quantityFulfilled:0,unitPriceMinor:l.product.sellingPriceMinor,lineTotalMinor:l.lineTotal })) };
    },{isolationLevel:'Serializable'});
    return parsed;
  }

  @Post('sales-orders/:orderId/confirm')
  @UseGuards(CsrfGuard)
  async confirmSalesOrder(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('orderId') orderId:string,@Req() req:FastifyRequest) {
    const actor=await this.access(req,workspaceId,branchId); uuid(orderId,'Sales order ID');
    return this.prisma.$transaction(async(tx)=>{
      const rows=await tx.$queryRaw<any[]>`SELECT * FROM commerce_sales_orders WHERE id=${orderId}::uuid AND tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid FOR UPDATE`;
      const order=rows[0]; if(!order) throw new NotFoundException('Sales order not found.'); if(order.status!=='draft') throw new ConflictException('Only a draft sales order can be confirmed.');
      const lines=await tx.$queryRaw<any[]>`SELECT * FROM commerce_sales_order_lines WHERE order_id=${orderId}::uuid`;
      const productIds=[...new Set(lines.map((line:any)=>String(line.product_id)))].sort();
      if(productIds.length) await tx.$queryRaw`SELECT id FROM products WHERE tenant_id=${workspaceId}::uuid AND id=ANY(${productIds}::uuid[]) ORDER BY id FOR UPDATE`;
      for(const line of lines){
        const product=await tx.product.findFirst({where:{id:line.product_id,tenantId:workspaceId,active:true}}); if(!product) throw new NotFoundException('An ordered product is no longer active.');
        if(!product.trackStock) continue;
        const movement=await tx.stockMovement.aggregate({where:{tenantId:workspaceId,branchId,productId:line.product_id},_sum:{quantityDelta:true}});
        const reserved=await tx.$queryRaw<Array<{qty:any}>>`SELECT COALESCE(SUM(quantity_reserved),0) AS qty FROM commerce_stock_reservations WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND product_id=${line.product_id}::uuid`;
        const available=Number(movement._sum.quantityDelta??0)-Number(reserved[0]?.qty??0);
        if(available<Number(line.quantity)) throw new ConflictException({code:'INSUFFICIENT_STOCK',message:`${product.name} has ${available} available but this order needs ${line.quantity}.`});
        await tx.$executeRaw`INSERT INTO commerce_stock_reservations (id,tenant_id,branch_id,order_id,order_line_id,product_id,quantity_reserved)
          VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${branchId}::uuid,${orderId}::uuid,${line.id}::uuid,${line.product_id}::uuid,${line.quantity})`;
      }
      await tx.$executeRaw`UPDATE commerce_sales_orders SET status='confirmed',updated_at=CURRENT_TIMESTAMP WHERE id=${orderId}::uuid`;
      await tx.$executeRaw`UPDATE module_records SET data=jsonb_set(data,'{status}','"Confirmed"'::jsonb),version=version+1,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND module_id='sales-orders' AND record_id=${orderId}`;
      await this.event(tx,workspaceId,branchId,'sales-orders',orderId,'sales_order.confirmed',{},actor.userId,`sales-order-confirmed:${orderId}`);
      await this.audit(tx,workspaceId,actor.userId,'sales_order.confirmed','sales_order',orderId);
      return {id:orderId,status:'confirmed'};
    },{isolationLevel:'Serializable'});
  }

  @Post('sales-orders/:orderId/fulfil')
  @UseGuards(CsrfGuard)
  async fulfilSalesOrder(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('orderId') orderId:string,@Body() raw:unknown,@Req() req:ReqBody) {
    const actor=await this.access(req,workspaceId,branchId); const body=object(raw); uuid(orderId,'Sales order ID');
    return this.prisma.$transaction(async(tx)=>{
      const rows=await tx.$queryRaw<any[]>`SELECT * FROM commerce_sales_orders WHERE id=${orderId}::uuid AND tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid FOR UPDATE`;
      const order=rows[0]; if(!order) throw new NotFoundException('Sales order not found.'); if(!['confirmed','partially_fulfilled'].includes(order.status)) throw new ConflictException('Confirm the order before dispatching it.');
      const orderLines=await tx.$queryRaw<any[]>`SELECT * FROM commerce_sales_order_lines WHERE order_id=${orderId}::uuid FOR UPDATE`;
      const productIds=[...new Set(orderLines.map((line:any)=>String(line.product_id)))].sort();
      if(productIds.length) await tx.$queryRaw`SELECT id FROM products WHERE tenant_id=${workspaceId}::uuid AND id=ANY(${productIds}::uuid[]) ORDER BY id FOR UPDATE`;
      const requested=Array.isArray(body.lines)?body.lines.map((v)=>{const r=object(v,'Fulfilment line');return {orderLineId:text(r.orderLineId,'Order line ID',80)!,quantity:quantity(r.quantity,'Fulfilled quantity')}}):null;
      if(requested && new Set(requested.map(x=>x.orderLineId)).size!==requested.length) throw new BadRequestException('A fulfilment request cannot repeat the same order line.');
      const fulfilLines:Array<{line:any;qty:number;product:any}>=[];
      for(const line of orderLines){
        const outstanding=Number(line.quantity)-Number(line.quantity_fulfilled); const selected=requested?.find((x)=>x.orderLineId===line.id)?.quantity??(requested?0:outstanding);
        if(selected<=0) continue; if(selected>outstanding) throw new ConflictException(`Cannot fulfil more than ${outstanding} remaining for ${line.product_name_snapshot}.`);
        const product=await tx.product.findFirst({where:{id:line.product_id,tenantId:workspaceId,active:true}}); if(!product) throw new NotFoundException('An ordered product is unavailable.');
        if(product.trackStock){
          const reservation=await tx.$queryRaw<Array<{qty:any}>>`SELECT quantity_reserved AS qty FROM commerce_stock_reservations WHERE order_line_id=${line.id}::uuid FOR UPDATE`;
          const reserved=Number(reservation[0]?.qty??0); if(reserved<selected) throw new ConflictException('The stock reservation is no longer sufficient. Reconfirm the order with an administrator.');
          const allReserved=await tx.$queryRaw<Array<{qty:any}>>`SELECT COALESCE(SUM(quantity_reserved),0) AS qty FROM commerce_stock_reservations WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND product_id=${line.product_id}::uuid`;
          const balance=await tx.stockMovement.aggregate({where:{tenantId:workspaceId,branchId,productId:line.product_id},_sum:{quantityDelta:true}});
          if(Number(balance._sum.quantityDelta??0)<Number(allReserved[0]?.qty??0)) throw new ConflictException({code:'INSUFFICIENT_STOCK',message:`${product.name} stock has fallen below committed reservations. Resolve open orders before dispatch.`});
        }
        fulfilLines.push({line,qty:selected,product});
      }
      if(!fulfilLines.length) throw new BadRequestException('Enter at least one unfulfilled quantity.');
      const total=fulfilLines.reduce((sum,x)=>sum+Math.round(x.product.sellingPriceMinor*x.qty),0); money(total,'Fulfilment total');
      const sale=await tx.sale.create({data:{tenantId:workspaceId,branchId,receiptNumber:doc('LX'),customerName:order.customer_name,totalMinor:total,status:'completed'}});
      const fulfilmentId=randomUUID(); const fulfilmentNumber=doc('FUL');
      await tx.$executeRaw`INSERT INTO commerce_fulfilments (id,tenant_id,branch_id,order_id,sale_id,fulfilment_number,status,created_by_user_id)
        VALUES (${fulfilmentId}::uuid,${workspaceId}::uuid,${branchId}::uuid,${orderId}::uuid,${sale.id}::uuid,${fulfilmentNumber},'dispatched',${actor.userId}::uuid)`;
      for(const item of fulfilLines){
        const lineTotal=Math.round(item.product.sellingPriceMinor*item.qty);
        await tx.saleLine.create({data:{tenantId:workspaceId,saleId:sale.id,productId:item.product.id,productNameSnapshot:item.product.name,quantity:String(item.qty),unitPriceMinor:item.product.sellingPriceMinor,lineTotalMinor:lineTotal}});
        if(item.product.trackStock){
          await tx.stockMovement.create({data:{tenantId:workspaceId,branchId,productId:item.product.id,type:'sale',quantityDelta:String(-item.qty),reason:`Fulfilment ${fulfilmentNumber}`,sourceId:fulfilmentId}});
          await tx.$executeRaw`UPDATE commerce_stock_reservations SET quantity_reserved=quantity_reserved-${String(item.qty)}::numeric WHERE order_line_id=${item.line.id}::uuid`;
        }
        await tx.$executeRaw`UPDATE commerce_sales_order_lines SET quantity_fulfilled=quantity_fulfilled+${String(item.qty)}::numeric WHERE id=${item.line.id}::uuid`;
        await tx.$executeRaw`INSERT INTO commerce_fulfilment_lines (id,tenant_id,fulfilment_id,order_line_id,product_id,quantity)
          VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${fulfilmentId}::uuid,${item.line.id}::uuid,${item.product.id}::uuid,${String(item.qty)}::numeric)`;
      }
      const remaining=await tx.$queryRaw<Array<{qty:any}>>`SELECT COALESCE(SUM(quantity-quantity_fulfilled),0) AS qty FROM commerce_sales_order_lines WHERE order_id=${orderId}::uuid`;
      const orderStatus=Number(remaining[0]?.qty??0)===0?'fulfilled':'partially_fulfilled';
      await tx.$executeRaw`UPDATE commerce_sales_orders SET status=${orderStatus},updated_at=CURRENT_TIMESTAMP WHERE id=${orderId}::uuid`;
      await tx.$executeRaw`UPDATE module_records SET data=jsonb_set(data,'{status}',to_jsonb(${orderStatus==='fulfilled'?'Fulfilled':'Partially fulfilled'}::text)),version=version+1,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND module_id='sales-orders' AND record_id=${orderId}`;
      const deliveryId=randomUUID();const deliveryNumber=doc('DLV');
      const deliveryData={id:deliveryId,deliveryNumber,salesOrder:order.order_number,customer:order.customer_name??'',deliveryAddress:order.delivery_address??'',courier:order.courier??'',expectedDate:order.expected_date?new Date(order.expected_date).toISOString().slice(0,10):'',status:'Dispatched',dispatchDate:new Date().toISOString().slice(0,10)};
      await tx.$executeRaw`INSERT INTO commerce_deliveries (id,tenant_id,branch_id,fulfilment_id,delivery_number,recipient_name,delivery_address,courier,expected_date,status) VALUES (${deliveryId}::uuid,${workspaceId}::uuid,${branchId}::uuid,${fulfilmentId}::uuid,${deliveryNumber},${order.customer_name},${order.delivery_address},${order.courier},${order.expected_date},'dispatched')`;
      await this.moduleRecord(tx,workspaceId,branchId,'deliveries',deliveryId,deliveryData);
      await this.link(tx,workspaceId,branchId,'sales-orders',orderId,'deliveries',deliveryId,actor.userId);
      await this.event(tx,workspaceId,branchId,'sales-orders',orderId,'sales_order.fulfilled',{fulfilmentId,deliveryId,fulfilmentNumber,deliveryNumber,saleId:sale.id,quantity:fulfilLines.reduce((s,x)=>s+x.qty,0)},actor.userId,`fulfilment:${fulfilmentId}`);
      await this.audit(tx,workspaceId,actor.userId,'sales_order.fulfilled','sales_order',orderId);
      return {fulfilmentId,fulfilmentNumber,deliveryId,deliveryNumber,saleId:sale.id,status:orderStatus,dispatchedLines:fulfilLines.map(x=>({productId:x.product.id,productName:x.product.name,quantity:x.qty})),totalMinor:total};
    },{isolationLevel:'Serializable'});
  }

  @Get('purchase-orders')
  async listPurchaseOrders(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Req() req:FastifyRequest){
    await this.access(req,workspaceId,branchId);
    const rows=await this.prisma.$queryRaw<any[]>`SELECT o.*,COALESCE(jsonb_agg(jsonb_build_object('id',l.id,'productId',l.product_id,'productName',l.product_name_snapshot,'sku',l.sku_snapshot,'quantity',l.quantity,'quantityAccepted',l.quantity_accepted,'quantityRejected',l.quantity_rejected,'unitCostMinor',l.unit_cost_minor,'lineTotalMinor',l.line_total_minor)) FILTER(WHERE l.id IS NOT NULL),'[]'::jsonb) AS lines FROM commerce_purchase_orders o LEFT JOIN commerce_purchase_order_lines l ON l.order_id=o.id WHERE o.tenant_id=${workspaceId}::uuid AND o.branch_id=${branchId}::uuid GROUP BY o.id ORDER BY o.created_at DESC LIMIT 250`;
    return rows.map(o=>({id:o.id,orderNumber:o.order_number,supplierRecordId:o.supplier_record_id??undefined,supplierName:o.supplier_name,expectedDate:o.expected_date?new Date(o.expected_date).toISOString().slice(0,10):undefined,status:o.status,totalMinor:o.total_minor,createdAt:o.created_at instanceof Date?o.created_at.toISOString():o.created_at,lines:(o.lines??[]).map((l:any)=>({...l,quantity:Number(l.quantity),quantityAccepted:Number(l.quantityAccepted),quantityRejected:Number(l.quantityRejected),unitCostMinor:Number(l.unitCostMinor),lineTotalMinor:Number(l.lineTotalMinor)}))}));
  }

  @Post('purchase-orders')
  @UseGuards(CsrfGuard)
  async createPurchaseOrder(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Body() raw:unknown,@Req() req:ReqBody){
    const actor=await this.access(req,workspaceId,branchId);const body=object(raw);const supplierId=text(body.supplierRecordId,'Supplier record',160,true)??null;const supplierName=text(body.supplierName,'Supplier name',180)!;const expectedDate=dateValue(body.expectedDate,'Expected delivery date');
    return this.prisma.$transaction(async(tx)=>{
      if(supplierId){const supplier=await this.moduleRecordExists(tx,workspaceId,branchId,'suppliers',supplierId);if(supplier.status&&supplier.status!=='Active')throw new ConflictException('The selected supplier is not active.');}
      const values=await this.productsFor(tx,workspaceId,body.lines,'cost');const tenant=await tx.tenant.findUnique({where:{id:workspaceId},select:{currency:true}});const currency=tenant?.currency??'UGX';const id=randomUUID();const orderNumber=doc('PO');const createdAt=new Date().toISOString();
      await tx.$executeRaw`INSERT INTO commerce_purchase_orders (id,tenant_id,branch_id,order_number,supplier_record_id,supplier_name,expected_date,status,total_minor,created_by_user_id) VALUES (${id}::uuid,${workspaceId}::uuid,${branchId}::uuid,${orderNumber},${supplierId},${supplierName},${expectedDate}::date,'draft',${values.totalMinor},${actor.userId}::uuid)`;
      for(const line of values.lines)await tx.$executeRaw`INSERT INTO commerce_purchase_order_lines (id,tenant_id,order_id,product_id,product_name_snapshot,sku_snapshot,quantity,unit_cost_minor,line_total_minor) VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${id}::uuid,${line.product.id}::uuid,${line.product.name},${line.product.sku},${String(line.quantity)}::numeric,${line.product.costPriceMinor},${line.lineTotal})`;
      await this.moduleRecord(tx,workspaceId,branchId,'purchases',id,{id,poNumber:orderNumber,supplier:supplierName,supplierRecordId:supplierId??'',orderDate:createdAt.slice(0,10),expectedDate:expectedDate??'',itemSummary:values.lines.map(l=>l.product.name).join(', '),quantity:String(values.lines.reduce((sum,l)=>sum+l.quantity,0)),unitCost:values.lines.length?majorAmount(values.lines[0]!.product.costPriceMinor,currency):'0',total:majorAmount(values.totalMinor,currency),totalMinor:String(values.totalMinor),currency,status:'Draft',createdAt});
      if(supplierId)await this.link(tx,workspaceId,branchId,'suppliers',supplierId,'purchases',id,actor.userId);
      await this.event(tx,workspaceId,branchId,'purchases',id,'purchase_order.created',{orderNumber,totalMinor:values.totalMinor},actor.userId,`purchase-order-created:${id}`);
      await this.audit(tx,workspaceId,actor.userId,'purchase_order.created','purchase_order',id);
      return{id,orderNumber,supplierName,expectedDate:expectedDate??undefined,status:'draft',totalMinor:values.totalMinor,createdAt,lines:values.lines.map(l=>({productId:l.product.id,productName:l.product.name,sku:l.product.sku,quantity:l.quantity,quantityAccepted:0,quantityRejected:0,unitCostMinor:l.product.costPriceMinor,lineTotalMinor:l.lineTotal}))};
    },{isolationLevel:'Serializable'});
  }

  @Post('purchase-orders/:orderId/order')
  @UseGuards(CsrfGuard)
  async orderPurchaseOrder(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('orderId') orderId:string,@Req() req:FastifyRequest){
    const actor=await this.access(req,workspaceId,branchId); uuid(orderId,'Purchase order ID');
    return this.prisma.$transaction(async(tx)=>{const rows=await tx.$queryRaw<any[]>`SELECT * FROM commerce_purchase_orders WHERE id=${orderId}::uuid AND tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid FOR UPDATE`;const row=rows[0];if(!row)throw new NotFoundException('Purchase order not found.');if(row.status!=='draft')throw new ConflictException('Only a draft purchase order can be ordered.');await tx.$executeRaw`UPDATE commerce_purchase_orders SET status='ordered',updated_at=CURRENT_TIMESTAMP WHERE id=${orderId}::uuid`;await tx.$executeRaw`UPDATE module_records SET data=jsonb_set(data,'{status}','"Ordered"'::jsonb),version=version+1,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND module_id='purchases' AND record_id=${orderId}`;await this.event(tx,workspaceId,branchId,'purchases',orderId,'purchase_order.ordered',{},actor.userId,`purchase-order-ordered:${orderId}`);await this.audit(tx,workspaceId,actor.userId,'purchase_order.ordered','purchase_order',orderId);return{id:orderId,status:'ordered'};},{isolationLevel:'Serializable'});
  }

  @Post('purchase-orders/:orderId/receipts')
  @UseGuards(CsrfGuard)
  async receivePurchaseOrder(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('orderId') orderId:string,@Body() raw:unknown,@Req() req:ReqBody){
    const actor=await this.access(req,workspaceId,branchId);uuid(orderId,'Purchase order ID');const body=object(raw);const receiptLineValues=body.lines;if(!Array.isArray(receiptLineValues)||!receiptLineValues.length||receiptLineValues.length>100)throw new BadRequestException('Add at least one counted receipt line.');const reason=text(body.reason,'Receipt note',500,true)??null;const receiptLineIds=receiptLineValues.map((value)=>object(value,'Receipt line').orderLineId);if(receiptLineIds.some((value)=>typeof value!=='string')||new Set(receiptLineIds).size!==receiptLineIds.length)throw new BadRequestException('A goods receipt cannot repeat a purchase-order line.');
    return this.prisma.$transaction(async(tx)=>{
      const orders=await tx.$queryRaw<any[]>`SELECT * FROM commerce_purchase_orders WHERE id=${orderId}::uuid AND tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid FOR UPDATE`;const order=orders[0];if(!order)throw new NotFoundException('Purchase order not found.');if(!['ordered','partially_received'].includes(order.status))throw new ConflictException('Only an ordered purchase order can receive goods.');
      const poLines=await tx.$queryRaw<any[]>`SELECT * FROM commerce_purchase_order_lines WHERE order_id=${orderId}::uuid FOR UPDATE`;const received:Array<{line:any;accepted:number;rejected:number;product:any;batch?:string;expiry?:string;rejectReason?:string}> = [];
      const selectedLineIds = new Set(receiptLineIds as string[]);
      const selectedProductIds = [...new Set(poLines.filter((line:any)=>selectedLineIds.has(String(line.id))).map((line:any)=>String(line.product_id)))].sort();
      if (selectedProductIds.length) await tx.$queryRaw`SELECT id FROM products WHERE tenant_id=${workspaceId}::uuid AND id=ANY(${selectedProductIds}::uuid[]) ORDER BY id FOR UPDATE`;
      for(const itemValue of receiptLineValues){const item=object(itemValue,'Receipt line');const line=poLines.find(l=>l.id===item.orderLineId);if(!line)throw new BadRequestException('A receipt line does not belong to this purchase order.');const accepted=item.acceptedQuantity===undefined||item.acceptedQuantity===''?0:nonNegativeQuantity(item.acceptedQuantity,'Accepted quantity');const rejected=item.rejectedQuantity===undefined||item.rejectedQuantity===''?0:nonNegativeQuantity(item.rejectedQuantity,'Rejected quantity');if(!accepted&&!rejected)throw new BadRequestException('Enter an accepted or rejected quantity for every receipt line.');const remaining=Number(line.quantity)-Number(line.quantity_accepted);if(accepted>remaining)throw new ConflictException(`Accepted quantity exceeds ${remaining} still outstanding for ${line.product_name_snapshot}. Rejected units do not satisfy the purchase commitment.`);const product=await tx.product.findFirst({where:{id:line.product_id,tenantId:workspaceId,active:true}});if(!product)throw new NotFoundException('A purchase-order product is unavailable.');const expiry=dateValue(item.expiryDate,'Expiry date');received.push({line,accepted,rejected,product,batch:text(item.batchNumber,'Batch number',100,true),expiry:expiry??undefined,rejectReason:text(item.rejectionReason,'Rejection reason',300,true)});}
      const receiptId=randomUUID();const receiptNumber=doc('GRN');
      await tx.$executeRaw`INSERT INTO commerce_goods_receipts (id,tenant_id,branch_id,purchase_order_id,receipt_number,status,reason,created_by_user_id) VALUES (${receiptId}::uuid,${workspaceId}::uuid,${branchId}::uuid,${orderId}::uuid,${receiptNumber},'posted',${reason},${actor.userId}::uuid)`;
      let inventoryValueMinor = 0;
      let expenseValueMinor = 0;
      for(const item of received){
        await tx.$executeRaw`INSERT INTO commerce_goods_receipt_lines (id,tenant_id,receipt_id,purchase_order_line_id,product_id,quantity_accepted,quantity_rejected,rejection_reason,batch_number,expiry_date) VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${receiptId}::uuid,${item.line.id}::uuid,${item.product.id}::uuid,${String(item.accepted)}::numeric,${String(item.rejected)}::numeric,${item.rejectReason??reason},${item.batch??null},${item.expiry??null}::date)`;
        await tx.$executeRaw`UPDATE commerce_purchase_order_lines SET quantity_accepted=quantity_accepted+${String(item.accepted)}::numeric,quantity_rejected=quantity_rejected+${String(item.rejected)}::numeric WHERE id=${item.line.id}::uuid`;
        if(item.accepted>0){
          const lineValue = Math.round(item.accepted * Number(item.line.unit_cost_minor));
          if(item.product.trackStock){
            inventoryValueMinor += lineValue;
            await tx.stockMovement.create({data:{tenantId:workspaceId,branchId,productId:item.product.id,type:'receiving',quantityDelta:String(item.accepted),unitCostMinor:Number(item.line.unit_cost_minor),reason:`Goods receipt ${receiptNumber}`,sourceId:receiptId}});
          } else expenseValueMinor += lineValue;
        }
      }
      const goodsReceiptValueMinor = inventoryValueMinor + expenseValueMinor;
      if(goodsReceiptValueMinor > 0){
        const postingLines: Array<{accountKey:string;debitMinor?:number;creditMinor?:number;description?:string}> = [];
        if(inventoryValueMinor > 0) postingLines.push({accountKey:'inventory',debitMinor:inventoryValueMinor,description:`Inventory received - ${receiptNumber}`});
        if(expenseValueMinor > 0) postingLines.push({accountKey:'operating_expenses',debitMinor:expenseValueMinor,description:`Non-stock goods received - ${receiptNumber}`});
        postingLines.push({accountKey:'goods_received_not_invoiced',creditMinor:goodsReceiptValueMinor,description:`Accrued supplier receipt - ${receiptNumber}`});
        await postLedgerJournal(tx,{tenantId:workspaceId,branchId,actorUserId:actor.userId,sourceType:'goods_receipt_posted',sourceId:receiptId,memo:`Goods receipt ${receiptNumber}`,lines:postingLines});
      }
      const outstanding=await tx.$queryRaw<Array<{qty:any}>>`SELECT COALESCE(SUM(quantity-quantity_accepted),0) AS qty FROM commerce_purchase_order_lines WHERE order_id=${orderId}::uuid`;const poStatus=Number(outstanding[0]?.qty??0)===0?'received':received.length?'partially_received':'ordered';
      await tx.$executeRaw`UPDATE commerce_purchase_orders SET status=${poStatus},updated_at=CURRENT_TIMESTAMP WHERE id=${orderId}::uuid`;await tx.$executeRaw`UPDATE module_records SET data=jsonb_set(data,'{status}',to_jsonb(${poStatus==='received'?'Received':'Partially received'}::text)),version=version+1,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND module_id='purchases' AND record_id=${orderId}`;
      const receiptData={id:receiptId,receiptNumber,purchaseOrder:order.order_number,supplier:order.supplier_name,receiptDate:new Date().toISOString().slice(0,10),acceptedQuantity:String(received.reduce((s,x)=>s+x.accepted,0)),rejectedQuantity:String(received.reduce((s,x)=>s+x.rejected,0)),status:'Received'};await this.moduleRecord(tx,workspaceId,branchId,'receiving',receiptId,receiptData);await this.link(tx,workspaceId,branchId,'purchases',orderId,'receiving',receiptId,actor.userId);
      await this.event(tx,workspaceId,branchId,'receiving',receiptId,'goods_receipt.posted',{purchaseOrderId:orderId,acceptedQuantity:received.reduce((s,x)=>s+x.accepted,0),rejectedQuantity:received.reduce((s,x)=>s+x.rejected,0)},actor.userId,`goods-receipt:${receiptId}`);await this.audit(tx,workspaceId,actor.userId,'goods_receipt.posted','goods_receipt',receiptId);
      return{ id:receiptId,receiptNumber,purchaseOrderId:orderId,status:'posted',accepted:received.reduce((s,x)=>s+x.accepted,0),rejected:received.reduce((s,x)=>s+x.rejected,0),purchaseOrderStatus:poStatus };
    },{isolationLevel:'Serializable'});
  }

  @Get('deliveries')
  async listDeliveries(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Req() req:FastifyRequest){await this.access(req,workspaceId,branchId);return this.prisma.$queryRaw<any[]>`SELECT d.id,d.delivery_number AS "deliveryNumber",d.recipient_name AS "recipientName",d.delivery_address AS "deliveryAddress",d.courier,d.expected_date AS "expectedDate",d.tracking_reference AS "trackingReference",d.status,d.dispatched_at AS "dispatchedAt",d.delivered_at AS "deliveredAt",f.fulfilment_number AS "fulfilmentNumber",o.order_number AS "salesOrderNumber" FROM commerce_deliveries d JOIN commerce_fulfilments f ON f.id=d.fulfilment_id JOIN commerce_sales_orders o ON o.id=f.order_id WHERE d.tenant_id=${workspaceId}::uuid AND d.branch_id=${branchId}::uuid ORDER BY d.dispatched_at DESC LIMIT 250`;}

  @Patch('deliveries/:deliveryId/status')
  @UseGuards(CsrfGuard)
  async updateDelivery(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('deliveryId') deliveryId:string,@Body() raw:unknown,@Req() req:ReqBody){const actor=await this.access(req,workspaceId,branchId);uuid(deliveryId,'Delivery ID');const body=object(raw);const status=text(body.status,'Delivery status',30)!;const allowed=new Set(['in_transit','delivered','delivery_failed']);if(!allowed.has(status))throw new BadRequestException('Choose In transit, Delivered or Delivery failed.');const tracking=text(body.trackingReference,'Tracking / proof reference',160,true)??null;if(status==='delivered'&&!tracking)throw new BadRequestException('A proof-of-delivery or collection reference is required before closing this delivery.');return this.prisma.$transaction(async(tx)=>{const rows=await tx.$queryRaw<any[]>`SELECT * FROM commerce_deliveries WHERE id=${deliveryId}::uuid AND tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid FOR UPDATE`;const d=rows[0];if(!d)throw new NotFoundException('Delivery not found.');if(d.status==='delivered')throw new ConflictException('A completed delivery cannot be changed.');const deliveredAt=status==='delivered'?new Date():null;await tx.$executeRaw`UPDATE commerce_deliveries SET status=${status},tracking_reference=COALESCE(${tracking},tracking_reference),delivered_at=COALESCE(${deliveredAt},delivered_at),updated_at=CURRENT_TIMESTAMP WHERE id=${deliveryId}::uuid`;await tx.$executeRaw`UPDATE module_records SET data=jsonb_set(jsonb_set(data,'{status}',to_jsonb(${status==='in_transit'?'In transit':status==='delivered'?'Delivered':'Delivery failed'}::text)),'{trackingReference}',to_jsonb(${tracking ?? d.tracking_reference ?? ''}::text)),version=version+1,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND module_id='deliveries' AND record_id=${deliveryId}`;await this.event(tx,workspaceId,branchId,'deliveries',deliveryId,'delivery.status_changed',{status,trackingReference:tracking},actor.userId,`delivery-status:${deliveryId}:${status}`);await this.audit(tx,workspaceId,actor.userId,`delivery.${status}`,'delivery',deliveryId);return{id:deliveryId,status,trackingReference:tracking??d.tracking_reference??undefined,deliveredAt:deliveredAt?.toISOString()};},{isolationLevel:'Serializable'});}

  @Post('crm/leads/:leadRecordId/convert')
  @UseGuards(CsrfGuard)
  async convertLead(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('leadRecordId') leadRecordId:string,@Req() req:FastifyRequest){const actor=await this.access(req,workspaceId,branchId);return this.prisma.$transaction(async(tx)=>{const lead=await this.moduleRecordExists(tx,workspaceId,branchId,'leads',leadRecordId);const existing=await tx.$queryRaw<any[]>`SELECT target_record_id FROM module_record_links WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND source_module_id='leads' AND source_record_id=${leadRecordId} AND target_module_id='customers' AND relation_type='lead_converted' LIMIT 1`;if(existing.length)return{customerRecordId:existing[0].target_record_id,alreadyConverted:true};const name=text(lead.company||lead.name||lead.contactName||lead.leadName,'Lead / business name',180)!;const customerId=randomUUID();const customer={id:customerId,customerCode:doc('CUS'),name,customerType:'Company',phone:String(lead.phone??lead.contact??''),email:String(lead.email??''),tin:String(lead.tin??''),status:'Active',sourceLeadId:leadRecordId,convertedAt:new Date().toISOString()};await this.moduleRecord(tx,workspaceId,branchId,'customers',customerId,customer);await tx.$executeRaw`INSERT INTO module_record_links (id,tenant_id,branch_id,source_module_id,source_record_id,target_module_id,target_record_id,relation_type,created_by_user_id) VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${branchId}::uuid,'leads',${leadRecordId},'customers',${customerId},'lead_converted',${actor.userId}::uuid)`;await tx.$executeRaw`UPDATE module_records SET data=jsonb_set(data,'{status}','"Converted"'::jsonb),version=version+1,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND module_id='leads' AND record_id=${leadRecordId}`;await this.event(tx,workspaceId,branchId,'leads',leadRecordId,'lead.converted',{customerRecordId:customerId},actor.userId,`lead-converted:${leadRecordId}`);await this.event(tx,workspaceId,branchId,'customers',customerId,'customer.created_from_lead',{leadRecordId},actor.userId,`lead-customer:${leadRecordId}`);await this.audit(tx,workspaceId,actor.userId,'lead.converted','customer',customerId);return{customerRecordId:customerId,customer};},{isolationLevel:'Serializable'});}
}
