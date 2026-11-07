import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..','..');
const source=(relative)=>readFileSync(join(root,relative),'utf8');

// These contracts protect the customer app and public demo independently; the
// site's Vercel project only deploys the frontend-root checkout.
test('the verified main domain serves an illustrated landing page with same-host sample links',()=>{
  const page=source('lexa-frontend/public/lexa.html');
  assert.match(page,/rel="canonical" href="https:\/\/lexaaamaal\.com\/"/);
  assert.match(page,/name="robots" content="index,follow/);
  assert.match(page,/visuals\/lexa-shop-workflow\.webp/);
  assert.ok(existsSync(join(root,'lexa-frontend/public/visuals/lexa-shop-workflow.webp')));
  assert.ok((page.match(/<section\b/g)||[]).length>=10);
  assert.ok((page.match(/href="https:\/\/lexaaamaal\.com\/demo\/"/g)||[]).length>=4);
  assert.doesNotMatch(page,/demo\.lexaaamaal\.com/, 'The unavailable subdomain cannot receive public CTA traffic');
  assert.doesNotMatch(page,/aggregateRating|ratingValue|reviewCount/,'Never invent review scores');
});
test('Vercel keeps distinct public, customer and demo entrypoints',()=>{
  const config=JSON.parse(source('lexa-frontend/vercel.json'));
  const routes=Object.fromEntries(config.rewrites.map(({source,destination})=>[source,destination]));
  assert.equal(routes['/'],'/lexa.html');
  assert.equal(routes['/demo'],'/demo/index.html');
  assert.equal(routes['/demo/'],'/demo/index.html');
  assert.equal(routes['/demo/:path*'],'/demo/index.html');
  assert.equal(routes['/(.*)'],'/app.html');
  const headers=Object.fromEntries(config.headers.map(({source,headers})=>[source,headers]));
  for(const path of ['/demo','/demo/:path*','/sign-in','/app.html'])
    assert.ok(headers[path]?.some(x=>x.key==='X-Robots-Tag'&&x.value.includes('noindex')),path);
  assert.match(source('lexa-frontend/index.html'),/noindex,nofollow/);
  assert.match(source('lexa-frontend/scripts/build-browser-demo.mjs'),/copyFileSync\(appShell, join\(output, 'app\.html'\)\)/);
  assert.match(source('lexa-frontend/scripts/build-browser-demo.mjs'),/copyFileSync\(website, appShell\)/);
});
test('browser-only demo is opt-in at build time and refuses all customer API calls',()=>{
  const runtime=source('lexa-frontend/src/data/remote/runtimeConfig.ts');
  assert.match(runtime,/import\.meta\.env\.VITE_LEXA_BROWSER_DEMO === 'true'/);
  assert.match(runtime,/import\.meta\.env\.BASE_URL\.startsWith\('\/demo\/'\)/);
  assert.match(source('lexa-frontend/src/data/remote/apiClient.ts'),/if \(isBrowserDemoBuild\) throw new ApiConfigurationError/);
  assert.match(source('lexa-frontend/src/data/local/database.ts'),/lexa-browser-demo-v1/);
  assert.match(source('lexa-frontend/src/data/local/moduleRecords.ts'),/lexa\.demo\.module-records\.v1/);
});
test('sample receipts link products, sale lines, payment records and stock movements',()=>{
  const seed=source('lexa-frontend/src/modules/demo/browserDemoSeed.ts');
  const products=seed.match(/\['[^'\n]+','[^'\n]+',\d+,\d+\]/g)||[];
  assert.equal(products.length,48,'Sample business should include 48 priced items');
  assert.match(seed,/for\(let i=0;i<42;i\+\+\)/);
  for(const statement of ['db.products.bulkAdd(products)','db.stockMovements.bulkAdd(movements)','db.sales.bulkAdd(sales)','db.saleLines.bulkAdd(lines)','db.payments.bulkAdd(payments)'])
    assert.ok(seed.includes(statement),statement);
  assert.match(seed,/sourceId:saleId/);
  assert.match(seed,/saleId,kind:'receipt'/);
  assert.match(seed,/localModuleRecordService.replace\(scope,module.id,rows\)/);
  assert.match(seed,/BROWSER_DEMO_READY_KEY,'yes'/);
});
test('sample business areas reuse real LEXA record management without connected services',()=>{
  const sample=source('lexa-frontend/src/modules/demo/BrowserDemoAreaPage.tsx');
  const realManager=source('lexa-frontend/src/modules/operations/OperationsWorkspacePage.tsx');
  assert.match(realManager,/export function ModuleManager/);
  assert.match(sample,/getModuleDefinition\(id\)/);
  assert.match(sample,/<ModuleManager/);
  for(const area of ['sales-invoices','purchase-invoices','payroll','bank-reconciliation','purchases'])
    assert.ok(sample.includes(area),area);
  assert.doesNotMatch(sample,/apiClient|apiFinance|apiPayroll|apiTeamAccess/,'The sample register must not call real customer services');
});
test('sample charts are derived from fictional transactions and expose no invented ledgers',()=>{
  const analytics=source('lexa-frontend/src/modules/demo/browserDemoAnalytics.ts');
  assert.match(analytics,/db\.sales\.where/);
  assert.match(analytics,/db\.payments\.where/);
  assert.match(analytics,/db\.stockMovements\.where/);
  assert.match(analytics,/sale\.totalMinor/);
  assert.match(analytics,/matching\.length/);
  assert.match(analytics,/sourceCoverage:\{sales:true,inventory:true,finance:false/);
});
test('E2E locators work at desktop and phone widths without a dialog-only sidebar selector',()=>{
  const browserTest=source('lexa-frontend/e2e/module-navigation.spec.ts');
  assert.match(browserTest,/aside\.sidebar\[aria-label="Main navigation"\]/);
  assert.doesNotMatch(browserTest,/getByRole\('dialog', \{ name: 'Main navigation' \}\)/);
});
