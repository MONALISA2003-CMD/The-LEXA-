import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

type JsonRecord = Record<string, unknown>;
function object(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

@Injectable()
export class PeopleProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  private async audit(tx: any, input: {
    tenantId: string; branchId: string; actorUserId: string; action: string;
    resourceType: string; resourceId: string; metadata?: JsonRecord;
  }): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO audit_events(id,tenant_id,branch_id,actor_user_id,action,resource_type,resource_id,metadata)
      VALUES(${randomUUID()}::uuid,${input.tenantId}::uuid,${input.branchId}::uuid,
        ${input.actorUserId}::uuid,${input.action},${input.resourceType},${input.resourceId},
        ${JSON.stringify(input.metadata ?? {})}::jsonb)
    `;
  }

  private async mirror(tx: any, tenantId: string, branchId: string, moduleId: string, recordId: string, data: JsonRecord) {
    await tx.$executeRaw`
      INSERT INTO module_records(id,tenant_id,branch_id,module_id,record_id,data,version,created_at,updated_at)
      VALUES(${randomUUID()}::uuid,${tenantId}::uuid,${branchId}::uuid,${moduleId},${recordId},${JSON.stringify(data)}::jsonb,1,now(),now())
      ON CONFLICT(tenant_id,branch_id,module_id,record_id)
      DO UPDATE SET data=EXCLUDED.data,version=module_records.version+1,updated_at=now()
    `;
  }

  private async link(tx: any, tenantId: string, branchId: string, actorUserId: string, sourceModule: string, sourceId: string, targetModule: string, targetId: string, relationType: string) {
    if (sourceModule === targetModule && sourceId === targetId) return;
    await tx.$executeRaw`
      INSERT INTO module_record_links(id,tenant_id,branch_id,source_module_id,source_record_id,target_module_id,target_record_id,relation_type,created_by_user_id)
      VALUES(${randomUUID()}::uuid,${tenantId}::uuid,${branchId}::uuid,${sourceModule},${sourceId},${targetModule},${targetId},${relationType},${actorUserId}::uuid)
      ON CONFLICT(tenant_id,branch_id,source_module_id,source_record_id,target_module_id,target_record_id,relation_type) DO NOTHING
    `;
  }

  async decideSharedApproval(input: {
    tenantId: string; approvalId: string; actorUserId: string; actorRole: string;
    decision: 'approve' | 'reject'; comment?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const approvalRows = await tx.$queryRaw<Array<{ id: string; branchId: string; data: unknown; version: number }>>`
        SELECT id,branch_id AS "branchId",data,version FROM module_records
        WHERE tenant_id=${input.tenantId}::uuid AND module_id='approvals' AND record_id=${input.approvalId}
        FOR UPDATE
      `;
      const approval = approvalRows[0];
      if (!approval) throw new NotFoundException('Approval not found.');
      const data = object(approval.data);
      if (data.status !== 'pending') throw new ConflictException('This approval has already been decided.');
      if (typeof data.requestedBy === 'string' && data.requestedBy === input.actorUserId) {
        throw new ConflictException('The requester cannot approve or reject their own workflow request.');
      }

      const ownerModule = typeof data.ownerModule === 'string' ? data.ownerModule : '';
      const ownerRecordId = typeof data.ownerRecordId === 'string' ? data.ownerRecordId : '';
      if (!ownerRecordId) throw new ConflictException('This approval is not connected to an owning business record.');
      const status = input.decision === 'approve' ? 'approved' : 'rejected';
      const decidedAt = new Date();

      // Each branch calls the owning domain transition. Unsupported / legacy generic
      // approvals fail closed; we never approve arbitrary JSON-only records.
      if (ownerModule === 'leave') {
        const rows = await tx.$queryRaw<Array<any>>`
          SELECT id,branch_id,employee_id,request_number,status,paid,starts_on,ends_on
          FROM hr_leave_requests WHERE tenant_id=${input.tenantId}::uuid AND branch_id=${approval.branchId}::uuid AND id=${ownerRecordId}::uuid FOR UPDATE
        `;
        const record = rows[0];
        if (!record || record.branch_id !== approval.branchId) throw new NotFoundException('Leave request not found.');
        if (record.status !== 'pending_approval') throw new ConflictException('Leave request is no longer awaiting approval.');
        await tx.$executeRaw`
          UPDATE hr_leave_requests SET status=${status},decided_by_user_id=${input.actorUserId}::uuid,
            decision_comment=${input.comment ?? null},updated_at=now()
          WHERE tenant_id=${input.tenantId}::uuid AND branch_id=${approval.branchId}::uuid AND id=${ownerRecordId}::uuid
        `;
        await this.mirror(tx,input.tenantId,approval.branchId,'leave',ownerRecordId,{
          id:ownerRecordId,requestNumber:record.request_number,status:status==='approved'?'Approved':'Rejected',
          paid:record.paid,startsOn:String(record.starts_on).slice(0,10),endsOn:String(record.ends_on).slice(0,10),
        });
        await this.audit(tx,{tenantId:input.tenantId,branchId:approval.branchId,actorUserId:input.actorUserId,
          action:`people.leave.${status}`,resourceType:'leave_request',resourceId:ownerRecordId,metadata:{approvalId:input.approvalId,comment:input.comment ?? ''}});
      } else if (ownerModule === 'timesheets') {
        const rows = await tx.$queryRaw<Array<any>>`
          SELECT id,branch_id,employee_id,timesheet_number,project_id,project_task_id,work_date,
            regular_hours,overtime_hours,billable_hours,status
          FROM hr_timesheets WHERE tenant_id=${input.tenantId}::uuid AND branch_id=${approval.branchId}::uuid AND id=${ownerRecordId}::uuid FOR UPDATE
        `;
        const record = rows[0];
        if (!record || record.branch_id !== approval.branchId) throw new NotFoundException('Timesheet not found.');
        if (record.status !== 'pending_approval') throw new ConflictException('Timesheet is no longer awaiting approval.');
        if (input.actorRole === 'project_manager') {
          const employeeRows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM hr_employees WHERE tenant_id=${input.tenantId}::uuid AND branch_id=${approval.branchId}::uuid
              AND user_id=${input.actorUserId}::uuid AND employment_status='active' LIMIT 1
          `;
          const approverEmployeeId = employeeRows[0]?.id;
          if (!approverEmployeeId || !record.project_id) throw new ForbiddenException('Project managers may decide only timesheets for their managed projects or assigned project tasks.');
          const scopedRows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT t.id FROM hr_timesheets t
            JOIN projects p ON p.tenant_id=t.tenant_id AND p.branch_id=t.branch_id AND p.id=t.project_id
            WHERE t.tenant_id=${input.tenantId}::uuid AND t.branch_id=${approval.branchId}::uuid AND t.id=${ownerRecordId}::uuid
              AND (p.manager_employee_id=${approverEmployeeId}::uuid OR EXISTS (
                SELECT 1 FROM project_tasks pt WHERE pt.tenant_id=t.tenant_id AND pt.branch_id=t.branch_id
                  AND pt.project_id=p.id AND pt.id=t.project_task_id AND pt.assigned_employee_id=${approverEmployeeId}::uuid
              ))
            LIMIT 1
          `;
          if (!scopedRows.length) throw new ForbiddenException('This timesheet is outside your project management or assigned task scope.');
        }
        await tx.$executeRaw`
          UPDATE hr_timesheets SET status=${status},decided_by_user_id=${input.actorUserId}::uuid,
            decision_comment=${input.comment ?? null},updated_at=now()
          WHERE tenant_id=${input.tenantId}::uuid AND branch_id=${approval.branchId}::uuid AND id=${ownerRecordId}::uuid
        `;
        if (input.decision === 'approve' && record.project_id) {
          const rates = await tx.$queryRaw<Array<any>>`
            SELECT pay_basis,hourly_rate_minor,base_pay_minor,overtime_multiplier
            FROM hr_employee_compensation
            WHERE tenant_id=${input.tenantId}::uuid AND employee_id=${record.employee_id}::uuid
              AND effective_from<=${record.work_date}::date AND (effective_to IS NULL OR effective_to>=${record.work_date}::date)
            ORDER BY effective_from DESC LIMIT 1
          `;
          const rate = rates[0];
          if (!rate) throw new ConflictException('Cannot approve a project timesheet until the employee has effective-dated compensation for the work date.');
          const hourly = rate.pay_basis === 'hourly' ? Number(rate.hourly_rate_minor) : Number(rate.base_pay_minor)/173.33;
          const amount = Math.max(0,Math.round(hourly*(Number(record.regular_hours)+Number(record.overtime_hours)*Number(rate.overtime_multiplier ?? 1.5))));
          const costRows = await tx.$queryRaw<Array<{ id: string; currency: string }>>`
            INSERT INTO project_cost_entries(id,tenant_id,branch_id,project_id,source_type,source_id,category,description,cost_minor,currency,cost_date,created_by_user_id)
            SELECT ${randomUUID()}::uuid,${input.tenantId}::uuid,${approval.branchId}::uuid,p.id,
              'timesheet',${ownerRecordId},'labour',${`Approved timesheet ${record.timesheet_number}`},${amount},p.currency,
              ${record.work_date}::date,${input.actorUserId}::uuid
            FROM projects p WHERE p.tenant_id=${input.tenantId}::uuid AND p.branch_id=${approval.branchId}::uuid AND p.id=${record.project_id}::uuid
            ON CONFLICT(tenant_id,source_type,source_id) DO NOTHING
            RETURNING id,currency
          `;
          const cost = costRows[0] ?? (await tx.$queryRaw<Array<{ id: string; currency: string }>>`
            SELECT id,currency FROM project_cost_entries WHERE tenant_id=${input.tenantId}::uuid AND branch_id=${approval.branchId}::uuid AND source_type='timesheet' AND source_id=${ownerRecordId} LIMIT 1
          `)[0];
          if (!cost) throw new NotFoundException('The linked project is not available in this branch.');
          await this.mirror(tx,input.tenantId,approval.branchId,'project-costs',cost.id,{id:cost.id,projectId:record.project_id,sourceType:'timesheet',sourceId:ownerRecordId,category:'labour',description:`Approved timesheet ${record.timesheet_number}`,costMinor:String(amount),currency:cost.currency,costDate:String(record.work_date).slice(0,10)});
          await this.link(tx,input.tenantId,approval.branchId,input.actorUserId,'timesheets',ownerRecordId,'project-costs',cost.id,'timesheet_labour_cost');
          await this.link(tx,input.tenantId,approval.branchId,input.actorUserId,'projects',record.project_id,'project-costs',cost.id,'project_cost');
          await this.audit(tx,{tenantId:input.tenantId,branchId:approval.branchId,actorUserId:input.actorUserId,action:'projects.labour_cost_recorded',resourceType:'project_cost',resourceId:cost.id,metadata:{timesheetId:ownerRecordId,projectId:record.project_id,costMinor:amount}});
        }
        await this.mirror(tx,input.tenantId,approval.branchId,'timesheets',ownerRecordId,{
          id:ownerRecordId,timesheetNumber:record.timesheet_number,status:status==='approved'?'Approved':'Rejected',
          workDate:String(record.work_date).slice(0,10),regularHours:Number(record.regular_hours),overtimeHours:Number(record.overtime_hours),
        });
        await this.audit(tx,{tenantId:input.tenantId,branchId:approval.branchId,actorUserId:input.actorUserId,
          action:`people.timesheet.${status}`,resourceType:'timesheet',resourceId:ownerRecordId,metadata:{approvalId:input.approvalId,projectCostCreated:input.decision==='approve' && Boolean(record.project_id)}});
      } else if (ownerModule === 'payroll') {
        const rows = await tx.$queryRaw<Array<any>>`
          SELECT id,branch_id,run_number,status,gross_minor,deductions_minor,net_minor
          FROM hr_payroll_runs WHERE tenant_id=${input.tenantId}::uuid AND branch_id=${approval.branchId}::uuid AND id=${ownerRecordId}::uuid FOR UPDATE
        `;
        const record = rows[0];
        if (!record || record.branch_id !== approval.branchId) throw new NotFoundException('Payroll run not found.');
        if (record.status !== 'pending_approval') throw new ConflictException('Payroll run is no longer awaiting approval.');
        await tx.$executeRaw`
          UPDATE hr_payroll_runs SET status=${status},approved_by_user_id=${input.decision==='approve'?input.actorUserId:null}::uuid,
            approved_at=${input.decision==='approve'?decidedAt:null},updated_at=now()
          WHERE tenant_id=${input.tenantId}::uuid AND branch_id=${approval.branchId}::uuid AND id=${ownerRecordId}::uuid
        `;
        await this.mirror(tx,input.tenantId,approval.branchId,'payroll',ownerRecordId,{
          id:ownerRecordId,payrollReference:record.run_number,status:status==='approved'?'Approved':'Rejected',
        });
        await this.audit(tx,{tenantId:input.tenantId,branchId:approval.branchId,actorUserId:input.actorUserId,
          action:`people.payroll.${status}`,resourceType:'payroll_run',resourceId:ownerRecordId,metadata:{approvalId:input.approvalId,netMinor:String(record.net_minor)}});
      } else {
        throw new ConflictException('This approval has no registered owning-module decision handler. It cannot be decided as a generic status change.');
      }

      const updated = {
        ...data,status,decisionComment:input.comment ?? '',decidedBy:input.actorUserId,decidedAt:decidedAt.toISOString(),
      };
      await tx.$executeRaw`
        UPDATE module_records SET data=${JSON.stringify(updated)}::jsonb,version=version+1,updated_at=now()
        WHERE tenant_id=${input.tenantId}::uuid AND branch_id=${approval.branchId}::uuid
          AND module_id='approvals' AND record_id=${input.approvalId}
      `;
      await this.audit(tx,{tenantId:input.tenantId,branchId:approval.branchId,actorUserId:input.actorUserId,
        action:'approval.decided',resourceType:'approval',resourceId:input.approvalId,metadata:{ownerModule,ownerRecordId,decision:input.decision}});
      return { ...updated, id: input.approvalId };
    }, { isolationLevel: 'Serializable' });
  }
}
