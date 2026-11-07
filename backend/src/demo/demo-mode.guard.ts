import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { demoRoutePolicy, isDemoRuntime } from './demo-policy';
import { DemoSessionService } from './demo-session.service';

/** Mandatory for every demo API route, even GET requests outside a workspace. */
@Injectable()
export class DemoModeGuard implements CanActivate {
  constructor(private readonly sessions:DemoSessionService){}
  async canActivate(context:ExecutionContext):Promise<boolean> {
    if(!isDemoRuntime())return true;
    const request=context.switchToHttp().getRequest<FastifyRequest>();
    const policy=demoRoutePolicy(request.method.toUpperCase(),request.url);
    if(policy==='blocked')throw new ForbiddenException({code:'DEMO_OPERATION_UNAVAILABLE',message:'This action is unavailable in the public demonstration.'});
    if(policy==='public')return true;
    const params=(request.params||{}) as Record<string,unknown>;
    const urlTenant=request.url.split('?')[0].match(/\/workspaces\/([0-9a-f-]{36})(?:\/|$)/i)?.[1];
    const tenantId=typeof params.workspaceId==='string'?params.workspaceId:urlTenant;
    try{await this.sessions.lookup(request,tenantId);}
    catch(error){
      if(error instanceof UnauthorizedException || error instanceof ForbiddenException)throw error;
      throw new UnauthorizedException({code:'DEMO_SESSION_REQUIRED',message:'Start a fresh LEXA demo.'});
    }
    return true;
  }
}
