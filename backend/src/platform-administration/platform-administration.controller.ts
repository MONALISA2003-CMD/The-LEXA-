import {
  BadRequestException, ConflictException, Controller, ForbiddenException, Get, NotFoundException,
  Param, Post, Body, Query, Req, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CsrfGuard } from '../core/csrf.guard';
import {
  SUBSCRIPTION_PRICE_UGX, SUBSCRIPTION_DAYS, daysRemaining, hasOperationalAccess,
  nextPaidPeriod, normalizedTransactionReference, safePaymentMethod,
} from './subscription-policy';
import { isPlatformRecordId } from './platform-record-id';

type PlatformRole = 'super_admin' | 'billing_manager' | 'support_agent' | 'operations_manager' | 'auditor';
type Actor = { userId: string; role: PlatformRole; mfaEnabled: boolean };
type SessionActor = { userId: string; businessRole?: string };
type SqlTx = {
  $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
};
type SubscriptionRow = { tenant_id: string; business_name: string; owner_email: string | null; status: 'pending'|'active'|'suspended'|'legacy'|'archived'; paid_through: Date | null; activated_at: Date | null; created_at: Date };
const cookie = (request: FastifyRequest, name: string): string | undefined => {
  for (const item of (request.headers.cookie ?? '').split(';')) {
    const index = item.indexOf('=');
    if (index > 0 && item.slice(0, index).trim() === name) {
      try { return decodeURIComponent(item.slice(index + 1).trim()); } catch { return undefined; }
    }
  }
  return undefined;
};
const field = (value: unknown, name: string, max = 300): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`${name} must contain 1-${max} characters.`);
  return value.trim();
};
const opt = (value: unknown, name: string, max = 500): string | null => {
  if (value === null || value === undefined || value === '') return null;
  return field(value, name, max);
};
const bodyObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('A valid form is required.');
  return value as Record<string, unknown>;
};
const key = (value: string): string => { if (!isPlatformRecordId(value)) throw new BadRequestException('Invalid record identifier.'); return value; };
const pageSize = (value: unknown): number => { const n = Number(value ?? 25); return Number.isInteger(n) ? Math.max(1, Math.min(n, 100)) : 25; };
const pageOffset = (value: unknown): number => { const n = Number(value ?? 0); return Number.isInteger(n) ? Math.max(0, Math.min(n, 50_000)) : 0; };

/** Session cookies are never accepted as proof of a platform-admin role. */
class PlatformIdentity {
  constructor(protected readonly prisma: PrismaService) {}
  protected async session(request: FastifyRequest): Promise<SessionActor> {
    const raw = cookie(request, 'lexa_session');
    if (!raw || raw.length > 512) throw new UnauthorizedException('Sign in to LEXA to continue.');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    const s = await this.prisma.session.findFirst({ where: { tokenHash, expiresAt: { gt: new Date() } }, select: { userId: true, user: { select: { mustChangePassword: true } } } });
    if (!s) throw new UnauthorizedException('Session expired. Sign in again.');
    if (s.user.mustChangePassword) throw new ForbiddenException('Change your temporary password before proceeding.');
    return { userId: s.userId };
  }
  protected async adminSession(request: FastifyRequest): Promise<{ userId: string }> {
    const raw = cookie(request, 'lexa_admin_session');
    if (!raw || raw.length > 256) throw new UnauthorizedException('Sign in to LEXA Control Centre.');
    const hash = createHash('sha256').update(raw).digest('hex');
    const rows = await this.prisma.$queryRaw<Array<{admin_user_id:string}>>`
      SELECT admin_user_id FROM platform_admin_active_session(${hash})`;
    if (!rows[0]) throw new UnauthorizedException('Administrator session expired.');
    return {userId:rows[0].admin_user_id};
  }
  protected async admin(request: FastifyRequest, roles: PlatformRole[] = ['super_admin','billing_manager','support_agent','operations_manager','auditor']): Promise<Actor> {
    const session = await this.adminSession(request);
    return this.prisma.runWithTenantContext({ userId: session.userId }, async () => {
      const rows = await this.prisma.$queryRaw<Array<{ role: PlatformRole }>>`
        SELECT role FROM platform_admin_members WHERE user_id=${session.userId}::uuid AND enabled=true LIMIT 1`;
      if (!rows[0] || !roles.includes(rows[0].role)) throw new ForbiddenException('Platform administration is restricted to authorized LEXA staff.');
      // MFA is opt-in during initial five-seat setup. All administrator accounts
      // still require a private email invitation, an independent password and a
      // short-lived admin session; a customer session never grants admin rights.
      return { userId: session.userId, role: rows[0].role, mfaEnabled: false };
    });
  }
  protected async workspaceOwner(request: FastifyRequest, workspaceId: string): Promise<SessionActor> {
    key(workspaceId);
    const session = await this.session(request);
    await this.prisma.runWithTenantContext({ tenantId: workspaceId, userId: session.userId }, async () => {
      const membership = await this.prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: workspaceId, userId: session.userId } }, select: { status: true, role: true } });
      if (!membership || membership.status !== 'ACTIVE') throw new NotFoundException('Business not found.');
      if (!['owner','admin','administrator','owner_administrator'].includes(membership.role)) throw new ForbiddenException('Only a business administrator may manage its LEXA subscription.');
    });
    return session;
  }
  protected async workspaceMember(request: FastifyRequest, workspaceId: string): Promise<SessionActor> {
    key(workspaceId);
    const session = await this.session(request);
    const role = await this.prisma.runWithTenantContext({ tenantId: workspaceId, userId: session.userId }, async () => {
      const membership = await this.prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: workspaceId, userId: session.userId } }, select: { status: true, role: true } });
      if (!membership || membership.status !== 'ACTIVE') throw new NotFoundException('Business not found.');
      return membership.role;
    });
    return { ...session, businessRole: role };
  }
}

@Controller('workspaces/:workspaceId/platform-billing')
export class BusinessPlatformBillingController extends PlatformIdentity {
  constructor(prisma: PrismaService) { super(prisma); }

