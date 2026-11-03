
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Param, Post, Put, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import { CsrfGuard } from '../core/csrf.guard';
import { isOwnerRole } from '../authorization/role-policy';

const scrypt = promisify(scryptCallback);
export const EMPLOYEE_ROLES = new Set(['business_manager','cashier','sales','inventory_operator','warehouse_operator','procurement_officer','accountant','finance_manager','hr_officer','hr_manager','payroll_officer','customer_service','support_agent','delivery_officer','production_officer','quality_officer','project_manager','auditor','viewer','employee']);
function text(value: unknown, name: string, max = 120, required = false): string {
  if (value === null || value === undefined || value === '') { if (required) throw new BadRequestException(name+' is required.'); return ''; }
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new BadRequestException(name+' must be valid (max '+max+' characters).');
  return value.trim();
}
function object(value: unknown): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Enter valid employee data.');
  return value as Record<string,unknown>;
}
function username(value: unknown): string {
  const v = text(value,'Username',32,true).toLowerCase();
  if (!/^[a-z][a-z0-9._-]{2,31}$/.test(v)) throw new BadRequestException('Username must start with a letter and contain 3–32 lowercase letters, numbers, dots, underscores or hyphens.');
  return v;
}
function role(value: unknown): string {
  const v=text(value,'Employee role',40,true).toLowerCase();
  if (!EMPLOYEE_ROLES.has(v)) throw new BadRequestException('Choose an approved employee role. CEO ownership cannot be assigned here.');
  return v;
}
function workEmail(value: unknown): string {
  const v=text(value,'Work email',254).toLowerCase();
  if(v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new BadRequestException('Enter a valid work email or use a username-only login.');
  return v;
}
function date(value: unknown, name: string, optional = false): string|null {
  const v=text(value,name,10,!optional);
  if(!v&&optional)return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v))) throw new BadRequestException(name+' must be a real YYYY-MM-DD date.');
  return v;
}
function password(value: unknown): string {
  const v=text(value,'Temporary password',1024,true);
  if([...v].length<15)throw new BadRequestException('Temporary password must be at least 15 characters.');
  return v;
}
async function hash(value: string): Promise<string> {
  const salt=randomBytes(16);
  const derived=await scrypt(value,salt,64) as Buffer;
  return salt.toString('hex')+':'+derived.toString('hex');
}
function privateFields(input: Record<string,unknown>) {
  return {
    residentialAddress: text(input.residentialAddress,'Residential address',250)||null,
    district: text(input.district,'District',100)||null,
    dateOfBirth: date(input.dateOfBirth,'Date of birth',true),
    emergencyContactName: text(input.emergencyContactName,'Emergency contact',120)||null,
    emergencyContactPhone: text(input.emergencyContactPhone,'Emergency phone',40)||null,
    nationalId: text(input.nationalId,'National ID',60)||null,
    contractReference: text(input.contractReference,'Contract reference',100)||null,
    probationEnd: date(input.probationEnd,'Probation end',true),
    notes: text(input.notes,'Notes',1000)||null,
  };
}
@Controller('workspaces/:workspaceId')
export class StaffProvisioningController {
  constructor(private readonly prisma: PrismaService) {}
  private async actor(workspaceId:string,req:FastifyRequest,ceoOnly=true):Promise<string>{
    const raw=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('lexa_session='))?.slice(13);
    if(!raw)throw new UnauthorizedException('Sign in to continue.');
    let token='';try{token=decodeURIComponent(raw)}catch{throw new UnauthorizedException('Invalid session.')}
    const tokenHash=createHash('sha256').update(token).digest('hex');
    const session=await this.prisma.session.findFirst({where:{tokenHash,expiresAt:{gt:new Date()}},select:{userId:true}});
    if(!session)throw new UnauthorizedException('Session expired.');
    const member=await this.prisma.runWithTenantContext({tenantId:workspaceId,userId:session.userId},()=>this.prisma.membership.findUnique({where:{tenantId_userId:{tenantId:workspaceId,userId:session.userId}},select:{role:true,status:true}}));
    if(member?.status!=='ACTIVE')throw new ForbiddenException('Inactive workspace membership.');
    if(ceoOnly&&!isOwnerRole(member.role))throw new ForbiddenException('Only the CEO may manage employee accounts.');
    return session.userId;
  }
  @Get('staff')
  async list(@Param('workspaceId') tenantId:string,@Req() req:FastifyRequest) {
    const actorId=await this.actor(tenantId,req);
    return this.prisma.runWithTenantContext({tenantId,userId:actorId},()=>this.prisma.$queryRaw<Array<Record<string,unknown>>>`
      SELECT e.id AS "employeeId", e.user_id AS "userId", e.employee_number AS "employeeNumber",e.full_name AS "fullName",
      e.preferred_name AS "preferredName",e.work_email AS "email",e.phone,e.department,e.job_title AS "jobTitle",
      e.employment_type AS "employmentType",e.employment_status AS "employmentStatus",e.hire_date AS "hireDate",
      u.username,m.role,m.status AS "accessStatus",p.residential_address AS "residentialAddress",
      p.district,p.date_of_birth AS "dateOfBirth",p.emergency_contact_name AS "emergencyContactName",
      p.emergency_contact_phone AS "emergencyContactPhone",p.national_id AS "nationalId",
      p.contract_reference AS "contractReference",p.probation_end AS "probationEnd",p.notes
      FROM hr_employees e
      LEFT JOIN users u ON u.id=e.user_id
      LEFT JOIN memberships m ON m.tenant_id=e.tenant_id AND m.user_id=e.user_id
      LEFT JOIN hr_employee_private_profiles p ON p.tenant_id=e.tenant_id AND p.employee_id=e.id
      WHERE e.tenant_id=${tenantId}::uuid ORDER BY e.created_at DESC LIMIT 500`);
  }
  @Get('my-employment')
  async mine(@Param('workspaceId') tenantId:string,@Req() req:FastifyRequest) {
    const actorId=await this.actor(tenantId,req,false);
    const rows=await this.prisma.runWithTenantContext({tenantId,userId:actorId},()=>this.prisma.$queryRaw<Array<Record<string,unknown>>>`
      SELECT employee_number AS "employeeNumber",full_name AS "fullName",department,job_title AS "jobTitle",
      employment_type AS "employmentType",employment_status AS "employmentStatus",hire_date AS "hireDate"
      FROM hr_employees WHERE tenant_id=${tenantId}::uuid AND user_id=${actorId}::uuid LIMIT 1`);
    return rows[0]??null;
  }
  @Post('staff') @UseGuards(CsrfGuard)
  async create(@Param('workspaceId') tenantId:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
    const actorId=await this.actor(tenantId,req);
    const a=object(raw);
    const fullName=text(a.fullName,'Full name',160,true),loginName=username(a.username);
    const selectedRole=role(a.role),email=workEmail(a.email);
    const hashed=await hash(password(a.initialPassword));
    const preferredName=text(a.preferredName,'Preferred name',100)||null;
    const phone=text(a.phone,'Phone',40)||null,department=text(a.department,'Department',100)||null;
    const jobTitle=text(a.jobTitle,'Job title',120,true);
    const employmentType=text(a.employmentType??'salaried','Employment type',20,true);
    if(!['salaried','hourly','contractor'].includes(employmentType))throw new BadRequestException('Invalid employment type.');
    const hireDate=date(a.hireDate,'Start date')!;
    const extra=privateFields(a);
    const userId=randomUUID(),employeeId=randomUUID();
    const employeeNumber='EMP-'+randomBytes(5).toString('hex').toUpperCase();
    const loginEmail=email||('staff-'+userId+'@accounts.lexa.invalid');
    try{
      return await this.prisma.runWithTenantContext({tenantId,userId:actorId},()=>this.prisma.$transaction(async tx=>{
        const tenant=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM tenants WHERE id=${tenantId}::uuid FOR UPDATE`;
        if(!tenant.length)throw new ForbiddenException('Business not found.');
        const duplicate=await tx.user.findFirst({where:{OR:[{username:loginName},{email:loginEmail}]},select:{id:true}});
        if(duplicate)throw new ConflictException('Username or email already belongs to another account.');
        const branch=await tx.branch.findFirst({where:{tenantId},orderBy:{createdAt:'asc'}});
        if(!branch)throw new ConflictException('Existing business location unavailable; cannot create an employee yet.');
        await tx.user.create({data:{id:userId,username:loginName,email:loginEmail,displayName:fullName,passwordHash:hashed,mustChangePassword:true}});
        await tx.membership.create({data:{tenantId,userId,role:selectedRole,status:'ACTIVE',branchScopeMode:'all'}});
        await tx.$executeRaw`INSERT INTO hr_employees(id,tenant_id,branch_id,employee_number,user_id,full_name,preferred_name,
          work_email,phone,department,job_title,employment_type,employment_status,hire_date,created_by_user_id)
          VALUES (${employeeId}::uuid,${tenantId}::uuid,${branch.id}::uuid,${employeeNumber},${userId}::uuid,
          ${fullName},${preferredName},${email||null},${phone},${department},${jobTitle},
          ${employmentType},'active',${hireDate}::date,${actorId}::uuid)`;
        await tx.$executeRaw`INSERT INTO hr_employee_private_profiles
          (tenant_id,employee_id,residential_address,district,date_of_birth,emergency_contact_name,
           emergency_contact_phone,national_id,contract_reference,probation_end,notes)
          VALUES (${tenantId}::uuid,${employeeId}::uuid,${extra.residentialAddress},${extra.district},
          ${extra.dateOfBirth}::date,${extra.emergencyContactName},${extra.emergencyContactPhone},
          ${extra.nationalId},${extra.contractReference},${extra.probationEnd}::date,${extra.notes})`;
        await tx.auditEvent.create({data:{tenantId,actorUserId:actorId,action:'ceo.employee.created',resourceType:'hr_employee',resourceId:employeeId,metadata:{role:selectedRole,username:loginName,employeeNumber}}});
        return {created:true,employeeId,userId,employeeNumber,username:loginName,role:selectedRole,mustChangePassword:true};
      },{isolationLevel:'Serializable'}));
    }catch(e){
      if(e instanceof Error&&/unique constraint|duplicate key|P2002/i.test(e.message))throw new ConflictException('Employee username, email or employee number already exists.');
      throw e;
    }
  }
  @Put('staff/:employeeId') @UseGuards(CsrfGuard)
  async update(@Param('workspaceId') tenantId:string,@Param('employeeId') employeeId:string,@Body() raw:unknown,@Req() req:FastifyRequest){
    const actorId=await this.actor(tenantId,req),a=object(raw),x=privateFields(a);
    const fullName=text(a.fullName,'Full name',160,true),phone=text(a.phone,'Phone',40)||null;
    const department=text(a.department,'Department',100)||null,jobTitle=text(a.jobTitle,'Job title',120,true);
    return this.prisma.runWithTenantContext({tenantId,userId:actorId},()=>this.prisma.$transaction(async tx=>{
      const count=await tx.$executeRaw`UPDATE hr_employees SET full_name=${fullName},phone=${phone},
         department=${department},job_title=${jobTitle},updated_at=now()
         WHERE tenant_id=${tenantId}::uuid AND id=${employeeId}::uuid`;
      if(!count)throw new ForbiddenException('Employee not found.');
      await tx.$executeRaw`INSERT INTO hr_employee_private_profiles
        (tenant_id,employee_id,residential_address,district,date_of_birth,emergency_contact_name,
        emergency_contact_phone,national_id,contract_reference,probation_end,notes)
        VALUES (${tenantId}::uuid,${employeeId}::uuid,${x.residentialAddress},${x.district},
        ${x.dateOfBirth}::date,${x.emergencyContactName},${x.emergencyContactPhone},${x.nationalId},
        ${x.contractReference},${x.probationEnd}::date,${x.notes})
        ON CONFLICT(tenant_id,employee_id) DO UPDATE SET
        residential_address=EXCLUDED.residential_address,district=EXCLUDED.district,
        date_of_birth=EXCLUDED.date_of_birth,emergency_contact_name=EXCLUDED.emergency_contact_name,
        emergency_contact_phone=EXCLUDED.emergency_contact_phone,national_id=EXCLUDED.national_id,
        contract_reference=EXCLUDED.contract_reference,probation_end=EXCLUDED.probation_end,
        notes=EXCLUDED.notes,updated_at=now()`;
      await tx.auditEvent.create({data:{tenantId,actorUserId:actorId,action:'ceo.employee.updated',resourceType:'hr_employee',resourceId:employeeId}});
      return {updated:true};
    }));
  }
  @Post('staff/:employeeId/reset-password') @UseGuards(CsrfGuard)
  async reset(@Param('workspaceId') tenantId:string,@Param('employeeId') employeeId:string,@Body() raw:unknown,@Req() req:FastifyRequest){
    const actorId=await this.actor(tenantId,req);
    const hashed=await hash(password(object(raw).initialPassword));
    return this.prisma.runWithTenantContext({tenantId,userId:actorId},()=>this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<{userId:string}>>`
        SELECT e.user_id AS "userId" FROM hr_employees e JOIN memberships m
        ON m.tenant_id=e.tenant_id AND m.user_id=e.user_id
        WHERE e.tenant_id=${tenantId}::uuid AND e.id=${employeeId}::uuid
        AND m.role NOT IN ('owner','owner_administrator') FOR UPDATE OF e`;
      if(!rows[0]?.userId)throw new ForbiddenException('Employee not found.');
      await tx.user.update({where:{id:rows[0].userId},data:{passwordHash:hashed,mustChangePassword:true}});
      await tx.session.deleteMany({where:{userId:rows[0].userId}});
      await tx.auditEvent.create({data:{tenantId,actorUserId:actorId,action:'ceo.employee.password_reset',resourceType:'hr_employee',resourceId:employeeId}});
      return {reset:true,mustChangePassword:true};
    }));
  }
}

