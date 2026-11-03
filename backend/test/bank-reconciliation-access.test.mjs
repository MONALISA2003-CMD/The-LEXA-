import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/finance/finance-operations.controller.ts', import.meta.url), 'utf8');
test('finance reconciliation exposes tenant-authorized, branch-scoped read endpoints', () => {
  for (const route of ["bank-reconciliations", "bank-accounts/:accountId/statement-lines", "bank-accounts/:accountId/posted-ledger-lines"]) {
    assert.ok(source.includes(`@Get('${route}')`), `${route} must be served`);
  }
  assert.match(source, /bank\.ledgerAccountId/);
  assert.match(source, /NOT EXISTS\(SELECT 1 FROM bank_reconciliation_matches m/);
});
test('matching refuses other account lines and reuse of a journal line', () => {
  const begin=source.indexOf("async matchBankLine(");
  const end=source.indexOf("@Post('bank-reconciliations/:reconciliationId/complete')",begin);
  const method=source.slice(begin,end);
  assert.ok(begin>0 && end>begin);
  assert.match(method, /Select a posted bank-ledger line for this bank account/);
  assert.match(method, /This ledger line has already been matched/);
  assert.match(method, /statementLineId,tenantId:w,bankAccountId:rec.bankAccountId/);
  assert.match(method, /Serializable/);
});
