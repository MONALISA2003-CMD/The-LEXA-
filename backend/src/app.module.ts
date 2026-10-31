import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CoreController } from './core/core.controller';
import { CsrfGuard } from './core/csrf.guard';
import { TypedModuleWriteGuard } from './core/typed-module-write.guard';
import { ModuleGraphController } from './module-graph/module-graph.controller';
import { CommerceController } from './commerce/commerce.controller';
import { ReceivablesController } from './receivables/receivables.controller';
import { PayablesController } from './payables/payables.controller';
import { TenantAuthorizationGuard } from './authorization/tenant-authorization.guard';
import { GeneralLedgerController } from './general-ledger/general-ledger.controller';
import { InvitationsController } from './invitations/invitations.controller';
import { CatalogInventoryController } from './commerce/catalog-inventory.controller';
import { FinanceOperationsController } from './finance/finance-operations.controller';
import { SupplyChainController } from './supply-chain/supply-chain.controller';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController, CoreController, ModuleGraphController, CommerceController, ReceivablesController, PayablesController, GeneralLedgerController, InvitationsController, CatalogInventoryController, FinanceOperationsController, SupplyChainController],
  providers: [CsrfGuard, { provide: APP_GUARD, useClass: TenantAuthorizationGuard }, { provide: APP_GUARD, useClass: TypedModuleWriteGuard }],
})
export class AppModule {}
