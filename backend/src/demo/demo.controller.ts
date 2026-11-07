import { BadRequestException, Body, Controller, Get, Post, Req, Res, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import type { FastifyReply,FastifyRequest } from 'fastify';
import { CsrfGuard } from '../core/csrf.guard';
import { DEMO_MAX_SECONDS, DEMO_IDLE_SECONDS } from './demo-policy';
import { verifyTurnstileChallenge } from '../auth/turnstile-verification';
import { DemoSessionService } from './demo-session.service';

@Controller('demo')
export class DemoController {
  constructor(private readonly demo:DemoSessionService){}

  @Post('sessions') @UseGuards(CsrfGuard)
  async begin(@Body() body:{turnstileToken?:unknown}|undefined,@Req() request:FastifyRequest,@Res({passthrough:true}) reply:FastifyReply){
    try{
      await verifyTurnstileChallenge(body?.turnstileToken,{
        secret:process.env.TURNSTILE_SECRET_KEY,
        enforced:process.env.DEMO_TURNSTILE_ENFORCE==='true'||process.env.NODE_ENV==='production',
        allowedHosts:[process.env.DEMO_ORIGIN||'https://demo.lexaaamaal.com'].map(x=>new URL(x).hostname),
        action:'demo',
      });
    }catch(error){
      if(String(error).includes('UNAVAILABLE')||String(error).includes('CONFIGURATION'))throw new ServiceUnavailableException('Demo verification is temporarily unavailable.');
      throw new BadRequestException('Complete the human verification check to start the demo.');
    }
    const created=await this.demo.start(request);
    reply.header('Cache-Control','no-store');
    reply.header('Set-Cookie',`lexa_session=${encodeURIComponent(created.token)}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${DEMO_MAX_SECONDS}`);
    return {workspaceId:created.workspaceId,expiresAt:created.expiresAt,idleSeconds:created.idleSeconds};
  }

  @Get('session')
  async session(@Req() request:FastifyRequest,@Res({passthrough:true}) reply:FastifyReply){
    const current=await this.demo.lookup(request);
    reply.header('Cache-Control','no-store');
    return {workspaceId:current.tenantId,expiresAt:current.expiresAt.toISOString(),idleSeconds:DEMO_IDLE_SECONDS,demo:true};
  }

  @Post('reset') @UseGuards(CsrfGuard)
  async reset(@Req() request:FastifyRequest,@Res({passthrough:true}) reply:FastifyReply){
    const previous=await this.demo.lookup(request);
    const next=await this.demo.start(request); // New isolated seed before revoking old session.
    await this.demo.end(previous);
    reply.header('Set-Cookie',`lexa_session=${encodeURIComponent(next.token)}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${DEMO_MAX_SECONDS}`);
    reply.header('Cache-Control','no-store');
    return {workspaceId:next.workspaceId,expiresAt:next.expiresAt,idleSeconds:next.idleSeconds};
  }

  @Post('end') @UseGuards(CsrfGuard)
  async end(@Req() request:FastifyRequest,@Res({passthrough:true}) reply:FastifyReply){
    const current=await this.demo.lookup(request);
    await this.demo.end(current);
    reply.header('Set-Cookie','lexa_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0');
    reply.header('Cache-Control','no-store');
    return {ended:true};
  }
}
