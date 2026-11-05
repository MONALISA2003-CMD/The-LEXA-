import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source=readFileSync(new URL('../src/commerce/industry-operations.controller.ts',import.meta.url),'utf8');
test('operations authenticate using raw session-token digest rather than JSON payload hash',()=>{
 assert.match(source,/function sessionTokenHash\(token:string\):string\{return createHash\('sha256'\)\.update\(token\)\.digest\('hex'\);\}/);
 assert.match(source,/tokenHash:sessionTokenHash\(token\)/);
 assert.doesNotMatch(source,/tokenHash:hash\(token\)/);
 assert.notEqual(createHash('sha256').update('sample').digest('hex'),createHash('sha256').update(JSON.stringify('sample')).digest('hex'));
});
test('expired source batches fail at the business-local calendar-day boundary',()=>{
 assert.match(source,/const today=businessCalendarDate\(tenantClock\.timezone\)/);
 assert.match(source,/inventoryLotExpired\(lot\.expiryDate,today\)/);
 assert.doesNotMatch(source,/Date\.now\(\)-86_400_000/);
});
