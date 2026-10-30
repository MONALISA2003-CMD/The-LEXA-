import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CoreController } from './core/core.controller';
import { CsrfGuard } from './core/csrf.guard';
import { ModuleGraphController } from './module-graph/module-graph.controller';
import { CommerceController } from './commerce/commerce.controller';
import { ReceivablesController } from './receivables/receivables.controller';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController, CoreController, ModuleGraphController, CommerceController, ReceivablesController],
  providers: [CsrfGuard],
})
export class AppModule {}
