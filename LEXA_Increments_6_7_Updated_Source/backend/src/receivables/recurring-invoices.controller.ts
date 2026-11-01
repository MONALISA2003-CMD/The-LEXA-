import { BadRequestException, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Body, Query, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertBranchAccess } from '../authorization/branch-scope';
import { hasPermission, isWorkspaceAdministrator } from '../authorization/role-policy';
import { CsrfGuard } from '../core/csrf.guard';
import { addCalendarDays, nextRecurringDate, type RecurrenceFrequency, type RecurrenceIntervalUnit } from './recurring-schedule-rules';

function cookie(request: FastifyRequest, name: string): string | undefined {
  for (const part of (request.headers.cookie ?? '').split(';')) { const at=part.indexOf('='); if(at<0||part.slice(0,at).trim()!==name)continue;try{return decodeURIComponent(part.slice(at+1).trim())}catch{return undefined;} }
  return undefined;
}
function sha(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function isUuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function date(value: unknown, label: string): string { if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new BadRequestException(`${label} must use YYYY-MM-DD.`);try{return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0,10)===value?value:(()=>{throw new Error()})()}catch{throw new BadRequestException(`${label} is not a valid calendar date.`)} }
function money(value: unknown, label: string, allowZero=true): number { const n=Number(value);if(!Number.isSafeInteger(n)||n<(allowZero?0:1)||n>2_000_000_000)throw new BadRequestException(`${label} must be a valid whole amount in minor units.`);return n; }
function quantity(value: unknown): number { const n=Number(value);if(!Number.isFinite(n)||n<=0||n>1_000_000||Math.round(n*1000)!==n*1000)throw new BadRequestException('Quantity must be positive with at most three decimal places.');return n; }
function text(value: unknown, label: string, max=180): string { if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new BadRequestException(`${label} is required and must be at most ${max} characters.`);return value.trim(); }
function lineTemplates(value: unknown): Array<Record<string, unknown>> {
  if(!Array.isArray(value)||!value.length||value.length>100)throw new BadRequestException('Add between 1 and 100 invoice line templates.');
  return value.map((raw,index)=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException(`Invoice line ${index+1} is invalid.`);
    const item=raw as Record<string,unknown>;const description=text(item.description,'Line description',500);
    const q=quantity(item.quantity);const unitPriceMinor=money(item.unitPriceMinor,'Unit price',true);const discountMinor=money(item.discountMinor??0,'Discount',true);
    if(discountMinor>Math.round(q*unitPriceMinor))throw new BadRequestException(`Discount on line ${index+1} exceeds its gross value.`);
    const productId=item.productId===undefined||item.productId===null||item.productId===''?null:text(item.productId,'Product ID',80);
    const taxCodeId=item.taxCodeId===undefined||item.taxCodeId===null||item.taxCodeId===''?null:text(item.taxCodeId,'Tax code ID',80);
    if(productId&&!isUuid(productId))throw new BadRequestException(`Product ID on line ${index+1} must be a valid UUID.`);
    if(taxCodeId&&!isUuid(taxCodeId))throw new BadRequestException(`Tax code ID on line ${index+1} must be a valid UUID.`);
    return {description,quantity:q,unitPriceMinor,discountMinor,productId,taxCodeId};
  });
}

@Controller('workspaces/:workspaceId/branches/:branchId/recurring-invoices')
export class RecurringInvoicesController {
  constructor(private readonly prisma: PrismaService) {}

