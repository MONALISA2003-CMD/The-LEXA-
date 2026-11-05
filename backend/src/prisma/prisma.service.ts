import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { currentCorrelationId } from '../request-correlation';

type TenantDbContext = { tenantId?: string; userId?: string; sessionTokenHash?: string; resetTokenHash?: string; signupEmail?: string; signupTokenHash?: string };
const tenantDbContext = new AsyncLocalStorage<TenantDbContext>();
const MODEL_DELEGATES = new Set([
  'tenant','businessProfile','businessPaymentMethod','user','membership','branch','branchMembership','ledgerAccount','accountingPeriod','ledgerJournal','ledgerJournalLine',
  'auditEvent','idempotencyRecord','session','passwordResetToken','signupVerification','category','product','moduleRecord','stockMovement','sale','saleLine',
  'salePayment','saleReturn','saleReturnLine','workspaceInvitation','unitOfMeasure','productVariant','taxCode','priceList','priceListItem',
  'warehouse','storageBin','inventoryLot','inventorySerial','stockReservation','creditNote','creditNoteLine','cashSession','cashMovement',
  // Every tenant-owned electronics and inventory delegate MUST run through the
  // transaction-scoped runtime role + app.tenant_id context (including reads).
  'productPackage','catalogBrand','catalogDeviceModel','accessoryCompatibility','inventoryUnitInspection',
  'catalogCategoryAlias','catalogBrandAlias','catalogBrandMergeProposal','catalogModelSpecRevision','catalogFamilyPolicy',
  'cashUp','bankAccount','bankStatementLine','bankReconciliation','bankReconciliationMatch','expenseCategory','expense','fixedAsset',
  'fixedAssetDepreciation','costCentre','costCentreAllocation','taxRule',
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const configuredUrl = process.env.DATABASE_URL;
    if (!configuredUrl) throw new Error('DATABASE_URL must be configured for the LEXA API.');
    let databaseUrl: URL;
    try { databaseUrl = new URL(configuredUrl); } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.'); }
    const startupOptions = databaseUrl.searchParams.get('options') ?? '';
    if (/(?:^|\s)(?:-c\s+)?role\s*=/i.test(startupOptions)) {
      throw new Error('DATABASE_URL must not contain a PostgreSQL role startup option; use DATABASE_RUNTIME_ROLE transaction-locally.');
    }
    // Keep Neon's pooled DATABASE_URL unchanged. PgBouncer rejects PostgreSQL's
    // startup `options=-c role=...` parameter, so apply the least-privileged role
    // transaction-locally below, after PgBouncer has pinned a connection.
    // Configure DATABASE_RUNTIME_ROLE only after the matching GRANT exists.
    const runtimeRole = process.env.DATABASE_RUNTIME_ROLE?.trim();
    if (process.env.NODE_ENV === 'production' && !runtimeRole) {
      throw new Error('DATABASE_RUNTIME_ROLE=lexa_app_runtime is required in production.');
    }
    if (runtimeRole && (runtimeRole !== 'lexa_app_runtime' || !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(runtimeRole))) {
      throw new Error('DATABASE_RUNTIME_ROLE must be the approved PostgreSQL role lexa_app_runtime.');
    }
    super({ adapter: new PrismaPg({ connectionString: configuredUrl }) });

    const base = this;
    const context = () => tenantDbContext.getStore();
    const setContext = async (tx: any, overrides: TenantDbContext = {}) => {
      const current = { ...(context() ?? {}), ...overrides };
      if (runtimeRole) {
        // SET LOCAL ROLE is scoped to this transaction and is compatible with
        // Neon's transaction pooler. It is reset automatically on commit/rollback.
        await tx.$queryRaw`SELECT set_config('role', ${runtimeRole}, true)`;
      }
      await tx.$queryRaw`SELECT
        set_config('app.tenant_id', ${current.tenantId ?? ''}, true),
        set_config('app.user_id', ${current.userId ?? ''}, true),
        set_config('app.session_token_hash', ${current.sessionTokenHash ?? ''}, true),
        set_config('app.reset_token_hash', ${current.resetTokenHash ?? ''}, true),
        set_config('app.signup_email', ${current.signupEmail ?? ''}, true),
        set_config('app.signup_token_hash', ${current.signupTokenHash ?? ''}, true),
        set_config('app.correlation_id', ${currentCorrelationId() ?? ''}, true)`;
    };
    const runInTenantTransaction = async (operation: (tx: any) => Promise<any>) => {
      return base.$transaction(async (tx: any) => {
        await setContext(tx);
        return operation(tx);
      });
    };

    const proxy = new Proxy(this, {
      get(target, property, receiver) {
        if (property === 'enterTenantContext') return (tenantId?: string, userId?: string) => {
          tenantDbContext.enterWith({ tenantId, userId });
        };
        if (property === 'runWithTenantContext') return <T>(value: TenantDbContext, work: () => T) => tenantDbContext.run(value, work);
        if (property === 'currentTenantContext') return () => context();

        if (property === '$transaction') {
          return (arg: any, options?: any) => {
            if (Array.isArray(arg)) throw new Error('Batch $transaction is disabled with tenant RLS; use an interactive transaction callback.');
            return target.$transaction(async (tx: any) => {
              await setContext(tx);
              return arg(tx);
            }, options);
          };
        }
        if (property === '$queryRaw' || property === '$executeRaw' || property === '$queryRawUnsafe' || property === '$executeRawUnsafe') {
          return (...args: any[]) => runInTenantTransaction(async (tx: any) => Reflect.apply(tx[property], tx, args));
        }

        const value = Reflect.get(target, property, target);
        if (typeof property === 'string' && MODEL_DELEGATES.has(property) && value && typeof value === 'object') {
          return new Proxy(value, {
            get(delegate, operation) {
              const method = Reflect.get(delegate, operation, delegate);
              if (typeof method !== 'function') return method;
              return (...args: any[]) => runInTenantTransaction(async (tx: any) => {
                const txDelegate = tx[property];
                const whereHash = args[0]?.where?.tokenHash;
                if (property === 'session' && ['findFirst','deleteMany'].includes(String(operation)) && typeof whereHash === 'string') {
                  await tx.$queryRaw`SELECT set_config('app.session_token_hash', ${whereHash}, true)`;
                }
                if (property === 'passwordResetToken' && ['findFirst','deleteMany'].includes(String(operation)) && typeof whereHash === 'string') {
                  await tx.$queryRaw`SELECT set_config('app.reset_token_hash', ${whereHash}, true)`;
                }
                if ((property === 'session' || property === 'passwordResetToken') && operation === 'create') {
                  const userId = args[0]?.data?.userId;
                  if (typeof userId === 'string') await tx.$queryRaw`SELECT set_config('app.user_id', ${userId}, true)`;
                }
                return Reflect.apply(txDelegate[operation], txDelegate, args);
              });
            },
          });
        }
        if (typeof value === 'function') return value.bind(target);
        return value;
      },
    });
    return proxy as this;
  }

  enterTenantContext(_tenantId?: string, _userId?: string): void { /* implemented by request proxy */ }
  runWithTenantContext<T>(_context: TenantDbContext, work: () => T): T { return tenantDbContext.run(_context, work); }
  currentTenantContext(): TenantDbContext | undefined { return tenantDbContext.getStore(); }

  async onModuleInit(): Promise<void> { await this.$connect(); }
  async onModuleDestroy(): Promise<void> { await this.$disconnect(); }
}
