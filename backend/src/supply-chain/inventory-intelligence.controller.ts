
import {Controller,Get,Post,Body,Param,Req,UseGuards,BadRequestException,ForbiddenException,ConflictException,UnauthorizedException,NotFoundException} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {createHash} from 'node:crypto';
import {PrismaService} from '../prisma/prisma.service';
import {CsrfGuard} from '../core/csrf.guard';
import {assertBranchAccess} from '../authorization/branch-scope';
import {hasPermission} from '../authorization/role-policy';

const cookie=(header:string|undefined,name:string):string|undefined=>{
 for(const part of (header??'').split(';')){
  const split=part.indexOf('=');
  if(split>0&&part.slice(0,split).trim()===name){
   try{return decodeURIComponent(part.slice(split+1).trim());}catch{return undefined;}
  }
 }
 return undefined;
};
@Controller('workspaces/:workspaceId/branches/:branchId/inventory')
export class InventoryIntelligenceController {
 constructor(private readonly prisma:PrismaService){}
 private async access(req:FastifyRequest,w:string,b:string){
  const token=cookie(req.headers.cookie,'lexa_session');
  if(!token)throw new UnauthorizedException('Sign in to see business inventory.');
  const session=await this.prisma.session.findFirst({where:{tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:{gt:new Date()}},select:{userId:true}});
  if(!session)throw new UnauthorizedException('Your session has expired.');
  this.prisma.enterTenantContext(w,session.userId);
  const member=await this.prisma.membership.findUnique({where:{tenantId_userId:{tenantId:w,userId:session.userId}}});
  if(!member||member.status!=='ACTIVE')throw new NotFoundException('This business is not available for your account.');
  if(!hasPermission(member.role,'inventory.read'))throw new NotFoundException('Stock information is not available for this role.');
  const branch=await this.prisma.branch.findFirst({where:{id:b,tenantId:w}});
  if(!branch)throw new NotFoundException('Business storage location not found.');
  await assertBranchAccess(this.prisma,w,b,session.userId,member.role);
  return {userId:session.userId,role:member.role};
 }
 @Get('intelligence')
 async intelligence(@Param('workspaceId')w:string,@Param('branchId')b:string,@Req()req:FastifyRequest){
  await this.access(req,w,b);
  const [products,movements,sales,expiries]=await Promise.all([
    this.prisma.$queryRaw<Array<{id:string;name:string;sku:string;category_id:string|null;cost_price_minor:number;selling_price_minor:number;low_stock_threshold:any;on_hand:any;reserved:any;quarantined:any}>>`
      SELECT p.id,p.name,p.sku,p.category_id,p.cost_price_minor,p.selling_price_minor,p.low_stock_threshold,
        COALESCE((SELECT SUM(m.quantity_delta) FROM stock_movements m WHERE m.tenant_id=${w}::uuid
          AND m.branch_id=${b}::uuid AND m.product_id=p.id),0)::numeric AS on_hand,
        COALESCE((SELECT SUM(r.quantity) FROM stock_reservations r WHERE r.tenant_id=${w}::uuid
          AND r.branch_id=${b}::uuid AND r.product_id=p.id AND r.status='active'),0)::numeric AS reserved,
        COALESCE((SELECT SUM(l.quantity_quarantined) FROM inventory_lots l WHERE l.tenant_id=${w}::uuid
          AND l.branch_id=${b}::uuid AND l.product_id=p.id),0)::numeric AS quarantined
      FROM products p WHERE p.tenant_id=${w}::uuid AND p.active=true AND p.track_stock=true ORDER BY p.name LIMIT 5000`,
    this.prisma.$queryRaw<Array<{day:Date;type:string;quantity:any}>>`
      SELECT date_trunc('day',m.created_at)::date AS day,m.type::text AS type,
        SUM(m.quantity_delta)::numeric AS quantity
      FROM stock_movements m WHERE m.tenant_id=${w}::uuid AND m.branch_id=${b}::uuid
        AND m.created_at>=CURRENT_TIMESTAMP-INTERVAL '30 days'
      GROUP BY 1,2 ORDER BY 1`,
    this.prisma.$queryRaw<Array<{product_id:string;units_sold:any;last_sold:Date}>>`
      SELECT l.product_id,SUM(l.quantity)::numeric AS units_sold,MAX(s.created_at) AS last_sold
      FROM sale_lines l JOIN sales s ON s.id=l.sale_id AND s.tenant_id=l.tenant_id
      WHERE s.tenant_id=${w}::uuid AND s.branch_id=${b}::uuid
        AND s.status='completed' AND s.created_at>=CURRENT_TIMESTAMP-INTERVAL '30 days'
      GROUP BY l.product_id`,
    this.prisma.$queryRaw<Array<{id:string;product_id:string;lot_number:string;expiry_date:Date;quantity_on_hand:any;quantity_quarantined:any;status:string}>>`
      SELECT l.id,l.product_id,l.lot_number,l.expiry_date,l.quantity_on_hand,l.quantity_quarantined,l.status
      FROM inventory_lots l WHERE l.tenant_id=${w}::uuid AND l.branch_id=${b}::uuid
        AND l.expiry_date IS NOT NULL AND l.quantity_on_hand>0
      ORDER BY l.expiry_date ASC LIMIT 300`,
  ]);
  const sold=new Map(sales.map(s=>[s.product_id,{quantity:Number(s.units_sold),lastSold:s.last_sold?.toISOString?.()??null}]));
  const items=products.map(p=>{
    const onHand=Number(p.on_hand),reserved=Number(p.reserved),quarantined=Number(p.quarantined);
    const available=Math.max(0,onHand-reserved-quarantined),threshold=Number(p.low_stock_threshold);
    const recent=sold.get(p.id),daily=(recent?.quantity??0)/30;
    return {id:p.id,name:p.name,sku:p.sku,categoryId:p.category_id,onHand,reserved,quarantined,
      available,minStock:threshold,unitCostMinor:p.cost_price_minor,unitPriceMinor:p.selling_price_minor,
      estimatedCostValueMinor:Math.round(Math.max(0,onHand)*p.cost_price_minor),
      sold30Days:recent?.quantity??0,daysOfCover:daily>0?Math.round(available/daily*10)/10:null,
      lowStock:available<=threshold,lastSold:recent?.lastSold??null};
  });
  const totalEstimatedCostMinor=items.reduce((t,p)=>t+p.estimatedCostValueMinor,0);
  const expiry=expiries.map(e=>({
    id:e.id,productId:e.product_id,batch:e.lot_number,expiryDate:e.expiry_date?.toISOString?.().slice(0,10)??'',
    quantity:Number(e.quantity_on_hand),quarantined:Number(e.quantity_quarantined),status:e.status,
    daysUntilExpiry:Math.ceil((new Date(e.expiry_date).getTime()-Date.now())/86400000)
  }));
  return {
    asOf:new Date().toISOString(),periodDays:30,
    valuationNote:'Estimate based on current product purchase costs; use Finance for the posted inventory valuation.',
    totals:{products:items.length,onHand:items.reduce((t,p)=>t+p.onHand,0),
      reserved:items.reduce((t,p)=>t+p.reserved,0),available:items.reduce((t,p)=>t+p.available,0),
      lowStock:items.filter(x=>x.lowStock).length,estimatedCostMinor:totalEstimatedCostMinor,
      expiryRisk:expiry.filter(e=>e.daysUntilExpiry<=30).length},
    products:items,
    dailyMovements:movements.map(m=>({date:m.day?.toISOString?.().slice(0,10)??String(m.day),type:m.type,quantity:Number(m.quantity)})),
    expiring:expiry,
    fastSellers:[...items].filter(p=>p.sold30Days>0).sort((a,b)=>b.sold30Days-a.sold30Days).slice(0,15),
    slowSellers:[...items].filter(p=>p.onHand>0&&p.sold30Days===0).sort((a,b)=>b.estimatedCostValueMinor-a.estimatedCostValueMinor).slice(0,15)
  };
 }
 @Get('lots')
 async lots(@Param('workspaceId')w:string,@Param('branchId')b:string,@Req()req:FastifyRequest){
  await this.access(req,w,b);
  const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>`
    SELECT l.*,p.name AS product_name,p.sku,w.name AS warehouse_name
    FROM inventory_lots l JOIN products p ON p.id=l.product_id AND p.tenant_id=l.tenant_id
    JOIN warehouses w ON w.id=l.warehouse_id AND w.tenant_id=l.tenant_id
    WHERE l.tenant_id=${w}::uuid AND l.branch_id=${b}::uuid ORDER BY l.expiry_date ASC NULLS LAST,l.lot_number ASC LIMIT 500`;
  return rows.map(row=>({...row,quantity_on_hand:Number(row.quantity_on_hand??0),
    quantity_reserved:Number(row.quantity_reserved??0),quantity_quarantined:Number(row.quantity_quarantined??0)}));
 }
 @Get('replenishment/policies')
 async policies(@Param('workspaceId')w:string,@Param('branchId')b:string,@Req()req:FastifyRequest){
  await this.access(req,w,b);
  return this.prisma.$queryRaw<Array<Record<string,unknown>>>`
    SELECT pol.*,p.name AS product_name,p.sku,w.name AS warehouse_name
    FROM inventory_replenishment_policies pol JOIN products p ON p.id=pol.product_id
    JOIN warehouses w ON w.id=pol.warehouse_id
    WHERE pol.tenant_id=${w}::uuid AND pol.branch_id=${b}::uuid AND pol.active=true
    ORDER BY p.name`;
 }

