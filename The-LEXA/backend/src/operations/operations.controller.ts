import { BadRequestException, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Put, Body, Req, UseGuards, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertBranchAccess } from '../authorization/branch-scope';
import { isWorkspaceAdministrator } from '../authorization/role-policy';
import { CsrfGuard } from '../core/csrf.guard';

function cookie(request:FastifyRequest,name:string):string|undefined{for(const p of (request.headers.cookie??'').split(';')){const at=p.indexOf('=');if(at<0||p.slice(0,at).trim()!==name)continue;try{return decodeURIComponent(p.slice(at+1).trim())}catch{return undefined;}}return undefined;}
function sha(value:string):string{return createHash('sha256').update(value).digest('hex');}

@Controller('workspaces/:workspaceId/branches/:branchId/operations')
export class OperationsController {
  constructor(private readonly prisma:PrismaService){}
  private async operator(request:FastifyRequest,workspaceId:string,branchId:string){
    const token=cookie(request,'lexa_session');if(!token)throw new UnauthorizedException('Sign in to continue.');
    const session=await this.prisma.session.findFirst({where:{tokenHash:sha(token),expiresAt:{gt:new Date()}},select:{userId:true}});if(!session)throw new UnauthorizedException('Session expired.');
    this.prisma.enterTenantContext(workspaceId,session.userId);
    const member=await this.prisma.membership.findUnique({where:{tenantId_userId:{tenantId:workspaceId,userId:session.userId}}});
    if(!member||member.status!=='ACTIVE')throw new NotFoundException('Workspace not found.');
    await assertBranchAccess(this.prisma,workspaceId,branchId,session.userId,member.role);
    if(!isWorkspaceAdministrator(member.role))throw new ForbiddenException('The Operations Centre is restricted to workspace administrators.');
    return {userId:session.userId,role:member.role};
  }

  @Get('overview')
  async overview(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Req() request:FastifyRequest){
    await this.operator(request,workspaceId,branchId);
    const db=await this.prisma.$queryRaw<any[]>`SELECT now() AS checked_at`;
    const result=await this.prisma.$queryRaw<any[]>`
      SELECT
       (SELECT count(*)::int FROM platform_jobs WHERE tenant_id=${workspaceId}::uuid AND status IN ('queued','retry_wait')) AS queued_jobs,
       (SELECT count(*)::int FROM platform_jobs WHERE tenant_id=${workspaceId}::uuid AND status='running') AS active_jobs,
       (SELECT count(*)::int FROM platform_jobs WHERE tenant_id=${workspaceId}::uuid AND status='dead_letter') AS dead_letter_jobs,
       (SELECT min(created_at) FROM platform_jobs WHERE tenant_id=${workspaceId}::uuid AND status IN ('queued','retry_wait')) AS oldest_queued_at,
       (SELECT count(*)::int FROM platform_attachments WHERE tenant_id=${workspaceId}::uuid AND status='pending_scan') AS pending_scans,
       (SELECT count(*)::int FROM platform_attachments WHERE tenant_id=${workspaceId}::uuid AND status='scan_failed') AS scan_failures,
       (SELECT max(last_seen_at) FROM platform_worker_heartbeats) AS last_worker_heartbeat,
       (SELECT details FROM platform_worker_heartbeats ORDER BY last_seen_at DESC LIMIT 1) AS worker_details,
       (SELECT count(*)::int FROM notification_email_deliveries WHERE tenant_id=${workspaceId}::uuid AND status IN ('failed','bounced','complained')) AS notification_email_failures,
       (SELECT count(*)::int FROM recurring_invoice_occurrences WHERE tenant_id=${workspaceId}::uuid AND status='failed') AS recurring_invoice_failures,
       (SELECT max(created_at) FROM platform_jobs WHERE tenant_id=${workspaceId}::uuid AND kind='backup' AND status='ready') AS last_successful_backup,
       (SELECT max(created_at) FROM platform_jobs WHERE tenant_id=${workspaceId}::uuid AND kind='restore' AND status='ready') AS last_restore_job,
       (SELECT count(*)::int FROM module_domain_events WHERE tenant_id=${workspaceId}::uuid AND outbox_status IN ('pending','failed') AND dead_letter_at IS NULL) AS outbox_pending,
       (SELECT count(*)::int FROM module_domain_events WHERE tenant_id=${workspaceId}::uuid AND dead_letter_at IS NOT NULL) AS outbox_dead_letter`;
    const row=result[0]||{};
    const incidents=await this.prisma.$queryRaw<Array<{count:bigint|number}>>`SELECT count(*)::bigint AS count FROM platform_alert_incidents WHERE tenant_id=${workspaceId}::uuid AND status IN ('open','acknowledged')`;
    return {checkedAt:db[0]?.checked_at,api:{status:'ok'},database:{status:'ok'},worker:{lastHeartbeat:row.last_worker_heartbeat||null,details:row.worker_details||{},redis:row.worker_details?.redis||'unknown',clamav:row.worker_details?.clamav||'unknown',r2Configured:row.worker_details?.r2Configured===true},queue:{queued:Number(row.queued_jobs||0),active:Number(row.active_jobs||0),deadLetter:Number(row.dead_letter_jobs||0),outboxPending:Number(row.outbox_pending||0),outboxDeadLetter:Number(row.outbox_dead_letter||0),oldestQueuedAt:row.oldest_queued_at||null},attachments:{pendingScan:Number(row.pending_scans||0),scanFailures:Number(row.scan_failures||0)},notifications:{emailFailures:Number(row.notification_email_failures||0)},recurringInvoices:{failures:Number(row.recurring_invoice_failures||0)},backup:{lastSuccessful:row.last_successful_backup||null},restore:{lastJob:row.last_restore_job||null},alerts:{open:Number(incidents[0]?.count||0)}};
  }

