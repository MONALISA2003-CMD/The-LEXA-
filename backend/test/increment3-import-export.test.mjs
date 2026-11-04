import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateMappedRows, csvEncode, IMPORT_TEMPLATES, rowKey, sha256 } from '../src/platform/import-export.ts';

test('CSV parser handles quoted delimiters and escaped quotes',()=>{const p=parseCsv('sku,name\nA-1,"Tea, black"\nA-2,"Tea ""green"""');assert.equal(p.rows.length,2);assert.equal(p.rows[0].values.name,'Tea, black');assert.equal(p.rows[1].values.name,'Tea "green"');});
test('CSV parser rejects duplicate headers and unclosed quotes',()=>{assert.throws(()=>parseCsv('sku,sku\na,b'),/unique/);assert.throws(()=>parseCsv('sku,name\na,"broken'),/Unclosed/);});
test('Import preview maps required columns and marks duplicate source identifiers',()=>{const p=parseCsv('Code,Name\nA-1,Tea\nA-1,Coffee');const rows=validateMappedRows('products',p.rows,{Code:'sku',Name:'name'},{product_type:'general'});assert.equal(rows[0].action,'create');assert.equal(rows[1].action,'invalid');assert.match(rows[1].errors.join(' '),/Duplicate/);});
test('Import preview identifies required fields and invalid money values',()=>{const p=parseCsv('SKU,Name,Cost\n,Tea,-1');const rows=validateMappedRows('products',p.rows,{SKU:'sku',Name:'name',Cost:'cost_price_minor'});assert.equal(rows[0].action,'invalid');assert.equal(rows[0].errors.length,3);});
test('CSV export prevents spreadsheet formula injection',()=>{const csv=csvEncode(['name'],[{name:'=HYPERLINK("https://bad")'}]);assert.match(csv,/'=HYPERLINK/);});
test('Import templates are versioned and do not expose historical transaction importers',()=>{assert.equal(IMPORT_TEMPLATES.products.version,2);assert.ok(IMPORT_TEMPLATES.products.required.includes('product_type'));assert.equal(Object.hasOwn(IMPORT_TEMPLATES,'historical_sales'),false);});
test('Per-row idempotency keys are deterministic and SHA-256 is stable',()=>{assert.equal(rowKey('job',4),rowKey('job',4));assert.equal(sha256('a').length,64);});
test('Opening stock is excluded from generic imports and reserved for reconciliation workflow',()=>{assert.equal(Object.hasOwn(IMPORT_TEMPLATES,'opening_stock'),false);});
import { createZip } from '../src/platform/zip.ts';
test('ZIP export creates a standards-compliant local header and central directory',()=>{const zip=createZip([{name:'manifest.json',data:Buffer.from('{}')},{name:'products.jsonl',data:Buffer.from('{"sku":"A"}\n')}]);assert.equal(zip.readUInt32LE(0),0x04034b50);assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);});
