import {
  BadRequestException, ConflictException, Controller, HttpCode, Logger, Post, Body,
  Req, Res, UseGuards, ServiceUnavailableException, UnauthorizedException, ForbiddenException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import { CsrfGuard } from '../core/csrf.guard';
import { meetsNewPasswordPolicy, PASSWORD_POLICY_MESSAGE } from './new-password-policy';
import { verifySignupChallenge } from './turnstile-verification';
import { sendTransactionalEmail } from '../notifications/email-delivery';
import { sendLexaWelcomeEmail } from '../notifications/welcome-email';
import { observedClientIp, safeClientLabel } from '../platform-administration/platform-activity-policy';

const scrypt = promisify(scryptCallback);
const SIGNUP_EXPIRY_MS = 24 * 60 * 60 * 1000;
const SIGNUP_RESEND_DELAY_MS = 120_000;
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const validUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

type Input = Record<string, unknown>;
function object(value: unknown): Input {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('A valid request body is required.');
  return value as Input;
}
function field(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`${label} is required (maximum ${max} characters).`);
  return value.trim();
}
function email(value: unknown): string {
  const result = field(value, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new BadRequestException('Enter a valid email address.');
  return result;
}
function token(value: unknown): string {
  const result = field(value, 'Verification token', 500);
  if (!/^[\w-]{32,150}$/.test(result)) throw new BadRequestException('This verification link is invalid.');
  return result;
}
function password(value: unknown): string {
  if (!meetsNewPasswordPolicy(value)) {
    throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
  }
  return value;
}
async function hashPassword(value: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(value, salt, 64) as Buffer;
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}
function slug(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 45) || 'business';
}
function frontendUrl(): string {
  const value = (process.env.FRONTEND_PUBLIC_URL || 'https://app.lexaaamaal.com').replace(/\/+$/, '');
  if (!value.startsWith('https://') || !/^https:\/\/[^/]+$/.test(value)) throw new ServiceUnavailableException('The public frontend URL must be configured as an HTTPS origin.');
  return value;
}

/** Public registration is intentionally separate from the first-admin bootstrap endpoint. */
@Controller('auth')
export class PublicRegistrationController {
  private readonly logger = new Logger(PublicRegistrationController.name);
  constructor(private readonly prisma: PrismaService) {}