  @Get('alerts')
  async alerts(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Req() request:FastifyRequest){
    await this.operator(request,workspaceId,branchId);
    return this.prisma.$queryRaw<any[]>`SELECT id::text,branch_id::text,rule_key,severity,status,title,summary,evidence,occurrence_count,first_seen_at,last_seen_at,acknowledged_by_user_id::text,acknowledged_at,resolved_at,last_notification_at FROM platform_alert_incidents WHERE tenant_id=${workspaceId}::uuid ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,last_seen_at DESC LIMIT 100`;
  }

  @Post('alerts/:incidentId/acknowledge') @UseGuards(CsrfGuard)
  async acknowledge(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('incidentId') incidentId:string,@Req() request:FastifyRequest){
    const actor=await this.operator(request,workspaceId,branchId);
    const rows=await this.prisma.$queryRaw<any[]>`UPDATE platform_alert_incidents SET status='acknowledged',acknowledged_by_user_id=${actor.userId}::uuid,acknowledged_at=now(),updated_at=now() WHERE id=${incidentId}::uuid AND tenant_id=${workspaceId}::uuid AND status='open' RETURNING id::text,status`;
    if(!rows.length)throw new NotFoundException('Open alert incident was not found.');return rows[0];
  }

  @Post('alerts/:incidentId/resolve') @UseGuards(CsrfGuard)
  async resolve(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('incidentId') incidentId:string,@Req() request:FastifyRequest){
    await this.operator(request,workspaceId,branchId);
    const rows=await this.prisma.$queryRaw<any[]>`UPDATE platform_alert_incidents SET status='resolved',resolved_at=now(),updated_at=now() WHERE id=${incidentId}::uuid AND tenant_id=${workspaceId}::uuid AND status IN ('open','acknowledged') RETURNING id::text,status`;
    if(!rows.length)throw new NotFoundException('Unresolved alert incident was not found.');return rows[0];
  }

  @Get('alert-rules')
  async rules(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Req() request:FastifyRequest){
    await this.operator(request,workspaceId,branchId);
    return this.prisma.$queryRaw<any[]>`SELECT id::text,rule_key,title,severity,enabled,threshold,owner_role,runbook_path,cooldown_seconds,updated_at FROM platform_alert_rules WHERE tenant_id=${workspaceId}::uuid ORDER BY rule_key`;
  }