  @Get('status')
  async status(@Param('workspaceId') workspaceId: string, @Req() request: FastifyRequest) {
    const actor = await this.workspaceMember(request, workspaceId);
    return this.prisma.runWithTenantContext({ tenantId: workspaceId, userId: actor.userId }, async () => {
      const accounts = await this.prisma.$queryRaw<SubscriptionRow[]>`SELECT tenant_id::text,business_name,owner_email,status,paid_through,activated_at,created_at FROM platform_subscriptions WHERE tenant_id=${workspaceId}::uuid LIMIT 1`;
      const account = accounts[0];
      if (!account) throw new ForbiddenException('Contact LEXA support to finish your subscription setup.');
      const canManageBilling = account.status !== 'archived' && account.status !== 'suspended' && ['owner','admin','administrator','owner_administrator'].includes(actor.businessRole||'');
      const latest = canManageBilling ? await this.prisma.$queryRaw<Array<{ id: string; payment_reference: string; status: string; created_at: Date; review_note: string|null }>>`
        SELECT id::text,payment_reference,status,created_at,review_note FROM platform_payment_claims WHERE tenant_id=${workspaceId}::uuid ORDER BY created_at DESC LIMIT 1` : [];
      const now = new Date();
      const numbers = (process.env.LEXA_BILLING_WHATSAPP_NUMBERS || '256749064282,256703953711')
        .split(',').map(n => n.replace(/[^0-9]/g, '')).filter(n => n.length >= 8 && n.length <= 15).slice(0, 2);
      return {
        workspaceId, businessName: account.business_name, status: account.status, canManageBilling,
        operational: hasOperationalAccess(account.status, account.paid_through, now),
        expiresAt: account.paid_through, remainingDays: daysRemaining(account.paid_through,now),
        priceUGX: SUBSCRIPTION_PRICE_UGX, periodDays: SUBSCRIPTION_DAYS,
        paymentInstructions: process.env.LEXA_BILLING_INSTRUCTIONS || 'Contact LEXA administration for official payment details before sending money.',
        whatsappNumber: numbers[0] ?? null, whatsappNumbers: numbers,
        supportPhone: process.env.LEXA_BILLING_SUPPORT_PHONE || '',
        latestPayment: latest[0] ?? null,
      };
    });
  }

  @Get('payments')
  async payments(@Param('workspaceId') workspaceId: string, @Req() request: FastifyRequest) {
    const actor = await this.workspaceOwner(request, workspaceId);
    return this.prisma.runWithTenantContext({ tenantId: workspaceId, userId: actor.userId }, () => this.prisma.$queryRaw`
      SELECT id::text,payment_reference,method,transaction_reference,claim_message,amount_ugx,status,review_note,reviewed_at,created_at
      FROM platform_payment_claims WHERE tenant_id=${workspaceId}::uuid ORDER BY created_at DESC LIMIT 30`);
  }

  @Post('payments') @UseGuards(CsrfGuard)
  async submitPayment(@Param('workspaceId') workspaceId: string, @Body() input: unknown, @Req() request: FastifyRequest) {
    const actor = await this.workspaceOwner(request, workspaceId);
    const data = bodyObject(input);
    let method: string;
    try { method = safePaymentMethod(data.method); } catch { throw new BadRequestException('Choose a valid payment method.'); }
    const transactionReference = opt(data.transactionReference, 'Transaction reference', 120);
    const claimMessage = opt(data.message, 'Payment message', 1000);
    if (!transactionReference && !claimMessage) throw new BadRequestException('Provide your transaction reference or a message identifying the payment.');
    const reference = transactionReference ? normalizedTransactionReference(transactionReference) : null;
    return this.prisma.runWithTenantContext({ tenantId: workspaceId, userId: actor.userId }, async () => {
      const accounts = await this.prisma.$queryRaw<Array<{status:string}>>`SELECT status FROM platform_subscriptions WHERE tenant_id=${workspaceId}::uuid`;
      if (!accounts.length) throw new NotFoundException('Subscription not found.');
      if (accounts[0].status === 'suspended' || accounts[0].status === 'archived') throw new ForbiddenException('This account is unavailable. Please contact LEXA support.');
      if (accounts[0].status === 'legacy') throw new ForbiddenException('This protected existing account is not yet enrolled in paid billing. Contact LEXA administration before submitting a payment.');
      const open = await this.prisma.$queryRaw<Array<{id:string,payment_reference:string}>>`
        SELECT id::text,payment_reference FROM platform_payment_claims WHERE tenant_id=${workspaceId}::uuid AND status='submitted' LIMIT 1`;
      if (open[0]) return { accepted: true, duplicate: true, ...open[0] };
      const recent = await this.prisma.$queryRaw<Array<{count:number}>>`SELECT count(*)::int AS count FROM platform_payment_claims WHERE tenant_id=${workspaceId}::uuid AND created_at>=now()-interval '24 hours'`;
      if ((recent[0]?.count ?? 0) >= 5) throw new ConflictException('Too many payment submissions today. Contact LEXA support for assistance.');
      const id = randomUUID();
      const paymentReference = `LXA-${randomUUID().replace(/-/g,'').slice(0,16).toUpperCase()}`;
      try {
        await this.prisma.$executeRaw`
          INSERT INTO platform_payment_claims(id,tenant_id,payment_reference,method,transaction_reference,claim_message,submitted_by)
          VALUES(${id}::uuid,${workspaceId}::uuid,${paymentReference},${method},${reference},${claimMessage},${actor.userId}::uuid)`;
      } catch (err) {
        if (String(err).includes('unique') || String(err).includes('23505')) throw new ConflictException('Another payment submission is already under review. Refresh your payment status.');
        throw err;
      }
      return { accepted: true, id, paymentReference, status: 'submitted' };
    });
  }

  @Get('support')
  async support(@Param('workspaceId') workspaceId: string, @Req() request: FastifyRequest) {
    const actor = await this.workspaceMember(request, workspaceId);
    return this.prisma.runWithTenantContext({ tenantId: workspaceId, userId: actor.userId }, () => this.prisma.$queryRaw`
      SELECT id::text,subject,description,status,priority,created_at,updated_at FROM platform_support_cases WHERE tenant_id=${workspaceId}::uuid ORDER BY created_at DESC LIMIT 30`);
  }

  @Post('support') @UseGuards(CsrfGuard)
  async supportRequest(@Param('workspaceId') workspaceId: string, @Body() input: unknown, @Req() request: FastifyRequest) {
    const actor = await this.workspaceMember(request, workspaceId);
    const b = bodyObject(input), id = randomUUID();
    const subject = field(b.subject,'Subject',140), description = field(b.description,'Description',2000);
    const recent = await this.prisma.runWithTenantContext({ tenantId: workspaceId, userId: actor.userId }, () => this.prisma.$queryRaw<Array<{count:number}>>`SELECT count(*)::int AS count FROM platform_support_cases WHERE tenant_id=${workspaceId}::uuid AND created_at>=now()-interval '24 hours'`);
    if ((recent[0]?.count ?? 0) >= 10) throw new ConflictException('Too many support requests today. Please contact LEXA directly.');
    await this.prisma.runWithTenantContext({ tenantId: workspaceId, userId: actor.userId }, () => this.prisma.$executeRaw`
      INSERT INTO platform_support_cases(id,tenant_id,opened_by,subject,description)
      VALUES(${id}::uuid,${workspaceId}::uuid,${actor.userId}::uuid,${subject},${description}`);
    return { id, status: 'open' };
  }
}

