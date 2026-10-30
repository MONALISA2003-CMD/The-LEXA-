import {
  BadRequestException,
  Controller,
  ConflictException,
  Delete,
  Get,
  NotFoundException,
  UnauthorizedException,
  Param,
  Post,
  Query,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertBranchAccess } from '../authorization/branch-scope';
import { CsrfGuard } from '../core/csrf.guard';

type JsonObject = Record<string, unknown>;
type RequestWithBody = FastifyRequest & { body?: unknown };
type QueryClient = PrismaService | any;

type LinkRow = {
  id: string;
  direction: 'outgoing' | 'incoming';
  relatedModuleId: string;
  relatedRecordId: string;
  relatedTitle: string | null;
  relationType: string;
  relatedData: unknown;
  createdAt: Date;
};

type EventRow = {
  id: string;
  moduleId: string;
  recordId: string | null;
  eventType: string;
  payload: unknown;
  outboxStatus: string;
  createdAt: Date;
  actorUserId: string | null;
};

function cookieValue(request: FastifyRequest, name: string): string | undefined {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return undefined; }
  }
  return undefined;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function asObject(value: unknown, label = 'request body'): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException(`${label} must be an object.`);
  return value as JsonObject;
}

function requiredString(value: unknown, label: string, max = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new BadRequestException(`${label} is required and must be no longer than ${max} characters.`);
  }
  return value.trim();
}

function optionalString(value: unknown, label: string, max = 160): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredString(value, label, max);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Shared module graph API. Module records remain scoped to the existing module_records
 * collection; the registry gives every frontend module a server-side identity, while
 * links and events provide durable cross-module references and an event outbox.
 */
@Controller('workspaces/:workspaceId/branches/:branchId/module-graph')
export class ModuleGraphController {
  constructor(private readonly prisma: PrismaService) {}

  private async sessionFor(request: FastifyRequest): Promise<{ userId: string }> {
    const token = cookieValue(request, 'lexa_session');
    if (!token) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Sign in to continue.' });
    const session = await this.prisma.session.findFirst({
      where: { tokenHash: sha256(token), expiresAt: { gt: new Date() } },
      select: { userId: true },
    });
    if (!session) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Your session has expired. Sign in again.' });
    return session;
  }

