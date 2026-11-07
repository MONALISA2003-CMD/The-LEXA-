import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { isDemoRuntime } from '../demo/demo-policy';
import { scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import { sendTransactionalEmail } from '../notifications/email-delivery';
import {
  cookieFromHeader, decryptAuthenticatorSecret, emailCodeDigest, encryptAuthenticatorSecret, equalDigest,
  newAuthenticatorSecret, newEmailCode, recoveryCode, safeBrowserLabel, secretToken, tokenDigest, validTotpStep,
} from './account-security-crypto';

const scrypt = promisify(scryptCallback);
const BROWSER_SECONDS = 45 * 24 * 3600;
const SESSION_SECONDS = 7 * 24 * 3600;
const CHALLENGE_SECONDS = 10 * 60;
const PRIVACY_VERSION = '2026-11-05';
const emailEligible = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith('.invalid');
const productionEnabled = (name: string) => process.env[name] === 'true' || (process.env.NODE_ENV === 'production' && process.env[name] !== 'false');

function challengeInput(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{40,120}$/.test(value)) throw new BadRequestException('The verification request is invalid. Start sign-in again.');
  return value;
}
function requireCode(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:\d{6}|\d{8}|[A-Za-z0-9_-]{16})$/.test(value)) throw new BadRequestException('Enter a valid verification code.');
  return value;
}
function deviceCookie(token: string): string {
  return `lexa_device=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${BROWSER_SECONDS}`;
}
function sessionCookie(token: string): string {
  return `lexa_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${SESSION_SECONDS}`;
}
function clearCookie(name: string): string { return `${name}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`; }

