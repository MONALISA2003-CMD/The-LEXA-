import test from 'node:test';
import assert from 'node:assert/strict';
import { payrollPaymentJournalLines } from '../src/people-projects/payroll-ledger.ts';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/people-projects/people-projects.controller.ts', import.meta.url), 'utf8');
test('approved payroll net settlement creates a balanced, source-linked journal', () => {
  const lines = payrollPaymentJournalLines(1_250_000, 200_000, 1_050_000);
  assert.equal(lines.reduce((a, x) => a + (x.debitMinor ?? 0), 0), 1_250_000);
  assert.equal(lines.reduce((a, x) => a + (x.creditMinor ?? 0), 0), 1_250_000);
  assert.equal(lines.find(x => x.accountKey === 'bank')?.creditMinor, 1_050_000);
  assert.equal(lines.find(x => x.accountKey === 'payroll_withholdings')?.creditMinor, 200_000);
});
test('payroll without deductions posts only expense and bank', () => {
  assert.deepEqual(payrollPaymentJournalLines(500_000, 0, 500_000).map(x => x.accountKey), ['operating_expenses', 'bank']);
});
test('invalid, negative, and unsafe payroll settlement amounts are never posted', () => {
  for (const amounts of [[0,0,0], [300,100,300], [100,110,-10], [100,0,0], [1.5,0,1.5], [Number.MAX_SAFE_INTEGER+1,0,Number.MAX_SAFE_INTEGER+1]]) {
    assert.throws(() => payrollPaymentJournalLines(...amounts));
  }
});
test('payment writes a uniquely identified ledger journal inside payroll transaction', () => {
  const begin = source.indexOf('async recordPayrollPayment(');
  const end = source.indexOf("  @Get('projects')", begin);
  const method = source.slice(begin, end);
  assert.match(method, /status='approved'/);
  assert.match(method, /sourceType: 'payroll_payment', sourceId: id/);
  assert.match(method, /postLedgerJournal\(tx/);
  assert.match(method, /ledgerJournalId/);
});
