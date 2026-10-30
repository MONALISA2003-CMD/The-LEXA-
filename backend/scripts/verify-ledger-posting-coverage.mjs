import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = {
  core: readFileSync(resolve(root, 'src/core/core.controller.ts'), 'utf8'),
  commerce: readFileSync(resolve(root, 'src/commerce/commerce.controller.ts'), 'utf8'),
  receivables: readFileSync(resolve(root, 'src/receivables/receivables.controller.ts'), 'utf8'),
  payables: readFileSync(resolve(root, 'src/payables/payables.controller.ts'), 'utf8'),
  ledger: readFileSync(resolve(root, 'src/general-ledger/ledger-posting.ts'), 'utf8'),
};

const requiredPostingSources = [
  ['core', 'sale_completed'],
  ['core', 'sale_payment_received'],
  ['core', 'sale_return_recorded'],
  ['core', 'stock_movement_recorded'],
  ['core', 'opening_stock_import'],
  ['commerce', 'goods_receipt_posted'],
  ['receivables', 'customer_receipt_recorded'],
  ['payables', 'supplier_invoice_approved'],
  ['payables', 'supplier_payment_recorded'],
];
const missing = requiredPostingSources.filter(([file, sourceType]) =>
  !new RegExp(`sourceType\\s*:\\s*['\"]${sourceType}['\"]`).test(files[file]),
);
if (missing.length) {
  console.error('Missing atomic source-to-ledger postings:');
  for (const [file, sourceType] of missing) console.error(` - ${file}: ${sourceType}`);
  process.exit(1);
}

for (const invariant of [
  'WHERE tenant_id=${tenantId}::uuid AND source_type=${sourceType} AND source_id=${sourceId}',
  'ON CONFLICT (tenant_id,account_code) DO NOTHING',
  "UPDATE ledger_journals SET status='posted'",
  'debitTotal !== creditTotal',
]) {
  if (!files.ledger.includes(invariant)) {
    console.error(`Ledger posting helper is missing invariant: ${invariant}`);
    process.exit(1);
  }
}

const branchScopedControllers = ['commerce', 'receivables', 'payables'];
for (const controller of branchScopedControllers) {
  const source = files[controller];
  if (!source.includes("import { assertBranchAccess } from '../authorization/branch-scope'") || !source.includes('await assertBranchAccess(')) {
    console.error(`${controller} controller is missing a server-side branch-scope check.`);
    process.exit(1);
  }
}
if (!files.core.includes('await assertBranchAccess(')) {
  console.error('Core controller is missing the shared branch-scope check.');
  process.exit(1);
}

console.log(`Ledger coverage passed: ${requiredPostingSources.length} source workflows, idempotency/balance invariants and branch checks.`);