  @Get('email-deliveries')
  async emailDeliveries(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Req() request:FastifyRequest){
    await this.operator(request,workspaceId,branchId);
    return this.prisma.$queryRaw<any[]>`SELECT d.id::text,d.branch_id::text,d.status,d.attempts,d.max_attempts,d.last_error_code,d.last_error_summary,d.next_attempt_at,d.created_at,d.sent_at,d.delivered_at,n.title,n.event_type FROM notification_email_deliveries d JOIN business_notifications n ON n.id=d.notification_id AND n.tenant_id=d.tenant_id WHERE d.tenant_id=${workspaceId}::uuid AND d.status IN ('failed','retry_wait','bounced','complained','suppressed') ORDER BY d.created_at DESC LIMIT 100`;
  }

  @Post('email-deliveries/:deliveryId/retry') @UseGuards(CsrfGuard)
  async retryEmail(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('deliveryId') deliveryId:string,@Req() request:FastifyRequest){
    const actor=await this.operator(request,workspaceId,branchId);
    if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL)throw new ServiceUnavailableException('Configure RESEND_API_KEY and RESEND_FROM_EMAIL before retrying email delivery.');
    const rows=await this.prisma.$queryRaw<any[]>`UPDATE notification_email_deliveries SET status='pending',attempts=0,max_attempts=5,next_attempt_at=now(),last_error_code=NULL,last_error_summary=NULL,updated_at=now() WHERE id=${deliveryId}::uuid AND tenant_id=${workspaceId}::uuid AND status IN ('failed','retry_wait') RETURNING id::text,status`;
    if(!rows.length)throw new NotFoundException('A failed or retry-wait email delivery was not found. Bounced, complained and suppressed recipients cannot be retried.');
    await this.prisma.$executeRaw`INSERT INTO audit_events(id,tenant_id,branch_id,actor_user_id,action,resource_type,resource_id,metadata) VALUES(gen_random_uuid(),${workspaceId}::uuid,${branchId}::uuid,${actor.userId}::uuid,'notification.email.retry_requested','notification_email_delivery',${deliveryId},'{}'::jsonb)`;
    return rows[0];
  }

  @Put('alert-rules/:ruleKey') @UseGuards(CsrfGuard)
  async updateRule(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('ruleKey') ruleKey:string,@Body() body:any,@Req() request:FastifyRequest){
    const actor=await this.operator(request,workspaceId,branchId);
    if(!/^[a-z][a-z0-9_.-]{2,80}$/.test(ruleKey))throw new BadRequestException('Alert rule key is invalid.');
    const severity=String(body?.severity??'medium');if(!['low','medium','high','critical'].includes(severity))throw new BadRequestException('Alert severity is invalid.');
    const threshold=body?.threshold;if(!threshold||typeof threshold!=='object'||Array.isArray(threshold)||JSON.stringify(threshold).length>2000)throw new BadRequestException('Alert threshold must be a small JSON object.');
    const title=String(body?.title??'').trim();const runbook=String(body?.runbookPath??'').trim();if(!title||title.length>160||!runbook.startsWith('docs/workstream7/runbooks/'))throw new BadRequestException('Title or runbook path is invalid.');
    const cooldown=Number(body?.cooldownSeconds??900);if(!Number.isInteger(cooldown)||cooldown<60||cooldown>86400)throw new BadRequestException('Cooldown must be between 60 and 86,400 seconds.');
    const enabled=body?.enabled!==false;
    const existing=await this.prisma.$queryRaw<any[]>`UPDATE platform_alert_rules SET title=${title},severity=${severity},enabled=${enabled},threshold=${JSON.stringify(threshold)}::jsonb,runbook_path=${runbook},cooldown_seconds=${cooldown},updated_at=now() WHERE tenant_id=${workspaceId}::uuid AND rule_key=${ruleKey} RETURNING id::text,rule_key,title,severity,enabled,threshold,runbook_path,cooldown_seconds`;
    if(!existing.length)throw new NotFoundException('Alert rule was not found. Default alert rules are provisioned by the Increment 7 migration.');
    return existing[0];
  }
}
