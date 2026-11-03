import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  hasPermission, isWorkspaceAdministrator, isOwnerRole, permissionForRequest,
} from '../src/authorization/role-policy.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const signup = readFileSync(resolve(root, 'src/auth/public-registration.controller.ts'), 'utf8');
const invites = readFileSync(resolve(root, 'src/invitations/invitations.controller.ts'), 'utf8');
const core = readFileSync(resolve(root, 'src/core/core.controller.ts'), 'utf8');

test('publicly verified business signups receive an active owner membership', () => {
  assert.match(signup, /role:\s*'owner',\s*status:\s*'ACTIVE'/);
  assert.match(signup, /@Post\('signup\/verify'\)/);
});

test('CEO/owner retains business governance and all key operational permissions', () => {
  for (const permission of ['workspace.manage', 'finance.write', 'sales.write', 'inventory.write', 'reports.read', 'payroll.write', 'audit.read']) {
    assert.equal(hasPermission('owner', permission), true, `CEO missing ${permission}`);
  }
  assert.equal(isOwnerRole('owner'), true);
  assert.equal(isWorkspaceAdministrator('owner'), true);
});

test('employee roles cannot manage employee accounts or elevate to CEO', () => {
  for (const role of ['business_manager', 'manager', 'accountant', 'cashier', 'sales', 'payroll_officer', 'member', 'viewer', 'hr_officer', 'administrator', 'admin']) {
    assert.equal(hasPermission(role, 'workspace.manage'), false, `${role} can manage ownership`);
    assert.equal(isWorkspaceAdministrator(role), false, `${role} is mistaken for owner`);
  }
  assert.equal(permissionForRequest('POST', '/api/v1/workspaces/test/invitations'), 'workspace.manage');
  assert.equal(permissionForRequest('PUT', '/api/v1/workspaces/test/memberships/employee/role'), 'workspace.manage');
  assert.equal(permissionForRequest('PUT', '/api/v1/workspaces/test/memberships/employee/status'), 'workspace.manage');
});

test('invite-only employee onboarding cannot grant owner roles', () => {
  assert.match(invites, /if\(!ROLES\.has\(role\)\)/);
  const roleAllowlist = invites.match(/const ROLES = new Set\(\[([^\]]+)\]\)/)?.[1] ?? '';
  assert.ok(roleAllowlist, 'Invitation role allowlist must exist');
  assert.doesNotMatch(roleAllowlist, /'owner'|'owner_administrator'/);
  assert.match(invites, /isWorkspaceAdministrator\(membership\.role\)/);
  assert.match(core, /Workspace ownership cannot be changed through ordinary role management/);
  assert.match(core, /Business ownership cannot be suspended/);
  assert.match(core, /Business ownership cannot be removed/);
});
