import { ForbiddenException, HttpException, HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DEMO_IDLE_SECONDS, DEMO_MAX_PER_HOUR, DEMO_MAX_SECONDS, DEMO_SAMPLE_VERSION, isDemoRuntime, validDemoSession, validateDemoEnvironment } from './demo-policy';
import { DEMO_NAME, seedDemoBusiness } from './demo-seed';

const sha = (value:string)=>createHash('sha256').update(value).digest('hex');
export function demoCookie(header:string|undefined):string|undefined {
  const part=(header??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('lexa_session='));
  if(!part)return undefined;
  try{return decodeURIComponent(part.slice('lexa_session='.length));}catch{return undefined;}
}

export type DemoIdentity = { id:string; userId:string; tenantId:string; expiresAt:Date; lastSeenAt:Date; endedAt:Date|null };

@Injectable()
export class DemoSessionService implements OnModuleInit,OnModuleDestroy {
  private readonly logger=new Logger(DemoSessionService.name);
  private cleanupTimer:ReturnType<typeof setInterval>|undefined;
  constructor(private readonly prisma:PrismaService){}

  async onModuleInit():Promise<void> {
    validateDemoEnvironment();
    if(!isDemoRuntime())return;
    const name=await this.prisma.$queryRaw<Array<{name:string}>>`SELECT current_database() AS name`;
    if(name[0]?.name!=='lexa_demo')throw new Error('Refusing demo mode outside the lexa_demo database.');
    // A failed purge is reported and retried; it cannot remove an unexpired session.
    this.cleanupTimer=setInterval(()=>void this.cleanExpired().catch(e=>this.logger.error('Sandbox cleanup failed', e instanceof Error?e.message:String(e))),15*60_000);
    this.cleanupTimer.unref();
  }
  async onModuleDestroy():Promise<void>{if(this.cleanupTimer)clearInterval(this.cleanupTimer);}

  private visitorHash(request:FastifyRequest):string {
    const peer=request.ip||'unknown';
    return createHmac('sha256',process.env.DEMO_IP_HASH_SECRET!).update(peer).digest('hex');
  }

  async lookup(request:FastifyRequest, tenantFromPath?:string):Promise<DemoIdentity> {
    if(!isDemoRuntime())throw new ForbiddenException('Not a demo deployment.');
    const token=demoCookie(request.headers.cookie);
    if(!token)throw new UnauthorizedException({code:'DEMO_SESSION_REQUIRED',message:'Start a new LEXA demo to continue.'});
    const tokenHash=sha(token);
    const auth=await this.prisma.runWithTenantContext({sessionTokenHash:tokenHash},()=>this.prisma.session.findFirst({where:{tokenHash,expiresAt:{gt:new Date()}},select:{userId:true,tenantId:true}}));
    if(!auth?.tenantId)throw new UnauthorizedException({code:'DEMO_SESSION_EXPIRED',message:'This demo has expired. Start a fresh one.'});
    if(tenantFromPath && tenantFromPath!==auth.tenantId)throw new ForbiddenException({code:'DEMO_TENANT_ISOLATION',message:'This is not your demo workspace.'});
    const session=await this.prisma.runWithTenantContext({tenantId:auth.tenantId,userId:auth.userId},()=>this.prisma.demoSession.findUnique({where:{tokenHash}}));
    if(!session || session.userId!==auth.userId || session.tenantId!==auth.tenantId || !validDemoSession(session.expiresAt,session.lastSeenAt,session.endedAt)){
      throw new UnauthorizedException({code:'DEMO_SESSION_EXPIRED',message:'This demo has expired. Start a fresh one.'});
    }
    // Throttled touch; 30-minute idle policy is enforced on every request.
    if(Date.now()-session.lastSeenAt.getTime()>45_000){
      await this.prisma.runWithTenantContext({tenantId:auth.tenantId,userId:auth.userId},()=>
        this.prisma.demoSession.update({where:{id:session.id},data:{lastSeenAt:new Date()}}));
    }
    return {id:session.id,tenantId:session.tenantId,userId:session.userId,expiresAt:session.expiresAt,lastSeenAt:session.lastSeenAt,endedAt:session.endedAt};
  }

