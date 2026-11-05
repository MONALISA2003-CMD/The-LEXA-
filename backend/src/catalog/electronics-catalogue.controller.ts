import {Body,BadRequestException,ConflictException,Controller,ForbiddenException,Get,NotFoundException,Param,Post,Query,Req,UnauthorizedException,UseGuards} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {createHash} from 'node:crypto';
import {PrismaService} from '../prisma/prisma.service';
import {CsrfGuard} from '../core/csrf.guard';
import {hasPermission} from '../authorization/role-policy';
import {activePreset} from './product-attribute-validation';
import {
 assertFamilyEnabled,assertModelFamilyProductType,assertNodeEnabled,familyPolicy,industryEnabled,
 legacyCategoryAttributeSchema,normalizeCatalogueAlias,searchTaxonomy,selectedBusinessIndustries,
 taxonomyNode,validateFamilySpecifications,validateSourceProvenance,V2_CONTRACT_HASH,V2_FAMILIES,V2_NODES,
 V2_POLICY_VERSION,V2_TAXONOMY_VERSION
} from './electronics-catalogue-policy';

function object(raw:unknown):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Provide a JSON object.');
 return raw as Record<string,unknown>;
}
function text(raw:unknown,label:string,max=150):string{
 if(typeof raw!=='string'||!raw.trim()||raw.trim().length>max)throw new BadRequestException(`${label} is required (maximum ${max} characters).`);
 return raw.trim();
}
function uid(raw:unknown,label:string):string{
 const value=text(raw,label,48);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new BadRequestException(`${label} must be a valid identifier.`);
 return value;
}
function sessionCookie(request:FastifyRequest):string|undefined{
 for(const pair of (request.headers.cookie??'').split(';')){
  const at=pair.indexOf('=');if(at<0||pair.slice(0,at).trim()!=='lexa_session')continue;
  try{return decodeURIComponent(pair.slice(at+1).trim())}catch{return undefined}
 }
 return undefined;
}
function conflict(error:unknown,message:string):never{
 const candidate=error as {code?:string;message?:string};
 if(candidate?.code==='P2002'||candidate?.code==='P2034'||candidate?.code==='23505'||String(error).includes('LEXA_BRAND_ALIAS_COLLISION'))throw new ConflictException(message);
 throw error;
}

