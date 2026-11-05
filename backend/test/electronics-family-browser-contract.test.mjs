import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '../..');
const browserRoot = path.join(root, 'lexa-frontend/src');
const typePath = path.join(browserRoot, 'domain/catalog/electronicsFamilyTypes.ts');
const helperPath = path.join(browserRoot, 'domain/catalog/electronicsFamilyTracking.ts');
const clientPath = path.join(browserRoot, 'data/remote/apiElectronicsCatalogue.ts');
const uiPath = path.join(browserRoot, 'modules/products/ElectronicsCatalogueDirectory.tsx');
const published = JSON.parse(fs.readFileSync(path.join(root, 'scripts/electronics-catalogue-v2.v1.json'), 'utf8'));

/** Compile the actual browser types plus the expression from the failed UI
 * without downloading React, Vite or any other frontend dependency. This test
 * runs during backend CI, before frontend npm install/build.
 */
function checkBrowserPolicyTypes() {
  const virtualPath = path.join(browserRoot, 'domain/catalog/__lexa_browser_contract_regression__.ts');
  const fixture = `import type {V2Family} from './electronicsFamilyTypes';
import {describeElectronicsStockPolicy} from './electronicsFamilyTracking';
declare const family: V2Family;
const identifiers = family.identifiers.join(', ');
const variantAxes = family.variantAxes.join(', ');
const tracking = describeElectronicsStockPolicy(family);
void identifiers; void variantAxes; void tracking;
`;
  const options = {
    strict: true, noEmit: true, skipLibCheck: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  };
  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) => file === virtualPath
    ? ts.createSourceFile(file, fixture, languageVersion, true)
    : originalGetSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram([virtualPath, typePath, helperPath], options, host);
  return ts.getPreEmitDiagnostics(program)
    .filter(item => item.category === ts.DiagnosticCategory.Error)
    .map(item => `TS${item.code}: ${ts.flattenDiagnosticMessageText(item.messageText, ' ')}`);
}

test('browser policy contract compiles with canonical identifiers, variant axes and tracking', () => {
  assert.deepEqual(checkBrowserPolicyTypes(), []);
});

test('frontend API and directory use the checked generated-family shape rather than a partial handwritten type', () => {
  const api = fs.readFileSync(clientPath, 'utf8');
  const types = fs.readFileSync(typePath, 'utf8');
  const ui = fs.readFileSync(uiPath, 'utf8');
  assert.match(api, /import type \{V2Family\} from '\.\.\/\.\.\/domain\/catalog\/electronicsFamilyTypes'/);
  assert.match(api, /export type \{V2Family,V2Field\} from '\.\.\/\.\.\/domain\/catalog\/electronicsFamilyTypes'/);
  assert.match(types, /PublishedFamily extends Omit<V2Family, 'enabled'>/);
  assert.match(types, /Exclude<keyof PublishedFamily, keyof V2Family>/);
  assert.match(ui, /describeElectronicsStockPolicy\(chosenFamily\)/);
  assert.doesNotMatch(ui, /identifiers\.join\(','\)\|\|'Quantity tracking'/);
});

test('all published family identifier policies are renderable, and feature phones require physical IMEI tracking', () => {
  const allowed = new Set(['imei', 'imei2?', 'serial']);
  assert.equal(published.families.length, 52);
  for (const family of published.families) {
    assert.ok(['serial', 'batch', 'quantity', 'none'].includes(family.stockProfile));
    assert.ok(Array.isArray(family.identifiers), family.code);
    assert.ok(Array.isArray(family.variantAxes), family.code);
    assert.ok(family.identifiers.every(value => allowed.has(value)), family.code);
    if (family.stockProfile !== 'serial') assert.equal(family.identifiers.length, 0, family.code);
  }
  const feature = published.families.find(family => family.code === 'feature_phone');
  assert.deepEqual(feature.identifiers, ['imei', 'imei2?']);
  assert.equal(feature.stockProfile, 'serial');
});


test('real browser tracking formatter renders device, accessory, batch, and non-stock policies correctly', () => {
  const source = fs.readFileSync(helperPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const runtime = {exports:{}};
  const callable = vm.runInNewContext(`(function(module,exports){${output}\n})`, {String, Array, Object}, {timeout:1000});
  callable(runtime, runtime.exports);
  const describe = runtime.exports.describeElectronicsStockPolicy;
  assert.equal(typeof describe,'function');
  const feature = published.families.find(f => f.code === 'feature_phone');
  const charger = published.families.find(f => f.code === 'charger');
  assert.equal(describe(feature), 'Track each unit: IMEI, IMEI 2 (if assigned)');
  assert.equal(describe(charger), 'Track quantity by sellable SKU');
  assert.equal(describe({stockProfile:'serial',identifiers:[]}), 'Track each unit by its serial');
  assert.equal(describe({stockProfile:'batch',identifiers:[]}), 'Track quantities by batch or lot');
  assert.equal(describe({stockProfile:'none',identifiers:[]}), 'Non-stock item');
  for (const family of published.families) assert.ok(describe(family).length, family.code);
});
