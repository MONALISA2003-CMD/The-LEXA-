
import {
 BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get,
 NotFoundException, Param, Post, Query, Req, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hasPermission, type Permission } from '../authorization/role-policy';
import { assertBranchAccess } from '../authorization/branch-scope';
import { CsrfGuard } from '../core/csrf.guard';

const MODULES=['leads','opportunities','contacts','campaigns','sales-teams','customers'] as const;
type CrmModule=typeof MODULES[number];
const ACTIVITY_TYPES=['call','whatsapp','email','meeting','note','follow_up'] as const;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const safe=(v:unknown,max=160):string=>typeof v==='string'?v.trim().slice(0,max):'';
type GrowthRecord=Record<string,unknown>&{id:string};
const recordData=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const n=(value:unknown):number=>{const number=Number(value??0);return Number.isFinite(number)?number:0;};
const allowedModule=(value:string):CrmModule=>{
 if(!(MODULES as readonly string[]).includes(value))throw new BadRequestException('Choose an available customer and growth section.');
 return value as CrmModule;
};
const dateOnly=(value:unknown):string|null=>{
 if(value===undefined||value===null||value==='')return null;
 const v=safe(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(`${v}T00:00:00.000Z`))||new Date(`${v}T00:00:00.000Z`).toISOString().slice(0,10)!==v)throw new BadRequestException('Choose a valid follow-up date.');return v;
};

@Controller('workspaces/:workspaceId/branches/:branchId/crm')
export class CustomerGrowthController {
 constructor(private readonly db:PrismaService){}
 private async access(workspaceId:string,branchId:string,request:FastifyRequest,permission:Permission) {
  const cookie=(request.headers.cookie??'').split(';').map(v=>v.trim()).find(v=>v.startsWith('lexa_session='));
  const token=cookie?decodeURIComponent(cookie.slice('lexa_session='.length)):'';
  if(!token)throw new UnauthorizedException('Sign in to continue.');
  const session=await this.db.session.findFirst({where:{tokenHash:hash(token),expiresAt:{gt:new Date()}},select:{userId:true}});
  if(!session)throw new UnauthorizedException('Your session has expired. Sign in again.');
  const membership=await this.db.runWithTenantContext({tenantId:workspaceId,userId:session.userId},()=>this.db.membership.findUnique({
    where:{tenantId_userId:{tenantId:workspaceId,userId:session.userId}},select:{role:true,status:true}
  }));
  if(!membership||membership.status!=='ACTIVE')throw new NotFoundException('Business not found.');
  if(!hasPermission(membership.role,permission))throw new ForbiddenException('Your business role does not permit this action.');
  const branch=await this.db.runWithTenantContext({tenantId:workspaceId,userId:session.userId},()=>this.db.branch.findFirst({where:{id:branchId,tenantId:workspaceId},select:{id:true}}));
  if(!branch)throw new NotFoundException('Business records could not be found.');
  await this.db.runWithTenantContext({tenantId:workspaceId,userId:session.userId},()=>assertBranchAccess(this.db,workspaceId,branchId,session.userId,membership.role));
  return {userId:session.userId,role:membership.role};
 }
 private async rows(workspaceId:string,branchId:string,moduleIds:CrmModule[]=MODULES.slice() as CrmModule[]) {
  return this.db.moduleRecord.findMany({where:{tenantId:workspaceId,branchId,moduleId:{in:moduleIds}},orderBy:{updatedAt:'desc'},take:5000,
   select:{moduleId:true,recordId:true,data:true,updatedAt:true}});
 }

