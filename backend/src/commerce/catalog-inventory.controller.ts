import {resolveCategoryFields} from '../catalog/category-hierarchy';
import {validatePackageSize,PackageQuantityError} from '../catalog/package-quantity';
import {cleanProductAttributes,validateVariantDimensions} from '../catalog/product-attribute-validation';
import {productHasIdentifier} from '../catalog/identifier-policy';
import {validatePhysicalIdentifiers,SerialIdentityError} from '../catalog/serial-identity';
import { BadRequestException, ConflictException, Controller, ForbiddenException, Get, Headers, NotFoundException, Param, Post, Body, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CsrfGuard } from '../core/csrf.guard';
import {hasPermission} from '../authorization/role-policy';
import {postLedgerJournal} from '../general-ledger/ledger-posting';
import { assertBranchAccess } from '../authorization/branch-scope';

type Input = Record<string, unknown>;
const sha = (s:string) => createHash('sha256').update(s).digest('hex');
function obj(v:unknown):Input { if(!v||typeof v!=='object'||Array.isArray(v)) throw new BadRequestException('Request body must be an object.'); return v as Input; }
function txt(v:unknown,label:string,max=160):string { if(typeof v!=='string'||!v.trim()||v.trim().length>max) throw new BadRequestException(`${label} is required and must be at most ${max} characters.`); return v.trim(); }
function num(v:unknown,label:string,min=0,max=2_000_000_000):number { const n=typeof v==='number'?v:Number(v); if(!Number.isSafeInteger(n)||n<min||n>max) throw new BadRequestException(`${label} must be a valid integer.`); return n; }
function qty(v:unknown):number { const n=typeof v==='number'?v:Number(v); if(!Number.isFinite(n)||n<=0||n>1_000_000||Math.round(n*1000)!==n*1000) throw new BadRequestException('Quantity must be positive with at most three decimal places.'); return n; }
function cookie(request:FastifyRequest) { for(const part of (request.headers.cookie??'').split(';')) { const at=part.indexOf('='); if(at>=0&&part.slice(0,at).trim()==='lexa_session') { try{return decodeURIComponent(part.slice(at+1).trim())}catch{return undefined} } } return undefined; }
function validatedUnitIds(primary:unknown,secondary:unknown,productType:string|null|undefined){
 try{return validatePhysicalIdentifiers(primary,secondary,productHasIdentifier(productType,'imei'))}
 catch(error){if(error instanceof SerialIdentityError)throw new BadRequestException(error.message);throw error;}
}
function rethrowSerialIdentityConflict(error:unknown):never {
 const code=error&&typeof error==='object'&&'code' in error?(error as {code?:unknown}).code:undefined;
 if(code==='P2002'||String(error).includes('LEXA_SERIAL_IDENTITY_CONFLICT'))
   throw new ConflictException('This serial number or IMEI is already registered to a unit in your business.');
 throw error;
}
function uuid(v:unknown,label:string):string { const s=txt(v,label,40); if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) throw new BadRequestException(`${label} is invalid.`); return s; }

@Controller('workspaces/:workspaceId')
export class CatalogInventoryController {
 constructor(private readonly prisma:PrismaService) {}
 private async actor(request:FastifyRequest,workspaceId:string,branchId?:string) {
  const raw=cookie(request); if(!raw) throw new UnauthorizedException({code:'AUTH_REQUIRED',message:'Sign in to continue.'});
  const session=await this.prisma.session.findFirst({where:{tokenHash:sha(raw),expiresAt:{gt:new Date()}},select:{userId:true}}); if(!session) throw new UnauthorizedException({code:'SESSION_EXPIRED',message:'Sign in again.'});
  this.prisma.enterTenantContext(workspaceId,session.userId);
  const membership=await this.prisma.membership.findUnique({where:{tenantId_userId:{tenantId:workspaceId,userId:session.userId}}});
  if(!membership||membership.status!=='ACTIVE') throw new NotFoundException('Workspace not found.');
  if(branchId) await assertBranchAccess(this.prisma,workspaceId,branchId,session.userId,membership.role);
  return session.userId;
 }

