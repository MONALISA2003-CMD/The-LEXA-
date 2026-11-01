import { BadRequestException, Controller, Get, Param, Post, Put, Query, Body, Req, UseGuards, UnauthorizedException, NotFoundException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertBranchAccess } from '../authorization/branch-scope';
import { CsrfGuard } from '../core/csrf.guard';
import { NOTIFICATION_CATALOGUE } from './event-catalogue';

function cookie(request: FastifyRequest, name: string): string | undefined {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('='); if (at < 0 || part.slice(0, at).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(at + 1).trim()); } catch { return undefined; }
  }
  return undefined;
}
function sha(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function safeLimit(value: string | undefined): number { const n = Number(value ?? 50); return Number.isInteger(n) ? Math.max(1, Math.min(100, n)) : 50; }
function parseCursor(value?: string): { createdAt: string; id: string } | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as any;
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string' || !/^[0-9a-f-]{16,64}$/i.test(parsed.id)) throw new Error('invalid');
    if (Number.isNaN(Date.parse(parsed.createdAt))) throw new Error('invalid');
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch { throw new BadRequestException('Notification cursor is invalid.'); }
}

@Controller('workspaces/:workspaceId/branches/:branchId/notifications')
export class NotificationCentreController {
  constructor(private readonly prisma: PrismaService) {}

