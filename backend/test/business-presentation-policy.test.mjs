import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recommendedNavigationSections } from '../src/catalog/business-presentation.ts';

const core=readFileSync(new URL('../src/core/core.controller.ts',import.meta.url),'utf8');
const settings=readFileSync(new URL('../../lexa-frontend/src/modules/settings/SettingsPage.tsx',import.meta.url),'utf8');
const appShell=readFileSync(new URL('../../lexa-frontend/src/app/layouts/AppShell.tsx',import.meta.url),'utf8');
const setup=readFileSync(new URL('../../lexa-frontend/src/modules/business-setup/BusinessSetupPage.tsx',import.meta.url),'utf8');

test('boutique does not start with production and unrelated specialist workflows',()=>{
 const groups=recommendedNavigationSections(['fashion_beauty']);
 assert.ok(groups.includes('SELLING'));
 assert.ok(groups.includes('INVENTORY'));
 assert.ok(groups.includes('FINANCE'));
 assert.ok(!groups.includes('PRODUCTION & QUALITY'));
 assert.ok(!groups.includes('PROJECTS & SERVICE'));
});
test('bakery and repair operations recommend relevant specialist workspaces',()=>{
 assert.ok(recommendedNavigationSections(['bakery']).includes('PRODUCTION & QUALITY'));
 assert.ok(recommendedNavigationSections(['repair_services']).includes('PROJECTS & SERVICE'));
 assert.ok(recommendedNavigationSections(['bakery','repair_services']).includes('PURCHASING'));
});
test('server publishes industry-specific navigation and current policy hash',()=>{
 assert.match(core,/navigationSectionsByIndustry:Object\.fromEntries/);
 assert.match(core,/policyHash/);
 assert.match(core,/activityRevision/);
});
test('business setup owns industry selection and refreshes all client projections',()=>{
 assert.match(setup,/queryClient\.invalidateQueries\(\{queryKey:\['industry-catalogue',workspace\.id\]/);
 assert.match(settings,/Add or change a business/);
 assert.doesNotMatch(settings,/Business type<select/);
});
test('navigation is presentation only: role visibility first and more modules remain accessible',()=>{
 assert.match(appShell,/const visibleNavSections = navSections/);
 assert.match(appShell,/isEmployeeNavigationAllowed/);
 assert.match(appShell,/Browse \$\{hiddenModuleCount\} additional modules/);
});

test('default assortment is the union of selected businesses; historical search is explicit',async()=>{
 const {resolveAssortment,visibleAssortment,ALL_EXISTING_PRODUCTS}=await import('../../lexa-frontend/src/domain/catalog/businessAssortmentRules.ts');
 const policy={industries:['fashion_beauty','perfumes_cosmetics'],selectedSpecialtyCodes:['fashion.boutique','beauty.fragrance_shop'],specialties:[
  {code:'fashion.boutique',industryCode:'fashion_beauty',label:'Boutique',recommendedProductTypes:['clothing','footwear']},
  {code:'beauty.fragrance_shop',industryCode:'perfumes_cosmetics',label:'Fragrances',recommendedProductTypes:['perfume']},
  {code:'mobile.handsets',industryCode:'mobile_phones',label:'Phones',recommendedProductTypes:['smartphone']},
 ]};
 const products=[{type:'clothing'},{type:'perfume'},{type:'smartphone'},{type:'retired_type'}];
 const initial=resolveAssortment(policy,null);
 assert.equal(initial.code,'');
 assert.deepEqual(visibleAssortment(products,initial,item=>item.type).map(x=>x.type),['clothing','perfume']);
 assert.deepEqual(visibleAssortment(products,resolveAssortment(policy,'fashion.boutique'),item=>item.type).map(x=>x.type),['clothing']);
 assert.equal(resolveAssortment(policy,'mobile.handsets').code,'');
 assert.deepEqual(visibleAssortment(products,resolveAssortment(policy,ALL_EXISTING_PRODUCTS),item=>item.type),products);
});
