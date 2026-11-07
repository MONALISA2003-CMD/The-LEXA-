import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname,'../..');
const source = (path) => readFileSync(resolve(root,path),'utf8');

test('business-activity selector is absent from workspace shell and screen markup, while product workflow data remains available', () => {
  const screens = [
    'lexa-frontend/src/app/layouts/AppShell.tsx',
    'lexa-frontend/src/modules/products/ProductsPage.tsx',
    'lexa-frontend/src/modules/inventory/InventoryPage.tsx',
    'lexa-frontend/src/modules/checkout/CheckoutPage.tsx',
    'lexa-frontend/src/modules/operations/FinanceOverviewPage.tsx',
    'lexa-frontend/src/modules/operations/ProcurementWorkspacePage.tsx',
  ];
  for (const file of screens) assert.doesNotMatch(source(file), /<BusinessAssortmentSelector\b|Manage business activities<\/Link>/, file);
  assert.equal(existsSync(resolve(root,'lexa-frontend/src/components/business/BusinessAssortmentSelector.tsx')),false);
  assert.equal(existsSync(resolve(root,'lexa-frontend/src/components/business/business-assortment.css')),false);
  const hook = source('lexa-frontend/src/components/business/useBusinessAssortment.ts');
  assert.match(hook,/resolveAssortment/);
  assert.match(hook,/return \[\.\.\.items\]/);
});

