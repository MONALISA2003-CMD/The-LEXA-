import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

type TenantDbContext = { tenantId?: string; userId?: string; sessionTokenHash?: string; resetTokenHash?: string };
const tenantDbContext = new AsyncLocalStorage<TenantDbContext>();
const MODEL_DELEGATES = new Set([
  'tenant','user','membership','branch','branchMembership','ledgerAccount','accountingPeriod','ledgerJournal','ledgerJournalLine',
  'auditEvent','idempotencyRecord','session','passwordResetToken','category','product','moduleRecord','stockMovement','sale','saleLine',
  'salePayment','saleReturn','saleReturnLine','workspaceInvitation','unitOfMeasure','productVariant','taxCode','priceList','priceListItem',
  'warehouse','storageBin','inventoryLot','inventorySerial','stockReservation','creditNote','creditNoteLine','cashSession','cashMovement',
  'cashUp','bankAccount','bankStatementLine','bankReconciliation','bankReconciliationMatch','expenseCategory','expense','fixedAsset',
  'fixedAssetDepreciation','costCentre','costCentreAllocation','taxRule',
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const configuredUrl = process.env.DATABASE_URL;
    if (!configuredUrl) throw new Error('DATABASE_URL must be configured for the LEXA API.');
    // Runtime should use a least-privileged role. Configure DATABASE_RUNTIME_ROLE
    // only after the matching GRANT exists in PostgreSQL.
    let connectionString = configuredUrl;
    const runtimeRole = process.env.DATABASE_RUNTIME_ROLE?.trim();
    if (runtimeRole) {
      const url = new URL(configuredUrl);
      const options = url.searchParams.get('options');
      url.searchParams.set('options', [options, `-c role=${runtimeRole}`].filter(Boolean).join(' '));
      connectionString = url.toString();
    }
    super({ adapter: new PrismaPg({ connectionString }) });

    const base = this;
    const context = () => tenantDbContext.getStore();
    const setContext = async (tx: any, overrides: TenantDbContext = {}) => {
      const current = { ...(context() ?? {}), ...overrides };
      await tx.$executeRaw`SELECT
        set_config('app.tenant_id', ${current.tenantId ?? ''}, true),
        set_config('app.user_id', ${current.userId ?? ''}, true),
        set_config('app.session_token_hash', ${current.sessionTokenHash ?? ''}, true),
        set_config('app.reset_token_hash', ${current.resetTokenHash ?? ''}, true)`;
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
                  await tx.$executeRaw`SELECT set_config('app.session_token_hash', ${whereHash}, true)`;
                }
                if (property === 'passwordResetToken' && ['findFirst','deleteMany'].includes(String(operation)) && typeof whereHash === 'string') {
                  await tx.$executeRaw`SELECT set_config('app.reset_token_hash', ${whereHash}, true)`;
                }
                if ((property === 'session' || property === 'passwordResetToken') && operation === 'create') {
                  const userId = args[0]?.data?.userId;
                  if (typeof userId === 'string') await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
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