@Controller('platform-admin')
export class PlatformAdministrationController extends PlatformIdentity {
  constructor(prisma: PrismaService) { super(prisma); }

  @Get('profile')
  async profile(@Req() request: FastifyRequest) {
    const actor = await this.admin(request);
    return { adminUserId: actor.userId, role: actor.role, mfaEnabled: actor.mfaEnabled, requiresMfa: false, priceUGX: SUBSCRIPTION_PRICE_UGX, periodDays: SUBSCRIPTION_DAYS };
  }

  @Get('overview')
  async overview(@Req() request: FastifyRequest) {
    const actor = await this.admin(request,['super_admin','billing_manager','auditor']);
    return this.prisma.runWithTenantContext({ userId: actor.userId }, async () => {
      const [counts] = await this.prisma.$queryRaw<Array<{businesses:number;active:number;pending:number;legacy:number;archived:number;expiring:number;expired:number}>>`
        SELECT count(*)::int AS businesses,
          count(*) FILTER(WHERE status='active' AND paid_through>now())::int AS active,
          count(*) FILTER(WHERE status='pending')::int AS pending,
          count(*) FILTER(WHERE status='legacy')::int AS legacy,
          count(*) FILTER(WHERE status='archived')::int AS archived,
          count(*) FILTER(WHERE status='active' AND paid_through>now() AND paid_through<=now()+interval '7 days')::int AS expiring,
          count(*) FILTER(WHERE status='active' AND paid_through<=now())::int AS expired
        FROM platform_subscriptions`;
      const [claims] = await this.prisma.$queryRaw<Array<{submitted:number;cash_collected:number;last_30_days:number}>>`
        SELECT (SELECT count(*)::int FROM platform_payment_claims WHERE status='submitted') AS submitted,
          COALESCE((SELECT sum(amount_ugx)::double precision FROM platform_subscription_periods),0) AS cash_collected,
          COALESCE((SELECT sum(amount_ugx)::double precision FROM platform_subscription_periods WHERE created_at>=now()-interval '30 days'),0) AS last_30_days`;
      const pendingSupport = await this.prisma.$queryRaw<Array<{count:number}>>`
        SELECT count(*)::int AS count FROM platform_support_cases WHERE status!='resolved'`;
      const incidents = await this.prisma.$queryRaw<Array<{critical:number;high:number}>>`
        SELECT count(*) FILTER(WHERE status!='resolved' AND severity='critical')::int AS critical,
          count(*) FILTER(WHERE status!='resolved' AND severity='high')::int AS high FROM platform_incidents`;
      return { checkedAt: new Date().toISOString(), subscriptionPriceUGX: SUBSCRIPTION_PRICE_UGX, businesses: counts,
        payments: claims, openSupportCases: pendingSupport[0]?.count ?? 0, incidentAlerts: incidents[0] ?? {critical:0,high:0} };
    });
  }

  @Get('businesses')
  async businesses(@Req() request: FastifyRequest, @Query('q') query?: string, @Query('limit') limit?:string, @Query('offset') offset?:string) {
    const actor = await this.admin(request,['super_admin','billing_manager','support_agent','auditor']);
    const needle = typeof query==='string' ? query.slice(0,120).trim() : '';
    return this.prisma.runWithTenantContext({ userId: actor.userId }, () => this.prisma.$queryRaw`
      SELECT tenant_id::text,business_name,owner_email,status,activated_at,paid_through,created_at
      FROM platform_subscriptions
      WHERE (${needle}='' OR business_name ILIKE '%'||${needle}||'%' OR owner_email ILIKE '%'||${needle}||'%')
      ORDER BY created_at DESC LIMIT ${pageSize(limit)} OFFSET ${pageOffset(offset)}`);
  }

  /** Latest observed activity across active, pending, suspended and archived accounts.
   * An IP address can be a proxy egress address; it is not proof of a bypass.
   * Never exposes session cookies, login secrets, browser fingerprints or ERP rows.
   */
  @Get('activity')
  async activity(@Req() request:FastifyRequest, @Query('limit') limit?:string, @Query('offset') offset?:string) {
    const actor=await this.admin(request,['super_admin','operations_manager','auditor']);
    return this.prisma.runWithTenantContext({userId:actor.userId},()=>this.prisma.$queryRaw`
      SELECT a.tenant_id::text,a.user_id::text,s.business_name,s.status AS subscription_status,
        CASE WHEN ${actor.role}='super_admin' THEN d.email ELSE NULL END AS email,
        CASE WHEN ${actor.role}='super_admin' THEN d.display_name ELSE NULL END AS display_name,
        a.last_seen_at,a.observed_ip::text AS observed_ip,
        a.previous_ip::text AS previous_ip,a.ip_changed_at,a.client_label,a.request_count,a.last_activity_kind,
        (a.last_seen_at>now()-interval '5 minutes') AS online_recently,
        ((s.status IN ('pending','suspended','archived') AND a.last_activity_kind='business_operation'
            AND a.last_seen_at>s.updated_at)
         OR (s.status='active' AND s.paid_through IS NOT NULL
            AND a.last_activity_kind='business_operation' AND a.last_seen_at>s.paid_through)) AS review_restricted_activity
      FROM platform_account_activity a JOIN platform_subscriptions s ON s.tenant_id=a.tenant_id
      LEFT JOIN platform_user_directory d ON d.tenant_id=a.tenant_id AND d.user_id=a.user_id
      ORDER BY a.last_seen_at DESC LIMIT ${pageSize(limit)} OFFSET ${pageOffset(offset)}
    `);
  }

