import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hasOperationalAccess, type SubscriptionState } from './subscription-policy';

/**
 * Subscription access is enforced for GET as well as POST/PATCH/DELETE.
 * TenantAuthorizationGuard alone only checks operations that need a permission.
 * Never rely on a frontend-only paywall or a scheduled expiry job.
 */
@Injectable()
export class SubscriptionAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const params = (request.params || {}) as Record<string, unknown>;
    const tenantId = typeof params.workspaceId === 'string' ? params.workspaceId : '';
    if (!tenantId) return true;
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) throw new NotFoundException('Business not found.');
    const route = request.url.split('?')[0] || '';
    // The signed-in owner/member can still check the account, renew and ask for help.
    // Legacy workspace shell fetches only these few endpoints to identify the account.
    const normalized = route.replace(/^\/api\/v1/, '');
    const exempt = new RegExp(`^/workspaces/${tenantId}/platform-billing(?:/.*)?$`).test(normalized)
      || (request.method==='GET' && new RegExp(`^/workspaces/${tenantId}(?:/access|/branches)?$`).test(normalized));
    if (exempt) return true;
    const cookieValue = (request.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('lexa_session='))?.slice('lexa_session='.length);
    if (!cookieValue) throw new UnauthorizedException('Sign in to continue.');
    let decoded: string;
    try { decoded=decodeURIComponent(cookieValue); }catch { throw new UnauthorizedException('Invalid session.'); }
    const hash=createHash('sha256').update(decoded).digest('hex');
    const session=await this.prisma.session.findFirst({ where:{tokenHash:hash,expiresAt:{gt:new Date()}},select:{userId:true} });
    if (!session) throw new UnauthorizedException('Session expired.');
    return this.prisma.runWithTenantContext({tenantId,userId:session.userId},async()=>{
      const membership=await this.prisma.membership.findUnique({where:{tenantId_userId:{tenantId,userId:session.userId}},select:{status:true}});
      if(!membership||membership.status!=='ACTIVE')throw new NotFoundException('Business not found.');
      const accounts=await this.prisma.$queryRaw<Array<{status:SubscriptionState;paid_through:Date|null}>>`
        SELECT status,paid_through FROM platform_subscriptions WHERE tenant_id=${tenantId}::uuid LIMIT 1`;
      if(!accounts[0]||!hasOperationalAccess(accounts[0].status,accounts[0].paid_through)){
        throw new ForbiddenException({code:'LEXA_SUBSCRIPTION_REQUIRED',message:'Your LEXA subscription needs approval or renewal. Your saved business data remains available after activation.',workspaceId:tenantId});
      }
      return true;
    });
  }
}