 @Get('products/:productId/packages') async productPackages(@Param('workspaceId') w:string,@Param('productId') productId:string,@Req() req:FastifyRequest) {
  await this.actor(req,w);const id=uuid(productId,'Product');
  if(!await this.prisma.product.findFirst({where:{tenantId:w,id}}))throw new NotFoundException('Product not found.');
  return this.prisma.productPackage.findMany({where:{tenantId:w,productId:id,active:true},orderBy:{code:'asc'}});
 }
 @Post('products/:productId/packages') @UseGuards(CsrfGuard) async createProductPackage(@Param('workspaceId') w:string,@Param('productId') productId:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
  const actor=await this.actor(req,w),b=obj(raw),id=uuid(productId,'Product'),variantId=b.variantId?uuid(b.variantId,'Variant'):null;
  let unitsPerPackage:number;
  try{unitsPerPackage=validatePackageSize(b.unitsPerPackage);}catch(error){if(error instanceof PackageQuantityError)throw new BadRequestException(error.message);throw error;}
  if(unitsPerPackage>1000000)throw new BadRequestException('Package size exceeds the supported stock limit.');
  return this.prisma.$transaction(async tx=>{
   const product=await tx.product.findFirst({where:{id,tenantId:w,active:true}});
   if(!product||!product.trackStock)throw new BadRequestException('Packaging requires an active, stock-tracked product.');
   if(variantId&&!await tx.productVariant.findFirst({where:{id:variantId,tenantId:w,productId:id,active:true}}))throw new BadRequestException('Package variant does not belong to this product.');
   if(product.trackSerial&&!Number.isSafeInteger(unitsPerPackage))throw new BadRequestException('A package of serialized units must contain a whole number of items.');
   const row=await tx.productPackage.create({data:{tenantId:w,productId:id,variantId,code:txt(b.code,'Package code',40).toUpperCase(),name:txt(b.name,'Package name',80),unitsPerPackage:String(unitsPerPackage),baseUnit:product.unitOfMeasure??'Each'}});
   await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'catalog.product_package.created',resourceType:'product_package',resourceId:row.id}});return row;
  });
 }
 @Get('catalog/packages') async allProductPackages(@Param('workspaceId') w:string,@Req() req:FastifyRequest) { await this.actor(req,w);return this.prisma.productPackage.findMany({where:{tenantId:w,active:true},orderBy:{code:'asc'},take:3000}); }

 @Get('catalog/units') async units(@Param('workspaceId') w:string,@Req() req:FastifyRequest) { await this.actor(req,w); return this.prisma.unitOfMeasure.findMany({where:{tenantId:w,active:true},orderBy:{code:'asc'}}); }
 @Post('catalog/units') @UseGuards(CsrfGuard) async createUnit(@Param('workspaceId') w:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
  const actor=await this.actor(req,w), b=obj(raw); const precision=num(b.precision??3,'Precision',0,6);
  const created=await this.prisma.$transaction(async tx=>{ const row=await tx.unitOfMeasure.create({data:{tenantId:w,code:txt(b.code,'Code',20).toUpperCase(),name:txt(b.name,'Name',80),dimension:txt(b.dimension??'quantity','Dimension',30),precision}}); await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'catalog.unit.created',resourceType:'unit_of_measure',resourceId:row.id}}); return row; }); return created;
 }

 @Get('catalog/tax-codes') async taxCodes(@Param('workspaceId') w:string,@Req() req:FastifyRequest) { await this.actor(req,w); return this.prisma.taxCode.findMany({where:{tenantId:w,active:true},orderBy:{code:'asc'}}); }
 @Post('catalog/tax-codes') @UseGuards(CsrfGuard) async createTaxCode(@Param('workspaceId') w:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
  const actor=await this.actor(req,w),b=obj(raw), effectiveFrom=txt(b.effectiveFrom??new Date().toISOString().slice(0,10),'Effective from',10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throw new BadRequestException('Effective from must use YYYY-MM-DD.');
  return this.prisma.$transaction(async tx=>{const row=await tx.taxCode.create({data:{tenantId:w,code:txt(b.code,'Code',30).toUpperCase(),name:txt(b.name,'Name',100),rateBasisPoints:num(b.rateBasisPoints,'Rate basis points',0,100000),calculation:['exclusive','inclusive','exempt'].includes(String(b.calculation))?String(b.calculation):'exclusive',effectiveFrom:new Date(`${effectiveFrom}T00:00:00Z`),effectiveTo:b.effectiveTo?new Date(`${txt(b.effectiveTo,'Effective to',10)}T00:00:00Z`):null}}); await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'finance.tax_code.created',resourceType:'tax_code',resourceId:row.id}}); return row;});
 }
 @Post('catalog/tax-rules') @UseGuards(CsrfGuard) async createTaxRule(@Param('workspaceId') w:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
  const actor=await this.actor(req,w),b=obj(raw),taxCodeId=uuid(b.taxCodeId,'Tax code');
  const code=txt(b.code,'Code',40), appliesTo=String(b.appliesTo??'all'); if(!['all','product','category','customer_type'].includes(appliesTo)) throw new BadRequestException('Invalid tax rule scope.');
  const taxCode=await this.prisma.taxCode.findFirst({where:{id:taxCodeId,tenantId:w,active:true}}); if(!taxCode) throw new NotFoundException('Tax code not found.'); if(b.productId&&!await this.prisma.product.findFirst({where:{id:uuid(b.productId,'Product'),tenantId:w}})) throw new NotFoundException('Tax rule product not found.'); if(b.categoryId&&!await this.prisma.category.findFirst({where:{id:uuid(b.categoryId,'Category'),tenantId:w}})) throw new NotFoundException('Tax rule category not found.');
  const row=await this.prisma.$queryRaw<any[]>`INSERT INTO tax_rules(id,tenant_id,code,tax_code_id,applies_to,product_id,category_id,customer_type,priority,effective_from,effective_to,active)
    VALUES(${randomUUID()}::uuid,${w}::uuid,${code},${taxCodeId}::uuid,${appliesTo},${b.productId?uuid(b.productId,'Product'):null}::uuid,${b.categoryId?uuid(b.categoryId,'Category'):null}::uuid,${b.customerType?txt(b.customerType,'Customer type',50):null},${num(b.priority??100,'Priority',0,10000)},${txt(b.effectiveFrom??new Date().toISOString().slice(0,10),'Effective from',10)}::date,${b.effectiveTo?txt(b.effectiveTo,'Effective to',10):null}::date,true) RETURNING *`;
  await this.prisma.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'finance.tax_rule.created',resourceType:'tax_rule',resourceId:row[0]!.id}}); return row[0];
 }
 @Get('catalog/price-lists/active') async activePriceLists(@Param('workspaceId') w:string,@Req() req:FastifyRequest) {
  await this.actor(req,w);
  const tenant=await this.prisma.tenant.findUnique({where:{id:w},select:{currency:true}});
  const now=new Date();
  const lists=await this.prisma.priceList.findMany({where:{tenantId:w,currency:tenant?.currency??'UGX',active:true,
    OR:[{startsAt:null},{startsAt:{lte:now}}],AND:[{OR:[{endsAt:null},{endsAt:{gte:now}}]}]},orderBy:{name:'asc'},take:100});
  const items=lists.length?await this.prisma.priceListItem.findMany({where:{tenantId:w,priceListId:{in:lists.map(list=>list.id)}}}):[];
  return lists.map(list=>({...list,items:items.filter(item=>item.priceListId===list.id).map(item=>({
    productId:item.productId,variantId:item.variantId,unitPriceMinor:item.unitPriceMinor,taxCodeId:item.taxCodeId
  }))}));
 }
 @Get('catalog/price-lists') async priceLists(@Param('workspaceId') w:string,@Req() req:FastifyRequest) {
  await this.actor(req,w);
  const lists=await this.prisma.priceList.findMany({where:{tenantId:w},orderBy:{name:'asc'},take:200});
  const items=lists.length?await this.prisma.priceListItem.findMany({where:{tenantId:w,priceListId:{in:lists.map(list=>list.id)}}}):[];
  return lists.map(list=>({...list,items:items.filter(item=>item.priceListId===list.id).map(item=>({
   productId:item.productId,variantId:item.variantId,unitPriceMinor:item.unitPriceMinor,taxCodeId:item.taxCodeId
  }))}));
 }
 @Post('catalog/price-lists') @UseGuards(CsrfGuard) async createPriceList(@Param('workspaceId') w:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
  const actor=await this.actor(req,w),b=obj(raw); return this.prisma.$transaction(async tx=>{
    const tenant=await tx.tenant.findUnique({where:{id:w},select:{currency:true}});
    const currency=txt(b.currency??tenant?.currency??'UGX','Currency',3).toUpperCase();
    if(currency!==tenant?.currency)throw new BadRequestException('Use your business currency for checkout prices.');
    const starts=b.startsAt?new Date(String(b.startsAt)):null,ends=b.endsAt?new Date(String(b.endsAt)):null;
    if((starts&&!Number.isFinite(starts.getTime()))||(ends&&!Number.isFinite(ends.getTime()))||(starts&&ends&&starts>ends))throw new BadRequestException('Choose valid price-list dates.');
    const row=await tx.priceList.create({data:{tenantId:w,code:txt(b.code,'Code',40).toUpperCase(),name:txt(b.name,'Name',120),currency,startsAt:starts,endsAt:ends,active:false}}); await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'catalog.price_list.created',resourceType:'price_list',resourceId:row.id}}); return row;});
 }
 @Post('catalog/price-lists/:priceListId/items') @UseGuards(CsrfGuard) async setPriceListItem(@Param('workspaceId') w:string,@Param('priceListId') id:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
  const actor=await this.actor(req,w),b=obj(raw),productId=uuid(b.productId,'Product'),variantId=b.variantId?uuid(b.variantId,'Variant'):null,taxCodeId=b.taxCodeId?uuid(b.taxCodeId,'Tax code'):null,unitPriceMinor=num(b.unitPriceMinor,'Unit price');
  return this.prisma.$transaction(async tx=>{
   const list=await tx.priceList.findFirst({where:{id,tenantId:w}});
   if(!list)throw new NotFoundException('Price list not found.');
   if(list.active)throw new ConflictException('Active prices cannot be edited. Create a new price list for changes.');
   if(!await tx.product.findFirst({where:{id:productId,tenantId:w,active:true}})) throw new NotFoundException('Product not found.');
   if(variantId&&!await tx.productVariant.findFirst({where:{id:variantId,tenantId:w,productId,active:true}})) throw new NotFoundException('Variant does not belong to this product.');
   if(taxCodeId&&!await tx.taxCode.findFirst({where:{id:taxCodeId,tenantId:w,active:true}})) throw new NotFoundException('Tax code not found.');
   const prior=await tx.priceListItem.findFirst({where:{tenantId:w,priceListId:id,productId,variantId}});
   const row=prior?await tx.priceListItem.update({where:{id:prior.id},data:{unitPriceMinor,taxCodeId}}):await tx.priceListItem.create({data:{tenantId:w,priceListId:id,productId,variantId,unitPriceMinor,taxCodeId}});
   await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'catalog.price_list_item.saved',resourceType:'price_list_item',resourceId:row.id}}); return row;
  });
 }
 @Post('catalog/price-lists/:priceListId/activate') @UseGuards(CsrfGuard)
 async activatePriceList(@Param('workspaceId') w:string,@Param('priceListId') id:string,@Req() req:FastifyRequest) {
  const actor=await this.actor(req,w);
  return this.prisma.$transaction(async tx=>{
   const member=await tx.membership.findUnique({where:{tenantId_userId:{tenantId:w,userId:actor}},select:{role:true}});
   if(!member||!['owner','owner_administrator'].includes(member.role))throw new UnauthorizedException('Only the business owner can approve selling prices.');
   const list=await tx.priceList.findFirst({where:{id,tenantId:w}});
   if(!list)throw new NotFoundException('Price list not found.');
   if(list.endsAt&&list.endsAt<new Date())throw new ConflictException('This price list has expired.');
   const items=await tx.priceListItem.count({where:{tenantId:w,priceListId:id}});
   if(!items)throw new ConflictException('Add at least one product price before activation.');
   const row=await tx.priceList.update({where:{id},data:{active:true}});
   await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'catalog.price_list.approved',resourceType:'price_list',resourceId:id}});
   return {...row,itemsCount:items};
  });
 }
 @Post('catalog/price-lists/:priceListId/deactivate') @UseGuards(CsrfGuard)
 async deactivatePriceList(@Param('workspaceId') w:string,@Param('priceListId') id:string,@Req() req:FastifyRequest) {
  const actor=await this.actor(req,w);
  return this.prisma.$transaction(async tx=>{
   const member=await tx.membership.findUnique({where:{tenantId_userId:{tenantId:w,userId:actor}},select:{role:true}});
   if(!member||!['owner','owner_administrator'].includes(member.role))throw new UnauthorizedException('Only the owner can change active selling prices.');
   const row=await tx.priceList.updateMany({where:{tenantId:w,id},data:{active:false}});
   if(!row.count)throw new NotFoundException('Price list not found.');
   await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'catalog.price_list.deactivated',resourceType:'price_list',resourceId:id}});
   return {saved:true};
  });
 }
 @Get('catalog/variants') async allVariants(@Param('workspaceId') w:string,@Req() req:FastifyRequest){
   await this.actor(req,w);
   return this.prisma.productVariant.findMany({where:{tenantId:w,active:true},select:{id:true,productId:true,sku:true,barcode:true,attributes:true,costPriceMinor:true,sellingPriceMinor:true,active:true},take:3000,orderBy:{sku:'asc'}});
 }
 @Get('branches/:branchId/inventory/variant-balances') async variantBalances(@Param('workspaceId') w:string,@Param('branchId') branch:string,@Req() req:FastifyRequest){
   await this.actor(req,w,branch);
   const rows=await this.prisma.stockMovement.groupBy({by:['productId','variantId'],where:{tenantId:w,branchId:branch},_sum:{quantityDelta:true}});
   return rows.map(row=>({productId:row.productId,variantId:row.variantId,quantity:Number(row._sum.quantityDelta??0)}));
 }
 @Get('branches/:branchId/inventory/lots/available') async availableLots(@Param('workspaceId') w:string,@Param('branchId') branch:string,@Req() req:FastifyRequest){
   await this.actor(req,w,branch);
   const url=new URL(req.url,'https://lexa.local');
   const productId=uuid(url.searchParams.get('productId'),'Product');
   const variantId=url.searchParams.get('variantId')?uuid(url.searchParams.get('variantId'),'Variant'):null;
   const lots=await this.prisma.inventoryLot.findMany({where:{tenantId:w,branchId:branch,productId,variantId,status:'available',OR:[{expiryDate:null},{expiryDate:{gte:new Date()}}]},orderBy:[{expiryDate:'asc'},{lotNumber:'asc'}],take:300});
   return lots.map(l=>({id:l.id,lotNumber:l.lotNumber,expiryDate:l.expiryDate?.toISOString().slice(0,10)??null,available:Number(l.quantityOnHand)-Number(l.quantityReserved)-Number(l.quantityQuarantined),variantId:l.variantId})).filter(l=>l.available>0);
 }

 @Post('products/:productId/variants') @UseGuards(CsrfGuard) async createVariant(@Param('workspaceId') w:string,@Param('productId') id:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
  const actor=await this.actor(req,w),b=obj(raw),product=await this.prisma.product.findFirst({where:{tenantId:w,id}}); if(!product) throw new NotFoundException('Product not found.');
  const fields=await resolveCategoryFields(this.prisma,w,product.categoryId);
  const attributes=cleanProductAttributes(b.attributes,product.productType??fields.templateKey,fields.customKeys);
  validateVariantDimensions(product.productType??fields.templateKey,attributes);
  const barcode=b.barcode?txt(b.barcode,'Barcode',100):null;
  if(barcode&&await this.prisma.productVariant.findFirst({where:{tenantId:w,barcode,active:true}}))throw new ConflictException('Variant barcode already exists in this business.');
  return this.prisma.$transaction(async tx=>{const row=await tx.productVariant.create({data:{tenantId:w,productId:id,sku:txt(b.sku,'SKU',80),barcode,attributes,costPriceMinor:num(b.costPriceMinor??product.costPriceMinor,'Cost price'),sellingPriceMinor:num(b.sellingPriceMinor??product.sellingPriceMinor,'Selling price')}}); await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'catalog.product_variant.created',resourceType:'product_variant',resourceId:row.id}}); return row;});
 }
 @Get('products/:productId/variants') async variants(@Param('workspaceId') w:string,@Param('productId') id:string,@Req() req:FastifyRequest) { await this.actor(req,w); return this.prisma.productVariant.findMany({where:{tenantId:w,productId:id,active:true},orderBy:{sku:'asc'}}); }

 @Get('branches/:branchId/inventory/warehouses') async warehouses(@Param('workspaceId') w:string,@Param('branchId') branch:string,@Req() req:FastifyRequest) { await this.actor(req,w,branch); return this.prisma.warehouse.findMany({where:{tenantId:w,branchId:branch},orderBy:{code:'asc'}}); }
 @Post('branches/:branchId/inventory/warehouses') @UseGuards(CsrfGuard) async createWarehouse(@Param('workspaceId') w:string,@Param('branchId') branch:string,@Body() raw:unknown,@Req() req:FastifyRequest) { const actor=await this.actor(req,w,branch),b=obj(raw); return this.prisma.$transaction(async tx=>{const row=await tx.warehouse.create({data:{tenantId:w,branchId:branch,code:txt(b.code,'Code',30).toUpperCase(),name:txt(b.name,'Name',100)}}); await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'inventory.warehouse.created',resourceType:'warehouse',resourceId:row.id,metadata:{branchId:branch}}}); return row;}); }
 @Get('branches/:branchId/inventory/warehouses/:warehouseId/bins') async bins(@Param('workspaceId') w:string,@Param('branchId') branch:string,@Param('warehouseId') warehouse:string,@Req() req:FastifyRequest) { await this.actor(req,w,branch); const row=await this.prisma.warehouse.findFirst({where:{id:warehouse,tenantId:w,branchId:branch}}); if(!row) throw new NotFoundException('Warehouse not found.'); return this.prisma.storageBin.findMany({where:{tenantId:w,warehouseId:warehouse},orderBy:{code:'asc'}}); }
 @Post('branches/:branchId/inventory/warehouses/:warehouseId/bins') @UseGuards(CsrfGuard) async createBin(@Param('workspaceId') w:string,@Param('branchId') branch:string,@Param('warehouseId') warehouse:string,@Body() raw:unknown,@Req() req:FastifyRequest) { const actor=await this.actor(req,w,branch),b=obj(raw),wh=await this.prisma.warehouse.findFirst({where:{id:warehouse,tenantId:w,branchId:branch}}); if(!wh) throw new NotFoundException('Warehouse not found.'); const type=String(b.binType??'storage'); if(!['storage','receiving','quarantine','scrap','dispatch'].includes(type)) throw new BadRequestException('Invalid bin type.'); return this.prisma.$transaction(async tx=>{const row=await tx.storageBin.create({data:{tenantId:w,warehouseId:warehouse,code:txt(b.code,'Code',30).toUpperCase(),name:txt(b.name,'Name',100),binType:type}}); await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'inventory.storage_bin.created',resourceType:'storage_bin',resourceId:row.id}}); return row;}); }
 @Post('branches/:branchId/inventory/lots') @UseGuards(CsrfGuard) async createLot(@Param('workspaceId') w:string,@Param('branchId') branch:string,@Body() raw:unknown,@Req() req:FastifyRequest) { const actor=await this.actor(req,w,branch),b=obj(raw),productId=uuid(b.productId,'Product'),warehouseId=uuid(b.warehouseId,'Warehouse'); const wh=await this.prisma.warehouse.findFirst({where:{id:warehouseId,tenantId:w,branchId:branch}}); if(!wh) throw new NotFoundException('Warehouse not found.'); const product=await this.prisma.product.findFirst({where:{id:productId,tenantId:w,active:true}}); if(!product||!product.trackStock||!product.trackLot) throw new BadRequestException('Select an active stock-tracked product configured for lot tracking.');
 const member=await this.prisma.membership.findUnique({where:{tenantId_userId:{tenantId:w,userId:actor}},select:{role:true}});if(!member||!hasPermission(member.role,'inventory.approve'))throw new ForbiddenException('Opening a batch requires inventory approval. Receive purchased stock through a purchase order.'); const variantId=b.variantId?uuid(b.variantId,'Variant'):null; if(variantId&&!await this.prisma.productVariant.findFirst({where:{id:variantId,tenantId:w,productId,active:true}})) throw new NotFoundException('Product variant not found.'); if(!variantId&&await this.prisma.productVariant.count({where:{tenantId:w,productId,active:true}}))throw new BadRequestException('Choose the actual variant for opening stock.'); const binId=b.binId?uuid(b.binId,'Bin'):null; if(binId&&!await this.prisma.storageBin.findFirst({where:{id:binId,tenantId:w,warehouseId,active:true}})) throw new NotFoundException('Storage bin not found in this warehouse.'); const quantity=qty(b.quantityOnHand),unitCost=num(b.unitCostMinor??0,'Unit cost'); if(product.trackSerial&&!Number.isInteger(quantity))throw new BadRequestException('Serialized stock must be received in whole units.'); const valueMinor=Math.round(quantity*unitCost);if(!Number.isSafeInteger(valueMinor)||valueMinor>2_000_000_000)throw new BadRequestException('Opening stock value is too large.'); const row=await this.prisma.$transaction(async tx=>{const lot=await tx.inventoryLot.create({data:{tenantId:w,branchId:branch,warehouseId,binId,productId,variantId,lotNumber:txt(b.lotNumber,'Lot number',80),expiryDate:b.expiryDate?new Date(`${txt(b.expiryDate,'Expiry date',10)}T00:00:00Z`):null,quantityOnHand:quantity,unitCostMinor:unitCost}}); await tx.stockMovement.create({data:{tenantId:w,branchId:branch,productId,variantId,warehouseId,binId,lotId:lot.id,type:'opening',quantityDelta:String(quantity),unitCostMinor:unitCost,reason:`Approved opening stock for lot ${lot.lotNumber}`,sourceId:lot.id}}); if(valueMinor>0)await postLedgerJournal(tx,{tenantId:w,branchId:branch,actorUserId:actor,sourceType:'inventory_opening_lot',sourceId:lot.id,memo:`Opening batch stock ${lot.lotNumber}`,lines:[{accountKey:'inventory',debitMinor:valueMinor,description:'Opening inventory valuation'},{accountKey:'owner_equity',creditMinor:valueMinor,description:'Opening stock equity'}]}); await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'inventory.opening_lot.created',resourceType:'inventory_lot',resourceId:lot.id,metadata:{branchId:branch,productId,quantity}}}); return lot;}); return row; }
 @Post('branches/:branchId/inventory/lots/:lotId/serials') @UseGuards(CsrfGuard) async createSerial(@Param('workspaceId') w:string,@Param('branchId') branch:string,@Param('lotId') lotId:string,@Body() raw:unknown,@Req() req:FastifyRequest) { const actor=await this.actor(req,w,branch),b=obj(raw),lot=await this.prisma.inventoryLot.findFirst({where:{tenantId:w,branchId:branch,id:lotId}}); if(!lot) throw new NotFoundException('Inventory lot not found.'); if(Number(lot.quantityOnHand)<1) throw new ConflictException('The lot has no available unit to serialize.'); const product=await this.prisma.product.findFirst({where:{tenantId:w,id:lot.productId,trackSerial:true}});if(!product)throw new BadRequestException('Product is not enabled for serial tracking.'); const identifiers=validatedUnitIds(b.serialNumber,b.imei2,product.productType); return this.prisma.$transaction(async tx=>{const locked=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM inventory_lots WHERE tenant_id=${w}::uuid AND branch_id=${branch}::uuid AND id=${lotId}::uuid FOR UPDATE`; if(!locked.length) throw new NotFoundException('Inventory lot not found.'); const count=await tx.inventorySerial.count({where:{tenantId:w,branchId:branch,lotId,status:{in:['available','quarantine','reserved','in_transit']}}});if(count>=Number(lot.quantityOnHand))throw new ConflictException('All units in this lot already have serial numbers.'); const row=await tx.inventorySerial.create({data:{tenantId:w,branchId:branch,productId:lot.productId,variantId:lot.variantId,lotId,serialNumber:identifiers.serialNumber,identifiers:identifiers.imei2?{imei2:identifiers.imei2}:{}}}); await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'inventory.serial.created',resourceType:'inventory_serial',resourceId:row.id}}); return row;}).catch(rethrowSerialIdentityConflict); }
 @Get('branches/:branchId/inventory/serials/lookup')
 async lookupSerial(@Param('workspaceId') w:string,@Param('branchId') branch:string,@Req() req:FastifyRequest){
  await this.actor(req,w,branch);
  const url=new URL(req.url,'https://lexa.local');
  const identifier=txt(url.searchParams.get('identifier'),'IMEI or serial number',120).toUpperCase();
  // The query mirrors database-trigger normalization and finds either IMEI
  // position, including legacy records. Both branch and tenant are mandatory.
  const matches=await this.prisma.$queryRaw<Array<{
   id:string;productId:string;variantId:string|null;lotId:string|null;
   serialNumber:string;identifiers:unknown;status:string;
  }>>`SELECT id,product_id AS "productId",variant_id AS "variantId",lot_id AS "lotId",
            serial_number AS "serialNumber",identifiers,status
      FROM inventory_serials
      WHERE tenant_id=${w}::uuid AND branch_id=${branch}::uuid
        AND (upper(btrim(serial_number))=${identifier}
          OR upper(btrim(COALESCE(identifiers->>'imei2','')))=${identifier})
      LIMIT 2`;
  if(!matches.length)throw new NotFoundException('Device identifier was not found in this branch.');
  if(matches.length>1)throw new ConflictException('Historical duplicate identifiers require inventory reconciliation before use.');
  return matches[0];
 }

 @Get('branches/:branchId/inventory/serials')
 async availableSerials(@Param('workspaceId') w:string,@Param('branchId') branch:string,@Req() req:FastifyRequest){
  await this.actor(req,w,branch);
  const url=new URL(req.url,'https://lexa.local');
  const productId=uuid(url.searchParams.get('productId'),'Product');
  const variantId=url.searchParams.get('variantId')?uuid(url.searchParams.get('variantId'),'Variant'):null;
  const product=await this.prisma.product.findFirst({where:{id:productId,tenantId:w,trackSerial:true}});
  if(!product)throw new NotFoundException('Tracked product not found.');
  if(variantId&&!await this.prisma.productVariant.findFirst({where:{tenantId:w,productId,id:variantId}}))throw new NotFoundException('Variant not found.');
  const rows=await this.prisma.inventorySerial.findMany({where:{tenantId:w,branchId:branch,productId,variantId,status:'available'},take:500,orderBy:{serialNumber:'asc'}});
  return rows.map(s=>({id:s.id,serialNumber:s.serialNumber,identifiers:s.identifiers,lotId:s.lotId,variantId:s.variantId}));
 }

 @Post('branches/:branchId/inventory/serials') @UseGuards(CsrfGuard)
 async createStandaloneSerial(@Param('workspaceId') w:string,@Param('branchId') branch:string,@Body() raw:unknown,@Req() req:FastifyRequest){
  const actor=await this.actor(req,w,branch),b=obj(raw);
  const productId=uuid(b.productId,'Product'),variantId=b.variantId?uuid(b.variantId,'Variant'):null;
  return this.prisma.$transaction(async tx=>{
    const locked=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM products WHERE tenant_id=${w}::uuid AND id=${productId}::uuid FOR UPDATE`;
    if(!locked.length)throw new NotFoundException('Product not found.');
    const product=await tx.product.findFirst({where:{id:productId,tenantId:w,active:true}});
    if(!product?.trackStock||!product.trackSerial||product.trackLot)throw new BadRequestException('Choose an individually serialized product without batch tracking.');
    const identifiers=validatedUnitIds(b.serialNumber,b.imei2,product.productType);
    if(variantId&&!await tx.productVariant.findFirst({where:{id:variantId,tenantId:w,productId,active:true}}))throw new BadRequestException('Variant does not belong to this product.');
    const balances=await tx.stockMovement.aggregate({where:{tenantId:w,branchId:branch,productId,variantId},_sum:{quantityDelta:true}});
    const available=Number(balances._sum.quantityDelta??0);
    const assigned=await tx.inventorySerial.count({where:{tenantId:w,branchId:branch,productId,variantId,status:{in:['available','quarantine','reserved','in_transit']}}});
    if(!Number.isInteger(available)||assigned>=available)throw new ConflictException('Record stock received for this exact product variant before registering its next serial number.');
    const row=await tx.inventorySerial.create({data:{tenantId:w,branchId:branch,productId,variantId,lotId:null,serialNumber:identifiers.serialNumber,identifiers:identifiers.imei2?{imei2:identifiers.imei2}:{}}});
    await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'inventory.serial.registered',resourceType:'inventory_serial',resourceId:row.id,metadata:{productId,branchId:branch,variantId}}});
    return {id:row.id,serialNumber:row.serialNumber,imei2:identifiers.imei2,variantId:row.variantId};
  },{isolationLevel:'Serializable'}).catch(rethrowSerialIdentityConflict);
 }

 @Get('branches/:branchId/inventory/reservations') async reservations(@Param('workspaceId') w:string,@Param('branchId') branch:string,@Req() req:FastifyRequest) { await this.actor(req,w,branch); return this.prisma.stockReservation.findMany({where:{tenantId:w,branchId:branch},orderBy:{createdAt:'desc'},take:500}); }
 @Post('branches/:branchId/inventory/reservations') @UseGuards(CsrfGuard) async reserve(@Param('workspaceId') w:string,@Param('branchId') branch:string,@Headers('idempotency-key') key:string|undefined,@Body() raw:unknown,@Req() req:FastifyRequest) {
  const actor=await this.actor(req,w,branch); if(!key||key.length>200) throw new BadRequestException('Idempotency-Key header is required.'); const b=obj(raw),lotId=uuid(b.lotId,'Lot'),productId=uuid(b.productId,'Product'),quantity=qty(b.quantity);
  const result=await this.prisma.$transaction(async tx=>{
   const prior=await tx.stockReservation.findUnique({where:{tenantId_idempotencyKey:{tenantId:w,idempotencyKey:key}}}); if(prior) { if(prior.productId!==productId||Number(prior.quantity)!==quantity||prior.lotId!==lotId) throw new ConflictException('Idempotency key was already used for another reservation.'); return prior; }
   const locked=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM inventory_lots WHERE tenant_id=${w}::uuid AND branch_id=${branch}::uuid AND id=${lotId}::uuid AND product_id=${productId}::uuid FOR UPDATE`; if(!locked.length) throw new NotFoundException('Lot not found for this product and branch.');
   const row=await tx.stockReservation.create({data:{tenantId:w,branchId:branch,productId,warehouseId:b.warehouseId?uuid(b.warehouseId,'Warehouse'):null,lotId,variantId:b.variantId?uuid(b.variantId,'Variant'):null,orderModule:txt(b.orderModule??'manual','Order module',50),orderId:txt(b.orderId,'Order ID',100),quantity:String(quantity),idempotencyKey:key,expiresAt:b.expiresAt?new Date(String(b.expiresAt)):null}});
   await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'inventory.stock.reserved',resourceType:'stock_reservation',resourceId:row.id,metadata:{branchId:branch,productId,lotId,quantity}}}); return row;
  },{isolationLevel:'Serializable'}); return result;
 }
 @Post('branches/:branchId/inventory/reservations/:reservationId/release') @UseGuards(CsrfGuard) async releaseReservation(@Param('workspaceId') w:string,@Param('branchId') branch:string,@Param('reservationId') id:string,@Req() req:FastifyRequest) { const actor=await this.actor(req,w,branch); const row=await this.prisma.$transaction(async tx=>{ const prior=await tx.stockReservation.findFirst({where:{tenantId:w,branchId:branch,id}}); if(!prior) throw new NotFoundException('Reservation not found.'); if(prior.status!=='active') return prior; const updated=await tx.stockReservation.update({where:{id},data:{status:'released'}}); await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action:'inventory.stock_reservation.released',resourceType:'stock_reservation',resourceId:id}}); return updated; }); return row; }
}
