import { Controller, Get, ServiceUnavailableException, Req } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  health(): { status: string; version: string } {
    return { status: 'ok', version: '1.0.0' };
  }

  @Get('live')
  live(): { status: string; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: 'lexa-api',
      timestamp: new Date().toISOString(),
    };
  }


  @Get('metrics')
  async metrics(@Req() request: any): Promise<{ metrics: Record<string, number> }> {
    const token = process.env.METRICS_TOKEN;
    if (!token || request.headers.authorization !== `Bearer ${token}`) {
      throw new ServiceUnavailableException('Metrics endpoint is not configured or authorized.');
    }
    const rows = await this.prisma.$queryRaw<Array<{ name: string; value: bigint | number }>>`
      SELECT 'lexa_platform_jobs_queued' AS name, count(*)::bigint AS value FROM platform_jobs WHERE status='queued'
      UNION ALL SELECT 'lexa_platform_jobs_failed', count(*)::bigint FROM platform_jobs WHERE status IN ('failed','dead_letter')
      UNION ALL SELECT 'lexa_attachments_pending_scan', count(*)::bigint FROM platform_attachments WHERE status='pending_scan'
      UNION ALL SELECT 'lexa_attachments_quarantined', count(*)::bigint FROM platform_attachments WHERE status='quarantined'
      UNION ALL SELECT 'lexa_outbox_pending', count(*)::bigint FROM module_domain_events WHERE outbox_status IN ('pending','failed')
    `;
    return { metrics: Object.fromEntries(rows.map((row) => [row.name, Number(row.value)])) };
  }

  @Get('ready')
  async ready(): Promise<{ status: string; dependencies: { database: string } }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', dependencies: { database: 'ok' } };
    } catch {
      throw new ServiceUnavailableException('Service is not ready');
    }
  }
}
