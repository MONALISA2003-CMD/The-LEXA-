import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) { console.error('DATABASE_URL is required for schema integrity verification.'); process.exit(2); }

const client = new Client({ connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 15_000 });
const requiredTables = [
  'tenants','users','memberships','branches','branch_memberships','products','sales','sale_lines','sale_return_lines','sale_payments','stock_movements',
  'commerce_purchase_orders','commerce_goods_receipts','ar_customer_invoices','ar_customer_receipts','ap_supplier_invoices','ap_supplier_payments',
  'ledger_accounts','accounting_periods','ledger_journals','ledger_journal_lines','audit_events','idempotency_records',
];

try {
  await client.connect();
  const tables = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`);
  const tableNames = new Set(tables.rows.map((row) => row.tablename));
  const missing = requiredTables.filter((name) => !tableNames.has(name));
  if (missing.length) throw new Error(`Missing required tables: ${missing.join(', ')}`);

  const columns = await client.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('sale_lines','sale_return_lines','sale_payments','stock_movements','memberships')`);
  const columnSet = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
  for (const required of ['sale_lines.unit_cost_minor','sale_return_lines.disposition','sale_payments.ledger_source','stock_movements.unit_cost_minor','memberships.branch_scope_mode']) if (!columnSet.has(required)) throw new Error(`Missing required cost snapshot column: ${required}`);

  const triggers = await client.query(`SELECT tgname,tgenabled FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('ledger_journals_guard','ledger_journal_lines_guard','accounting_periods_guard')`);
  const enabled = new Set(triggers.rows.filter((row) => row.tgenabled !== 'D').map((row) => row.tgname));
  for (const required of ['ledger_journals_guard','ledger_journal_lines_guard','accounting_periods_guard']) if (!enabled.has(required)) throw new Error(`Required ledger integrity trigger is missing or disabled: ${required}`);

  const missingSystemAccounts = await client.query(`
    WITH required(system_key) AS (VALUES
      ('cash'),('bank'),('mobile_money'),('other_clearing'),('accounts_receivable'),('inventory'),('input_tax'),
      ('accounts_payable'),('goods_received_not_invoiced'),('tax_payable'),('customer_credit_liability'),('owner_equity'),
      ('sales_revenue'),('sales_returns'),('other_income'),('inventory_adjustment_gain'),('cost_of_goods_sold'),
      ('purchase_price_variance'),('inventory_shrinkage'),('operating_expenses')
    )
    SELECT t.id AS tenant_id, r.system_key FROM tenants t CROSS JOIN required r
    LEFT JOIN ledger_accounts a ON a.tenant_id=t.id AND a.system_key=r.system_key
    WHERE a.id IS NULL
  `);
  if (missingSystemAccounts.rowCount) throw new Error(`Missing seeded ledger system accounts: ${missingSystemAccounts.rows.map((row) => `${row.tenant_id}:${row.system_key}`).join(', ')}`);

  const overlappingPeriods = await client.query(`
    SELECT a.tenant_id,a.period_key,b.period_key AS overlapping_period
    FROM accounting_periods a JOIN accounting_periods b ON b.tenant_id=a.tenant_id AND b.id>a.id
      AND daterange(a.starts_on,a.ends_on,'[]') && daterange(b.starts_on,b.ends_on,'[]') LIMIT 1
  `);
  if (overlappingPeriods.rowCount) throw new Error(`Overlapping accounting periods detected for tenant ${overlappingPeriods.rows[0].tenant_id}.`);

  const openHistoricalPeriods = await client.query(`
    SELECT tenant_id,period_key FROM accounting_periods
    WHERE status='open' AND starts_on < date_trunc('month',CURRENT_DATE)::date LIMIT 1
  `);
  if (openHistoricalPeriods.rowCount) throw new Error(`Historical accounting period must be closed before posting: ${openHistoricalPeriods.rows[0].tenant_id}:${openHistoricalPeriods.rows[0].period_key}.`);

  const branchFk = await client.query(`SELECT conname FROM pg_constraint WHERE conrelid='public.branch_memberships'::regclass AND contype='f'`);
  if (branchFk.rows.length < 3) throw new Error('Branch membership foreign-key constraints are incomplete.');

  const sourceKey = await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='ledger_journals' AND indexname='ledger_journals_source_key'`);
  if (!sourceKey.rowCount) throw new Error('Source uniqueness index for idempotent ledger postings is missing.');

  const dispositionCheck = await client.query(`SELECT 1 FROM pg_constraint WHERE conrelid='public.sale_return_lines'::regclass AND conname='sale_return_lines_disposition_check'`);
  if (!dispositionCheck.rowCount) throw new Error('Return disposition validation constraint is missing.');
  const ledgerSourceCheck = await client.query(`SELECT 1 FROM pg_constraint WHERE conrelid='public.sale_payments'::regclass AND conname='sale_payments_ledger_source_check'`);
  if (!ledgerSourceCheck.rowCount) throw new Error('Sale payment ledger-source validation constraint is missing.');

  console.log(`Schema integrity verified: ${requiredTables.length} required tables, cost and source snapshots, return disposition, branch FKs, seeded ledger accounts, non-overlapping periods, integrity triggers and source uniqueness.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
