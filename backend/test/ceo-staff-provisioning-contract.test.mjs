
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasPermission, isOwnerRole, permissionForRequest } from '../src/authorization/role-policy.ts';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('legacy and new direct-signup owners have every required CEO capability',()=>{
  for(const role of ['owner','owner_administrator']){
    assert.equal(isOwnerRole(role),true);
    for(const permission of ['workspace.manage','sales.read','sales.write','inventory.read','inventory.write','finance.read','finance.write','people.private.read','people.compensation.write','payroll.read','payroll.write','audit.read','approval.decide','saas.manage']){
      assert.equal(hasPermission(role,permission),true,role+':'+permission);
    }
  }
  assert.match(read('../src/auth/public-registration.controller.ts'),/role: 'owner'/);
  assert.match(read('../src/core/core.controller.ts'),/SINGLE_BUSINESS_ACCOUNT/);
  assert.match(read('../src/core/core.controller.ts'),/BRANCH_CREATION_DISABLED/);
});

test('business setup errors never masquerade as not being CEO',()=>{
  const backend=read('../src/business-setup/business-setup.controller.ts');
  const frontend=read('../../lexa-frontend/src/modules/business-setup/BusinessSetupPage.tsx');
  assert.match(backend,/runWithTenantContext\(\{ tenantId: workspaceId, userId: member.userId \}/);
  assert.match(frontend,/Business profile unavailable/);
  assert.match(frontend,/Retry loading profile/);
  assert.doesNotMatch(frontend,/if \(!data \|\| !data\.isOwner\)/);
});

test('employee creation is CEO-only, never establishes business ownership and rotates temporary passwords',()=>{
  const src=read('../src/staff/staff-provisioning.controller.ts');
  assert.match(src,/Only the CEO may manage employee accounts/);
  assert.match(src,/!isOwnerRole\(member\.role\)/);
  assert.match(src,/mustChangePassword:true/);
  assert.match(src,/branchScopeMode:'all'/);
  assert.match(src,/status:'ACTIVE'/);
  assert.match(src,/tx\.auditEvent\.create/);
  assert.doesNotMatch(src,/tenant\.create\(/);
  assert.doesNotMatch(src,/role:'owner'/);
  const guard=read('../src/authorization/tenant-authorization.guard.ts');
  assert.match(guard,/TEMP_PASSWORD_CHANGE_REQUIRED/);
  assert.match(read('../src/core/core.controller.ts'),/auth\/change-initial-password/);
});

test('no staff role can grant ownership, manage settings or reveal CEO-private salaries by default',()=>{
  const denied=['business_manager','manager','administrator','branch_manager','cashier','sales','inventory_operator','accountant','delivery_officer','customer_service','viewer','employee'];
  for(const role of denied){
    assert.equal(hasPermission(role,'workspace.manage'),false,role);
    assert.equal(hasPermission(role,'people.private.read'),false,role);
    assert.equal(hasPermission(role,'people.compensation.read'),false,role);
    assert.equal(isOwnerRole(role),false);
  }
  assert.equal(permissionForRequest('POST','/workspaces/abc/staff'),'workspace.manage');
  assert.equal(permissionForRequest('POST','/workspaces/abc/staff/id/reset-password'),'workspace.manage');
  assert.equal(permissionForRequest('GET','/workspaces/abc/my-employment'),'workspace.read');
});

test('employee private data is tenant-scoped and preserved in authoritative backups',()=>{
 const migration=read('../prisma/migrations/20261104010000_ceo_staff_provisioning/migration.sql');
 assert.match(migration,/FORCE ROW LEVEL SECURITY/);
 assert.match(migration,/hr_employee_private_profiles_scope/);
 assert.match(migration,/sessions_owner_resets_employee_password/);
 assert.match(migration,/employee\.role NOT IN\('owner','owner_administrator'\)/);
 const inventory=JSON.parse(read('../backup/authoritative-inventory.json'));
 assert.ok(inventory.some(x=>x.table==='hr_employee_private_profiles'&&x.disposition==='authoritative'));
 const frontend=read('../../lexa-frontend/src/modules/operations/AddEmployeePanel.tsx');
 assert.match(frontend,/temporary password/i);
 assert.match(frontend,/residentialAddress/);
 assert.match(frontend,/emergencyContactName/);
});

