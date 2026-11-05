import test from 'node:test';
import assert from 'node:assert/strict';
import {businessCalendarDate,inventoryLotExpired} from '../src/commerce/business-calendar.ts';

test('a local business day follows its configured IANA time zone, not the API host clock',()=>{
 const moment=new Date('2026-11-05T22:30:00.000Z');
 assert.equal(businessCalendarDate('Africa/Kampala',moment),'2026-11-06');
 assert.equal(businessCalendarDate('UTC',moment),'2026-11-05');
 assert.equal(businessCalendarDate('America/New_York',moment),'2026-11-05');
});
test('batch expiry remains valid for the whole printed day and is blocked the next local day',()=>{
 const expiry=new Date('2026-11-05T00:00:00.000Z');
 assert.equal(inventoryLotExpired(expiry,'2026-11-05'),false);
 assert.equal(inventoryLotExpired(expiry,'2026-11-06'),true);
 assert.equal(inventoryLotExpired(null,'2026-11-06'),false);
});
test('invalid calendar rules fail closed rather than silently using UTC',()=>{
 assert.throws(()=>businessCalendarDate('Not/A_Time_Zone',new Date()),RangeError);
 assert.throws(()=>inventoryLotExpired(new Date(NaN),'2026-11-05'),RangeError);
});
