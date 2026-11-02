import { CanActivate, ConflictException, ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

// These records are projections or sensitive workflow data. Until a dedicated
// service owns their validation, approval, audit and ledger effects, generic JSON
// writes must fail closed instead of becoming a bypass around typed APIs.
const WORKFLOW_OWNED_MODULES = new Set([
  'sales-invoices', 'purchase-invoices', 'payments', 'expenses', 'money-accounts',
  'cash-sessions', 'cash-ups', 'bank-reconciliation', 'fixed-assets', 'assets',
  'tax-codes', 'tax-documents', 'cost-centres', 'cost-centers', 'chart-of-accounts',
  'accounting-periods', 'journals', 'payroll', 'employees', 'attendance', 'leave',
  'timesheets', 'approvals', 'audit-log', 'audit', 'supplier-invoices', 'customer-invoices',
  'projects', 'project-tasks', 'project-costs', 'support', 'shifts',
]);
@Injectable()
export class TypedModuleWriteGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const params = request.params as Record<string, unknown> | undefined;
    const moduleId = typeof params?.moduleId === 'string' ? params.moduleId : undefined;
    if (!moduleId || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())) return true;

    if (WORKFLOW_OWNED_MODULES.has(moduleId)) {
      throw new ConflictException({
        code: 'TYPED_WORKFLOW_REQUIRED',
        message: 'This register is read-only through generic module records. Use its validated domain workflow so approvals, accounting and audit effects remain consistent.',
      });
    }

    // Collection replacement/clear has no collection-level If-Match contract.
    // Disallow it rather than allow a stale browser to erase another user's work.
    if (['PUT', 'DELETE'].includes(request.method.toUpperCase()) && !params?.recordId) {
      throw new ConflictException({
        code: 'BULK_MODULE_WRITE_DISABLED',
        message: 'Bulk module replacement and clearing are disabled until a collection ETag workflow is available.',
      });
    }

    return true;
  }
}
