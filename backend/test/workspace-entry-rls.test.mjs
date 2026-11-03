import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/core/core.controller.ts', import.meta.url), 'utf8');

function routeMethod(start, end) {
  const from = source.indexOf(start);
  const until = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && until > from, `Could not locate ${start}`);
  return source.slice(from, until);
}

test('business listing explicitly scopes RLS to the authenticated user throughout the query', () => {
  const list = routeMethod("  @Get('workspaces')", "  @Post('workspaces')");
  assert.match(list, /const session = await this\.sessionFor\(request\)/);
  assert.match(list, /return this\.prisma\.runWithTenantContext\(\{ userId: session\.userId \}, async \(\) => \{/);
  assert.match(list, /userId: session\.userId, status: 'ACTIVE'/);
  assert.match(list, /include: \{ tenant: true \}/);
  assert.doesNotMatch(list, /set_config\('role'.*lexa_app\b/);
});

test('branch listing keeps both user and tenant in transaction-local access scope', () => {
  const list = routeMethod("  @Get('workspaces/:workspaceId/branches')", "  @Post('workspaces/:workspaceId/branches')");
  assert.match(list, /runWithTenantContext\(\{ tenantId: workspaceId, userId: session\.userId \}/);
  assert.match(list, /membershipFor\(session\.userId, workspaceId\)/);
  assert.match(list, /branchScopeMode === 'restricted'/);
  assert.match(list, /branchMemberships|branch_memberships/);
});


test('direct business recovery verifies membership inside the same authenticated tenant RLS scope', () => {
  const route = routeMethod("  @Get('workspaces/:workspaceId')", "  @Patch('workspaces/:workspaceId')");
  assert.match(route, /runWithTenantContext\(\{ tenantId: workspaceId, userId: session\.userId \}/);
  assert.match(route, /membershipFor\(session\.userId, workspaceId\)/);
  assert.doesNotMatch(route, /tenant\.findUnique\(/);
});