  @Get('businesses/:tenantId')
  async business(@Req() request: FastifyRequest,@Param('tenantId') tenantId:string) {
    const actor=await this.admin(request,['super_admin','billing_manager','support_agent','auditor']);key(tenantId);
    return this.prisma.runWithTenantContext({userId:actor.userId},async()=>{
      const rows=await this.prisma.$queryRaw<SubscriptionRow[]>`SELECT tenant_id::text,business_name,owner_email,status,activated_at,paid_through,created_at FROM platform_subscriptions WHERE tenant_id=${tenantId}::uuid`;
      if(!rows[0])throw new NotFoundException('Business not found.');
      const payments=await this.prisma.$queryRaw`SELECT payment_reference,method,transaction_reference,verified_reference,amount_ugx,status,reviewed_at,created_at FROM platform_payment_claims WHERE tenant_id=${tenantId}::uuid ORDER BY created_at DESC LIMIT 30`;
      const periods=await this.prisma.$queryRaw`SELECT starts_at,ends_at,amount_ugx,created_at FROM platform_subscription_periods WHERE tenant_id=${tenantId}::uuid ORDER BY created_at DESC LIMIT 30`;
      return {business:rows[0],payments,periods};
    });
  }

  @Get('users')
  async users(@Req() request:FastifyRequest,@Query('q') search?:string,@Query('limit') limit?:string,@Query('offset') offset?:string) {
    const actor=await this.admin(request,['super_admin','support_agent','auditor']);
    const q=typeof search==='string'?search.trim().slice(0,120):'';
    return this.prisma.runWithTenantContext({userId:actor.userId},()=>this.prisma.$queryRaw`
      SELECT d.user_id::text,d.tenant_id::text,s.business_name,d.email,d.display_name,d.membership_role,
        d.membership_status,d.joined_at,d.updated_at
      FROM platform_user_directory d JOIN platform_subscriptions s ON s.tenant_id=d.tenant_id
      WHERE (${q}='' OR d.email ILIKE '%'||${q}||'%' OR d.display_name ILIKE '%'||${q}||'%'
        OR s.business_name ILIKE '%'||${q}||'%')
      ORDER BY d.joined_at DESC LIMIT ${pageSize(limit)} OFFSET ${pageOffset(offset)}`);
  }

  /** A platform super administrator may restrict a single business membership.
   * This never mutates roles, deletes users, or grants a paid subscription.
   * All changes are auditable and remain subject to workspace subscription checks.
   */
  @Post('users/:tenantId/:userId/access') @UseGuards(CsrfGuard)
  async userAccess(@Req() request:FastifyRequest,@Param('tenantId') tenantId:string,
    @Param('userId') userId:string,@Body() input:unknown) {
    const actor=await this.admin(request,['super_admin']);key(tenantId);key(userId);
    const b=bodyObject(input);
    if(b.confirmation!=='I_APPROVE_USER_ACCESS_CHANGE')throw new BadRequestException('Confirm the user access change.');
    if(b.status!=='suspended'&&b.status!=='reinstate')throw new BadRequestException('Choose suspend or reinstate.');
    const reason=field(b.reason,'Reason for user access change',400);
    const operation=b.status;
    return this.prisma.runWithTenantContext({tenantId,userId:actor.userId},()=>
      this.prisma.$transaction(async(tx:SqlTx)=>{
        const records=await tx.$queryRaw<Array<{status:string;role:string}>>`
          SELECT status::text,role FROM memberships
          WHERE tenant_id=${tenantId}::uuid AND user_id=${userId}::uuid FOR UPDATE`;
        const previous=records[0];
        if(!previous)throw new NotFoundException('User membership not found in this business.');
        if(previous.status!==(operation==='suspended'?'ACTIVE':'SUSPENDED')) {
          throw new ConflictException(operation==='suspended'?'Only active members can be suspended.':'Only suspended members can be reinstated.');
        }
        const next=operation==='suspended'?'SUSPENDED':'ACTIVE';
        await tx.$executeRaw`UPDATE memberships SET status=${next}::"MembershipStatus",updated_at=now()
          WHERE tenant_id=${tenantId}::uuid AND user_id=${userId}::uuid`;
        // The directory is refreshed by the existing membership trigger.
        // All future workspace operations independently check ACTIVE membership.
        await tx.$executeRaw`INSERT INTO platform_administration_audit(id,actor_user_id,tenant_id,action,details)
          VALUES(${randomUUID()}::uuid,${actor.userId}::uuid,${tenantId}::uuid,
            ${operation==='suspended'?'platform.user.suspended':'platform.user.reinstated'},
            ${JSON.stringify({userId,role:previous.role,previousStatus:previous.status,reason})}::jsonb)`;
        return {tenantId,userId,status:next,role:previous.role};
      },{isolationLevel:'Serializable'}));
  }

  @Get('payments')
  async payments(@Req() request:FastifyRequest,@Query('status') status?:string) {
    const actor=await this.admin(request,['super_admin','billing_manager','auditor']);
    const state = ['submitted','approved','rejected'].includes(status??'submitted') ? status??'submitted' : 'submitted';
    return this.prisma.runWithTenantContext({userId:actor.userId},()=>this.prisma.$queryRaw`
      SELECT c.id::text,c.tenant_id::text,c.payment_reference,c.method,c.transaction_reference,c.verified_reference,
        c.claim_message,c.amount_ugx,c.status,c.created_at,c.reviewed_at,c.review_note,
        s.business_name,s.owner_email FROM platform_payment_claims c
      JOIN platform_subscriptions s ON s.tenant_id=c.tenant_id
      WHERE c.status=${state} ORDER BY c.created_at DESC LIMIT 100`);
  }

