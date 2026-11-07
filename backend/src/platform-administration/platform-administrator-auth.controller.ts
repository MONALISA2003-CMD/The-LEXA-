/** LEXA standalone platform identities. No tenant signup, shared customer password,
 * business membership or Neon-console action is required for administrator setup. */
import {
  BadRequestException, ConflictException, Controller, ForbiddenException, Get, HttpCode, Logger, ServiceUnavailableException,
  Post, Body, Req, Res, Param, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import { CsrfGuard } from '../core/csrf.guard';
import { sendTransactionalEmail } from '../notifications/email-delivery';
import { lexaTurnstileHostnames, verifyTurnstileChallenge } from '../auth/turnstile-verification';
import { AccountProtectionService } from '../auth/account-protection.service';
import { observedClientIp } from './platform-activity-policy';

const scrypt=promisify(scryptCallback);
const OWNER_EMAIL='kabuusumohammed182@gmail.com';
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const email=(value:unknown)=>{
  if(typeof value!=='string')throw new BadRequestException('Enter a valid administrator email.');
  const clean=value.trim().toLowerCase();
  if(clean.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean))throw new BadRequestException('Enter a valid administrator email.');
  return clean;
};
const required=(value:unknown,label:string,max:number)=>{
  if(typeof value!=='string'||value.trim().length<2||value.trim().length>max)throw new BadRequestException(`${label} must be between 2 and ${max} characters.`);
  return value.trim();
};
const secret=(value:unknown)=>{
  if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{32,128}$/.test(value))throw new BadRequestException('This invitation or recovery link is invalid.');
  return value;
};
const body=(input:unknown):Record<string,unknown>=>{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new BadRequestException('Enter valid form details.');
  return input as Record<string,unknown>;
};
const password=(value:unknown):string=>{
  if(typeof value!=='string'||value.length<12||value.length>128||/\s{16,}/.test(value))
    throw new BadRequestException('Choose a unique administrator passphrase of 12 to 128 characters.');
  return value;
};
async function hashPassword(value:string){
  const salt=randomBytes(16);
  const derived=await scrypt(value,salt,64) as Buffer;
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}
async function matches(value:string,encoded:string){
  try{
    const [saltHex,hashHex]=encoded.split(':');
    if(!saltHex||!hashHex||saltHex.length!==32||hashHex.length!==128)return false;
    const expect=Buffer.from(hashHex,'hex');
    const actual=await scrypt(value,Buffer.from(saltHex,'hex'),expect.length) as Buffer;
    return expect.length===actual.length&&timingSafeEqual(expect,actual);
  }catch{return false;}
}
function newToken(){const token=randomBytes(32).toString('base64url');return {token,hash:sha(token)};}
function publicOrigin(){
  const url=(process.env.FRONTEND_PUBLIC_URL||'https://app.lexaaamaal.com').replace(/\/+$/,'');
  if(!/^https:\/\/[^/]+$/.test(url))throw new ForbiddenException('The public LEXA URL must be a trusted HTTPS origin.');
  return url;
}
function cookie(request:FastifyRequest,name:string){
  for(const part of(request.headers.cookie??'').split(';')){
    const eq=part.indexOf('=');
    if(eq>0&&part.slice(0,eq).trim()===name){try{return decodeURIComponent(part.slice(eq+1).trim());}catch{return '';}}
  }
  return '';
}
interface AdminIdentity {admin_user_id:string;admin_role:string;admin_email:string;admin_display_name:string}

