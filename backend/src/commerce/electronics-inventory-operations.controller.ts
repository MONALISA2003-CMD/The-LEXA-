/** Electronics product search, atomic unit receiving, package revisions and verified fitment.
 * No product-master operation can create stock; only approved receipt/assembly routes do.
 */
import {safeAccessoryFitment} from '../catalog/accessory-fitment-policy';
import {BadRequestException,ConflictException,Controller,ForbiddenException,Get,Headers,NotFoundException,Param,Post,Body,Req,UseGuards,UnauthorizedException} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {createHash,randomUUID} from 'node:crypto';
import {PrismaService} from '../prisma/prisma.service';
import {CsrfGuard} from '../core/csrf.guard';
import {assertBranchAccess} from '../authorization/branch-scope';
import {hasPermission,type Permission} from '../authorization/role-policy';
import {postLedgerJournal} from '../general-ledger/ledger-posting';
import {validateAdditionalImeis,validatePhysicalIdentifiers,SerialIdentityError} from '../catalog/serial-identity';
import {productHasIdentifier} from '../catalog/identifier-policy';
import {packagesToBase,validatePackageSize,PackageQuantityError} from '../catalog/package-quantity';

type Obj=Record<string,unknown>;
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value:unknown):Obj{if(!value||typeof value!=='object'||Array.isArray(value))throw new BadRequestException('Provide a JSON object.');return value as Obj;}
function string(value:unknown,label:string,length=120):string{if(typeof value!=='string'||!value.trim()||value.trim().length>length||/[\u0000-\u001f\u007f]/.test(value))throw new BadRequestException(`${label} is missing or invalid.`);return value.trim();}
function id(value:unknown,label:string):string{const v=string(value,label,40);if(!ID.test(v))throw new BadRequestException(`${label} must be a UUID.`);return v;}
function integer(value:unknown,label:string,min=0,max=2_000_000_000):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)throw new BadRequestException(`${label} must be an integer between ${min} and ${max}.`);return value;}
function requestToken(req:FastifyRequest):string|null{for(const part of (req.headers.cookie??'').split(';')){const [name,...value]=part.trim().split('=');if(name==='lexa_session')try{return decodeURIComponent(value.join('='));}catch{return null;}}return null;}
function conflict(error:unknown):never{const code=error&&typeof error==='object'&&'code' in error?(error as {code?:string}).code:null;if(code==='P2002'||String(error).includes('duplicate key'))throw new ConflictException('An SKU, IMEI, serial, barcode or receipt key is already owned by this business.');throw error;}
function gs1CheckDigit(value:string){if(!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(value))return false;let sum=0;for(let i=value.length-2,p=0;i>=0;i--,p++){sum+=Number(value[i])*(p%2===0?3:1);}return (10-sum%10)%10===Number(value.at(-1));}
export type PreparedReceiptUnit={serialNumber:string;imei2:string|null;extraImeis:string[];condition:'new'|'open_box'|'used_good'|'used_fair'|'refurbished'|'damaged';notes:string|null};
export function prepareSerializedReceiptUnits(raw:unknown,phone:boolean):PreparedReceiptUnit[]{
 if(!Array.isArray(raw)||!raw.length||raw.length>100)throw new BadRequestException('Scan 1–100 real physical units per receipt.');
 const seen=new Set<string>();
 return raw.map((item:unknown)=>{
  const body=object(item);
  let identifiers:{serialNumber:string;imei2:string|null};
  try{identifiers=validatePhysicalIdentifiers(body.serialNumber,body.imei2,phone);}catch(e){if(e instanceof SerialIdentityError)throw new BadRequestException(e.message);throw e;}
  let extraImeis:string[];
  try{extraImeis=validateAdditionalImeis(body.extraImeis,phone,[identifiers.serialNumber,...(identifiers.imei2?[identifiers.imei2]:[])]);}
  catch(e){if(e instanceof SerialIdentityError)throw new BadRequestException(e.message);throw e;}
  for(const value of [identifiers.serialNumber,...(identifiers.imei2?[identifiers.imei2]:[]),...extraImeis]){
   const normalized=value.trim().toUpperCase();if(seen.has(normalized))throw new ConflictException('The receipt includes a duplicate physical identifier.');seen.add(normalized);
  }
  const condition=body.condition??'new';
  if(!['new','open_box','used_good','used_fair','refurbished','damaged'].includes(String(condition)))throw new BadRequestException('Invalid device condition.');
  const notes=body.notes===undefined||body.notes===null||body.notes===''?null:string(body.notes,'Inspection notes',1000);
  return {...identifiers,extraImeis,condition:condition as PreparedReceiptUnit['condition'],notes};
 });
}