  @Post('payments/:claimId/approve') @UseGuards(CsrfGuard)
  async approve(@Req() request:FastifyRequest,@Param('claimId') claimId:string,@Body() input:unknown) {
    const actor=await this.admin(request,['super_admin','billing_manager']);key(claimId);
    const b=bodyObject(input);
    if(b.confirmation!=='I_VERIFIED_RECEIPT')throw new BadRequestException('Independently verify the actual money received and confirm that you did so.');
    const verifiedReference=normalizedTransactionReference(field(b.verifiedReference,'Verified provider reference',120));
    const reviewNote=opt(b.note,'Approval note',500);
    return this.prisma.runWithTenantContext({userId:actor.userId},async()=>{
      try {
        return await this.prisma.$transaction(async(tx:SqlTx)=>{
          const claims=await tx.$queryRaw<Array<{id:string;tenant_id:string;status:string;amount_ugx:number;method:string;paid_through:Date|null;subscription_status:string;activated_at:Date|null}>>`
            SELECT c.id::text,c.tenant_id::text,c.status,c.amount_ugx,c.method,s.paid_through,s.status AS subscription_status,s.activated_at
            FROM platform_payment_claims c JOIN platform_subscriptions s ON s.tenant_id=c.tenant_id
            WHERE c.id=${claimId}::uuid FOR UPDATE OF c,s`;
          const claim=claims[0];
          if(!claim)throw new NotFoundException('Payment claim not found.');
          if(claim.status==='approved'){
            const done=await tx.$queryRaw<Array<{starts_at:Date;ends_at:Date}>>`SELECT starts_at,ends_at FROM platform_subscription_periods WHERE payment_claim_id=${claimId}::uuid`;
            return {alreadyApproved:true,period:done[0]??null};
          }
          if(claim.status!=='submitted')throw new ConflictException('This submission has already been reviewed.');
          if(claim.subscription_status==='suspended'||claim.subscription_status==='archived')throw new ConflictException('This account is suspended or archived. Review its access restrictions before approving payment.');
          if(claim.subscription_status==='legacy')throw new ConflictException('Legacy access cannot be shortened by payment approval. Explicitly transition this account before billing.');
          if(claim.amount_ugx!==SUBSCRIPTION_PRICE_UGX)throw new ConflictException('The claimed payment amount does not match the official subscription price.');
          const now=new Date();const period=nextPaidPeriod(now,claim.paid_through);
          await tx.$executeRaw`UPDATE platform_payment_claims SET status='approved',verified_reference=${verifiedReference},reviewed_by=${actor.userId}::uuid,
            reviewed_at=${now},review_note=${reviewNote} WHERE id=${claimId}::uuid`;
          await tx.$executeRaw`UPDATE platform_subscriptions SET status='active',activated_at=COALESCE(activated_at,${now}),paid_through=${period.endsAt},updated_at=${now}
            WHERE tenant_id=${claim.tenant_id}::uuid`;
          await tx.$executeRaw`INSERT INTO platform_subscription_periods(id,tenant_id,payment_claim_id,starts_at,ends_at,amount_ugx,approved_by)
            VALUES(${randomUUID()}::uuid,${claim.tenant_id}::uuid,${claimId}::uuid,${period.startsAt},${period.endsAt},${SUBSCRIPTION_PRICE_UGX},${actor.userId}::uuid)`;
          await tx.$executeRaw`INSERT INTO platform_administration_audit(id,actor_user_id,tenant_id,action,details)
            VALUES(${randomUUID()}::uuid,${actor.userId}::uuid,${claim.tenant_id}::uuid,'subscription.payment.approved',
              ${JSON.stringify({paymentClaimId:claimId,startsAt:period.startsAt,endsAt:period.endsAt})}::jsonb)`;
          return {approved:true,period,expiresAt:period.endsAt};
        },{isolationLevel:'Serializable'});
      }catch(error){
        if(error instanceof ConflictException || error instanceof NotFoundException)throw error;
        if(/23505|unique|P2010|P2034/.test(String(error)))throw new ConflictException('The payment reference is already used or the record was changed. Refresh before retrying.');
        throw error;
      }
    });
  }

  @Post('payments/:claimId/reject') @UseGuards(CsrfGuard)
  async reject(@Req() request:FastifyRequest,@Param('claimId') claimId:string,@Body() input:unknown) {
    const actor=await this.admin(request,['super_admin','billing_manager']);key(claimId);
    const note=field(bodyObject(input).reason,'Rejection explanation',500);
    return this.prisma.runWithTenantContext({userId:actor.userId},async()=>this.prisma.$transaction(async(tx:SqlTx)=>{
      const rows=await tx.$queryRaw<Array<{tenant_id:string;status:string}>>`SELECT tenant_id::text,status FROM platform_payment_claims WHERE id=${claimId}::uuid FOR UPDATE`;
      if(!rows[0])throw new NotFoundException('Submission not found.');
      if(rows[0].status!=='submitted')throw new ConflictException('This submission has already been reviewed.');
      await tx.$executeRaw`UPDATE platform_payment_claims SET status='rejected',reviewed_by=${actor.userId}::uuid,reviewed_at=now(),review_note=${note} WHERE id=${claimId}::uuid`;
      await tx.$executeRaw`INSERT INTO platform_administration_audit(id,actor_user_id,tenant_id,action,details)
        VALUES(${randomUUID()}::uuid,${actor.userId}::uuid,${rows[0].tenant_id}::uuid,'subscription.payment.rejected',${JSON.stringify({paymentClaimId:claimId})}::jsonb)`;
      return {rejected:true};
    }));
  }

  /** Offline/WhatsApp payments can be recorded directly by a billing administrator.
   * The receipt must have been independently verified in the receiving account.
   * Both the payment claim and the 30-day entitlement are committed atomically.
   */
  @Post('businesses/:tenantId/activate') @UseGuards(CsrfGuard)
  async activateWithVerifiedPayment(@Req() request:FastifyRequest,@Param('tenantId') tenantId:string,@Body() input:unknown){
    const actor=await this.admin(request,['super_admin','billing_manager']);key(tenantId);
    const b=bodyObject(input);
    if(b.confirmation!=='I_VERIFIED_RECEIPT')throw new BadRequestException('Confirm independent receipt verification.');
    let method:string;
    try{method=safePaymentMethod(b.method);}catch{throw new BadRequestException('Select the verified payment method.');}
    const verifiedReference=normalizedTransactionReference(field(b.verifiedReference,'Verified provider reference',120));
    const reason=field(b.reason,'Verification note',500);
    try {
      return await this.prisma.runWithTenantContext({userId:actor.userId},()=>this.prisma.$transaction(async(tx:SqlTx)=>{
        const rows=await tx.$queryRaw<Array<{status:string;paid_through:Date|null}>>`
          SELECT status,paid_through FROM platform_subscriptions WHERE tenant_id=${tenantId}::uuid FOR UPDATE`;
        if(!rows[0])throw new NotFoundException('Business not found.');
        if(rows[0].status==='legacy')throw new ConflictException('Existing protected businesses require an explicit billing transition first.');
        if(rows[0].status==='suspended'||rows[0].status==='archived')throw new ConflictException('Reactivate or restore the account before recording payment.');
        const used=await tx.$queryRaw<Array<{id:string}>>`
          SELECT id::text FROM platform_payment_claims
          WHERE method=${method} AND upper(btrim(verified_reference))=${verifiedReference} AND status='approved' LIMIT 1`;
        if(used[0])throw new ConflictException('This verified provider reference has already been used.');
        const now=new Date(),period=nextPaidPeriod(now,rows[0].paid_through);
        const claimId=randomUUID(),paymentReference=`LXA-${randomUUID().replace(/-/g,'').slice(0,16).toUpperCase()}`;
        await tx.$executeRaw`INSERT INTO platform_payment_claims
          (id,tenant_id,payment_reference,method,transaction_reference,verified_reference,claim_message,submitted_by,
           status,reviewed_by,reviewed_at,review_note)
          VALUES(${claimId}::uuid,${tenantId}::uuid,${paymentReference},${method},${verifiedReference},${verifiedReference},
            ${reason},${actor.userId}::uuid,'approved',${actor.userId}::uuid,${now},${reason})`;
        await tx.$executeRaw`UPDATE platform_subscriptions SET status='active',
          activated_at=COALESCE(activated_at,${now}),paid_through=${period.endsAt},updated_at=${now}
          WHERE tenant_id=${tenantId}::uuid`;
        await tx.$executeRaw`INSERT INTO platform_subscription_periods
          (id,tenant_id,payment_claim_id,starts_at,ends_at,amount_ugx,approved_by)
          VALUES(${randomUUID()}::uuid,${tenantId}::uuid,${claimId}::uuid,${period.startsAt},${period.endsAt},
           ${SUBSCRIPTION_PRICE_UGX},${actor.userId}::uuid)`;
        await tx.$executeRaw`INSERT INTO platform_administration_audit
          (id,actor_user_id,tenant_id,action,details)
          VALUES(${randomUUID()}::uuid,${actor.userId}::uuid,${tenantId}::uuid,'subscription.offline_payment_verified',
            ${JSON.stringify({claimId,method,endsAt:period.endsAt,reason})}::jsonb)`;
        return {activated:true,claimId,period,expiresAt:period.endsAt};
      },{isolationLevel:'Serializable'}));
    }catch(error){
      if(error instanceof ConflictException||error instanceof NotFoundException)throw error;
      if(/23505|unique|P2034/.test(String(error)))throw new ConflictException('The payment reference is already used or another review is in progress.');
      throw error;
    }
  }

