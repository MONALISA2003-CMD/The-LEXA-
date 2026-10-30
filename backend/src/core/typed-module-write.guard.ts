import { CanActivate, ConflictException, ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { PrismaService } from '../prisma/prisma.service';

const TYPED_MODULES = new Set(['sales-invoices', 'purchase-invoices']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class TypedModuleWriteGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const params = request.params as Record<string, unknown> | undefined;
    const moduleId = typeof params?.moduleId === 'string' ? params.moduleId : undefined;
    if (!moduleId || !['PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())) return true;

    if (TYPED_MODULES.has(moduleId)) {
      throw new ConflictException('This register is maintained by its approved transaction workflow.');
    }

    // Supplier payments are projected into the existing Payments register. Protect
    // those rows from generic edits while leaving unrelated payment records editable.
    if (moduleId === 'payments' && typeof params?.workspaceId === 'string' && typeof params?.branchId === 'string'
      && UUID.test(params.workspaceId) && UUID.test(params.branchId)) {
      const recordId = typeof params.recordId === 'string' ? params.recordId : undefined;
      if (recordId && UUID.test(recordId)) {
        const rows = await this.prisma.$queryRaw<any[]>`SELECT id FROM ap_supplier_payments
          WHERE tenant_id=${params.workspaceId}::uuid AND branch_id=${params.branchId}::uuid AND id=${recordId}::uuid LIMIT 1`;
        if (rows.length) throw new ConflictException('This supplier payment is maintained by Accounts Payable.');
      } else {
        const rows = await this.prisma.$queryRaw<any[]>`SELECT id FROM ap_supplier_payments
          WHERE tenant_id=${params.workspaceId}::uuid AND branch_id=${params.branchId}::uuid LIMIT 1`;
        if (rows.length) throw new ConflictException('Supplier payment records are maintained by Accounts Payable and cannot be bulk replaced or cleared.');
      }
    }
    return true;
  }
}
