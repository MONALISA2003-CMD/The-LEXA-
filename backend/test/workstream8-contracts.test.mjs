import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

test('Workstream 8 reports use operational and posted-ledger sources, not generic JSON money fields', async () => {
  const controller = await source('../src/workstream8/workstream8.controller.ts');
  for (const table of ['sales', 'sale_returns', 'sale_payments', 'stock_movements', 'products', 'ar_customer_invoices', 'ar_customer_receipt_allocations', 'ap_supplier_invoices', 'ap_supplier_payment_allocations', 'ledger_journals', 'ledger_journal_lines', 'ledger_accounts', 'module_records', 'hr_employees', 'hr_attendance']) {
    assert.match(controller, new RegExp(`\\b${table}\\b`), `missing authoritative table ${table}`);
  }
  assert.match(controller, /No generic module JSON amount fields are used/);
  assert.doesNotMatch(controller, /module_records[^`]*data\s*->>\s*'amount'/i);
  assert.match(controller, /j\.status='posted'/);
  assert.match(controller, /inventoryCostMinor/);
  assert.match(controller, /reconciliation/);
  assert.match(controller, /tracked_products/);
  assert.match(controller, /ai_budget_micros_monthly: number/);
  assert.match(controller, /amount_micros: number/);
});

test('AI provider policy separates public help from paid business aggregates and has no model write tools', async () => {
  const [controller, app, config, bootstrap] = await Promise.all([
    source('../src/workstream8/workstream8.controller.ts'),
    source('../../services/intelligence/app/main.py'),
    source('../../services/intelligence/litellm/config.yaml'),
    source('../../services/intelligence/litellm/entrypoint.py'),
  ]);
  assert.match(controller, /PAID_MODEL_ALIASES = new Set\(\['lexa-business-paid'\]\)/);
  assert.match(controller, /PUBLIC_HELP_MODEL_ALIAS = 'lexa-public-help'/);
  assert.match(controller, /confidential_aggregate/);
  assert.match(controller, /FOR UPDATE OF s/);
  assert.match(controller, /tenant_usage_counters/);
  assert.match(controller, /provider_model/);
  assert.match(app, /Do not write code or provide software engineering explanations/);
  assert.match(app, /no tools, database connection, browser, file-system access/);
  assert.match(app, /public_product_question_only/);
  assert.match(config, /model_name: lexa-business-paid/);
  assert.match(config, /model_name: lexa-public-help/);
  const publicPoolStart = config.indexOf('# Public product-help pool');
  assert.ok(publicPoolStart > 0, 'provider pools must have an explicit boundary');
  assert.doesNotMatch(config.slice(0, publicPoolStart), /\b(openrouter|groq|cerebras|huggingface)\//i);
  assert.match(config.slice(publicPoolStart), /openrouter\//);
  assert.match(config.slice(publicPoolStart), /groq\//);
  assert.match(config.slice(publicPoolStart), /cerebras\//);
  assert.match(bootstrap, /LEXA_AI_HF_ENABLED/);
  assert.match(bootstrap, /os\.execv/);
  assert.match(app, /x-litellm-response-cost/);
  assert.match(app, /business_question_allowed/);
});

test('SaaS controls include plan ceilings, database seat/branch triggers, feature overrides and support audit', async () => {
  const [migration, controller, core, invitations] = await Promise.all([
    source('../prisma/migrations/20261101180000_workstream8_saas_ai_reporting/migration.sql'),
    source('../src/workstream8/workstream8.controller.ts'),
    source('../src/core/core.controller.ts'),
    source('../src/invitations/invitations.controller.ts'),
  ]);
  assert.match(migration, /lexa_enforce_tenant_branch_limit/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OF tenant_id ON branches/);
  assert.match(migration, /lexa_enforce_tenant_seat_limit/);
  assert.match(migration, /tenant_subscriptions/);
  assert.match(migration, /tenant_usage_counters/);
  assert.match(controller, /saas\.feature_management/);
  assert.match(controller, /tenant_support_access_audit/);
  assert.match(core, /PLAN_BRANCH_LIMIT_REACHED/);
  assert.match(invitations, /PLAN_USER_LIMIT_REACHED/);
  assert.match(controller, /FOR UPDATE OF s/);
});

test('Document extraction stays local, bounded, and separate from model inference', async () => {
  const [controller, app, main] = await Promise.all([
    source('../src/workstream8/workstream8.controller.ts'),
    source('../../services/intelligence/app/main.py'),
    source('../src/main.ts'),
  ]);
  assert.match(controller, /AI_MAX_FILE_BYTES = 5 \* 1024 \* 1024/);
  assert.match(controller, /'document_extraction', 'restricted'/);
  assert.match(app, /MAX_DOCUMENT_BYTES = 5 \* 1024 \* 1024/);
  assert.match(app, /model_used": False/);
  assert.match(app, /Office document expands beyond|Document expands beyond/);
  assert.match(main, /intelligence\/extract/);
  assert.match(main, /apiBodyLimitBytes/);
});
