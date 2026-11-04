import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, Subscription } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Nest guards are awaited before the controller is subscribed. An
 * AsyncLocalStorage.enterWith() inside an async guard does not reliably carry
 * through to the framework's awaiting continuation. As a result, controllers
 * may see no app.tenant_id and RLS silently returns no rows (including the
 * authenticated membership and branch) even though those rows exist.
 *
 * Subscribe to the controller *inside* the request's AsyncLocalStorage scope.
 * The tenant here is only a RLS filter, not authorization: the global guard
 * and every domain controller still validate the session, membership, branch,
 * and permission before returning any business data.
 */
@Injectable()
export class TenantRequestContextInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{params?: { workspaceId?: unknown }}>();
    const tenantId = request?.params?.workspaceId;
    if (typeof tenantId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      return next.handle();
    }
    return new Observable<unknown>((subscriber) => {
      let subscription: Subscription | undefined;
      this.prisma.runWithTenantContext({ tenantId }, () => {
        subscription = next.handle().subscribe(subscriber);
      });
      return () => subscription?.unsubscribe();
    });
  }
}
