import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

test('AI reports use operational and posted-ledger sources, not generic JSON money fields', async () => {
  const controller = await source('../src/ai/ai.controller.ts');
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

test('AI router uses one free-tier business assistant with automatic fallback and no write tools', async () => {
  const [controller, router, appModule, architecture] = await Promise.all([
    source('../src/ai/ai.controller.ts'),
    source('../src/ai/ai-router.service.ts'),
    source('../src/app.module.ts'),
    source('../../docs/architecture/ai-routing.md'),
  ]);
  assert.match(controller, /FREE_MODEL_ALIAS = 'lexa-business-free'/);
  assert.match(controller, /confidential_aggregate/);
  assert.match(controller, /FOR UPDATE OF s/);
  assert.match(controller, /tenant_usage_counters/);
  assert.match(controller, /provider_model/);
  assert.match(controller, /permission-filtered aggregate business facts/);
  assert.match(controller, /DOCUMENT_EXTRACTION_NOT_ENABLED/);
  assert.doesNotMatch(controller, /LEXA_INTELLIGENCE_BASE_URL/);
  assert.match(router, /GEMINI_FREE_API_KEY/);
  assert.match(router, /GROQ_API_KEY/);
  assert.doesNotMatch(router, /CEREBRAS_API_KEY/);
  assert.match(router, /OPENROUTER_API_KEY/);
  assert.match(router, /NVIDIA_NIM_API_KEY/);
  assert.match(router, /openrouter\/free/);
  assert.match(router, /cooldownUntil/);
  assert.match(router, /AbortSignal\.timeout/);
  assert.doesNotMatch(router, /OPENAI_API_KEY|GEMINI_API_KEY/);
  assert.match(appModule, /AiRouterService/);
  assert.match(architecture, /native TypeScript `AiRouterService` inside the existing NestJS API/);
});

test('SaaS controls include plan ceilings, database seat/branch triggers, feature overrides and support audit', async () => {
  const [migration, controller, core, invitations] = await Promise.all([
    source('../prisma/migrations/20261101180000_workstream8_saas_ai_reporting/migration.sql'),
    source('../src/ai/ai.controller.ts'),
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

test('Document extraction remains disabled until a reviewed processing service is deployed', async () => {
  const [controller, main] = await Promise.all([
    source('../src/ai/ai.controller.ts'),
    source('../src/main.ts'),
  ]);
  assert.match(controller, /DOCUMENT_EXTRACTION_NOT_ENABLED/);
  assert.doesNotMatch(controller, /LEXA_INTELLIGENCE_BASE_URL/);
  assert.match(main, /intelligence\/extract/);
  assert.match(main, /apiBodyLimitBytes/);
});