@Controller('workspaces/:workspaceId')
export class ElectronicsInventoryOperationsController{
 constructor(private readonly prisma:PrismaService){}
 private async access(req:FastifyRequest,w:string,permission:Permission,branch?:string){
  const token=requestToken(req);if(!token)throw new UnauthorizedException('Sign in.');
  const session=await this.prisma.session.findFirst({where:{tokenHash:hash(token),expiresAt:{gt:new Date()}},select:{userId:true}});
  if(!session)throw new UnauthorizedException('Session expired.');
  this.prisma.enterTenantContext(w,session.userId);
  const member=await this.prisma.membership.findUnique({where:{tenantId_userId:{tenantId:w,userId:session.userId}}});
  if(!member||member.status!=='ACTIVE')throw new NotFoundException('Business not found.');
  if(!hasPermission(member.role,permission))throw new ForbiddenException(`Permission ${permission} is required.`);
  if(branch)await assertBranchAccess(this.prisma,w,branch,session.userId,member.role);
  return session.userId;
 }

 @Get('catalog/products/search')
 async searchProducts(@Param('workspaceId') w:string,@Req() req:FastifyRequest){
  await this.access(req,w,'catalog.read');const q=new URL(req.url,'https://lexa.invalid').searchParams.get('q')?.trim().slice(0,100)??'';
  if(q.length<2)return [];
  const aliases=await this.prisma.catalogProductAlias.findMany({where:{tenantId:w,normalizedValue:{contains:q.toUpperCase()}},select:{productId:true},take:80});
  const brands=await this.prisma.catalogBrand.findMany({where:{tenantId:w,name:{contains:q,mode:'insensitive'}},select:{id:true},take:25});
  const models=await this.prisma.catalogDeviceModel.findMany({where:{tenantId:w,OR:[{name:{contains:q,mode:'insensitive'}},{manufacturerCode:{contains:q,mode:'insensitive'}}]},select:{id:true},take:25});
  const variants=await this.prisma.productVariant.findMany({where:{tenantId:w,OR:[{sku:{contains:q,mode:'insensitive'}},{barcode:{contains:q,mode:'insensitive'}},{gtin:{contains:q,mode:'insensitive'}}]},select:{productId:true},take:80});
  return this.prisma.product.findMany({where:{tenantId:w,active:true,OR:[{name:{contains:q,mode:'insensitive'}},{sku:{contains:q,mode:'insensitive'}},{barcode:{contains:q,mode:'insensitive'}},{gtin:{contains:q,mode:'insensitive'}},{supplierSku:{contains:q,mode:'insensitive'}},{catalogBrandId:{in:brands.map(b=>b.id)}},{catalogModelId:{in:models.map(m=>m.id)}},{id:{in:[...new Set([...aliases.map(a=>a.productId),...variants.map(v=>v.productId)])]}}]},orderBy:{name:'asc'},take:100});
 }
 @Get('products/:productId/search-aliases')
 async listProductAliases(@Param('workspaceId') w:string,@Param('productId') productId:string,@Req() req:FastifyRequest){
  await this.access(req,w,'catalog.read');return this.prisma.catalogProductAlias.findMany({where:{tenantId:w,productId:id(productId,'Product')},orderBy:{aliasType:'asc'}});
 }
 @Post('products/:productId/search-aliases') @UseGuards(CsrfGuard)
 async createProductAlias(@Param('workspaceId') w:string,@Param('productId') productId:string,@Body() raw:unknown,@Req() req:FastifyRequest){
  const actor=await this.access(req,w,'catalog.write'),b=object(raw),productIdChecked=id(productId,'Product'),aliasType=string(b.aliasType,'Alias type',30),aliasValue=string(b.aliasValue,'Alias',120);
  if(!['supplier_sku','manufacturer_code','gtin','barcode','brand_reference','other'].includes(aliasType))throw new BadRequestException('Unsupported alias type.');
  if(aliasType==='gtin'&&!gs1CheckDigit(aliasValue))throw new BadRequestException('GTIN needs a valid GS1 length and check digit.');
  const normalizedValue=aliasValue.toUpperCase();
  try{return await this.prisma.$transaction(async tx=>{
   if(!await tx.product.findFirst({where:{tenantId:w,id:productIdChecked}}))throw new NotFoundException('Product not found.');
   const existing=await tx.product.findFirst({where:{tenantId:w,OR:[{sku:{equals:aliasValue,mode:'insensitive'}},{barcode:{equals:aliasValue,mode:'insensitive'}},{gtin:{equals:aliasValue,mode:'insensitive'}}]}});
   const variant=await tx.productVariant.findFirst({where:{tenantId:w,OR:[{sku:{equals:aliasValue,mode:'insensitive'}},{barcode:{equals:aliasValue,mode:'insensitive'}},{gtin:{equals:aliasValue,mode:'insensitive'}}]}});
   if(existing?.id!==undefined&&existing.id!==productIdChecked||variant?.productId!==undefined&&variant.productId!==productIdChecked)throw new ConflictException('This code already identifies a different product.');
   const row=await tx.catalogProductAlias.create({data:{tenantId:w,productId:productIdChecked,aliasType,aliasValue,normalizedValue,createdByUserId:actor}});
   await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'catalog.product_alias.created',resourceType:'catalog_product_alias',resourceId:row.id}});
   return row;
  });}catch(e){return conflict(e);}
 }

 @Post('branches/:branchId/inventory/receipts/serialized') @UseGuards(CsrfGuard)
 async receiveSerializedStock(@Param('workspaceId') w:string,@Param('branchId') branch:string,@Headers('idempotency-key') key:string|undefined,@Body() raw:unknown,@Req() req:FastifyRequest){
  const actor=await this.access(req,w,'inventory.approve',branch),b=object(raw);
  const productId=id(b.productId,'Product'),warehouseId=id(b.warehouseId,'Warehouse'),variantId=b.variantId?id(b.variantId,'Variant'):null;
  const reference=string(b.reference,'Approved opening reference',120);
  if(b.sourceKind!=='approved_opening')throw new BadRequestException('Use approved opening for this endpoint. Purchase goods are received through the posted PO/GRN workflow only.');
  if(typeof key!=='string'||key.length<8||key.length>160)throw new BadRequestException('Idempotency-Key must contain 8–160 characters.');
  const product=await this.prisma.product.findFirst({where:{tenantId:w,id:productId,active:true}});
  if(!product||!product.trackStock||!product.trackSerial||product.trackLot)throw new BadRequestException('Select an active serialized product without lot tracking. Lot-tracked goods use purchase receiving.');
  const units=prepareSerializedReceiptUnits(b.units,productHasIdentifier(product.productType,'imei'));
  const cost=integer(b.unitCostMinor??product.costPriceMinor,'Unit cost');
  const payloadHash=hash(JSON.stringify({productId,warehouseId,variantId,reference,units,cost}));
  try{return await this.prisma.$transaction(async tx=>{
   // Serialize against the product: two receipts cannot register stock concurrently without checking identifiers.
   const locked=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM products WHERE tenant_id=${w}::uuid AND id=${productId}::uuid FOR UPDATE`;
   if(!locked.length)throw new NotFoundException('Product not found.');
   const prior=await tx.inventoryReceiptBatch.findUnique({where:{tenantId_idempotencyKey:{tenantId:w,idempotencyKey:key}}});
   if(prior){if(prior.payloadHash!==payloadHash||prior.branchId!==branch)throw new ConflictException('Receipt idempotency key was reused with different units.');return {id:prior.id,accepted:prior.quantity,alreadyPosted:true};}
   if(!await tx.warehouse.findFirst({where:{tenantId:w,branchId:branch,id:warehouseId,active:true}}))throw new NotFoundException('Warehouse is not in the selected branch.');
   if(variantId&&!await tx.productVariant.findFirst({where:{tenantId:w,productId,id:variantId,active:true}}))throw new BadRequestException('Variant is not part of this product.');
   if(!variantId&&await tx.productVariant.count({where:{tenantId:w,productId,active:true}}))throw new BadRequestException('Choose the actual SKU variant before scanning devices.');
   const row=await tx.inventoryReceiptBatch.create({data:{tenantId:w,branchId:branch,productId,variantId,warehouseId,sourceKind:'approved_opening',reference,idempotencyKey:key,payloadHash,quantity:units.length,actorUserId:actor}});
   for(const unit of units){
    const serial=await tx.inventorySerial.create({data:{tenantId:w,branchId:branch,productId,variantId,warehouseId,receiptBatchId:row.id,unitCostMinor:cost,acceptedAt:new Date(),serialNumber:unit.serialNumber,identifiers:{...(unit.imei2?{imei2:unit.imei2}:{}),...(unit.extraImeis.length?{extraImeis:unit.extraImeis}:{})},status:unit.condition==='damaged'?'quarantine':'available'}});
    await tx.stockMovement.create({data:{tenantId:w,branchId:branch,productId,variantId,warehouseId,serialId:serial.id,quantityDelta:'1',type:'opening',unitCostMinor:cost,reason:`Approved serialized opening ${reference}`,sourceId:row.id}});
    await tx.inventoryUnitInspection.create({data:{tenantId:w,branchId:branch,serialId:serial.id,condition:unit.condition,notes:unit.notes,inspectedByUserId:actor}});
   }
   const value=units.length*cost;if(!Number.isSafeInteger(value)||value>2_000_000_000)throw new BadRequestException('Total inventory value exceeds the configured limit.');
   if(value>0)await postLedgerJournal(tx,{tenantId:w,branchId:branch,actorUserId:actor,sourceType:'inventory_serialized_opening',sourceId:row.id,memo:`Approved stock opening ${reference}`,lines:[{accountKey:'inventory',debitMinor:value,description:'Physical units received'},{accountKey:'owner_equity',creditMinor:value,description:'Approved opening stock value'}]});
   await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'inventory.serialized_receipt.posted',resourceType:'inventory_receipt_batch',resourceId:row.id,metadata:{branch,productId,quantity:units.length}}});
   return {id:row.id,accepted:units.length,alreadyPosted:false};
  },{isolationLevel:'Serializable'});}catch(e){return conflict(e);}
 }
 @Get('branches/:branchId/inventory/identifiers/lookup')
 async lookupUnitIdentity(@Param('workspaceId') w:string,@Param('branchId') branch:string,@Req() req:FastifyRequest){
  await this.access(req,w,'inventory.read',branch);const q=string(new URL(req.url,'https://lexa.invalid').searchParams.get('identifier'),'IMEI or serial',120).toUpperCase();
  const claims=await this.prisma.inventoryUnitIdentifier.findMany({where:{tenantId:w,normalizedValue:q},take:3});
  if(claims.length!==1||claims[0]?.legacyCollision)throw new ConflictException('Identifier is missing or historically ambiguous; reconcile before allocation.');
  const unit=await this.prisma.inventorySerial.findFirst({where:{tenantId:w,branchId:branch,id:claims[0].serialId}});
  if(!unit)throw new NotFoundException('No matching physical unit in your permitted branch.');
  return {id:unit.id,productId:unit.productId,variantId:unit.variantId,status:unit.status,identifierType:claims[0].identifierType};
 }
 @Get('branches/:branchId/inventory/units/reconciliation')
 async reconcileUnits(@Param('workspaceId') w:string,@Param('branchId') branch:string,@Req() req:FastifyRequest){
  await this.access(req,w,'inventory.read',branch);
  const products=await this.prisma.product.findMany({where:{tenantId:w,trackSerial:true,active:true},select:{id:true,name:true},take:2000});
  const rows=await Promise.all(products.map(async p=>{
   const [stock,physical]=await Promise.all([
    this.prisma.stockMovement.aggregate({where:{tenantId:w,branchId:branch,productId:p.id},_sum:{quantityDelta:true}}),
    this.prisma.inventorySerial.count({where:{tenantId:w,branchId:branch,productId:p.id,status:{in:['available','quarantine','reserved','in_transit']}}}),
   ]);
   const ledger=Number(stock._sum.quantityDelta??0);return {productId:p.id,name:p.name,ledgerUnits:ledger,registeredUnits:physical,delta:ledger-physical,balanced:ledger===physical};
  }));
  return {items:rows.filter(x=>x.ledgerUnits!==0||x.registeredUnits!==0),hasMismatch:rows.some(x=>!x.balanced)};
 }

 @Get('products/:productId/packages/:packageId/conversions')
 async packageHistory(@Param('workspaceId') w:string,@Param('productId') productId:string,@Param('packageId') packageId:string,@Req() req:FastifyRequest){
  await this.access(req,w,'catalog.read');const p=id(productId,'Product'),pkg=id(packageId,'Package');
  if(!await this.prisma.productPackage.findFirst({where:{tenantId:w,productId:p,id:pkg}}))throw new NotFoundException('Package not found.');
  return this.prisma.packageConversionRevision.findMany({where:{tenantId:w,packageId:pkg},orderBy:{version:'desc'}});
 }
 @Post('products/:productId/packages/:packageId/conversions') @UseGuards(CsrfGuard)
 async revisePackage(@Param('workspaceId') w:string,@Param('productId') productId:string,@Param('packageId') packageId:string,@Body() raw:unknown,@Req() req:FastifyRequest){
  const actor=await this.access(req,w,'catalog.write'),p=id(productId,'Product'),pkg=id(packageId,'Package'),b=object(raw);
  let unitsPerPackage:number;try{unitsPerPackage=validatePackageSize(b.unitsPerPackage);}catch(e){if(e instanceof PackageQuantityError)throw new BadRequestException(e.message);throw e;}
  const effectiveAt=new Date(string(b.effectiveAt,'Effective date',40));if(!Number.isFinite(effectiveAt.valueOf())||effectiveAt<new Date())throw new BadRequestException('New package conversions must have a future effective date.');
  try{return await this.prisma.$transaction(async tx=>{
   const locked=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM product_packages WHERE tenant_id=${w}::uuid AND product_id=${p}::uuid AND id=${pkg}::uuid FOR UPDATE`;
   if(!locked.length)throw new NotFoundException('Package not found.');
   const prior=await tx.packageConversionRevision.findFirst({where:{tenantId:w,packageId:pkg},orderBy:{version:'desc'}});
   if(prior&&effectiveAt<=prior.effectiveAt)throw new ConflictException('Conversion effective dates must be strictly increasing.');
   const row=await tx.packageConversionRevision.create({data:{tenantId:w,packageId:pkg,version:(prior?.version??0)+1,unitsPerPackage:String(unitsPerPackage),effectiveAt,actorUserId:actor}});
   await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'catalog.package_conversion.revised',resourceType:'package_conversion_revision',resourceId:row.id}});
   return row;
  },{isolationLevel:'Serializable'});}catch(e){return conflict(e);}
 }
 @Post('catalog/compatibilities/:compatibilityId/review') @UseGuards(CsrfGuard)
 async reviewFitment(@Param('workspaceId') w:string,@Param('compatibilityId') compatibilityId:string,@Body() raw:unknown,@Req() req:FastifyRequest){
  const actor=await this.access(req,w,'inventory.approve'),key=id(compatibilityId,'Compatibility'),b=object(raw),outcome=string(b.outcome,'Decision',20);
  if(!['verified','rejected','revoked'].includes(outcome))throw new BadRequestException('Decision must be verified, rejected or revoked.');
  const kind=string(b.compatibilityKind??'physical','Compatibility type',20);
  if(!['physical','electrical','protocol','consumable'].includes(kind))throw new BadRequestException('Unknown compatibility type.');
  const source=string(b.evidenceReference,'Supplier/manufacturer evidence',400);
  // A checked checkbox is not sufficient evidence for mains, DC or battery accessories.
  // Store the measured/verified electrical limits alongside the supplier reference.
  let electricalSpecifications: {voltageRange:string;currentAmps:number;connectorType:string}|null=null;
  if(kind==='electrical'&&outcome==='verified'){
   if(b.confirmedElectricalSafety!==true)throw new BadRequestException('Electrical fitment requires a documented safety review.');
   const voltageRange=string(b.voltageRange,'Supported voltage range',100);
   const currentAmps=Number(b.currentAmps);
   const connectorType=string(b.connectorType,'Connector type',100);
   if(!Number.isFinite(currentAmps)||currentAmps<=0||currentAmps>500)throw new BadRequestException('Supply current must be a positive, documented number of amps.');
   electricalSpecifications={voltageRange,currentAmps,connectorType};
  }
  return this.prisma.$transaction(async tx=>{
   const row=await tx.accessoryCompatibility.findFirst({where:{tenantId:w,id:key}});if(!row)throw new NotFoundException('Compatibility not found.');
   if(row.reviewState==='revoked'&&outcome!=='revoked')throw new ConflictException('Revoked fitment cannot be re-enabled; propose a new reviewed relationship.');
   const saved=await tx.accessoryCompatibility.update({where:{id:key},data:{compatibilityKind:kind,evidence:{reference:source,checkedElectricalSafety:b.confirmedElectricalSafety===true,...(electricalSpecifications??{})},reviewState:outcome,revokedAt:outcome==='revoked'?new Date():null,verifiedAt:outcome==='verified'?new Date():null,verifiedByUserId:outcome==='verified'?actor:null}});
   await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:`catalog.fitment.${outcome}`,resourceType:'accessory_compatibility',resourceId:key}});return saved;
  });
 }
 @Get('branches/:branchId/catalog/device-models/:modelId/available-accessories')
 async approvedAvailableAccessories(@Param('workspaceId') w:string,@Param('branchId') branch:string,@Param('modelId') modelId:string,@Req() req:FastifyRequest){
  await this.access(req,w,'inventory.read',branch);const model=id(modelId,'Device model');
  if(!await this.prisma.catalogDeviceModel.findFirst({where:{tenantId:w,id:model}}))throw new NotFoundException('Device model not found.');
  const proposedFits=await this.prisma.accessoryCompatibility.findMany({where:{tenantId:w,deviceModelId:model,reviewState:'verified',verifiedAt:{not:null},revokedAt:null},take:100});
  if(!proposedFits.length)return [];
  const products=await this.prisma.product.findMany({where:{tenantId:w,active:true,id:{in:proposedFits.map(f=>f.accessoryProductId)}}});
  const productById=new Map(products.map(p=>[p.id,p]));
  const fits=proposedFits.filter(f=>safeAccessoryFitment(productById.get(f.accessoryProductId)?.productType,f));
  if(!fits.length)return [];
  const output=[];
  for(const product of products.filter(p=>fits.some(f=>f.accessoryProductId===p.id))){
   const [movements,reserved,quarantine]=await Promise.all([
    this.prisma.stockMovement.aggregate({where:{tenantId:w,branchId:branch,productId:product.id},_sum:{quantityDelta:true}}),
    this.prisma.stockReservation.aggregate({where:{tenantId:w,branchId:branch,productId:product.id,status:'active'},_sum:{quantity:true}}),
    this.prisma.inventoryLot.aggregate({where:{tenantId:w,branchId:branch,productId:product.id},_sum:{quantityQuarantined:true}}),
   ]);
   const activeVariants=await this.prisma.productVariant.count({where:{tenantId:w,productId:product.id,active:true}});
   // Do not recommend a product if its aggregate balance conceals empty or
   // mismatched sellable variants. Checkout resolves the exact variant.
   const available=activeVariants>0?0:Math.max(0,Number(movements._sum.quantityDelta??0)-Number(reserved._sum.quantity??0)-Number(quarantine._sum.quantityQuarantined??0));
   if(available>0)output.push({product,variantId:null,available,fitment:fits.filter(f=>f.accessoryProductId===product.id).map(f=>({id:f.id,kind:f.compatibilityKind,evidence:f.evidence}))});
   if(activeVariants>0){
    const options=await this.prisma.productVariant.findMany({where:{tenantId:w,productId:product.id,active:true},take:80});
    for(const option of options){
     const [stock,reservations,held]=await Promise.all([
      this.prisma.stockMovement.aggregate({where:{tenantId:w,branchId:branch,productId:product.id,variantId:option.id},_sum:{quantityDelta:true}}),
      this.prisma.stockReservation.aggregate({where:{tenantId:w,branchId:branch,productId:product.id,variantId:option.id,status:'active'},_sum:{quantity:true}}),
      this.prisma.inventoryLot.aggregate({where:{tenantId:w,branchId:branch,productId:product.id,variantId:option.id},_sum:{quantityQuarantined:true}}),
     ]);
     const sellable=Math.max(0,Number(stock._sum.quantityDelta??0)-Number(reservations._sum.quantity??0)-Number(held._sum.quantityQuarantined??0));
     if(sellable>0)output.push({product,variantId:option.id,available:sellable,fitment:fits.filter(f=>f.accessoryProductId===product.id).map(f=>({id:f.id,kind:f.compatibilityKind,evidence:f.evidence}))});
    }
   }
  }
  return output;
 }

 @Get('products/:productId/bundle')
 async productBundle(@Param('workspaceId') w:string,@Param('productId') productId:string,@Req() req:FastifyRequest){
  await this.access(req,w,'catalog.read');return this.prisma.productBundle.findFirst({where:{tenantId:w,productId:id(productId,'Product')}});
 }
 @Post('products/:productId/bundle') @UseGuards(CsrfGuard)
 async createBundle(@Param('workspaceId') w:string,@Param('productId') productId:string,@Body() raw:unknown,@Req() req:FastifyRequest){
  const actor=await this.access(req,w,'catalog.write'),parent=id(productId,'Product'),b=object(raw),mode=string(b.mode,'Bundle mode',30);
  if(!['sealed_kit','assembled_kit'].includes(mode))throw new BadRequestException('Choose sealed_kit or assembled_kit.');
  const items:unknown=b.components;if(!Array.isArray(items)||items.length<1||items.length>50)throw new BadRequestException('A kit must have 1–50 components.');
  const rows=items.map((entry:unknown)=>{const x=object(entry);const quantity=Number(x.quantity);if(!Number.isFinite(quantity)||quantity<=0||quantity>10000||Math.round(quantity*1000)!==quantity*1000)throw new BadRequestException('Invalid component quantity.');return {productId:id(x.productId,'Component product'),variantId:x.variantId?id(x.variantId,'Component variant'):null,quantity};});
  if(rows.some(r=>r.productId===parent))throw new ConflictException('Kits cannot contain themselves.');
  const seen=new Set<string>();for(const item of rows){const k=`${item.productId}:${item.variantId??''}`;if(seen.has(k))throw new ConflictException('Duplicate kit component.');seen.add(k);}
  try{return await this.prisma.$transaction(async tx=>{
   const product=await tx.product.findFirst({where:{tenantId:w,id:parent,active:true,trackStock:true}});
   if(!product||product.trackSerial||product.trackLot)throw new BadRequestException('Kit parent must be quantity tracked, not individually serialized or lot-tracked.');
   if(await tx.productVariant.count({where:{tenantId:w,productId:parent,active:true}}))throw new BadRequestException('Kit parent SKU must be unvarianted for atomic kit assembly.');
   if(await tx.productBundle.findFirst({where:{tenantId:w,productId:parent}}))throw new ConflictException('This product already has a kit definition.');
   if(await tx.productBundleComponent.findFirst({where:{tenantId:w,productId:parent}}))throw new ConflictException('An existing kit component cannot also become a kit.');
   for(const item of rows){
    const component=await tx.product.findFirst({where:{tenantId:w,id:item.productId,active:true}});
    if(!component?.trackStock||component.trackSerial||component.trackLot)throw new BadRequestException('Kit components must be quantity-tracked; individually serialized/lot items need manual verified allocation.');
    // Nested kits are not allowed, which makes cycles impossible by construction.
    if(await tx.productBundle.findFirst({where:{tenantId:w,productId:item.productId}}))throw new ConflictException('Nested kits are not supported.');
    if(item.variantId&&!await tx.productVariant.findFirst({where:{tenantId:w,productId:item.productId,id:item.variantId,active:true}}))throw new BadRequestException('Component variant is not owned by its product.');
    if(!item.variantId&&await tx.productVariant.count({where:{tenantId:w,productId:item.productId,active:true}}))throw new BadRequestException('Choose the exact component variant.');
   }
   const bundle=await tx.productBundle.create({data:{tenantId:w,productId:parent,mode,status:'draft',createdByUserId:actor}});
   for(const item of rows)await tx.productBundleComponent.create({data:{tenantId:w,bundleId:bundle.id,productId:item.productId,variantId:item.variantId,quantity:String(item.quantity)}});
   await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'catalog.bundle.defined',resourceType:'product_bundle',resourceId:bundle.id}});
   return bundle;
  },{isolationLevel:'Serializable'});}catch(e){return conflict(e);}
 }
 @Post('products/:productId/bundle/activate') @UseGuards(CsrfGuard)
 async activateBundle(@Param('workspaceId') w:string,@Param('productId') productId:string,@Req() req:FastifyRequest){
  const actor=await this.access(req,w,'inventory.approve'),product=id(productId,'Product');
  return this.prisma.$transaction(async tx=>{
   const row=await tx.productBundle.findFirst({where:{tenantId:w,productId:product}});if(!row)throw new NotFoundException('Bundle not found.');
   if(!await tx.productBundleComponent.count({where:{tenantId:w,bundleId:row.id}}))throw new BadRequestException('Kit requires components.');
   const saved=await tx.productBundle.update({where:{id:row.id},data:{status:'active'}});
   await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'catalog.bundle.activated',resourceType:'product_bundle',resourceId:row.id}});return saved;
  });
 }
 @Post('branches/:branchId/products/:productId/bundle/assemble') @UseGuards(CsrfGuard)
 async assembleBundle(@Param('workspaceId') w:string,@Param('branchId') branch:string,@Param('productId') productId:string,@Headers('idempotency-key') key:string|undefined,@Body() raw:unknown,@Req() req:FastifyRequest){
  const actor=await this.access(req,w,'inventory.approve',branch),parent=id(productId,'Bundle product'),b=object(raw),warehouseId=id(b.warehouseId,'Warehouse'),count=integer(b.quantity,'Kit quantity',1,100);
  if(!key||key.length<8||key.length>160)throw new BadRequestException('Idempotency-Key is required.');
  const payloadHash=hash(JSON.stringify({parent,warehouseId,count}));
  try{return await this.prisma.$transaction(async tx=>{
   // One warehouse+tenant inventory allocation is serialized against every component and parent row.
   const prior=await tx.inventoryReceiptBatch.findUnique({where:{tenantId_idempotencyKey:{tenantId:w,idempotencyKey:key}}});
   if(prior){if(prior.payloadHash!==payloadHash||prior.branchId!==branch)throw new ConflictException('Idempotency key reused for a different assembly.');return {batchId:prior.id,quantity:prior.quantity,alreadyPosted:true};}
   if(!await tx.warehouse.findFirst({where:{tenantId:w,branchId:branch,id:warehouseId,active:true}}))throw new NotFoundException('Warehouse not found.');
   const bundle=await tx.productBundle.findFirst({where:{tenantId:w,productId:parent,status:'active'}});if(!bundle||bundle.mode!=='assembled_kit')throw new BadRequestException('This product is not an approved assembled kit.');
   const components=await tx.productBundleComponent.findMany({where:{tenantId:w,bundleId:bundle.id}});
   if(!components.length)throw new BadRequestException('Kit has no components.');
   const lockIds=[...new Set([parent,...components.map(c=>c.productId)])].sort();
   for(const target of lockIds){const locked=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM products WHERE tenant_id=${w}::uuid AND id=${target}::uuid FOR UPDATE`;
    if(!locked.length)throw new NotFoundException('Kit product was removed.');}
   let totalCost=0;const componentCosts=new Map<string,number>();
   for(const component of components){
    const available=await tx.stockMovement.aggregate({where:{tenantId:w,branchId:branch,warehouseId,productId:component.productId,variantId:component.variantId},_sum:{quantityDelta:true}});
    const reserved=await tx.stockReservation.aggregate({where:{tenantId:w,branchId:branch,OR:[{warehouseId},{warehouseId:null}],productId:component.productId,variantId:component.variantId,status:'active'},_sum:{quantity:true}});
    if(Number(available._sum.quantityDelta??0)-Number(reserved._sum.quantity??0)<Number(component.quantity)*count)throw new ConflictException('Insufficient unreserved component stock to assemble all kits.');
    const item=await tx.product.findFirst({where:{tenantId:w,id:component.productId}});if(!item)throw new NotFoundException('Component missing.');
    const unitPrice=component.variantId?(await tx.productVariant.findFirst({where:{tenantId:w,id:component.variantId,productId:component.productId}}))?.costPriceMinor??item.costPriceMinor:item.costPriceMinor;
    componentCosts.set(component.id,unitPrice);
    totalCost+=Math.round(Number(component.quantity)*count*unitPrice);
   }
   if(!Number.isSafeInteger(totalCost)||totalCost>2_000_000_000)throw new BadRequestException('Kit inventory cost exceeds configured accounting limits.');
   const batch=await tx.inventoryReceiptBatch.create({data:{tenantId:w,branchId:branch,productId:parent,warehouseId,variantId:null,sourceKind:'bundle_assembly',reference:bundle.id,idempotencyKey:key,payloadHash,quantity:count,actorUserId:actor}});
   for(const component of components)await tx.stockMovement.create({data:{tenantId:w,branchId:branch,warehouseId,productId:component.productId,variantId:component.variantId,type:'production_issue',quantityDelta:String(-Number(component.quantity)*count),unitCostMinor:componentCosts.get(component.id)??0,reason:`Kit assembly ${batch.id}`,sourceId:batch.id}});
   await tx.stockMovement.create({data:{tenantId:w,branchId:branch,warehouseId,productId:parent,type:'production_receipt',quantityDelta:String(count),unitCostMinor:Math.round(totalCost/count),reason:`Assembled kit ${batch.id}`,sourceId:batch.id}});
   await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'inventory.bundle.assembled',resourceType:'inventory_receipt_batch',resourceId:batch.id,metadata:{bundleId:bundle.id,count}}});
   return {batchId:batch.id,quantity:count,alreadyPosted:false};
  },{isolationLevel:'Serializable'});}catch(e){return conflict(e);}
 }
}

/** Exact package arithmetic is shared by purchase receipts and any future POS pack routes. */
export function previewPackageConversion(packages:unknown,unitsPerPackage:unknown):number{
 try{return packagesToBase(packages,unitsPerPackage);}catch(e){if(e instanceof PackageQuantityError)throw new BadRequestException(e.message);throw e;}
}
