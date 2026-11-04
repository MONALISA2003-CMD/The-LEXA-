import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = async path => readFile(new URL(path,import.meta.url),'utf8');

test('tenant database context spans controller observable subscription and guard checks', async () => {
  const [interceptor, moduleSource, guard, prisma] = await Promise.all([
    source('../src/authorization/tenant-request-context.interceptor.ts'),
    source('../src/app.module.ts'),
    source('../src/authorization/tenant-authorization.guard.ts'),
    source('../src/prisma/prisma.service.ts'),
  ]);
  assert.match(moduleSource, /APP_INTERCEPTOR, useClass: TenantRequestContextInterceptor/);
  assert.match(interceptor, /runWithTenantContext\(\{ tenantId \}/);
  assert.match(interceptor, /next\.handle\(\)\.subscribe\(subscriber\)/);
  assert.match(guard, /runWithTenantContext\(\{ tenantId: workspaceId, userId: session\.userId \}/);
  assert.match(guard, /BRANCH_SCOPE_DENIED/);
  assert.match(prisma, /set_config\('app\.tenant_id'/);
  assert.match(prisma, /SET LOCAL/);
});

test('manufacturing and quality screens use tenant-scoped operational tables, never generic registers',async()=>{
  const [controller,page,api] = await Promise.all([
    source('../src/supply-chain/supply-chain.controller.ts'),
    source('../../lexa-frontend/src/modules/operations/ProductionQualityPage.tsx'),
    source('../../lexa-frontend/src/data/remote/apiProductionQuality.ts'),
  ]);
  for (const route of ["manufacturing/job-cards",'quality/inspections'])assert.ok(controller.includes(`@Get('${route}')`));
  assert.match(controller,/ORDER BY i\.inspected_at DESC LIMIT 500/);
  assert.match(controller,/i\.inspected_at AS created_at/);
  assert.match(controller,/GROUP BY c\.id,w\.work_order_number,w\.product_id,p\.name/);
  assert.match(page,/apiProductionQuality\.completeWorkOrder/);
  assert.match(page,/apiProductionQuality\.decideInspection/);
  assert.match(page,/DataError/);
  assert.doesNotMatch(page,/module_records|moduleRecord|demoData|mockData/);
  assert.match(api,/manufacturing\/job-cards/);
  assert.match(api,/quality\/inspections/);
});

test('HR refuses zero-value fallback on failures and timesheets select authorized projects',async()=>{
 const [page,projects,accounts]=await Promise.all([
 source('../../lexa-frontend/src/modules/people/PeopleProjectsPage.tsx'),
 source('../../lexa-frontend/src/modules/operations/ProjectsServicePage.tsx'),
 source('../../lexa-frontend/src/modules/operations/AccountsPayablePanel.tsx')]);
 assert.match(page,/!loading&&!error/);
 assert.match(page,/allProjectTasks/);
 assert.match(page,/Not linked to a project/);
 assert.match(page,/data-module-accent="mulberry"/);
 assert.match(projects,/q\.isSuccess&&<div className="ps-kpis"/);
 assert.match(accounts,/Unavailable/);
});