@Controller('platform-admin/auth')
export class PlatformAdministratorAuthController{
  private readonly logger = new Logger(PlatformAdministratorAuthController.name);
  constructor(private readonly prisma:PrismaService, private readonly accountProtection:AccountProtectionService){}
  private async active(request:FastifyRequest):Promise<AdminIdentity>{
    const token=cookie(request,'lexa_admin_session');
    if(!token||token.length>256)throw new UnauthorizedException('Sign in to LEXA Control Centre.');
    const rows=await this.prisma.$queryRaw<AdminIdentity[]>`
      SELECT * FROM platform_admin_active_session(${sha(token)})`;
    if(!rows[0])throw new UnauthorizedException('Administrator session expired. Please sign in again.');
    return rows[0];
  }
  private async superAdmin(request:FastifyRequest){
    const actor=await this.active(request);
    if(actor.admin_role!=='super_admin')throw new ForbiddenException('Only a Super Administrator can manage platform staff.');
    return actor;
  }
  @Get('bootstrap')
  async bootstrap(){
    const [status]=await this.prisma.$queryRaw<Array<{available:boolean}>>`
      SELECT platform_admin_bootstrap_available() AS available`;
    return {firstAdministratorSetupAvailable:status?.available??false, maxAdministrators:5};
  }
  @Post('founder-invite') @HttpCode(202) @UseGuards(CsrfGuard)
  async founderInvite(){
    const {token,hash}=newToken();
    const [result]=await this.prisma.$queryRaw<Array<{created:boolean}>>`
      SELECT platform_admin_request_founder(${OWNER_EMAIL},${hash}) AS created`;
    if(result?.created){
      try {
        await sendTransactionalEmail({to:OWNER_EMAIL,subject:'LEXA Control Centre — your secure founder invitation',
          text:'A secure invitation was requested to create the first LEXA platform administrator. This link expires in 30 minutes. Ignore it if you did not request it.',
          actionUrl:`${publicOrigin()}/platform-admin/setup?token=${encodeURIComponent(token)}`,actionLabel:'Set up LEXA administrator',idempotencyKey:`lexa-founder-${hash.slice(0,24)}`});
      } catch (error) {
        // A failed outbound email must not strand the very first administrator.
        await this.prisma.$queryRaw`SELECT platform_admin_cancel_founder(${hash})`;
        throw error;
      }
    }
    return {accepted:true,message:'If initial setup is available, an invitation has been sent to the designated developer email.'};
  }
  @Post('register') @UseGuards(CsrfGuard)
  async register(@Body() input:unknown){
    const data=body(input),pToken=secret(data.token),pEmail=email(data.email),pName=required(data.displayName,'Full name',100);
    const pPassword=await hashPassword(password(data.password));
    const id=randomUUID();
    try{
      const rows=await this.prisma.$queryRaw<Array<{admin_user_id:string;admin_role:string}>>`
        SELECT * FROM platform_admin_claim_enrolment(${sha(pToken)},${pEmail},${pName},${pPassword},${id}::uuid)`;
      if(!rows[0])throw new BadRequestException('This administrator invitation is invalid or expired.');
      return {registered:true,role:rows[0].admin_role,loginUrl:'/platform-admin/login'};
    }catch(e){
      if(String(e).includes('ADMIN_')||String(e).includes('unique')||String(e).includes('23505'))
        throw new BadRequestException('This invitation has expired, has already been used, or all five administrator seats are reserved.');
      throw e;
    }
  }
  @Post('login') @UseGuards(CsrfGuard)
  async login(@Body() input:unknown,@Req() request:FastifyRequest,@Res({passthrough:true}) response:FastifyReply){
    const data=body(input),address=email(data.email),pass=data.password;
    if(typeof pass!=='string'||pass.length>1024)throw new UnauthorizedException('Invalid administrator email or password.');
    try{
      await verifyTurnstileChallenge(data.turnstileToken,{
        secret:process.env.TURNSTILE_SECRET_KEY,
        enforced:this.accountProtection.loginTurnstileEnforced(),
        allowedHosts:lexaTurnstileHostnames(process.env.TURNSTILE_ALLOWED_HOSTNAMES),
        action:'login',
      });
    }catch(error){
      const reason = error instanceof Error ? error.message : 'TURNSTILE_TOKEN_INVALID';
      // No identity, IP, token or Siteverify secret is written to the logs.
      this.logger.warn(`LEXA_ADMIN_LOGIN_VERIFICATION: ${reason}`);
      if(reason==='TURNSTILE_CONFIGURATION_MISSING'||reason==='TURNSTILE_VERIFICATION_UNAVAILABLE') {
        throw new ServiceUnavailableException({
          code:'HUMAN_VERIFICATION_UNAVAILABLE',
          message:'The LEXA administrator security check is temporarily unavailable. Please retry shortly.',
        });
      }
      throw new ForbiddenException({
        code:'HUMAN_VERIFICATION_REQUIRED',
        message:'The administrator security challenge did not complete. Refresh the challenge and try again.',
      });
    }
    const limitKey=sha(`${address}:${observedClientIp(request.ip)??'unknown'}`);
    const emailLimit=sha(`admin-email:${address}`);
    const [permitted]=await this.prisma.$queryRaw<Array<{allowed:boolean}>>`
      SELECT platform_admin_login_limiter(${limitKey},NULL) AS allowed`;
    const [emailPermitted]=await this.prisma.$queryRaw<Array<{allowed:boolean}>>`
      SELECT platform_admin_login_limiter(${emailLimit},NULL) AS allowed`;
    if(!permitted?.allowed||!emailPermitted?.allowed)throw new ForbiddenException('Too many attempts. Try again in 15 minutes.');
    const rows=await this.prisma.$queryRaw<Array<{admin_user_id:string;password_hash:string;admin_role:string;display_name:string}>>`
      SELECT * FROM platform_admin_private_login(${address})`;
    if(!rows[0]||!(await matches(pass,rows[0].password_hash))){
      await this.prisma.$queryRaw`SELECT platform_admin_login_limiter(${limitKey},true)`;
      await this.prisma.$queryRaw`SELECT platform_admin_login_limiter(${emailLimit},true)`;
      throw new UnauthorizedException('Invalid administrator email or password.');
    }
    await this.prisma.$queryRaw`SELECT platform_admin_login_limiter(${limitKey},false)`;
    await this.prisma.$queryRaw`SELECT platform_admin_login_limiter(${emailLimit},false)`;
    const session=newToken();
    const [created]=await this.prisma.$queryRaw<Array<{created:boolean}>>`
      SELECT platform_admin_begin_session(${rows[0].admin_user_id}::uuid,${session.hash}) AS created`;
    if(!created?.created)throw new UnauthorizedException('This administrator account is not active.');
    response.header('Set-Cookie',`lexa_admin_session=${encodeURIComponent(session.token)}; Path=/; Secure; HttpOnly; SameSite=None; Max-Age=259200`);
    return {signedIn:true,role:rows[0].admin_role,displayName:rows[0].display_name};
  }
  @Get('session')
  async session(@Req() request:FastifyRequest){const a=await this.active(request);return {role:a.admin_role,email:a.admin_email,displayName:a.admin_display_name};}
  @Post('logout') @UseGuards(CsrfGuard) @HttpCode(204)
  async logout(@Req() request:FastifyRequest,@Res({passthrough:true}) reply:FastifyReply){
    const raw=cookie(request,'lexa_admin_session');
    if(raw)await this.prisma.$queryRaw`SELECT platform_admin_end_session(${sha(raw)})`;
    reply.header('Set-Cookie','lexa_admin_session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0');
  }
  @Get('team')
  async team(@Req() request:FastifyRequest){
    const actor=await this.superAdmin(request);
    return this.prisma.runWithTenantContext({userId:actor.admin_user_id},()=>this.prisma.$queryRaw`
      SELECT * FROM platform_admin_list_team(${actor.admin_user_id}::uuid)`);
  }
  @Post('invite') @UseGuards(CsrfGuard)
  async invite(@Req() request:FastifyRequest,@Body() input:unknown){
    const actor=await this.superAdmin(request),data=body(input),address=email(data.email);
    const role=String(data.role||'super_admin');
    if(!['super_admin','billing_manager','support_agent','operations_manager','auditor'].includes(role))
      throw new BadRequestException('Select an approved administrator role.');
    const token=newToken();
    const [created]=await this.prisma.runWithTenantContext({userId:actor.admin_user_id},()=>this.prisma.$queryRaw<Array<{created:boolean}>>`
      SELECT platform_admin_issue_invitation(${actor.admin_user_id}::uuid,${address},${role},${token.hash}) AS created`);
    if(!created?.created)throw new ConflictException('Five administrator seats are allocated or an invitation already exists for this email.');
    try{
      await sendTransactionalEmail({to:address,subject:'You are invited to LEXA Control Centre',
        text:`A LEXA Super Administrator invited you as ${role.replaceAll('_',' ')}. Create your own administrator password using this secure one-time invitation, which expires in 24 hours.`,
        actionUrl:`${publicOrigin()}/platform-admin/setup?token=${encodeURIComponent(token.token)}`,actionLabel:'Accept administrator invitation',idempotencyKey:`lexa-admin-invite-${token.hash.slice(0,24)}`});
    }catch(e){
      await this.prisma.runWithTenantContext({userId:actor.admin_user_id},()=>this.prisma.$queryRaw`
        SELECT platform_admin_cancel_invitation(${actor.admin_user_id}::uuid,${token.hash})`);
      throw e;
    }
    return {invited:true,email:address,role,expiresInHours:24};
  }
  @Post('team/:userId/access') @UseGuards(CsrfGuard)
  async memberAccess(@Req() request:FastifyRequest,@Param('userId') userId:string,@Body() input:unknown){
    const actor=await this.superAdmin(request),data=body(input);
    if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(userId)||typeof data.enabled!=='boolean')
      throw new BadRequestException('Select a valid account and permission.');
    const [result]=await this.prisma.runWithTenantContext({userId:actor.admin_user_id},()=>this.prisma.$queryRaw<Array<{changed:boolean}>>`
      SELECT platform_admin_update_member(${actor.admin_user_id}::uuid,${userId}::uuid,${data.enabled}) AS changed`);
    if(!result?.changed)throw new ConflictException('This action is unavailable. You cannot disable yourself or exceed five active administrators.');
    return {changed:true};
  }
  @Post('recovery/request') @UseGuards(CsrfGuard) @HttpCode(202)
  async recovery(@Body() input:unknown){
    const address=email(body(input).email),token=newToken();
    const [created]=await this.prisma.$queryRaw<Array<{created:boolean}>>`
      SELECT platform_admin_recovery_request(${address},${token.hash}) AS created`;
    if(created?.created){
      try{
        await sendTransactionalEmail({to:address,subject:'Reset your LEXA administrator password',
          text:'Use this one-time recovery link to choose a new LEXA administrator password. It expires in 30 minutes and signs out your existing admin sessions.',
          actionUrl:`${publicOrigin()}/platform-admin/reset?token=${encodeURIComponent(token.token)}`,
          actionLabel:'Reset administrator password',idempotencyKey:`lexa-admin-reset-${token.hash.slice(0,24)}`});
      }catch(e){await this.prisma.$queryRaw`SELECT platform_admin_recovery_cancel(${token.hash})`;throw e;}
    }
    return {accepted:true};
  }
  @Post('recovery/finish') @UseGuards(CsrfGuard)
  async recover(@Body() input:unknown){
    const data=body(input),hash=await hashPassword(password(data.password));
    const [result]=await this.prisma.$queryRaw<Array<{changed:boolean}>>`
      SELECT platform_admin_recovery_finish(${sha(secret(data.token))},${hash}) AS changed`;
    if(!result?.changed)throw new BadRequestException('This password recovery link is invalid or expired. Request a fresh link.');
    return {reset:true};
  }
}
