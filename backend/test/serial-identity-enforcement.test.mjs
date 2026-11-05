import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isValidImei, validatePhysicalIdentifiers, SerialIdentityError} from '../src/catalog/serial-identity.ts';
const src=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const db=src('../prisma/migrations/20261104180000_serial_identity_enforcement/migration.sql');
const api=src('../src/commerce/catalog-inventory.controller.ts');
const client=src('../../lexa-frontend/src/data/remote/apiWorkstream03.ts');
const productForm=src('../../lexa-frontend/src/modules/products/AdaptiveProductFields.tsx');
const checkout=src('../../lexa-frontend/src/modules/checkout/CheckoutPage.tsx');
function checkDigit(first14){
  assert.match(first14,/^\d{14}$/);
  for(let c=0;c<10;c++)if(isValidImei(first14+c))return first14+c;
  throw new Error('Cannot generate test IMEI check digit');
}

test('official example IMEI has valid Luhn check digit; invalid length and check digits are rejected',()=>{
  assert.equal(isValidImei('490154203237518'),true);
  assert.equal(isValidImei('490154203237519'),false);
  assert.equal(isValidImei('49015420323751'),false);
  assert.equal(isValidImei('4901542032375186'),false);
  assert.equal(isValidImei('4901542032375AA'),false);
});

test('phone device registration accepts real IMEI pairs and rejects duplicates, invalid or misplaced IDs',()=>{
 const imei1=checkDigit('35693803564380'),imei2=checkDigit('35693803564381');
 assert.deepEqual(validatePhysicalIdentifiers(imei1,imei2,true),{serialNumber:imei1,imei2});
 assert.deepEqual(validatePhysicalIdentifiers('  '+imei1+'  ',undefined,true),{serialNumber:imei1,imei2:null});
 assert.throws(()=>validatePhysicalIdentifiers(imei1,imei1,true),SerialIdentityError);
 assert.throws(()=>validatePhysicalIdentifiers(imei1.slice(0,-1)+String((Number(imei1.at(-1))+1)%10),undefined,true),SerialIdentityError);
 assert.throws(()=>validatePhysicalIdentifiers('test-serial',undefined,true),SerialIdentityError);
 assert.throws(()=>validatePhysicalIdentifiers('TEST-SN',imei2,false),SerialIdentityError);
 assert.throws(()=>validatePhysicalIdentifiers(imei1,55,true),SerialIdentityError);
 assert.throws(()=>validatePhysicalIdentifiers('hello\u0000world',undefined,false),SerialIdentityError);
 assert.deepEqual(validatePhysicalIdentifiers('  LAPTOP-Serial-X  ',null,false),{serialNumber:'LAPTOP-Serial-X',imei2:null});
});

test('database prevents identifier collisions in primary and secondary positions for every route / client',()=>{
 assert.match(db,/BEFORE INSERT OR UPDATE OF serial_number, identifiers, product_id, tenant_id/);
 assert.match(db,/pg_advisory_xact_lock\(hashtextextended\(NEW\.tenant_id::text/);
 assert.match(db,/existing\.tenant_id = NEW\.tenant_id/);
 assert.match(db,/existing\.id <> NEW\.id/);
 assert.match(db,/upper\(btrim\(existing\.serial_number\)\) = secondary_id/);
 assert.match(db,/existing\.identifiers->>'imei2'/);
 assert.match(db,/lexa_is_valid_imei/);
 assert.match(db,/IF NEW\.lot_id IS NULL THEN RETURN NEW/);
 assert.match(db,/FOR UPDATE/);
 assert.doesNotMatch(db,/\b(?:DELETE\s+FROM|TRUNCATE\s+TABLE)\s+inventory_serials\b/i);
});

test('both serial registration APIs apply the same server validation and map duplicate errors to 409',()=>{
 assert.equal((api.match(/validatedUnitIds\(b\.serialNumber,b\.imei2,product\.productType\)/g)??[]).length,2);
 assert.match(api,/new ConflictException\('This serial number or IMEI is already registered/);
 assert.equal((api.match(/catch\(rethrowSerialIdentityConflict\)/g)??[]).length,2);
 assert.match(api,/Serialized stock must be received in whole units/);
 assert.doesNotMatch(api,/'quarantined'/);
});

test('web client displays both IMEIs and category field requirements with strict type enabled',()=>{
 assert.match(productForm,/const customFields:ProductField\[\]/);
 assert.match(productForm,/const fields:ProductField\[\]/);
 assert.match(productForm,/required:f\.required===true/);
 assert.match(productForm,/Primary IMEI \(15 digits\)/);
 assert.match(client,/imei2\?:string/);
 assert.match(checkout,/serial\.identifiers\?\.imei2/);
});

test('the exact-device lookup resolves either identifier under tenant/branch scope and checkout adds the exact unit',()=>{
 assert.match(api, /@Get\('branches\/:branchId\/inventory\/serials\/lookup'\)/);
 assert.match(api, /async lookupSerial\(/);
 assert.match(api, /tenant_id=\$\{w\}::uuid AND branch_id=\$\{branch\}::uuid/);
 assert.match(api, /Historical duplicate identifiers require inventory reconciliation/);
 assert.match(client, /lookupSerial:/);
 assert.match(checkout, /apiCatalogInventory\.lookupSerial\(workspace\.id,branch\.id,code\)/);
 assert.match(checkout, /unit\.status!=='available'/);
 assert.match(checkout, /selectedSerials\)\.some\(ids=>ids\.includes\(unit\.id\)\)/);
 assert.match(checkout, /setSelectedSerials\(previous=>/);
});
