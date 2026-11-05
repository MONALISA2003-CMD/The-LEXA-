import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {packagesToBase,validatePackageSize,requireSerializedUnits,PackageQuantityError} from '../src/catalog/package-quantity.ts';
import {PRODUCT_PRESETS,INDUSTRY_OPTIONS} from '../../lexa-frontend/src/domain/catalog/industryCatalog.ts';
const src=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('precise cartons, case, piece and measured-unit conversions cannot round or overflow',()=>{
 assert.equal(packagesToBase('20','24'),480);
 assert.equal(packagesToBase('0.5','12'),6);
 assert.equal(packagesToBase('1.25','0.5'),0.625);
 assert.equal(packagesToBase('0','24',true),0);
 assert.equal(validatePackageSize('24.000'),24);
 for(const [a,b] of [['1.2','0.001'],['1','0'],['-1','6'],['1.0009','2'],['10000000','12'],['9999999','2']])assert.throws(()=>packagesToBase(a,b),PackageQuantityError,`${a}*${b}`);
 for(const n of [0,0.5,-1,NaN,Infinity])assert.throws(()=>requireSerializedUnits(n),PackageQuantityError);
 for(const n of [1,2,50])assert.doesNotThrow(()=>requireSerializedUnits(n));
});

test('all 13 industry catalogs include at least one usable stock or service policy',()=>{
 const names=INDUSTRY_OPTIONS.map(([code])=>code);
 assert.equal(names.length,13);
 assert.equal(new Set(names).size,13);
 const retired=['agriculture','healthcare','manufacturing','logistics_transport','professional_services'];
 retired.forEach(code=>assert.ok(!names.includes(code),code));
 for(const code of names){
  const presets=PRODUCT_PRESETS.filter(p=>p.industries.includes(code));
  assert.ok(presets.length,`${code} must have a usable template`);
  assert.ok(presets.some(p=>['quantity','serial','batch','none'].includes(p.stock)),code);
  for(const p of presets){assert.ok(p.path.length||p.key==='general');assert.ok(['quantity','serial','batch','none'].includes(p.stock));}
 }
});

test('the reference industries retain distinct unit/identity/lot behavior',()=>{
 const preset=k=>PRODUCT_PRESETS.find(p=>p.key===k);
 assert.equal(preset('smartphone').stock,'serial');
 assert.ok(preset('smartphone').identifiers.includes('imei'));
 assert.ok(preset('clothing').variants.includes('size'));
 assert.ok(preset('clothing').variants.includes('colour'));
 assert.ok(['quantity','batch'].includes(preset('beverage').stock));
 assert.equal(preset('bread').stock,'batch');
 assert.equal(preset('cosmetic').stock,'batch');
 assert.equal(preset('appliance').stock,'serial');
 assert.equal(preset('repair_service').stock,'none');
});

test('receipt and stock transfer preserve variant, lot, package, serial and warehouse identity',()=>{
 const source=src('../src/supply-chain/supply-chain.controller.ts');
 assert.match(source,/packagesToBase\(x\.packagesAccepted/);
 assert.match(source,/validatePhysicalIdentifiers\(info\.serialNumber,info\.imei2,isPhone\)/);
 assert.match(source,/INSERT INTO commerce_goods_receipt_lines\([^\n]*variant_id/);
 assert.match(source,/INSERT INTO inventory_transfer_lines\([^\n]*variant_id/);
 assert.match(source,/AND variant_id IS NOT DISTINCT FROM \$\{l\.resolved_variant_id\?\?null\}::uuid AND warehouse_id/);
 assert.match(source,/m\.serial_id=s\.id ORDER BY m\.created_at DESC/);
 assert.match(source,/FOR UPDATE OF s`/);
 assert.match(source,/movedSerials!==l\.serial_ids\.length/);
});

test('release database migration and backup recovery cover packaging and variant ownership',()=>{
 const migration=src('../prisma/migrations/20261104193000_product_packaging_receipt_identity/migration.sql');
 const schema=src('../prisma/schema.prisma');
 const restore=src('../src/platform/catalog-recovery-integrity.ts');
 assert.match(schema,/model ProductPackage\s*\{/);
 assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.product_packages/);
 assert.match(migration,/FOREIGN KEY \(tenant_id,product_id,variant_id\)/);
 assert.match(migration,/FORCE ROW LEVEL SECURITY/);
 assert.match(migration,/commerce_goods_receipt_lines ADD COLUMN IF NOT EXISTS variant_id/);
 assert.match(migration,/inventory_transfer_lines ADD COLUMN IF NOT EXISTS variant_id/);
 assert.doesNotMatch(migration,/\b(?:DROP TABLE|TRUNCATE TABLE|DELETE FROM|ALTER TABLE [^\n]+ DROP COLUMN)\b/i);
 assert.match(restore,/product_packages/);
});

test('anonymous movement adjustments cannot bypass exact tracking or opening authorization',()=>{
 const core=src('../src/core/core.controller.ts');
 const catalog=src('../src/commerce/catalog-inventory.controller.ts');
 assert.match(core,/type === 'opening' && !hasPermission\(membership\.role,'inventory\.approve'\)/);
 assert.match(core,/product\.trackSerial\|\|product\.trackLot/);
 assert.match(core,/\!variantId&&await tx\.productVariant\.count/);
 assert.match(catalog,/hasPermission\(member\.role,'inventory\.approve'\)/);
 assert.match(catalog,/postLedgerJournal\(tx,/);
});
