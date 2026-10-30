import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
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
