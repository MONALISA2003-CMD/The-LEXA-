import type { Pool, PoolClient, QueryConfig } from 'pg';

type QueryArguments = [string | QueryConfig, unknown[]?];

function queryText(configOrText: string | QueryConfig): string {
  return typeof configOrText === 'string' ? configOrText : configOrText.text;
}

function transactionCommand(sql: string): 'begin' | 'commit' | 'rollback' | null {
  const command = sql.trim().replace(/^\(+/, '').split(/\s+/, 1)[0]?.replace(/;$/, '').toLowerCase();
  if (command === 'begin' || command === 'start') return 'begin';
  if (command === 'commit' || command === 'end') return 'commit';
  if (command === 'rollback' || command === 'abort') return 'rollback';
  return null;
}


export function assertNoRoleStartupOption(connectionString: string, variableName: string): void {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL connection URL.`);
  }
  const options = parsed.searchParams.get('options') ?? '';
  if (/(?:^|\s)(?:-c\s+)?role\s*=/i.test(options)) {
    throw new Error(`${variableName} must not contain a PostgreSQL role startup option; use transaction-local role switching instead.`);
  }
}

function configuredRuntimeRole(): string {
  const role = process.env.DATABASE_RUNTIME_ROLE?.trim();
  // Do not silently run worker tenant queries as the login role.
  if (role !== 'lexa_app_runtime' || !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(role)) {
    throw new Error('DATABASE_RUNTIME_ROLE must be set to the approved role lexa_app_runtime.');
  }
  return role;
}

async function applyTransactionContext(client: PoolClient, tenantId: string, role: string): Promise<void> {
  // This must run after BEGIN: both settings are transaction-local and work with
  // Neon's PgBouncer transaction pooler. Apply the role before tenant context.
  await client.query("SELECT set_config('role', $1, true)", [role]);
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
}

async function inScopedTransaction<T>(
  client: PoolClient,
  tenantId: string,
  role: string,
  work: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN');
  try {
    await applyTransactionContext(client, tenantId, role);
    const result = await work();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

/**
 * Add transaction-local role and tenant context to every statement made through
 * a worker pool. Explicit BEGIN/COMMIT sequences retain their original atomicity;
 * standalone pool/client queries get a short transaction of their own. This is
 * required for transaction-mode PgBouncer, where session state cannot be relied on.
 */
export function withTenantTransactionPool(base: Pool, tenantId: string): Pool {
  if (!tenantId || !tenantId.trim()) throw new Error('A tenant ID is required for a tenant-scoped worker pool.');
  const role = configuredRuntimeRole();

  const connect = async (): Promise<PoolClient> => {
    const client = await base.connect();
    let inTransaction = false;
    let released = false;

    const wrapped = new Proxy(client, {
      get(target, property, receiver) {
        if (property === 'query') {
          return async (...args: QueryArguments) => {
            const sql = queryText(args[0] as string | QueryConfig);
            const command = transactionCommand(sql);

            if (command === 'begin') {
              if (inTransaction) throw new Error('Nested transactions are not supported by the tenant-scoped worker pool.');
              const result = await target.query(args[0] as any, args[1] as any);
              inTransaction = true;
              try {
                await applyTransactionContext(target, tenantId, role);
                return result;
              } catch (error) {
                await target.query('ROLLBACK').catch(() => undefined);
                inTransaction = false;
                throw error;
              }
            }

            if (command === 'commit' || command === 'rollback') {
              const result = await target.query(args[0] as any, args[1] as any);
              inTransaction = false;
              return result;
            }

            if (inTransaction) return target.query(args[0] as any, args[1] as any);

            return inScopedTransaction(target, tenantId, role, () => target.query(args[0] as any, args[1] as any));
          };
        }

        if (property === 'release') {
          return (error?: Error | boolean) => {
            if (released) return;
            released = true;
            // Destroy an unexpectedly returned client rather than leak an open
            // transaction or transaction-local security context into the pool.
            if (inTransaction && !error) target.release(new Error('Tenant-scoped client released with an open transaction.'));
            else target.release(error as any);
          };
        }

        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return wrapped as PoolClient;
  };

  const scoped = {
    connect,
    query: async (...args: QueryArguments) => {
      const client = await base.connect();
      try {
        return await inScopedTransaction(client, tenantId, role, () => client.query(args[0], args[1]));
      } finally {
        client.release();
      }
    },
  };

  return scoped as unknown as Pool;
}
