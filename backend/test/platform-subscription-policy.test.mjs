import { test } from 'node:test';
import assert from 'node:assert/strict';
import {nextPaidPeriod,hasOperationalAccess,daysRemaining,SUBSCRIPTION_PRICE_UGX,normalizedTransactionReference,safePaymentMethod} from '../src/platform-administration/subscription-policy.ts';
test('fixed UGX 50,000 plan and thirty 24-hour days',()=>{
 assert.equal(SUBSCRIPTION_PRICE_UGX,50_000);
 const activation=new Date('2026-11-06T11:00:00.000Z');
 const result=nextPaidPeriod(activation,null);
 assert.equal(result.startsAt.toISOString(),activation.toISOString());
 assert.equal(result.endsAt.toISOString(),'2026-12-06T11:00:00.000Z');
});
test('early renewal never steals paid time',()=>{
 const result=nextPaidPeriod(new Date('2026-11-18T11:00:00.000Z'),new Date('2026-12-06T11:00:00.000Z'));
 assert.equal(result.startsAt.toISOString(),'2026-12-06T11:00:00.000Z');
 assert.equal(result.endsAt.toISOString(),'2027-01-05T11:00:00.000Z');
});
test('late renewal begins at approval',()=>{
 const now=new Date('2027-01-01T11:00:00Z');
 assert.equal(nextPaidPeriod(now,new Date('2026-12-06T11:00:00Z')).startsAt.toISOString(),now.toISOString());
});
test('access expires at exact timestamp; pending, suspended and absent deny access',()=>{
 const expires=new Date('2026-12-06T11:00:00Z');
 assert.equal(hasOperationalAccess('active',expires,new Date('2026-12-06T10:59:59Z')),true);
 assert.equal(hasOperationalAccess('active',expires,expires),false);
 assert.equal(hasOperationalAccess('pending',expires),false);
 assert.equal(hasOperationalAccess('suspended',expires),false);
 assert.equal(hasOperationalAccess(null,null),false);
 assert.equal(hasOperationalAccess('legacy',null),true);
 assert.equal(daysRemaining(expires,expires),0);
});
test('payment methods fail closed and references normalize',()=>{
 assert.equal(normalizedTransactionReference('  ab  123 '),'AB 123');
 assert.equal(safePaymentMethod('mtn_momo'),'mtn_momo');
 assert.throws(()=>safePaymentMethod('untrusted'));
});
