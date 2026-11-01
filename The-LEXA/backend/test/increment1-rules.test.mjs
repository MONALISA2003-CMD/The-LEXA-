import test from 'node:test';
import assert from 'node:assert/strict';
import { permissionForRequest } from '../src/authorization/role-policy.ts';
import {
  paymentCategoryFromMethod,
  dispatchableQuantity,
  isValidDeliveryTransition,
  outstandingSaleMinor,
  remainingCollectionMinor,
} from '../src/commerce/increment1-rules.ts';

test('payment method categories preserve descriptive manual channels', () => {
  assert.equal(paymentCategoryFromMethod('cash'), 'cash');
  assert.equal(paymentCategoryFromMethod('mobile_money'), 'mobile_money');
  assert.equal(paymentCategoryFromMethod('mtn_momo'), 'mobile_money');
  assert.equal(paymentCategoryFromMethod('airtel_money'), 'mobile_money');
  assert.equal(paymentCategoryFromMethod('cheque'), 'cheque');
  assert.equal(paymentCategoryFromMethod('custom_method'), 'other');
});

test('dispatchable quantity subtracts customer returns and active reservations', () => {
  assert.equal(dispatchableQuantity(5, 2, 1), 2);
  assert.equal(dispatchableQuantity(5, 5, 0), 0);
  assert.equal(dispatchableQuantity(2.5, 0.5, 0.25), 1.75);
  assert.throws(() => dispatchableQuantity(1, -1, 0), /non-negative/);
});

test('delivery lifecycle permits only explicit forward or audited recovery transitions', () => {
  assert.equal(isValidDeliveryTransition('prepared', 'assigned'), true);
  assert.equal(isValidDeliveryTransition('assigned', 'picked_up'), true);
  assert.equal(isValidDeliveryTransition('in_transit', 'delivered'), true);
  assert.equal(isValidDeliveryTransition('delivery_failed', 'assigned'), true);
  assert.equal(isValidDeliveryTransition('delivered', 'picked_up'), false);
  assert.equal(isValidDeliveryTransition('cancelled', 'in_transit'), false);
});

test('customer balance never treats rider reports as receipts', () => {
  assert.equal(outstandingSaleMinor(5000000, 0, 4500000, 0), 500000);
  assert.equal(outstandingSaleMinor(5000000, 0, 4500000, 0), 500000);
  assert.equal(outstandingSaleMinor(5000000, 1000000, 4500000, 500000), 0);
});

test('collection remittance allocations support partial but reject over-allocation', () => {
  assert.equal(remainingCollectionMinor(500000, 0, 200000), 300000);
  assert.equal(remainingCollectionMinor(500000, 200000, 300000), 0);
  assert.throws(() => remainingCollectionMinor(500000, 200000, 300001), /cannot exceed/);
});


test('Increment 1 route policies keep receipt approval with cashier permissions', () => {
  assert.equal(permissionForRequest('GET', '/api/v1/workspaces/w/branches/b/commerce/dispatches'), 'fulfilment.read');
  assert.equal(permissionForRequest('POST', '/api/v1/workspaces/w/branches/b/commerce/dispatches/d/direct-receipts'), 'sales.write');
  assert.equal(permissionForRequest('POST', '/api/v1/workspaces/w/branches/b/commerce/remittances'), 'cash.manage');
  assert.equal(permissionForRequest('POST', '/api/v1/workspaces/w/branches/b/commerce/dispatches'), 'fulfilment.write');
  assert.equal(permissionForRequest('GET', '/api/v1/workspaces/w/branches/b/commerce/payment-report'), 'sales.read');
  assert.equal(permissionForRequest('GET', '/api/v1/workspaces/w/branches/b/commerce/delivery-report'), 'fulfilment.read');
  assert.equal(permissionForRequest('GET', '/api/v1/workspaces/w/branches/b/commerce/delivery-agents/a/history'), 'fulfilment.read');
});