  private async actor(request: FastifyRequest, workspaceId: string, branchId: string) {
    const token = cookie(request, 'lexa_session');
    if (!token) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Sign in to continue.' });
    const session = await this.prisma.session.findFirst({ where: { tokenHash: sha(token), expiresAt: { gt: new Date() } }, select: { userId: true } });
    if (!session) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Sign in again.' });
    this.prisma.enterTenantContext(workspaceId, session.userId);
    const membership = await this.prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: workspaceId, userId: session.userId } } });
    if (!membership || membership.status !== 'ACTIVE') throw new NotFoundException('Workspace not found.');
    await assertBranchAccess(this.prisma, workspaceId, branchId, session.userId, membership.role);
    return { userId: session.userId, role: membership.role };
  }

  @Get()
  async list(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string,
    @Query('limit') limit?: string, @Query('cursor') cursorValue?: string,
    @Query('type') type?: string, @Query('from') from?: string, @Query('to') to?: string,
    @Query('unread') unread?: string, @Req() request?: FastifyRequest) {
    const actor = await this.actor(request!, workspaceId, branchId);
    const take = safeLimit(limit); const cursor = parseCursor(cursorValue);
    if (type && !Object.prototype.hasOwnProperty.call(NOTIFICATION_CATALOGUE, type)) throw new BadRequestException('Notification type is not supported.');
    if (from && Number.isNaN(Date.parse(from))) throw new BadRequestException('The start date is invalid.');
    if (to && Number.isNaN(Date.parse(to))) throw new BadRequestException('The end date is invalid.');
    if (from && to && from > to) throw new BadRequestException('The date range is reversed.');
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT id::text, event_type AS kind, title, body, created_at AS "createdAt", read_at AS "readAt", href,
             entity_module AS "entityModule", entity_record_id AS "entityRecordId"
        FROM business_notifications
       WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid
         AND recipient_user_id=${actor.userId}::uuid AND visible_in_app=true AND (expires_at IS NULL OR expires_at>now())
         AND (${type ?? null}::text IS NULL OR event_type=${type ?? null})
         AND (${from ?? null}::timestamptz IS NULL OR created_at>=${from ?? null}::timestamptz)
         AND (${to ?? null}::timestamptz IS NULL OR created_at<(${to ?? null}::timestamptz + interval '1 day'))
         AND (${unread === 'true'}::boolean=false OR is_read=false)
         AND (${cursor?.createdAt ?? null}::timestamptz IS NULL OR (created_at,id)<(${cursor?.createdAt ?? null}::timestamptz,${cursor?.id ?? null}::uuid))
       ORDER BY created_at DESC,id DESC LIMIT ${take + 1}`;
    const hasMore = rows.length > take; const items = rows.slice(0, take);
    const last = items.at(-1);
    const nextCursor = hasMore && last ? Buffer.from(JSON.stringify({ createdAt: new Date(last.createdAt).toISOString(), id: last.id })).toString('base64url') : null;
    const countRows = await this.prisma.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT count(*)::bigint AS count FROM business_notifications
       WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid
         AND recipient_user_id=${actor.userId}::uuid AND visible_in_app=true AND (expires_at IS NULL OR expires_at>now()) AND is_read=false`;
    return { items, nextCursor, unreadCount: Number(countRows[0]?.count ?? 0) };
  }

  @Post(':notificationId/read') @UseGuards(CsrfGuard)
  async markRead(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string,
    @Param('notificationId') notificationId: string, @Req() request: FastifyRequest) {
    const actor = await this.actor(request, workspaceId, branchId);
    const rows = await this.prisma.$queryRaw<any[]>`
      UPDATE business_notifications SET is_read=true,read_at=COALESCE(read_at,now())
       WHERE id=${notificationId}::uuid AND tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid
         AND recipient_user_id=${actor.userId}::uuid RETURNING id::text`;
    if (!rows.length) throw new NotFoundException('Notification not found.');
    return { id: rows[0].id, read: true };
  }

  @Post('read-all') @UseGuards(CsrfGuard)
  async markAllRead(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() request: FastifyRequest) {
    const actor = await this.actor(request, workspaceId, branchId);
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint | number }>>`
      WITH updated AS (UPDATE business_notifications SET is_read=true,read_at=COALESCE(read_at,now())
       WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND recipient_user_id=${actor.userId}::uuid AND visible_in_app=true AND (expires_at IS NULL OR expires_at>now()) AND is_read=false RETURNING id)
      SELECT count(*)::bigint AS count FROM updated`;
    return { updated: Number(rows[0]?.count ?? 0) };
  }

  @Get('preferences')
  async preferences(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() request: FastifyRequest) {
    const actor = await this.actor(request, workspaceId, branchId);
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT event_type AS "eventType",channel,enabled,"updated_at" AS "updatedAt"
        FROM notification_preferences WHERE tenant_id=${workspaceId}::uuid AND user_id=${actor.userId}::uuid
       ORDER BY event_type,channel`;
    return { catalogue: Object.keys(NOTIFICATION_CATALOGUE), preferences: rows };
  }

  @Put('preferences') @UseGuards(CsrfGuard)
  async updatePreferences(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string,
    @Body() body: any, @Req() request: FastifyRequest) {
    const actor = await this.actor(request, workspaceId, branchId);
    if (!Array.isArray(body?.preferences) || body.preferences.length > 100) throw new BadRequestException('Provide up to 100 notification preferences.');
    const preferences = body.preferences.map((item: any) => ({ eventType:String(item?.eventType ?? ''), channel:String(item?.channel ?? ''), enabled:item?.enabled }));
    if (preferences.some((item:any) => !Object.prototype.hasOwnProperty.call(NOTIFICATION_CATALOGUE,item.eventType) || !['in_app','email'].includes(item.channel) || typeof item.enabled !== 'boolean')) {
      throw new BadRequestException('A notification preference is invalid.');
    }
    const changed: any[] = [];
    for (const item of preferences) {
      const { eventType, channel, enabled } = item;
      const rows = await this.prisma.$queryRaw<any[]>`
        INSERT INTO notification_preferences(id,tenant_id,user_id,event_type,channel,enabled,updated_at)
        VALUES(gen_random_uuid(),${workspaceId}::uuid,${actor.userId}::uuid,${eventType},${channel},${enabled},now())
        ON CONFLICT(tenant_id,user_id,event_type,channel) DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=now()
        RETURNING event_type AS "eventType",channel,enabled`;
      changed.push(rows[0]);
    }
    return { preferences: changed };
  }
}
