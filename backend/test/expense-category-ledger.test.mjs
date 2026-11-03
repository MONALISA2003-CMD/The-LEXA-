import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root=new URL('../src/',import.meta.url);
const ledger=readFileSync(new URL('general-ledger/ledger-posting.ts',root),'utf8');
const finance=readFileSync(new URL('finance/finance-operations.controller.ts',root),'utf8');
test('approved expenses debit the selected tenant-owned expense category account instead of a catch-all',()=>{
 assert.match(finance,/expenseAccountId=category\.ledgerAccountId/);
 assert.match(finance,/accountKey:'operating_expenses',accountId:expenseAccountId,debitMinor:/);
 assert.match(finance,/journalId,accountId:expenseAccountId/);
 assert.doesNotMatch(finance,/expenseAccount=accounts\[0\]\?\.system_key\|\|'operating_expenses'/);
});
test('explicit expense ledger postings reject inactive, cross-tenant and non-expense accounts',()=>{
 assert.match(ledger,/tenant_id=\$\{tenantId\}::uuid AND is_active=true AND id=ANY\(\$\{customIds\}::uuid\[\]\)/);
 assert.match(ledger,/account\.account_type !== 'expense'/);
 assert.match(ledger,/line\.accountId \?\? accountIds\.get\(line\.accountKey\)/);
});