  /** "Delete account" means reversible archive: never destroy production ERP records. */
  @Post('businesses/:tenantId/archive') @UseGuards(CsrfGuard)
  async archiveBusiness(@Req() request:FastifyRequest,@Param('tenantId') tenantId:string,@Body() input:unknown){
    const actor=await this.admin(request,['super_admin']);key(tenantId);
    const b=bodyObject(input),reason=field(b.reason,'Archive reason',500);
    if(b.confirmation!=='ARCHIVE_BUSINESS')throw new BadRequestException('Confirm account archive.');
    return this.prisma.runWithTenantContext({userId:actor.userId},()=>this.prisma.$transaction(async(tx:SqlTx)=>{
      const rows=await tx.$queryRaw<Array<{status:string;business_name:string}>>`
        SELECT status,business_name FROM platform_subscriptions WHERE tenant_id=${tenantId}::uuid FOR UPDATE`;
      if(!rows[0])throw new NotFoundException('Business not found.');
      if(rows[0].status==='archived')throw new ConflictException('Business is already archived.');
      if(b.businessName!==rows[0].business_name)throw new BadRequestException('Type the exact business name to confirm archive.');
      await tx.$executeRaw`UPDATE platform_subscriptions SET status='archived',
        archived_at=now(),archived_previous_status=${rows[0].status},updated_at=now()
        WHERE tenant_id=${tenantId}::uuid`;
      await tx.$executeRaw`INSERT INTO platform_administration_audit(id,actor_user_id,tenant_id,action,details)
        VALUES(${randomUUID()}::uuid,${actor.userId}::uuid,${tenantId}::uuid,'subscription.account.archived',
          ${JSON.stringify({reason,previousStatus:rows[0].status})}::jsonb)`;
      return {status:'archived',dataPreserved:true};
    }));
  }

  @Post('businesses/:tenantId/restore') @UseGuards(CsrfGuard)
  async restoreBusiness(@Req() request:FastifyRequest,@Param('tenantId') tenantId:string,@Body() input:unknown){
    const actor=await this.admin(request,['super_admin']);key(tenantId);
    const b=bodyObject(input),reason=field(b.reason,'Restoration reason',500);
    if(b.confirmation!=='RESTORE_BUSINESS')throw new BadRequestException('Confirm account restoration.');
    return this.prisma.runWithTenantContext({userId:actor.userId},()=>this.prisma.$transaction(async(tx:SqlTx)=>{
      const rows=await tx.$queryRaw<Array<{status:string;archived_previous_status:string|null;paid_through:Date|null}>>`
        SELECT status,archived_previous_status,paid_through FROM platform_subscriptions WHERE tenant_id=${tenantId}::uuid FOR UPDATE`;
      if(!rows[0]||rows[0].status!=='archived')throw new ConflictException('The business is not archived.');
      // Restore suspension if present. Paid subscriptions cannot skip the expiry check.
      const previous=rows[0].archived_previous_status;
      const next=previous==='legacy'?'legacy':previous==='suspended'?'suspended':
        rows[0].paid_through&&rows[0].paid_through>new Date()?'active':'pending';
      await tx.$executeRaw`UPDATE platform_subscriptions SET status=${next},archived_at=NULL,
        archived_previous_status=NULL,updated_at=now() WHERE tenant_id=${tenantId}::uuid`;
      await tx.$executeRaw`INSERT INTO platform_administration_audit(id,actor_user_id,tenant_id,action,details)
        VALUES(${randomUUID()}::uuid,${actor.userId}::uuid,${tenantId}::uuid,'subscription.account.restored',
          ${JSON.stringify({reason,status:next})}::jsonb)`;
      return {status:next,dataPreserved:true};
    }));
  }

  @Post('businesses/:tenantId/access') @UseGuards(CsrfGuard)
  async access(@Req() request:FastifyRequest,@Param('tenantId') tenantId:string,@Body() input:unknown){
    const actor=await this.admin(request,['super_admin']);key(tenantId);
    const b=bodyObject(input),status=b.status;
    if(status!=='suspended'&&status!=='reinstate')throw new BadRequestException('Choose suspend or reinstate.');
    const reason=field(b.reason,'Reason',400);
    return this.prisma.runWithTenantContext({userId:actor.userId},()=>this.prisma.$transaction(async(tx:SqlTx)=>{
      const rows=await tx.$queryRaw<Array<{status:string;paid_through:Date|null;suspension_previous_status:string|null}>>`SELECT status,paid_through,suspension_previous_status FROM platform_subscriptions WHERE tenant_id=${tenantId}::uuid FOR UPDATE`;
      if(!rows[0])throw new NotFoundException('Business not found.');
      if(status==='reinstate'&&rows[0].status!=='suspended')throw new ConflictException('Business is not suspended.');
      const next=status==='suspended'?'suspended':rows[0].suspension_previous_status==='legacy'?'legacy':rows[0].paid_through&&rows[0].paid_through>new Date()?'active':'pending';
      // Suspension never changes the paid-through date or destroys business records.
      const prior=status==='suspended'&&rows[0].status!=='suspended'?rows[0].status:rows[0].suspension_previous_status;
      await tx.$executeRaw`UPDATE platform_subscriptions SET status=${next},suspension_previous_status=${status==='suspended'?prior:null},updated_at=now() WHERE tenant_id=${tenantId}::uuid`;
      await tx.$executeRaw`INSERT INTO platform_administration_audit(id,actor_user_id,tenant_id,action,details)
        VALUES(${randomUUID()}::uuid,${actor.userId}::uuid,${tenantId}::uuid,${`subscription.access.${status}`},${JSON.stringify({reason,oldStatus:rows[0].status})}::jsonb)`;
      return {status:next};
    }));
  }

