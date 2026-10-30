import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CoreController } from './core/core.controller';
import { CsrfGuard } from './core/csrf.guard';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController, CoreController],
  providers: [CsrfGuard],
})
export class AppModule {}