 @Get('summary')
 async summary(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Req() request:FastifyRequest) {
  const actor=await this.access(workspaceId,branchId,request,'crm.read');
  return this.db.runWithTenantContext({tenantId:workspaceId,userId:actor.userId},async()=>{
   const [records,sales,activityRows]=await Promise.all([
    this.rows(workspaceId,branchId),
    hasPermission(actor.role,'sales.read')?this.db.$queryRaw<Array<{customerId:string|null;opportunityId:string|null;employeeId:string|null;totalMinor:bigint;count:number}>>`
      SELECT customer_record_id AS "customerId", opportunity_record_id AS "opportunityId", salesperson_employee_id::text AS "employeeId",
      COALESCE(SUM(total_minor),0)::bigint AS "totalMinor",COUNT(*)::int AS count
      FROM sales WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND status='completed'
        AND created_at>=now()-interval '365 days'
      GROUP BY customer_record_id,opportunity_record_id,salesperson_employee_id`:[],
    this.db.$queryRaw<Array<{moduleId:string;recordId:string}>>`SELECT DISTINCT module_id AS "moduleId",record_id AS "recordId" FROM crm_activities
      WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND next_follow_up_on<=CURRENT_DATE`
   ]);
   const grouped=Object.fromEntries(MODULES.map(key=>[key,records.filter(row=>row.moduleId===key)])) as Record<CrmModule,typeof records>;
   const leads=grouped.leads.map(row=>({...recordData(row.data),id:row.recordId} as GrowthRecord));
   const deals=grouped.opportunities.map(row=>({...recordData(row.data),id:row.recordId} as GrowthRecord));
   const campaigns=grouped.campaigns.map(row=>({...recordData(row.data),id:row.recordId} as GrowthRecord));
   const customers=grouped.customers.map(row=>({...recordData(row.data),id:row.recordId} as GrowthRecord));
   const futureDeals=deals.filter(x=>!['Won','Lost','Cancelled'].includes(safe(x.status)));
   const dueItems=new Set<string>();
   for(const item of leads){if(safe(item.nextFollowUpDate)&&safe(item.nextFollowUpDate)<=new Date().toISOString().slice(0,10)&&!['Lost','Converted'].includes(safe(item.status)))dueItems.add(`leads:${item.id}`);}
   for(const item of deals){if(safe(item.nextFollowUpDate)&&safe(item.nextFollowUpDate)<=new Date().toISOString().slice(0,10)&&!['Won','Lost'].includes(safe(item.status)))dueItems.add(`opportunities:${item.id}`);}
   for(const item of activityRows)dueItems.add(`${item.moduleId}:${item.recordId}`);
   const leadPipeline=leads.reduce((count,lead)=>{const stage=safe(lead.status)||'New';count[stage]=(count[stage]??0)+1;return count;},{} as Record<string,number>);
   const opportunityPipeline=deals.reduce((obj,x)=>{
    const stage=safe(x.status)||'New';const current=obj[stage]??{count:0,value:0,weighted:0};
    const amount=n(x.amount),probability=n(x.probability);
    obj[stage]={count:current.count+1,value:current.value+amount,weighted:current.weighted+amount*probability/100};
    return obj;
   },{} as Record<string,{count:number;value:number;weighted:number}>);
   const salesByCustomer:Record<string,{count:number;totalMinor:number}>={};
   const salesByOpportunity:Record<string,{count:number;totalMinor:number}>={};
   const salesByEmployee:Record<string,{count:number;totalMinor:number}>={};
   const add=(target:Record<string,{count:number;totalMinor:number}>,key:string|null,count:number,value:bigint)=>{
    if(!key)return;const current=target[key]??{count:0,totalMinor:0};
    target[key]={count:current.count+Number(count),totalMinor:current.totalMinor+Number(value)};
   };
   for(const sale of sales){
    add(salesByCustomer,sale.customerId,sale.count,sale.totalMinor);
    add(salesByOpportunity,sale.opportunityId,sale.count,sale.totalMinor);
    add(salesByEmployee,sale.employeeId,sale.count,sale.totalMinor);
   }
   const campaignPerformance=campaigns.map(c=>{
    const cid=safe(c.id),sourcedLeads=leads.filter(lead=>safe(lead.campaignRecordId)===cid);
    const sourcedDeals=deals.filter(deal=>safe(deal.campaignRecordId)===cid);
    const completedSalesMinor=sourcedDeals.reduce((a,deal)=>a+(salesByOpportunity[safe(deal.id)]?.totalMinor??0),0);
    return {id:cid,name:safe(c.name)||'Campaign',leads:sourcedLeads.length,deals:sourcedDeals.length,completedSalesMinor,budget:n(c.budget),recordedSpend:n(c.actualSpend),channel:safe(c.channel),status:safe(c.status)};
   });
   return {asOf:new Date().toISOString(),period:'last_365_days_for_completed_sales',counts:{
     leads:leads.length,opportunities:deals.length,contacts:grouped.contacts.length,campaigns:campaigns.length,
     salespeople:grouped['sales-teams'].length,customers:customers.length,dueFollowUps:dueItems.size,
     openOpportunities:futureDeals.length,weightedPipeline:futureDeals.reduce((sum,deal)=>sum+n(deal.amount)*n(deal.probability)/100,0)
    },leadPipeline,opportunityPipeline,salesByCustomer,salesByOpportunity,salesByEmployee,campaignPerformance,
    sourceNote:'Completed sales use explicit customer, deal and salesperson links entered at checkout. Historical unlinked sales are not attributed automatically.'};
  });
 }
 @Get('people')
 async salesPeople(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Req() request:FastifyRequest) {
  const actor=await this.access(workspaceId,branchId,request,'crm.read');
  return this.db.runWithTenantContext({tenantId:workspaceId,userId:actor.userId},async()=>{
   const rows=await this.db.hrEmployee.findMany({where:{tenantId:workspaceId,branchId,employmentStatus:'active'},select:{
    id:true,fullName:true,jobTitle:true,department:true,userId:true,employeeNumber:true
   },orderBy:{fullName:'asc'},take:500});
   const members=await this.db.membership.findMany({where:{tenantId:workspaceId,status:'ACTIVE'},select:{userId:true,role:true}});
   const roleByUser=new Map(members.map(m=>[m.userId,m.role]));
   return rows.filter(row=>row.userId&&(hasPermission(roleByUser.get(row.userId)??'','sales.write')||hasPermission(roleByUser.get(row.userId)??'','crm.write'))).map(row=>({
     employeeId:row.id,userId:row.userId,name:row.fullName,title:row.jobTitle,department:row.department??'',employeeNumber:row.employeeNumber,
     role:roleByUser.get(row.userId!)??'sales'
   }));
  });
 }
 @Get('choices')
 async choices(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Req() request:FastifyRequest) {
  const actor=await this.access(workspaceId,branchId,request,'sales.write');
  return this.db.runWithTenantContext({tenantId:workspaceId,userId:actor.userId},async()=>{
   const [customers,opportunities,employees]=await Promise.all([
    this.rows(workspaceId,branchId,['customers']),this.rows(workspaceId,branchId,['opportunities']),
    this.db.hrEmployee.findMany({where:{tenantId:workspaceId,branchId,employmentStatus:'active'},select:{id:true,fullName:true,userId:true},take:500})
   ]);
   return {
    customers:customers.filter(row=>safe(recordData(row.data).status)!=='Inactive').map(row=>({id:row.recordId,name:safe(recordData(row.data).name),phone:safe(recordData(row.data).phone)})),
    opportunities:opportunities.filter(row=>safe(recordData(row.data).status)==='Won').map(row=>({id:row.recordId,name:safe(recordData(row.data).company),customerId:safe(recordData(row.data).customerRecordId),campaignId:safe(recordData(row.data).campaignRecordId)})),
    salespeople:employees.filter(x=>Boolean(x.userId)).map(x=>({id:x.id,name:x.fullName}))
   };
  });
 }