  @Post('businesses/:tenantId/enroll') @UseGuards(CsrfGuard)
  async enrollExisting(@Req() request:FastifyRequest,@Param('tenantId') tenantId:string,@Body() input:unknown){
    const actor=await this.admin(request,['super_admin']);key(tenantId);
    const data=bodyObject(input);
    if(data.confirmation!=='I_APPROVE_BILLING_TRANSITION')throw new BadRequestException('A conscious legacy business transition confirmation is required.');
    const reason=field(data.reason,'Reason and customer notice',500);
    return this.prisma.runWithTenantContext({userId:actor.userId},()=>this.prisma.$transaction(async(tx:SqlTx)=>{
      const records=await tx.$queryRaw<Array<{status:string}>>`SELECT status FROM platform_subscriptions WHERE tenant_id=${tenantId}::uuid FOR UPDATE`;
      if(!records[0])throw new NotFoundException('Business not found.');
      if(records[0].status!=='legacy')throw new ConflictException('Only protected legacy subscriptions can be transitioned.');
      // Explicit transition is audited; it does not delete a tenant or its records.
      await tx.$executeRaw`UPDATE platform_subscriptions SET status='pending',updated_at=now() WHERE tenant_id=${tenantId}::uuid`;
      await tx.$executeRaw`INSERT INTO platform_administration_audit(id,actor_user_id,tenant_id,action,details)
        VALUES(${randomUUID()}::uuid,${actor.userId}::uuid,${tenantId}::uuid,'subscription.legacy.transitioned',${JSON.stringify({reason})}::jsonb)`;
      return {status:'pending'};
    }));
  }

  @Get('revenue')
  async revenue(@Req() request:FastifyRequest) {
    const actor=await this.admin(request,['super_admin','billing_manager','auditor']);
    return this.prisma.runWithTenantContext({userId:actor.userId},async()=>{
      const totals=await this.prisma.$queryRaw<Array<{total:number;last_30_days:number;payments:number}>>`
        SELECT COALESCE(sum(amount_ugx),0)::int AS total,
          COALESCE(sum(amount_ugx) FILTER(WHERE created_at>=now()-interval '30 days'),0)::int AS last_30_days,
          count(*)::int AS payments FROM platform_subscription_periods`;
      const trend=await this.prisma.$queryRaw<Array<{day:string;revenue:number;payments:number}>>`
        SELECT to_char(created_at AT TIME ZONE 'Africa/Kampala','YYYY-MM-DD') AS day,
          sum(amount_ugx)::double precision AS revenue,count(*)::int AS payments
        FROM platform_subscription_periods WHERE created_at>=now()-interval '60 days'
        GROUP BY 1 ORDER BY 1`;
      return {currency:'UGX',priceUGX:SUBSCRIPTION_PRICE_UGX,totals:totals[0],trend};
    });
  }

