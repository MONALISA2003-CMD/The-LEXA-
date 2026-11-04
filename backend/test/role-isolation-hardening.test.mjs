import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasPermission, permissionForRequest, canAccessBranch } from '../src/authorization/role-policy.ts';
import { meetsNewPasswordPolicy } from '../src/auth/new-password-policy.ts';
const src = p=>readFileSync(new URL(p,import.meta.url),'utf8');
const base='/api/v1/workspaces/w/branches/b';

test('new passwords are exactly eight mixed ASCII characters while existing sessions are unaffected',()=>{
  for(const value of ['Ab1!cdef','Xy9#1234','Aa1~bcde']) assert.equal(meetsNewPasswordPolicy(value),true);
  for(const value of ['Aa1!bcdef','Aa1!bcd','abcdefgh','ABCDEFGH','abc12345','Abcdef12','Abcdef!!','AA1!AAAA','aA1!😀']) assert.equal(meetsNewPasswordPolicy(value),false,value);
  assert.match(src('../src/auth/public-registration.controller.ts'),/meetsNewPasswordPolicy/);
  assert.match(src('../src/staff/staff-provisioning.controller.ts'),/meetsNewPasswordPolicy/);
});

test('field agents cannot see unassigned cases, employees cannot browse HR directory',()=>{
  assert.equal(hasPermission('field_agent','support.assigned.read'),true);
  assert.equal(hasPermission('field_agent','support.read'),false);
  assert.equal(hasPermission('field_agent','support.write'),false);
  assert.equal(hasPermission('employee','people.self.read'),true);
  assert.equal(hasPermission('employee','people.self.write'),true);
  assert.equal(hasPermission('employee','people.read'),false);
  assert.equal(hasPermission('employee','people.private.read'),false);
  assert.equal(hasPermission('employee','payroll.read'),false);
  assert.equal(permissionForRequest('GET',`${base}/workstream6/support/my-cases`),'support.assigned.read');
  assert.equal(permissionForRequest('PATCH',`${base}/workstream6/support/my-cases/abc`),'support.assigned.write');
  assert.equal(permissionForRequest('GET',`${base}/workstream6/people/my-overview`),'people.self.read');
  assert.equal(permissionForRequest('POST',`${base}/workstream6/people/my-timesheets`),'people.self.write');
});

test('approvals are domain-scoped and cannot cross purchasing, quality, HR or payroll',()=>{
  assert.equal(hasPermission('quality_officer','quality.write'),true);
  for(const role of ['quality_officer','payroll_officer','hr_officer','project_manager']) assert.equal(hasPermission(role,'approval.decide'),false);
  assert.equal(hasPermission('payroll_officer','payroll.approve'),false);
  assert.equal(hasPermission('finance_manager','payroll.approve'),true);
  assert.equal(hasPermission('hr_manager','people.leave.approve'),true);
  assert.equal(hasPermission('hr_manager','procurement.approve'),false);
  assert.equal(hasPermission('project_manager','people.timesheet.approve'),true);
  assert.equal(hasPermission('production_officer','inventory.write'),false);
  assert.equal(permissionForRequest('POST',`${base}/supply-chain/quality/inspections/abc/decision`),'quality.approve');
  assert.equal(permissionForRequest('POST',`${base}/supply-chain/procurement/awards/abc/approve`),'procurement.approve');
  assert.equal(permissionForRequest('POST',`${base}/supply-chain/inventory/stock-counts/abc/approve`),'inventory.approve');
  assert.equal(permissionForRequest('POST',`${base}/unexpected`),'workspace.manage');
});

test('branch restrictions deny unassigned access and an owner can see role catalog',()=>{
  assert.equal(canAccessBranch('cashier','restricted',false),false);
  assert.equal(canAccessBranch('cashier','restricted',true),true);
  assert.equal(canAccessBranch('owner','restricted',false),true);
  assert.equal(permissionForRequest('GET','/api/v1/workspaces/w/roles/catalog'),'workspace.manage');
  assert.equal(hasPermission('cashier','workspace.manage'),false);
  const invites=src('../src/invitations/invitations.controller.ts');
  assert.match(invites,/branchIds\.length/);
  assert.match(invites,/tenantId:workspaceId,id:\{in:branchIds\}/);
  assert.match(invites,/idempotencyKey:key/);
});

test('owner provisioned employees have tenant-scoped request replay protection',()=>{
  const controller=src('../src/staff/staff-provisioning.controller.ts');
  assert.match(controller,/idempotency-key/i);
  assert.match(controller,/requestHash/);
  assert.match(controller,/branchMembership\.createMany/);
  assert.match(controller,/isolationLevel:'Serializable'/);
  assert.doesNotMatch(controller,/role:'owner'/); // employee cannot create a new owner
  assert.match(controller,/!isOwnerRole/);
});

test('personal and field-service APIs never accept employee identity from the request',()=>{
  const c=src('../src/people-projects/people-projects.controller.ts');
  assert.match(c,/if\(value\.employeeId\)throw new ForbiddenException/);
  assert.match(c,/assigned_employee_id=\$\{employeeId\}::uuid FOR UPDATE/);
  assert.match(c,/WHERE tenant_id=\$\{w\}::uuid AND branch_id=\$\{b\}::uuid AND employee_id=\$\{employeeId\}::uuid/);
});
