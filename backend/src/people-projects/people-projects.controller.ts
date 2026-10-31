import {
  BadRequestException, ConflictException, Controller, ForbiddenException, Get,
  NotFoundException, Post, Patch, Body, Param, Query, Req, UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hasPermission, normalizeRole } from '../authorization/role-policy';
import { assertBranchAccess } from '../authorization/branch-scope';
import { CsrfGuard } from '../core/csrf.guard';
import { PeopleProjectsService } from './people-projects.service';

type Obj = Record<string, unknown>;
function obj(value: unknown): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Request body must be an object.');
  return value as Obj;
}
function str(value: unknown, label: string, max = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`${label} is required (maximum ${max} characters).`);
  return value.trim();
}
function opt(value: unknown, label: string, max = 1000): string | null {
  if (value === undefined || value === null || value === '') return null;
  return str(value, label, max);
}
function uuid(value: unknown, label: string): string {
  const parsed = str(value, label, 64);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)) throw new BadRequestException(`${label} must be a valid ID.`);
  return parsed;
}
function date(value: unknown, label: string): string {
  const parsed = str(value, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed) || Number.isNaN(Date.parse(`${parsed}T00:00:00Z`)) || new Date(`${parsed}T00:00:00Z`).toISOString().slice(0,10)!==parsed) throw new BadRequestException(`${label} must be a YYYY-MM-DD date.`);
  return parsed;
}
function integer(value: unknown, label: string, min = 0, max = 2_000_000_000): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new BadRequestException(`${label} must be a whole number between ${min} and ${max}.`);
  return n;
}
function hours(value: unknown, label: string, max = 24): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max || Math.round(n * 100) !== n * 100) throw new BadRequestException(`${label} must be between 0 and ${max} with at most two decimals.`);
  return n;
}
function cookie(request: FastifyRequest): string | undefined {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index >= 0 && part.slice(0,index).trim() === 'lexa_session') {
      try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return undefined; }
    }
  }
  return undefined;
}
function sha(value: string) { return createHash('sha256').update(value).digest('hex'); }
function asIso(value: unknown): string | null { return value ? new Date(value as string | Date).toISOString() : null; }
function dateText(value: unknown): string { return String(value).slice(0,10); }
function enumValue(value: unknown, label: string, options: string[], fallback?: string): string {
  const selected = value === undefined || value === '' ? fallback : value;
  if (typeof selected !== 'string' || !options.includes(selected)) throw new BadRequestException(`${label} has an unsupported value.`);
  return selected;
}
function isEmployeeRole(role: string) { return normalizeRole(role) === 'employee'; }

@Controller('workspaces/:workspaceId/branches/:branchId/workstream6')
export class PeopleProjectsController {
  constructor(private readonly prisma: PrismaService, private readonly domain: PeopleProjectsService) {}

