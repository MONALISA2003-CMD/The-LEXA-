import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CoreController } from './core/core.controller';
import { CustomerGrowthController } from './customer-growth/customer-growth.controller';
import { BusinessSetupController } from './business-setup/business-setup.controller';
import { StaffProvisioningController } from './staff/staff-provisioning.controller';
import { PublicRegistrationController } from './auth/public-registration.controller';
import { CsrfGuard } from './core/csrf.guard';
import { TypedModuleWriteGuard } from './core/typed-module-write.guard';
import { ModuleGraphController } from './module-graph/module-graph.controller';
import { CommerceController } from './commerce/commerce.controller';
import { LogisticsPackagesController } from './commerce/logistics-packages.controller';
import { InventoryIntelligenceController } from './supply-chain/inventory-intelligence.controller';
import { DeliveryWorkflowController } from './commerce/delivery-workflow.controller';
import { ReceivablesController } from './receivables/receivables.controller';
import { PayablesController } from './payables/payables.controller';
import { TenantAuthorizationGuard } from './authorization/tenant-authorization.guard';
import { GeneralLedgerController } from './general-ledger/general-ledger.controller';
import { InvitationsController } from './invitations/invitations.controller';
import { CatalogInventoryController } from './commerce/catalog-inventory.controller';
import { ElectronicsV2Controller } from './catalog/electronics-catalogue.controller';
import { FinanceOperationsController } from './finance/finance-operations.controller';
import { FinanceIntelligenceController } from './finance/finance-intelligence.controller';
import { PlatformController } from './platform/platform.controller';
import { TaxReferenceController } from './platform/tax-reference.controller';
import { SupplyChainController } from './supply-chain/supply-chain.controller';
import { PeopleProjectsController } from './people-projects/people-projects.controller';
import { TenantRequestContextInterceptor } from './authorization/tenant-request-context.interceptor';
import { PeopleProjectsService } from './people-projects/people-projects.service';
import { NotificationCentreController } from './notifications/notification-centre.controller';
import { ResendWebhookController } from './notifications/resend-webhook.controller';
import { RecurringInvoicesController } from './receivables/recurring-invoices.controller';
import { OperationsController } from './operations/operations.controller';
import { SentryExceptionInterceptor } from './observability-interceptor';
import { CorrelationInterceptor } from './correlation-interceptor';
import { Workstream8Controller } from './workstream8/workstream8.controller';
import { ReportInsightsService } from './workstream8/report-insights.service';
import { AiRouterService } from './workstream8/ai-router.service';

@Module({
  imports: [PrismaModule],
  controllers: [CustomerGrowthController, HealthController, CoreController, BusinessSetupController, StaffProvisioningController, PublicRegistrationController, ModuleGraphController, CommerceController, DeliveryWorkflowController, LogisticsPackagesController, InventoryIntelligenceController, ReceivablesController, RecurringInvoicesController, NotificationCentreController, ResendWebhookController, OperationsController, PayablesController, GeneralLedgerController, InvitationsController, CatalogInventoryController, ElectronicsV2Controller, FinanceOperationsController, FinanceIntelligenceController, SupplyChainController, PeopleProjectsController, PlatformController, TaxReferenceController, Workstream8Controller],
  providers: [ReportInsightsService, CsrfGuard, PeopleProjectsService, AiRouterService, { provide: APP_INTERCEPTOR, useClass: TenantRequestContextInterceptor }, { provide: APP_INTERCEPTOR, useClass: CorrelationInterceptor }, { provide: APP_INTERCEPTOR, useClass: SentryExceptionInterceptor }, { provide: APP_GUARD, useClass: TenantAuthorizationGuard }, { provide: APP_GUARD, useClass: TypedModuleWriteGuard }],
})
export class AppModule {}