@Injectable()
export class AccountProtectionService {
  constructor(private readonly prisma: PrismaService) {}
  browserVerificationEnforced(): boolean { return productionEnabled('LEXA_ENFORCE_NEW_BROWSER_VERIFICATION'); }
  loginTurnstileEnforced(): boolean { return productionEnabled('TURNSTILE_ENFORCE_LOGIN'); }
  private pepper(): string {
    const key = process.env.AUTH_OTP_PEPPER ?? '';
    if (key.length < 32) throw new ServiceUnavailableException({code:'AUTH_VERIFICATION_NOT_CONFIGURED',message:'Additional sign-in verification is not configured.'});
    return key;
  }
  private totpKey(): string {
    const key = process.env.AUTH_TOTP_ENCRYPTION_KEY ?? '';
    if (Buffer.from(key,'base64').length !== 32) throw new ServiceUnavailableException({code:'AUTH_VERIFICATION_NOT_CONFIGURED',message:'Authenticator verification is not configured.'});
    return key;
  }
  private async event(userId: string, eventType: string, label: string | null = null): Promise<void> {
    await this.prisma.runWithTenantContext({userId},()=>this.prisma.accountSecurityEvent.create({data:{userId,eventType,deviceLabel:label}}));
  }
  async accountPasswordMatches(password: unknown, encoded: string | null): Promise<boolean> {
    if (typeof password !== 'string' || !encoded) return false;
    const [salt,hash] = encoded.split(':');
    if (!salt || !hash || !/^[0-9a-f]+$/i.test(salt+hash)) return false;
    try {
      const expected=Buffer.from(hash,'hex');
      const actual=await scrypt(password,Buffer.from(salt,'hex'),expected.length) as Buffer;
      return expected.length===actual.length && timingSafeEqual(expected,actual);
    } catch { return false; }
  }
  async limitLogin(identity: string, failed: boolean | null): Promise<void> {
    const hash=tokenDigest(`lexa-login-v1:${identity.trim().toLowerCase()}`);
    const rows=await this.prisma.$queryRaw<Array<{allowed:boolean}>>`SELECT lexa_login_rate_gate(${hash},${failed}) AS allowed`;
    if (rows[0]?.allowed!==true) throw new HttpException({code:'LOGIN_RATE_LIMIT',message:'Too many sign-in attempts. Please try again in 15 minutes.'},429);
  }
  async currentSession(request: FastifyRequest) {
    const raw=cookieFromHeader(request.headers.cookie,'lexa_session');
    if (!raw) throw new UnauthorizedException({code:'AUTH_REQUIRED',message:'Sign in to manage account security.'});
    const tokenHash=tokenDigest(raw);
    const session=await this.prisma.session.findFirst({where:{tokenHash,expiresAt:{gt:new Date()}},select:{id:true,userId:true}});
    if (!session) throw new UnauthorizedException({code:'SESSION_EXPIRED',message:'Sign in again.'});
    const detail=await this.prisma.runWithTenantContext({userId:session.userId},()=>this.prisma.session.findFirst({
      where:{id:session.id},include:{user:true},
    }));
    if (!detail || detail.user.closedAt) throw new UnauthorizedException({code:'SESSION_EXPIRED',message:'Sign in again.'});
    return detail;
  }
  async requirePassword(request: FastifyRequest, password: unknown) {
    const session=await this.currentSession(request);
    const key=`account-security-password:${session.userId}`;
    await this.limitLogin(key,null);
    if (!await this.accountPasswordMatches(password,session.user.passwordHash)) {
      await this.limitLogin(key,true);
      throw new ForbiddenException({code:'REAUTH_REQUIRED',message:'Enter your current password to continue.'});
    }
    await this.limitLogin(key,false);
    return session;
  }
  private async limitSecurityCodes<T>(userId: string, verify: () => Promise<T>): Promise<T> {
    const key=`account-security-code:${userId}`;
    await this.limitLogin(key,null);
    try { const result=await verify(); await this.limitLogin(key,false); return result; }
    catch(error) {
      // A rejected verification is retained outside the failed business transaction.
      if (error instanceof BadRequestException || error instanceof ForbiddenException) await this.limitLogin(key,true);
      throw error;
    }
  }
  /** Operational account closure: no hard deletion of ledger references. */
  async closePersonalAccount(request: FastifyRequest, raw: unknown, reply: FastifyReply) {
    if (isDemoRuntime()) throw new ForbiddenException({code:'DEMO_ACCOUNT_CLOSURE_BLOCKED',message:'The temporary demo ends automatically. No permanent account exists to delete.'});
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Complete the account closure form.');
    const input = raw as Record<string, unknown>;
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (reason.length < 10 || reason.length > 500) throw new BadRequestException('Give a reason between 10 and 500 characters.');
    if (input.confirmation !== 'DELETE MY ACCOUNT' || input.acknowledgeRetention !== true) throw new BadRequestException('Confirm the account closure and record-retention notice.');
    const session = await this.requirePassword(request, input.password);
    if (email !== session.user.email.toLowerCase()) throw new BadRequestException('Enter the exact email address used for this account.');
    if (session.user.closedAt) throw new ConflictException('This account is already closed.');
    // The owner must first reassign responsibility for each workspace, even if
    // another business on this login is already inactive.
    const owners = await this.prisma.runWithTenantContext({userId:session.userId}, () => this.prisma.membership.count({where:{userId:session.userId,role:{in:['owner','owner_administrator']}}}));
    if (owners > 0) throw new ConflictException({code:'OWNERSHIP_TRANSFER_REQUIRED',message:'Transfer ownership of every business you own before closing your personal account. Business records cannot be left without an owner.'});
    const mfa = await this.prisma.runWithTenantContext({userId:session.userId},()=>this.prisma.authenticatorCredential.findUnique({where:{userId:session.userId}}));
    if (mfa?.enabledAt) {
      const code = requireCode(input.code);
      await this.limitSecurityCodes(session.userId, () => this.prisma.runWithTenantContext({userId:session.userId}, () => this.prisma.$transaction(async tx => {
        const current = await tx.authenticatorCredential.findUnique({where:{userId:session.userId}});
        if (!current?.enabledAt) throw new ForbiddenException('Authenticator verification is required.');
        const step = validTotpStep(decryptAuthenticatorSecret(current.encryptedSecret, this.totpKey()),code,Date.now(),current.lastUsedStep);
        if (step !== null) await tx.authenticatorCredential.update({where:{userId:session.userId},data:{lastUsedStep:step}});
        else if (current.recoveryHashes.includes(tokenDigest(code))) await tx.authenticatorCredential.update({where:{userId:session.userId},data:{recoveryHashes:current.recoveryHashes.filter(hash=>hash!==tokenDigest(code))}});
        else throw new ForbiddenException({code:'VERIFICATION_REQUIRED',message:'Enter a fresh authenticator code or unused recovery code.'});
        return true;
      })));
    }
    await this.prisma.runWithTenantContext({userId:session.userId},()=>this.prisma.$transaction(async tx => {
      // Check again inside the closing transaction to avoid racing another owner assignment.
      const activeOwner = await tx.membership.count({where:{userId:session.userId,role:{in:['owner','owner_administrator']}}});
      if (activeOwner) throw new ConflictException({code:'OWNERSHIP_TRANSFER_REQUIRED',message:'Transfer business ownership first.'});
      const now = new Date();
      const result = await tx.user.updateMany({where:{id:session.userId,closedAt:null},data:{closedAt:now,closureReason:reason,passwordHash:null}});
      if(result.count!==1) throw new ConflictException('This account was already closed.');
      await tx.session.deleteMany({where:{userId:session.userId}});
      await tx.loginChallenge.deleteMany({where:{userId:session.userId}});
      await tx.passwordResetToken.deleteMany({where:{userId:session.userId}});
      await tx.trustedDevice.updateMany({where:{userId:session.userId,revokedAt:null},data:{revokedAt:now}});
      await tx.accountSecurityEvent.create({data:{userId:session.userId,eventType:'personal_account_closed'}});
    }));
    reply.header('Set-Cookie', [clearCookie('lexa_session'),'lexa_csrf=; Path=/; Secure; SameSite=None; Max-Age=0',clearCookie('lexa_device')]);
    return {closed:true,recordsRetained:true};
  }