  private async actor(request: FastifyRequest, workspaceId: string, branchId: string, write=false) {
    const token=cookie(request,'lexa_session');if(!token)throw new UnauthorizedException({code:'AUTH_REQUIRED',message:'Sign in to continue.'});
    const session=await this.prisma.session.findFirst({where:{tokenHash:sha(token),expiresAt:{gt:new Date()}},select:{userId:true}});if(!session)throw new UnauthorizedException({code:'SESSION_EXPIRED',message:'Sign in again.'});
    this.prisma.enterTenantContext(workspaceId,session.userId);
    const membership=await this.prisma.membership.findUnique({where:{tenantId_userId:{tenantId:workspaceId,userId:session.userId}}});
    if(!membership||membership.status!=='ACTIVE')throw new NotFoundException('Workspace not found.');
    await assertBranchAccess(this.prisma,workspaceId,branchId,session.userId,membership.role);
    if(!hasPermission(membership.role,write?'sales.write':'sales.read'))throw new ForbiddenException('Your role cannot manage recurring invoices.');
    return {userId:session.userId,role:membership.role,administrator:isWorkspaceAdministrator(membership.role)};
  }

  private async validateLineReferences(workspaceId:string, lines:Array<Record<string,unknown>>) {
    const productIds=[...new Set(lines.map(line=>line.productId).filter((id):id is string=>typeof id==='string'))];
    const taxCodeIds=[...new Set(lines.map(line=>line.taxCodeId).filter((id):id is string=>typeof id==='string'))];
    if(productIds.length){
      const rows=await this.prisma.$queryRaw<any[]>`SELECT id::text FROM products WHERE tenant_id=${workspaceId}::uuid AND active=true AND id=ANY(${productIds}::uuid[])`;
      if(rows.length!==productIds.length)throw new BadRequestException('Every referenced product must exist, be active and belong to this workspace.');
    }
    if(taxCodeIds.length){
      const rows=await this.prisma.$queryRaw<any[]>`SELECT id::text FROM tax_codes WHERE tenant_id=${workspaceId}::uuid AND active=true AND id=ANY(${taxCodeIds}::uuid[])`;
      if(rows.length!==taxCodeIds.length)throw new BadRequestException('Every referenced tax code must exist, be active and belong to this workspace.');
    }
  }

  private async customerSnapshot(workspaceId:string,branchId:string,customerRecordId:string) {
    const rows=await this.prisma.$queryRaw<any[]>`
      SELECT data FROM module_records WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid
       AND module_id='customers' AND record_id=${customerRecordId} LIMIT 1`;
    if(!rows.length)throw new NotFoundException('Customer was not found in this branch.');
    const data=rows[0].data&&typeof rows[0].data==='object'?rows[0].data:{};
    const name=String((data as any).name??(data as any).customerName??'').trim();
    if(!name)throw new BadRequestException('The selected customer record has no name snapshot.');
    return {name,phone:typeof (data as any).phone==='string'?(data as any).phone:null};
  }

  @Get()
  async list(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Query('status') status:string|undefined,@Req() request:FastifyRequest) {
    await this.actor(request,workspaceId,branchId);
    if(status&&!['active','paused','completed','cancelled','needs_attention'].includes(status))throw new BadRequestException('Schedule status filter is invalid.');
    return this.prisma.$queryRaw<any[]>`
      SELECT s.*,c.name AS branch_name,
       (SELECT count(*)::int FROM recurring_invoice_occurrences o WHERE o.tenant_id=s.tenant_id AND o.schedule_id=s.id) AS occurrence_total,
       (SELECT count(*)::int FROM recurring_invoice_occurrences o WHERE o.tenant_id=s.tenant_id AND o.schedule_id=s.id AND o.status='failed') AS failed_occurrences
      FROM recurring_invoice_schedules s JOIN branches c ON c.id=s.branch_id AND c.tenant_id=s.tenant_id
      WHERE s.tenant_id=${workspaceId}::uuid AND s.branch_id=${branchId}::uuid AND (${status??null}::text IS NULL OR s.status=${status??null})
      ORDER BY s.next_run_at ASC,s.created_at DESC LIMIT 200`;
  }