  private async establishSession(userId: string, reply: FastifyReply): Promise<void> {
    const raw = randomBytes(32).toString('base64url');
    await this.prisma.runWithTenantContext({ userId }, () => this.prisma.session.create({
      data: { userId, tokenHash: sha(raw), expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000) },
    }));
    reply.header('Set-Cookie', `lexa_session=${encodeURIComponent(raw)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${SESSION_SECONDS}`);
  }

  /** Anti-enumeration response: identical for already registered emails and new requests. */
  @Post('signup')
  @UseGuards(CsrfGuard)
  @HttpCode(202)
  async signup(@Body() raw: unknown): Promise<{ accepted: true }> {
    const data = object(raw);
    try {
      await verifySignupChallenge(data.turnstileToken, {
        secret:process.env.TURNSTILE_SECRET_KEY,
        enforced:process.env.TURNSTILE_ENFORCE_SIGNUP==='true' || (process.env.NODE_ENV==='production' && process.env.TURNSTILE_ENFORCE_SIGNUP!=='false'),
        allowedHosts:(process.env.TURNSTILE_ALLOWED_HOSTNAMES??'lexaaamaal.com,www.lexaaamaal.com,app.lexaaamaal.com,lexareview.vercel.app').split(',').map(value=>value.trim()).filter(Boolean),
      });
    } catch (error) {
      if ((error as Error).message==='TURNSTILE_VERIFICATION_UNAVAILABLE' || (error as Error).message==='TURNSTILE_CONFIGURATION_MISSING') {
        throw new ServiceUnavailableException('Human verification is unavailable. Please try again later.');
      }
      throw new BadRequestException('Complete the security check before continuing.');
    }
    const address = email(data.email);
    const displayName = field(data.displayName, 'Full name', 100);
    const businessName = field(data.businessName, 'Business name', 100);
    const businessType = field(data.businessType ?? 'general', 'Business type', 80);
    const rawPassword = password(data.password);
    // Fail closed before touching PII. Do not return a fake success if verification cannot be delivered.
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      throw new ServiceUnavailableException({ code: 'SIGNUP_EMAIL_NOT_CONFIGURED', message: 'Email verification is temporarily unavailable. Please try again later.' });
    }
    const url = frontendUrl();
    if (await this.prisma.user.findUnique({ where: { email: address }, select: { id: true } })) return { accepted: true };
    const existing = await this.prisma.runWithTenantContext({ signupEmail: address }, () => this.prisma.signupVerification.findUnique({ where: { email: address } }));
    if (existing && Date.now() - existing.updatedAt.getTime() < SIGNUP_RESEND_DELAY_MS) return { accepted: true };
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = sha(rawToken);
    const passwordHash = await hashPassword(rawPassword);
    await this.prisma.runWithTenantContext({ signupEmail: address }, () => this.prisma.signupVerification.upsert({
      where: { email: address },
      create: { email: address, displayName, businessName, businessType, passwordHash, tokenHash, expiresAt: new Date(Date.now() + SIGNUP_EXPIRY_MS) },
      update: { displayName, businessName, businessType, passwordHash, tokenHash, expiresAt: new Date(Date.now() + SIGNUP_EXPIRY_MS) },
    }));
    const actionUrl = `${url}/verify-email?token=${encodeURIComponent(rawToken)}`;
    try {
      await sendTransactionalEmail({
        to: address, subject: 'Verify your email to start with LEXA',
        text: `Hello ${displayName}, welcome to LEXA. Verify your email address to securely create your ${businessName} workspace. This link expires in 24 hours.`,
        actionUrl, actionLabel: 'Verify my email',
      });
    } catch {
      // Only delete if this request's hash is still current (a newer request may have replaced it).
      await this.prisma.runWithTenantContext({ signupEmail: address }, () => this.prisma.signupVerification.deleteMany({ where: { email: address, tokenHash } }));
      throw new ServiceUnavailableException({ code: 'SIGNUP_EMAIL_FAILED', message: 'We could not send your verification email. Please try again.' });
    }
    return { accepted: true };
  }

  @Post('signup/verify')
  @UseGuards(CsrfGuard)
  async verifySignup(@Body() raw: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const tokenHash = sha(token(object(raw).token));
    const userId = randomUUID();
    const tenantId = randomUUID();
    const created = await this.prisma.runWithTenantContext({ signupTokenHash: tokenHash }, () => this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ email: string; display_name: string; business_name: string; business_type: string; password_hash: string }>>`
        SELECT email,display_name,business_name,business_type,password_hash
        FROM signup_verifications WHERE token_hash=${tokenHash} AND expires_at>now() FOR UPDATE`;
      const pending = rows[0];
      if (!pending) throw new BadRequestException({ code: 'SIGNUP_LINK_INVALID', message: 'This verification link is invalid or expired. Please request a new one.' });
      const alreadyExists = await tx.user.findUnique({ where: { email: pending.email }, select: { id: true } });
      if (alreadyExists) throw new ConflictException({ code: 'SIGNUP_ACCOUNT_EXISTS', message: 'This account already exists. Please sign in.' });
      await tx.$queryRaw`SELECT set_config('app.user_id',${userId},true),set_config('app.tenant_id',${tenantId},true)`;
      const user = await tx.user.create({ data: { id: userId, email: pending.email, displayName: pending.display_name, passwordHash: pending.password_hash } });
      const tenant = await tx.tenant.create({ data: {
        id: tenantId, name: pending.business_name, slug: `${slug(pending.business_name)}-${randomBytes(5).toString('hex')}`,
        businessType: pending.business_type, currency: 'UGX', timezone: 'Africa/Kampala',
      } });
      await tx.membership.create({ data: { tenantId, userId, role: 'owner', status: 'ACTIVE', branchScopeMode: 'all' } });
      await tx.branch.create({ data: { tenantId, code: 'MAIN', name: 'Main branch', currency: 'UGX', timezone: 'Africa/Kampala' } });
      // Identity verification is NOT a paid entitlement. Existing accounts were
      // grandfathered in the additive migration; new accounts start pending.
      await tx.$executeRaw`INSERT INTO platform_subscriptions(tenant_id,business_name,owner_email,status)
        VALUES(${tenantId}::uuid,${pending.business_name},${pending.email},'pending')`;
      // Record registration activity even before the owner opens the billing screen.
      // This is the server-observed peer IP, never a trusted user-supplied header.
      const observedIp = observedClientIp(request.ip);
      const clientLabel = safeClientLabel(request.headers['user-agent']);
      await tx.$executeRaw`INSERT INTO platform_account_activity(tenant_id,user_id,observed_ip,client_label)
        VALUES(${tenantId}::uuid,${userId}::uuid,${observedIp}::inet,${clientLabel})`;
      await tx.auditEvent.create({ data: { tenantId, actorUserId: userId, action: 'auth.email_verified.workspace_created', resourceType: 'workspace', resourceId: tenantId } });
      await tx.signupVerification.delete({ where: { email: pending.email } });
      return { user, tenant };
    }, { isolationLevel: 'Serializable' }));
    await this.establishSession(userId, reply);
    // Activation and welcome delivery are separate: never roll back a verified business
    // when the mail provider is temporarily unavailable. The Resend key is idempotent.
    try {
      await sendLexaWelcomeEmail({
        userId, recipientEmail: created.user.email,
        displayName: created.user.displayName ?? 'LEXA member',
        businessName: created.tenant.name, owner: true, subscriptionPending: true, workspaceId: created.tenant.id,
      });
    } catch {
      this.logger.warn('LEXA_WELCOME_EMAIL_DELIVERY_FAILED: verified owner account remains active.');
    }
    return { verified: true, workspaceId: created.tenant.id, user: { id: created.user.id, email: created.user.email, displayName: created.user.displayName }, roles: ['owner'] };
  }

  /** Invitation token is proof of access to the invited mailbox. No account is created until acceptance. */
  @Post('invitations/preview')
  @UseGuards(CsrfGuard)
  async invitationPreview(@Body() raw: unknown) {
    const data = object(raw);
    const workspaceId = field(data.workspaceId, 'Business ID', 50);
    const invitationId = field(data.invitationId, 'Invitation ID', 50);
    if (!validUuid(workspaceId) || !validUuid(invitationId)) throw new BadRequestException('The invitation link is invalid.');
    const hash = sha(token(data.token));
    return this.prisma.runWithTenantContext({ tenantId: workspaceId }, async () => {
      const invitation = await this.prisma.workspaceInvitation.findFirst({ where: { id: invitationId, tenantId: workspaceId, tokenHash: hash, status: 'PENDING', expiresAt: { gt: new Date() } } });
      if (!invitation) throw new BadRequestException({ code: 'INVITATION_EXPIRED', message: 'This invitation is invalid, expired, or already accepted.' });
      const tenant = await this.prisma.tenant.findUnique({ where: { id: workspaceId }, select: { name: true } });
      const existing = await this.prisma.user.findUnique({ where: { email: invitation.email }, select: { id: true } });
      return { email: invitation.email, role: invitation.role, businessName: tenant?.name ?? 'LEXA business', existingAccount: Boolean(existing), expiresAt: invitation.expiresAt };
    });
  }

  /** Existing employees have an account but no membership yet, so this route must
   * not sit behind the workspace.manage guard. The session plus one-time token
   * and exact invited email are all required before membership is granted. */
  @Post('invitations/accept')
  @UseGuards(CsrfGuard)
  async acceptExistingInvitation(@Body() raw: unknown, @Req() request: FastifyRequest) {
    const data = object(raw);
    const workspaceId = field(data.workspaceId, 'Business ID', 50);
    const invitationId = field(data.invitationId, 'Invitation ID', 50);
    if (!validUuid(workspaceId) || !validUuid(invitationId)) throw new BadRequestException('The invitation link is invalid.');
    const invitationHash = sha(token(data.token));
    const rawCookie = (request.headers.cookie ?? '').split(';').map(v => v.trim()).find(v => v.startsWith('lexa_session='))?.slice('lexa_session='.length);
    if (!rawCookie) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Sign in to accept your invitation.' });
    const session = await this.prisma.session.findFirst({
      where: { tokenHash: sha(rawCookie), expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!session) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Sign in again to accept your invitation.' });
    const userId = session.userId;
    return this.prisma.runWithTenantContext({ tenantId: workspaceId, userId }, () => this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ email: string; role: string; branch_scope_mode: string; branch_ids: string[] }>>`
        SELECT email,role,branch_scope_mode,branch_ids FROM workspace_invitations
        WHERE id=${invitationId}::uuid AND tenant_id=${workspaceId}::uuid
          AND token_hash=${invitationHash} AND status='PENDING' AND expires_at>now() FOR UPDATE`;
      const invitation = rows[0];
      if (!invitation) throw new BadRequestException({ code: 'INVITATION_EXPIRED', message: 'This invitation has expired or was already used.' });
      if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
        throw new ForbiddenException('Sign in with the email address to which the invitation was sent.');
      }
      const existingMembership = await tx.membership.findUnique({ where: { tenantId_userId: { tenantId: workspaceId, userId } } });
      if (existingMembership?.status === 'ACTIVE') throw new ConflictException('You already belong to this business.');
      const previousAccess = await tx.membership.findUnique({ where: { tenantId_userId: { tenantId: workspaceId, userId } }, select: { status: true } });
      if (previousAccess?.status === 'SUSPENDED') throw new ForbiddenException('This employee has been suspended. Only the business owner may reactivate access.');
      await tx.membership.upsert({
        where: { tenantId_userId: { tenantId: workspaceId, userId } },
        create: { tenantId: workspaceId, userId, role: invitation.role, status: 'ACTIVE', branchScopeMode: invitation.branch_scope_mode },
        update: { role: invitation.role, status: 'ACTIVE', branchScopeMode: invitation.branch_scope_mode },
      });
      await tx.branchMembership.deleteMany({ where: { tenantId: workspaceId, userId } });
      if (invitation.branch_scope_mode === 'restricted' && invitation.branch_ids.length) {
        await tx.branchMembership.createMany({ data: invitation.branch_ids.map(branchId => ({ tenantId: workspaceId, branchId, userId })) });
      }
      await tx.workspaceInvitation.update({ where: { id: invitationId }, data: { status: 'ACCEPTED', acceptedByUserId: userId, acceptedAt: new Date() } });
      await tx.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: userId, action: 'workspace.invitation.accepted.existing_account', resourceType: 'workspace_invitation', resourceId: invitationId } });
      return { accepted: true, workspaceId, role: invitation.role };
    }, { isolationLevel: 'Serializable' }));
  }

  @Post('invitations/join')
  @UseGuards(CsrfGuard)
  async joinInvitation(@Body() raw: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const data = object(raw);
    const workspaceId = field(data.workspaceId, 'Business ID', 50);
    const invitationId = field(data.invitationId, 'Invitation ID', 50);
    if (!validUuid(workspaceId) || !validUuid(invitationId)) throw new BadRequestException('The invitation link is invalid.');
    const tokenHash = sha(token(data.token));
    const displayName = field(data.displayName, 'Full name', 100);
    const passwordHash = await hashPassword(password(data.password));
    const userId = randomUUID();
    const result = await this.prisma.runWithTenantContext({ tenantId: workspaceId }, () => this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ email: string; role: string; branch_scope_mode: string; branch_ids: string[] }>>`
        SELECT email,role,branch_scope_mode,branch_ids FROM workspace_invitations
        WHERE id=${invitationId}::uuid AND tenant_id=${workspaceId}::uuid
          AND token_hash=${tokenHash} AND status='PENDING' AND expires_at>now() FOR UPDATE`;
      const invitation = rows[0];
      if (!invitation) throw new BadRequestException({ code: 'INVITATION_EXPIRED', message: 'This invitation has expired or was already used.' });
      const current = await tx.user.findUnique({ where: { email: invitation.email }, select: { id: true } });
      if (current) throw new ConflictException({ code: 'INVITED_ACCOUNT_EXISTS', message: 'You already have a LEXA account. Sign in to accept the invitation.' });
      await tx.$queryRaw`SELECT set_config('app.user_id',${userId},true)`;
      const user = await tx.user.create({ data: { id: userId, email: invitation.email, displayName, passwordHash } });
      await tx.membership.create({ data: { tenantId: workspaceId, userId, role: invitation.role, status: 'ACTIVE', branchScopeMode: invitation.branch_scope_mode } });
      if (invitation.branch_scope_mode === 'restricted' && invitation.branch_ids.length) {
        await tx.branchMembership.createMany({ data: invitation.branch_ids.map(branchId => ({ tenantId: workspaceId, branchId, userId })) });
      }
      await tx.workspaceInvitation.update({ where: { id: invitationId }, data: { status: 'ACCEPTED', acceptedByUserId: userId, acceptedAt: new Date() } });
      await tx.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: userId, action: 'workspace.invitation.accepted.new_account', resourceType: 'workspace_invitation', resourceId: invitationId } });
      const tenant = await tx.tenant.findUnique({ where: { id: workspaceId }, select: { name: true } });
      return { user, businessName: tenant?.name ?? 'your business' };
    }, { isolationLevel: 'Serializable' }));
    await this.establishSession(userId, reply);
    try {
      await sendLexaWelcomeEmail({
        userId, recipientEmail: result.user.email,
        displayName: result.user.displayName ?? 'LEXA member',
        businessName: result.businessName, owner: false,
      });
    } catch {
      this.logger.warn('LEXA_WELCOME_EMAIL_DELIVERY_FAILED: invited account remains active.');
    }
    return { accepted: true, workspaceId, user: { id: result.user.id, email: result.user.email, displayName: result.user.displayName } };
  }
}