 @Get('activities/:moduleId/:recordId')
 async activity(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('moduleId') inputModule:string,
  @Param('recordId') recordId:string,@Req() request:FastifyRequest) {
  const actor=await this.access(workspaceId,branchId,request,'crm.read');const moduleId=allowedModule(inputModule);
  return this.db.runWithTenantContext({tenantId:workspaceId,userId:actor.userId},async()=>{
   const row=await this.db.moduleRecord.findUnique({where:{tenantId_branchId_moduleId_recordId:{tenantId:workspaceId,branchId,moduleId,recordId}}});
   if(!row)throw new NotFoundException('This customer record could not be found.');
   return this.db.$queryRaw<Array<{id:string;activityType:string;summary:string;happenedAt:Date;nextFollowUpOn:Date|null}>>`
    SELECT id,activity_type AS "activityType",summary,happened_at AS "happenedAt",next_follow_up_on AS "nextFollowUpOn"
    FROM crm_activities WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND module_id=${moduleId} AND record_id=${recordId}
    ORDER BY happened_at DESC LIMIT 100`;
  });
 }
 @Post('activities/:moduleId/:recordId')
 @UseGuards(CsrfGuard)
 async addActivity(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('moduleId') inputModule:string,
  @Param('recordId') recordId:string,@Body() body:Record<string,unknown>,@Req() request:FastifyRequest) {
  const actor=await this.access(workspaceId,branchId,request,'crm.write');
  const moduleId=allowedModule(inputModule),summary=safe(body.summary,1200),activityType=safe(body.activityType,32);
  if(!(ACTIVITY_TYPES as readonly string[]).includes(activityType))throw new BadRequestException('Select a valid customer activity.');
  if(!summary)throw new BadRequestException('Describe the interaction or follow-up.');
  const due=dateOnly(body.nextFollowUpOn);
  return this.db.runWithTenantContext({tenantId:workspaceId,userId:actor.userId},()=>this.db.$transaction(async tx=>{
   const row=await tx.moduleRecord.findUnique({where:{tenantId_branchId_moduleId_recordId:{tenantId:workspaceId,branchId,moduleId,recordId}}});
   if(!row)throw new NotFoundException('The customer record no longer exists.');
   const id=randomUUID();
   await tx.$executeRaw`INSERT INTO crm_activities(id,tenant_id,branch_id,module_id,record_id,activity_type,summary,next_follow_up_on,actor_user_id)
    VALUES(${id}::uuid,${workspaceId}::uuid,${branchId}::uuid,${moduleId},${recordId},${activityType},${summary},${due}::date,${actor.userId}::uuid)`;
   if(due)await tx.moduleRecord.update({where:{id:row.id},data:{data:{...recordData(row.data),nextFollowUpDate:due,nextAction:summary.slice(0,200),updatedAt:new Date().toISOString()} as any,version:{increment:1}}});
   await tx.auditEvent.create({data:{tenantId:workspaceId,actorUserId:actor.userId,action:'crm.activity.recorded',resourceType:moduleId,resourceId:id}});
   return {id,created:true};
  }));
 }
 @Post('convert/:moduleId/:recordId')
 @UseGuards(CsrfGuard)
 async convert(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('moduleId') inputModule:string,
  @Param('recordId') recordId:string,@Req() request:FastifyRequest) {
  const actor=await this.access(workspaceId,branchId,request,'crm.write');
  const moduleId=allowedModule(inputModule);
  if(!['leads','opportunities','contacts'].includes(moduleId))throw new BadRequestException('This item cannot be converted.');
  const targetModuleId=moduleId==='leads'?'opportunities':'customers';
  return this.db.runWithTenantContext({tenantId:workspaceId,userId:actor.userId},()=>this.db.$transaction(async tx=>{
   const source=await tx.moduleRecord.findUnique({where:{tenantId_branchId_moduleId_recordId:{tenantId:workspaceId,branchId,moduleId,recordId}}});
   if(!source)throw new NotFoundException('Source record not found.');
   const src=recordData(source.data);
   const stage=safe(src.status);
   // Look up an earlier conversion before validating its original stage, so repeat requests never produce duplicates.
   const existing=await tx.$queryRaw<Array<{targetId:string}>>`
    SELECT target_record_id AS "targetId" FROM module_record_links
    WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid
     AND source_module_id=${moduleId} AND source_record_id=${recordId} AND target_module_id=${targetModuleId} LIMIT 1`;
   if(existing.length)return {id:existing[0]!.targetId,moduleId:targetModuleId,existing:true};
   if(moduleId==='leads'&&!['Contacted','Qualified'].includes(stage))throw new ConflictException('Contact or qualify the lead before creating a deal.');
   if(moduleId==='opportunities'&&stage!=='Won')throw new ConflictException('Only a won opportunity can become a customer.');
   if(moduleId==='contacts'&&safe(src.partyType)==='Employee')throw new ConflictException('Employee contact details cannot be converted to customer records.');
   const name=safe(src.company)||safe(src.partyName)||safe(src.name)||safe(src.contactName);
   if(!name)throw new BadRequestException('A customer or business name is required.');
   if(targetModuleId==='customers'){
    const candidates=await tx.moduleRecord.findMany({where:{tenantId:workspaceId,branchId,moduleId:'customers'},select:{data:true,recordId:true},take:5000});
    const duplicate=candidates.find(c=>safe(recordData(c.data).name).toLowerCase()===name.toLowerCase());
    if(duplicate)throw new ConflictException('A customer with this name already exists. Open the existing customer instead of creating a duplicate.');
   }
   const id=randomUUID(),now=new Date().toISOString(),ref=(targetModuleId==='customers'?'CUS-':'OPP-')+id.slice(0,8).toUpperCase();
   const customer=targetModuleId==='customers';
   const values:Record<string,unknown>=customer?{
     customerCode:ref,name,customerType:'Company',phone:safe(src.phone),email:safe(src.email),
     billingAddress:safe(src.address)||safe(src.residentialAddress),paymentTerms:'Immediate',creditLimit:'0',openingBalance:'0',status:'Active',
     campaignRecordId:safe(src.campaignRecordId),sourceLeadRecordId:safe(src.sourceLeadRecordId),
   }:{
     opportunityCode:ref,company:name,contactName:safe(src.contactName),email:safe(src.email),phone:safe(src.phone),
     owner:safe(src.owner),assignedEmployeeId:safe(src.assignedEmployeeId),campaignRecordId:safe(src.campaignRecordId),
     createdDate:now.slice(0,10),expectedCloseDate:safe(src.expectedCloseDate)||now.slice(0,10),
     amount:String(n(src.estimatedValue)),probability:'50',nextAction:safe(src.nextAction),status:'Qualified',
   };
   const data={...values,id,updatedAt:now,sourceModuleId:moduleId,sourceRecordId:recordId,sourceReference:safe(src.leadCode)||safe(src.opportunityCode)||safe(src.contactCode)};
   await tx.moduleRecord.create({data:{tenantId:workspaceId,branchId,moduleId:targetModuleId,recordId:id,data:data as any}});
   await tx.$executeRaw`INSERT INTO module_record_links(id,tenant_id,branch_id,source_module_id,source_record_id,target_module_id,target_record_id,relation_type,created_by_user_id)
      VALUES(${randomUUID()}::uuid,${workspaceId}::uuid,${branchId}::uuid,${moduleId},${recordId},${targetModuleId},${id},'converted_to',${actor.userId}::uuid)
      ON CONFLICT DO NOTHING`;
   if(moduleId==='leads')await tx.moduleRecord.update({where:{id:source.id},data:{data:{...src,status:'Converted',convertedOpportunityId:id,updatedAt:now} as any,version:{increment:1}}});
   if(moduleId==='opportunities')await tx.moduleRecord.update({where:{id:source.id},data:{data:{...src,customerRecordId:id,updatedAt:now} as any,version:{increment:1}}});
   await tx.auditEvent.create({data:{tenantId:workspaceId,actorUserId:actor.userId,action:'crm.record.converted',resourceType:targetModuleId,resourceId:id}});
   return {id,moduleId:targetModuleId,existing:false};
  }));
 }
}