 @Get('lots/:lotId/history')
 async lotHistory(@Param('workspaceId')w:string,@Param('branchId')b:string,@Param('lotId')id:string,@Req()req:FastifyRequest){
  await this.access(req,w,b);
  const lot=await this.prisma.$queryRaw<Array<{id:string}>>`
    SELECT id FROM inventory_lots WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${id}::uuid`;
  if(!lot.length)throw new NotFoundException('Batch not found in this business.');
  const [movements,sales]=await Promise.all([
    this.prisma.$queryRaw<Array<Record<string,unknown>>>`
      SELECT m.type,m.quantity_delta,m.unit_cost_minor,m.reason,m.source_id,m.created_at
      FROM stock_movements m WHERE m.tenant_id=${w}::uuid AND m.branch_id=${b}::uuid
        AND m.lot_id=${id}::uuid ORDER BY m.created_at DESC LIMIT 150`,
    this.prisma.$queryRaw<Array<Record<string,unknown>>>`
      SELECT s.receipt_number,s.created_at,l.quantity,l.product_name_snapshot
      FROM sale_lines l JOIN sales s ON s.id=l.sale_id AND s.tenant_id=l.tenant_id
      WHERE l.tenant_id=${w}::uuid AND s.branch_id=${b}::uuid AND l.lot_id=${id}::uuid
      ORDER BY s.created_at DESC LIMIT 150`
  ]);
  return {lotId:id,movements,sales};
 }
 @Post('lots/:lotId/quarantine')
 @UseGuards(CsrfGuard)
 async quarantine(@Param('workspaceId')w:string,@Param('branchId')b:string,@Param('lotId')id:string,
   @Body()raw:unknown,@Req()req:FastifyRequest){
  const actor=await this.access(req,w,b);
  if(!hasPermission(actor.role,'inventory.write'))throw new ForbiddenException('Your role cannot restrict stock.');
  const body=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
  const reason=typeof body.reason==='string'?body.reason.trim():'';
  if(reason.length<5||reason.length>500)throw new BadRequestException('Explain why the batch must be restricted (at least 5 characters).');
  return this.prisma.$transaction(async tx=>{
   const rows=await tx.$queryRaw<Array<{id:string;status:string;quantity_on_hand:any;quantity_reserved:any}>>`
    SELECT id,status,quantity_on_hand,quantity_reserved FROM inventory_lots
    WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${id}::uuid FOR UPDATE`;
   const lot=rows[0];if(!lot)throw new NotFoundException('Batch not found.');
   if(lot.status!=='available')throw new ConflictException('Only an available batch can be restricted.');
   if(Number(lot.quantity_reserved)>0)throw new ConflictException('This batch has stock reserved for customer orders. Release its reservations first.');
   await tx.$executeRaw`UPDATE inventory_lots SET status='quarantine',quantity_quarantined=quantity_on_hand
     WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${id}::uuid`;
   await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor.userId,action:'inventory.lot.quarantined',
     resourceType:'inventory_lot',resourceId:id,metadata:{reason}}});
   return {id,status:'quarantine',reason};
  },{isolationLevel:'Serializable'});
 }
 @Post('lots/:lotId/release')
 @UseGuards(CsrfGuard)
 async release(@Param('workspaceId')w:string,@Param('branchId')b:string,@Param('lotId')id:string,
   @Body()raw:unknown,@Req()req:FastifyRequest){
  const actor=await this.access(req,w,b);
  if(!hasPermission(actor.role,'inventory.write'))throw new ForbiddenException('Your role cannot release restricted stock.');
  const body=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
  const reason=typeof body.reason==='string'?body.reason.trim():'';
  if(reason.length<5||reason.length>500)throw new BadRequestException('Record the inspection or approval reference (at least 5 characters).');
  return this.prisma.$transaction(async tx=>{
   const rows=await tx.$queryRaw<Array<{id:string;status:string;expiry_date:Date|null}>>`
    SELECT id,status,expiry_date FROM inventory_lots
    WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${id}::uuid FOR UPDATE`;
   const lot=rows[0];if(!lot)throw new NotFoundException('Batch not found.');
   if(lot.status!=='quarantine')throw new ConflictException('Only a restricted batch can be released.');
   if(lot.expiry_date&&lot.expiry_date.getTime()<new Date(new Date().toISOString().slice(0,10)).getTime())
    throw new ConflictException('An expired lot cannot be released for normal sale.');
   await tx.$executeRaw`UPDATE inventory_lots SET status='available',quantity_quarantined=0
    WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${id}::uuid`;
   await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor.userId,action:'inventory.lot.released',
    resourceType:'inventory_lot',resourceId:id,metadata:{reason}}});
   return {id,status:'available',reason};
  },{isolationLevel:'Serializable'});
 }


}
