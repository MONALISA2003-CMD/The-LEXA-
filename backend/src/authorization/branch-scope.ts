import { ForbiddenException } from '@nestjs/common';
import { canAccessBranch, isWorkspaceAdministrator } from './role-policy';

/** Enforce branch allow-list semantics consistently in every controller and the global guard. */
export async function assertBranchAccess(
  db: any,
  workspaceId: string,
  branchId: string,
  userId: string,
  role: string,
): Promise<void> {
  if (isWorkspaceAdministrator(role)) return;
  const rows = await db.$queryRaw<Array<{ scopeMode: string; assigned: boolean }>>`
    SELECT m.branch_scope_mode AS "scopeMode",
      EXISTS (SELECT 1 FROM branch_memberships bm WHERE bm.tenant_id=m.tenant_id AND bm.user_id=m.user_id AND bm.branch_id=${branchId}::uuid) AS assigned
    FROM memberships m WHERE m.tenant_id=${workspaceId}::uuid AND m.user_id=${userId}::uuid LIMIT 1
  `;
  if (!rows.length || !canAccessBranch(role, rows[0].scopeMode, rows[0].assigned)) {
    throw new ForbiddenException({ code: 'BRANCH_SCOPE_DENIED', message: 'Your membership does not grant access to this branch.' });
  }
}