  async start(request:FastifyRequest):Promise<{token:string;workspaceId:string;expiresAt:string;idleSeconds:number}> {
    if(!isDemoRuntime())throw new ForbiddenException('Only the isolated sandbox can issue demo sessions.');
    const check=await this.prisma.$queryRaw<Array<{name:string}>>`SELECT current_database() AS name`;
    if(check[0]?.name!=='lexa_demo')throw new ServiceUnavailableException('The demo database is not configured safely.');
    const userId=randomUUID(),tenantId=randomUUID(),sessionId=randomUUID(),branchId=randomUUID();
    const token=randomBytes(32).toString('base64url'), tokenHash=sha(token);
    const expiresAt=new Date(Date.now()+DEMO_MAX_SECONDS*1000);
    const ipHash=this.visitorHash(request);
    try {
      await this.prisma.runWithTenantContext({userId,tenantId},()=>this.prisma.$transaction(async(tx:any)=>{
        await tx.$queryRaw`SELECT lexa_demo_assert_start_limit(${ipHash},${DEMO_MAX_PER_HOUR})`;
        await tx.user.create({data:{id:userId,email:`visitor-${userId}@demo.lexa.invalid`,displayName:'Demo Visitor',passwordHash:null}});
        await tx.tenant.create({data:{id:tenantId,name:DEMO_NAME,slug:`demo-${tenantId}`,currency:'UGX',timezone:'Africa/Kampala',businessType:'retail_trade'}});
        // Only fictional sandbox tenants get the full workflow plan. This is NOT SaaS billing.
        await tx.$executeRaw`UPDATE tenant_subscriptions SET plan_key='enterprise',updated_at=now() WHERE tenant_id=${tenantId}::uuid`;
        await tx.membership.create({data:{tenantId,userId,role:'owner',status:'ACTIVE',branchScopeMode:'all'}});
        await tx.branch.create({data:{id:branchId,tenantId,code:'MAIN',name:'Demo main branch',currency:'UGX',timezone:'Africa/Kampala'}});
        await tx.$executeRaw`INSERT INTO platform_subscriptions(tenant_id,business_name,owner_email,status)
          VALUES(${tenantId}::uuid,${DEMO_NAME},'demo@lexa.invalid','pending')`;
        await tx.demoSession.create({data:{id:sessionId,tenantId,userId,tokenHash,visitorHash:ipHash,seedVersion:DEMO_SAMPLE_VERSION,expiresAt}});
        // Demo-only RLS policy permits this temporary non-paid access ONLY in
        // lexa_demo. There is no payment claim or live subscription to approve.
        await tx.$executeRaw`UPDATE platform_subscriptions SET status='active',activated_at=now(),paid_through=${expiresAt},updated_at=now()
          WHERE tenant_id=${tenantId}::uuid AND status='pending'`;
        await tx.session.create({data:{userId,tenantId,tokenHash,expiresAt}});
        await seedDemoBusiness(tx,{tenantId,userId,branchId});
      },{maxWait:10_000,timeout:45_000,isolationLevel:'Serializable'}));
    }catch(e){
      if(String(e).includes('DEMO_RATE_LIMIT'))throw new HttpException({code:'DEMO_RATE_LIMIT',message:'Too many demos have started on this network recently. Please try again later.'},HttpStatus.TOO_MANY_REQUESTS);
      this.logger.error('Demo workspace provisioning failed',e instanceof Error?e.message:String(e));
      throw new ServiceUnavailableException({code:'DEMO_PROVISIONING_FAILED',message:'The demo could not start. Please retry.'});
    }
    return {token,workspaceId:tenantId,expiresAt:expiresAt.toISOString(),idleSeconds:DEMO_IDLE_SECONDS};
  }

  async end(identity:DemoIdentity):Promise<void>{
    await this.prisma.runWithTenantContext({tenantId:identity.tenantId,userId:identity.userId},()=>this.prisma.$transaction(async(tx:any)=>{
      await tx.demoSession.updateMany({where:{id:identity.id,endedAt:null},data:{endedAt:new Date()}});
      await tx.session.deleteMany({where:{tokenHash:(await tx.demoSession.findUnique({where:{id:identity.id},select:{tokenHash:true}}))?.tokenHash}});
    }));
  }

  async cleanExpired():Promise<number> {
    if(!isDemoRuntime())return 0;
    // SECURITY DEFINER routine owns the FK-aware cleanup. It is barred from
    // operating in any database except lexa_demo, and never purges live demos.
    const out=await this.prisma.$queryRaw<Array<{purged:number}>>`SELECT lexa_demo_purge_expired(5)::integer AS purged`;
    return out[0]?.purged??0;
  }
}
