import { randomUUID } from 'node:crypto';

type LedgerLineInput = {
  accountKey: string;
  debitMinor?: number;
  creditMinor?: number;
  description?: string;
};

type LedgerPostingInput = {
  tenantId: string;
  branchId: string;
  actorUserId: string;
  sourceType: string;
  sourceId: string;
  memo: string;
  entryDate?: string;
  lines: LedgerLineInput[];
};

const DEFAULT_ACCOUNTS: Array<[string, string, string, string, string]> = [
  ['1000', 'Cash on hand', 'asset', 'debit', 'cash'],
  ['1010', 'Bank accounts', 'asset', 'debit', 'bank'],
  ['1020', 'Mobile money clearing', 'asset', 'debit', 'mobile_money'],
  ['1030', 'Other payment clearing', 'asset', 'debit', 'other_clearing'],
  ['1100', 'Accounts receivable control', 'asset', 'debit', 'accounts_receivable'],
  ['1200', 'Inventory control', 'asset', 'debit', 'inventory'],
  ['1300', 'Input tax recoverable', 'asset', 'debit', 'input_tax'],
  ['2000', 'Accounts payable control', 'liability', 'credit', 'accounts_payable'],
  ['2050', 'Goods received not invoiced', 'liability', 'credit', 'goods_received_not_invoiced'],
  ['2100', 'Tax payable', 'liability', 'credit', 'tax_payable'],
  ['2200', 'Customer credit balances', 'liability', 'credit', 'customer_credit_liability'],
  ['3000', 'Owner equity', 'equity', 'credit', 'owner_equity'],
  ['4000', 'Sales revenue', 'revenue', 'credit', 'sales_revenue'],
  ['4050', 'Sales returns and allowances', 'revenue', 'debit', 'sales_returns'],
  ['4100', 'Other income', 'revenue', 'credit', 'other_income'],
  ['4200', 'Inventory adjustment gains', 'revenue', 'credit', 'inventory_adjustment_gain'],
  ['5000', 'Cost of goods sold', 'expense', 'debit', 'cost_of_goods_sold'],
  ['5100', 'Purchase price variance', 'expense', 'debit', 'purchase_price_variance'],
  ['5200', 'Inventory shrinkage and write-offs', 'expense', 'debit', 'inventory_shrinkage'],
  ['6000', 'Operating expenses', 'expense', 'debit', 'operating_expenses'],
];

function kampalaDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function assertPositiveMinor(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 9_000_000_000_000) {
    throw new Error(`${label} must be a positive, safe integer in minor currency units.`);
  }
}

/**
 * Post an immutable, balanced journal inside the caller's existing transaction.
 * Source-level uniqueness makes retries safe and keeps the business write and
 * accounting projection atomic. This never opens its own database transaction.
 */