  @Post() @UseGuards(CsrfGuard)
  async create(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Body() body:any,@Req() request:FastifyRequest) {
    const actor=await this.actor(request,workspaceId,branchId,true);
    const customerRecordId=text(body?.customerRecordId,'Customer record ID',160);
    const customer=await this.customerSnapshot(workspaceId,branchId,customerRecordId);
    const currency=text(body?.currency??'UGX','Currency',3).toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw new BadRequestException('Currency must be an ISO 4217 code.');
    const lines=lineTemplates(body?.lineTemplates);
    await this.validateLineReferences(workspaceId,lines);
    const frequency=String(body?.frequency??'monthly') as RecurrenceFrequency;
    if(!['weekly','monthly','quarterly','annual','custom'].includes(frequency))throw new BadRequestException('Frequency is invalid.');
    const intervalCount=Number(body?.intervalCount??1);if(!Number.isInteger(intervalCount)||intervalCount<1||intervalCount>120)throw new BadRequestException('Interval count must be between 1 and 120.');
    const intervalUnit=body?.intervalUnit===undefined||body?.intervalUnit===null||body?.intervalUnit===''?null:String(body.intervalUnit) as RecurrenceIntervalUnit;
    if(frequency==='custom'&&!['day','week','month','year'].includes(String(intervalUnit)))throw new BadRequestException('Choose a valid unit for a custom interval.');
    if(frequency!=='custom'&&intervalUnit!==null)throw new BadRequestException('Only custom schedules accept an interval unit.');
    const startDate=date(body?.startDate,'Start date');const endDate=body?.endDate?date(body.endDate,'End date'):null;
    if(endDate&&endDate<startDate)throw new BadRequestException('End date must not be earlier than start date.');
    const dueDays=Number(body?.dueDays??0);if(!Number.isInteger(dueDays)||dueDays<0||dueDays>3650)throw new BadRequestException('Due days must be between 0 and 3650.');
    const maximumOccurrences=body?.maximumOccurrences===undefined||body?.maximumOccurrences===null||body?.maximumOccurrences===''?null:Number(body.maximumOccurrences);
    if(maximumOccurrences!==null&&(!Number.isInteger(maximumOccurrences)||maximumOccurrences<1||maximumOccurrences>10000))throw new BadRequestException('Maximum occurrences must be between 1 and 10,000.');
    const issueMode=body?.issueMode==='auto_issue'?'auto_issue':'draft';
    if(issueMode==='auto_issue'&&!actor.administrator)throw new ForbiddenException('Only a workspace administrator can enable automatic invoice issue.');
    const runAtLocalTime=String(body?.runAtLocalTime??'09:00');if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(runAtLocalTime))throw new BadRequestException('Run time must use 24-hour HH:mm format.');
    const branch=await this.prisma.branch.findFirst({where:{id:branchId,tenantId:workspaceId},select:{timezone:true}});
    const timezone=String(body?.scheduleTimezone??branch?.timezone??'Africa/Kampala');
    try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format(new Date());}catch{throw new BadRequestException('Schedule timezone is not recognised.');}
    const anchorDay=Number(body?.anchorDay??Number(startDate.slice(8,10)));if(!Number.isInteger(anchorDay)||anchorDay<1||anchorDay>31)throw new BadRequestException('Anchor day must be between 1 and 31.');
    const nextRunDate=startDate;
    const runAt=await this.prisma.$queryRaw<Array<{nextRunAt:Date}>>`SELECT (${nextRunDate}::date + ${runAtLocalTime}::time) AT TIME ZONE ${timezone} AS "nextRunAt"`;
    const notifyIds=Array.isArray(body?.notificationUserIds)?[...new Set(body.notificationUserIds.map((x:any)=>String(x)))]:[];
    if(notifyIds.some((id:string)=>!isUuid(id)))throw new BadRequestException('Notification recipient IDs must be valid UUIDs.');
    if(notifyIds.length>50)throw new BadRequestException('No more than 50 notification recipients may be selected.');
    if(notifyIds.length){const valid=await this.prisma.$queryRaw<any[]>`SELECT user_id FROM memberships WHERE tenant_id=${workspaceId}::uuid AND status='ACTIVE' AND user_id=ANY(${notifyIds}::uuid[])`;if(valid.length!==notifyIds.length)throw new BadRequestException('Every selected notification recipient must be an active workspace member.');}
    const id=randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO recurring_invoice_schedules
       (id,tenant_id,branch_id,customer_record_id,customer_name_snapshot,customer_phone_snapshot,currency,line_templates,
        frequency,interval_count,interval_unit,start_date,end_date,maximum_occurrences,due_days,issue_mode,schedule_timezone,
        run_at_local_time,anchor_day,next_run_date,next_run_at,notification_user_ids,created_by_user_id,updated_by_user_id)
      VALUES (${id}::uuid,${workspaceId}::uuid,${branchId}::uuid,${customerRecordId},${customer.name},${customer.phone},${currency},${JSON.stringify(lines)}::jsonb,
        ${frequency},${intervalCount},${intervalUnit},${startDate}::date,${endDate}::date,${maximumOccurrences},${dueDays},${issueMode},${timezone},
        ${runAtLocalTime}::time,${anchorDay},${nextRunDate}::date,${runAt[0].nextRunAt},${notifyIds}::uuid[],${actor.userId}::uuid,${actor.userId}::uuid)`;
    await this.prisma.$executeRaw`INSERT INTO audit_events(id,tenant_id,branch_id,actor_user_id,action,resource_type,resource_id,metadata)
      VALUES(gen_random_uuid(),${workspaceId}::uuid,${branchId}::uuid,${actor.userId}::uuid,'recurring_invoice.schedule_created','recurring_invoice_schedule',${id},${JSON.stringify({frequency,issueMode,intervalCount,intervalUnit})}::jsonb)`;
    const rows=await this.prisma.$queryRaw<any[]>`SELECT * FROM recurring_invoice_schedules WHERE tenant_id=${workspaceId}::uuid AND id=${id}::uuid`;
    return rows[0];
  }

  @Get(':scheduleId/preview')
  async preview(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('scheduleId') scheduleId:string,@Req() request:FastifyRequest) {
    await this.actor(request,workspaceId,branchId);
    const rows=await this.prisma.$queryRaw<any[]>`SELECT * FROM recurring_invoice_schedules WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND id=${scheduleId}::uuid`;
    const schedule=rows[0];if(!schedule)throw new NotFoundException('Recurring invoice schedule not found.');
    const lines=Array.isArray(schedule.line_templates)?schedule.line_templates:[];
    let subtotalMinor=0;let taxMinor=0;
    for(const line of lines){const gross=Math.round(Number(line.quantity)*Number(line.unitPriceMinor));const net=Math.max(0,gross-Number(line.discountMinor||0));subtotalMinor+=net;
      if(line.taxCodeId){const versions=await this.prisma.$queryRaw<any[]>`SELECT id,rate_basis_points,calculation_method,rounding_method,treatment,code_snapshot FROM tax_code_rule_versions WHERE tenant_id=${workspaceId}::uuid AND tax_code_id=${line.taxCodeId}::uuid AND status='approved' AND effective_from<=${schedule.next_run_date}::date AND (effective_to IS NULL OR effective_to>=${schedule.next_run_date}::date) ORDER BY version DESC LIMIT 1`;if(!versions.length)throw new ConflictException('A line tax code has no approved effective rule for the next invoice date.');const v=versions[0];taxMinor+=v.calculation_method==='inclusive'?Math.round(net*Number(v.rate_basis_points)/(10000+Number(v.rate_basis_points))):Math.round(net*Number(v.rate_basis_points)/10000);}}
    return {scheduleId,customerName:schedule.customer_name_snapshot,runDate:String(schedule.next_run_date).slice(0,10),dueDate:addCalendarDays(String(schedule.next_run_date).slice(0,10),Number(schedule.due_days)),currency:schedule.currency,subtotalMinor,taxMinor,totalMinor:subtotalMinor+taxMinor,issueMode:schedule.issue_mode,lines};
  }

  @Get(':scheduleId/occurrences')
  async occurrences(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('scheduleId') scheduleId:string,@Query('limit') limit?:string,@Req() request?:FastifyRequest) {
    await this.actor(request!,workspaceId,branchId);
    const schedule=await this.prisma.$queryRaw<any[]>`SELECT id FROM recurring_invoice_schedules WHERE id=${scheduleId}::uuid AND tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid`;
    if(!schedule.length)throw new NotFoundException('Recurring invoice schedule not found.');
    const n=Math.max(1,Math.min(100,Number(limit??50)||50));
    return this.prisma.$queryRaw<any[]>`SELECT * FROM recurring_invoice_occurrences WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND schedule_id=${scheduleId}::uuid ORDER BY scheduled_local_date DESC,created_at DESC LIMIT ${n}`;
  }

  @Patch(':scheduleId') @UseGuards(CsrfGuard)
  async update(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('scheduleId') scheduleId:string,@Body() body:any,@Req() request:FastifyRequest) {
    const actor=await this.actor(request,workspaceId,branchId,true);
    const existing=await this.prisma.$queryRaw<any[]>`SELECT * FROM recurring_invoice_schedules WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND id=${scheduleId}::uuid`;
    if(!existing.length)throw new NotFoundException('Recurring invoice schedule not found.');
    const current=existing[0];
    if(current.status==='cancelled'||current.status==='completed')throw new ConflictException('Completed or cancelled schedules cannot be edited.');
    if(current.issue_mode==='auto_issue'&&!actor.administrator)throw new ForbiddenException('Only an administrator can edit an automatic-issue schedule.');
    if(body?.issueMode==='auto_issue'&&!actor.administrator)throw new ForbiddenException('Only an administrator can enable automatic issue.');
    const customerRecordId=body.customerRecordId?text(body.customerRecordId,'Customer record ID',160):String(current.customer_record_id);
    const customer=body.customerRecordId?await this.customerSnapshot(workspaceId,branchId,customerRecordId):{name:current.customer_name_snapshot,phone:current.customer_phone_snapshot};
    const currency=String(body.currency??current.currency).toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw new BadRequestException('Currency must be an ISO 4217 code.');
    const lines=body.lineTemplates?lineTemplates(body.lineTemplates):current.line_templates;
    await this.validateLineReferences(workspaceId,lines as Array<Record<string,unknown>>);
    const frequency=String(body.frequency??current.frequency) as RecurrenceFrequency;
    if(!['weekly','monthly','quarterly','annual','custom'].includes(frequency))throw new BadRequestException('Frequency is invalid.');
    const intervalCount=Number(body.intervalCount??current.interval_count);if(!Number.isInteger(intervalCount)||intervalCount<1||intervalCount>120)throw new BadRequestException('Interval count must be between 1 and 120.');
    const intervalUnit=body.intervalUnit===undefined?(current.interval_unit??null):(body.intervalUnit===null||body.intervalUnit===''?null:String(body.intervalUnit) as RecurrenceIntervalUnit);
    if(frequency==='custom'&&!['day','week','month','year'].includes(String(intervalUnit)))throw new BadRequestException('Choose a valid unit for a custom interval.');
    if(frequency!=='custom'&&intervalUnit!==null)throw new BadRequestException('Only custom schedules accept an interval unit.');
    const startDate=body.startDate?date(body.startDate,'Start date'):String(current.next_run_date).slice(0,10);
    const currentNext=String(current.next_run_date).slice(0,10);
    if(Number(current.occurrence_count)>0&&startDate<currentNext)throw new ConflictException('A schedule with generated invoices cannot be moved before its next pending occurrence.');
    const endDate=body.endDate===undefined?(current.end_date?String(current.end_date).slice(0,10):null):(body.endDate?date(body.endDate,'End date'):null);
    if(endDate&&endDate<startDate)throw new BadRequestException('End date must not be earlier than the next run date.');
    const maximumOccurrences=body.maximumOccurrences===undefined?(current.maximum_occurrences===null?null:Number(current.maximum_occurrences)):(body.maximumOccurrences===null||body.maximumOccurrences===''?null:Number(body.maximumOccurrences));
    if(maximumOccurrences!==null&&(!Number.isInteger(maximumOccurrences)||maximumOccurrences<1||maximumOccurrences>10000))throw new BadRequestException('Maximum occurrences must be between 1 and 10,000.');
    if(maximumOccurrences!==null&&maximumOccurrences<=Number(current.occurrence_count))throw new ConflictException('Maximum occurrences must be greater than the number already generated.');
    const dueDays=Number(body.dueDays??current.due_days);if(!Number.isInteger(dueDays)||dueDays<0||dueDays>3650)throw new BadRequestException('Due days must be between 0 and 3650.');
    const issueMode=body.issueMode==='auto_issue'?'auto_issue':body.issueMode==='draft'?'draft':String(current.issue_mode);
    const scheduleTimezone=String(body.scheduleTimezone??current.schedule_timezone);
    try{new Intl.DateTimeFormat('en',{timeZone:scheduleTimezone}).format(new Date());}catch{throw new BadRequestException('Schedule timezone is not recognised.');}
    const runAtLocalTime=String(body.runAtLocalTime??String(current.run_at_local_time).slice(0,5));if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(runAtLocalTime))throw new BadRequestException('Run time must use 24-hour HH:mm format.');
    const anchorDay=Number(body.anchorDay??current.anchor_day);if(!Number.isInteger(anchorDay)||anchorDay<1||anchorDay>31)throw new BadRequestException('Anchor day must be between 1 and 31.');
    const notificationUserIds=body.notificationUserIds===undefined?(current.notification_user_ids||[]):[...new Set(Array.isArray(body.notificationUserIds)?body.notificationUserIds.map((x:any)=>String(x)):[])];
    if(!Array.isArray(notificationUserIds)||notificationUserIds.length>50||notificationUserIds.some((id:string)=>!isUuid(id)))throw new BadRequestException('Notification recipient IDs must be valid UUIDs (maximum 50).');
    if(notificationUserIds.length){const valid=await this.prisma.$queryRaw<any[]>`SELECT user_id FROM memberships WHERE tenant_id=${workspaceId}::uuid AND status='ACTIVE' AND user_id=ANY(${notificationUserIds}::uuid[])`;if(valid.length!==notificationUserIds.length)throw new BadRequestException('Every selected notification recipient must be an active workspace member.');}
    const runAt=await this.prisma.$queryRaw<Array<{nextRunAt:Date}>>`SELECT (${startDate}::date + ${runAtLocalTime}::time) AT TIME ZONE ${scheduleTimezone} AS "nextRunAt"`;
    await this.prisma.$executeRaw`UPDATE recurring_invoice_schedules SET customer_record_id=${customerRecordId},customer_name_snapshot=${customer.name},customer_phone_snapshot=${customer.phone},currency=${currency},line_templates=${JSON.stringify(lines)}::jsonb,frequency=${frequency},interval_count=${intervalCount},interval_unit=${intervalUnit},start_date=${startDate}::date,end_date=${endDate}::date,maximum_occurrences=${maximumOccurrences},due_days=${dueDays},issue_mode=${issueMode},schedule_timezone=${scheduleTimezone},run_at_local_time=${runAtLocalTime}::time,anchor_day=${anchorDay},next_run_date=${startDate}::date,next_run_at=${runAt[0].nextRunAt},notification_user_ids=${notificationUserIds}::uuid[],updated_by_user_id=${actor.userId}::uuid,updated_at=now() WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND id=${scheduleId}::uuid`;
    await this.prisma.$executeRaw`INSERT INTO audit_events(id,tenant_id,branch_id,actor_user_id,action,resource_type,resource_id,metadata) VALUES(gen_random_uuid(),${workspaceId}::uuid,${branchId}::uuid,${actor.userId}::uuid,'recurring_invoice.schedule_updated','recurring_invoice_schedule',${scheduleId},${JSON.stringify({frequency,issueMode,intervalCount,intervalUnit})}::jsonb)`;
    return {id:scheduleId,updated:true,issueMode};
  }

  @Post(':scheduleId/pause') @UseGuards(CsrfGuard)
  async pause(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('scheduleId') scheduleId:string,@Req() request:FastifyRequest) {return this.setStatus(workspaceId,branchId,scheduleId,request,'paused');}
  @Post(':scheduleId/resume') @UseGuards(CsrfGuard)
  async resume(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('scheduleId') scheduleId:string,@Req() request:FastifyRequest) {return this.setStatus(workspaceId,branchId,scheduleId,request,'active');}
  @Post(':scheduleId/cancel') @UseGuards(CsrfGuard)
  async cancel(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('scheduleId') scheduleId:string,@Req() request:FastifyRequest) {return this.setStatus(workspaceId,branchId,scheduleId,request,'cancelled');}
  private async setStatus(workspaceId:string,branchId:string,scheduleId:string,request:FastifyRequest,status:'paused'|'active'|'cancelled') {
    const actor=await this.actor(request,workspaceId,branchId,true);
    const rows=await this.prisma.$queryRaw<any[]>`UPDATE recurring_invoice_schedules SET status=${status},updated_by_user_id=${actor.userId}::uuid,updated_at=now() WHERE id=${scheduleId}::uuid AND tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND status IN ('active','paused','needs_attention') RETURNING id::text,status,next_run_date AS "nextRunDate"`;
    if(!rows.length)throw new NotFoundException('An active or paused schedule was not found.');
    await this.prisma.$executeRaw`INSERT INTO audit_events(id,tenant_id,branch_id,actor_user_id,action,resource_type,resource_id,metadata) VALUES(gen_random_uuid(),${workspaceId}::uuid,${branchId}::uuid,${actor.userId}::uuid,${'recurring_invoice.'+status},'recurring_invoice_schedule',${scheduleId},'{}'::jsonb)`;
    return rows[0];
  }

  @Post(':scheduleId/occurrences/:occurrenceId/retry') @UseGuards(CsrfGuard)
  async retry(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('scheduleId') scheduleId:string,@Param('occurrenceId') occurrenceId:string,@Req() request:FastifyRequest) {
    const actor=await this.actor(request,workspaceId,branchId,true);
    const rows=await this.prisma.$queryRaw<any[]>`SELECT o.id::text,o.status,o.scheduled_local_date,s.status AS schedule_status,s.issue_mode FROM recurring_invoice_occurrences o JOIN recurring_invoice_schedules s ON s.id=o.schedule_id AND s.tenant_id=o.tenant_id WHERE o.id=${occurrenceId}::uuid AND o.schedule_id=${scheduleId}::uuid AND o.tenant_id=${workspaceId}::uuid AND o.branch_id=${branchId}::uuid FOR UPDATE`;
    const row=rows[0];if(!row)throw new NotFoundException('Occurrence not found.');if(row.status!=='failed')throw new ConflictException('Only a failed occurrence can be retried.');if(['cancelled','completed'].includes(String(row.schedule_status)))throw new ConflictException('A cancelled or completed schedule cannot be retried.');if(row.issue_mode==='auto_issue'&&!actor.administrator)throw new ForbiddenException('Only an administrator can retry an automatic-issue invoice occurrence.')
    await this.prisma.$executeRaw`UPDATE recurring_invoice_occurrences SET status='queued',error_summary=NULL,updated_at=now() WHERE id=${occurrenceId}::uuid AND tenant_id=${workspaceId}::uuid`;
    await this.prisma.$executeRaw`UPDATE recurring_invoice_schedules SET status='active',next_run_date=${String(row.scheduled_local_date).slice(0,10)}::date,next_run_at=now(),last_error_summary=NULL,updated_by_user_id=${actor.userId}::uuid,updated_at=now() WHERE id=${scheduleId}::uuid AND tenant_id=${workspaceId}::uuid AND status IN ('needs_attention','active','paused')`;
    return {id:occurrenceId,status:'queued'};
  }
}
