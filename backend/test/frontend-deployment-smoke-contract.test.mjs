import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const frontend = fileURLToPath(new URL('../../lexa-frontend/', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
const packageJson = JSON.parse(readFileSync(join(frontend, 'package.json'), 'utf8'));
const frontendChecker = 'scripts/check_module_group_palette.py';

const paletteInputs = [
  'src/domain/shared/moduleAccents.ts',
  'src/app/layouts/AppShell.tsx',
  'src/styles/module-group-system.css',
  'src/main.tsx',
  'src/modules/customer-growth/CustomerGrowthPage.tsx',
  'src/modules/operations/ProductionQualityPage.tsx',
  'src/modules/operations/ProjectsServicePage.tsx',
  'src/modules/operations/FinanceWorkspacePage.tsx',
  'src/modules/operations/FinanceOverviewPage.tsx',
];

test('Vercel prebuild checks the module-group palette inside the frontend root', () => {
  assert.match(packageJson.scripts.prebuild, /python3 scripts\/check_module_group_palette\.py/);
  assert.doesNotMatch(packageJson.scripts.prebuild, /(?:python3|node) \.\.\/scripts\/check_module_group_palette/);
  const source = readFileSync(join(frontend, frontendChecker), 'utf8');
  assert.match(source, /Path\(__file__\)\.resolve\(\)\.parents\[1\] \/ 'src'/);
  assert.doesNotMatch(source, /ROOT \/ 'lexa-frontend'/);
});

test('frontend palette checker runs in a Vercel-style checkout with no monorepo sibling scripts', () => {
  const temp = mkdtempSync(join(tmpdir(), 'lexa-vercel-root-'));
  try {
    const all = [frontendChecker, ...paletteInputs];
    for (const path of all) {
      mkdirSync(dirname(join(temp, path)), {recursive: true});
      copyFileSync(join(frontend, path), join(temp, path));
    }
    const checked = spawnSync('python3', [frontendChecker], {cwd: temp, encoding: 'utf8', timeout: 15000});
    assert.equal(checked.status, 0, `${checked.stdout}\n${checked.stderr}`);
    assert.match(checked.stdout, /65 navigation routes/);
  } finally {
    rmSync(temp, {recursive: true, force: true});
  }
});

test('the local Playwright business fixture validates the redesigned Overview, not retired wording', () => {
  const source = readFileSync(join(frontend, 'e2e/helpers/localBusiness.ts'), 'utf8');
  assert.match(source, /overview-hero.*getByRole\('heading'\).*toContainText\(businessName\)/);
  assert.match(source, /\.overview-context strong/);
  assert.doesNotMatch(source, /Your business\\s\+at a glance/);
  const dashboard = readFileSync(join(frontend, 'src/modules/dashboard/DashboardPage.tsx'), 'utf8');
  assert.match(dashboard, /className="overview-hero"/);
  assert.match(dashboard, /<h2>Today at <span>\{workspace.businessName\}/);
});

test('repository palette command delegates to the frontend-local canonical checker', () => {
  const src = readFileSync(join(root, 'scripts/check_module_group_palette.py'), 'utf8');
  assert.match(src, /runpy\.run_path/);
  assert.match(src, /lexa-frontend' \/ 'scripts' \/ 'check_module_group_palette\.py/);
});
