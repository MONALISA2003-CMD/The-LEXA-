import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { hasPermission, permissionForRequest, normalizeRole } = require('../dist/authorization/role-policy.js');

test('normalizes role labels consistently', () => {
  assert.equal(normalizeRole('Business Manager'), 'business_manager');
  assert.equal(normalizeRole('Owner / Administrator'), 'owner_administrator');
});

test('owner and business manager can operate business domains', () => {
  assert.equal(hasPermission('owner', 'finance.write'), true);
  assert.equal(hasPermission('Business Manager', 'inventory.write'), true);
  assert.equal(hasPermission('admin', 'workspace.manage'), true);
});

test('accountant is scoped to finance and procurement rather than stock operations', () => {
  assert.equal(hasPermission('accountant', 'finance.write'), true);
  assert.equal(hasPermission('accountant', 'procurement.write'), true);
  assert.equal(hasPermission('accountant', 'inventory.write'), false);
  assert.equal(hasPermission('accountant', 'workspace.manage'), false);
});

test('cashier can make sales but cannot post finance or adjust stock', () => {
  assert.equal(hasPermission('cashier', 'sales.write'), true);
  assert.equal(hasPermission('cashier', 'sales.return'), false);
  assert.equal(hasPermission('cashier', 'finance.write'), false);
  assert.equal(hasPermission('cashier', 'inventory.write'), false);
});

test('unknown roles fail closed for writes', () => {
  assert.equal(hasPermission('super-user-typo', 'finance.write'), false);
  assert.equal(hasPermission('member', 'inventory.write'), false);
});

test('maps transactional endpoints to their protected capability', () => {
  assert.equal(permissionForRequest('POST', '/api/v1/workspaces/w/branches/b/sales/complete'), 'sales.write');
  assert.equal(permissionForRequest('POST', '/api/v1/workspaces/w/branches/b/sales/s/returns'), 'sales.return');
  assert.equal(permissionForRequest('POST', '/api/v1/workspaces/w/branches/b/inventory/movements'), 'inventory.write');
  assert.equal(permissionForRequest('POST', '/api/v1/workspaces/w/branches/b/payables/payments'), 'finance.write');
  assert.equal(permissionForRequest('GET', '/api/v1/workspaces/w/branches/b/payables/invoices'), 'finance.read');
});

test('maps operational register writes by module family', () => {
  assert.equal(permissionForRequest('PUT', '/api/v1/workspaces/w/branches/b/modules/payroll/records/r', { moduleId: 'payroll' }), 'people.write');
  assert.equal(permissionForRequest('PUT', '/api/v1/workspaces/w/branches/b/modules/stock-counts/records/r', { moduleId: 'stock-counts' }), 'inventory.write');
  assert.equal(permissionForRequest('PUT', '/api/v1/workspaces/w/branches/b/modules/accounting/records/r', { moduleId: 'accounting' }), 'finance.write');
});

test('branch-scope management is an owner/admin capability', () => {
  assert.equal(permissionForRequest('GET', '/api/v1/workspaces/w/memberships/u/branches'), 'workspace.manage');
  assert.equal(hasPermission('owner', 'workspace.manage'), true);
  assert.equal(hasPermission('accountant', 'workspace.manage'), false);
});

test('finance and sales permissions are separated', () => {
  assert.equal(permissionForRequest('GET', '/api/v1/workspaces/w/branches/b/receivables/invoices'), 'finance.read');
  assert.equal(permissionForRequest('POST', '/api/v1/workspaces/w/branches/b/receivables/receipts'), 'finance.write');
  assert.equal(permissionForRequest('POST', '/api/v1/workspaces/w/branches/b/commerce/sales-orders/o/fulfil'), 'fulfilment.write');
  assert.equal(hasPermission('cashier', 'finance.write'), false);
});
