import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectIndustries, normaliseLegacyIndustry, SetupValidationError } from '../src/business-setup/business-setup.rules.ts';
import { PRODUCT_PRESETS, presetFor, suggestedPresets } from '../../lexa-frontend/src/domain/catalog/industryCatalog.ts';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('existing businesses retain a recognized industry and can add unrelated activities', () => {
  assert.equal(normaliseLegacyIndustry('restaurant'),'food_hospitality');
  assert.equal(normaliseLegacyIndustry('legacy-custom-name'),'other');
  assert.deepEqual(selectIndustries(['mobile_phones','perfumes_cosmetics','mobile_phones']),['mobile_phones','perfumes_cosmetics']);
  assert.deepEqual(selectIndustries(undefined,'wholesale'),['wholesale_distribution']);
  assert.throws(() => selectIndustries(undefined,'invalid-new-industry'),SetupValidationError);
  assert.throws(() => selectIndustries(['phones-typo']),SetupValidationError);
  assert.throws(() => selectIndustries('retail_trade'),SetupValidationError);
});

test('industry recommendations are scoped to configured activities',()=>{
  const boutique = suggestedPresets(['fashion_beauty','perfumes_cosmetics']);
  assert.ok(boutique.length < PRODUCT_PRESETS.length);
  assert.ok(boutique.some(p=>p.key==='general'));
  assert.ok(!boutique.some(p=>p.key==='smartphone'));
  assert.ok(boutique.some(p=>p.key==='perfume'));
  assert.equal(presetFor('smartphone').stock,'serial');
  assert.equal(presetFor('footwear').unit,'Pair');
  assert.ok(presetFor('perfume').fields.some(f=>f.key==='bottleMl'));
  assert.ok(presetFor('bread').fields.some(f=>f.key==='shelfLifeDays'));
  assert.ok(presetFor('clothing').variants.includes('size'));
});

test('multiindustry migration is additive and migrates old accounts without resetting stock or sales',()=>{
  const migration=source('../prisma/migrations/20261104153000_multiindustry_catalogue_upgrade/migration.sql');
  assert.match(migration,/ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS industries/);
  assert.match(migration,/WHERE cardinality\(industries\)=0/);
  assert.match(migration,/ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id/);
  assert.match(migration,/FOREIGN KEY \(tenant_id,parent_id\)/);
  assert.match(migration,/ALTER TABLE sale_lines ADD COLUMN IF NOT EXISTS serial_numbers_snapshot/);
  assert.doesNotMatch(migration,/\b(?:DROP TABLE|TRUNCATE|DELETE FROM|ALTER TABLE [^\n]+ DROP COLUMN)\b/i);
});

test('server keeps category ownership and serial tracking independent of lot tracking',()=>{
  const core=source('../src/core/core.controller.ts');
  const catalog=source('../src/commerce/catalog-inventory.controller.ts');
  assert.match(core,/resolveCategoryFields\(this\.prisma,workspaceId,categoryId\)/);
  assert.match(core,/if \(trackSerial && !trackStock\)/);
  assert.doesNotMatch(core,/if \(trackSerial && !trackLot\)/);
  assert.match(catalog,/where:\{tenantId:w,branchId:branch,productId,variantId,status:'available'\}/);
  assert.match(catalog,/Record stock received for this exact product variant/);
});

test('receipt stores customer-readable variant, selling unit and serial snapshots',()=>{
  const core=source('../src/core/core.controller.ts');
  const receipt=source('../../lexa-frontend/src/modules/sales/SaleReceiptDocument.tsx');
  assert.match(core,/variantDescriptionSnapshot:visibleVariant/);
  assert.match(core,/unitNameSnapshot:/);
  assert.match(core,/serialNumbersSnapshot/);
  assert.match(receipt,/line\.serialNumbersSnapshot\.join\(', '\)/);
  assert.doesNotMatch(receipt,/line\.serialIds\.join/);
});
