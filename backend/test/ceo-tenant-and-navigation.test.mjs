import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {hasPermission, isOwnerRole, isWorkspaceAdministrator, permissionForRequest} from '../src/authorization/role-policy.ts';

const file=async p=>readFile(new URL(p,import.meta.url),'utf8');

test('only CEO owner accounts may configure the business, memberships and subscription',()=>{
  for(const role of ['owner','Owner / Administrator']){
    assert.equal(isWorkspaceAdministrator(role),true);
    assert.equal(hasPermission(role,'workspace.manage'),true);
    assert.equal(hasPermission(role,'saas.manage'),true);
  }
  for(const role of ['administrator','admin','business_manager','manager','cashier','sales','inventory_operator','warehouse_operator','procurement_officer','accountant','hr_officer','payroll_officer','customer_service','support_agent','auditor','viewer','member']){
    assert.equal(isOwnerRole(role),false,role);
    assert.equal(isWorkspaceAdministrator(role),false,role);
    assert.equal(hasPermission(role,'workspace.manage'),false,role);
    assert.equal(hasPermission(role,'saas.manage'),false,role);
  }
  assert.equal(permissionForRequest('PUT','/api/v1/workspaces/w/memberships/u/status'),'workspace.manage');
  assert.equal(permissionForRequest('GET','/api/v1/workspaces/w/access'),'workspace.read');
  assert.equal(permissionForRequest('DELETE','/api/v1/workspaces/w/memberships/u'),'workspace.manage');
  assert.equal(permissionForRequest('PUT','/api/v1/workspaces/w/branches/b/modules/customers/records/r',{moduleId:'customers'}),'crm.write');
});

test('employees have separated roles and no blanket permission to modify owner settings',()=>{
  assert.equal(hasPermission('cashier','sales.write'),true);
  assert.equal(hasPermission('cashier','finance.write'),false);
  assert.equal(hasPermission('cashier','payroll.read'),false);
  assert.equal(hasPermission('inventory_operator','inventory.write'),true);
  assert.equal(hasPermission('inventory_operator','finance.write'),false);
  assert.equal(hasPermission('customer_service','crm.write'),true);
  assert.equal(hasPermission('customer_service','finance.read'),false);
  assert.equal(hasPermission('procurement_officer','procurement.write'),true);
  assert.equal(hasPermission('procurement_officer','finance.write'),false);
  assert.equal(hasPermission('viewer','sales.write'),false);
});

test('suspension and employee invitations are scoped, auditable, and prevent privilege escalation',async()=>{
  const [controller,guard,invites,publicReg]=await Promise.all([
    file('../src/core/core.controller.ts'),file('../src/authorization/tenant-authorization.guard.ts'),
    file('../src/invitations/invitations.controller.ts'),file('../src/auth/public-registration.controller.ts')]);
  assert.match(controller, /async changeMemberStatus/);
  assert.match(controller, /Only the business owner manages employee access/);
  assert.match(controller, /if \(session\.userId === userId\)/);
  assert.match(controller, /membership\.suspended/);
  assert.match(controller, /session\.deleteMany/);
  assert.match(controller, /membership\.removed/);
  assert.match(controller, /async removeEmployeeFromBusiness/);
  const sessionRls = await file('../prisma/migrations/20261103230000_owner_suspended_session_revocation/migration.sql');
  assert.match(sessionRls, /sessions_owner_revokes_suspended_employee_sessions/);
  assert.match(sessionRls, /actor\.role IN \('owner', 'owner_administrator'\)/);
  assert.match(sessionRls, /target\.status = 'SUSPENDED'/);
  assert.match(guard, /STAFF_DELETION_FORBIDDEN/);
  assert.match(guard, /request\.method\.toUpperCase\(\) === 'DELETE'/);
  assert.match(invites, /input\.allBranches===true|input\.allBranches === true/);
  assert.match(invites, /previous\?\.status==='SUSPENDED'/);
  assert.match(publicReg, /SUSPENDED/);
});

test('all module destinations remain available through the categorized sidebar, not All modules',async()=>{
  const [shell,router,catalog,buildScript]=await Promise.all([
    file('../../lexa-frontend/src/app/layouts/AppShell.tsx'),file('../../lexa-frontend/src/app/router.tsx'),
    file('../../lexa-frontend/src/modules/operations/moduleCatalog.ts'),file('../../lexa-frontend/scripts/complete_modules.py')]);
  const ids=[...catalog.matchAll(/\bid: '([a-z][a-z0-9-]*)'\s*,\s*title:/g)].map(x=>x[1]);
  assert.ok(ids.length>=50,`Expected 50+ real modules; found ${ids.length}`);
  assert.equal(new Set(ids).size,ids.length,'Duplicate catalog IDs');
  for(const id of ids){if(id==='team') assert.match(shell,/to: '\/team'/);else assert.ok(shell.includes(`to: '/modules/${id}'`),`Module ${id} missing in sidebar`);}
  assert.doesNotMatch(shell,/All modules|Business & branches|uiMode|const visibleNavSections = uiMode/);
  assert.match(shell,/Team access/);
  assert.match(shell,/nav-section-title lexa-nav-group-toggle/);
  assert.match(router,/path: 'modules', element: <Navigate to="\/" replace \/>/);
  assert.match(buildScript,/CEO-navigation release/);
});

test('overview charts read tenant-scoped source data without example-only figures',async()=>{
  const [dashboard,controller]=await Promise.all([
    file('../../lexa-frontend/src/modules/dashboard/DashboardPage.tsx'),file('../src/core/core.controller.ts')]);
  assert.match(dashboard,/apiDashboard\.getOverview/);
  assert.match(dashboard,/refetchInterval: 45_000/);
  assert.match(dashboard,/LineTrendChart/);
  assert.match(dashboard,/DonutBreakdownChart/);
  assert.match(dashboard,/BarBreakdownChart/);
  assert.match(dashboard,/Recent business activity/);
  assert.match(dashboard,/Recorded receipts by method/);
  assert.match(controller,/salePayment\.findMany/);
  assert.match(controller,/stockMovement\.findMany/);
  assert.match(controller,/tenantId: workspaceId/);
});