  private async membershipFor(userId: string, workspaceId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: workspaceId, userId } },
    });
    if (!membership || membership.status !== 'ACTIVE') throw new NotFoundException('Workspace not found.');
    return membership;
  }

  private async branchFor(workspaceId: string, branchId: string, userId: string): Promise<void> {
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId: workspaceId }, select: { id: true } });
    if (!branch) throw new NotFoundException('Branch not found.');
    const membership = await this.membershipFor(userId, workspaceId);
    await assertBranchAccess(this.prisma, workspaceId, branchId, userId, membership.role);
  }

  private async assertModule(moduleId: string): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ moduleId: string }>>`
      SELECT module_id AS "moduleId" FROM module_definitions WHERE module_id = ${moduleId} LIMIT 1
    `;
    if (!rows.length) throw new NotFoundException(`Module '${moduleId}' is not registered in LEXA.`);
  }

  private async assertRecord(workspaceId: string, branchId: string, moduleId: string, recordId: string): Promise<void> {
    const row = await this.prisma.moduleRecord.findUnique({
      where: { tenantId_branchId_moduleId_recordId: { tenantId: workspaceId, branchId, moduleId, recordId } },
      select: { id: true },
    });
    if (!row) throw new NotFoundException(`The ${moduleId} record '${recordId}' does not exist in this workspace and branch.`);
  }

  private async insertEvent(
    client: QueryClient,
    input: {
      workspaceId: string; branchId: string; moduleId: string; recordId?: string;
      eventType: string; payload?: JsonObject; actorUserId: string; dedupeKey?: string;
    },
  ): Promise<string | null> {
    const id = randomUUID();
    const payload = JSON.stringify(input.payload ?? {});
    const rows = await client.$queryRaw<Array<{ id: string }>>`
      INSERT INTO module_domain_events
        (id, tenant_id, branch_id, module_id, record_id, event_type, payload, dedupe_key, actor_user_id)
      VALUES
        (${id}::uuid, ${input.workspaceId}::uuid, ${input.branchId}::uuid, ${input.moduleId},
         ${input.recordId ?? null}, ${input.eventType}, ${payload}::jsonb, ${input.dedupeKey ?? null}, ${input.actorUserId}::uuid)
      ON CONFLICT (tenant_id, dedupe_key)
      DO UPDATE SET dedupe_key = EXCLUDED.dedupe_key
      RETURNING id
    `;
    return rows[0]?.id ?? null;
  }

  @Get('catalog')
  async catalog(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Req() request: FastifyRequest,
  ) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    await this.branchFor(workspaceId, branchId, session.userId);
    return this.prisma.$queryRaw`
      SELECT module_id AS "id", title, singular_label AS "singularLabel", group_name AS "group",
             schema_version AS "schemaVersion", is_writable AS "writable", storage_kind AS "storageKind"
      FROM module_definitions ORDER BY sort_order ASC, title ASC
    `;
  }

  @Get('records/:moduleId/:recordId/links')
  async recordLinks(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Param('moduleId') moduleId: string,
    @Param('recordId') recordId: string,
    @Req() request: FastifyRequest,
  ): Promise<LinkRow[]> {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    await this.branchFor(workspaceId, branchId, session.userId);
    await this.assertModule(moduleId);
    await this.assertRecord(workspaceId, branchId, moduleId, recordId);
    return this.prisma.$queryRaw<LinkRow[]>`
      SELECT l.id,
        CASE WHEN l.source_module_id = ${moduleId} AND l.source_record_id = ${recordId} THEN 'outgoing' ELSE 'incoming' END AS direction,
        CASE WHEN l.source_module_id = ${moduleId} AND l.source_record_id = ${recordId} THEN l.target_module_id ELSE l.source_module_id END AS "relatedModuleId",
        CASE WHEN l.source_module_id = ${moduleId} AND l.source_record_id = ${recordId} THEN l.target_record_id ELSE l.source_record_id END AS "relatedRecordId",
        COALESCE(r.data->>'name', r.data->>'title', r.data->>'customer', r.data->>'supplier', r.data->>'orderNumber', r.data->>'invoiceNumber', r.data->>'reference') AS "relatedTitle",
        l.relation_type AS "relationType", r.data AS "relatedData", l.created_at AS "createdAt"
      FROM module_record_links l
      JOIN module_records r ON r.tenant_id = l.tenant_id AND r.branch_id = l.branch_id
        AND ((l.source_module_id = ${moduleId} AND l.source_record_id = ${recordId} AND r.module_id = l.target_module_id AND r.record_id = l.target_record_id)
          OR (l.target_module_id = ${moduleId} AND l.target_record_id = ${recordId} AND r.module_id = l.source_module_id AND r.record_id = l.source_record_id))
      WHERE l.tenant_id = ${workspaceId}::uuid AND l.branch_id = ${branchId}::uuid
        AND ((l.source_module_id = ${moduleId} AND l.source_record_id = ${recordId}) OR (l.target_module_id = ${moduleId} AND l.target_record_id = ${recordId}))
      ORDER BY l.created_at DESC LIMIT 100
    `;
  }

  @Post('links')
  @UseGuards(CsrfGuard)
  async createLink(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Body() raw: unknown,
    @Req() request: RequestWithBody,
  ) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    await this.branchFor(workspaceId, branchId, session.userId);
    const sourceModuleId = requiredString(body.sourceModuleId, 'Source module', 80);
    const sourceRecordId = requiredString(body.sourceRecordId, 'Source record', 160);
    const targetModuleId = requiredString(body.targetModuleId, 'Target module', 80);
    const targetRecordId = requiredString(body.targetRecordId, 'Target record', 160);
    const relationType = optionalString(body.relationType, 'Relationship type', 60) ?? 'workflow_handoff';
    if (sourceModuleId === targetModuleId && sourceRecordId === targetRecordId) throw new BadRequestException('A record cannot be linked to itself.');
    if (!/^[a-z][a-z0-9_-]*$/.test(relationType)) throw new BadRequestException('Relationship type is invalid.');
    await this.assertModule(sourceModuleId);
    await this.assertModule(targetModuleId);
    await this.assertRecord(workspaceId, branchId, sourceModuleId, sourceRecordId);
    await this.assertRecord(workspaceId, branchId, targetModuleId, targetRecordId);

    const rows = await this.prisma.$transaction(async (tx) => {
      const id = randomUUID();
      const saved = await tx.$queryRaw<Array<{ id: string; createdAt: Date }>>`
        INSERT INTO module_record_links
          (id, tenant_id, branch_id, source_module_id, source_record_id, target_module_id, target_record_id, relation_type, created_by_user_id)
        VALUES
          (${id}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, ${sourceModuleId}, ${sourceRecordId}, ${targetModuleId}, ${targetRecordId}, ${relationType}, ${session.userId}::uuid)
        ON CONFLICT (tenant_id, branch_id, source_module_id, source_record_id, target_module_id, target_record_id, relation_type)
        DO UPDATE SET relation_type = EXCLUDED.relation_type
        RETURNING id, created_at AS "createdAt"
      `;
      const link = saved[0];
      if (!link) throw new ConflictException('The relationship could not be saved.');
      const payload = { sourceModuleId, sourceRecordId, targetModuleId, targetRecordId, relationType, linkId: link.id };
      await this.insertEvent(tx, { workspaceId, branchId, moduleId: sourceModuleId, recordId: sourceRecordId, eventType: 'record.linked', payload, actorUserId: session.userId, dedupeKey: `link:${link.id}:source` });
      await this.insertEvent(tx, { workspaceId, branchId, moduleId: targetModuleId, recordId: targetRecordId, eventType: 'record.linked', payload, actorUserId: session.userId, dedupeKey: `link:${link.id}:target` });
      await tx.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: session.userId, action: 'module.record.linked', resourceType: 'module_record_link', resourceId: link.id, requestId: request.headers['x-request-id'] as string | undefined, metadata: payload as any } });
      return saved;
    });
    return { id: rows[0]!.id, sourceModuleId, sourceRecordId, targetModuleId, targetRecordId, relationType, createdAt: rows[0]!.createdAt };
  }

  @Delete('links/:linkId')
  @UseGuards(CsrfGuard)
  async deleteLink(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Param('linkId') linkId: string,
    @Req() request: FastifyRequest,
  ): Promise<{ deleted: true }> {
    if (!isUuid(linkId)) throw new BadRequestException('Relationship ID is invalid.');
    const session = await this.sessionFor(request);
    const membership = await this.membershipFor(session.userId, workspaceId);
    await this.branchFor(workspaceId, branchId, session.userId);
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; sourceModuleId: string; sourceRecordId: string; targetModuleId: string; targetRecordId: string }>>`
        DELETE FROM module_record_links
        WHERE id = ${linkId}::uuid AND tenant_id = ${workspaceId}::uuid AND branch_id = ${branchId}::uuid
          AND (created_by_user_id = ${session.userId}::uuid OR ${membership.role} IN ('owner', 'admin'))
        RETURNING id, source_module_id AS "sourceModuleId", source_record_id AS "sourceRecordId", target_module_id AS "targetModuleId", target_record_id AS "targetRecordId"
      `;
      const link = rows[0];
      if (!link) throw new NotFoundException('Relationship not found.');
      const payload = { linkId: link.id, sourceModuleId: link.sourceModuleId, sourceRecordId: link.sourceRecordId, targetModuleId: link.targetModuleId, targetRecordId: link.targetRecordId };
      await this.insertEvent(tx, { workspaceId, branchId, moduleId: link.sourceModuleId, recordId: link.sourceRecordId, eventType: 'record.unlinked', payload, actorUserId: session.userId });
      await this.insertEvent(tx, { workspaceId, branchId, moduleId: link.targetModuleId, recordId: link.targetRecordId, eventType: 'record.unlinked', payload, actorUserId: session.userId });
      await tx.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: session.userId, action: 'module.record.unlinked', resourceType: 'module_record_link', resourceId: link.id, metadata: payload as any } });
    });
    return { deleted: true };
  }

  @Post('events')
  @UseGuards(CsrfGuard)
  async recordEvent(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Body() raw: unknown,
    @Req() request: RequestWithBody,
  ) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    await this.branchFor(workspaceId, branchId, session.userId);
    const moduleId = requiredString(body.moduleId, 'Module ID', 80);
    const recordId = optionalString(body.recordId, 'Record ID', 160);
    const eventType = requiredString(body.eventType, 'Event type', 120);
    if (!/^[a-z][a-z0-9_.-]{1,119}$/.test(eventType)) throw new BadRequestException('Event type is invalid.');
    const payload = body.payload === undefined ? {} : asObject(body.payload, 'Event payload');
    const payloadText = JSON.stringify(payload);
    if (payloadText.length > 16_000) throw new BadRequestException('Event payload must be no larger than 16 KB.');
    const dedupeKey = optionalString(body.dedupeKey, 'Event deduplication key', 240);
    await this.assertModule(moduleId);
    if (recordId) await this.assertRecord(workspaceId, branchId, moduleId, recordId);
    const eventId = await this.insertEvent(this.prisma, { workspaceId, branchId, moduleId, recordId, eventType, payload, actorUserId: session.userId, dedupeKey });
    return { accepted: true, eventId };
  }

  @Get('events')
  async events(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Query('moduleId') moduleId: string | undefined,
    @Query('recordId') recordId: string | undefined,
    @Query('after') after: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() request: FastifyRequest,
  ): Promise<EventRow[]> {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    await this.branchFor(workspaceId, branchId, session.userId);
    if (moduleId) await this.assertModule(moduleId);
    const parsedLimit = Math.min(100, Math.max(1, Number.parseInt(limit ?? '30', 10) || 30));
    const afterDate = after ? new Date(after) : null;
    if (afterDate && Number.isNaN(afterDate.getTime())) throw new BadRequestException('Event cursor is invalid.');
    return this.prisma.$queryRaw<EventRow[]>`
      SELECT id, module_id AS "moduleId", record_id AS "recordId", event_type AS "eventType", payload,
             outbox_status AS "outboxStatus", created_at AS "createdAt", actor_user_id AS "actorUserId"
      FROM module_domain_events
      WHERE tenant_id = ${workspaceId}::uuid AND branch_id = ${branchId}::uuid
        AND (${moduleId ?? null}::text IS NULL OR module_id = ${moduleId ?? null})
        AND (${recordId ?? null}::text IS NULL OR record_id = ${recordId ?? null})
        AND (${afterDate}::timestamptz IS NULL OR created_at < ${afterDate})
      ORDER BY created_at DESC LIMIT ${parsedLimit}
    `;
  }
}
