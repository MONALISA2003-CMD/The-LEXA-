import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const controller=readFileSync(new URL('../src/finance/finance-operations.controller.ts',import.meta.url),'utf8');
const helper=readFileSync(new URL('../src/general-ledger/ledger-posting.ts',import.meta.url),'utf8');
const section=(from,to)=>controller.slice(controller.indexOf(from),controller.indexOf(to,controller.indexOf(from)+1));
test('approval accrues expenses but does not claim cash was paid',()=>{
  const source=section('async approveExpense(',"@Get('expense-categories')");
  assert.match(source,/sourceType:'expense_approved'/);
  assert.match(source,/accountKey:'accrued_expenses',creditMinor/);
  assert.doesNotMatch(source,/description:'Expense paid'/);
});
test('expense settlement only posts after approval with a matching accrued liability',()=>{
  const source=section('async payApprovedExpense(',"@Get('cost-centres')");
  assert.match(source,/if\(expense.status!=='approved'\)/);
  assert.match(source,/if\(accrued!==expense.total_minor\)/);
  assert.match(source,/sourceType:'expense_payment',sourceId:id/);
  assert.match(source,/settlementAccountKey\(method\)/);
  assert.match(source,/status:'paid'/);
  assert.match(source,/isolationLevel:'Serializable'/);
  assert.ok(helper.includes("'accrued_expenses'"));
});
