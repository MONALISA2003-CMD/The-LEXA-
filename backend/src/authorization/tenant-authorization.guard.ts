import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { canAccessBranch, hasPermission, permissionForRequest } from './role-policy';

function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return undefined; }
  }
  return undefined;
}

@Injectable()
export class TenantAuthorizationGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const params = (request.params ?? {}) as Record<string, unknown>;
    const workspaceId = typeof params.workspaceId === 'string' ? params.workspaceId : undefined;
    if (!workspaceId) return true; // public auth/bootstrap and workspace-creation routes

    const permission = permissionForRequest(request.method, request.url, params);
    if (!permission) return true; // GET access is verified by each domain controller

    const token = cookieValue(request.headers.cookie, 'lexa_session');
    if (!token) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Sign in to continue.' });
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = await this.prisma.session.findFirst({
      where: { tokenHash, expiresAt: { gt: new Date() } },
      select: { userId: true },
    });
    if (!session) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Your session has expired. Sign in again.' });

    const membership = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: workspaceId, userId: session.userId } },
      select: { role: true, status: true },
    });
    if (!membership || membership.status !== 'ACTIVE') throw new NotFoundException('Workspace not found.');

    const branchId = typeof params.branchId === 'string' ? params.branchId : undefined;
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, tenantId: workspaceId },
        select: { id: true },
      });
      if (!branch) throw new NotFoundException('Branch not found.');
      const scope = await this.prisma.$queryRaw<Array<{ scopeMode: string; assigned: boolean }>>`
        SELECT m.branch_scope_mode AS "scopeMode",
          EXISTS (SELECT 1 FROM branch_memberships bm WHERE bm.tenant_id=m.tenant_id AND bm.user_id=m.user_id AND bm.branch_id=${branchId}::uuid) AS assigned
        FROM memberships m WHERE m.tenant_id=${workspaceId}::uuid AND m.user_id=${session.userId}::uuid LIMIT 1
      `;
      if (!scope.length || !canAccessBranch(membership.role, scope[0].scopeMode, scope[0].assigned)) {
        throw new ForbiddenException({ code: 'BRANCH_SCOPE_DENIED', message: 'Your membership does not grant access to this branch. Ask a workspace administrator to assign your branch access.' });
      }
    }

    if (!hasPermission(membership.role, permission)) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Your workspace role does not permit this operation.',
        permission,
      });
    }
    return true;
  }
}
