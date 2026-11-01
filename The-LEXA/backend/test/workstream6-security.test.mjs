import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasPermission, permissionForRequest } from '../src/authorization/role-policy.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const controller = read('../src/people-projects/people-projects.controller.ts');
const service = read('../src/people-projects/people-projects.service.ts');
const core = read('../src/core/core.controller.ts');
const graph = read('../src/module-graph/module-graph.controller.ts');
const migration = read('../prisma/migrations/20261031190000_workstream6_people_projects_collaboration/migration.sql');

 test('HR privacy roles separate directory, personal HR records, compensation and payroll', () => {
  assert.equal(hasPermission('employee', 'people.read'), true);
  assert.equal(hasPermission('employee', 'people.private.read'), false);
  assert.equal(hasPermission('employee', 'people.compensation.read'), false);
  assert.equal(hasPermission('employee', 'payroll.read'), false);
  assert.equal(hasPermission('support_agent', 'people.read'), true);
  assert.equal(hasPermission('support_agent', 'people.private.read'), false);
  assert.equal(hasPermission('project_manager', 'projects.read'), true);
  assert.equal(hasPermission('project_manager', 'people.private.read'), false);
  assert.equal(hasPermission('hr_officer', 'people.private.read'), true);
  assert.equal(hasPermission('hr_officer', 'payroll.read'), false);
  assert.equal(hasPermission('payroll_officer', 'people.compensation.read'), true);
  assert.equal(hasPermission('payroll_officer', 'people.private.read'), false);
});

test('attendance and leave use private HR reads; payroll stays on payroll permissions', () => {
  assert.match(controller, /Your role cannot read employee attendance records/);
  assert.match(controller, /Your role cannot read employee leave records/);
  assert.match(controller, /You may view only your own shift assignments/);
  assert.match(controller, /projectManagerEmployeeId/);
  assert.equal(permissionForRequest('GET', '/api/v1/workspaces/w/branches/b/workstream6/people/payroll/runs'), 'payroll.read');
  assert.equal(permissionForRequest('GET', '/api/v1/workspaces/w/branches/b/workstream6/people/attendance'), 'people.read');
});

test('payroll calculation consumes only approved leave, approved timesheets, and reviewed absences', () => {
  assert.match(controller, /l\.status='approved' AND l\.paid=false/);
  assert.match(controller, /l\.status='approved' AND l\.paid=true/);
  assert.match(controller, /a\.status='absent' AND a\.reviewed_at IS NOT NULL/);
  assert.match(controller, /FROM hr_timesheets[\s\S]*?status='approved'/);
  assert.match(controller, /approvedPaidLeaveHours/);
  assert.match(controller, /effective_from<=\$\{start\}::date/);
  assert.match(controller, /effective_to IS NULL OR c\.effective_to>=\$\{end\}::date/);
});

test('shared approval routes delegate to typed owning services and reject generic approvals', () => {
  assert.match(core, /this\.peopleProjects\.decideSharedApproval/);
  assert.match(service, /ownerModule === 'leave'/);
  assert.match(service, /ownerModule === 'timesheets'/);
  assert.match(service, /ownerModule === 'payroll'/);
  assert.match(service, /no registered owning-module decision handler/);
  assert.match(service, /requester cannot approve or reject their own/);
});

test('approved project timesheets create traceable labour cost records', () => {
  assert.match(service, /Cannot approve a project timesheet until the employee has effective-dated compensation/);
  assert.match(service, /source_type,source_id,category,description,cost_minor/);
  assert.match(service, /'timesheet',\$\{ownerRecordId\},'labour'/);
  assert.match(service, /'timesheet_labour_cost'/);
});

test('audit event register is append-only at database level', () => {
  assert.match(migration, /CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events/);
  assert.match(migration, /CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events/);
  assert.match(migration, /audit_events is append-only/);
});

