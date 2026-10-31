import { BadRequestException, ConflictException, Controller, ForbiddenException, Get, Headers, NotFoundException, Param, Post, Body, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CsrfGuard } from '../core/csrf.guard';
import { isWorkspaceAdministrator } from '../authorization/role-policy';
import { sendTransactionalEmail } from '../notifications/email-delivery';

type Input = Record<string, unknown>;
const ROLES = new Set(['business_manager','manager','branch_manager','accountant','sales','sales_operator','cashier','inventory_operator','warehouse_operator','read_only','member','viewer']);
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
function cookie(request: FastifyRequest) { for (const part of (request.headers.cookie ?? '').split(';')) { const at=part.indexOf('='); if(at>=0 && part.slice(0,at).trim()==='lexa_session') { try{return decodeURIComponent(part.slice(at+1).trim())}catch{return undefined} } } return undefined; }
function obj(value: unknown): Input { if(!value || typeof value!=='object' || Array.isArray(value)) throw new BadRequestException('Request body must be an object.'); return value as Input; }
function text(value: unknown,label: string,max=160): string { if(typeof value!=='string'||!value.trim()||value.trim().length>max) throw new BadRequestException(`${label} is required and must be at most ${max} characters.`); return value.trim(); }

@Controller('workspaces/:workspaceId/invitations')
export class InvitationsController {
 constructor(private readonly prisma: PrismaService) {}
 private async admin(request: FastifyRequest, workspaceId: string) {
  const raw=cookie(request); if(!raw) throw new UnauthorizedException({code:'AUTH_REQUIRED',message:'Sign in to manage invitations.'});
  const session=await this.prisma.session.findFirst({where:{tokenHash:sha(raw),expiresAt:{gt:new Date()}},select:{userId:true}});
  if(!session) throw new UnauthorizedException({code:'SESSION_EXPIRED',message:'Sign in again.'});
  this.prisma.enterTenantContext(workspaceId,session.userId);
  const membership=await this.prisma.membership.findUnique({where:{tenantId_userId:{tenantId:workspaceId,userId:session.userId}}});
  if(!membership||membership.status!=='ACTIVE') throw new NotFoundException('Workspace not found.');
  if(!isWorkspaceAdministrator(membership.role)) throw new ForbiddenException('Only workspace administrators can manage invitations.');
  return session.userId;
 }
 @Get() async list(@Param('workspaceId') workspaceId:string,@Req() request:FastifyRequest) {
  await this.admin(request,workspaceId);
  return this.prisma.workspaceInvitation.findMany({where:{tenantId:workspaceId},orderBy:{createdAt:'desc'},take:200,select:{id:true,email:true,role:true,branchScopeMode:true,branchIds:true,status:true,expiresAt:true,createdAt:true,acceptedAt:true}});
 }
 @Post() @UseGuards(CsrfGuard)
 async invite(@Param('workspaceId') workspaceId:string,@Headers('idempotency-key') key:string|undefined,@Body() raw:unknown,@Req() request:FastifyRequest) {
  const actorId=await this.admin(request,workspaceId); if(!key||key.length>200) throw new BadRequestException('Idempotency-Key header is required.');
  const input=obj(raw), email=text(input.email,'Email',254).toLowerCase(), role=text(input.role??'member','Role',60).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Enter a valid email address.');
  if(!ROLES.has(role)) throw new BadRequestException('The requested role is not available for invitation.');
  const branchIds=Array.isArray(input.branchIds)?[...new Set(input.branchIds.map(v=>text(v,'Branch ID',40)))]:[];
  if(branchIds.length>100) throw new BadRequestException('An invitation cannot grant more than 100 branches.');
  const allBranches=input.allBranches!==false; if(allBranches&&branchIds.length) throw new BadRequestException('Do not send branch IDs when allBranches is true.');
  const requestHash=sha(JSON.stringify({email,role,allBranches,branchIds:allBranches?[]:branchIds.sort()}));
  const prior=await this.prisma.workspaceInvitation.findUnique({where:{tenantId_idempotencyKey:{tenantId:workspaceId,idempotencyKey:key}}});
  if(prior) { if(prior.requestHash!==requestHash) throw new ConflictException('This idempotency key was used for different invitation data.'); if(prior.status==='PENDING') return {invitation:{id:prior.id,email:prior.email,role:prior.role,status:prior.status},sent:false}; throw new ConflictException('This invitation request has already completed.'); }
  const rawToken=randomBytes(32).toString('base64url'), invitationId=randomUUID();
  const invite=await this.prisma.$transaction(async tx=>{
   if(!allBranches&&branchIds.length) { const allowed=await tx.branch.findMany({where:{tenantId:workspaceId,id:{in:branchIds}},select:{id:true}}); if(allowed.length!==branchIds.length) throw new BadRequestException('One or more selected branches do not belong to this workspace.'); }
   const created=await tx.workspaceInvitation.create({data:{id:invitationId,tenantId:workspaceId,email,role,branchScopeMode:allBranches?'all':'restricted',branchIds:allBranches?[]:branchIds,tokenHash:sha(rawToken),idempotencyKey:key,requestHash,status:'PENDING',expiresAt:new Date(Date.now()+7*86400_000),invitedByUserId:actorId}});
   await tx.auditEvent.create({data:{tenantId:workspaceId,actorUserId:actorId,action:'workspace.invitation.created',resourceType:'workspace_invitation',resourceId:created.id,metadata:{email,role,branchScopeMode:created.branchScopeMode,branchCount:created.branchIds.length}}}); return created;
  },{isolationLevel:'Serializable'});
  const frontend=(process.env.FRONTEND_PUBLIC_URL??'https://lexareview.vercel.app').replace(/\/$/,'');
  const actionUrl=`${frontend}/accept-invitation?workspaceId=${encodeURIComponent(workspaceId)}&invitationId=${encodeURIComponent(invite.id)}&token=${encodeURIComponent(rawToken)}`;
  try { await sendTransactionalEmail({to:email,subject:'You have been invited to LEXA',text:`You have been invited to join a LEXA workspace as ${role}. Sign in using this email and accept within seven days.`,actionUrl,actionLabel:'Accept invitation'}); }
  catch(error) { await this.prisma.workspaceInvitation.update({where:{id:invite.id},data:{status:'DELIVERY_FAILED'}}); throw error; }
  return {invitation:{id:invite.id,email,role,status:invite.status,expiresAt:invite.expiresAt},sent:true};
 }
 @Post(':invitationId/accept') @UseGuards(CsrfGuard)
 async accept(@Param('workspaceId') workspaceId:string,@Param('invitationId') invitationId:string,@Body() raw:unknown,@Req() request:FastifyRequest) {
  const token=text(obj(raw).token,'Invitation token',500), rawSession=cookie(request); if(!rawSession) throw new UnauthorizedException({code:'AUTH_REQUIRED',message:'Sign in using the invited email address.'});
  const session=await this.prisma.session.findFirst({where:{tokenHash:sha(rawSession),expiresAt:{gt:new Date()}},include:{user:true}}); if(!session) throw new UnauthorizedException({code:'SESSION_EXPIRED',message:'Sign in again.'});
  this.prisma.enterTenantContext(workspaceId,session.userId);
  return this.prisma.$transaction(async tx=>{
   const rows=await tx.$queryRaw<Array<{id:string;email:string;role:string;branch_scope_mode:string;branch_ids:string[];status:string;expires_at:Date}>>`SELECT id,email,role,branch_scope_mode,branch_ids,status,expires_at FROM workspace_invitations WHERE id=${invitationId}::uuid AND tenant_id=${workspaceId}::uuid AND token_hash=${sha(token)} FOR UPDATE`;
   const invite=rows[0]; if(!invite||invite.status!=='PENDING'||invite.expires_at<=new Date()) throw new NotFoundException('Invitation is invalid, expired or already used.');
   if(invite.email.toLowerCase()!==session.user.email.toLowerCase()) throw new ForbiddenException('Sign in using the invited email address.');
   await tx.membership.upsert({where:{tenantId_userId:{tenantId:workspaceId,userId:session.userId}},create:{tenantId:workspaceId,userId:session.userId,role:invite.role,status:'ACTIVE',branchScopeMode:invite.branch_scope_mode},update:{role:invite.role,status:'ACTIVE',branchScopeMode:invite.branch_scope_mode}});
   await tx.branchMembership.deleteMany({where:{tenantId:workspaceId,userId:session.userId}});
   if(invite.branch_scope_mode==='restricted'&&invite.branch_ids.length) await tx.branchMembership.createMany({data:invite.branch_ids.map(branchId=>({tenantId:workspaceId,branchId,userId:session.userId}))});
   await tx.workspaceInvitation.update({where:{id:invite.id},data:{status:'ACCEPTED',acceptedByUserId:session.userId,acceptedAt:new Date()}});
   await tx.auditEvent.create({data:{tenantId:workspaceId,actorUserId:session.userId,action:'workspace.invitation.accepted',resourceType:'workspace_invitation',resourceId:invite.id}});
   return {accepted:true,workspaceId,role:invite.role,branchScopeMode:invite.branch_scope_mode,branchIds:invite.branch_ids};
  },{isolationLevel:'Serializable'});
 }
}