test('all four settings categories remain grouped and actions use actual auth API', () => {
  const s = source('lexa-frontend/src/modules/settings/AccountAndBusinessSettingsPage.tsx');
  for (const name of ['Business profile','Account security','Privacy preferences','Business tools']) assert.ok(s.includes(name), name);
  assert.match(s,/apiAuth\.signOut\(\)/);
  assert.match(s,/apiDemo\.end\(\)/);
  assert.match(s,/<AccountClosurePanel\s*\/>/);
  assert.doesNotMatch(source('lexa-frontend/src/modules/settings/SettingsPage.tsx'),/apiAuth\.signOut\(/); // one reliable exit action
  const client = source('lexa-frontend/src/data/remote/apiAuth.ts');
  assert.match(client,/apiClient\.post\('\/auth\/account\/close',input\)/);
});

test('personal account closure demands reauthentication, codes, complete confirmation and ownership transfer', () => {
  const api = source('backend/src/auth/account-security.controller.ts');
  const service = source('backend/src/auth/account-protection.service.ts');
  const prisma = source('backend/prisma/schema.prisma');
  const migration = source('backend/prisma/migrations/20261112100000_personal_account_closure/migration.sql');
  const frontend = source('lexa-frontend/src/modules/account/AccountClosurePanel.tsx');
  assert.match(api,/@Post\('account\/close'\) @UseGuards\(CsrfGuard\)/);
  assert.match(service,/if \(isDemoRuntime\(\)\) throw new ForbiddenException/);
  assert.match(service,/input\.confirmation !== 'DELETE MY ACCOUNT'/);
  assert.match(service,/input\.acknowledgeRetention !== true/);
  assert.match(service,/this\.requirePassword\(request, input\.password\)/);
  assert.match(service,/this\.limitSecurityCodes\(session\.userId/);
  assert.match(service,/where:\{userId:session\.userId,role:\{in:\['owner','owner_administrator'\]\}\}/);
  assert.match(service,/tx\.user\.updateMany\(\{where:\{id:session\.userId,closedAt:null\}/);
  assert.match(service,/tx\.session\.deleteMany/);
  assert.match(service,/tx\.accountSecurityEvent\.create/);
  assert.match(frontend,/DELETE MY ACCOUNT/);
  assert.match(frontend,/current-password/);
  assert.match(frontend,/account-closure-checkbox/);
  assert.match(prisma,/closedAt\s+DateTime\?/);
  assert.match(migration,/ADD COLUMN IF NOT EXISTS closed_at/);
  const controller = source('backend/src/core/core.controller.ts');
  assert.match(controller,/updatedUser = await tx\.user\.updateMany\(\{ where: \{ id: row\.userId, closedAt: null \}/);
});

test('navigation preserves the module groups, offers pins, recent paths and keyboard accessible account menu', () => {
  const app = source('lexa-frontend/src/app/layouts/AppShell.tsx');
  for (const department of ['WORKSPACE','BUSINESS REPORTS & ADVICE','CUSTOMERS & GROWTH','SELLING','INVENTORY','LOGISTICS','PURCHASING','FINANCE','TEAM & PAYROLL','PRODUCTION & QUALITY','PROJECTS & SERVICE']) assert.ok(app.includes(`title: '${department}'`));
  assert.match(app,/lexa\.ui\.pins\./);
  assert.match(app,/lexa\.ui\.recent\./);
  assert.match(app,/aria-label="Find a module"/);
  assert.match(app,/lexa-account-menu/);
  assert.match(app,/lexa-sidebar-signout/);
  assert.match(app,/aria-expanded=\{Boolean\(moduleSearch\)/);
});

test('bright module palettes meet white-text contrast for colored action backgrounds', () => {
  const css = source('lexa-frontend/src/styles/lexa-spectrum.css');
  const swatches = [...css.matchAll(/\[data-module-accent=([a-z]+)\]\{--module-accent:(#[0-9a-f]{6});--module-accent-strong:(#[0-9a-f]{6})/g)];
  assert.ok(swatches.length>=11,'missing department palettes');
  const linear = (n) => n<=.04045 ? n/12.92 : ((n+.055)/1.055)**2.4;
  const luminance = (hex) => [1,3,5].map(i=>linear(parseInt(hex.slice(i,i+2),16)/255)).reduce((sum,v,i)=>sum+[.2126,.7152,.0722][i]*v,0);
  for (const [,name,color,strong] of swatches) {
    assert.ok((1.05/(luminance(strong)+.05))>=4.5,`${name} strong action color fails white-text AA contrast`);
    if (name==='coral'||name==='sapphire') assert.match(css,new RegExp(`\\.main-panel\\[data-module-accent=${name}\\]\\{--module-action-bg:`));
  }
  assert.match(css,/\.main-panel\[data-module-accent\] \.page-content \.button-primary\{background:var\(--module-action-bg/);
});

test('finance shortcuts and collapsed expense forms leave every operating action available', () => {
  const nav = source('lexa-frontend/src/modules/operations/FinanceSectionNav.tsx');
  for (const slug of ['finance-overview','expenses','payments','accounting','money-accounts','bank-reconciliation','budgets']) assert.ok(nav.includes(slug),slug);
  const expense = source('lexa-frontend/src/modules/operations/ExpenseApprovalPanel.tsx');
  assert.match(expense,/<details className="fin-form-reveal fin-expense-form"><summary>Record an expense/);
  assert.match(expense,/createExpense\(/);
  assert.match(expense,/approveExpense\(/);
  assert.match(expense,/payApprovedExpense\(/);
});

test('source cleanup removes only assets proved unreferenced, preserves canonical logos and migrations', () => {
  assert.equal(existsSync(resolve(root,'lexa-frontend/public/lexa-icon-256.png')),false);
  assert.equal(existsSync(resolve(root,'lexa-frontend/public/lexa-icon-180.png')),false);
  assert.equal(existsSync(resolve(root,'lexa-frontend/public/lexa-icon-192.png')),true);
  assert.equal(existsSync(resolve(root,'lexa-frontend/public/lexa-icon-512.png')),true);
  assert.ok(readdirSync(resolve(root,'backend/prisma/migrations')).length>20);
});

test('all supported pages in a navigation department receive one consistent group accent', () => {
  const accents = source('lexa-frontend/src/domain/shared/moduleAccents.ts');
  assert.match(accents, /forPaths\('gold', \['\/intelligence'\]\)/);
  assert.match(accents, /forPaths\('gold', \['\/reports'/);
  assert.match(accents, /forPaths\('indigo', \['\/modules\/support'\]\)/);
  assert.match(accents, /forPaths\('indigo', \['\/modules\/projects', '\/modules\/tasks'\]\)/);
});
