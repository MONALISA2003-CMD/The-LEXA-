import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { availableBusinessSpecialties, recommendedBusinessProducts, validateBusinessSpecialties, BUSINESS_SPECIALTIES } from '../src/catalog/business-specialties.generated.ts';
import { validateSetupStep } from '../src/business-setup/business-setup.rules.ts';

const source = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const manifest = JSON.parse(source('../../scripts/industry-catalogue.v1.json'));
const presets = new Map(manifest.presets.map(p => [p.key, p]));

const step2 = (industries, subActivityCodes) => ({ step: 2, industry: industries[0], industries, subActivityCodes,
  businessModels: ['retail'], offeringTypes: ['physical_goods'], offeringsDescription: 'Independent local shop', sellingChannels: ['shop'] });

test('every recommended specialty uses one existing industry and permitted product family', () => {
  const all = new Set(manifest.industries.map(i => i.code));
  assert.equal(all.size, 13);
  assert.ok(BUSINESS_SPECIALTIES.length >= 40);
  assert.equal(new Set(BUSINESS_SPECIALTIES.map(x => x.code)).size, BUSINESS_SPECIALTIES.length);
  for (const niche of BUSINESS_SPECIALTIES) {
    assert.ok(all.has(niche.industryCode), niche.code);
    for (const productType of niche.recommendedProductTypes) {
      assert.ok(presets.get(productType)?.industries.includes(niche.industryCode), `${niche.code}: ${productType}`);
    }
  }
});

test('boutique selection recommends clothing without surfacing perfumes in the first view', () => {
  const selections = validateBusinessSpecialties(['fashion.boutique'], ['fashion_beauty']);
  const recommendations = recommendedBusinessProducts(['fashion_beauty'], selections);
  assert.ok(recommendations.includes('clothing'));
  assert.ok(recommendations.includes('footwear'));
  assert.ok(!recommendations.includes('perfume'));
  assert.ok(!recommendations.includes('smartphone'));
});

test('fragrance selection has perfume, mist and oil without unrelated electronics', () => {
  const recommendations = recommendedBusinessProducts(['perfumes_cosmetics'], ['beauty.fragrance_shop']);
  for (const key of ['perfume','body_mist','fragrance_oil']) assert.ok(recommendations.includes(key));
  for (const key of ['smartphone','printer','cement','clothing']) assert.ok(!recommendations.includes(key));
});

test('mixed businesses have a union of selected niches but never duplicate one product', () => {
  const r = recommendedBusinessProducts(['fashion_beauty','perfumes_cosmetics'], ['fashion.boutique','beauty.fragrance_shop']);
  assert.ok(r.includes('clothing') && r.includes('perfume'));
  assert.equal(new Set(r).size, r.length);
});

test('niche selection cannot grant an industry missing from business setup', () => {
  assert.throws(() => validateBusinessSpecialties(['mobile.handsets'], ['perfumes_cosmetics']), /does not belong/);
  assert.throws(() => validateSetupStep(step2(['fashion_beauty'], ['beauty.fragrance_shop'])), /does not belong/);
  assert.throws(() => validateBusinessSpecialties(['future.invalid'], ['other']), /does not belong/);
  assert.throws(() => validateBusinessSpecialties('fashion.boutique', ['fashion_beauty']), /valid business/);
});

test('business setup validates and normalizes owner-selected specialties without extra industries', () => {
  const result = validateSetupStep(step2(['perfumes_cosmetics','fashion_beauty'], ['fashion.boutique','beauty.fragrance_shop','fashion.boutique']));
  assert.deepEqual(result.subActivityCodes, ['beauty.fragrance_shop','fashion.boutique']);
  assert.deepEqual(result.industries, ['perfumes_cosmetics','fashion_beauty']);
  assert.equal(result.confirmActivityChange, false);
  assert.equal(validateSetupStep(step2(['education'], undefined)).subActivityCodes, undefined);
  assert.deepEqual(validateSetupStep(step2(['education'], [])).subActivityCodes, []);
  assert.throws(()=>validateSetupStep({...step2(['education'], []),activityRevision:-1}),/revision/);
  assert.equal(validateSetupStep({...step2(['education'], []),activityRevision:3}).activityRevision,3);
});

test('activity history is append-only, role-restricted and covered by backup RLS', () => {
  const sql = source('../prisma/migrations/20261105230000_business_activity_preferences/migration.sql');
  const schema = source('../prisma/schema.prisma');
  const controller = source('../src/business-setup/business-setup.controller.ts');
  const service = source('../src/prisma/prisma.service.ts');
  assert.match(sql,/business_activity_revisions/);
  assert.match(sql,/FORCE ROW LEVEL SECURITY/);
  assert.match(sql,/BEFORE UPDATE OR DELETE/);
  assert.match(sql,/GRANT SELECT,INSERT/);
  assert.match(schema,/model BusinessActivityRevision/);
  assert.match(schema,/@map\("sub_activity_codes"\)/);
  assert.match(controller,/Only a business owner may confirm/);
  assert.match(controller,/businessActivityRevision\.create/);
  assert.match(controller,/another session/);
  assert.match(controller,/validateBusinessSpecialties\(\[code\],updated\.industries\)/);
  assert.match(service,/'businessActivityRevision'/);
  const inventory = JSON.parse(source('../backup/authoritative-inventory.json'));
  assert.ok(inventory.some(row => row.table === 'business_activity_revisions' && row.disposition === 'authoritative'));
});

test('generated business specialty contracts stay synchronized between backend and frontend', () => {
  assert.equal(source('../src/catalog/business-specialties.generated.ts'), source('../../lexa-frontend/src/domain/catalog/business-specialties.generated.ts'));
  const output = execFileSync('python3', ['scripts/sync_business_specialties.py', '--check'], {cwd:new URL('../../',import.meta.url),encoding:'utf8'});
  assert.match(output,/synchronized/);
});
