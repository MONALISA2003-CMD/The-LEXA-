import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/core/core.controller.ts', import.meta.url), 'utf8');

function createWorkspaceBody() {
  const start = source.indexOf('  async createWorkspace(');
  const end = source.indexOf("\n  @Get('workspaces/:workspaceId')", start);
  assert.ok(start >= 0 && end > start, 'workspace handler must exist');
  return source.slice(start, end);
}

test('new workspace establishes authenticated tenant RLS scope before INSERT RETURNING', () => {
  const body = createWorkspaceBody();
  const uuid = body.indexOf('const tenantId = randomUUID()');
  const tx = body.indexOf('this.prisma.$transaction(');
  const scope = body.indexOf("set_config('app.tenant_id'");
  const user = body.indexOf("set_config('app.user_id'");
  const insert = body.indexOf('tx.tenant.create(');
  assert.ok(uuid >= 0 && uuid < tx && tx < scope && scope < user && user < insert);
  assert.match(body, /data: \{ id: tenantId, name: businessName,/);
  assert.doesNotMatch(body, /set_config\('app.tenant_id', \$\{created\.id\}/);
});

test('new workspace commits subscription, owner, branch and audit in one scoped transaction', () => {
  const body = createWorkspaceBody();
  const scope = body.indexOf("set_config('app.tenant_id'");
  const tenant = body.indexOf('tx.tenant.create(');
  const owner = body.indexOf('tx.membership.create(');
  const branch = body.indexOf('tx.branch.create(');
  const audit = body.indexOf('tx.auditEvent.create(');
  assert.ok(scope >= 0 && scope < tenant && tenant < owner && owner < branch && branch < audit);
  assert.match(body, /return created;\s*\}\);/);
});
