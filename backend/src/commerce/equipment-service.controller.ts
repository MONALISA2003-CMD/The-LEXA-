/** Exact-unit upgrades, fulfilment, servicing and reconciliation. New writes are
 * disabled until the tenant's release flag is explicitly approved externally.
 * Every stock/accounting mutation is within the same serializable transaction.
 */
import {BadRequestException,ConflictException,Controller,ForbiddenException,Get,NotFoundException,Param,Post,Body,Req,Headers,UseGuards,UnauthorizedException} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {createHash,randomUUID} from 'node:crypto';
import {PrismaService} from '../prisma/prisma.service';
import {asEquipmentConfigurationSnapshot,InvalidEquipmentConfigurationSnapshot} from '../catalog/equipment-json-snapshot';
import {CsrfGuard} from '../core/csrf.guard';
import {assertBranchAccess} from '../authorization/branch-scope';
import {hasPermission,type Permission} from '../authorization/role-policy';
import {postLedgerJournal} from '../general-ledger/ledger-posting';
import {EQUIPMENT_SUBTYPES} from '../catalog/equipment-domain-rules';
import {validateEquipmentSpecs,validateFulfilmentTransition,requireExactSoldUnit,validateMeterReading,exactRefurbishedUnitCost,EquipmentRuleError,type FulfilmentState} from '../catalog/equipment-domain-rules';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(v:unknown,what:string):string {if(typeof v!=='string'||!UUID.test(v))throw new BadRequestException(`${what} must be a valid identifier.`);return v;}
function obj(v:unknown,what='Request'):Record<string,unknown> {if(!v||typeof v!=='object'||Array.isArray(v))throw new BadRequestException(`${what} must be an object.`);return v as Record<string,unknown>;}
function txt(v:unknown,what:string,max=200):string {if(typeof v!=='string'||!v.trim()||v.trim().length>max||/[\x00-\x1f]/.test(v))throw new BadRequestException(`${what} is required (maximum ${max} characters).`);return v.trim();}
function amount(v:unknown,what:string,max=2_000_000_000):number {if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>max)throw new BadRequestException(`${what} must be a non-negative integer in minor units.`);return v;}
function quantity(v:unknown):number {if(typeof v!=='number'||!Number.isFinite(v)||v<=0||v>1_000_000||Math.round(v*1000)!==v*1000)throw new BadRequestException('Quantity must be positive with no more than three decimals.');return v;}
function safeJson(v:unknown,what:string,bytes=3000):Record<string,unknown> {const x=obj(v??{},what);if(Object.keys(x).length>30||JSON.stringify(x).length>bytes)throw new BadRequestException(`${what} is too large.`);return x;}
function sha(v:unknown):string{return createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function cookie(req:FastifyRequest):string|undefined {for(const pair of (req.headers.cookie??'').split(';')){const i=pair.indexOf('=');if(i<0||pair.slice(0,i).trim()!=='lexa_session')continue;try{return decodeURIComponent(pair.slice(i+1).trim());}catch{return undefined;}}return undefined;}
function mapRuleError(error:unknown):never {if(error instanceof EquipmentRuleError)throw new BadRequestException(error.message);if(error instanceof InvalidEquipmentConfigurationSnapshot)throw new ConflictException(error.message);if((error as {code?:string})?.code==='P2002')throw new ConflictException('This equipment operation was already recorded.');throw error;}

@Controller('workspaces/:workspaceId/branches/:branchId/equipment')
export class EquipmentServiceController {
 constructor(private readonly prisma:PrismaService){}
 private async actor(req:FastifyRequest,tenantId:string,branchId:string,permission:Permission){
  const token=cookie(req);if(!token)throw new UnauthorizedException('Sign in to use equipment services.');
  const session=await this.prisma.session.findFirst({where:{tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:{gt:new Date()}},select:{userId:true}});
  if(!session)throw new UnauthorizedException('Session expired.');
  this.prisma.enterTenantContext(tenantId,session.userId);
  const membership=await this.prisma.membership.findUnique({where:{tenantId_userId:{tenantId,userId:session.userId}}});
  if(!membership||membership.status!=='ACTIVE')throw new NotFoundException('Workspace not found.');
  if(!hasPermission(membership.role,permission))throw new ForbiddenException('Your role cannot perform this equipment operation.');
  if(!await this.prisma.branch.findFirst({where:{tenantId,id:branchId},select:{id:true}}))throw new NotFoundException('Business branch not found.');
  await assertBranchAccess(this.prisma,tenantId,branchId,session.userId,membership.role);
  return {userId:session.userId,role:membership.role};
 }
 private async flag(tenantId:string,feature:'equipmentServiceV2'|'applianceFulfilmentV2'){
  const rows=await this.prisma.$queryRaw<Array<{enabled:boolean}>>`
   SELECT o.enabled FROM tenant_feature_overrides o JOIN tenant_subscriptions s ON s.tenant_id=o.tenant_id
   WHERE o.tenant_id=${tenantId}::uuid AND o.feature_key=${feature} AND o.enabled=true
    AND (o.expires_at IS NULL OR o.expires_at>now()) AND s.status IN ('active','trialing') LIMIT 1`;
  if(rows[0]?.enabled!==true)throw new ForbiddenException('This equipment service has not been activated for this business.');
 }
 private async audit(tx:any,tenantId:string,branchId:string,actorId:string,action:string,resource:string,resourceId:string){
  await tx.auditEvent.create({data:{tenantId,branchId,actorUserId:actorId,action,resourceType:resource,resourceId}});
 }
 private async soldLine(tx:any,tenantId:string,branchId:string,saleLineId:string,serialId:string){
  const line=await tx.saleLine.findFirst({where:{tenantId,id:saleLineId,sale:{branchId,status:'completed'}}});
  if(!line)throw new NotFoundException('Original sale line not found in this branch.');
  try{requireExactSoldUnit(line.serialIds,serialId);}catch(e){return mapRuleError(e);}
  const unit=await tx.inventorySerial.findFirst({where:{tenantId,branchId,id:serialId,productId:line.productId}});
  if(!unit)throw new NotFoundException('Physical unit does not match this sale.');
  if(unit.status==='available'||unit.status==='reserved')throw new ConflictException('This device has not been sold or was already restocked.');
  return {line,unit};
 }
 @Get('subtypes')
 async subtypes(@Param('workspaceId') w:string,@Param('branchId') b:string,@Req() req:FastifyRequest){
  await this.actor(req,w,b,'catalog.read');return {version:1,subtypes:EQUIPMENT_SUBTYPES};
 }
 @Post('subtypes/validate') @UseGuards(CsrfGuard)
 async validateSpecs(@Param('workspaceId') w:string,@Param('branchId') b:string,@Req() req:FastifyRequest,@Body() raw:unknown){
  await this.actor(req,w,b,'catalog.write');const data=obj(raw);
  try{return {subtypeCode:txt(data.subtypeCode,'Product subtype',100),specifications:validateEquipmentSpecs(txt(data.subtypeCode,'Product subtype',100),data.specifications,data.manufacturerModelCode,typeof data.familyCode==='string'?data.familyCode:undefined),stockCreated:false};}
  catch(e){return mapRuleError(e);}
 }
 @Get('rollout-status')
 async rollout(@Param('workspaceId') w:string,@Param('branchId') b:string,@Req() req:FastifyRequest){
  await this.actor(req,w,b,'workspace.read');
  const rows=await this.prisma.$queryRaw<Array<{feature_key:string;enabled:boolean}>>`
   SELECT feature_key,enabled FROM tenant_feature_overrides WHERE tenant_id=${w}::uuid
    AND feature_key=ANY(ARRAY['equipmentServiceV2','applianceFulfilmentV2','electronicsCatalogueV2','phoneIdentifierRegistryV2','accessoryFitmentV2']::text[])
    AND (expires_at IS NULL OR expires_at>now())`;
  const byFeature=new Map(rows.map(r=>[r.feature_key,r.enabled]));
  return {flags:Object.fromEntries(['equipmentServiceV2','applianceFulfilmentV2','electronicsCatalogueV2','phoneIdentifierRegistryV2','accessoryFitmentV2'].map(f=>[f,byFeature.get(f)===true])),requiresStagingAcceptance:true};
 }
 @Get('upgrades')
 async listUpgrades(@Param('workspaceId') w:string,@Param('branchId') b:string,@Req() req:FastifyRequest){
  await this.actor(req,w,b,'inventory.read');
  // A separate approver must be able to find a pending order after the author logs out.
  // No stock is mutated on this path; all records remain branch-scoped.
  return this.prisma.equipmentUpgradeWorkOrder.findMany({
   where:{tenantId:w,branchId:b,status:{in:['draft','approved']}},
   select:{id:true,serialId:true,status:true,createdByUserId:true,approvedByUserId:true,
    initialCostMinor:true,partsCostMinor:true,labourCostMinor:true,createdAt:true},
   orderBy:{createdAt:'desc'},take:100,
  });
 }
 @Post('upgrades') @UseGuards(CsrfGuard)
 async draftUpgrade(@Param('workspaceId') w:string,@Param('branchId') b:string,@Headers('idempotency-key') key:string|undefined,@Req() req:FastifyRequest,@Body() raw:unknown){
  const actor=await this.actor(req,w,b,'inventory.write');await this.flag(w,'equipmentServiceV2');
  const x=obj(raw),serialId=id(x.serialId,'Physical unit'),idem=txt(key,'Idempotency key',160),before=safeJson(x.beforeSpecs,'Existing configuration'),after=safeJson(x.afterSpecs,'Proposed configuration'),inspection=safeJson(x.inspection,'Inspection'),labourCostMinor=amount(x.approvedLabourMinor??0,'Planned labour');
  if(!Object.keys(before).length||!Object.keys(after).length||inspection.conditionChecked!==true||inspection.physicalSerialScanned!==true)throw new BadRequestException('Document the before and after configuration, inspect the device and scan its physical serial.');
  if(JSON.stringify(before)===JSON.stringify(after)&&labourCostMinor===0&&!Array.isArray(x.parts))throw new BadRequestException('Describe a configuration change or actual replacement part.');
  if(!Array.isArray(x.parts)||x.parts.length<1||x.parts.length>20)throw new BadRequestException('Select 1–20 actual spare parts for an upgrade.');
  const parts=x.parts.map(v=>{const p=obj(v,'Part');return {productId:id(p.productId,'Part product'),variantId:p.variantId?id(p.variantId,'Part variant'):null,warehouseId:id(p.warehouseId,'Part warehouse'),lotId:p.lotId?id(p.lotId,'Part lot'):null,quantity:quantity(p.quantity)};});
  if(new Set(parts.map(p=>`${p.productId}:${p.variantId??''}:${p.lotId??''}`)).size!==parts.length)throw new BadRequestException('Combine repeated parts into one quantity.');
  const requestHash=sha({serialId,before,after,inspection,labourCostMinor,parts});
  try{return await this.prisma.$transaction(async tx=>{
   const previous=await tx.equipmentUpgradeWorkOrder.findFirst({where:{tenantId:w,idempotencyKey:idem}});
   if(previous){if(previous.requestHash!==requestHash)throw new ConflictException('Idempotency key was already used for a different upgrade.');return previous;}
   const unit=await tx.inventorySerial.findFirst({where:{tenantId:w,branchId:b,id:serialId,status:'available'}});
   if(!unit||unit.unitCostMinor===null)throw new ConflictException('The device must be physically available in this branch with an accepted exact unit cost.');
   const product=await tx.product.findFirst({where:{tenantId:w,id:unit.productId}});
   if(!product||!['laptop','desktop','server','monitor'].includes(product.productType??''))throw new BadRequestException('This upgrade workflow is for computing equipment.');
   const row=await tx.equipmentUpgradeWorkOrder.create({data:{tenantId:w,branchId:b,serialId,idempotencyKey:idem,requestHash,beforeSpecs:before as any,afterSpecs:after as any,inspection:inspection as any,initialCostMinor:unit.unitCostMinor,labourCostMinor,createdByUserId:actor.userId}});
   for(const part of parts){
    const item=await tx.product.findFirst({where:{tenantId:w,id:part.productId,active:true}});
    if(!item?.trackStock||item.trackSerial)throw new BadRequestException('Upgrade parts must be active quantity or lot-tracked inventory.');
    if(Boolean(part.lotId)!==item.trackLot)throw new BadRequestException('Match the part lot-tracking requirement.');
    if(part.variantId&&!await tx.productVariant.findFirst({where:{tenantId:w,id:part.variantId,productId:item.id,active:true}}))throw new BadRequestException('Selected part variant does not belong to the part.');
    if(!part.variantId&&await tx.productVariant.count({where:{tenantId:w,productId:item.id,active:true}}))throw new BadRequestException('Choose the exact spare-part SKU.');
    if(!await tx.warehouse.findFirst({where:{tenantId:w,branchId:b,id:part.warehouseId,active:true}}))throw new BadRequestException('Spare-part warehouse is not active in this branch.');
    if(part.lotId&&!await tx.inventoryLot.findFirst({where:{tenantId:w,branchId:b,id:part.lotId,productId:item.id,variantId:part.variantId,warehouseId:part.warehouseId}}))throw new BadRequestException('Part lot belongs to a different product or warehouse.');
    await tx.equipmentUpgradePart.create({data:{tenantId:w,workOrderId:row.id,productId:part.productId,variantId:part.variantId,lotId:part.lotId,warehouseId:part.warehouseId,quantity:String(part.quantity)}});
   }
   await this.audit(tx,w,b,actor.userId,'equipment.upgrade.drafted','equipment_upgrade_work_order',row.id);return row;
  },{isolationLevel:'Serializable'});}catch(e){return mapRuleError(e);}
 }
 @Post('upgrades/:orderId/approve') @UseGuards(CsrfGuard)
 async approveUpgrade(@Param('workspaceId') w:string,@Param('branchId') b:string,@Param('orderId') orderId:string,@Req() req:FastifyRequest){
  const actor=await this.actor(req,w,b,'inventory.approve');await this.flag(w,'equipmentServiceV2');const order=id(orderId,'Work order');
  return this.prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM equipment_upgrade_work_orders WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${order}::uuid FOR UPDATE`;
   const found=await tx.equipmentUpgradeWorkOrder.findFirst({where:{tenantId:w,branchId:b,id:order}});if(!found)throw new NotFoundException('Work order not found.');
   if(found.status!=='draft'||found.createdByUserId===actor.userId)throw new ConflictException('A separate inventory approver must authorize an unapproved upgrade.');
   const saved=await tx.equipmentUpgradeWorkOrder.update({where:{id:order},data:{status:'approved',approvedByUserId:actor.userId,approvedAt:new Date()}});
   await this.audit(tx,w,b,actor.userId,'equipment.upgrade.approved','equipment_upgrade_work_order',order);return saved;
  });
 }
 @Post('upgrades/:orderId/apply') @UseGuards(CsrfGuard)
 async applyUpgrade(@Param('workspaceId') w:string,@Param('branchId') b:string,@Param('orderId') orderId:string,@Req() req:FastifyRequest){
  const actor=await this.actor(req,w,b,'inventory.approve');await this.flag(w,'equipmentServiceV2');const order=id(orderId,'Work order');
  try{return await this.prisma.$transaction(async tx=>{
   const work=await tx.equipmentUpgradeWorkOrder.findFirst({where:{tenantId:w,branchId:b,id:order}});if(!work)throw new NotFoundException('Work order not found.');
   if(work.status==='applied')return {orderId:order,status:'applied',alreadyApplied:true};
   if(work.status!=='approved'||!work.approvedByUserId)throw new ConflictException('A separate approved upgrade is required before issuing parts.');
   const parts=await tx.equipmentUpgradePart.findMany({where:{tenantId:w,workOrderId:order},orderBy:{productId:'asc'}});
   if(!parts.length)throw new ConflictException('Upgrade has no registered parts.');
   const parent=await tx.inventorySerial.findFirst({where:{tenantId:w,id:work.serialId},select:{productId:true}});
   if(!parent)throw new NotFoundException('Unit not found.');
   const productIds=[...new Set([...parts.map(p=>p.productId),parent.productId])].sort();
   // Lock each product in stable order; do not rely on an array cast for Prisma raw SQL.
   for(const productId of productIds)await tx.$queryRaw`SELECT id FROM products WHERE tenant_id=${w}::uuid AND id=${productId}::uuid FOR UPDATE`;
   await tx.$queryRaw`SELECT id FROM equipment_upgrade_work_orders WHERE tenant_id=${w}::uuid AND id=${order}::uuid FOR UPDATE`;
   await tx.$queryRaw`SELECT id FROM inventory_serials WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${work.serialId}::uuid FOR UPDATE`;
   const unit=await tx.inventorySerial.findFirst({where:{tenantId:w,branchId:b,id:work.serialId,status:'available'}});
   if(!unit||unit.unitCostMinor===null||unit.unitCostMinor!==work.initialCostMinor)throw new ConflictException('Device status or cost changed since upgrade approval. Reinspect before applying.');
   let partsCost=0;
   for(const part of parts){
    const p=await tx.product.findFirst({where:{tenantId:w,id:part.productId,trackStock:true,trackSerial:false,active:true}});
    if(!p)throw new ConflictException('A spare-part SKU is no longer available.');
    const variant=part.variantId?await tx.productVariant.findFirst({where:{tenantId:w,productId:p.id,id:part.variantId,active:true}}):null;
    if(part.variantId&&!variant)throw new ConflictException('A spare-part variant has been retired.');
    const q=Number(part.quantity);let unitCost=variant?.costPriceMinor??p.costPriceMinor;
    if(part.lotId){
     await tx.$queryRaw`SELECT id FROM inventory_lots WHERE tenant_id=${w}::uuid AND id=${part.lotId}::uuid FOR UPDATE`;
     const lot=await tx.inventoryLot.findFirst({where:{tenantId:w,branchId:b,id:part.lotId,productId:p.id,variantId:part.variantId,warehouseId:part.warehouseId,status:'available'}});
     if(!lot||Number(lot.quantityOnHand)-Number(lot.quantityReserved)-Number(lot.quantityQuarantined)<q)throw new ConflictException('Insufficient unreserved, non-quarantined spare parts.');
     unitCost=lot.unitCostMinor;
     const changed=await tx.inventoryLot.updateMany({where:{tenantId:w,id:lot.id,quantityOnHand:{gte:Number(lot.quantityReserved)+Number(lot.quantityQuarantined)+q}},data:{quantityOnHand:{decrement:q}}});
     if(changed.count!==1)throw new ConflictException('Spare-part lot changed during upgrade.');
    }else{
     const [stock,reserved]=await Promise.all([
      tx.stockMovement.aggregate({where:{tenantId:w,branchId:b,productId:p.id,variantId:part.variantId,warehouseId:part.warehouseId},_sum:{quantityDelta:true}}),
      tx.stockReservation.aggregate({where:{tenantId:w,branchId:b,productId:p.id,variantId:part.variantId,warehouseId:part.warehouseId,status:'active'},_sum:{quantity:true}}),
     ]);
     if(Number(stock._sum.quantityDelta??0)-Number(reserved._sum.quantity??0)<q)throw new ConflictException('Insufficient unreserved spare-part quantity.');
    }
    if(!Number.isSafeInteger(unitCost)||unitCost<=0)throw new ConflictException('An actual supplier cost is required for each upgrade part.');
    partsCost+=Math.round(q*unitCost);
    const movement=await tx.stockMovement.create({data:{tenantId:w,branchId:b,warehouseId:part.warehouseId,productId:p.id,variantId:part.variantId,lotId:part.lotId,quantityDelta:String(-q),unitCostMinor:unitCost,type:'production_issue',reason:`Approved device upgrade ${order}`,sourceId:order}});
    await tx.equipmentUpgradePart.update({where:{id:part.id},data:{actualUnitCostMinor:unitCost,movementId:movement.id}});
   }
   const resultingCost=exactRefurbishedUnitCost(work.initialCostMinor,[partsCost],work.labourCostMinor);
   const updated=await tx.inventorySerial.updateMany({where:{tenantId:w,branchId:b,id:unit.id,status:'available',unitCostMinor:work.initialCostMinor},data:{unitCostMinor:resultingCost}});
   if(updated.count!==1)throw new ConflictException('The device cost changed concurrently.');
   await tx.equipmentUnitConfigurationEvent.create({data:{tenantId:w,branchId:b,serialId:unit.id,workOrderId:order,previousSpecs:asEquipmentConfigurationSnapshot(work.beforeSpecs,'Original specifications'),configuredSpecs:asEquipmentConfigurationSnapshot(work.afterSpecs,'Configured specifications'),initialCostMinor:work.initialCostMinor,addedCostMinor:partsCost+work.labourCostMinor,resultingCostMinor:resultingCost,recordedByUserId:actor.userId}});
   let journalId:string|null=null;
   if(partsCost+work.labourCostMinor>0){
    const lines:any[]=[{accountKey:'inventory',debitMinor:partsCost+work.labourCostMinor,description:'Capitalized unit upgrade cost'}];
    if(partsCost>0)lines.push({accountKey:'inventory',creditMinor:partsCost,description:'Issue stocked components to exact device'});
    if(work.labourCostMinor>0)lines.push({accountKey:'accrued_expenses',creditMinor:work.labourCostMinor,description:'Approved refurbishment labour payable'});
    journalId=await postLedgerJournal(tx,{tenantId:w,branchId:b,actorUserId:actor.userId,sourceType:'equipment_upgrade',sourceId:order,memo:`Approved device configuration change ${order}`,lines});
   }
   await tx.equipmentUpgradeWorkOrder.update({where:{id:order},data:{status:'applied',partsCostMinor:partsCost,journalId,appliedAt:new Date()}});
   await this.audit(tx,w,b,actor.userId,'equipment.upgrade.applied','equipment_upgrade_work_order',order);
   return {orderId:order,status:'applied',resultingCostMinor:resultingCost,partsCostMinor:partsCost,labourCostMinor:work.labourCostMinor,journalId,alreadyApplied:false};
  },{isolationLevel:'Serializable'});}catch(e){return mapRuleError(e);}
 }
 @Get('serials/:serialId/service-history')
 async history(@Param('workspaceId') w:string,@Param('branchId') b:string,@Param('serialId') raw:string,@Req() req:FastifyRequest){
  await this.actor(req,w,b,'inventory.read');const serial=id(raw,'Unit');const unit=await this.prisma.inventorySerial.findFirst({where:{tenantId:w,branchId:b,id:serial}});
  if(!unit)throw new NotFoundException('Unit not found in this branch.');
  const [configuration,fulfilment,warranty,meters]=await Promise.all([
   this.prisma.equipmentUnitConfigurationEvent.findMany({where:{tenantId:w,branchId:b,serialId:serial},orderBy:{recordedAt:'desc'},take:100}),
   this.prisma.equipmentUnitFulfilment.findFirst({where:{tenantId:w,branchId:b,serialId:serial}}),
   this.prisma.equipmentWarrantyCase.findMany({where:{tenantId:w,branchId:b,serialId:serial},orderBy:{createdAt:'desc'},take:100}),
   this.prisma.equipmentCopierMeterEvent.findMany({where:{tenantId:w,branchId:b,serialId:serial},orderBy:{createdAt:'desc'},take:50}),
  ]);
  return {unitId:serial,productId:unit.productId,currentStatus:unit.status,configuration,fulfilment,warranty,meters:meters.map(m=>({...m,totalCount:m.totalCount.toString(),colourCount:m.colourCount.toString()}))};
 }
 @Post('fulfilments') @UseGuards(CsrfGuard)
 async createFulfilment(@Param('workspaceId') w:string,@Param('branchId') b:string,@Req() req:FastifyRequest,@Body() raw:unknown){
  const actor=await this.actor(req,w,b,'fulfilment.write');await this.flag(w,'applianceFulfilmentV2');const x=obj(raw),saleLineId=id(x.saleLineId,'Sale line'),serialId=id(x.serialId,'Physical unit');
  return this.prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM inventory_serials WHERE tenant_id=${w}::uuid AND id=${serialId}::uuid FOR UPDATE`;
   await this.soldLine(tx,w,b,saleLineId,serialId);
   const previous=await tx.equipmentUnitFulfilment.findFirst({where:{tenantId:w,serialId}});
   if(previous){if(previous.saleLineId!==saleLineId)throw new ConflictException('Physical unit already allocated to a different sale.');return previous;}
   const row=await tx.equipmentUnitFulfilment.create({data:{tenantId:w,branchId:b,saleLineId,serialId,createdByUserId:actor.userId}});
   await tx.equipmentFulfilmentEvent.create({data:{tenantId:w,fulfilmentId:row.id,previousState:null,nextState:'reserved',actorUserId:actor.userId}});
   await this.audit(tx,w,b,actor.userId,'equipment.fulfilment.created','equipment_unit_fulfilment',row.id);return row;
  },{isolationLevel:'Serializable'});
 }
 @Post('fulfilments/:fulfilmentId/transition') @UseGuards(CsrfGuard)
 async transitionFulfilment(@Param('workspaceId') w:string,@Param('branchId') b:string,@Param('fulfilmentId') rawId:string,@Req() req:FastifyRequest,@Body() raw:unknown){
  const actor=await this.actor(req,w,b,'fulfilment.write');await this.flag(w,'applianceFulfilmentV2');const idValue=id(rawId,'Delivery'),x=obj(raw),next=txt(x.nextState,'Delivery state',40) as FulfilmentState;
  const evidenceReference=x.evidenceReference?txt(x.evidenceReference,'Proof reference',250):null,checklist=safeJson(x.checklist??{},'Delivery checks');
  return this.prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM equipment_unit_fulfilments WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${idValue}::uuid FOR UPDATE`;
   const row=await tx.equipmentUnitFulfilment.findFirst({where:{tenantId:w,branchId:b,id:idValue}});if(!row)throw new NotFoundException('Delivery not found.');
   if(row.state===next)return row; // safe retry: no duplicate proof or state reversal
   try{validateFulfilmentTransition(row.state as FulfilmentState,next);}catch(e){return mapRuleError(e);}
   if(next==='delivered'&&(!evidenceReference||checklist.serialScanned!==true||checklist.recipientConfirmed!==true))throw new BadRequestException('Delivery needs exact-serial scan, recipient confirmation and proof reference.');
   if(next==='returned_to_warehouse'&&checklist.stockDispositionApproved===true)throw new BadRequestException('Delivery reversal does not return a sold device to available stock. Use an inspected sale-return workflow.');
   const saved=await tx.equipmentUnitFulfilment.update({where:{id:idValue},data:{state:next,deliveredAt:next==='delivered'?new Date():row.deliveredAt}});
   await tx.equipmentFulfilmentEvent.create({data:{tenantId:w,fulfilmentId:idValue,previousState:row.state,nextState:next,evidenceReference,checklist:checklist as any,actorUserId:actor.userId}});
   await this.audit(tx,w,b,actor.userId,`equipment.fulfilment.${next}`,'equipment_unit_fulfilment',idValue);
   return saved;
  },{isolationLevel:'Serializable'});
 }
 @Post('installed-systems') @UseGuards(CsrfGuard)
 async installedSystem(@Param('workspaceId') w:string,@Param('branchId') b:string,@Req() req:FastifyRequest,@Body() raw:unknown){
  const actor=await this.actor(req,w,b,'fulfilment.write');await this.flag(w,'applianceFulfilmentV2');const x=obj(raw),saleId=id(x.saleId,'Sale'),kind=txt(x.kind,'System type',30);
  if(!['split_ac','cctv','network','appliance','office'].includes(kind))throw new BadRequestException('Choose a supported installed system.');
  if(!Array.isArray(x.components)||!x.components.length||x.components.length>32)throw new BadRequestException('Specify each actual component serial.');
  const items=x.components.map(c=>{const o=obj(c);return {serialId:id(o.serialId,'Component serial'),role:txt(o.role,'Component role',30)};});
  if(new Set(items.map(i=>i.serialId)).size!==items.length)throw new ConflictException('Each physical unit may belong to this system once.');
  if(kind==='split_ac'&&(items.length!==2||items.filter(i=>i.role==='indoor').length!==1||items.filter(i=>i.role==='outdoor').length!==1))throw new BadRequestException('A split AC needs one indoor serial and one outdoor serial.');
  try{return await this.prisma.$transaction(async tx=>{
   const sale=await tx.sale.findFirst({where:{tenantId:w,branchId:b,id:saleId,status:'completed'}});if(!sale)throw new NotFoundException('Original completed sale not found.');
   for(const item of items){
    if(!['indoor','outdoor','camera','recorder','network','peripheral','base'].includes(item.role))throw new BadRequestException('Unsupported installation role.');
    const line=await tx.saleLine.findFirst({where:{tenantId:w,saleId,serialIds:{has:item.serialId}}});
    if(!line)throw new BadRequestException('Every installed physical unit must belong to this sale.');
    await this.soldLine(tx,w,b,line.id,item.serialId);
   }
   const system=await tx.equipmentInstalledSystem.create({data:{tenantId:w,branchId:b,saleId,kind,createdByUserId:actor.userId}});
   for(const item of items)await tx.equipmentInstalledComponent.create({data:{tenantId:w,systemId:system.id,serialId:item.serialId,componentRole:item.role}});
   await this.audit(tx,w,b,actor.userId,'equipment.system.installed_draft','equipment_installed_system',system.id);return system;
  },{isolationLevel:'Serializable'});}catch(e){return mapRuleError(e);}
 }
 @Post('installed-systems/:systemId/commission') @UseGuards(CsrfGuard)
 async commission(@Param('workspaceId') w:string,@Param('branchId') b:string,@Param('systemId') raw:string,@Req() req:FastifyRequest,@Body() data:unknown){
  const actor=await this.actor(req,w,b,'fulfilment.write');await this.flag(w,'applianceFulfilmentV2');const sid=id(raw,'Installed system'),x=obj(data),checklist=safeJson(x.checklist,'Commissioning checklist',3500);
  if(checklist.safetyReviewed!==true||checklist.deviceSerialsVerified!==true||checklist.customerAcknowledged!==true)throw new BadRequestException('Safety review, component verification and customer acknowledgment are required.');
  return this.prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM equipment_installed_systems WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${sid}::uuid FOR UPDATE`;
   const system=await tx.equipmentInstalledSystem.findFirst({where:{tenantId:w,branchId:b,id:sid}});if(!system)throw new NotFoundException('Installed system not found.');
   if(system.state==='commissioned')return system;
   if(system.state!=='planned'&&system.state!=='installed')throw new ConflictException('This system is not ready for commissioning.');
   const saved=await tx.equipmentInstalledSystem.update({where:{id:sid},data:{state:'commissioned',commissionedAt:new Date(),commissioning:checklist as any,technicianUserId:actor.userId}});
   await this.audit(tx,w,b,actor.userId,'equipment.system.commissioned','equipment_installed_system',sid);return saved;
  });
 }
 @Post('warranty-cases') @UseGuards(CsrfGuard)
 async warranty(@Param('workspaceId') w:string,@Param('branchId') b:string,@Req() req:FastifyRequest,@Body() raw:unknown){
  const actor=await this.actor(req,w,b,'support.write');await this.flag(w,'equipmentServiceV2');const x=obj(raw),serialId=id(x.serialId,'Physical unit'),saleLineId=id(x.saleLineId,'Original sale line'),issue=txt(x.issueSummary,'Warranty issue',500);
  if(issue.length<5)throw new BadRequestException('Provide a meaningful warranty issue summary.');
  return this.prisma.$transaction(async tx=>{
   const {line}=await this.soldLine(tx,w,b,saleLineId,serialId);
   const row=await tx.equipmentWarrantyCase.create({data:{tenantId:w,branchId:b,serialId,saleLineId,issueSummary:issue,warrantyPolicySnapshot:{originalSaleLineId:line.id,warrantyMonths:line.warrantyMonthsSnapshot??null,originalSaleId:line.saleId},createdByUserId:actor.userId}});
   await this.audit(tx,w,b,actor.userId,'equipment.warranty.opened','equipment_warranty_case',row.id);return row;
  });
 }
 @Post('customer-repairs') @UseGuards(CsrfGuard)
 async custody(@Param('workspaceId') w:string,@Param('branchId') b:string,@Req() req:FastifyRequest,@Body() raw:unknown){
  const actor=await this.actor(req,w,b,'support.write');await this.flag(w,'equipmentServiceV2');const x=obj(raw),desc=txt(x.deviceDescription,'Device description',300),consent=txt(x.consentReference,'Consent reference',200);
  const serial=typeof x.manufacturerSerial==='string'?x.manufacturerSerial.trim():'';
  if(serial.length>120)throw new BadRequestException('Manufacturer serial is too long.');
  const masked=serial.length>5?`${'*'.repeat(Math.min(10,serial.length-4))}${serial.slice(-4)}`:serial?'****':null;
  // Intake and its audit record commit together. Never create stock for customer property.
  return this.prisma.$transaction(async tx=>{
   const row=await tx.equipmentCustomerRepairCustody.create({data:{tenantId:w,branchId:b,deviceDescription:desc,manufacturerSerialMasked:masked,consentReference:consent,customerRecordId:typeof x.customerRecordId==='string'?txt(x.customerRecordId,'Customer record',160):null,intakeCondition:safeJson(x.intakeCondition??{},'Intake condition') as any,receivedByUserId:actor.userId}});
   await this.audit(tx,w,b,actor.userId,'equipment.customer_custody.received','equipment_customer_repair_custody',row.id);
   return row;
  },{isolationLevel:'Serializable'});
 }
 @Post('copier-meters') @UseGuards(CsrfGuard)
 async meter(@Param('workspaceId') w:string,@Param('branchId') b:string,@Req() req:FastifyRequest,@Body() raw:unknown){
  const actor=await this.actor(req,w,b,'support.write');await this.flag(w,'equipmentServiceV2');const x=obj(raw),serialId=id(x.serialId,'Printer serial');
  const next={total:amount(x.totalCount,'Total copies'),colour:amount(x.colourCount??0,'Colour copies')};
  return this.prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM inventory_serials WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${serialId}::uuid FOR UPDATE`;
   const unit=await tx.inventorySerial.findFirst({where:{tenantId:w,branchId:b,id:serialId}});
   if(!unit)throw new NotFoundException('Printer physical unit not found.');
   const product=await tx.product.findFirst({where:{tenantId:w,id:unit.productId}});
   if(!product||!['printer','office_machine'].includes(product.productType??''))throw new BadRequestException('Only a registered printer or copier can report a service meter.');
   const prior=await tx.equipmentCopierMeterEvent.findFirst({where:{tenantId:w,serialId},orderBy:{createdAt:'desc'}});
   try{validateMeterReading(prior?{total:Number(prior.totalCount),colour:Number(prior.colourCount)}:null,next);}catch(e){return mapRuleError(e);}
   return tx.equipmentCopierMeterEvent.create({data:{tenantId:w,branchId:b,serialId,totalCount:BigInt(next.total),colourCount:BigInt(next.colour),evidenceReference:x.evidenceReference?txt(x.evidenceReference,'Meter evidence',250):null,recordedByUserId:actor.userId}});
  });
 }
 @Get('reports/physical-units')
 async report(@Param('workspaceId') w:string,@Param('branchId') b:string,@Req() req:FastifyRequest){
  await this.actor(req,w,b,'reports.read');
  // Product/model sales, exact physical cost and aged serials. Immutable posted
  // receipts provide actual COGS; no use of merchant-edited current selling price.
  return this.prisma.$queryRaw<Array<{productId:string;modelId:string|null;receivedCount:number;soldCount:number;availableCount:number;ageDays:string|null;unknownCostLines:number;grossMarginMinor:string|null}>>`
   SELECT p.id::text AS "productId",p.catalog_model_id::text AS "modelId",
     count(DISTINCT s.id) FILTER(WHERE s.accepted_at IS NOT NULL)::int AS "receivedCount",
     count(DISTINCT s.id) FILTER(WHERE s.status='sold')::int AS "soldCount",
     count(DISTINCT s.id) FILTER(WHERE s.status='available')::int AS "availableCount",
     round(avg(EXTRACT(epoch FROM (now()-s.accepted_at))/86400) FILTER(WHERE s.status='available'),1)::text AS "ageDays",
     (SELECT count(*)::int FROM sale_lines sl JOIN sales sale ON sale.tenant_id=sl.tenant_id AND sale.id=sl.sale_id
       WHERE sl.tenant_id=${w}::uuid AND sale.branch_id=${b}::uuid AND sale.status='completed'
         AND sl.product_id=p.id AND sl.unit_cost_minor IS NULL) AS "unknownCostLines",
     CASE WHEN EXISTS(
       SELECT 1 FROM sale_lines sl JOIN sales sale ON sale.tenant_id=sl.tenant_id AND sale.id=sl.sale_id
       WHERE sl.tenant_id=${w}::uuid AND sale.branch_id=${b}::uuid AND sale.status='completed'
         AND sl.product_id=p.id AND sl.unit_cost_minor IS NULL
     ) THEN NULL ELSE COALESCE((SELECT sum(sl.line_total_minor-COALESCE(sl.tax_minor,0)-sl.unit_cost_minor*sl.quantity)::bigint
       FROM sale_lines sl JOIN sales sale ON sale.tenant_id=sl.tenant_id AND sale.id=sl.sale_id
       WHERE sl.tenant_id=${w}::uuid AND sale.branch_id=${b}::uuid AND sale.status='completed'
         AND sl.product_id=p.id),0)::text END AS "grossMarginMinor"
   FROM products p JOIN inventory_serials s ON s.tenant_id=p.tenant_id AND s.product_id=p.id
   WHERE p.tenant_id=${w}::uuid AND s.branch_id=${b}::uuid
   GROUP BY p.id,p.catalog_model_id ORDER BY "soldCount" DESC LIMIT 500`;
 }
 @Get('reports/reconciliation')
 async reconciliation(@Param('workspaceId') w:string,@Param('branchId') b:string,@Req() req:FastifyRequest){
  await this.actor(req,w,b,'finance.read');
  const [receipts,payments]=await Promise.all([
   this.prisma.$queryRaw<Array<{batchId:string;expected:number;posted:string;difference:string}>>`
    SELECT r.id::text AS "batchId",r.quantity::int AS "expected",
       COALESCE(sum(m.quantity_delta),0)::text AS "posted",
       (r.quantity-COALESCE(sum(m.quantity_delta),0))::text AS "difference"
    FROM inventory_receipt_batches r LEFT JOIN stock_movements m ON m.tenant_id=r.tenant_id AND m.source_id=r.id::text AND m.product_id=r.product_id AND m.quantity_delta>0
    WHERE r.tenant_id=${w}::uuid AND r.branch_id=${b}::uuid
    GROUP BY r.id HAVING r.quantity<>COALESCE(sum(m.quantity_delta),0) ORDER BY r.id LIMIT 100`,
   this.prisma.$queryRaw<Array<{saleId:string;due:string;received:string;refunded:string}>>`
    SELECT sale.id::text AS "saleId",sale.total_minor::text AS "due",
      COALESCE(sum(sp.amount_minor) FILTER(WHERE sp.kind='receipt'),0)::text AS "received",
      COALESCE(sum(sp.amount_minor) FILTER(WHERE sp.kind='refund'),0)::text AS "refunded"
    FROM sales sale LEFT JOIN sale_payments sp ON sp.tenant_id=sale.tenant_id AND sp.sale_id=sale.id
    WHERE sale.tenant_id=${w}::uuid AND sale.branch_id=${b}::uuid AND sale.status='completed'
    GROUP BY sale.id HAVING COALESCE(sum(sp.amount_minor) FILTER(WHERE sp.kind='receipt'),0)-COALESCE(sum(sp.amount_minor) FILTER(WHERE sp.kind='refund'),0)>sale.total_minor
    ORDER BY sale.id LIMIT 100`,
  ]);
  return {unbalancedReceivingBatches:receipts,paymentOvercollections:payments,generatedAt:new Date().toISOString(),status:receipts.length||payments.length?'requires_review':'no_discrepancies_found',scope:'Posted receiving and overcollection controls only; not full GL certification.'};
 }
}