  @Get('health')
  async health(@Req() request:FastifyRequest) {
    const actor=await this.admin(request,['super_admin','operations_manager','auditor']);
    return this.prisma.runWithTenantContext({userId:actor.userId},async()=>{
      const [subscriptions]=await this.prisma.$queryRaw<Array<{pending_payment_reviews:number;oldest_payment_hours:number|null;expiring:number}>>`
        SELECT (SELECT count(*)::int FROM platform_payment_claims WHERE status='submitted') AS pending_payment_reviews,
          (SELECT (extract(epoch FROM now()-min(created_at))/3600)::int FROM platform_payment_claims WHERE status='submitted') AS oldest_payment_hours,
          (SELECT count(*)::int FROM platform_subscriptions WHERE status='active' AND paid_through BETWEEN now() AND now()+interval '7 days') AS expiring`;
      // Worker is optional on the existing low-cost plan; missing heartbeat is not a falsely-green check.
      const worker=await this.prisma.$queryRaw<Array<{status:string;last_seen_at:Date;details:unknown}>>`
        SELECT status,last_seen_at,details FROM platform_worker_heartbeats ORDER BY last_seen_at DESC LIMIT 1`;
      const raw=worker[0];const workerEnabled=process.env.LEXA_WORKER_ENABLED==='true';
      const health={checkedAt:new Date().toISOString(),api:{status:'healthy'},database:{status:'healthy'},
        render:{status:'not_connected',reason:'Live deployment metrics require a separate authorized provider integration.'},
        vercel:{status:'not_connected',reason:'Frontend deployment metrics require a separate authorized provider integration.'},
        redis:{status:workerEnabled?(raw?.status==='healthy'?'reported':'unknown'):'disabled'},
        scanner:{status:workerEnabled?(raw?.details&&typeof raw.details==='object'&&(raw.details as {clamav?:string}).clamav==='ok'?'reported':'unknown'):'disabled'},
        worker:{status:!workerEnabled?'disabled':raw&&Date.now()-new Date(raw.last_seen_at).getTime()<120000?raw.status:'stale',lastSeenAt:raw?.last_seen_at??null},
        observability:{sentryConfigured:Boolean(process.env.SENTRY_DSN),otelConfigured:Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT)},
        billing:subscriptions};
      const [securitySignals]=await this.prisma.$queryRaw<Array<{restricted_activity:number}>>`
        SELECT count(*)::int AS restricted_activity FROM platform_account_activity a
        JOIN platform_subscriptions s ON s.tenant_id=a.tenant_id
        WHERE (s.status IN ('pending','suspended','archived') AND a.last_activity_kind='business_operation'
               AND a.last_seen_at>s.updated_at)
           OR (s.status='active' AND s.paid_through IS NOT NULL
               AND a.last_activity_kind='business_operation' AND a.last_seen_at>s.paid_through)`;
      const recommendations:Array<{severity:'high'|'medium'|'info';title:string;description:string;action:string}>=[];
      if((securitySignals?.restricted_activity??0)>0)recommendations.push({
        severity:'high',title:'Restricted workspace activity needs investigation',
        description:`${securitySignals.restricted_activity} recent activity snapshot(s) are inconsistent with their current subscription restrictions. This is a review signal, not proof of a bypass.`,
        action:'Review the platform activity register, subscription timestamps and backend authorization logs. Never suspend on IP evidence alone.'
      });
      if((subscriptions.oldest_payment_hours??0)>=24)recommendations.push({severity:'high',title:'Payment approval backlog',description:'An unreviewed payment is older than 24 hours.',action:'Review and independently verify submitted payments.'});
      if(subscriptions.expiring>0)recommendations.push({severity:'medium',title:'Subscription renewals due',description:`${subscriptions.expiring} business(es) expire within seven days.`,action:'Contact affected owners about renewal.'});
      if(!health.observability.sentryConfigured)recommendations.push({severity:'info',title:'Error monitoring not configured',description:'Sentry errors are unavailable.',action:'Configure a Sentry DSN when the existing account supports it.'});
      return {...health,recommendations};
    });
  }

  @Get('support')
  async support(@Req() request:FastifyRequest) {
    const actor=await this.admin(request,['super_admin','support_agent','billing_manager','auditor']);
    return this.prisma.runWithTenantContext({userId:actor.userId},()=>this.prisma.$queryRaw`
      SELECT c.id::text,c.tenant_id::text,s.business_name,c.subject,c.description,c.status,c.priority,c.created_at,c.updated_at
      FROM platform_support_cases c JOIN platform_subscriptions s ON s.tenant_id=c.tenant_id
      ORDER BY CASE WHEN c.status='resolved' THEN 1 ELSE 0 END,c.created_at DESC LIMIT 100`);
  }

  @Post('support/:caseId/status') @UseGuards(CsrfGuard)
  async supportStatus(@Req() request:FastifyRequest,@Param('caseId') caseId:string,@Body() input:unknown) {
    const actor=await this.admin(request,['super_admin','support_agent']);key(caseId);
    const data=bodyObject(input);if(!['open','investigating','resolved'].includes(String(data.status)))throw new BadRequestException('Invalid support status.');
    const status=String(data.status);
    return this.prisma.runWithTenantContext({userId:actor.userId},async()=>this.prisma.$transaction(async(tx:SqlTx)=>{
      const old=await tx.$queryRaw<Array<{tenant_id:string}>>`SELECT tenant_id::text FROM platform_support_cases WHERE id=${caseId}::uuid FOR UPDATE`;
      if(!old[0])throw new NotFoundException('Support case not found.');
      await tx.$executeRaw`UPDATE platform_support_cases SET status=${status},assigned_to=${actor.userId}::uuid,updated_at=now() WHERE id=${caseId}::uuid`;
      await tx.$executeRaw`INSERT INTO platform_administration_audit(id,actor_user_id,tenant_id,action,details) VALUES(${randomUUID()}::uuid,${actor.userId}::uuid,${old[0].tenant_id}::uuid,'platform.support.status_changed',${JSON.stringify({caseId,status})}::jsonb)`;
      return {status};
    }));
  }

  @Get('incidents')
  async incidents(@Req() request:FastifyRequest){
    const actor=await this.admin(request,['super_admin','operations_manager','auditor']);
    return this.prisma.runWithTenantContext({userId:actor.userId},()=>this.prisma.$queryRaw`
      SELECT id::text,category,title,description,severity,status,created_at,updated_at FROM platform_incidents ORDER BY created_at DESC LIMIT 100`);
  }

  @Post('incidents') @UseGuards(CsrfGuard)
  async newIncident(@Req() request:FastifyRequest,@Body() input:unknown){
    const actor=await this.admin(request,['super_admin','operations_manager']);
    const b=bodyObject(input),title=field(b.title,'Title',140),description=field(b.description,'Description',1500),category=field(b.category,'Category',60),id=randomUUID();
    const severity=String(b.severity);if(!['critical','high','medium','info'].includes(severity))throw new BadRequestException('Invalid severity.');
    await this.prisma.runWithTenantContext({userId:actor.userId},()=>this.prisma.$transaction(async(tx:SqlTx)=>{
      await tx.$executeRaw`INSERT INTO platform_incidents(id,category,title,description,severity) VALUES(${id}::uuid,${category},${title},${description},${severity})`;
      await tx.$executeRaw`INSERT INTO platform_administration_audit(id,actor_user_id,action,details) VALUES(${randomUUID()}::uuid,${actor.userId}::uuid,'platform.incident.created',${JSON.stringify({incidentId:id,severity,category})}::jsonb)`;
    }));
    return {id,status:'open'};
  }

  @Post('incidents/:incidentId/status') @UseGuards(CsrfGuard)
  async incidentStatus(@Req() request:FastifyRequest,@Param('incidentId') incidentId:string,@Body() input:unknown){
    const actor=await this.admin(request,['super_admin','operations_manager']);key(incidentId);
    const b=bodyObject(input);if(!['open','acknowledged','resolved'].includes(String(b.status)))throw new BadRequestException('Invalid incident status.');
    const status=String(b.status);
    const result=await this.prisma.runWithTenantContext({userId:actor.userId},()=>this.prisma.$transaction(async(tx:SqlTx)=>{
      const count=await tx.$executeRaw`UPDATE platform_incidents SET status=${status},acknowledged_by=${actor.userId}::uuid,
        resolved_at=CASE WHEN ${status}='resolved' THEN now() ELSE NULL END,updated_at=now() WHERE id=${incidentId}::uuid`;
      if(count)await tx.$executeRaw`INSERT INTO platform_administration_audit(id,actor_user_id,action,details) VALUES(${randomUUID()}::uuid,${actor.userId}::uuid,'platform.incident.status_changed',${JSON.stringify({incidentId,status})}::jsonb)`;
      return count;
    }));
    if(!result)throw new NotFoundException('Incident not found.');
    return {status};
  }

  @Get('audit')
  async audit(@Req() request:FastifyRequest) {
    const actor=await this.admin(request,['super_admin','auditor']);
    return this.prisma.runWithTenantContext({userId:actor.userId},()=>this.prisma.$queryRaw`
      SELECT id::text,actor_user_id::text,tenant_id::text,action,details,created_at FROM platform_administration_audit ORDER BY created_at DESC LIMIT 150`);
  }
}