@Controller('workspaces/:workspaceId/catalog/v2')
export class ElectronicsV2Controller {
 constructor(private readonly prisma:PrismaService){}
 private async actor(req:FastifyRequest,tenantId:string,write=false,review=false){
  const cookie=sessionCookie(req);
  if(!cookie)throw new UnauthorizedException('Sign in to access the catalogue.');
  const tokenHash=createHash('sha256').update(cookie).digest('hex');
  const session=await this.prisma.session.findFirst({where:{tokenHash,expiresAt:{gt:new Date()}},select:{userId:true}});
  if(!session)throw new UnauthorizedException('Your session has expired.');
  this.prisma.enterTenantContext(tenantId,session.userId);
  const member=await this.prisma.membership.findUnique({where:{tenantId_userId:{tenantId,userId:session.userId}}});
  if(!member||member.status!=='ACTIVE')throw new NotFoundException('Business not found.');
  if(!hasPermission(member.role,'catalog.read'))throw new ForbiddenException('Catalogue access denied.');
  if(write && (!hasPermission(member.role,'catalog.write')||!hasPermission(member.role,'inventory.approve')))
   throw new ForbiddenException('V2 catalogue changes require an authorized business catalogue manager.');
  if(review&&!hasPermission(member.role,'inventory.approve'))throw new ForbiddenException('Reference approval requires an inventory approver.');
  return session.userId;
 }
 private async industries(w:string){
  const profile=await this.prisma.businessProfile.findUnique({where:{tenantId:w},select:{industries:true,industry:true}});
  return selectedBusinessIndustries(profile);
 }
 private async audit(tx:any,w:string,actor:string,action:string,type:string,id:string,metadata:Record<string,unknown>={}){
  await tx.auditEvent.create({data:{tenantId:w,actorUserId:actor,action,resourceType:type,resourceId:id,metadata}});
 }
 @Get('summary') async summary(@Param('workspaceId') w:string,@Req() req:FastifyRequest){
  await this.actor(req,w);const selected=await this.industries(w);
  return {schemaVersion:V2_TAXONOMY_VERSION,policyVersion:V2_POLICY_VERSION,contentHash:V2_CONTRACT_HASH,
    leaves:V2_NODES.filter(n=>n.selectable).length,families:V2_FAMILIES.length,industryCodes:selected,
    enabledLeafCount:V2_NODES.filter(n=>n.selectable&&industryEnabled(n.industryCodes,selected)).length,
    legacyProductsIntact:true};
 }
 @Get('taxonomy') async taxonomy(@Param('workspaceId') w:string,@Req() req:FastifyRequest,@Query('q') q?:string,@Query('enabledOnly') enabledOnly?:string){
  await this.actor(req,w);const selected=await this.industries(w);
  const results=searchTaxonomy(typeof q==='string'?q.slice(0,150):'',selected,400);
  return {version:V2_TAXONOMY_VERSION,contentHash:V2_CONTRACT_HASH,nodes:enabledOnly==='true'?results.filter(n=>n.enabled):results};
 }
 /** Browse the business's real categories, including user-defined nodes, without creating or remapping them.
  * The stable CUSTOM code is derived from the existing category UUID and is not a canonical V2 alias.
  */
 @Get('taxonomy/custom') async customCategories(@Param('workspaceId') w:string,@Req() req:FastifyRequest,@Query('q') q?:string){
  await this.actor(req,w);
  const query=normalizeCatalogueAlias(typeof q==='string'?q.slice(0,100):'');
  const categories=await this.prisma.category.findMany({where:{tenantId:w},select:{id:true,name:true,parentId:true,catalogCode:true,templateKey:true},take:5000});
  const byId=new Map(categories.map(c=>[c.id,c]));
  const matches=categories.flatMap(category=>{
   const seen=new Set<string>();const path:string[]=[];let current:typeof category|undefined=category;
   while(current&&!seen.has(current.id)&&path.length<20){
    seen.add(current.id);path.unshift(current.name);
    if(current.parentId&&!byId.has(current.parentId))return []; // Do not present truncated historical breadcrumbs.
    current=current.parentId?byId.get(current.parentId):undefined;
   }
   if(current)return []; // Cycle or depth overflow: fail closed, do not guess a path.
   const breadcrumb=path.join(' › ');
   const code=category.catalogCode??`CUSTOM.C${category.id.replace(/-/g,'').toUpperCase()}`;
   if(query&&![category.name,breadcrumb,code].some(t=>normalizeCatalogueAlias(t).includes(query)))return [];
   return [{categoryId:category.id,code,label:category.name,breadcrumb,path,
    canonical:category.catalogCode?.startsWith('ELEC.')===true,templateKey:category.templateKey}];
  });
  return {nodes:matches.slice(0,150),total:matches.length,readOnly:true};
 }
 @Get('taxonomy/:code') async taxonomyDetail(@Param('workspaceId') w:string,@Param('code') code:string,@Req() req:FastifyRequest){
  await this.actor(req,w);const node=taxonomyNode(code);const selected=await this.industries(w);
  return {...node,enabled:industryEnabled(node.industryCodes,selected),breadcrumb:node.path.join(' › '),
    family:node.familyCode?familyPolicy(node.familyCode):null};
 }
 @Get('families') async policies(@Param('workspaceId') w:string,@Req() req:FastifyRequest){
  await this.actor(req,w);const selected=await this.industries(w);
  return {version:V2_POLICY_VERSION,contentHash:V2_CONTRACT_HASH,
   families:V2_FAMILIES.map(f=>({...f,enabled:industryEnabled(f.industryCodes,selected)}))};
 }
 @Get('families/:code') async policy(@Param('workspaceId') w:string,@Param('code') code:string,@Req() req:FastifyRequest){
  await this.actor(req,w);const policy=familyPolicy(code);const selected=await this.industries(w);
  return {...policy,enabled:industryEnabled(policy.industryCodes,selected)};
 }
 @Get('categories/preview') async preview(@Param('workspaceId') w:string,@Req() req:FastifyRequest,@Query('code') code:string){
  await this.actor(req,w);const node=taxonomyNode(text(code,'Category code',160));const selected=await this.industries(w);
  assertNodeEnabled(node,selected);
  const existing=await this.prisma.category.findMany({where:{tenantId:w},select:{id:true,name:true,parentId:true,catalogCode:true},take:5000});
  const codeMatch=existing.find(c=>c.catalogCode===node.code);
  const byId=new Map(existing.map(c=>[c.id,c]));
  const oldPath=(id:string)=>{const parts:string[]=[];let current=byId.get(id);const seen=new Set<string>();while(current&&!seen.has(current.id)&&parts.length<20){seen.add(current.id);parts.unshift(current.name);current=current.parentId?byId.get(current.parentId):undefined;}return parts.join(' > ');};
  const permittedAliases=new Set([node.path.join(' > '),...(node.aliases??[])].map(normalizeCatalogueAlias));
  const suggestions=existing.filter(c=>!c.catalogCode&&permittedAliases.has(normalizeCatalogueAlias(oldPath(c.id))))
   .map(c=>({categoryId:c.id,path:oldPath(c.id)}));
  return {code:node.code,selectable:node.selectable,enabled:true,breadcrumb:node.path.join(' › '),
    existingCategoryId:codeMatch?.id??null,legacyCandidates:suggestions,
    action:codeMatch?'already_adopted':suggestions.length?'link_existing_with_approval':'adopt_new_with_approval',
    doesNotChangeProducts:true};
 }
 @Post('categories/adopt') @UseGuards(CsrfGuard)
 async adopt(@Param('workspaceId') w:string,@Req() req:FastifyRequest,@Body() raw:unknown){
  const actor=await this.actor(req,w,true),body=object(raw),code=text(body.code,'Category code',160);
  const selected=await this.industries(w),target=taxonomyNode(code);
  if(!target.selectable||!target.familyCode)throw new BadRequestException('Choose a product category leaf.');
  assertNodeEnabled(target,selected);const family=familyPolicy(target.familyCode);assertFamilyEnabled(family,selected);
  try{return await this.prisma.$transaction(async tx=>{
   // Prevent simultaneous same-tenant path creation across requests and workers.
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${w}),hashtext('lexa_electronics_v2_adopt'))`;
   let parentId:string|null=null;const created:string[]=[];
   for(let depth=1;depth<=target.path.length;depth++){
    const currentCode=target.code.split('.').slice(0,depth+1).join('.');
    const node=taxonomyNode(currentCode);
    const found=await tx.category.findFirst({where:{tenantId:w,catalogCode:currentCode}});
    if(found){if(found.parentId!==parentId)throw new ConflictException('Catalogue path has an inconsistent parent. Please review the existing categories.');parentId=found.id;continue;}
    const legacy=await tx.category.findFirst({where:{tenantId:w,parentId,name:node.label,catalogCode:null}});
    if(legacy)throw new ConflictException('An uncoded category already occupies this path. Link its existing ID explicitly in category preview.');
    const leaf=node.selectable;
    const row: {id:string}=await tx.category.create({data:{tenantId:w,parentId,name:node.label,catalogCode:node.code,taxonomyVersion:V2_TAXONOMY_VERSION,
      templateKey:leaf?family.legacyProductType:null,attributeSchema:leaf?legacyCategoryAttributeSchema(family):[]}});
    created.push(row.id);parentId=row.id;
    await this.audit(tx,w,actor,'catalog.v2.category.adopted','category',row.id,{code:node.code,version:V2_TAXONOMY_VERSION});
   }
   return {categoryId:parentId,code:target.code,createdCategoryIds:created,existingProductsModified:0};
  },{isolationLevel:'Serializable'});}catch(e){return conflict(e,'This category already exists or a concurrent import changed its path. Refresh the preview.');}
 }
 @Post('categories/link-existing') @UseGuards(CsrfGuard)
 async linkExisting(@Param('workspaceId') w:string,@Req() req:FastifyRequest,@Body() raw:unknown){
  const actor=await this.actor(req,w,true),body=object(raw),id=uid(body.categoryId,'Existing category');
  const node=taxonomyNode(text(body.code,'V2 taxonomy code',160));if(!node.selectable)throw new BadRequestException('Choose a leaf category.');
  const selected=await this.industries(w);assertNodeEnabled(node,selected);
  try{return await this.prisma.$transaction(async tx=>{
   const found=await tx.category.findFirst({where:{tenantId:w,id}});
   if(!found)throw new NotFoundException('Category not found in your business.');
   if(found.catalogCode&&found.catalogCode!==node.code)throw new ConflictException('This category is already linked to another canonical code.');
   const others=await tx.category.findFirst({where:{tenantId:w,catalogCode:node.code}});
   if(others&&others.id!==id)throw new ConflictException('This canonical code is already linked to another category.');
   const byId=await tx.category.findMany({where:{tenantId:w},select:{id:true,name:true,parentId:true}});
   const rows=new Map(byId.map(c=>[c.id,c]));let item=rows.get(id),path:string[]=[];const seen=new Set<string>();
   while(item&&!seen.has(item.id)&&path.length<20){seen.add(item.id);path.unshift(item.name);item=item.parentId?rows.get(item.parentId):undefined;}
   const actual=normalizeCatalogueAlias(path.join(' > '));
   const allowed=[node.path.join(' > '),...(node.aliases??[])].map(normalizeCatalogueAlias);
   if(!allowed.includes(actual))throw new BadRequestException('The historical category breadcrumb is not a recognized alias for this V2 code.');
   const updated=await tx.category.update({where:{id},data:{catalogCode:node.code,taxonomyVersion:V2_TAXONOMY_VERSION}});
   const oldPath=path.join(' > ');const normalized=normalizeCatalogueAlias(oldPath);
   const existingAlias=await tx.catalogCategoryAlias.findFirst({where:{tenantId:w,normalizedAlias:normalized}});
   if(existingAlias&&existingAlias.categoryId!==id)throw new ConflictException('Historical path belongs to another category.');
   if(!existingAlias)await tx.catalogCategoryAlias.create({data:{tenantId:w,categoryId:id,aliasText:oldPath,normalizedAlias:normalized,sourceVersion:V2_TAXONOMY_VERSION,createdByUserId:actor}});
   await this.audit(tx,w,actor,'catalog.v2.category.linked_existing','category',id,{code:node.code,previousPath:oldPath});
   return {categoryId:updated.id,code:node.code,historicalProductIdsPreserved:true};
  },{isolationLevel:'Serializable'});}catch(e){return conflict(e,'The category alias was already claimed in this business.');}
 }
 @Get('brands/search') async brands(@Param('workspaceId') w:string,@Req() req:FastifyRequest,@Query('q') q?:string){
  await this.actor(req,w);const needle=normalizeCatalogueAlias(typeof q==='string'?q.slice(0,100):'');
  const brands=await this.prisma.catalogBrand.findMany({where:{tenantId:w},orderBy:{name:'asc'},take:1500});
  const aliases=await this.prisma.catalogBrandAlias.findMany({where:{tenantId:w},take:3000});
  return brands.filter(b=>!needle||normalizeCatalogueAlias(b.name).includes(needle)||aliases.some(a=>a.brandId===b.id&&a.normalizedAlias.includes(needle)))
   .slice(0,250).map(brand=>({...brand,aliases:aliases.filter(a=>a.brandId===brand.id).map(a=>a.alias)}));
 }
 @Post('brands/:brandId/aliases') @UseGuards(CsrfGuard)
 async addBrandAlias(@Param('workspaceId') w:string,@Param('brandId') brandId:string,@Req() req:FastifyRequest,@Body() raw:unknown){
  const actor=await this.actor(req,w,true),id=uid(brandId,'Brand'),body=object(raw),alias=text(body.alias,'Brand alias',100),norm=normalizeCatalogueAlias(alias);
  try{return await this.prisma.$transaction(async tx=>{
   const brand=await tx.catalogBrand.findFirst({where:{tenantId:w,id}});
   if(!brand)throw new NotFoundException('Brand does not belong to this business.');
   // SERIALIZABLE and database advisory trigger protect simultaneous writers.
   const collision=await tx.catalogBrand.findMany({where:{tenantId:w},select:{id:true,name:true}});
   if(collision.some(b=>normalizeCatalogueAlias(b.name)===norm))throw new ConflictException('A brand already owns this name. Propose a merge for review instead.');
   const old=await tx.catalogBrandAlias.findFirst({where:{tenantId:w,normalizedAlias:norm}});
   if(old)throw new ConflictException('This brand alias is already registered.');
   const row=await tx.catalogBrandAlias.create({data:{tenantId:w,brandId:id,alias,normalizedAlias:norm,createdByUserId:actor}});
   await this.audit(tx,w,actor,'catalog.v2.brand.alias_registered','catalog_brand',id,{alias});return row;
  },{isolationLevel:'Serializable'});}catch(e){return conflict(e,'Brand alias collides with an existing brand or alias.');}
 }
 @Get('brands/merge-proposals') async mergeProposals(@Param('workspaceId') w:string,@Req() req:FastifyRequest){
  await this.actor(req,w);return this.prisma.catalogBrandMergeProposal.findMany({where:{tenantId:w},orderBy:{createdAt:'desc'},take:100});
 }
 @Post('brands/merge-proposals') @UseGuards(CsrfGuard)
 async proposeMerge(@Param('workspaceId') w:string,@Req() req:FastifyRequest,@Body() raw:unknown){
  const actor=await this.actor(req,w,true),body=object(raw),sourceBrandId=uid(body.sourceBrandId,'Source brand'),targetBrandId=uid(body.targetBrandId,'Destination brand');
  if(sourceBrandId===targetBrandId)throw new BadRequestException('Choose two different brands.');
  const rationale=body.rationale?text(body.rationale,'Merge rationale',1000):null;
  try{return await this.prisma.$transaction(async tx=>{
   const matched=await tx.catalogBrand.count({where:{tenantId:w,id:{in:[sourceBrandId,targetBrandId]}}});
   if(matched!==2)throw new NotFoundException('Both brands must belong to your business.');
   const proposal=await tx.catalogBrandMergeProposal.create({data:{tenantId:w,sourceBrandId,targetBrandId,rationale,proposedByUserId:actor}});
   await this.audit(tx,w,actor,'catalog.v2.brand.merge_proposed','catalog_brand_merge_proposal',proposal.id);
   return {...proposal,rowsMerged:0,needsSeparateApproval:true};
  });}catch(e){return conflict(e,'The same brand merge has already been proposed.');}
 }
 @Get('models') async models(@Param('workspaceId') w:string,@Req() req:FastifyRequest,@Query('q') q?:string,@Query('familyCode') familyCode?:string){
  await this.actor(req,w);
  const selected=await this.industries(w);
  const search=typeof q==='string'?q.trim().slice(0,120):'';
  const enabledCodes=V2_FAMILIES.filter(f=>industryEnabled(f.industryCodes,selected)).map(f=>f.code);
  if(familyCode)assertFamilyEnabled(familyPolicy(familyCode),selected);
  // Historical models without a V2 family stay visible for legacy editing.
  const allowed=familyCode?{familyCode}:{OR:[{familyCode:null},{familyCode:{in:enabledCodes}}]};
  const queryConditions=search?[{OR:[{name:{contains:search,mode:'insensitive' as const}},
   {manufacturerCode:{contains:search,mode:'insensitive' as const}}]}]:[];
  return this.prisma.catalogDeviceModel.findMany({where:{tenantId:w,AND:[allowed,...queryConditions]},
   orderBy:[{brandId:'asc'},{name:'asc'}],take:200});
 }
 @Post('models') @UseGuards(CsrfGuard)
 async createModel(@Param('workspaceId') w:string,@Req() req:FastifyRequest,@Body() raw:unknown){
  const actor=await this.actor(req,w,true),body=object(raw),brandId=uid(body.brandId,'Brand'),name=text(body.name,'Model',120);
  const family=familyPolicy(text(body.familyCode,'Family policy',80)),type=text(body.productType??family.legacyProductType,'Product type',80);
  assertModelFamilyProductType(family,type);const selected=await this.industries(w);assertFamilyEnabled(family,selected);
  if(!activePreset(type))throw new BadRequestException('Choose a supported legacy product type.');
  const manufacturerCode=body.manufacturerCode?text(body.manufacturerCode,'Manufacturer code',100):null;
  const specs=validateFamilySpecifications({...object(body.referenceSpecs??{}),...(family.fields.some(f=>f.key==='model')?{model:name}:{})},family,{required:false});
  const provenance=validateSourceProvenance(body.provenance);const normalizedName=normalizeCatalogueAlias(name);
  try{return await this.prisma.$transaction(async tx=>{
   if(!await tx.catalogBrand.findFirst({where:{tenantId:w,id:brandId}}))throw new NotFoundException('Brand does not belong to this business.');
   const model=await tx.catalogDeviceModel.create({data:{tenantId:w,brandId,name,normalizedName,productType:type,manufacturerCode,
      familyCode:family.code,referenceSpecs:specs,referenceVersion:1,provenance,reviewStatus:'draft'}});
   await tx.catalogModelSpecRevision.create({data:{tenantId:w,modelId:model.id,version:1,familyCode:family.code,
      referenceSpecs:specs,provenance,createdByUserId:actor}});
   await this.audit(tx,w,actor,'catalog.v2.model.created','catalog_device_model',model.id,{familyCode:family.code});return model;
  },{isolationLevel:'Serializable'});}catch(e){return conflict(e,'Manufacturer model already exists for this brand and family.');}
 }
 @Get('models/:modelId/revisions') async revisions(@Param('workspaceId') w:string,@Param('modelId') modelId:string,@Req() req:FastifyRequest){
  await this.actor(req,w);const id=uid(modelId,'Manufacturer model');
  if(!await this.prisma.catalogDeviceModel.findFirst({where:{tenantId:w,id}}))throw new NotFoundException('Model not found.');
  return this.prisma.catalogModelSpecRevision.findMany({where:{tenantId:w,modelId:id},orderBy:{version:'desc'},take:100});
 }
 @Post('models/:modelId/revisions') @UseGuards(CsrfGuard)
 async reviseModel(@Param('workspaceId') w:string,@Param('modelId') modelId:string,@Req() req:FastifyRequest,@Body() raw:unknown){
  const actor=await this.actor(req,w,true),id=uid(modelId,'Model'),body=object(raw);
  try{return await this.prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM catalog_device_models WHERE tenant_id=${w}::uuid AND id=${id}::uuid FOR UPDATE`;
   const model=await tx.catalogDeviceModel.findFirst({where:{tenantId:w,id}});
   if(!model||!model.familyCode)throw new NotFoundException('Only registered V2 models can be revised. Legacy models remain editable in the existing product editor.');
   const family=familyPolicy(model.familyCode);assertFamilyEnabled(family,await this.industries(w));
   const specs=validateFamilySpecifications({...object(body.referenceSpecs??{}),...(family.fields.some(f=>f.key==='model')?{model:model.name}:{})},family,{required:false});
   const provenance=validateSourceProvenance(body.provenance);
   const version=model.referenceVersion+1;
   await tx.catalogModelSpecRevision.create({data:{tenantId:w,modelId:id,version,familyCode:family.code,referenceSpecs:specs,provenance,createdByUserId:actor}});
   const updated=await tx.catalogDeviceModel.update({where:{id},data:{referenceSpecs:specs,provenance,referenceVersion:version,reviewStatus:'draft',reviewedAt:null,reviewedByUserId:null}});
   await this.audit(tx,w,actor,'catalog.v2.model.revised','catalog_device_model',id,{version});return updated;
  },{isolationLevel:'Serializable'});}catch(e){return conflict(e,'Model revision changed concurrently. Reload and retry.');}
 }
 @Post('models/:modelId/review') @UseGuards(CsrfGuard)
 async reviewModel(@Param('workspaceId') w:string,@Param('modelId') modelId:string,@Req() req:FastifyRequest,@Body() raw:unknown){
  const actor=await this.actor(req,w,true,true),id=uid(modelId,'Model'),body=object(raw),outcome=text(body.outcome,'Review outcome',15);
  if(!['reviewed','rejected'].includes(outcome))throw new BadRequestException('Review must be reviewed or rejected.');
  try{return await this.prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM catalog_device_models WHERE tenant_id=${w}::uuid AND id=${id}::uuid FOR UPDATE`;
   const model=await tx.catalogDeviceModel.findFirst({where:{tenantId:w,id}});
   if(!model||!model.familyCode)throw new NotFoundException('V2 model not found.');
   if(model.reviewStatus!=='draft')throw new ConflictException('Only a draft can be reviewed. Create a new revision first.');
   const family=familyPolicy(model.familyCode);assertFamilyEnabled(family,await this.industries(w));
   const reviewedSpecs=validateFamilySpecifications(model.referenceSpecs,family,{required:outcome==='reviewed'});
   const reviewedProvenance=validateSourceProvenance(model.provenance);
   if(outcome==='reviewed'&&!Object.values(reviewedProvenance).some(v=>v.trim()))
    throw new BadRequestException('Provide source or manufacturer evidence before approving a reference.');
   const version=model.referenceVersion+1;
   await tx.catalogModelSpecRevision.create({data:{tenantId:w,modelId:id,version,familyCode:family.code,
      referenceSpecs:reviewedSpecs,provenance:reviewedProvenance,reviewStatus:outcome,createdByUserId:actor}});
   const result=await tx.catalogDeviceModel.update({where:{id},data:{referenceVersion:version,reviewStatus:outcome,
      reviewedByUserId:outcome==='reviewed'?actor:null,reviewedAt:outcome==='reviewed'?new Date():null}});
   await this.audit(tx,w,actor,'catalog.v2.model.reviewed','catalog_device_model',id,{outcome,version});return result;
  },{isolationLevel:'Serializable'});}catch(e){return conflict(e,'The model review changed concurrently. Reload and retry.');}
 }
}
