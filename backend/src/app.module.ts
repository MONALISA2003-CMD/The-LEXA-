import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CoreController } from './core/core.controller';
import { CsrfGuard } from './core/csrf.guard';
import { ModuleGraphController } from './module-graph/module-graph.controller';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController, CoreController, ModuleGraphController],
  providers: [CsrfGuard],
})
export class AppModule {}
