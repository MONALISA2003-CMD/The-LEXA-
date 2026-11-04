import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const source = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');


test('new finance budget table is included in tenant backups rather than silently omitted', () => {
  const inventory = JSON.parse(source('../backup/authoritative-inventory.json'));
  const entry = inventory.find((item) => item.table === 'finance_budgets');
  assert.ok(entry, 'New budget records must be covered by the authoritative backup inventory');
  assert.equal(entry.disposition, 'authoritative');
  assert.equal(entry.domain, 'finance');
  assert.equal(inventory.filter((item) => item.table === 'finance_budgets').length, 1);
  const worker = source('../src/platform/platform-jobs.ts');
  assert.match(worker, /x\.disposition==='authoritative'/);
  assert.match(worker, /tenant_id=\$1 AND id::text>\$2/);
});

test('finance budget lifecycle is scoped to one tenant and branch, with independent approval', () => {
  const budget = source('../src/finance/finance-intelligence.controller.ts');
  const migration = source('../prisma/migrations/20261104090000_finance_budgets/migration.sql');
  assert.match(budget, /await this\.actor\(req, tenantId, branchId\)/);
  assert.match(budget, /tenantId, branchId, accountingPeriodId/);
  assert.match(budget, /row\.createdByUserId === actor/);
  assert.match(budget, /j\.tenant_id=\$\{tenantId\}::uuid AND j\.branch_id=b\.branch_id AND j\.status='posted'/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /finance_budgets_tenant_scope/);
  assert.match(migration, /UNIQUE\(tenant_id,branch_id,accounting_period_id,cost_centre_id\)/);
  assert.doesNotMatch(migration, /\b(?:DELETE FROM|TRUNCATE|INSERT INTO)\b/i);
});

test('finance generic writes cannot bypass authoritative accounting and budget approvals', () => {
  const guard = source('../src/core/typed-module-write.guard.ts');
  for (const key of ['budgets','expenses','payments','money-accounts','cash-sessions','recurring-invoices','accounting-periods']) {
    assert.match(guard, new RegExp(`'${key}'`), key);
  }
});

test('finance overview never uses demo records or client-supplied financial balances', () => {
  const controller = source('../src/finance/finance-intelligence.controller.ts');
  assert.match(controller, /j\.status='posted'/);
  assert.match(controller, /j\.tenant_id=\$\{tenantId\}::uuid AND j\.branch_id=\$\{branchId\}::uuid/);
  assert.doesNotMatch(controller, /mockRevenue|demoBalance|Math\.random\(/);
});

test('Python forecast emits no manufactured figures when ledger history is empty', () => {
  const script = new URL('../analytics/finance_intelligence.py', import.meta.url).pathname;
  const result = spawnSync('python3',[script],{input:JSON.stringify({version:1,months:[]}),encoding:'utf8',timeout:4000});
  assert.equal(result.status,0,result.stderr);
  const output=JSON.parse(result.stdout);
  assert.equal(output.hasData,false);
  assert.deepEqual(output.history,[]);
  assert.deepEqual(output.forecast,[]);
});

test('Python finance forecasts reject malformed data rather than accepting other client records', () => {
  const script = new URL('../analytics/finance_intelligence.py', import.meta.url).pathname;
  const result = spawnSync('python3',[script],{input:JSON.stringify({version:1,months:[{month:'2026-11',inflowMinor:100,outflowMinor:0},{month:'2026-11',inflowMinor:9999,outflowMinor:0}]}),encoding:'utf8',timeout:4000});
  assert.notEqual(result.status,0);
});

test('cash-up approvals require finance permission and a different approver', async () => {
  const { permissionForRequest, hasPermission } = await import('../src/authorization/role-policy.ts');
  const path='/api/v1/workspaces/w/branches/b/finance/cash-ups/00000000-0000-4000-8000-000000000000/post';
  assert.equal(permissionForRequest('POST',path),'finance.write');
  assert.equal(hasPermission('cashier','finance.write'),false);
  const controller=source('../src/finance/finance-operations.controller.ts');
  assert.match(controller,/originatingSession\.closedByUserId===actor/);
});