  private async actor(request: FastifyRequest, workspaceId: string, branchId: string, permission: Parameters<typeof hasPermission>[1]) {
    const token = cookie(request);
    if (!token) throw new ForbiddenException('Sign in to continue.');
    const session = await this.prisma.session.findFirst({ where: { tokenHash: sha(token), expiresAt: { gt: new Date() } }, select: { userId: true } });
    if (!session) throw new ForbiddenException('Your session has expired. Sign in again.');
    const membership = await this.prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: workspaceId, userId: session.userId } } });
    if (!membership || membership.status !== 'ACTIVE') throw new NotFoundException('Workspace not found.');
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId: workspaceId }, select: { id: true } });
    if (!branch) throw new NotFoundException('Branch not found.');
    await assertBranchAccess(this.prisma, workspaceId, branchId, session.userId, membership.role);
    if (!hasPermission(membership.role, permission)) throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Your role does not permit this operation.', permission });
    return { userId: session.userId, role: membership.role };
  }

  private async audit(tx: any, tenantId: string, branchId: string, actorUserId: string, action: string, resourceType: string, resourceId: string, metadata: Obj = {}) {
    await tx.$executeRaw`INSERT INTO audit_events(id,tenant_id,branch_id,actor_user_id,action,resource_type,resource_id,metadata)
      VALUES(${randomUUID()}::uuid,${tenantId}::uuid,${branchId}::uuid,${actorUserId}::uuid,${action},${resourceType},${resourceId},${JSON.stringify(metadata)}::jsonb)`;
  }

  private async mirror(tx: any, tenantId: string, branchId: string, moduleId: string, recordId: string, data: Obj) {
    await tx.$executeRaw`INSERT INTO module_records(id,tenant_id,branch_id,module_id,record_id,data,version,created_at,updated_at)
      VALUES(${randomUUID()}::uuid,${tenantId}::uuid,${branchId}::uuid,${moduleId},${recordId},${JSON.stringify(data)}::jsonb,1,now(),now())
      ON CONFLICT(tenant_id,branch_id,module_id,record_id) DO UPDATE SET data=EXCLUDED.data,version=module_records.version+1,updated_at=now()`;
  }

  private async link(tx: any, tenantId: string, branchId: string, actorUserId: string, sourceModule: string, sourceId: string, targetModule: string, targetId: string, relationType: string) {
    if (sourceModule === targetModule && sourceId === targetId) return;
    await tx.$executeRaw`INSERT INTO module_record_links(id,tenant_id,branch_id,source_module_id,source_record_id,target_module_id,target_record_id,relation_type,created_by_user_id)
      VALUES(${randomUUID()}::uuid,${tenantId}::uuid,${branchId}::uuid,${sourceModule},${sourceId},${targetModule},${targetId},${relationType},${actorUserId}::uuid)
      ON CONFLICT(tenant_id,branch_id,source_module_id,source_record_id,target_module_id,target_record_id,relation_type) DO NOTHING`;
  }

  private async employeeForActor(tenantId: string, branchId: string, userId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM hr_employees WHERE tenant_id=${tenantId}::uuid AND branch_id=${branchId}::uuid AND user_id=${userId}::uuid AND employment_status<>'terminated' LIMIT 1`;
    return rows[0]?.id ?? null;
  }

  private async assertEmployee(tenantId: string, branchId: string, employeeId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM hr_employees WHERE tenant_id=${tenantId}::uuid AND branch_id=${branchId}::uuid AND id=${employeeId}::uuid`;
    if (!rows.length) throw new NotFoundException('Employee not found in this branch.');
  }

  private async assertModuleRecord(tenantId: string, branchId: string, moduleId: string, recordId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM module_records WHERE tenant_id=${tenantId}::uuid AND branch_id=${branchId}::uuid AND module_id=${moduleId} AND record_id=${recordId} LIMIT 1`;
    if (!rows.length) throw new NotFoundException(`Linked ${moduleId} record was not found in this branch.`);
  }

  private async createApproval(tx: any, tenantId: string, branchId: string, actorUserId: string, input: {
    ownerModule: 'leave' | 'timesheets' | 'payroll'; ownerRecordId: string; title: string; description: string; href: string;
  }) {
    const id = randomUUID();
    const data = {
      id, title: input.title, description: input.description, requestedBy: actorUserId,
      requestedAt: new Date().toISOString(), status: 'pending', href: input.href,
      ownerModule: input.ownerModule, ownerRecordId: input.ownerRecordId,
    };
    await tx.moduleRecord.create({ data: { tenantId, branchId, moduleId: 'approvals', recordId: id, data: data as any } });
    return id;
  }

  // Employee directory. Compensation is returned only to holders of the separate
  // people.compensation.read permission; employees can see only their own row.
  @Get('people/employees')
  async employees(@Param('workspaceId') w: string, @Param('branchId') b: string, @Req() req: FastifyRequest) {
    const a = await this.actor(req,w,b,'people.read');
    const privateFields = isEmployeeRole(a.role) || hasPermission(a.role,'people.private.read');
    const compensation = hasPermission(a.role,'people.compensation.read');
    const selfId = isEmployeeRole(a.role) ? await this.employeeForActor(w,b,a.userId) : null;
    if (isEmployeeRole(a.role) && !selfId) return [];
    const rows = await this.prisma.$queryRaw<Array<any>>`
      SELECT e.id,e.employee_number,e.user_id,e.full_name,e.preferred_name,e.work_email,e.phone,e.department,e.job_title,
        e.manager_employee_id,e.employment_type,e.employment_status,e.hire_date,e.termination_date,e.default_shift_id,e.created_at,e.updated_at,
        ${compensation} AS can_view_compensation,
        c.pay_basis,c.pay_frequency,c.currency,c.base_pay_minor,c.hourly_rate_minor,c.effective_from,c.effective_to
      FROM hr_employees e LEFT JOIN LATERAL (
        SELECT pay_basis,pay_frequency,currency,base_pay_minor,hourly_rate_minor,effective_from,effective_to
        FROM hr_employee_compensation WHERE tenant_id=e.tenant_id AND employee_id=e.id
          AND effective_from<=CURRENT_DATE AND (effective_to IS NULL OR effective_to>=CURRENT_DATE)
        ORDER BY effective_from DESC LIMIT 1
      ) c ON true
      WHERE e.tenant_id=${w}::uuid AND e.branch_id=${b}::uuid
        AND (${selfId}::uuid IS NULL OR e.id=${selfId ?? '00000000-0000-0000-0000-000000000000'}::uuid)
      ORDER BY e.full_name LIMIT 1000
    `;
    return rows.map((r) => ({
      id:r.id, employeeNumber:r.employee_number, fullName:r.full_name,
      department:r.department,
      jobTitle:r.job_title, managerEmployeeId:r.manager_employee_id, employmentType:r.employment_type,
      employmentStatus:r.employment_status, hireDate:dateText(r.hire_date),
      defaultShiftId:r.default_shift_id, createdAt:asIso(r.created_at), updatedAt:asIso(r.updated_at),
      ...(privateFields ? { preferredName:r.preferred_name,workEmail:r.work_email,phone:r.phone,terminationDate:r.termination_date?dateText(r.termination_date):null } : {}),
      ...(compensation && r.pay_basis ? { compensation:{ payBasis:r.pay_basis,payFrequency:r.pay_frequency,currency:r.currency,
        basePayMinor:String(r.base_pay_minor),hourlyRateMinor:String(r.hourly_rate_minor),effectiveFrom:dateText(r.effective_from),effectiveTo:r.effective_to?dateText(r.effective_to):null } } : {}),
    }));
  }

  @Post('people/employees')
  @UseGuards(CsrfGuard)
  async createEmployee(@Param('workspaceId') w:string,@Param('branchId') b:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'people.directory.write');
    if (isEmployeeRole(a.role)) throw new ForbiddenException('Employees may submit their own requests but cannot create employee records.');
    const v=obj(raw),id=randomUUID(),employeeNumber=str(v.employeeNumber,'Employee number',40),fullName=str(v.fullName,'Full name',160);
    const hireDate=date(v.hireDate,'Hire date'),employmentType=enumValue(v.employmentType,'Employment type',['salaried','hourly','contractor'],'salaried');
    const userId=v.userId?uuid(v.userId,'Linked user'):null;
    if(userId){const m=await this.prisma.membership.findUnique({where:{tenantId_userId:{tenantId:w,userId}}});if(!m||m.status!=='ACTIVE')throw new BadRequestException('Linked user must have an active workspace membership.');}
    const managerId=v.managerEmployeeId?uuid(v.managerEmployeeId,'Manager'):null;
    if(managerId)await this.assertEmployee(w,b,managerId);
    const shiftId=v.defaultShiftId?uuid(v.defaultShiftId,'Default shift'):null;
    if(shiftId){const s=await this.prisma.$queryRaw<any[]>`SELECT id FROM hr_shifts WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${shiftId}::uuid AND active=true`;if(!s.length)throw new BadRequestException('Default shift is not active in this branch.');}
    const row=await this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<any[]>`INSERT INTO hr_employees(id,tenant_id,branch_id,employee_number,user_id,full_name,preferred_name,work_email,phone,department,job_title,manager_employee_id,employment_type,employment_status,hire_date,default_shift_id,created_by_user_id)
        VALUES(${id}::uuid,${w}::uuid,${b}::uuid,${employeeNumber},${userId}::uuid,${fullName},${opt(v.preferredName,'Preferred name',100)},${opt(v.workEmail,'Work email',160)},${opt(v.phone,'Phone',40)},${opt(v.department,'Department',100)},${opt(v.jobTitle,'Job title',100)},${managerId}::uuid,${employmentType},'active',${hireDate}::date,${shiftId}::uuid,${a.userId}::uuid)
        RETURNING id,employee_number,full_name,work_email,department,job_title,employment_type,employment_status,hire_date`;
      const e=rows[0];
      await this.mirror(tx,w,b,'employees',id,{id,employeeCode:e.employee_number,employee:e.full_name,fullName:e.full_name,department:e.department,jobTitle:e.job_title,employmentType:e.employment_type,status:'Active',hireDate:dateText(e.hire_date)});
      await this.audit(tx,w,b,a.userId,'people.employee.created','employee',id,{employeeNumber});
      return e;
    },{isolationLevel:'Serializable'});
    return {id:row.id,employeeNumber:row.employee_number,fullName:row.full_name,workEmail:row.work_email,department:row.department,jobTitle:row.job_title,employmentType:row.employment_type,employmentStatus:row.employment_status,hireDate:dateText(row.hire_date)};
  }

  @Patch('people/employees/:employeeId')
  @UseGuards(CsrfGuard)
  async updateEmployee(@Param('workspaceId') w:string,@Param('branchId') b:string,@Param('employeeId') id:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'people.write');
    const v=obj(raw);await this.assertEmployee(w,b,id);
    if(isEmployeeRole(a.role)){const own=await this.employeeForActor(w,b,a.userId);if(own!==id)throw new ForbiddenException('You may update only your own contact details.');if(Object.keys(v).some(k=>!['phone','preferredName'].includes(k)))throw new ForbiddenException('Employees may update only their preferred name and phone number.');}
    else await this.actor(req,w,b,'people.directory.write');
    const employeeNumber = v.employeeNumber===undefined?null:str(v.employeeNumber,'Employee number',40);
    const fullName = v.fullName===undefined?null:str(v.fullName,'Full name',160);
    const preferredName = v.preferredName===undefined?undefined:opt(v.preferredName,'Preferred name',100);
    const phone = v.phone===undefined?undefined:opt(v.phone,'Phone',40);
    const department = v.department===undefined?undefined:opt(v.department,'Department',100);
    const jobTitle = v.jobTitle===undefined?undefined:opt(v.jobTitle,'Job title',100);
    const status = v.employmentStatus===undefined?null:enumValue(v.employmentStatus,'Employment status',['active','on_leave','suspended','terminated']);
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<any[]>`UPDATE hr_employees SET
        employee_number=COALESCE(${employeeNumber},employee_number),full_name=COALESCE(${fullName},full_name),
        preferred_name=CASE WHEN ${v.preferredName===undefined} THEN preferred_name ELSE ${preferredName} END,
        phone=CASE WHEN ${v.phone===undefined} THEN phone ELSE ${phone} END,
        department=CASE WHEN ${v.department===undefined} THEN department ELSE ${department} END,
        job_title=CASE WHEN ${v.jobTitle===undefined} THEN job_title ELSE ${jobTitle} END,
        employment_status=COALESCE(${status},employment_status),updated_at=now()
        WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${id}::uuid RETURNING id,employee_number,full_name,preferred_name,phone,department,job_title,employment_status,hire_date`;
      const r=rows[0];if(!r)throw new NotFoundException('Employee not found.');
      await this.mirror(tx,w,b,'employees',id,{id,employeeCode:r.employee_number,employee:r.full_name,fullName:r.full_name,department:r.department,jobTitle:r.job_title,status:r.employment_status,hireDate:dateText(r.hire_date)});
      await this.audit(tx,w,b,a.userId,'people.employee.updated','employee',id,{fields:Object.keys(v)});
      return {id:r.id,employeeNumber:r.employee_number,fullName:r.full_name,preferredName:r.preferred_name,phone:r.phone,department:r.department,jobTitle:r.job_title,employmentStatus:r.employment_status};
    },{isolationLevel:'Serializable'});
  }

  @Post('people/employees/:employeeId/compensation')
  @UseGuards(CsrfGuard)
  async setCompensation(@Param('workspaceId') w:string,@Param('branchId') b:string,@Param('employeeId') e:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'people.compensation.write');await this.assertEmployee(w,b,e);const v=obj(raw);
    const basis=enumValue(v.payBasis,'Pay basis',['monthly','hourly']);const payFrequency=enumValue(v.payFrequency,'Pay frequency',['weekly','biweekly','monthly'],'monthly');
    const currency=str(v.currency??'UGX','Currency',3).toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw new BadRequestException('Currency must be an ISO 4217 code.');
    if(basis==='monthly'&&payFrequency!=='monthly')throw new BadRequestException('Monthly salary basis must use monthly pay frequency.');
    const effectiveFrom=date(v.effectiveFrom,'Effective from'),effectiveTo=v.effectiveTo?date(v.effectiveTo,'Effective to'):null;
    const base=integer(v.basePayMinor??0,'Base pay'),rate=integer(v.hourlyRateMinor??0,'Hourly rate');
    const multiplier=Number(v.overtimeMultiplier??1.5);if(!Number.isFinite(multiplier)||multiplier<1||multiplier>5)throw new BadRequestException('Overtime multiplier must be between 1 and 5.');
    const id=randomUUID();
    await this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM hr_employees WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${e}::uuid FOR UPDATE`;
      await tx.$executeRaw`UPDATE hr_employee_compensation SET effective_to=(${effectiveFrom}::date-interval '1 day')::date WHERE tenant_id=${w}::uuid AND employee_id=${e}::uuid AND effective_from<${effectiveFrom}::date AND (effective_to IS NULL OR effective_to>=${effectiveFrom}::date)`;
      await tx.$executeRaw`INSERT INTO hr_employee_compensation(id,tenant_id,employee_id,effective_from,effective_to,pay_basis,currency,pay_frequency,base_pay_minor,hourly_rate_minor,overtime_multiplier,created_by_user_id)
        VALUES(${id}::uuid,${w}::uuid,${e}::uuid,${effectiveFrom}::date,${effectiveTo}::date,${basis},${currency},${payFrequency},${base}::bigint,${rate}::bigint,${multiplier},${a.userId}::uuid)`;
      await this.audit(tx,w,b,a.userId,'people.employee.compensation_changed','employee',e,{compensationId:id,effectiveFrom,payBasis:basis});
    },{isolationLevel:'Serializable'});
    return {id,employeeId:e,effectiveFrom,effectiveTo,payBasis:basis,payFrequency,currency,basePayMinor:String(base),hourlyRateMinor:String(rate),overtimeMultiplier:multiplier};
  }

  @Get('people/shifts')
  async shifts(@Param('workspaceId') w:string,@Param('branchId') b:string,@Req() req:FastifyRequest) {
    await this.actor(req,w,b,'people.read');
    return this.prisma.$queryRaw`SELECT id,code,name,starts_at AS "startsAt",ends_at AS "endsAt",break_minutes AS "breakMinutes",grace_minutes AS "graceMinutes",active FROM hr_shifts WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid ORDER BY name`;
  }

  @Post('people/shifts')
  @UseGuards(CsrfGuard)
  async createShift(@Param('workspaceId') w:string,@Param('branchId') b:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'people.directory.write');if(isEmployeeRole(a.role))throw new ForbiddenException('Employees cannot configure shifts.');
    const v=obj(raw),id=randomUUID(),code=str(v.code,'Shift code',32),name=str(v.name,'Shift name',100);
    const startsAt=str(v.startsAt,'Start time',5),endsAt=str(v.endsAt,'End time',5);
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(startsAt)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(endsAt)||startsAt===endsAt)throw new BadRequestException('Shift start and end times must be valid and different.');
    const breakMinutes=integer(v.breakMinutes??0,'Break minutes',0,720),graceMinutes=integer(v.graceMinutes??0,'Grace minutes',0,240);
    await this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`INSERT INTO hr_shifts(id,tenant_id,branch_id,code,name,starts_at,ends_at,break_minutes,grace_minutes)
        VALUES(${id}::uuid,${w}::uuid,${b}::uuid,${code},${name},${startsAt}::time,${endsAt}::time,${breakMinutes},${graceMinutes})`;
      await this.mirror(tx,w,b,'shifts',id,{id,shiftCode:code,name,startsAt,endsAt,breakMinutes,graceMinutes,status:'Active'});
      await this.audit(tx,w,b,a.userId,'people.shift.created','shift',id,{code});
    });
    return {id,code,name,startsAt,endsAt,breakMinutes,graceMinutes,active:true};
  }

  @Get('people/shift-assignments')
  async shiftAssignments(@Param('workspaceId') w:string,@Param('branchId') b:string,@Query('employeeId') employeeId:string|undefined,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'people.read');
    const self=isEmployeeRole(a.role)?await this.employeeForActor(w,b,a.userId):null;
    if(isEmployeeRole(a.role)&&!self)return [];
    if(!isEmployeeRole(a.role)&&!hasPermission(a.role,'people.private.read'))throw new ForbiddenException('Your role cannot read employee shift assignments.');
    const target=employeeId?uuid(employeeId,'Employee'):self;
    if(self&&target!==self)throw new ForbiddenException('You may view only your own shift assignments.');
    return this.prisma.$queryRaw`SELECT a.id,a.employee_id AS "employeeId",e.employee_number AS "employeeNumber",e.full_name AS "employeeName",a.shift_id AS "shiftId",s.code AS "shiftCode",s.name AS "shiftName",a.starts_on AS "startsOn",a.ends_on AS "endsOn"
      FROM hr_employee_shift_assignments a JOIN hr_employees e ON e.tenant_id=a.tenant_id AND e.id=a.employee_id JOIN hr_shifts s ON s.tenant_id=a.tenant_id AND s.id=a.shift_id
      WHERE a.tenant_id=${w}::uuid AND a.branch_id=${b}::uuid AND (${target}::uuid IS NULL OR a.employee_id=${target??'00000000-0000-0000-0000-000000000000'}::uuid)
      ORDER BY a.starts_on DESC LIMIT 1000`;
  }

  @Post('people/shift-assignments')
  @UseGuards(CsrfGuard)
  async createShiftAssignment(@Param('workspaceId') w:string,@Param('branchId') b:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'people.directory.write'),v=obj(raw);
    const employeeId=uuid(v.employeeId,'Employee'),shiftId=uuid(v.shiftId,'Shift'),startsOn=date(v.startsOn,'Start date'),endsOn=v.endsOn?date(v.endsOn,'End date'):null;
    if(endsOn&&endsOn<startsOn)throw new BadRequestException('Shift assignment end date cannot precede its start date.');
    const id=randomUUID();
    await this.prisma.$transaction(async tx=>{
      const employee=await tx.$queryRaw<any[]>`SELECT id FROM hr_employees WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${employeeId}::uuid FOR UPDATE`;
      if(!employee.length)throw new NotFoundException('Employee not found in this branch.');
      const shift=await tx.$queryRaw<any[]>`SELECT id FROM hr_shifts WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${shiftId}::uuid AND active=true`;
      if(!shift.length)throw new NotFoundException('Active shift not found in this branch.');
      const overlap=await tx.$queryRaw<any[]>`SELECT id FROM hr_employee_shift_assignments WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND employee_id=${employeeId}::uuid AND daterange(starts_on,COALESCE(ends_on+1,'infinity'::date),'[)') && daterange(${startsOn}::date,COALESCE(${endsOn}::date+1,'infinity'::date),'[)') LIMIT 1`;
      if(overlap.length)throw new ConflictException('This employee already has an overlapping shift assignment.');
      await tx.$executeRaw`INSERT INTO hr_employee_shift_assignments(id,tenant_id,branch_id,employee_id,shift_id,starts_on,ends_on,created_by_user_id)
        VALUES(${id}::uuid,${w}::uuid,${b}::uuid,${employeeId}::uuid,${shiftId}::uuid,${startsOn}::date,${endsOn}::date,${a.userId}::uuid)`;
      await this.audit(tx,w,b,a.userId,'people.shift.assigned','employee_shift_assignment',id,{employeeId,shiftId,startsOn,endsOn});
    },{isolationLevel:'Serializable'});
    return {id,employeeId,shiftId,startsOn,endsOn};
  }

  @Get('people/attendance')
  async attendance(@Param('workspaceId') w:string,@Param('branchId') b:string,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'people.read');const self=isEmployeeRole(a.role)?await this.employeeForActor(w,b,a.userId):null;
    if(isEmployeeRole(a.role)&&!self)return [];
    if(!isEmployeeRole(a.role)&&!hasPermission(a.role,'people.private.read'))throw new ForbiddenException('Your role cannot read employee attendance records.');
    return this.prisma.$queryRaw`SELECT at.id,at.employee_id AS "employeeId",e.employee_number AS "employeeNumber",e.full_name AS "employeeName",at.shift_id AS "shiftId",s.name AS "shiftName",at.attendance_date AS "attendanceDate",at.clock_in AS "clockIn",at.clock_out AS "clockOut",at.worked_minutes AS "workedMinutes",at.late_minutes AS "lateMinutes",at.status,at.note,at.reviewed_at AS "reviewedAt"
      FROM hr_attendance at JOIN hr_employees e ON e.tenant_id=at.tenant_id AND e.id=at.employee_id LEFT JOIN hr_shifts s ON s.id=at.shift_id
      WHERE at.tenant_id=${w}::uuid AND at.branch_id=${b}::uuid AND (${self}::uuid IS NULL OR at.employee_id=${self??'00000000-0000-0000-0000-000000000000'}::uuid)
      ORDER BY at.attendance_date DESC LIMIT 1000`;
  }

  @Post('people/attendance')
  @UseGuards(CsrfGuard)
  async recordAttendance(@Param('workspaceId') w:string,@Param('branchId') b:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'people.write'),v=obj(raw);const employeeId=v.employeeId?uuid(v.employeeId,'Employee'):await this.employeeForActor(w,b,a.userId);
    if(!employeeId)throw new ForbiddenException('Your account is not linked to an employee record.');
    if(isEmployeeRole(a.role)&&employeeId!==await this.employeeForActor(w,b,a.userId))throw new ForbiddenException('You may record only your own attendance.');
    await this.assertEmployee(w,b,employeeId);
    const attendanceDate=date(v.attendanceDate,'Attendance date'),shiftId=v.shiftId?uuid(v.shiftId,'Shift'):null;
    const clockIn=v.clockIn?new Date(str(v.clockIn,'Clock in',50)):null,clockOut=v.clockOut?new Date(str(v.clockOut,'Clock out',50)):null;
    if(clockIn&&Number.isNaN(clockIn.getTime())||clockOut&&Number.isNaN(clockOut.getTime()))throw new BadRequestException('Clock times must be valid timestamps.');
    if(clockOut&&(!clockIn||clockOut<=clockIn))throw new BadRequestException('Clock out must be later than clock in.');
    const shift=shiftId?await this.prisma.$queryRaw<any[]>`SELECT s.starts_at,s.grace_minutes,s.break_minutes,br.timezone FROM hr_shifts s JOIN branches br ON br.tenant_id=s.tenant_id AND br.id=s.branch_id WHERE s.tenant_id=${w}::uuid AND s.branch_id=${b}::uuid AND s.id=${shiftId}::uuid AND s.active=true`:[];
    if(shiftId&&!shift.length)throw new BadRequestException('Shift is not active in this branch.');
    const worked=clockIn&&clockOut?Math.max(0,Math.floor((clockOut.getTime()-clockIn.getTime())/60000)-Number(shift[0]?.break_minutes??0)):0;
    let lateMinutes=0;
    if(clockIn&&shift[0]){const late=await this.prisma.$queryRaw<any[]>`SELECT GREATEST(0,FLOOR(EXTRACT(EPOCH FROM ((${clockIn}::timestamptz AT TIME ZONE ${shift[0].timezone})::time-${shift[0].starts_at}::time))/60)::int-${Number(shift[0].grace_minutes)})::int AS minutes`;lateMinutes=Number(late[0]?.minutes??0);}
    const defaultStatus=clockIn?(lateMinutes>0?'late':worked?'present':'incomplete'):'absent';
    const status=enumValue(v.status,'Attendance status',['present','late','absent','leave','incomplete'],defaultStatus);
    const id=randomUUID();
    await this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`INSERT INTO hr_attendance(id,tenant_id,branch_id,employee_id,shift_id,attendance_date,clock_in,clock_out,worked_minutes,late_minutes,status,note)
        VALUES(${id}::uuid,${w}::uuid,${b}::uuid,${employeeId}::uuid,${shiftId}::uuid,${attendanceDate}::date,${clockIn}::timestamptz,${clockOut}::timestamptz,${worked},${lateMinutes},${status},${opt(v.note,'Note',1000)})`;
      await this.mirror(tx,w,b,'attendance',id,{id,attendanceReference:`ATT-${attendanceDate.replaceAll('-','')}-${id.slice(0,6)}`,employeeId,attendanceDate,shiftId,clockIn:clockIn?.toISOString()??'',clockOut:clockOut?.toISOString()??'',workedHours:worked/60,lateMinutes,status});
      await this.audit(tx,w,b,a.userId,'people.attendance.recorded','attendance',id,{employeeId,attendanceDate,status,workedMinutes:worked});
    });
    return {id,employeeId,attendanceDate,clockIn:clockIn?.toISOString()??null,clockOut:clockOut?.toISOString()??null,workedMinutes:worked,status};
  }

  @Post('people/attendance/:attendanceId/review')
  @UseGuards(CsrfGuard)
  async reviewAttendance(@Param('workspaceId') w:string,@Param('branchId') b:string,@Param('attendanceId') id:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'people.write');if(isEmployeeRole(a.role))throw new ForbiddenException('Employees cannot approve attendance.');const v=obj(raw);
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<any[]>`UPDATE hr_attendance SET reviewed_by_user_id=${a.userId}::uuid,reviewed_at=now(),note=COALESCE(${opt(v.note,'Review note',1000)},note),updated_at=now()
        WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${id}::uuid RETURNING id,employee_id,attendance_date,worked_minutes,status`;
      const row=rows[0];if(!row)throw new NotFoundException('Attendance record not found.');
      await this.audit(tx,w,b,a.userId,'people.attendance.reviewed','attendance',id,{employeeId:row.employee_id});return {id:row.id,employeeId:row.employee_id,attendanceDate:dateText(row.attendance_date),workedMinutes:row.worked_minutes,status:row.status};
    });
  }

  @Get('people/leave')
  async leave(@Param('workspaceId') w:string,@Param('branchId') b:string,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'people.read'),self=isEmployeeRole(a.role)?await this.employeeForActor(w,b,a.userId):null;
    if(isEmployeeRole(a.role)&&!self)return [];
    if(!isEmployeeRole(a.role)&&!hasPermission(a.role,'people.private.read'))throw new ForbiddenException('Your role cannot read employee leave records.');
    return this.prisma.$queryRaw`SELECT l.id,l.employee_id AS "employeeId",e.employee_number AS "employeeNumber",e.full_name AS "employeeName",l.request_number AS "requestNumber",l.leave_type AS "leaveType",l.starts_on AS "startsOn",l.ends_on AS "endsOn",l.days_requested AS "daysRequested",l.paid,l.reason,l.status,l.submitted_at AS "submittedAt",l.decision_comment AS "decisionComment"
      FROM hr_leave_requests l JOIN hr_employees e ON e.tenant_id=l.tenant_id AND e.id=l.employee_id
      WHERE l.tenant_id=${w}::uuid AND l.branch_id=${b}::uuid AND (${self}::uuid IS NULL OR l.employee_id=${self??'00000000-0000-0000-0000-000000000000'}::uuid)
      ORDER BY l.created_at DESC LIMIT 1000`;
  }

  @Post('people/leave')
  @UseGuards(CsrfGuard)
  async createLeave(@Param('workspaceId') w:string,@Param('branchId') b:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'people.write'),v=obj(raw),employeeId=v.employeeId?uuid(v.employeeId,'Employee'):await this.employeeForActor(w,b,a.userId);
    if(!employeeId)throw new ForbiddenException('Your account is not linked to an employee record.');
    if(isEmployeeRole(a.role)&&employeeId!==await this.employeeForActor(w,b,a.userId))throw new ForbiddenException('You may submit leave only for yourself.');
    await this.assertEmployee(w,b,employeeId);
    const leaveType=enumValue(v.leaveType,'Leave type',['annual','sick','maternity_paternity','compassionate','unpaid','study','other']);
    const startsOn=date(v.startsOn,'Start date'),endsOn=date(v.endsOn,'End date');if(endsOn<startsOn)throw new BadRequestException('Leave end date cannot be before its start date.');
    const daysRequested=hours(v.daysRequested,'Days requested',366);if(daysRequested<=0)throw new BadRequestException('Days requested must be greater than zero.');
    const paid=v.paid===undefined?leaveType!=='unpaid':v.paid===true;
    const id=randomUUID(),requestNumber=`LR-${new Date().getFullYear()}-${id.slice(0,8).toUpperCase()}`;
    await this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM hr_employees WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${employeeId}::uuid FOR UPDATE`;
      const workdayRows=await tx.$queryRaw<any[]>`SELECT count(*)::int AS days FROM generate_series(${startsOn}::date,${endsOn}::date,interval '1 day') d WHERE extract(isodow FROM d)<6`;
      const availableWorkdays=Number(workdayRows[0]?.days??0);
      if(availableWorkdays===0||daysRequested>availableWorkdays)throw new BadRequestException('Requested leave days cannot exceed the weekday span of the selected dates.');
      const overlapping=await tx.$queryRaw<any[]>`SELECT id FROM hr_leave_requests WHERE tenant_id=${w}::uuid AND employee_id=${employeeId}::uuid AND status IN ('pending_approval','approved','taken') AND starts_on<=${endsOn}::date AND ends_on>=${startsOn}::date LIMIT 1`;
      if(overlapping.length)throw new ConflictException('This leave request overlaps an existing pending or approved leave period.');
      await tx.$executeRaw`INSERT INTO hr_leave_requests(id,tenant_id,branch_id,employee_id,request_number,leave_type,starts_on,ends_on,days_requested,paid,reason,handover_note,requested_by_user_id)
        VALUES(${id}::uuid,${w}::uuid,${b}::uuid,${employeeId}::uuid,${requestNumber},${leaveType},${startsOn}::date,${endsOn}::date,${daysRequested},${paid},${opt(v.reason,'Reason',2000)},${opt(v.handoverNote,'Handover note',2000)},${a.userId}::uuid)`;
      await this.mirror(tx,w,b,'leave',id,{id,leaveRequestNumber:requestNumber,employeeId,leaveType,startsOn,endsOn,daysRequested,paid,status:'Draft'});
      await this.audit(tx,w,b,a.userId,'people.leave.created','leave_request',id,{employeeId,leaveType,startsOn,endsOn,paid});
    });
    return {id,requestNumber,employeeId,leaveType,startsOn,endsOn,daysRequested,paid,status:'draft'};
  }

  @Post('people/leave/:leaveId/submit')
  @UseGuards(CsrfGuard)
  async submitLeave(@Param('workspaceId') w:string,@Param('branchId') b:string,@Param('leaveId') id:string,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'people.write');
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<any[]>`SELECT id,employee_id,request_number,leave_type,starts_on,ends_on,days_requested,paid,status FROM hr_leave_requests WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${id}::uuid FOR UPDATE`;
      const r=rows[0];if(!r)throw new NotFoundException('Leave request not found.');
      if(isEmployeeRole(a.role)){const own=await tx.$queryRaw<any[]>`SELECT id FROM hr_employees WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${r.employee_id}::uuid AND user_id=${a.userId}::uuid`;if(!own.length)throw new ForbiddenException('You may submit only your own leave request.');}
      if(r.status!=='draft')throw new ConflictException('Only draft leave requests can be submitted.');
      const approvalId=await this.createApproval(tx,w,b,a.userId,{ownerModule:'leave',ownerRecordId:id,title:`Leave request ${r.request_number}`,description:`${r.leave_type} leave, ${dateText(r.starts_on)} to ${dateText(r.ends_on)} (${r.days_requested} days)`,href:'/modules/leave'});
      await tx.$executeRaw`UPDATE hr_leave_requests SET status='pending_approval',submitted_at=now(),approval_record_id=${approvalId},updated_at=now() WHERE tenant_id=${w}::uuid AND id=${id}::uuid`;
      await this.mirror(tx,w,b,'leave',id,{id,leaveRequestNumber:r.request_number,employeeId:r.employee_id,leaveType:r.leave_type,startsOn:dateText(r.starts_on),endsOn:dateText(r.ends_on),daysRequested:Number(r.days_requested),paid:r.paid,status:'Requested'});
      await this.audit(tx,w,b,a.userId,'people.leave.submitted','leave_request',id,{approvalId});
      return {id,status:'pending_approval',approvalId};
    },{isolationLevel:'Serializable'});
  }

  @Get('people/timesheets')
  async timesheets(@Param('workspaceId') w:string,@Param('branchId') b:string,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'people.read'),self=isEmployeeRole(a.role)?await this.employeeForActor(w,b,a.userId):null;
    if(isEmployeeRole(a.role)&&!self)return [];
    const hrWide=hasPermission(a.role,'people.private.read');
    const projectScoped=!hrWide&&!isEmployeeRole(a.role)&&hasPermission(a.role,'projects.read');
    if(!hrWide&&!isEmployeeRole(a.role)&&!projectScoped)throw new ForbiddenException('Your role cannot read employee timesheets.');
    const projectManagerEmployeeId=projectScoped?await this.employeeForActor(w,b,a.userId):null;
    if(projectScoped&&!projectManagerEmployeeId)return [];
    return this.prisma.$queryRaw`SELECT t.id,t.employee_id AS "employeeId",e.employee_number AS "employeeNumber",e.full_name AS "employeeName",t.project_id AS "projectId",p.name AS "projectName",t.project_task_id AS "projectTaskId",t.timesheet_number AS "timesheetNumber",t.work_date AS "workDate",t.regular_hours AS "regularHours",t.overtime_hours AS "overtimeHours",t.billable_hours AS "billableHours",t.notes,t.status,t.submitted_at AS "submittedAt"
      FROM hr_timesheets t JOIN hr_employees e ON e.tenant_id=t.tenant_id AND e.id=t.employee_id LEFT JOIN projects p ON p.tenant_id=t.tenant_id AND p.id=t.project_id
      WHERE t.tenant_id=${w}::uuid AND t.branch_id=${b}::uuid
        AND (${self}::uuid IS NULL OR t.employee_id=${self??'00000000-0000-0000-0000-000000000000'}::uuid)
        AND (${!projectScoped}::boolean OR EXISTS(SELECT 1 FROM projects pm WHERE pm.tenant_id=t.tenant_id AND pm.branch_id=t.branch_id AND pm.id=t.project_id AND (pm.manager_employee_id=${projectManagerEmployeeId??'00000000-0000-0000-0000-000000000000'}::uuid OR EXISTS(SELECT 1 FROM project_tasks pt WHERE pt.tenant_id=pm.tenant_id AND pt.branch_id=pm.branch_id AND pt.project_id=pm.id AND pt.assigned_employee_id=${projectManagerEmployeeId??'00000000-0000-0000-0000-000000000000'}::uuid)))
      ORDER BY t.work_date DESC LIMIT 1000`;
  }

  @Post('people/timesheets')
  @UseGuards(CsrfGuard)
  async createTimesheet(@Param('workspaceId') w:string,@Param('branchId') b:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'people.write'),v=obj(raw),employeeId=v.employeeId?uuid(v.employeeId,'Employee'):await this.employeeForActor(w,b,a.userId);
    if(!employeeId)throw new ForbiddenException('Your account is not linked to an employee record.');
    if(isEmployeeRole(a.role)&&employeeId!==await this.employeeForActor(w,b,a.userId))throw new ForbiddenException('You may submit time only for yourself.');
    await this.assertEmployee(w,b,employeeId);
    const projectId=v.projectId?uuid(v.projectId,'Project'):null,taskId=v.projectTaskId?uuid(v.projectTaskId,'Project task'):null;
    if(taskId&&!projectId)throw new BadRequestException('Select the project that owns the project task.');
    if(projectId){const p=await this.prisma.$queryRaw<any[]>`SELECT id FROM projects WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${projectId}::uuid`;if(!p.length)throw new NotFoundException('Project not found.');}
    if(taskId){const t=await this.prisma.$queryRaw<any[]>`SELECT id,project_id FROM project_tasks WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${taskId}::uuid`;if(!t.length||projectId&&t[0].project_id!==projectId)throw new NotFoundException('Project task not found for the selected project.');}
    const workDate=date(v.workDate,'Work date'),regular=hours(v.regularHours,'Regular hours'),overtime=hours(v.overtimeHours??0,'Overtime hours'),billable=hours(v.billableHours??0,'Billable hours');
    if(regular+overtime>24||billable>regular+overtime)throw new BadRequestException('Timesheet total cannot exceed 24 hours; billable hours cannot exceed total hours.');
    const id=randomUUID(),number=`TIME-${new Date().getFullYear()}-${id.slice(0,8).toUpperCase()}`;
    await this.prisma.$transaction(async tx=>{
      const employeeRows=await tx.$queryRaw<any[]>`SELECT id,hire_date,termination_date FROM hr_employees
        WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${employeeId}::uuid FOR UPDATE`;
      const employee=employeeRows[0];
      if(!employee)throw new NotFoundException('Employee not found in this branch.');
      if(workDate<String(employee.hire_date).slice(0,10)||(employee.termination_date&&workDate>String(employee.termination_date).slice(0,10)))
        throw new BadRequestException('Timesheets must fall within the employee employment dates.');
      const dailyRows=await tx.$queryRaw<any[]>`SELECT COALESCE(sum(regular_hours+overtime_hours),0)::numeric AS hours
        FROM hr_timesheets WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND employee_id=${employeeId}::uuid
          AND work_date=${workDate}::date AND status<>'rejected'`;
      if(Number(dailyRows[0]?.hours??0)+regular+overtime>24)
        throw new ConflictException('An employee cannot record more than 24 regular and overtime hours across all timesheets for one day.');
      await tx.$executeRaw`INSERT INTO hr_timesheets(id,tenant_id,branch_id,employee_id,project_id,project_task_id,timesheet_number,work_date,regular_hours,overtime_hours,billable_hours,notes,submitted_by_user_id)
        VALUES(${id}::uuid,${w}::uuid,${b}::uuid,${employeeId}::uuid,${projectId}::uuid,${taskId}::uuid,${number},${workDate}::date,${regular},${overtime},${billable},${opt(v.notes,'Notes',2000)},${a.userId}::uuid)`;
      await this.mirror(tx,w,b,'timesheets',id,{id,timesheetNumber:number,employeeId,projectId,projectTaskId:taskId,workDate,regularHours:regular,overtimeHours:overtime,billableHours:billable,status:'Draft'});
      if(projectId)await this.link(tx,w,b,a.userId,'timesheets',id,'projects',projectId,'project_time');
      await this.audit(tx,w,b,a.userId,'people.timesheet.created','timesheet',id,{employeeId,projectId,workDate,regularHours:regular,overtimeHours:overtime});
    });
    return {id,timesheetNumber:number,employeeId,projectId,projectTaskId:taskId,workDate,regularHours:regular,overtimeHours:overtime,billableHours:billable,status:'draft'};
  }

  @Post('people/timesheets/:timesheetId/submit')
  @UseGuards(CsrfGuard)
  async submitTimesheet(@Param('workspaceId') w:string,@Param('branchId') b:string,@Param('timesheetId') id:string,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'people.write');
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<any[]>`SELECT id,employee_id,timesheet_number,work_date,regular_hours,overtime_hours,project_id,status FROM hr_timesheets WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${id}::uuid FOR UPDATE`;
      const r=rows[0];if(!r)throw new NotFoundException('Timesheet not found.');
      if(isEmployeeRole(a.role)){const own=await tx.$queryRaw<any[]>`SELECT id FROM hr_employees WHERE tenant_id=${w}::uuid AND id=${r.employee_id}::uuid AND user_id=${a.userId}::uuid`;if(!own.length)throw new ForbiddenException('You may submit only your own timesheet.');}
      if(r.status!=='draft')throw new ConflictException('Only draft timesheets can be submitted.');
      const approvalId=await this.createApproval(tx,w,b,a.userId,{ownerModule:'timesheets',ownerRecordId:id,title:`Timesheet ${r.timesheet_number}`,description:`${dateText(r.work_date)} · ${Number(r.regular_hours)+Number(r.overtime_hours)} hours`,href:'/modules/timesheets'});
      await tx.$executeRaw`UPDATE hr_timesheets SET status='pending_approval',submitted_by_user_id=${a.userId}::uuid,submitted_at=now(),approval_record_id=${approvalId},updated_at=now() WHERE tenant_id=${w}::uuid AND id=${id}::uuid`;
      await this.mirror(tx,w,b,'timesheets',id,{id,timesheetNumber:r.timesheet_number,workDate:dateText(r.work_date),regularHours:Number(r.regular_hours),overtimeHours:Number(r.overtime_hours),status:'Submitted'});
      await this.audit(tx,w,b,a.userId,'people.timesheet.submitted','timesheet',id,{approvalId});
      return {id,status:'pending_approval',approvalId};
    },{isolationLevel:'Serializable'});
  }

  @Get('people/payroll/runs')
  async payrollRuns(@Param('workspaceId') w:string,@Param('branchId') b:string,@Req() req:FastifyRequest) {
    await this.actor(req,w,b,'payroll.read');
    return this.prisma.$queryRaw`SELECT id,run_number AS "runNumber",period_start AS "periodStart",period_end AS "periodEnd",currency,status,gross_minor AS "grossMinor",deductions_minor AS "deductionsMinor",net_minor AS "netMinor",calculated_at AS "calculatedAt",approved_at AS "approvedAt",paid_at AS "paidAt",payment_reference AS "paymentReference"
      FROM hr_payroll_runs WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid ORDER BY period_start DESC LIMIT 100`;
  }

  @Post('people/payroll/runs')
  @UseGuards(CsrfGuard)
  async createPayrollRun(@Param('workspaceId') w:string,@Param('branchId') b:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'payroll.write'),v=obj(raw),start=date(v.periodStart,'Period start'),end=date(v.periodEnd,'Period end');
    if(end<start)throw new BadRequestException('Payroll period end cannot precede its start.');
    const d1=new Date(`${start}T00:00:00Z`),d2=new Date(`${end}T00:00:00Z`);
    if(d1.getUTCFullYear()!==d2.getUTCFullYear()||d1.getUTCMonth()!==d2.getUTCMonth())throw new BadRequestException('A payroll run must cover one calendar month only.');
    const currency=str(v.currency??'UGX','Currency',3).toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw new BadRequestException('Currency must be a valid three-letter code.');
    const id=randomUUID(),number=`PAYRUN-${start.slice(0,7).replace('-','')}-${id.slice(0,6).toUpperCase()}`;
    await this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`INSERT INTO hr_payroll_runs(id,tenant_id,branch_id,run_number,period_start,period_end,currency,created_by_user_id)
        VALUES(${id}::uuid,${w}::uuid,${b}::uuid,${number},${start}::date,${end}::date,${currency},${a.userId}::uuid)`;
      await this.mirror(tx,w,b,'payroll',id,{id,payrollReference:number,periodStart:start,periodEnd:end,status:'Draft'});
      await this.audit(tx,w,b,a.userId,'people.payroll.run_created','payroll_run',id,{periodStart:start,periodEnd:end,currency});
    });
    return {id,runNumber:number,periodStart:start,periodEnd:end,currency,status:'draft',grossMinor:'0',deductionsMinor:'0',netMinor:'0'};
  }

  @Post('people/payroll/runs/:runId/calculate')
  @UseGuards(CsrfGuard)
  async calculatePayroll(@Param('workspaceId') w:string,@Param('branchId') b:string,@Param('runId') id:string,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'payroll.write');
    return this.prisma.$transaction(async tx=>{
      const runs=await tx.$queryRaw<any[]>`SELECT id,run_number,period_start,period_end,currency,status FROM hr_payroll_runs WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${id}::uuid FOR UPDATE`;
      const run=runs[0];if(!run)throw new NotFoundException('Payroll run not found.');
      if(!['draft','calculated'].includes(run.status))throw new ConflictException('Only draft or calculated payroll runs can be recalculated.');
      const deductions=await tx.$queryRaw<any[]>`SELECT 1 FROM hr_payroll_deductions d JOIN hr_payroll_lines l ON l.tenant_id=d.tenant_id AND l.id=d.payroll_line_id WHERE l.tenant_id=${w}::uuid AND l.payroll_run_id=${id}::uuid LIMIT 1`;
      if(deductions.length)throw new ConflictException('This payroll run has deductions. Create a new run revision instead of recalculating and removing recorded deductions.');
      const start=dateText(run.period_start),end=dateText(run.period_end);
      const dayCounts=await tx.$queryRaw<any[]>`SELECT
        (SELECT count(*)::int FROM generate_series(${start}::date,${end}::date,interval '1 day') d WHERE extract(isodow from d)<6) AS period_workdays,
        (SELECT count(*)::int FROM generate_series(date_trunc('month',${start}::date)::date,(date_trunc('month',${start}::date)+interval '1 month - 1 day')::date,interval '1 day') d WHERE extract(isodow from d)<6) AS month_workdays`;
      const periodWorkdays=Math.max(1,Number(dayCounts[0].period_workdays)),monthWorkdays=Math.max(1,Number(dayCounts[0].month_workdays));
      const missingComp=await tx.$queryRaw<any[]>`SELECT e.employee_number FROM hr_employees e WHERE e.tenant_id=${w}::uuid AND e.branch_id=${b}::uuid AND e.hire_date<=${end}::date AND (e.termination_date IS NULL OR e.termination_date>=${start}::date) AND e.employment_status IN ('active','on_leave') AND NOT EXISTS(SELECT 1 FROM hr_employee_compensation c WHERE c.tenant_id=e.tenant_id AND c.employee_id=e.id AND c.effective_from<=${start}::date AND (c.effective_to IS NULL OR c.effective_to>=${end}::date))`;
      if(missingComp.length)throw new ConflictException({code:'PAYROLL_COMPENSATION_MISSING',message:'Every active employee needs an effective-dated compensation record before payroll can be calculated.',employeeNumbers:missingComp.map(r=>r.employee_number)});
      const currencyMismatches=await tx.$queryRaw<any[]>`SELECT DISTINCT c.currency FROM hr_employees e JOIN hr_employee_compensation c ON c.tenant_id=e.tenant_id AND c.employee_id=e.id WHERE e.tenant_id=${w}::uuid AND e.branch_id=${b}::uuid AND e.hire_date<=${end}::date AND (e.termination_date IS NULL OR e.termination_date>=${start}::date) AND e.employment_status IN ('active','on_leave') AND c.effective_from<=${start}::date AND (c.effective_to IS NULL OR c.effective_to>=${end}::date) AND c.currency<>${run.currency}::char(3)`;
      if(currencyMismatches.length)throw new ConflictException({code:'PAYROLL_CURRENCY_MISMATCH',message:'All employee compensation for one payroll run must use the payroll run currency.',currencies:currencyMismatches.map(r=>r.currency)});
      const employees=await tx.$queryRaw<any[]>`SELECT e.id,e.full_name,e.hire_date,e.termination_date,e.employment_type,c.pay_basis,c.pay_frequency,c.base_pay_minor,c.hourly_rate_minor,c.overtime_multiplier,c.currency,
          COALESCE(CASE WHEN sh.id IS NULL THEN 8 ELSE GREATEST(0,MOD(EXTRACT(EPOCH FROM (sh.ends_at-sh.starts_at))+86400,86400)/3600-sh.break_minutes/60.0) END,8)::numeric AS scheduled_day_hours
        FROM hr_employees e JOIN LATERAL (SELECT * FROM hr_employee_compensation c WHERE c.tenant_id=e.tenant_id AND c.employee_id=e.id AND c.effective_from<=${start}::date AND (c.effective_to IS NULL OR c.effective_to>=${end}::date) ORDER BY c.effective_from DESC LIMIT 1) c ON true
        LEFT JOIN LATERAL (
          SELECT s.id,s.starts_at,s.ends_at,s.break_minutes FROM hr_employee_shift_assignments a
          JOIN hr_shifts s ON s.tenant_id=a.tenant_id AND s.branch_id=a.branch_id AND s.id=a.shift_id
          WHERE a.tenant_id=e.tenant_id AND a.branch_id=e.branch_id AND a.employee_id=e.id
            AND a.starts_on<=${end}::date AND (a.ends_on IS NULL OR a.ends_on>=${start}::date)
          ORDER BY a.starts_on DESC LIMIT 1
        ) sh ON true
        WHERE e.tenant_id=${w}::uuid AND e.branch_id=${b}::uuid AND e.hire_date<=${end}::date AND (e.termination_date IS NULL OR e.termination_date>=${start}::date) AND e.employment_status IN ('active','on_leave')
        ORDER BY e.full_name`;
      await tx.$executeRaw`DELETE FROM hr_payroll_lines WHERE tenant_id=${w}::uuid AND payroll_run_id=${id}::uuid`;
      let totalGross=0n,totalNet=0n;
      for(const employee of employees){
        const empStart=employee.hire_date>run.period_start?dateText(employee.hire_date):start;
        const empEnd=employee.termination_date&&employee.termination_date<run.period_end?dateText(employee.termination_date):end;
        const activeCountRows=await tx.$queryRaw<any[]>`SELECT count(*)::int AS n FROM generate_series(${empStart}::date,${empEnd}::date,interval '1 day') d WHERE extract(isodow from d)<6`;
        const activeWorkdays=Math.max(0,Number(activeCountRows[0]?.n??0));
        const unpaidRows=await tx.$queryRaw<any[]>`SELECT COALESCE(sum(l.days_requested *
            ((SELECT count(*) FROM generate_series(GREATEST(l.starts_on,${start}::date,${empStart}::date),LEAST(l.ends_on,${end}::date,${empEnd}::date),interval '1 day') d WHERE extract(isodow from d)<6)::numeric /
             NULLIF((SELECT count(*) FROM generate_series(l.starts_on,l.ends_on,interval '1 day') d WHERE extract(isodow from d)<6),0)),0)::numeric AS days
          FROM hr_leave_requests l WHERE l.tenant_id=${w}::uuid AND l.employee_id=${employee.id}::uuid AND l.status='approved' AND l.paid=false AND l.starts_on<=${end}::date AND l.ends_on>=${start}::date`;
        const paidRows=await tx.$queryRaw<any[]>`SELECT COALESCE(sum(l.days_requested *
            ((SELECT count(*) FROM generate_series(GREATEST(l.starts_on,${start}::date,${empStart}::date),LEAST(l.ends_on,${end}::date,${empEnd}::date),interval '1 day') d WHERE extract(isodow from d)<6)::numeric /
             NULLIF((SELECT count(*) FROM generate_series(l.starts_on,l.ends_on,interval '1 day') d WHERE extract(isodow from d)<6),0)),0)::numeric AS days
          FROM hr_leave_requests l WHERE l.tenant_id=${w}::uuid AND l.employee_id=${employee.id}::uuid AND l.status='approved' AND l.paid=true AND l.starts_on<=${end}::date AND l.ends_on>=${start}::date`;
        const unpaidDays=Math.min(activeWorkdays,Number(unpaidRows[0]?.days??0)),paidDays=Number(paidRows[0]?.days??0);
        const absenceRows=await tx.$queryRaw<any[]>`SELECT count(*)::int AS days FROM hr_attendance a WHERE a.tenant_id=${w}::uuid AND a.employee_id=${employee.id}::uuid AND a.attendance_date BETWEEN ${empStart}::date AND ${empEnd}::date AND a.status='absent' AND a.reviewed_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hr_leave_requests l WHERE l.tenant_id=a.tenant_id AND l.employee_id=a.employee_id AND l.status='approved' AND a.attendance_date BETWEEN l.starts_on AND l.ends_on)`;
        const approvedAbsenceDays=Math.max(0,Number(absenceRows[0]?.days??0));
        let regularHours=0,overtimeHours=0,approvedPaidLeaveHours=0,gross=0n;
        if(employee.pay_basis==='hourly'){
          const ts=await tx.$queryRaw<any[]>`SELECT COALESCE(sum(regular_hours),0)::numeric AS regular,COALESCE(sum(overtime_hours),0)::numeric AS overtime FROM hr_timesheets
            WHERE tenant_id=${w}::uuid AND employee_id=${employee.id}::uuid AND status='approved' AND work_date BETWEEN ${start}::date AND ${end}::date`;
          regularHours=Number(ts[0]?.regular??0);overtimeHours=Number(ts[0]?.overtime??0);
          const baseRate=BigInt(employee.hourly_rate_minor);
          approvedPaidLeaveHours=Math.round(paidDays*Number(employee.scheduled_day_hours)*100)/100;
          const regularMinor=BigInt(Math.round(regularHours*100))*baseRate/100n;
          const overtimeMinor=BigInt(Math.round(overtimeHours*100))*baseRate*BigInt(Math.round(Number(employee.overtime_multiplier)*100))/10000n;
          const paidLeaveMinor=BigInt(Math.round(approvedPaidLeaveHours*100))*baseRate/100n;
          gross=regularMinor+overtimeMinor+paidLeaveMinor;
        } else {
          const payableDays=Math.max(0,Math.min(activeWorkdays,periodWorkdays)-unpaidDays-approvedAbsenceDays);
          const payableDayHundredths=BigInt(Math.max(0,Math.round(payableDays*100)));
          // Keep intermediate precision in integer minor units and round once at the end.
          gross=(BigInt(employee.base_pay_minor)*payableDayHundredths)/BigInt(monthWorkdays*100);
        }
        const lineId=randomUUID();
        const payableDaysSnapshot=employee.pay_basis==='monthly'?Math.max(0,Math.min(activeWorkdays,periodWorkdays)-unpaidDays-approvedAbsenceDays):null;
        const snapshot={periodStart:start,periodEnd:end,payBasis:employee.pay_basis,payFrequency:employee.pay_frequency,approvedTimesheetsOnly:true,approvedLeaveOnly:true,reviewedAbsenceOnly:true,
          fullMonthWorkdays:monthWorkdays,activePeriodWorkdays:activeWorkdays,unpaidLeaveWorkdays:unpaidDays,paidLeaveWorkdays:paidDays,approvedAbsenceDays,monthlyPayableDays:payableDaysSnapshot,
          regularHours,overtimeHours,approvedPaidLeaveHours,scheduledDayHours:Number(employee.scheduled_day_hours),currency:employee.currency};
        await tx.$executeRaw`INSERT INTO hr_payroll_lines(id,tenant_id,branch_id,payroll_run_id,employee_id,pay_basis,base_pay_minor,regular_hours,overtime_hours,approved_paid_leave_days,approved_unpaid_leave_days,approved_absence_days,approved_paid_leave_hours,gross_minor,deductions_minor,net_minor,calculation_snapshot)
          VALUES(${lineId}::uuid,${w}::uuid,${b}::uuid,${id}::uuid,${employee.id}::uuid,${employee.pay_basis},${employee.base_pay_minor??0}::bigint,${regularHours},${overtimeHours},${paidDays},${unpaidDays},${approvedAbsenceDays},${approvedPaidLeaveHours},${gross}::bigint,0,${gross}::bigint,${JSON.stringify(snapshot)}::jsonb)`;
        totalGross+=gross;totalNet+=gross;
      }
      if(!employees.length)throw new ConflictException('No active employees with compensation were found for this payroll period.');
      await tx.$executeRaw`UPDATE hr_payroll_runs SET status='calculated',gross_minor=${totalGross}::bigint,deductions_minor=0,net_minor=${totalNet}::bigint,calculated_by_user_id=${a.userId}::uuid,calculated_at=now(),updated_at=now() WHERE tenant_id=${w}::uuid AND id=${id}::uuid`;
      await this.mirror(tx,w,b,'payroll',id,{id,payrollReference:run.run_number,periodStart:start,periodEnd:end,status:'Calculated',employeeCount:employees.length});
      await this.audit(tx,w,b,a.userId,'people.payroll.calculated','payroll_run',id,{employeeCount:employees.length,grossMinor:String(totalGross),payrollSource:'approved attendance/leave/timesheets only'});
      return {id,status:'calculated',employeeCount:employees.length,grossMinor:String(totalGross),deductionsMinor:'0',netMinor:String(totalNet)};
    },{isolationLevel:'Serializable'});
  }

  @Get('people/payroll/runs/:runId/lines')
  async payrollLines(@Param('workspaceId') w:string,@Param('branchId') b:string,@Param('runId') id:string,@Req() req:FastifyRequest) {
    await this.actor(req,w,b,'payroll.read');
    const rows=await this.prisma.$queryRaw<any[]>`SELECT l.id,l.employee_id AS "employeeId",e.employee_number AS "employeeNumber",e.full_name AS "employeeName",l.pay_basis AS "payBasis",l.base_pay_minor AS "basePayMinor",l.regular_hours AS "regularHours",l.overtime_hours AS "overtimeHours",l.approved_paid_leave_days AS "approvedPaidLeaveDays",l.approved_unpaid_leave_days AS "approvedUnpaidLeaveDays",l.approved_absence_days AS "approvedAbsenceDays",l.approved_paid_leave_hours AS "approvedPaidLeaveHours",l.gross_minor AS "grossMinor",l.deductions_minor AS "deductionsMinor",l.net_minor AS "netMinor",l.calculation_snapshot AS "calculationSnapshot"
      FROM hr_payroll_lines l JOIN hr_employees e ON e.tenant_id=l.tenant_id AND e.id=l.employee_id WHERE l.tenant_id=${w}::uuid AND l.payroll_run_id=${id}::uuid
        AND EXISTS(SELECT 1 FROM hr_payroll_runs r WHERE r.tenant_id=l.tenant_id AND r.id=l.payroll_run_id AND r.branch_id=${b}::uuid)
      ORDER BY e.full_name`;
    return rows.map(r=>({...r,basePayMinor:String(r.basePayMinor),grossMinor:String(r.grossMinor),deductionsMinor:String(r.deductionsMinor),netMinor:String(r.netMinor),regularHours:Number(r.regularHours),overtimeHours:Number(r.overtimeHours),approvedPaidLeaveDays:Number(r.approvedPaidLeaveDays),approvedUnpaidLeaveDays:Number(r.approvedUnpaidLeaveDays),approvedAbsenceDays:Number(r.approvedAbsenceDays),approvedPaidLeaveHours:Number(r.approvedPaidLeaveHours)}));
  }

  @Post('people/payroll/runs/:runId/deductions')
  @UseGuards(CsrfGuard)
  async addPayrollDeduction(@Param('workspaceId') w:string,@Param('branchId') b:string,@Param('runId') id:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'payroll.write'),v=obj(raw),employeeId=uuid(v.employeeId,'Employee'),amount=integer(v.amountMinor,'Deduction amount',1),category=str(v.category,'Deduction category',80),description=str(v.description,'Description',300);
    return this.prisma.$transaction(async tx=>{
      const run=await tx.$queryRaw<any[]>`SELECT status FROM hr_payroll_runs WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${id}::uuid FOR UPDATE`;
      if(!run.length)throw new NotFoundException('Payroll run not found.');if(run[0].status!=='calculated')throw new ConflictException('Deductions can be changed only on a calculated payroll run.');
      const lines=await tx.$queryRaw<any[]>`SELECT id,gross_minor,deductions_minor FROM hr_payroll_lines WHERE tenant_id=${w}::uuid AND payroll_run_id=${id}::uuid AND employee_id=${employeeId}::uuid FOR UPDATE`;
      const line=lines[0];if(!line)throw new NotFoundException('Employee has no line in this payroll run.');
      const newDeduction=BigInt(line.deductions_minor)+BigInt(amount);if(newDeduction>BigInt(line.gross_minor))throw new BadRequestException('Total deductions cannot exceed gross pay.');
      await tx.$executeRaw`INSERT INTO hr_payroll_deductions(id,tenant_id,branch_id,payroll_line_id,category,description,amount_minor,reference,created_by_user_id)
        VALUES(${randomUUID()}::uuid,${w}::uuid,${b}::uuid,${line.id}::uuid,${category},${description},${amount}::bigint,${opt(v.reference,'Reference',120)},${a.userId}::uuid)`;
      await tx.$executeRaw`UPDATE hr_payroll_lines SET deductions_minor=${newDeduction}::bigint,net_minor=gross_minor-${newDeduction}::bigint WHERE tenant_id=${w}::uuid AND id=${line.id}::uuid`;
      const totals=await tx.$queryRaw<any[]>`SELECT COALESCE(sum(gross_minor),0)::bigint AS gross,COALESCE(sum(deductions_minor),0)::bigint AS deductions,COALESCE(sum(net_minor),0)::bigint AS net FROM hr_payroll_lines WHERE tenant_id=${w}::uuid AND payroll_run_id=${id}::uuid`;
      await tx.$executeRaw`UPDATE hr_payroll_runs SET gross_minor=${totals[0].gross}::bigint,deductions_minor=${totals[0].deductions}::bigint,net_minor=${totals[0].net}::bigint,updated_at=now() WHERE tenant_id=${w}::uuid AND id=${id}::uuid`;
      await this.audit(tx,w,b,a.userId,'people.payroll.deduction_added','payroll_run',id,{employeeId,category,amountMinor:amount});
      return {payrollRunId:id,employeeId,grossMinor:String(totals[0].gross),deductionsMinor:String(totals[0].deductions),netMinor:String(totals[0].net)};
    },{isolationLevel:'Serializable'});
  }

  @Post('people/payroll/runs/:runId/submit')
  @UseGuards(CsrfGuard)
  async submitPayroll(@Param('workspaceId') w:string,@Param('branchId') b:string,@Param('runId') id:string,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'payroll.write');
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<any[]>`SELECT id,run_number,status,gross_minor,deductions_minor,net_minor FROM hr_payroll_runs WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${id}::uuid FOR UPDATE`;
      const r=rows[0];if(!r)throw new NotFoundException('Payroll run not found.');if(r.status!=='calculated')throw new ConflictException('Calculate the payroll run before requesting approval.');
      const approvalId=await this.createApproval(tx,w,b,a.userId,{ownerModule:'payroll',ownerRecordId:id,title:`Payroll ${r.run_number}`,description:`Payroll ${r.run_number} is ready for authorized review.`,href:'/modules/payroll'});
      await tx.$executeRaw`UPDATE hr_payroll_runs SET status='pending_approval',submitted_by_user_id=${a.userId}::uuid,approval_record_id=${approvalId},updated_at=now() WHERE tenant_id=${w}::uuid AND id=${id}::uuid`;
      await this.mirror(tx,w,b,'payroll',id,{id,payrollReference:r.run_number,status:'Review'});
      await this.audit(tx,w,b,a.userId,'people.payroll.submitted','payroll_run',id,{approvalId,netMinor:String(r.net_minor)});
      return {id,status:'pending_approval',approvalId};
    },{isolationLevel:'Serializable'});
  }

  @Post('people/payroll/runs/:runId/payment')
  @UseGuards(CsrfGuard)
  async recordPayrollPayment(@Param('workspaceId') w:string,@Param('branchId') b:string,@Param('runId') id:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'payroll.write'),v=obj(raw),reference=str(v.paymentReference,'Payment reference',120),paidAt=v.paidAt?new Date(str(v.paidAt,'Payment date',50)):new Date();
    if(Number.isNaN(paidAt.getTime()))throw new BadRequestException('Payment date is invalid.');
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<any[]>`UPDATE hr_payroll_runs SET status='paid',payment_reference=${reference},paid_by_user_id=${a.userId}::uuid,paid_at=${paidAt},updated_at=now()
        WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${id}::uuid AND status='approved'
        RETURNING id,run_number,net_minor`;
      const r=rows[0];if(!r){const exists=await tx.$queryRaw<any[]>`SELECT status FROM hr_payroll_runs WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${id}::uuid`;if(!exists.length)throw new NotFoundException('Payroll run not found.');throw new ConflictException('Only an approved payroll run can be recorded as paid.');}
      await this.mirror(tx,w,b,'payroll',id,{id,payrollReference:r.run_number,status:'Paid'});
      await this.audit(tx,w,b,a.userId,'people.payroll.payment_recorded','payroll_run',id,{paymentReference:reference,netMinor:String(r.net_minor)});
      return {id,status:'paid',paymentReference:reference,paidAt:paidAt.toISOString(),netMinor:String(r.net_minor)};
    },{isolationLevel:'Serializable'});
  }

  @Get('projects')
  async listProjects(@Param('workspaceId') w:string,@Param('branchId') b:string,@Req() req:FastifyRequest) {
    await this.actor(req,w,b,'projects.read');
    return this.prisma.$queryRaw`SELECT p.id,p.project_code AS "projectCode",p.name,p.description,p.customer_record_id AS "customerRecordId",p.manager_employee_id AS "managerEmployeeId",e.full_name AS "managerName",p.starts_on AS "startsOn",p.ends_on AS "endsOn",p.budget_minor AS "budgetMinor",p.currency,p.status,
      COALESCE((SELECT sum(c.cost_minor) FROM project_cost_entries c WHERE c.tenant_id=p.tenant_id AND c.project_id=p.id),0)::bigint AS "actualCostMinor"
      FROM projects p LEFT JOIN hr_employees e ON e.tenant_id=p.tenant_id AND e.id=p.manager_employee_id
      WHERE p.tenant_id=${w}::uuid AND p.branch_id=${b}::uuid ORDER BY p.created_at DESC LIMIT 500`;
  }

  @Post('projects')
  @UseGuards(CsrfGuard)
  async createProject(@Param('workspaceId') w:string,@Param('branchId') b:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'projects.write'),v=obj(raw),id=randomUUID(),code=str(v.projectCode,'Project code',40),name=str(v.name,'Project name',160);
    const customerId=v.customerRecordId?str(v.customerRecordId,'Customer record',160):null;if(customerId)await this.assertModuleRecord(w,b,'customers',customerId);
    const managerId=v.managerEmployeeId?uuid(v.managerEmployeeId,'Project manager'):null;if(managerId)await this.assertEmployee(w,b,managerId);
    const startsOn=v.startsOn?date(v.startsOn,'Start date'):null,endsOn=v.endsOn?date(v.endsOn,'End date'):null;if(startsOn&&endsOn&&endsOn<startsOn)throw new BadRequestException('Project end date cannot precede start date.');
    const budget=integer(v.budgetMinor??0,'Budget'),currency=str(v.currency??'UGX','Currency',3).toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw new BadRequestException('Currency must be a three-letter ISO code.');
    await this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`INSERT INTO projects(id,tenant_id,branch_id,project_code,name,description,customer_record_id,manager_employee_id,starts_on,ends_on,budget_minor,currency,created_by_user_id)
        VALUES(${id}::uuid,${w}::uuid,${b}::uuid,${code},${name},${opt(v.description,'Description',4000)},${customerId},${managerId}::uuid,${startsOn}::date,${endsOn}::date,${budget}::bigint,${currency},${a.userId}::uuid)`;
      await this.mirror(tx,w,b,'projects',id,{id,projectCode:code,name,description:opt(v.description,'Description',4000),customerRecordId:customerId,managerEmployeeId:managerId,startsOn,endsOn,budgetMinor:String(budget),currency,status:'Planning'});
      if(customerId)await this.link(tx,w,b,a.userId,'projects',id,'customers',customerId,'project_customer');
      await this.audit(tx,w,b,a.userId,'projects.created','project',id,{projectCode:code,customerRecordId:customerId});
    });
    return {id,projectCode:code,name,customerRecordId:customerId,managerEmployeeId:managerId,startsOn,endsOn,budgetMinor:String(budget),currency,status:'planning'};
  }

  @Get('projects/:projectId/tasks')
  async projectTasks(@Param('workspaceId') w:string,@Param('branchId') b:string,@Param('projectId') projectId:string,@Req() req:FastifyRequest) {
    await this.actor(req,w,b,'projects.read');
    return this.prisma.$queryRaw`SELECT t.id,t.task_code AS "taskCode",t.title,t.description,t.assigned_employee_id AS "assignedEmployeeId",e.full_name AS "assignedEmployeeName",t.due_at AS "dueAt",t.status FROM project_tasks t LEFT JOIN hr_employees e ON e.tenant_id=t.tenant_id AND e.id=t.assigned_employee_id WHERE t.tenant_id=${w}::uuid AND t.branch_id=${b}::uuid AND t.project_id=${projectId}::uuid ORDER BY t.due_at NULLS LAST,t.created_at DESC`;
  }

  @Post('projects/:projectId/tasks')
  @UseGuards(CsrfGuard)
  async createProjectTask(@Param('workspaceId') w:string,@Param('branchId') b:string,@Param('projectId') projectId:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'projects.write'),v=obj(raw);const p=await this.prisma.$queryRaw<any[]>`SELECT id FROM projects WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${projectId}::uuid`;if(!p.length)throw new NotFoundException('Project not found.');
    const id=randomUUID(),taskCode=str(v.taskCode,'Task code',40),title=str(v.title,'Task title',160),assigned=v.assignedEmployeeId?uuid(v.assignedEmployeeId,'Assignee'):null;if(assigned)await this.assertEmployee(w,b,assigned);
    const due=v.dueAt?date(v.dueAt,'Due date'):null;
    await this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`INSERT INTO project_tasks(id,tenant_id,branch_id,project_id,task_code,title,description,assigned_employee_id,due_at,created_by_user_id)
        VALUES(${id}::uuid,${w}::uuid,${b}::uuid,${projectId}::uuid,${taskCode},${title},${opt(v.description,'Description',2000)},${assigned}::uuid,${due}::date,${a.userId}::uuid)`;
      await this.mirror(tx,w,b,'project-tasks',id,{id,taskCode,title,projectId,assignedEmployeeId:assigned,dueAt:due,status:'Open'});
      await this.link(tx,w,b,a.userId,'projects',projectId,'project-tasks',id,'project_task');
      if(assigned){const emp=await tx.$queryRaw<any[]>`SELECT user_id FROM hr_employees WHERE tenant_id=${w}::uuid AND id=${assigned}::uuid`;if(emp[0]?.user_id)await this.link(tx,w,b,a.userId,'project-tasks',id,'employees',assigned,'assigned_employee');}
      await this.audit(tx,w,b,a.userId,'projects.task_created','project_task',id,{projectId,assignedEmployeeId:assigned});
    });
    return {id,taskCode,title,projectId,assignedEmployeeId:assigned,dueAt:due,status:'open'};
  }

  @Get('projects/:projectId/costs')
  async projectCosts(@Param('workspaceId') w:string,@Param('branchId') b:string,@Param('projectId') projectId:string,@Req() req:FastifyRequest) {
    await this.actor(req,w,b,'projects.read');
    return this.prisma.$queryRaw`SELECT id,source_type AS "sourceType",source_id AS "sourceId",category,description,cost_minor AS "costMinor",currency,cost_date AS "costDate",created_at AS "createdAt" FROM project_cost_entries WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND project_id=${projectId}::uuid ORDER BY cost_date DESC,created_at DESC`;
  }

  @Post('projects/:projectId/costs')
  @UseGuards(CsrfGuard)
  async addProjectCost(@Param('workspaceId') w:string,@Param('branchId') b:string,@Param('projectId') projectId:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'projects.write'),v=obj(raw);const project=await this.prisma.$queryRaw<any[]>`SELECT currency FROM projects WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${projectId}::uuid`;if(!project.length)throw new NotFoundException('Project not found.');
    const id=randomUUID(),category=str(v.category,'Cost category',80),description=str(v.description,'Description',500),amount=integer(v.costMinor,'Cost amount'),costDate=date(v.costDate,'Cost date'),reference=opt(v.reference,'Reference',120);
    await this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`INSERT INTO project_cost_entries(id,tenant_id,branch_id,project_id,source_type,source_id,category,description,cost_minor,currency,cost_date,created_by_user_id)
        VALUES(${id}::uuid,${w}::uuid,${b}::uuid,${projectId}::uuid,'manual',${id},${category},${description},${amount}::bigint,${project[0].currency},${costDate}::date,${a.userId}::uuid)`;
      await this.mirror(tx,w,b,'project-costs',id,{id,projectId,category,description,costMinor:String(amount),costDate,reference});
      await this.link(tx,w,b,a.userId,'projects',projectId,'project-costs',id,'project_cost');
      await this.audit(tx,w,b,a.userId,'projects.cost_created','project_cost',id,{projectId,category,costMinor:amount,reference});
    });
    return {id,projectId,category,description,costMinor:String(amount),currency:project[0].currency,costDate};
  }

  @Get('support/cases')
  async supportCases(@Param('workspaceId') w:string,@Param('branchId') b:string,@Req() req:FastifyRequest) {
    await this.actor(req,w,b,'support.read');
    return this.prisma.$queryRaw`SELECT c.id,c.case_number AS "caseNumber",c.customer_record_id AS "customerRecordId",c.task_record_id AS "taskRecordId",c.assigned_employee_id AS "assignedEmployeeId",e.full_name AS "assignedEmployeeName",c.subject,c.description,c.channel,c.category,c.priority,c.status,c.response_due_at AS "responseDueAt",c.resolution,c.resolved_at AS "resolvedAt",c.closed_at AS "closedAt",c.created_at AS "createdAt"
      FROM support_cases c LEFT JOIN hr_employees e ON e.tenant_id=c.tenant_id AND e.id=c.assigned_employee_id WHERE c.tenant_id=${w}::uuid AND c.branch_id=${b}::uuid ORDER BY CASE c.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,c.created_at DESC LIMIT 1000`;
  }

  @Post('support/cases')
  @UseGuards(CsrfGuard)
  async createSupportCase(@Param('workspaceId') w:string,@Param('branchId') b:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'support.write'),v=obj(raw),id=randomUUID(),customerId=v.customerRecordId?str(v.customerRecordId,'Customer record',160):null,taskId=v.taskRecordId?str(v.taskRecordId,'Task record',160):null,assigned=v.assignedEmployeeId?uuid(v.assignedEmployeeId,'Assignee'):null;
    if(customerId)await this.assertModuleRecord(w,b,'customers',customerId);
    if(taskId){const exists=await this.prisma.$queryRaw<any[]>`SELECT id FROM module_records WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND module_id IN ('tasks','project-tasks') AND record_id=${taskId} LIMIT 1`;if(!exists.length)throw new NotFoundException('Linked task record was not found.');}
    if(assigned)await this.assertEmployee(w,b,assigned);
    const subject=str(v.subject,'Subject',180),description=opt(v.description,'Description',5000),channel=enumValue(v.channel,'Channel',['phone','email','in_person','website','whatsapp','other'],'other'),priority=enumValue(v.priority,'Priority',['low','normal','high','urgent'],'normal'),category=str(v.category??'other','Category',80),due=v.responseDueAt?new Date(str(v.responseDueAt,'Response deadline',50)):null;
    if(due&&Number.isNaN(due.getTime()))throw new BadRequestException('Response deadline is invalid.');
    const number=`CASE-${new Date().getFullYear()}-${id.slice(0,8).toUpperCase()}`;
    await this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`INSERT INTO support_cases(id,tenant_id,branch_id,case_number,customer_record_id,task_record_id,assigned_employee_id,opened_by_user_id,subject,description,channel,category,priority,response_due_at)
        VALUES(${id}::uuid,${w}::uuid,${b}::uuid,${number},${customerId},${taskId},${assigned}::uuid,${a.userId}::uuid,${subject},${description},${channel},${category},${priority},${due}::timestamptz)`;
      await this.mirror(tx,w,b,'support',id,{id,ticketNumber:number,customerRecordId:customerId,taskRecordId:taskId,assignedEmployeeId:assigned,subject,description,channel,category,priority,status:'New',responseDueAt:due?.toISOString()??null});
      if(customerId)await this.link(tx,w,b,a.userId,'support',id,'customers',customerId,'support_customer');
      if(taskId){const taskModule=await tx.$queryRaw<any[]>`SELECT module_id FROM module_records WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND record_id=${taskId} AND module_id IN ('tasks','project-tasks') LIMIT 1`;await this.link(tx,w,b,a.userId,'support',id,taskModule[0].module_id,taskId,'support_task');}
      if(assigned)await this.link(tx,w,b,a.userId,'support',id,'employees',assigned,'assigned_employee');
      await this.audit(tx,w,b,a.userId,'support.case_created','support_case',id,{caseNumber:number,customerRecordId:customerId,taskRecordId:taskId,assignedEmployeeId:assigned});
    });
    return {id,caseNumber:number,customerRecordId:customerId,taskRecordId:taskId,assignedEmployeeId:assigned,subject,description,channel,category,priority,status:'new'};
  }

  @Patch('support/cases/:caseId')
  @UseGuards(CsrfGuard)
  async updateSupportCase(@Param('workspaceId') w:string,@Param('branchId') b:string,@Param('caseId') id:string,@Body() raw:unknown,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'support.write'),v=obj(raw),status=v.status===undefined?undefined:enumValue(v.status,'Case status',['new','triaged','in_progress','waiting_customer','resolved','closed','reopened']),assigned=v.assignedEmployeeId===undefined?undefined:(v.assignedEmployeeId?uuid(v.assignedEmployeeId,'Assignee'):null);
    if(assigned)await this.assertEmployee(w,b,assigned);
    const resolution=v.resolution===undefined?undefined:opt(v.resolution,'Resolution',5000);
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<any[]>`SELECT id,case_number,status,customer_record_id,task_record_id,subject,priority FROM support_cases WHERE tenant_id=${w}::uuid AND branch_id=${b}::uuid AND id=${id}::uuid FOR UPDATE`;
      const old=rows[0];if(!old)throw new NotFoundException('Support case not found.');
      if(status==='closed'&&old.status!=='resolved'&&old.status!=='closed')throw new ConflictException('Resolve a support case before closing it.');
      if(status==='resolved'&&!resolution)throw new BadRequestException('A resolution note is required before resolving a case.');
      const next=status??old.status;
      await tx.$executeRaw`UPDATE support_cases SET status=${next},assigned_employee_id=CASE WHEN ${assigned===undefined} THEN assigned_employee_id ELSE ${assigned}::uuid END,
        resolution=CASE WHEN ${v.resolution===undefined} THEN resolution ELSE ${resolution} END,
        resolved_at=CASE WHEN ${next}='resolved' THEN COALESCE(resolved_at,now()) ELSE resolved_at END,
        closed_at=CASE WHEN ${next}='closed' THEN COALESCE(closed_at,now()) ELSE NULL END,updated_at=now()
        WHERE tenant_id=${w}::uuid AND id=${id}::uuid`;
      await this.mirror(tx,w,b,'support',id,{id,ticketNumber:old.case_number,subject:old.subject,priority:old.priority,status:next.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()),customerRecordId:old.customer_record_id,taskRecordId:old.task_record_id,resolution:resolution??''});
      await this.audit(tx,w,b,a.userId,'support.case_updated','support_case',id,{from:old.status,to:next,assignedEmployeeId:assigned??undefined});
      return {id,status:next,resolution:resolution??null};
    },{isolationLevel:'Serializable'});
  }

  @Get('audit/events')
  async auditEvents(@Param('workspaceId') w:string,@Param('branchId') b:string,@Query('limit') limit:string|undefined,@Query('before') before:string|undefined,@Query('action') action:string|undefined,@Req() req:FastifyRequest) {
    const a=await this.actor(req,w,b,'audit.read');
    const canReadPayroll=hasPermission(a.role,'payroll.read');
    const canReadPrivate=hasPermission(a.role,'people.private.read');
    const take=Math.min(250,Math.max(1,Number.parseInt(limit??'100',10)||100));
    const beforeDate=before?new Date(before):null;if(beforeDate&&Number.isNaN(beforeDate.getTime()))throw new BadRequestException('Audit cursor is invalid.');
    const actionFilter=action?str(action,'Action filter',120):null;
    const rows=await this.prisma.$queryRaw<any[]>`SELECT ae.id,ae.actor_user_id AS "actorUserId",u.display_name AS "actorName",CASE WHEN ${canReadPrivate} THEN u.email ELSE NULL END AS "actorEmail",ae.action,ae.resource_type AS "resourceType",ae.resource_id AS "resourceId",ae.request_id AS "requestId",ae.metadata,ae.created_at AS "createdAt"
      FROM audit_events ae LEFT JOIN users u ON u.id=ae.actor_user_id
      WHERE ae.tenant_id=${w}::uuid AND ae.branch_id=${b}::uuid AND (${actionFilter}::text IS NULL OR ae.action ILIKE '%'||${actionFilter}||'%') AND (${beforeDate}::timestamptz IS NULL OR ae.created_at<${beforeDate}::timestamptz)
      ORDER BY ae.created_at DESC LIMIT ${take}`;
    return rows.map(row=>{
      if(canReadPayroll || !String(row.action).startsWith('people.payroll.')) return row;
      const metadata=row.metadata&&typeof row.metadata==='object'&&!Array.isArray(row.metadata)?{...row.metadata as Record<string,unknown>}:{};
      for(const key of ['grossMinor','deductionsMinor','netMinor','basePayMinor','hourlyRateMinor','amountMinor']) delete metadata[key];
      return {...row,metadata};
    });
  }
}
