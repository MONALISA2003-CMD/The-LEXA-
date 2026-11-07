import { Controller, Post, Req, UnauthorizedException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { normalizeRawBody, verifyResendWebhookSignature } from './resend-signature';
import { PrismaService } from '../prisma/prisma.service';

function headerValue(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] ?? '' : value ?? ''; }
@Controller('webhooks/resend')
export class ResendWebhookController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async receive(@Req() request: FastifyRequest) {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) throw new UnauthorizedException('Resend webhook is not configured.');
    const rawBody = normalizeRawBody(request.rawBody);
    if (!rawBody || rawBody.length > 1024 * 1024) throw new BadRequestException('Webhook body is missing or exceeds the allowed size.');
    const id = headerValue(request.headers['svix-id']);
    const timestamp = headerValue(request.headers['svix-timestamp']);
    const signature = headerValue(request.headers['svix-signature']);
    if (!verifyResendWebhookSignature(rawBody, id, timestamp, signature, secret)) throw new UnauthorizedException('Webhook signature is invalid, expired or replayed.');
    let payload: any;
    try { payload = JSON.parse(rawBody.toString('utf8')); } catch { throw new BadRequestException('Webhook JSON is invalid.'); }
    const suppliedType = typeof payload?.type === 'string' ? payload.type : '';
    const eventType = suppliedType.length <= 120 && /^[a-z0-9_.-]+$/i.test(suppliedType) ? suppliedType : 'unknown';
    const suppliedMessageId = typeof payload?.data?.email_id === 'string' ? payload.data.email_id : typeof payload?.data?.id === 'string' ? payload.data.id : null;
    const providerMessageId = suppliedMessageId && suppliedMessageId.length <= 250 ? suppliedMessageId : null;
    const eventCreatedAt = typeof payload?.created_at === 'string' && !Number.isNaN(Date.parse(payload.created_at)) ? new Date(payload.created_at) : null;
    const evidence = { eventType, providerMessageIdHash: providerMessageId ? createHash('sha256').update(providerMessageId).digest('hex') : null };
    // A signed provider request is verified above; direct runtime access to these
    // cross-tenant webhook tables is prohibited by the RLS migration.
    const route = await this.prisma.$queryRaw<Array<{
      event_uuid: string; mapped_tenant_id: string | null; mapped_delivery_id: string | null;
      already_processed: boolean;
    }>>`
      SELECT * FROM lexa_notification_webhook_claim(
        ${id},${eventType},${eventCreatedAt},${JSON.stringify(evidence)}::jsonb,${providerMessageId})`;
    const claim = route[0];
    if (!claim) throw new ServiceUnavailableException('Webhook evidence could not be recorded.');
    if (claim.already_processed) return { received: true, duplicate: true };
    if (!providerMessageId || !claim.mapped_tenant_id || !claim.mapped_delivery_id) return { received: true, mapped: false };
    const tenantId = claim.mapped_tenant_id; const deliveryId = claim.mapped_delivery_id;
    this.prisma.enterTenantContext(tenantId);
    const deliveries = await this.prisma.$queryRaw<any[]>`
      SELECT id::text,recipient_user_id::text,recipient_email FROM notification_email_deliveries
       WHERE id=${deliveryId}::uuid AND tenant_id=${tenantId}::uuid AND provider_message_id=${providerMessageId} LIMIT 1`;
    const delivery = deliveries[0];
    if (!delivery) return { received: true, mapped: false };
    if (eventType === 'email.delivered') {
      await this.prisma.$executeRaw`UPDATE notification_email_deliveries SET status='delivered',delivered_at=COALESCE(delivered_at,now()),updated_at=now() WHERE id=${deliveryId}::uuid AND tenant_id=${tenantId}::uuid`;
    } else if (eventType === 'email.bounced' || eventType === 'email.complained') {
      const reason = eventType === 'email.bounced' ? 'bounce' : 'complaint';
      if(eventType==='email.bounced') await this.prisma.$executeRaw`UPDATE notification_email_deliveries SET status='bounced',bounced_at=COALESCE(bounced_at,now()),updated_at=now() WHERE id=${deliveryId}::uuid AND tenant_id=${tenantId}::uuid`;
      else await this.prisma.$executeRaw`UPDATE notification_email_deliveries SET status='complained',complained_at=COALESCE(complained_at,now()),updated_at=now() WHERE id=${deliveryId}::uuid AND tenant_id=${tenantId}::uuid`;
      const recipientHash = createHash('sha256').update(String(delivery.recipient_email).trim().toLowerCase()).digest('hex');
      await this.prisma.$executeRaw`
        INSERT INTO notification_email_suppressions(id,tenant_id,user_id,recipient_hash,reason,source_provider_event_id,created_at)
        VALUES(gen_random_uuid(),${tenantId}::uuid,${delivery.recipient_user_id}::uuid,${recipientHash},${reason},${id},now())
        ON CONFLICT(tenant_id,user_id,recipient_hash) DO NOTHING`;
    } else if (eventType === 'email.failed') {
      await this.prisma.$executeRaw`UPDATE notification_email_deliveries SET status='failed',last_error_code='PROVIDER_FAILED',last_error_summary='Resend reported a delivery failure.',updated_at=now() WHERE id=${deliveryId}::uuid AND tenant_id=${tenantId}::uuid`;
    }
    // Confirm that the provider message still belongs to the same tenant.
    const [finished] = await this.prisma.$queryRaw<Array<{ finished: boolean }>>`
      SELECT lexa_notification_webhook_finish(
        ${id},${providerMessageId},${tenantId}::uuid,${deliveryId}::uuid) AS finished`;
    if (!finished?.finished) throw new ServiceUnavailableException('Webhook routing changed; provider may retry.');
    return { received: true, mapped: true };
  }
}
