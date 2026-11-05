/** Business production, measured stock and division reporting. These resources
 * reuse canonical products, lots, movements, sales and GL journals. Production
 * posts only for explicitly enabled tenants after independent approval.
 */
import {BadRequestException,Body,ConflictException,Controller,ForbiddenException,Get,Headers,NotFoundException,Param,Post,Req,UnauthorizedException,UseGuards} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {createHash} from 'node:crypto';
import {PrismaService} from '../prisma/prisma.service';
import {CsrfGuard} from '../core/csrf.guard';
import {assertBranchAccess} from '../authorization/branch-scope';
import {hasPermission,type Permission} from '../authorization/role-policy';
import {postLedgerJournal} from '../general-ledger/ledger-posting';
import {reviewDemandAggregates} from '../supply-chain/industry-demand-client';
import {quantityMilli,formatMilli,multiplyQuantity,extendedMinorCost,outputUnitCost,convertQuantity,validateTransformation,canonicalStockUnit,ProductionQuantityError,type UomDimension} from './production-quantities';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(value:unknown,label:string):string {if(typeof value!=='string'||!UUID.test(value))throw new BadRequestException(`${label} identifier is invalid.`);return value;}
function text(value:unknown,label:string,max=160):string {if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\x00-\x1f]/.test(value))throw new BadRequestException(`${label} is required (up to ${max} characters).`);return value.trim();}
function object(value:unknown):Record<string,unknown> {if(!value||typeof value!=='object'||Array.isArray(value))throw new BadRequestException('An object is required.');return value as Record<string,unknown>;}
function quantity(value:unknown,label:string,allowZero=false):string {try{return formatMilli(quantityMilli(value,label,allowZero));}catch(e){if(e instanceof ProductionQuantityError)throw new BadRequestException(e.message);throw e;}}
function batchCount(value:unknown):number {if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>10000)throw new BadRequestException('Production batches must be a whole number between 1 and 10,000.');return value;}
function hash(value:unknown):string{return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function cookie(request:FastifyRequest):string|undefined {for(const pair of (request.headers.cookie??'').split(';')){const i=pair.indexOf('=');if(i>=0&&pair.slice(0,i).trim()==='lexa_session'){try{return decodeURIComponent(pair.slice(i+1).trim());}catch{return undefined;}}}return undefined;}
function ruleError(error:unknown):never {if(error instanceof ProductionQuantityError)throw new ConflictException(error.message);if(['P2002','P2034'].includes((error as {code?:string})?.code??''))throw new ConflictException('The reference or operation has changed. Review the latest record before retrying.');throw error;}
const UNIT_DIMENSIONS:Readonly<Record<string,UomDimension>>={each:'count',pair:'count',box:'count',carton:'count',case:'count',packet:'count',kg:'mass',g:'mass',l:'volume',ml:'volume',m:'length',cm:'length',mm:'length',m2:'area',roll:'length',bag:'mass'};

@Controller('workspaces/:workspaceId/branches/:branchId/industry-operations')
export class IndustryOperationsController {
 constructor(private readonly prisma:PrismaService){}
 private async actor(request:FastifyRequest,tenantId:string,branchId:string,permission:Permission){
  const token=cookie(request);if(!token)throw new UnauthorizedException('Sign in to continue.');
  const session=await this.prisma.session.findFirst({where:{tokenHash:hash(token),expiresAt:{gt:new Date()}},select:{userId:true}});
  if(!session)throw new UnauthorizedException('Your session has expired.');
  this.prisma.enterTenantContext(tenantId,session.userId);
  const membership=await this.prisma.membership.findUnique({where:{tenantId_userId:{tenantId,userId:session.userId}}});
  if(!membership||membership.status!=='ACTIVE')throw new NotFoundException('Business not found.');
  if(!hasPermission(membership.role,permission))throw new ForbiddenException('Your role cannot complete this operation.');
  const branch=await this.prisma.branch.findFirst({where:{tenantId,id:branchId},select:{id:true}});
  if(!branch)throw new NotFoundException('Branch not found.');
  await assertBranchAccess(this.prisma,tenantId,branchId,session.userId,membership.role);
  return {userId:session.userId,role:membership.role};
 }
 private async enabled(tenantId:string){
  const result=await this.prisma.$queryRaw<Array<{enabled:boolean}>>`
   SELECT o.enabled FROM tenant_feature_overrides o
   JOIN tenant_subscriptions s ON s.tenant_id=o.tenant_id
   WHERE o.tenant_id=${tenantId}::uuid AND o.feature_key='industryOperationsV1'
     AND o.enabled=true AND (o.expires_at IS NULL OR o.expires_at>now())
     AND s.status IN ('active','trialing') LIMIT 1`;
  if(result[0]?.enabled!==true)throw new ForbiddenException('Industry production posting is not enabled for this business.');
 }
 private async audit(tx:any,tenantId:string,branchId:string,userId:string,action:string,resourceId:string){
  await tx.auditEvent.create({data:{tenantId,branchId,actorUserId:userId,action,resourceType:'inventory_production',resourceId}});
 }

 @Get('rollout-status')
 async rolloutStatus(@Param('workspaceId') t:string,@Param('branchId') b:string,@Req() req:FastifyRequest){
  await this.actor(req,t,b,'workspace.read');
  const rows=await this.prisma.$queryRaw<Array<{enabled:boolean}>>`SELECT o.enabled FROM tenant_feature_overrides o
   JOIN tenant_subscriptions s ON s.tenant_id=o.tenant_id WHERE o.tenant_id=${t}::uuid AND
   o.feature_key='industryOperationsV1' AND o.enabled=true AND (o.expires_at IS NULL OR o.expires_at>now())
   AND s.status IN ('active','trialing') LIMIT 1`;
  return {postingEnabled:rows[0]?.enabled===true,requiresApprovedFormula:true,requiresSeparateApprover:true};
 }
 @Get('demand-review/:warehouseId')
 async demandReview(@Param('workspaceId') t:string,@Param('branchId') b:string,@Param('warehouseId') rawWarehouse:string,@Req() req:FastifyRequest){
  await this.actor(req,t,b,'inventory.read');const warehouseId=id(rawWarehouse,'Warehouse');
  const warehouse=await this.prisma.warehouse.findFirst({where:{tenantId:t,branchId:b,id:warehouseId,active:true},select:{id:true}});
  if(!warehouse)throw new NotFoundException('The selected warehouse is not available to your branch.');
  // The only inputs supplied to Python are authorized, aggregated movement and
  // replenishment data. The model receives no customer names, transactions,
  // phone identifiers, database URL or credentials.
  const policies=await this.prisma.$queryRaw<Array<{productId:string;sku:string;currency:string;leadTimeDays:number;safetyStock:string;onHand:string;reserved:string;quarantined:string;onOrder:string}>>`
   SELECT pol.product_id AS "productId",p.sku,
    t.currency AS currency,pol.lead_time_days AS "leadTimeDays",
    pol.safety_stock::text AS "safetyStock",
    COALESCE((SELECT SUM(m.quantity_delta) FROM stock_movements m WHERE m.tenant_id=pol.tenant_id AND m.branch_id=pol.branch_id AND m.warehouse_id=pol.warehouse_id AND m.product_id=pol.product_id),0)::text AS "onHand",
    COALESCE((SELECT SUM(r.quantity) FROM stock_reservations r WHERE r.tenant_id=pol.tenant_id AND r.branch_id=pol.branch_id AND r.warehouse_id=pol.warehouse_id AND r.product_id=pol.product_id AND r.status='active'),0)::text AS reserved,
    COALESCE((SELECT SUM(l.quantity_quarantined) FROM inventory_lots l WHERE l.tenant_id=pol.tenant_id AND l.branch_id=pol.branch_id AND l.warehouse_id=pol.warehouse_id AND l.product_id=pol.product_id),0)::text AS quarantined,
    COALESCE((SELECT SUM(l.quantity-l.quantity_accepted-l.quantity_rejected) FROM commerce_purchase_order_lines l JOIN commerce_purchase_orders o ON o.id=l.order_id AND o.tenant_id=pol.tenant_id WHERE o.branch_id=pol.branch_id AND o.status IN ('ordered','partially_received') AND l.product_id=pol.product_id),0)::text AS "onOrder"
   FROM inventory_replenishment_policies pol JOIN products p ON p.id=pol.product_id AND p.tenant_id=pol.tenant_id
   JOIN tenants t ON t.id=pol.tenant_id WHERE pol.tenant_id=${t}::uuid AND pol.branch_id=${b}::uuid AND pol.warehouse_id=${warehouseId}::uuid AND pol.active=true AND p.active=true AND pol.lead_time_days BETWEEN 0 AND 365
   ORDER BY p.sku LIMIT 50`;
  const outflow=await this.prisma.$queryRaw<Array<{productId:string;day:Date;quantity:string}>>`
   SELECT m.product_id AS "productId",m.created_at::date AS day,COALESCE(SUM(-m.quantity_delta),0)::text AS quantity
   FROM stock_movements m WHERE m.tenant_id=${t}::uuid AND m.branch_id=${b}::uuid AND m.warehouse_id=${warehouseId}::uuid
    AND m.created_at >= CURRENT_DATE-INTERVAL '89 days' AND m.quantity_delta<0 AND m.type IN ('sale','production_issue')
    AND m.product_id IN (SELECT pol.product_id FROM inventory_replenishment_policies pol WHERE pol.tenant_id=${t}::uuid AND pol.branch_id=${b}::uuid AND pol.warehouse_id=${warehouseId}::uuid AND pol.active=true)
   GROUP BY m.product_id,m.created_at::date ORDER BY day`;
  const asOf=new Date().toISOString().slice(0,10),source=new Map<string,Map<string,string>>();
  for(const r of outflow){const day=r.day instanceof Date?r.day.toISOString().slice(0,10):String(r.day).slice(0,10);if(!source.has(r.productId))source.set(r.productId,new Map());source.get(r.productId)!.set(day,r.quantity);}
  const days=Array.from({length:90},(_,i)=>{const d=new Date(`${asOf}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-(89-i));return d.toISOString().slice(0,10);});
  const items=policies.map(row=>{
   // Do not feed a fabricated provider lead time or cash value to the model.
   // Supplier pack size is shown as an unverified base-unit fallback; any real
   // purchase order still requires normal supplier, pack and owner approval.
   const onHand=quantityMilli(row.onHand,'On hand',true),reserve=quantityMilli(row.reserved,'Reserved',true),quarantined=quantityMilli(row.quarantined,'Quarantined',true);
   const available=onHand>reserve+quarantined?onHand-reserve-quarantined:0n;
   return {productId:row.productId,variantId:null,dailyDemand:days.map(day=>source.get(row.productId)?.get(day)??'0'),
    availableToPromise:formatMilli(available),confirmedOnOrder:row.onOrder,safetyStock:row.safetyStock,leadTimeDays:row.leadTimeDays,
    supplierPackMultiple:'1',currency:row.currency,sourceVersion:`warehouse:${warehouseId}:movement-window:90d`};
  });
  const forecast=await reviewDemandAggregates({schemaVersion:1,tenantId:t,branchId:b,asOf,items});
  if(forecast.tenantId!==t||forecast.branchId!==b||forecast.items.length!==items.length)throw new ConflictException('Demand result did not match the authorized source scope.');
  return {...forecast,warehouseId,notes:'Review recommendations manually. Pack multiple defaults to one stock unit until a verified supplier pack is selected. Only actual warehouse movements and approved replenishment settings were used; historical stockouts can understate demand. No purchase order was created.'};
 }
 @Get('pending-menu-lines')
 async pendingMenuLines(@Param('workspaceId') t:string,@Param('branchId') b:string,@Req() req:FastifyRequest){
  await this.actor(req,t,b,'sales.read');
  return this.prisma.$queryRaw<Array<{id:string;productId:string;variantId:string|null;description:string;quantity:string;receiptNumber:string}>>`
   SELECT sl.id,sl.product_id AS "productId",sl.variant_id AS "variantId",
          sl.product_name_snapshot AS description,sl.quantity::text AS quantity,s.receipt_number AS "receiptNumber"
   FROM sale_lines sl JOIN sales s ON s.tenant_id=sl.tenant_id AND s.id=sl.sale_id
   JOIN products p ON p.tenant_id=sl.tenant_id AND p.id=sl.product_id
   WHERE sl.tenant_id=${t}::uuid AND s.branch_id=${b}::uuid AND s.status='completed'
    AND p.track_stock=false AND p.product_type IN ('menu_item','prepared_food','restaurant_meal','catering_meal')
    AND NOT EXISTS(SELECT 1 FROM inventory_production_orders o WHERE o.tenant_id=sl.tenant_id AND o.sale_line_id=sl.id)
   ORDER BY s.created_at DESC LIMIT 80`;
 }
 @Get('formulas')
 async listFormulas(@Param('workspaceId') t:string,@Param('branchId') b:string,@Req() req:FastifyRequest){
  await this.actor(req,t,b,'inventory.read');
  return this.prisma.inventoryFormula.findMany({where:{tenantId:t,branchId:b},include:{components:true},orderBy:{createdAt:'desc'},take:100});
 }
 @Post('formulas') @UseGuards(CsrfGuard)
 async draftFormula(@Param('workspaceId') t:string,@Param('branchId') b:string,@Body() raw:unknown,@Req() req:FastifyRequest){
  const a=await this.actor(req,t,b,'inventory.write');const input=object(raw),kind=text(input.kind,'Production method',24);
  const name=text(input.name,'Formula name'),outputProductId=id(input.outputProductId,'Finished product'),outputVariantId=input.outputVariantId?id(input.outputVariantId,'Finished variant'):null;
  const outputQuantity=quantity(input.outputQuantity,'Finished quantity');
  if(!Array.isArray(input.components)||input.components.length<1||input.components.length>30)throw new BadRequestException('Choose 1–30 real ingredients or components.');
  const components=input.components.map(row=>{const x=object(row);return {productId:id(x.productId,'Ingredient'),variantId:x.variantId?id(x.variantId,'Ingredient variant'):null,quantity:quantity(x.quantity,'Ingredient quantity'),unitCode:canonicalStockUnit(text(x.unitCode,'Ingredient unit',24))};});
  try{validateTransformation(kind,components.length,quantityMilli(outputQuantity),components.map(c=>`${c.productId}:${c.variantId??''}`),`${outputProductId}:${outputVariantId??''}`);}catch(e){return ruleError(e);}
  return this.prisma.$transaction(async tx=>{
   const output=await tx.product.findFirst({where:{tenantId:t,id:outputProductId,active:true}});
   if(!output)throw new NotFoundException('Finished product does not belong to this business.');
   if(outputVariantId&&!await tx.productVariant.findFirst({where:{tenantId:t,id:outputVariantId,productId:outputProductId,active:true}}))throw new BadRequestException('Finished variant does not belong to this product.');
   if(!output.trackStock&&!['recipe'].includes(kind))throw new BadRequestException('Only recipe-based food orders may produce a non-stock sales line.');
   if(output.trackStock&&(!output.trackLot||output.trackSerial))throw new BadRequestException('Produced sellable goods require an approved batch-tracked finished product.');
   for(const component of components){
    const product=await tx.product.findFirst({where:{tenantId:t,id:component.productId,trackStock:true,trackSerial:false,trackLot:true,active:true}});
    if(!product||!product.unitOfMeasure||canonicalStockUnit(product.unitOfMeasure)!==component.unitCode)throw new BadRequestException('Ingredient must be active, lot-tracked and use the declared base stock unit.');
    if(component.variantId&&!await tx.productVariant.findFirst({where:{tenantId:t,id:component.variantId,productId:product.id,active:true}}))throw new BadRequestException('Ingredient variant does not match the product.');
    if(component.productId===outputProductId&&component.variantId===outputVariantId)throw new BadRequestException('A finished product cannot be its own ingredient.');
   }
   const formula=await tx.inventoryFormula.create({data:{tenantId:t,branchId:b,name,kind,outputProductId,outputVariantId,outputQuantity,status:'draft',createdByUserId:a.userId}});
   await tx.inventoryFormulaComponent.createMany({data:components.map(c=>({...c,tenantId:t,formulaId:formula.id}))});
   await this.audit(tx,t,b,a.userId,'industry.formula.drafted',formula.id);
   return {...formula,components};
  },{isolationLevel:'Serializable'});
 }
 @Post('formulas/:formulaId/approve') @UseGuards(CsrfGuard)
 async approveFormula(@Param('workspaceId') t:string,@Param('branchId') b:string,@Param('formulaId') rawId:string,@Req() req:FastifyRequest){
  const a=await this.actor(req,t,b,'inventory.approve');await this.enabled(t);const formulaId=id(rawId,'Formula');
  return this.prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM inventory_formulas WHERE tenant_id=${t}::uuid AND id=${formulaId}::uuid FOR UPDATE`;
   const formula=await tx.inventoryFormula.findFirst({where:{tenantId:t,branchId:b,id:formulaId}});
   if(!formula)throw new NotFoundException('Formula not found in this branch.');
   if(formula.status==='approved')return formula;
   if(formula.status!=='draft'||formula.createdByUserId===a.userId)throw new ConflictException('A separate authorized staff member must approve a new formula.');
   const result=await tx.inventoryFormula.update({where:{id:formula.id},data:{status:'approved',approvedByUserId:a.userId,approvedAt:new Date()}});
   await this.audit(tx,t,b,a.userId,'industry.formula.approved',formulaId);return result;
  },{isolationLevel:'Serializable'});
 }
 @Get('orders')
 async listOrders(@Param('workspaceId') t:string,@Param('branchId') b:string,@Req() req:FastifyRequest){
  await this.actor(req,t,b,'inventory.read');return this.prisma.inventoryProductionOrder.findMany({where:{tenantId:t,branchId:b},include:{inputs:true},orderBy:{createdAt:'desc'},take:100});
 }
 @Post('orders') @UseGuards(CsrfGuard)
 async draftOrder(@Param('workspaceId') t:string,@Param('branchId') b:string,@Headers('idempotency-key') idem:string|undefined,@Req() req:FastifyRequest,@Body() raw:unknown){
  const a=await this.actor(req,t,b,'inventory.write');const input=object(raw);
  const formulaId=id(input.formulaId,'Approved formula'),warehouseId=id(input.warehouseId,'Warehouse'),batches=batchCount(input.batches);
  const saleLineId=input.saleLineId?id(input.saleLineId,'Sale line'):null,outputLotNumber=input.outputLotNumber?text(input.outputLotNumber,'Finished batch',100):null;
  const key=text(idem,'Idempotency-Key',160);if(key.length<8)throw new BadRequestException('Use an idempotency key of at least eight characters.');
  if((saleLineId===null)===(outputLotNumber===null))throw new BadRequestException('Choose either an existing sale line or an actual finished batch, not both.');
  if(!Array.isArray(input.inputs)||input.inputs.length<1||input.inputs.length>30)throw new BadRequestException('Each formula ingredient requires a source batch.');
  const inputs=input.inputs.map(v=>{const x=object(v);return {formulaComponentId:id(x.formulaComponentId,'Formula ingredient'),sourceLotId:id(x.sourceLotId,'Source lot'),wasteQuantity:quantity(x.wasteQuantity??'0','Documented waste',true)};});
  if(new Set(inputs.map(v=>v.formulaComponentId)).size!==inputs.length||new Set(inputs.map(v=>v.sourceLotId)).size!==inputs.length)throw new BadRequestException('Each ingredient and source lot may appear only once in one order.');
  const requestHash=hash({formulaId,warehouseId,batches,saleLineId,outputLotNumber,inputs});
  try{return await this.prisma.$transaction(async tx=>{
   const prior=await tx.inventoryProductionOrder.findFirst({where:{tenantId:t,idempotencyKey:key}});
   if(prior){if(prior.requestHash!==requestHash)throw new ConflictException('Idempotency key was used for a different production order.');return prior;}
   const formula=await tx.inventoryFormula.findFirst({where:{tenantId:t,branchId:b,id:formulaId,status:'approved'},include:{components:true}});
   if(!formula)throw new ConflictException('This formula must be approved before production.');
   if(formula.components.length!==inputs.length||formula.components.some(c=>!inputs.some(v=>v.formulaComponentId===c.id)))throw new BadRequestException('Supply exactly one source lot for every approved ingredient.');
   const warehouse=await tx.warehouse.findFirst({where:{tenantId:t,branchId:b,id:warehouseId,active:true}});if(!warehouse)throw new NotFoundException('Warehouse is unavailable in this branch.');
   const target=await tx.product.findFirst({where:{tenantId:t,id:formula.outputProductId}});
   if(!target)throw new ConflictException('Output product is no longer available.');
   if(saleLineId){
    if(target.trackStock||formula.kind!=='recipe')throw new BadRequestException('A sale-line consumption order requires an approved non-stock menu recipe.');
    const saleLine=await tx.saleLine.findFirst({where:{tenantId:t,id:saleLineId,productId:formula.outputProductId,variantId:formula.outputVariantId,sale:{branchId:b,status:'completed'}}});
    if(!saleLine||quantityMilli(String(saleLine.quantity))!==multiplyQuantity(quantityMilli(String(formula.outputQuantity)),batches))throw new ConflictException('Completed sale line, recipe and quantity must match exactly.');
   }else if(!target.trackLot||target.trackSerial)throw new BadRequestException('Finished batches require a lot-tracked, non-serialized output product.');
   const order=await tx.inventoryProductionOrder.create({data:{tenantId:t,branchId:b,formulaId,warehouseId,saleLineId,outputLotNumber,batches,idempotencyKey:key,requestHash,createdByUserId:a.userId}});
   await tx.inventoryProductionInput.createMany({data:formula.components.map(c=>{const source=inputs.find(x=>x.formulaComponentId===c.id)!;return {tenantId:t,orderId:order.id,formulaComponentId:c.id,sourceLotId:source.sourceLotId,requiredQuantity:formatMilli(multiplyQuantity(quantityMilli(String(c.quantity)),batches)),wasteQuantity:source.wasteQuantity};})});
   await this.audit(tx,t,b,a.userId,'industry.production.drafted',order.id);
   return order;
  },{isolationLevel:'Serializable'});}catch(e){return ruleError(e);}
 }
 @Post('orders/:orderId/approve') @UseGuards(CsrfGuard)
 async approveOrder(@Param('workspaceId') t:string,@Param('branchId') b:string,@Param('orderId') rawId:string,@Req() req:FastifyRequest){
  const a=await this.actor(req,t,b,'inventory.approve');await this.enabled(t);const orderId=id(rawId,'Production order');
  return this.prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM inventory_production_orders WHERE tenant_id=${t}::uuid AND id=${orderId}::uuid FOR UPDATE`;
   const order=await tx.inventoryProductionOrder.findFirst({where:{tenantId:t,branchId:b,id:orderId}});
   if(!order)throw new NotFoundException('Production order not found.');
   if(['approved','completed'].includes(order.status))return order;
   if(order.status!=='draft'||order.createdByUserId===a.userId)throw new ConflictException('A separate stock approver must inspect the production order.');
   const result=await tx.inventoryProductionOrder.update({where:{id:order.id},data:{status:'approved',approvedByUserId:a.userId,approvedAt:new Date()}});
   await this.audit(tx,t,b,a.userId,'industry.production.approved',orderId);return result;
  },{isolationLevel:'Serializable'});
 }
 @Post('orders/:orderId/complete') @UseGuards(CsrfGuard)
 async completeOrder(@Param('workspaceId') t:string,@Param('branchId') b:string,@Param('orderId') rawId:string,@Req() req:FastifyRequest){
  const a=await this.actor(req,t,b,'inventory.approve');await this.enabled(t);const orderId=id(rawId,'Production order');
  try{return await this.prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM inventory_production_orders WHERE tenant_id=${t}::uuid AND id=${orderId}::uuid FOR UPDATE`;
   const order=await tx.inventoryProductionOrder.findFirst({where:{tenantId:t,branchId:b,id:orderId},include:{inputs:true,formula:{include:{components:true}}}});
   if(!order)throw new NotFoundException('Production order not found in this branch.');
   if(order.status==='completed')return {orderId,status:'completed',alreadyCompleted:true,journalId:order.journalId};
   if(order.status!=='approved'||!order.approvedByUserId)throw new ConflictException('Production requires independent approval before stock posting.');
   if(order.formula.status!=='approved')throw new ConflictException('Only a published approved formula can be posted.');
   const outputQty=multiplyQuantity(quantityMilli(String(order.formula.outputQuantity)),order.batches);
   const target=await tx.product.findFirst({where:{tenantId:t,id:order.formula.outputProductId,active:true}});
   if(!target)throw new ConflictException('Finished product was retired.');
   if(order.saleLineId){
    const line=await tx.saleLine.findFirst({where:{tenantId:t,id:order.saleLineId,productId:target.id,variantId:order.formula.outputVariantId,sale:{branchId:b,status:'completed'}}});
    if(!line||quantityMilli(String(line.quantity))!==outputQty)throw new ConflictException('The original sale line or its quantity is no longer valid.');
   }else if(!target.trackLot||target.trackSerial)throw new ConflictException('Finished batch requires a non-serialized lot-tracked product.');
   // PostgreSQL locks source lots in a stable UUID order; changes to available
   // quantity are conditional and roll back with the ledger on any conflict.
   const sourceLotIds=[...new Set(order.inputs.map(i=>i.sourceLotId))].sort();
   if(sourceLotIds.length!==order.inputs.length)throw new ConflictException('A source lot cannot be allocated twice to the same order.');
   for(const sourceLotId of sourceLotIds)await tx.$queryRaw`SELECT id FROM inventory_lots WHERE tenant_id=${t}::uuid AND id=${sourceLotId}::uuid FOR UPDATE`;
   let netCost=0,wasteCost=0;
   for(const allocation of order.inputs){
    const component=order.formula.components.find(c=>c.id===allocation.formulaComponentId);
    if(!component)throw new ConflictException('Approved ingredients changed after order creation.');
    const exact=multiplyQuantity(quantityMilli(String(component.quantity)),order.batches);
    if(exact!==quantityMilli(String(allocation.requiredQuantity)))throw new ConflictException('Production ingredient quantity no longer matches the approved formula.');
    const loss=quantityMilli(String(allocation.wasteQuantity),'Waste',true),total=exact+loss;
    const lot=await tx.inventoryLot.findFirst({where:{tenantId:t,branchId:b,id:allocation.sourceLotId,productId:component.productId,variantId:component.variantId,warehouseId:order.warehouseId,status:'available'}});
    if(!lot)throw new ConflictException('Selected ingredient lot is unavailable in this warehouse.');
    if(lot.expiryDate && lot.expiryDate.getTime()<Date.now()-86_400_000)throw new ConflictException('An ingredient lot is expired.');
    const product=await tx.product.findFirst({where:{tenantId:t,id:component.productId,trackLot:true,trackSerial:false,active:true}});
    if(!product||!product.unitOfMeasure||canonicalStockUnit(product.unitOfMeasure)!==component.unitCode)throw new ConflictException('Ingredient stock profile or base unit no longer matches the approved formula.');
    const available=quantityMilli(String(lot.quantityOnHand),'On hand',true)-quantityMilli(String(lot.quantityReserved),'Reserved',true)-quantityMilli(String(lot.quantityQuarantined),'Quarantined',true);
    if(available<total)throw new ConflictException('Insufficient accepted unreserved ingredient stock; production was not posted.');
    const cost=lot.unitCostMinor;
    const inputCost=extendedMinorCost(exact,cost),scrapCost=extendedMinorCost(loss,cost);
    netCost+=inputCost;wasteCost+=scrapCost;
    const changed=await tx.inventoryLot.updateMany({where:{tenantId:t,id:lot.id,quantityOnHand:{gte:formatMilli(total+quantityMilli(String(lot.quantityReserved),'Reserved',true)+quantityMilli(String(lot.quantityQuarantined),'Quarantined',true))}},data:{quantityOnHand:{decrement:formatMilli(total)}}});
    if(changed.count!==1)throw new ConflictException('Ingredient stock changed during production.');
    const issue=await tx.stockMovement.create({data:{tenantId:t,branchId:b,warehouseId:lot.warehouseId,binId:lot.binId,productId:component.productId,variantId:component.variantId,lotId:lot.id,quantityDelta:`-${formatMilli(exact)}`,unitCostMinor:cost,type:'production_issue',reason:`Approved production ${order.id}`,sourceId:order.id}});
    let lossMovement:string|null=null;
    if(loss>0n){const waste=await tx.stockMovement.create({data:{tenantId:t,branchId:b,warehouseId:lot.warehouseId,binId:lot.binId,productId:component.productId,variantId:component.variantId,lotId:lot.id,quantityDelta:`-${formatMilli(loss)}`,unitCostMinor:cost,type:'write_off',reason:`Documented production waste ${order.id}`,sourceId:order.id}});lossMovement=waste.id;}
    await tx.inventoryProductionInput.update({where:{id:allocation.id},data:{netCostMinor:inputCost,wasteCostMinor:scrapCost,issueMovementId:issue.id,wasteMovementId:lossMovement}});
   }
   const totalCost=netCost+wasteCost;
   if(!Number.isSafeInteger(totalCost)||totalCost>2_000_000_000)throw new ConflictException('Production value exceeds the supported journal limit.');
   let outputLotId:string|null=null;
   if(!order.saleLineId){
    const perUnit=outputUnitCost(netCost,outputQty);
    if(!order.outputLotNumber)throw new ConflictException('Finished stock requires a real batch reference.');
    const existing=await tx.inventoryLot.findFirst({where:{tenantId:t,productId:target.id,warehouseId:order.warehouseId,lotNumber:order.outputLotNumber}});
    if(existing)throw new ConflictException('Finished batch reference is already used. Choose a new batch identifier.');
    const isTester=order.formula.kind==='tester';
    const lot=await tx.inventoryLot.create({data:{tenantId:t,branchId:b,warehouseId:order.warehouseId,productId:target.id,variantId:order.formula.outputVariantId,lotNumber:order.outputLotNumber,quantityOnHand:formatMilli(outputQty),quantityQuarantined:isTester?formatMilli(outputQty):'0',unitCostMinor:perUnit,status:isTester?'quarantine':'available'}});
    outputLotId=lot.id;
    await tx.stockMovement.create({data:{tenantId:t,branchId:b,warehouseId:order.warehouseId,productId:target.id,variantId:order.formula.outputVariantId,lotId:lot.id,quantityDelta:formatMilli(outputQty),unitCostMinor:perUnit,type:'production_receipt',reason:`Finished batch ${order.outputLotNumber}`,sourceId:order.id}});
   }
   const entryLines:Array<{accountKey:string;debitMinor?:number;creditMinor?:number;description:string}>=[];
   if(netCost>0)entryLines.push({accountKey:order.saleLineId?'cost_of_goods_sold':'inventory',debitMinor:netCost,description:order.saleLineId?'Ingredients consumed for prepared sale':'Accepted finished production cost'});
   if(wasteCost>0)entryLines.push({accountKey:'inventory_shrinkage',debitMinor:wasteCost,description:'Reviewed production loss'});
   entryLines.push({accountKey:'inventory',creditMinor:totalCost,description:'Actual source-lot inventory consumed'});
   const journalId=await postLedgerJournal(tx,{tenantId:t,branchId:b,actorUserId:a.userId,sourceType:'inventory_production',sourceId:order.id,memo:`Approved ${order.formula.kind} ${order.id}`,lines:entryLines});
   await tx.inventoryProductionOrder.update({where:{id:order.id},data:{status:'completed',sourceCostMinor:totalCost,wasteCostMinor:wasteCost,outputCostMinor:netCost,journalId,appliedAt:new Date()}});
   await this.audit(tx,t,b,a.userId,'industry.production.completed',order.id);
   return {orderId:order.id,status:'completed',journalId,outputLotId,sourceCostMinor:totalCost,wasteCostMinor:wasteCost,outputCostMinor:netCost,outputQuantity:formatMilli(outputQty),alreadyCompleted:false};
  },{isolationLevel:'Serializable'});}catch(e){return ruleError(e);}
 }

 @Get('eligible-measured-lines')
 async eligibleMeasuredLines(@Param('workspaceId') t:string,@Param('branchId') b:string,@Req() req:FastifyRequest){
  await this.actor(req,t,b,'sales.read');
  return this.prisma.$queryRaw<Array<{id:string;receiptNumber:string;description:string;quantity:string;unitName:string}>>`
   SELECT sl.id,s.receipt_number AS "receiptNumber",sl.product_name_snapshot AS description,
     sl.quantity::text AS quantity,COALESCE(sl.unit_name_snapshot,'') AS "unitName"
   FROM sale_lines sl JOIN sales s ON s.id=sl.sale_id AND s.tenant_id=sl.tenant_id
   JOIN products p ON p.id=sl.product_id AND p.tenant_id=sl.tenant_id
   WHERE sl.tenant_id=${t}::uuid AND s.branch_id=${b}::uuid AND s.status='completed' AND sl.lot_id IS NOT NULL
    AND p.track_stock=true AND p.track_lot=true AND p.track_serial=false
    AND lower(COALESCE(p.unit_of_measure,'')) IN ('m','meter','metre','meters','metres','cm','mm')
    AND NOT EXISTS (SELECT 1 FROM measured_stock_cuts c WHERE c.tenant_id=sl.tenant_id AND c.sale_line_id=sl.id)
   ORDER BY s.created_at DESC LIMIT 80`;
 }
 @Get('measured-cuts')
 async listMeasuredCuts(@Param('workspaceId') t:string,@Param('branchId') b:string,@Req() req:FastifyRequest){
  await this.actor(req,t,b,'inventory.read');return this.prisma.measuredStockCut.findMany({where:{tenantId:t,branchId:b},orderBy:{createdAt:'desc'},take:100});
 }
 @Post('measured-cuts') @UseGuards(CsrfGuard)
 async requestMeasuredCut(@Param('workspaceId') t:string,@Param('branchId') b:string,@Headers('idempotency-key') idem:string|undefined,@Body() raw:unknown,@Req() req:FastifyRequest){
  const a=await this.actor(req,t,b,'inventory.write'),input=object(raw);
  const saleLineId=id(input.saleLineId,'Sale line'),wasteQuantity=quantity(input.wasteQuantity,'Measured cutting waste'),reason=text(input.reason,'Reason',500);
  const key=text(idem,'Idempotency-Key',160);
  if(key.length<8||reason.length<8)throw new BadRequestException('Use a unique operation key and document the cutting loss.');
  const requestHash=hash({saleLineId,wasteQuantity,reason});
  try{return await this.prisma.$transaction(async tx=>{
   const existing=await tx.measuredStockCut.findFirst({where:{tenantId:t,OR:[{idempotencyKey:key},{saleLineId}]}});
   if(existing){if(existing.requestHash!==requestHash)throw new ConflictException('This cutting loss or operation key is already registered with different evidence.');return existing;}
   const line=await tx.saleLine.findFirst({where:{tenantId:t,id:saleLineId,sale:{branchId:b,status:'completed'}}});
   if(!line?.lotId)throw new BadRequestException('A measured-stock cut requires a completed lot-linked sale line.');
   const p=await tx.product.findFirst({where:{tenantId:t,id:line.productId,trackLot:true,trackStock:true,trackSerial:false}});
   if(!p||!p.unitOfMeasure||!['m','cm','mm'].includes(canonicalStockUnit(p.unitOfMeasure)))throw new BadRequestException('Only actual roll or cut-to-length merchandise may record measured cutting losses.');
   const lot=await tx.inventoryLot.findFirst({where:{tenantId:t,branchId:b,id:line.lotId,productId:p.id,variantId:line.variantId}});
   if(!lot||lot.unitCostMinor<=0)throw new ConflictException('The original sale batch and accepted unit cost must be available.');
   const result=await tx.measuredStockCut.create({data:{tenantId:t,branchId:b,saleLineId,lotId:lot.id,wasteQuantity,reason,idempotencyKey:key,requestHash,createdByUserId:a.userId}});
   await this.audit(tx,t,b,a.userId,'industry.measured_cut.requested',result.id);return result;
  },{isolationLevel:'Serializable'});}catch(e){return ruleError(e);}
 }
 @Post('measured-cuts/:cutId/approve') @UseGuards(CsrfGuard)
 async approveMeasuredCut(@Param('workspaceId') t:string,@Param('branchId') b:string,@Param('cutId') rawId:string,@Req() req:FastifyRequest){
  const a=await this.actor(req,t,b,'inventory.approve');await this.enabled(t);const cutId=id(rawId,'Measured cut');
  try{return await this.prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM measured_stock_cuts WHERE tenant_id=${t}::uuid AND id=${cutId}::uuid FOR UPDATE`;
   const cut=await tx.measuredStockCut.findFirst({where:{tenantId:t,branchId:b,id:cutId}});
   if(!cut)throw new NotFoundException('Measured cutting loss not found.');
   if(cut.status==='posted')return {cutId,status:'posted',alreadyPosted:true,journalId:cut.journalId};
   if(cut.status!=='pending'||cut.createdByUserId===a.userId)throw new ConflictException('A separate stock approver must review this cutting loss.');
   await tx.$queryRaw`SELECT id FROM inventory_lots WHERE tenant_id=${t}::uuid AND id=${cut.lotId}::uuid FOR UPDATE`;
   const lot=await tx.inventoryLot.findFirst({where:{tenantId:t,branchId:b,id:cut.lotId}});
   if(!lot||lot.unitCostMinor<=0)throw new ConflictException('Original source lot cost is unavailable.');
   const loss=quantityMilli(String(cut.wasteQuantity));
   const available=quantityMilli(String(lot.quantityOnHand),'On hand',true)-quantityMilli(String(lot.quantityReserved),'Reserved',true)-quantityMilli(String(lot.quantityQuarantined),'Quarantined',true);
   if(available<loss)throw new ConflictException('Cutting waste exceeds the remaining unreserved stock.');
   const updated=await tx.inventoryLot.updateMany({where:{tenantId:t,id:lot.id,quantityOnHand:{gte:formatMilli(loss+quantityMilli(String(lot.quantityReserved),'Reserved',true)+quantityMilli(String(lot.quantityQuarantined),'Quarantined',true))}},data:{quantityOnHand:{decrement:formatMilli(loss)}}});
   if(updated.count!==1)throw new ConflictException('Batch stock changed during cutting loss approval.');
   const cost=extendedMinorCost(loss,lot.unitCostMinor);
   if(cost<=0)throw new ConflictException('Cutting loss has no representable value; obtain an approved stock valuation first.');
   const line=await tx.saleLine.findFirst({where:{tenantId:t,id:cut.saleLineId}});
   if(!line)throw new ConflictException('Original sale no longer exists.');
   const movement=await tx.stockMovement.create({data:{tenantId:t,branchId:b,productId:line.productId,variantId:line.variantId,warehouseId:lot.warehouseId,binId:lot.binId,lotId:lot.id,type:'write_off',quantityDelta:`-${formatMilli(loss)}`,unitCostMinor:lot.unitCostMinor,reason:`Approved cutting loss: ${cut.reason}`,sourceId:cut.id}});
   const journalId=await postLedgerJournal(tx,{tenantId:t,branchId:b,actorUserId:a.userId,sourceType:'measured_cut_loss',sourceId:cut.id,memo:`Documented cutting loss for sale line ${cut.saleLineId}`,lines:[{accountKey:'inventory_shrinkage',debitMinor:cost,description:'Approved measured cutting loss'},{accountKey:'inventory',creditMinor:cost,description:'Source roll reduction'}]});
   await tx.measuredStockCut.update({where:{id:cut.id},data:{status:'posted',wasteCostMinor:cost,movementId:movement.id,journalId,approvedByUserId:a.userId,postedAt:new Date()}});
   await this.audit(tx,t,b,a.userId,'industry.measured_cut.posted',cut.id);
   return {cutId,status:'posted',journalId,wasteQuantity:formatMilli(loss),wasteCostMinor:cost,alreadyPosted:false};
  },{isolationLevel:'Serializable'});}catch(e){return ruleError(e);}
 }

 @Get('divisions')
 async divisions(@Param('workspaceId') t:string,@Param('branchId') b:string,@Req() req:FastifyRequest){
  await this.actor(req,t,b,'workspace.read');return this.prisma.businessDivision.findMany({where:{tenantId:t},orderBy:{name:'asc'}});
 }
 @Get('divisions/assignments')
 async divisionAssignments(@Param('workspaceId') t:string,@Param('branchId') b:string,@Req() req:FastifyRequest){
  await this.actor(req,t,b,'catalog.read');
  return this.prisma.productDivisionLink.findMany({where:{tenantId:t,primary:true},select:{productId:true,divisionId:true},take:5000});
 }
 @Post('divisions') @UseGuards(CsrfGuard)
 async createDivision(@Param('workspaceId') t:string,@Param('branchId') b:string,@Body() raw:unknown,@Req() req:FastifyRequest){
  const a=await this.actor(req,t,b,'workspace.manage');const x=object(raw),code=text(x.code,'Division code',48).toLowerCase(),name=text(x.name,'Division name',120);
  if(!/^[a-z][a-z0-9_]{1,47}$/.test(code))throw new BadRequestException('Division code requires lowercase letters, digits or underscores.');
  try{return await this.prisma.$transaction(async tx=>{const result=await tx.businessDivision.create({data:{tenantId:t,code,name,createdByUserId:a.userId}});await this.audit(tx,t,b,a.userId,'industry.division.created',result.id);return result;});}catch(e){return ruleError(e);}
 }
 @Post('divisions/:divisionId/products/:productId') @UseGuards(CsrfGuard)
 async assignProductDivision(@Param('workspaceId') t:string,@Param('branchId') b:string,@Param('divisionId') dv:string,@Param('productId') pr:string,@Req() req:FastifyRequest){
  const a=await this.actor(req,t,b,'catalog.write'),divisionId=id(dv,'Division'),productId=id(pr,'Product');
  return this.prisma.$transaction(async tx=>{
   if(!await tx.businessDivision.findFirst({where:{tenantId:t,id:divisionId,active:true}}))throw new NotFoundException('Division does not belong to this business.');
   if(!await tx.product.findFirst({where:{tenantId:t,id:productId}}))throw new NotFoundException('Product does not belong to this business.');
   await tx.$queryRaw`SELECT id FROM products WHERE tenant_id=${t}::uuid AND id=${productId}::uuid FOR UPDATE`;
   await tx.productDivisionLink.updateMany({where:{tenantId:t,productId,primary:true},data:{primary:false}});
   const previous=await tx.productDivisionLink.findFirst({where:{tenantId:t,productId,divisionId}});
   const result=previous?await tx.productDivisionLink.update({where:{id:previous.id},data:{primary:true}}):await tx.productDivisionLink.create({data:{tenantId:t,productId,divisionId,primary:true,createdByUserId:a.userId}});
   await this.audit(tx,t,b,a.userId,'industry.division.product_assigned',result.id);return result;
  },{isolationLevel:'Serializable'});
 }
 @Get('divisions/sales-report')
 async salesReport(@Param('workspaceId') t:string,@Param('branchId') b:string,@Req() req:FastifyRequest){
  await this.actor(req,t,b,'finance.read');
  const rows=await this.prisma.$queryRaw<Array<{division_id:string|null;division_name:string;gross_minor:string;refund_minor:string;known_cost_minor:string;unknown_cost_lines:number;line_count:number}>>`
   SELECT sl.business_division_id AS division_id,COALESCE(d.name,'Unassigned') AS division_name,
     COALESCE(SUM(sl.line_total_minor),0)::text AS gross_minor,
     COALESCE(SUM((SELECT COALESCE(SUM(rl.line_total_minor),0) FROM sale_return_lines rl
       JOIN sale_returns sr ON sr.id=rl.return_id AND sr.tenant_id=rl.tenant_id
       WHERE rl.tenant_id=sl.tenant_id AND rl.original_sale_line_id=sl.id AND sr.branch_id=${b}::uuid)),0)::text AS refund_minor,
     COALESCE(SUM(CASE WHEN sl.unit_cost_minor>0 THEN ROUND(sl.quantity*sl.unit_cost_minor) ELSE 0 END),0)::text AS known_cost_minor,
     COUNT(*) FILTER(WHERE sl.unit_cost_minor=0 AND p.track_stock)::int AS unknown_cost_lines,
     COUNT(*)::int AS line_count
   FROM sale_lines sl JOIN sales s ON s.id=sl.sale_id AND s.tenant_id=sl.tenant_id
   JOIN products p ON p.id=sl.product_id AND p.tenant_id=sl.tenant_id
   LEFT JOIN business_divisions d ON d.id=sl.business_division_id AND d.tenant_id=sl.tenant_id
   WHERE sl.tenant_id=${t}::uuid AND s.branch_id=${b}::uuid AND s.status='completed'
   GROUP BY sl.business_division_id,d.name ORDER BY d.name`;
  return {branchId:b,groups:rows,notes:'Posted sale-line attribution only. Historical sales without a division remain unassigned. Known cost excludes returned cost adjustments; gross margin is not asserted until reconciliation.'};
 }

 @Get('unit-conversions')
 async conversions(@Param('workspaceId') t:string,@Param('branchId') b:string,@Req() req:FastifyRequest){
  await this.actor(req,t,b,'inventory.read');const rows=await this.prisma.productUomConversion.findMany({where:{tenantId:t},orderBy:{effectiveAt:'desc'},take:100});return rows.map(row=>({...row,numerator:row.numerator.toString(),denominator:row.denominator.toString()}));
 }
 @Post('unit-conversions') @UseGuards(CsrfGuard)
 async publishConversion(@Param('workspaceId') t:string,@Param('branchId') b:string,@Body() raw:unknown,@Req() req:FastifyRequest){
  const a=await this.actor(req,t,b,'inventory.approve'),x=object(raw),productId=id(x.productId,'Product'),variantId=x.variantId?id(x.variantId,'Variant'):null;
  const fromUnit=canonicalStockUnit(text(x.fromUnit,'Purchase unit',24)),toUnit=canonicalStockUnit(text(x.toUnit,'Stock unit',24));
  const dimension=UNIT_DIMENSIONS[fromUnit];
  if(fromUnit===toUnit||!dimension||dimension!==UNIT_DIMENSIONS[toUnit])throw new BadRequestException('Conversion must be between different units of the same physical dimension.');
  if(typeof x.numerator!=='string'||!/^\d{1,12}$/.test(x.numerator)||BigInt(x.numerator)<1n||typeof x.denominator!=='string'||!/^\d{1,12}$/.test(x.denominator)||BigInt(x.denominator)<1n)throw new BadRequestException('Conversion numerator and denominator must be positive whole-number strings.');
  const numerator=BigInt(x.numerator),denominator=BigInt(x.denominator);
  const evidenceReference=text(x.evidenceReference,'Unit conversion evidence',200);
  // The rational factor must preserve the thousandth base-unit precision.
  try{convertQuantity(1000n,dimension,dimension,numerator,denominator);}catch(e){return ruleError(e);}
  return this.prisma.$transaction(async tx=>{
   const p=await tx.product.findFirst({where:{tenantId:t,id:productId,active:true}});if(!p)throw new NotFoundException('Product not found.');
   if(!p.unitOfMeasure||canonicalStockUnit(p.unitOfMeasure)!==toUnit)throw new BadRequestException('Destination must match the product’s actual stock base unit.');
   if(variantId&&!await tx.productVariant.findFirst({where:{tenantId:t,id:variantId,productId,active:true}}))throw new BadRequestException('Variant does not belong to this product.');
   const latest=await tx.productUomConversion.findFirst({where:{tenantId:t,productId,variantId,fromUnit,toUnit},orderBy:{version:'desc'}});
   const row=await tx.productUomConversion.create({data:{tenantId:t,productId,variantId,fromUnit,toUnit,dimension,numerator,denominator,evidenceReference,version:(latest?.version??0)+1,approvedByUserId:a.userId}});
   await this.audit(tx,t,b,a.userId,'industry.conversion.published',row.id);return {...row,numerator:row.numerator.toString(),denominator:row.denominator.toString()};
  },{isolationLevel:'Serializable'});
 }
}
