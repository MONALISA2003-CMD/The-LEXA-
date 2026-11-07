
import {
 BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get,
 NotFoundException, Param, Post, Req, UnauthorizedException, UseGuards
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CsrfGuard } from '../core/csrf.guard';
import { assertBranchAccess } from '../authorization/branch-scope';
import { hasPermission } from '../authorization/role-policy';

type Obj=Record<string,unknown>;
type Tx=any;
const object=(value:unknown):Obj=>{
 if(!value||typeof value!=='object'||Array.isArray(value)) throw new BadRequestException('Please complete the package details.');
 return value as Obj;
};
function asText(value:unknown,label:string,max:number,optional=false):string {
 if((value===undefined||value===null||value==='')&&optional)return '';
 if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new BadRequestException(label+' is required and must be shorter than '+(max+1)+' characters.');
 return value.trim();
}
function asUuid(value:unknown,label:string):string {
 const text=asText(value,label,80);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text))throw new BadRequestException(label+' is invalid.');
 return text;
}
function nonNegative(value:unknown,label:string):number|null{
 if(value===undefined||value===null||value==='')return null;
 const num=Number(value);
 if(!Number.isFinite(num)||num<0||num>1000000||Math.round(num*1000)/1000!==num)throw new BadRequestException(label+' must be a valid positive measurement.');
 return num;
}
function cookie(header:string|undefined,name:string):string|undefined{
 for(const part of (header??'').split(';')){
  const i=part.indexOf('=');
  if(i>=0&&part.slice(0,i).trim()===name){
   try{return decodeURIComponent(part.slice(i+1).trim());}catch{return undefined;}
  }
 }
 return undefined;
}
function toPackage(row:any){
 return {
  id:row.id,packageNumber:row.package_number,orderId:row.order_id,
  orderNumber:row.order_number,deliveryId:row.delivery_id??null,deliveryNumber:row.delivery_number??null,
  customerName:row.customer_name??'',recipientName:row.recipient_name??'',recipientPhone:row.recipient_phone??'',
  deliveryAddress:row.delivery_address??'',status:row.status,weightKg:row.package_weight_kg===null?null:Number(row.package_weight_kg),
  lengthCm:row.length_cm===null?null:Number(row.length_cm),widthCm:row.width_cm===null?null:Number(row.width_cm),
  heightCm:row.height_cm===null?null:Number(row.height_cm),handlingNotes:row.handling_notes??'',sealNumber:row.seal_number??'',
  trackingReference:row.tracking_reference??'',packedAt:row.packed_at?.toISOString?.()??row.packed_at,
  sealedAt:row.sealed_at?.toISOString?.()??row.sealed_at,
  deliveredAt:row.delivered_at?.toISOString?.()??row.delivered_at,
  lines:(row.lines??[]).map((x:any)=>({id:x.id,orderLineId:x.orderLineId,productId:x.productId,
    productName:x.productName,sku:x.sku,quantity:Number(x.quantity)}))
 };
}
@Controller('workspaces/:workspaceId/branches/:branchId/logistics/packages')
export class LogisticsPackagesController {
 constructor(private readonly prisma:PrismaService){}
 private async access(request:FastifyRequest,workspaceId:string,branchId:string,write=false){
  const token=cookie(request.headers.cookie,'lexa_session');
  if(!token)throw new UnauthorizedException('Sign in to continue.');
  const session=await this.prisma.session.findFirst({where:{tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:{gt:new Date()}},select:{userId:true}});
  if(!session)throw new UnauthorizedException('Your session has expired. Sign in again.');
  this.prisma.enterTenantContext(workspaceId,session.userId);
  const member=await this.prisma.membership.findUnique({where:{tenantId_userId:{tenantId:workspaceId,userId:session.userId}},select:{role:true,status:true}});
  if(!member||member.status!=='ACTIVE')throw new NotFoundException('Business not found for this account.');
  if(!hasPermission(member.role,write?'fulfilment.write':'fulfilment.read'))throw new ForbiddenException('Your role cannot '+(write?'pack':'view')+' orders.');
  const branch=await this.prisma.branch.findFirst({where:{id:branchId,tenantId:workspaceId},select:{id:true}});
  if(!branch)throw new NotFoundException('Business location was not found.');
  await assertBranchAccess(this.prisma,workspaceId,branchId,session.userId,member.role);
  return session.userId;
 }
 private async list(tx:Tx,workspaceId:string,branchId:string,ids?:string[]){
  const rows=await tx.$queryRaw<any[]>`
   SELECT p.*,o.order_number,d.delivery_number,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
     'id',l.id,'orderLineId',l.order_line_id,'productId',l.product_id,'productName',l.product_name_snapshot,
     'sku',l.sku_snapshot,'quantity',l.quantity) ORDER BY l.product_name_snapshot)
    FROM commerce_package_lines l WHERE l.tenant_id=p.tenant_id AND l.package_id=p.id),'[]'::jsonb) AS lines
   FROM commerce_packages p
   JOIN commerce_sales_orders o ON o.id=p.order_id AND o.tenant_id=p.tenant_id
   LEFT JOIN commerce_deliveries d ON d.id=p.delivery_id AND d.tenant_id=p.tenant_id
   WHERE p.tenant_id=${workspaceId}::uuid AND p.branch_id=${branchId}::uuid
   ORDER BY p.created_at DESC LIMIT 300`;
  return rows.filter((row:any)=>!ids||ids.includes(row.id)).map(toPackage);
 }
 @Get()
 async packages(@Param('workspaceId')w:string,@Param('branchId')b:string,@Req()req:FastifyRequest){
  await this.access(req,w,b);
  return this.prisma.$transaction(tx=>this.list(tx,w,b));
 }
 @Get('summary')
 async summary(@Param('workspaceId')w:string,@Param('branchId')b:string,@Req()req:FastifyRequest){
  await this.access(req,w,b);
  const rows=await this.prisma.$queryRaw<Array<{status:string;count:number}>>`
   SELECT status,COUNT(*)::int AS count FROM commerce_packages
   WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid GROUP BY status`;
  return {statuses:rows,total:rows.reduce((x,y)=>x+y.count,0)};
 }
 @Post()
 @UseGuards(CsrfGuard)
 async create(@Param('workspaceId')w:string,@Param('branchId')b:string,@Body()raw:unknown,@Req()req:FastifyRequest){
  const actor=await this.access(req,w,b,true);
  const v=object(raw),orderId=asUuid(v.orderId,'Sales order');
  const input=v.lines;
  if(!Array.isArray(input)||!input.length||input.length>100)throw new BadRequestException('Choose the items packed in this parcel.');
  const lines=input.map(x=>{
   const row=object(x),orderLineId=asUuid(row.orderLineId,'Order item'),qty=Number(row.quantity);
   if(!Number.isFinite(qty)||qty<=0||qty>1000000||Math.round(qty*1000)/1000!==qty)
    throw new BadRequestException('Packed quantity must be greater than zero.');
   return {orderLineId,qty};
  });
  if(new Set(lines.map(x=>x.orderLineId)).size!==lines.length)throw new BadRequestException('An item cannot appear twice in the same parcel.');
  const weight=nonNegative(v.weightKg,'Package weight');
  const length=nonNegative(v.lengthCm,'Package length');
  const width=nonNegative(v.widthCm,'Package width');
  const height=nonNegative(v.heightCm,'Package height');
  const handling=asText(v.handlingNotes,'Handling note',500,true);
  const seal=asText(v.sealNumber,'Seal reference',100,true);
  const recipient=asText(v.recipientName,'Recipient',160,true);
  const phone=asText(v.recipientPhone,'Recipient phone',80,true);
  const address=asText(v.deliveryAddress,'Delivery address',500,true);
  return this.prisma.$transaction(async tx=>{
   const order=(await tx.$queryRaw<any[]>`SELECT * FROM commerce_sales_orders
     WHERE id=${orderId}::uuid AND tenant_id=${w}::uuid AND branch_id=${b}::uuid FOR UPDATE`)[0];
   if(!order)throw new NotFoundException('Sales order not found for this business.');
   if(!['confirmed','partially_fulfilled'].includes(order.status))throw new ConflictException('Confirm the order before packing. Completed orders cannot be packed again.');
   const orderLines=await tx.$queryRaw<any[]>`SELECT id,product_id,product_name_snapshot,sku_snapshot,quantity,quantity_fulfilled
     FROM commerce_sales_order_lines WHERE tenant_id=${w}::uuid AND order_id=${orderId}::uuid FOR UPDATE`;
   const pending=await tx.$queryRaw<Array<{orderLineId:string;qty:any}>>`
     SELECT l.order_line_id AS "orderLineId",SUM(l.quantity) AS qty FROM commerce_package_lines l
     JOIN commerce_packages p ON p.id=l.package_id AND p.tenant_id=l.tenant_id
     WHERE p.tenant_id=${w}::uuid AND p.branch_id=${b}::uuid AND p.order_id=${orderId}::uuid
       AND p.status IN ('packed','sealed') GROUP BY l.order_line_id`;
   for(const item of lines){
    const orderLine=orderLines.find((x:any)=>x.id===item.orderLineId);
    if(!orderLine)throw new BadRequestException('A packed item is not on this order.');
    const already=Number(pending.find(x=>x.orderLineId===item.orderLineId)?.qty??0);
    const remaining=Number(orderLine.quantity)-Number(orderLine.quantity_fulfilled)-already;
    if(item.qty>remaining+1e-9)throw new ConflictException('Only '+Math.max(0,remaining)+' unshipped units of '+orderLine.product_name_snapshot+' are available to pack.');
   }
   const id=randomUUID(),number='PKG-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+randomBytes(4).toString('hex').toUpperCase();
   await tx.$executeRaw`INSERT INTO commerce_packages
    (id,tenant_id,branch_id,order_id,package_number,status,customer_name,recipient_name,recipient_phone,delivery_address,
     package_weight_kg,length_cm,width_cm,height_cm,handling_notes,seal_number,packed_by_user_id)
    VALUES (${id}::uuid,${w}::uuid,${b}::uuid,${orderId}::uuid,${number},'packed',${order.customer_name},
      ${recipient||order.customer_name},${phone||null},${address||order.delivery_address},
      ${weight},${length},${width},${height},${handling||null},${seal||null},${actor}::uuid)`;
   for(const item of lines){
    const l=orderLines.find((x:any)=>x.id===item.orderLineId);
    await tx.$executeRaw`INSERT INTO commerce_package_lines
      (id,tenant_id,branch_id,package_id,order_line_id,product_id,product_name_snapshot,sku_snapshot,quantity)
      VALUES (${randomUUID()}::uuid,${w}::uuid,${b}::uuid,${id}::uuid,${l.id}::uuid,${l.product_id}::uuid,
       ${l.product_name_snapshot},${l.sku_snapshot},${String(item.qty)}::numeric)`;
   }
   const record={id,packageNumber:number,salesOrder:order.order_number,customer:order.customer_name??'',
      orderId,packageDate:new Date().toISOString().slice(0,10),status:'Packed',itemSummary:lines.map(l=>{
       const x=orderLines.find((x:any)=>x.id===l.orderLineId);
       return x.product_name_snapshot+' x '+l.qty;
      }).join('; '),packageCount:'1',weightKg:weight===null?'':String(weight),packedBy:actor};
   await tx.$executeRaw`INSERT INTO module_records(id,tenant_id,branch_id,module_id,record_id,data,version)
      VALUES (${randomUUID()}::uuid,${w}::uuid,${b}::uuid,'packages',${id},${JSON.stringify(record)}::jsonb,1)
      ON CONFLICT(tenant_id,branch_id,module_id,record_id) DO NOTHING`;
   await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'logistics.package.packed',resourceType:'package',resourceId:id}});
   return (await this.list(tx,w,b,[id]))[0];
  },{isolationLevel:'Serializable'});
 }
 @Post(':packageId/seal')
 @UseGuards(CsrfGuard)
 async seal(@Param('workspaceId')w:string,@Param('branchId')b:string,@Param('packageId')packageId:string,@Req()req:FastifyRequest){
  const actor=await this.access(req,w,b,true);asUuid(packageId,'Package');
  return this.prisma.$transaction(async tx=>{
   const found=(await tx.$queryRaw<any[]>`SELECT p.status,o.status AS order_status FROM commerce_packages p
      JOIN commerce_sales_orders o ON o.id=p.order_id
      WHERE p.tenant_id=${w}::uuid AND p.branch_id=${b}::uuid AND p.id=${packageId}::uuid FOR UPDATE`)[0];
   if(!found)throw new NotFoundException('Package not found.');
   if(found.status!=='packed')throw new ConflictException('Only a packed package can be sealed.');
   if(!['confirmed','partially_fulfilled'].includes(found.order_status))throw new ConflictException('This sales order cannot be dispatched.');
   await tx.$executeRaw`UPDATE commerce_packages SET status='sealed',sealed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${packageId}::uuid`;
   await tx.$executeRaw`UPDATE module_records SET data=jsonb_set(data,'{status}','"Ready to dispatch"'::jsonb),updated_at=CURRENT_TIMESTAMP,version=version+1
      WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND module_id='packages' AND record_id=${packageId}`;
   await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'logistics.package.sealed',resourceType:'package',resourceId:packageId}});
   return (await this.list(tx,w,b,[packageId]))[0];
  });
 }
 @Post(':packageId/cancel')
 @UseGuards(CsrfGuard)
 async cancel(@Param('workspaceId')w:string,@Param('branchId')b:string,@Param('packageId')packageId:string,@Body()raw:unknown,@Req()req:FastifyRequest){
  const actor=await this.access(req,w,b,true);asUuid(packageId,'Package');
  const reason=asText(object(raw).reason,'Cancellation reason',300);
  return this.prisma.$transaction(async tx=>{
   const found=(await tx.$queryRaw<any[]>`SELECT status FROM commerce_packages
      WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${packageId}::uuid FOR UPDATE`)[0];
   if(!found)throw new NotFoundException('Package not found.');
   if(!['packed','sealed'].includes(found.status))throw new ConflictException('A dispatched package cannot be cancelled. Record a delivery return instead.');
   await tx.$executeRaw`UPDATE commerce_packages SET status='cancelled',updated_at=CURRENT_TIMESTAMP,handling_notes=CONCAT(COALESCE(handling_notes,''),' | Cancelled: ',${reason})
      WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${packageId}::uuid`;
   await tx.$executeRaw`UPDATE module_records SET data=jsonb_set(data,'{status}','"Cancelled"'::jsonb),updated_at=CURRENT_TIMESTAMP,version=version+1
      WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND module_id='packages' AND record_id=${packageId}`;
   await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'logistics.package.cancelled',resourceType:'package',resourceId:packageId,metadata:{reason}}});
   return (await this.list(tx,w,b,[packageId]))[0];
  });
 }
}