  async trustedBrowser(userId: string, header: string | undefined) {
    const raw=cookieFromHeader(header,'lexa_device');
    if (!raw || !/^[\w-]{32,100}$/.test(raw)) return null;
    const trusted=await this.prisma.runWithTenantContext({userId},()=>this.prisma.trustedDevice.findFirst({
      where:{userId,credentialHash:tokenDigest(raw),revokedAt:null,expiresAt:{gt:new Date()}},select:{id:true},
    }));
    return trusted?.id??null;
  }
  /** Newly provisioned username-only staff may change their mandatory temporary password on the first browser. */
  async enrollProvisioningBrowser(userId: string, request: FastifyRequest, reply: FastifyReply) {
    const raw=secretToken();
    const row=await this.prisma.runWithTenantContext({userId},()=>this.prisma.trustedDevice.create({data:{
      userId,credentialHash:tokenDigest(raw),label:safeBrowserLabel(request.headers['user-agent']),
      expiresAt:new Date(Date.now()+BROWSER_SECONDS*1000),
    }}));
    reply.header('Set-Cookie',deviceCookie(raw));
    await this.event(userId,'provisioning_browser_registered',row.label);
    return row.id;
  }
  async beginSignIn(user: {id:string;email:string;mustChangePassword:boolean}, request: FastifyRequest, reply: FastifyReply) {
    const activeTotp=await this.prisma.runWithTenantContext({userId:user.id},()=>this.prisma.authenticatorCredential.findFirst({where:{userId:user.id,enabledAt:{not:null}},select:{userId:true}}));
    if (!this.browserVerificationEnforced() && !activeTotp) return {kind:'approved' as const,deviceId:null};
    const deviceId=await this.trustedBrowser(user.id,request.headers.cookie);
    if (!activeTotp && deviceId) {
      await this.prisma.runWithTenantContext({userId:user.id},()=>this.prisma.trustedDevice.update({where:{id:deviceId},data:{lastSeenAt:new Date()}}));
      return {kind:'approved' as const,deviceId};
    }
    if (!activeTotp && !emailEligible(user.email)) {
      if (user.mustChangePassword) return {kind:'approved' as const,deviceId:await this.enrollProvisioningBrowser(user.id,request,reply)};
      throw new ForbiddenException({code:'SECURITY_ENROLLMENT_REQUIRED',message:'This username-only account needs an authenticator or an owner-assisted password reset before using a new browser.'});
    }
    const method=activeTotp?'totp' as const:'email' as const;
    if(method==='email'){
      this.pepper();
      if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL)throw new ServiceUnavailableException({code:'SIGNIN_EMAIL_UNAVAILABLE',message:'Email verification is unavailable. Please contact your account administrator.'});
    } else this.totpKey();
    const pending=await this.prisma.runWithTenantContext({userId:user.id},()=>this.prisma.loginChallenge.count({
      where:{userId:user.id,createdAt:{gt:new Date(Date.now()-15*60_000)}},
    }));
    if (pending>=5)throw new HttpException({code:'LOGIN_CHALLENGE_RATE_LIMIT',message:'Too many verification requests. Try again later.'},429);
    const token=secretToken(),code=method==='email'?newEmailCode():null;
    const row=await this.prisma.runWithTenantContext({userId:user.id},()=>this.prisma.loginChallenge.create({data:{
      userId:user.id,tokenHash:tokenDigest(token),codeHash:code?emailCodeDigest(code,this.pepper()):null,
      method,expiresAt:new Date(Date.now()+CHALLENGE_SECONDS*1000),
    }}));
    if (code){
      try {
        await sendTransactionalEmail({to:user.email,subject:'Verify your LEXA sign-in',
          text:`Your one-time LEXA sign-in code is ${code}. It expires in 10 minutes. Never share this code. If you did not sign in, change your password.`,
          actionUrl:`${(process.env.FRONTEND_PUBLIC_URL||'https://app.lexaaamaal.com').replace(/\/$/,'')}/sign-in`,
          actionLabel:'Return to sign in',idempotencyKey:`login-code-${row.id}`,
        });
      }catch{
        await this.prisma.runWithTenantContext({userId:user.id},()=>this.prisma.loginChallenge.delete({where:{id:row.id}}));
        throw new ServiceUnavailableException({code:'SIGNIN_EMAIL_UNAVAILABLE',message:'We could not deliver the verification code. Try again later.'});
      }
    }
    await this.event(user.id,'login_verification_requested',safeBrowserLabel(request.headers['user-agent']));
    return {kind:'challenge' as const,challengeToken:token,method,expiresInSeconds:CHALLENGE_SECONDS};
  }
  async createPasswordSession(userId:string,deviceId:string|null,reply:FastifyReply) {
    const raw=secretToken();
    await this.prisma.runWithTenantContext({userId},()=>this.prisma.session.create({data:{
      userId,tokenHash:tokenDigest(raw),trustedDeviceId:deviceId,expiresAt:new Date(Date.now()+SESSION_SECONDS*1000),
    }}));
    const previous=reply.getHeader('Set-Cookie');
    const existing=Array.isArray(previous)?previous.map(String):typeof previous==='string'?[previous]:[];
    reply.header('Set-Cookie',[...existing,sessionCookie(raw)]);
    await this.event(userId,'login_succeeded');
  }
  async finishSignIn(raw:unknown, request:FastifyRequest, reply:FastifyReply) {
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Enter the verification code.');
    const input=raw as Record<string,unknown>;
    const rawToken=challengeInput(input.challengeToken),code=requireCode(input.code);
    const hash=tokenDigest(rawToken);
    const challenge=await this.prisma.runWithTenantContext({loginChallengeHash:hash},()=>this.prisma.loginChallenge.findFirst({where:{tokenHash:hash},select:{id:true,userId:true}}));
    if(!challenge)throw new UnauthorizedException({code:'CHALLENGE_INVALID',message:'This sign-in request is invalid or has expired. Start sign-in again.'});
    const sessionToken=secretToken(),newBrowserToken=secretToken();
    const outcome=await this.prisma.runWithTenantContext({userId:challenge.userId},()=>this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<{id:string;method:string;code_hash:string|null;attempts:number;expires_at:Date;consumed_at:Date|null}>>`
        SELECT id,method,code_hash,attempts,expires_at,consumed_at FROM login_challenges
        WHERE id=${challenge.id}::uuid AND token_hash=${hash} FOR UPDATE`;
      const record=rows[0];
      if(!record||record.consumed_at||record.expires_at<=new Date()||record.attempts>=5)return {ok:false as const};
      let accepted=false;
      if(record.method==='email')accepted=/^\d{8}$/.test(code)&&Boolean(record.code_hash)&&equalDigest(record.code_hash!,emailCodeDigest(code,this.pepper()));
      if(record.method==='totp'){
        const locks=await tx.$queryRaw<Array<{user_id:string}>>`SELECT user_id FROM authenticator_credentials WHERE user_id=${challenge.userId}::uuid AND enabled_at IS NOT NULL FOR UPDATE`;
        if(locks.length){
          const mfa=await tx.authenticatorCredential.findUnique({where:{userId:challenge.userId}});
          if(mfa?.enabledAt){
            const secret=decryptAuthenticatorSecret(mfa.encryptedSecret,this.totpKey());
            const step=validTotpStep(secret,code,Date.now(),mfa.lastUsedStep);
            if(step!==null){accepted=true;await tx.authenticatorCredential.update({where:{userId:challenge.userId},data:{lastUsedStep:step}});}
            else if(mfa.recoveryHashes.includes(tokenDigest(code))){
              accepted=true;
              await tx.authenticatorCredential.update({where:{userId:challenge.userId},data:{recoveryHashes:mfa.recoveryHashes.filter(x=>x!==tokenDigest(code))}});
            }
          }
        }
      }
      if(!accepted){await tx.loginChallenge.update({where:{id:record.id},data:{attempts:{increment:1}}});return {ok:false as const};}
      const signInUser=await tx.user.findUnique({where:{id:challenge.userId},select:{closedAt:true}});
      if(!signInUser || signInUser.closedAt) return {ok:false as const};
      const oldCookie=cookieFromHeader(request.headers.cookie,'lexa_device');
      const existing=oldCookie?await tx.trustedDevice.findFirst({where:{userId:challenge.userId,credentialHash:tokenDigest(oldCookie),revokedAt:null,expiresAt:{gt:new Date()}}}):null;
      let deviceId=existing?.id;
      if(!deviceId){
        const created=await tx.trustedDevice.create({data:{userId:challenge.userId,credentialHash:tokenDigest(newBrowserToken),
          label:safeBrowserLabel(request.headers['user-agent']),expiresAt:new Date(Date.now()+BROWSER_SECONDS*1000)}});
        deviceId=created.id;
      }else{
        await tx.trustedDevice.update({where:{id:deviceId},data:{lastSeenAt:new Date()}});
      }
      await tx.loginChallenge.update({where:{id:record.id},data:{consumedAt:new Date()}});
      await tx.session.create({data:{userId:challenge.userId,trustedDeviceId:deviceId,tokenHash:tokenDigest(sessionToken),expiresAt:new Date(Date.now()+SESSION_SECONDS*1000)}});
      await tx.accountSecurityEvent.create({data:{userId:challenge.userId,eventType:'login_verified',deviceLabel:safeBrowserLabel(request.headers['user-agent'])}});
      return {ok:true as const,newDevice:!existing};
    }));
    if(!outcome.ok)throw new UnauthorizedException({code:'CODE_INVALID',message:'This verification code is incorrect, used, or expired. Retry or start sign-in again.'});
    reply.header('Set-Cookie', [sessionCookie(sessionToken),...(outcome.newDevice?[deviceCookie(newBrowserToken)]:[])]);
    const user=await this.prisma.runWithTenantContext({userId:challenge.userId},()=>this.prisma.user.findUnique({where:{id:challenge.userId}}));
    const memberships=await this.prisma.runWithTenantContext({userId:challenge.userId},()=>this.prisma.membership.findMany({where:{userId:challenge.userId,status:'ACTIVE'},select:{role:true}}));
    if(!user)throw new UnauthorizedException('Account unavailable.');
    // Login notification is supplementary. The immutable security event remains even if email is unavailable.
    if(outcome.newDevice&&emailEligible(user.email)&&process.env.RESEND_API_KEY&&process.env.RESEND_FROM_EMAIL){
      try { await sendTransactionalEmail({to:user.email,subject:'New browser signed in to LEXA',
        text:'A new browser completed verification and signed in to your LEXA account. If this was not you, reset your password and review active sessions immediately.',
        actionUrl:`${(process.env.FRONTEND_PUBLIC_URL||'https://app.lexaaamaal.com').replace(/\/$/,'')}/settings/security`,actionLabel:'Review account security'});
      } catch { /* Sign-in is already committed; audit remains authoritative. */ }
    }
    return {user:{id:user.id,email:user.email,displayName:user.displayName??undefined},roles:[...new Set(memberships.map(m=>m.role))],requiresPasswordChange:user.mustChangePassword};
  }
  async listSecurity(request:FastifyRequest) {
    const session=await this.currentSession(request);const userId=session.userId;
    return this.prisma.runWithTenantContext({userId},async()=>{
      const [devices,sessions,events,authenticator]=await Promise.all([
        this.prisma.trustedDevice.findMany({where:{userId},orderBy:{lastSeenAt:'desc'},take:40}),
        this.prisma.session.findMany({where:{userId,expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'},take:40}),
        this.prisma.accountSecurityEvent.findMany({where:{userId},orderBy:{createdAt:'desc'},take:40}),
        this.prisma.authenticatorCredential.findUnique({where:{userId},select:{enabledAt:true,recoveryHashes:true}}),
      ]);
      return {mfa:{enabled:Boolean(authenticator?.enabledAt),recoveryCodesRemaining:authenticator?.enabledAt?authenticator.recoveryHashes.length:0},
        devices:devices.map(d=>({id:d.id,label:d.label,createdAt:d.createdAt,lastSeenAt:d.lastSeenAt,expiresAt:d.expiresAt,revokedAt:d.revokedAt,current:d.id===session.trustedDeviceId})),
        sessions:sessions.map(s=>({id:s.id,deviceId:s.trustedDeviceId,createdAt:s.createdAt,expiresAt:s.expiresAt,current:s.id===session.id})),
        events:events.map(e=>({id:e.id,type:e.eventType,deviceLabel:e.deviceLabel,createdAt:e.createdAt}))};
    });
  }
  async revokeSession(request:FastifyRequest,id:string,password:unknown,reply:FastifyReply) {
    if(!/^[0-9a-f-]{36}$/i.test(id))throw new BadRequestException('Invalid session identifier.');
    const s=await this.requirePassword(request,password);
    await this.prisma.runWithTenantContext({userId:s.userId},async()=>{
      const deleted=await this.prisma.session.deleteMany({where:{id,userId:s.userId}});
      if(deleted.count!==1)throw new BadRequestException('Session not found.');
      await this.event(s.userId,'session_revoked');
    });
    if(id===s.id)reply.header('Set-Cookie',clearCookie('lexa_session'));
    return {revoked:true};
  }
  async revokeDevice(request:FastifyRequest,id:string,password:unknown,reply:FastifyReply) {
    if(!/^[0-9a-f-]{36}$/i.test(id))throw new BadRequestException('Invalid browser identifier.');
    const s=await this.requirePassword(request,password);
    await this.prisma.runWithTenantContext({userId:s.userId},()=>this.prisma.$transaction(async tx=>{
      const found=await tx.trustedDevice.findFirst({where:{id,userId:s.userId,revokedAt:null}});
      if(!found)throw new BadRequestException('Trusted browser not found.');
      await tx.trustedDevice.update({where:{id},data:{revokedAt:new Date()}});
      await tx.session.deleteMany({where:{trustedDeviceId:id,userId:s.userId}});
      await tx.accountSecurityEvent.create({data:{userId:s.userId,eventType:'browser_revoked',deviceLabel:found.label}});
    }));
    if(id===s.trustedDeviceId)reply.header('Set-Cookie',[clearCookie('lexa_session'),clearCookie('lexa_device')]);
    return {revoked:true};
  }
  async revokeOtherSessions(request:FastifyRequest,password:unknown) {
    const s=await this.requirePassword(request,password);
    await this.prisma.runWithTenantContext({userId:s.userId},async()=>{
      await this.prisma.session.deleteMany({where:{userId:s.userId,id:{not:s.id}}});
      await this.event(s.userId,'other_sessions_revoked');
    });
    return {revoked:true};
  }
  async readPrivacy(request:FastifyRequest) {
    const s=await this.currentSession(request);
    const saved=await this.prisma.runWithTenantContext({userId:s.userId},()=>this.prisma.userPrivacyPreference.findUnique({where:{userId:s.userId}}));
    return {optionalAnalytics:saved?.optionalAnalytics??false,policyVersion:PRIVACY_VERSION,updatedAt:saved?.updatedAt??null};
  }
  async updatePrivacy(request:FastifyRequest,raw:unknown) {
    const s=await this.currentSession(request);
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==1||(raw as any).optionalAnalytics===undefined||typeof (raw as any).optionalAnalytics!=='boolean')throw new BadRequestException('Select whether to allow optional analytics.');
    const enabled=(raw as {optionalAnalytics:boolean}).optionalAnalytics;
    return this.prisma.runWithTenantContext({userId:s.userId},()=>this.prisma.$transaction(async tx=>{
      const saved=await tx.userPrivacyPreference.upsert({where:{userId:s.userId},create:{userId:s.userId,optionalAnalytics:enabled,policyVersion:PRIVACY_VERSION},update:{optionalAnalytics:enabled,policyVersion:PRIVACY_VERSION}});
      await tx.privacyConsentEvent.create({data:{userId:s.userId,optionalAnalytics:enabled,policyVersion:PRIVACY_VERSION}});
      return {optionalAnalytics:saved.optionalAnalytics,policyVersion:saved.policyVersion,updatedAt:saved.updatedAt};
    }));
  }
  async beginAuthenticator(request:FastifyRequest,password:unknown) {
    const s=await this.requirePassword(request,password);
    const key=this.totpKey();
    const current=await this.prisma.runWithTenantContext({userId:s.userId},()=>this.prisma.authenticatorCredential.findUnique({where:{userId:s.userId}}));
    if(current?.enabledAt)throw new ConflictException('Authenticator verification is already enabled.');
    const secret=newAuthenticatorSecret();
    await this.prisma.runWithTenantContext({userId:s.userId},()=>this.prisma.authenticatorCredential.upsert({
      where:{userId:s.userId},create:{userId:s.userId,encryptedSecret:encryptAuthenticatorSecret(secret,key),setupExpiresAt:new Date(Date.now()+10*60_000)},
      update:{encryptedSecret:encryptAuthenticatorSecret(secret,key),setupExpiresAt:new Date(Date.now()+10*60_000),lastUsedStep:-1,recoveryHashes:[]},
    }));
    return {secret,uri:`otpauth://totp/LEXA:${encodeURIComponent(s.user.email)}?secret=${secret}&issuer=LEXA&algorithm=SHA1&digits=6&period=30`,expiresInSeconds:600};
  }
  async confirmAuthenticator(request:FastifyRequest,rawCode:unknown) {
    const s=await this.currentSession(request);
    const code=requireCode(rawCode),key=this.totpKey();
    return this.limitSecurityCodes(s.userId,()=>this.prisma.runWithTenantContext({userId:s.userId},()=>this.prisma.$transaction(async tx=>{
      const stored=await tx.authenticatorCredential.findUnique({where:{userId:s.userId}});
      if(!stored||stored.enabledAt||!stored.setupExpiresAt||stored.setupExpiresAt<new Date())throw new BadRequestException('Begin authenticator setup again.');
      const step=validTotpStep(decryptAuthenticatorSecret(stored.encryptedSecret,key),code);
      if(step===null)throw new BadRequestException('Authenticator code is incorrect.');
      const codes=Array.from({length:8},recoveryCode);
      await tx.authenticatorCredential.update({where:{userId:s.userId},data:{enabledAt:new Date(),setupExpiresAt:null,lastUsedStep:step,recoveryHashes:codes.map(tokenDigest)}});
      await tx.accountSecurityEvent.create({data:{userId:s.userId,eventType:'authenticator_enabled'}});
      return {enabled:true,recoveryCodes:codes};
    })));
  }
  async disableAuthenticator(request:FastifyRequest,password:unknown,rawCode:unknown) {
    const s=await this.requirePassword(request,password);
    const code=requireCode(rawCode),key=this.totpKey();
    return this.limitSecurityCodes(s.userId,()=>this.prisma.runWithTenantContext({userId:s.userId},()=>this.prisma.$transaction(async tx=>{
      const stored=await tx.authenticatorCredential.findUnique({where:{userId:s.userId}});
      if(!stored?.enabledAt)throw new BadRequestException('Authenticator verification is not enabled.');
      const step=validTotpStep(decryptAuthenticatorSecret(stored.encryptedSecret,key),code,Date.now(),stored.lastUsedStep);
      if(step===null&&!stored.recoveryHashes.includes(tokenDigest(code)))throw new ForbiddenException('Enter a valid authenticator or recovery code.');
      await tx.authenticatorCredential.delete({where:{userId:s.userId}});
      await tx.loginChallenge.deleteMany({where:{userId:s.userId,consumedAt:null}});
      await tx.accountSecurityEvent.create({data:{userId:s.userId,eventType:'authenticator_disabled'}});
      return {enabled:false};
    })));
  }
  async regenerateRecoveryCodes(request:FastifyRequest,password:unknown,rawCode:unknown) {
    const s=await this.requirePassword(request,password);
    const code=requireCode(rawCode),key=this.totpKey();
    return this.limitSecurityCodes(s.userId,()=>this.prisma.runWithTenantContext({userId:s.userId},()=>this.prisma.$transaction(async tx=>{
      const stored=await tx.authenticatorCredential.findUnique({where:{userId:s.userId}});
      if(!stored?.enabledAt)throw new ForbiddenException('Enable an authenticator first.');
      const step=validTotpStep(decryptAuthenticatorSecret(stored.encryptedSecret,key),code,Date.now(),stored.lastUsedStep);
      if(step===null)throw new ForbiddenException('Enter a fresh authenticator code to replace recovery codes.');
      const codes=Array.from({length:8},recoveryCode);
      await tx.authenticatorCredential.update({where:{userId:s.userId},data:{lastUsedStep:step,recoveryHashes:codes.map(tokenDigest)}});
      await tx.accountSecurityEvent.create({data:{userId:s.userId,eventType:'recovery_codes_regenerated'}});
      return {recoveryCodes:codes};
    })));
  }
}