export async function postLedgerJournal(tx: any, input: LedgerPostingInput): Promise<string> {
  const tenantId = input.tenantId;
  const branchId = input.branchId;
  const sourceType = input.sourceType.trim();
  const sourceId = input.sourceId.trim();
  if (!sourceType || sourceType.length > 80 || !sourceId || sourceId.length > 160) {
    throw new Error('Ledger source identity is invalid.');
  }

  const existing = await tx.$queryRaw<any[]>`
    SELECT id FROM ledger_journals
    WHERE tenant_id=${tenantId}::uuid AND source_type=${sourceType} AND source_id=${sourceId}
    LIMIT 1`;
  if (existing.length) return String(existing[0].id);

  for (const [code, name, kind, normal, systemKey] of DEFAULT_ACCOUNTS) {
    await tx.$executeRaw`
      INSERT INTO ledger_accounts (id,tenant_id,account_code,account_name,account_type,normal_balance,system_key)
      VALUES (gen_random_uuid(),${tenantId}::uuid,${code},${name},${kind},${normal},${systemKey})
      ON CONFLICT (tenant_id,account_code) DO NOTHING`;
  }

  const entryDate = input.entryDate ?? kampalaDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) throw new Error('Ledger entry date must use YYYY-MM-DD.');
  if (!Array.isArray(input.lines) || input.lines.length < 2 || input.lines.length > 100) {
    throw new Error('A ledger journal requires between 2 and 100 lines.');
  }
  const lines = input.lines.map((line, index) => {
    const debitMinor = line.debitMinor ?? 0;
    const creditMinor = line.creditMinor ?? 0;
    if (!Number.isSafeInteger(debitMinor) || !Number.isSafeInteger(creditMinor) || debitMinor < 0 || creditMinor < 0 || (debitMinor > 0) === (creditMinor > 0)) {
      throw new Error(`Ledger line ${index + 1} must have one positive debit or credit.`);
    }
    return { ...line, debitMinor, creditMinor };
  });
  const debitTotal = lines.reduce((sum, line) => sum + line.debitMinor, 0);
  const creditTotal = lines.reduce((sum, line) => sum + line.creditMinor, 0);
  assertPositiveMinor(debitTotal, 'Journal debit total');
  assertPositiveMinor(creditTotal, 'Journal credit total');
  if (debitTotal !== creditTotal) throw new Error('Ledger journal debits and credits do not balance.');

  const keys = [...new Set(lines.map((line) => line.accountKey))];
  const accounts = await tx.$queryRaw<any[]>`
    SELECT id,system_key FROM ledger_accounts
    WHERE tenant_id=${tenantId}::uuid AND is_active=true AND system_key=ANY(${keys}::text[])
    FOR SHARE`;
  const accountIds = new Map(accounts.map((account) => [String(account.system_key), String(account.id)]));
  const missing = keys.filter((key) => !accountIds.has(key));
  if (missing.length) throw new Error(`Required ledger account(s) are missing or inactive: ${missing.join(', ')}.`);

  const journalId = randomUUID();
  const number = `AUTO-${entryDate.replace(/-/g, '')}-${journalId.slice(0, 8).toUpperCase()}`;
  await tx.$executeRaw`
    INSERT INTO ledger_journals
      (id,tenant_id,branch_id,journal_number,entry_date,memo,status,source_type,source_id,created_by_user_id)
    VALUES (${journalId}::uuid,${tenantId}::uuid,${branchId}::uuid,${number},${entryDate}::date,${input.memo.slice(0,500)},'draft',${sourceType},${sourceId},${input.actorUserId}::uuid)`;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    await tx.$executeRaw`
      INSERT INTO ledger_journal_lines
        (id,tenant_id,journal_id,line_number,account_id,description,debit_minor,credit_minor)
      VALUES (${randomUUID()}::uuid,${tenantId}::uuid,${journalId}::uuid,${index + 1},${accountIds.get(line.accountKey)}::uuid,${line.description?.slice(0,300) ?? null},${line.debitMinor},${line.creditMinor})`;
  }
  await tx.$executeRaw`
    UPDATE ledger_journals SET status='posted',posted_by_user_id=${input.actorUserId}::uuid,posted_at=CURRENT_TIMESTAMP
    WHERE tenant_id=${tenantId}::uuid AND id=${journalId}::uuid AND status='draft'`;
  await tx.auditEvent.create({
    data: {
      tenantId,
      actorUserId: input.actorUserId,
      action: 'ledger.source.posted',
      resourceType: 'ledger_journal',
      resourceId: journalId,
      metadata: { sourceType, sourceId, debitMinor: debitTotal, creditMinor: creditTotal },
    },
  });
  return journalId;
}

export function settlementAccountKey(method: string): string {
  if (method === 'mtn_momo' || method === 'airtel_money') return 'mobile_money';
  if (method === 'bank_transfer' || method === 'card_recorded' || method === 'cheque') return 'bank';
  if (method === 'other') return 'other_clearing';
  return 'cash';
}