test('database foreign keys enforce tenant and branch consistency for HR and project records', () => {
  for (const fragment of [
    'UNIQUE (tenant_id,branch_id,id)',
    'FOREIGN KEY (tenant_id,branch_id,employee_id) REFERENCES hr_employees(tenant_id,branch_id,id)',
    'FOREIGN KEY (tenant_id,branch_id,project_id) REFERENCES projects(tenant_id,branch_id,id)',
    'FOREIGN KEY (tenant_id,branch_id,payroll_run_id) REFERENCES hr_payroll_runs(tenant_id,branch_id,id)',
    'FOREIGN KEY (tenant_id,branch_id,payroll_line_id) REFERENCES hr_payroll_lines(tenant_id,branch_id,id)',
  ]) assert.ok(migration.includes(fragment), `Missing branch-scope invariant: ${fragment}`);
  assert.match(migration, /gross_minor bigint NOT NULL/);
});

test('module graph protects HR event visibility and permission-checks link deletion before mutation', () => {
  assert.match(graph, /attendance: \['people\.private\.read'/);
  assert.match(graph, /leave: \['people\.private\.read'/);
  assert.match(graph, /this\.assertModulePermission\(membership\.role, link\.sourceModuleId, true\)/);
  assert.match(graph, /this\.assertModulePermission\(membership\.role, link\.targetModuleId, true\)/);
  assert.match(graph, /module_id <> 'employees' OR record_id = \$\{ownEmployeeId\}/);
});

test('global search and shared approvals constrain employee-owned HR records', () => {
  assert.match(core, /row\.moduleId === 'employees'/);
  assert.match(core, /row\.recordId}::uuid AND user_id=\$\{session\.userId\}/);
  assert.match(core, /data\.requestedBy !== session\.userId/);
});

test('typed Workstream 6 registers cannot be mutated through generic module JSON', () => {
  const guard = read('../src/core/typed-module-write.guard.ts');
  for (const moduleId of ['projects', 'project-tasks', 'project-costs', 'support', 'shifts', 'audit']) {
    assert.match(guard, new RegExp(`['"]${moduleId}['"]`), `Missing typed write guard for ${moduleId}`);
  }
});

test('daily timesheet limits serialize across projects and respect employment dates', () => {
  assert.match(controller, /SELECT id,hire_date,termination_date FROM hr_employees[\s\S]*?FOR UPDATE/);
  assert.match(controller, /Timesheets must fall within the employee employment dates/);
  assert.match(controller, /sum\(regular_hours\+overtime_hours\)/);
  assert.match(controller, /across all timesheets for one day/);
});

test('monthly payroll uses integer minor-unit prorating and supports fractional leave days', () => {
  assert.match(controller, /payableDayHundredths=BigInt\(Math\.max\(0,Math\.round\(payableDays\*100\)\)\)/);
  assert.match(controller, /BigInt\(employee\.base_pay_minor\)\*payableDayHundredths/);
  assert.doesNotMatch(controller, /perWorkday\*BigInt\(payableDays\)/);
});

test('shift, compensation and leave overlap constraints use per-employee transaction locks', () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(NEW\.tenant_id::text \|\| ':' \|\| NEW\.branch_id::text \|\| ':' \|\| NEW\.employee_id::text/);
  assert.match(migration, /CREATE TRIGGER hr_leave_no_overlap/);
  assert.match(migration, /Leave requests for one employee cannot overlap/);
});

test('project managers can decide only timesheets in their management or task assignment scope', () => {
  assert.match(core, /actorRole: normalizeRole\(membership\.role\)/);
  assert.match(service, /input\.actorRole === 'project_manager'/);
  assert.match(service, /This timesheet is outside your project management or assigned task scope/);
  assert.match(service, /pt\.assigned_employee_id=\$\{approverEmployeeId\}::uuid/);
});

test('project managers only see approval cards for managed projects or tasks assigned to them', () => {
  assert.match(core, /const projectManagerRole = normalizeRole\(membership\.role\) === 'project_manager'/);
  assert.match(core, /visibleProjectTimesheetIds/);
  assert.match(core, /!visibleProjectTimesheetIds\.has\(String\(data\.ownerRecordId/);
  assert.match(core, /pt\.assigned_employee_id=\$\{employeeId\}::uuid/);
});

test('project task timesheets must identify their parent project', () => {
  assert.match(controller, /taskId&&!projectId/);
  assert.match(controller, /Select the project that owns the project task/);
});
