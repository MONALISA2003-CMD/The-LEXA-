import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../src/finance/finance-operations.controller.ts', import.meta.url),'utf8');
test('bank statement endpoints convert postgres BigInt amounts to JSON strings',()=>{
  assert.match(source,/return rows\.map\(r=>\(\{\.\.\.r,amountMinor:String\(r\.amountMinor\)\}\)\)/);
  assert.match(source,/return rows\.map\(r=>\(\{\.\.\.r,debitMinor:String\(r\.debitMinor\),creditMinor:String\(r\.creditMinor\)\}\)\)/);
  assert.match(source,/matchedAmountMinor:String\(match\.matchedAmountMinor\)/);
  assert.match(source,/closingBalanceMinor:String\(row\.closingBalanceMinor\)/);
});
