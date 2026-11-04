import { BadRequestException, ConflictException, Controller, Get, Post, Param, Body, Req, UseGuards, NotFoundException, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { CsrfGuard } from '../core/csrf.guard';
import { assertBranchAccess } from '../authorization/branch-scope';

// Transactional posting stays in the existing ledger service. This controller
// exposes read-only posted-ledger snapshots and governed budget plans only.
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new BadRequestException(`${label} is invalid.`);
  return value;
}
function positiveMinor(value: unknown): bigint {
  const amount = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 1 || amount > 9_000_000_000_000)
    throw new BadRequestException('Planned budget must be a positive integer in the currency minor unit.');
  return BigInt(amount);
}
function sessionCookie(req: FastifyRequest): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at >= 0 && part.slice(0, at).trim() === 'lexa_session') {
      try { return decodeURIComponent(part.slice(at + 1).trim()); } catch { return undefined; }
    }
  }
  return undefined;
}

type Monthly = { month: string; inflowMinor: bigint; outflowMinor: bigint };
type LedgerMonth = Monthly & { revenueMinor: bigint; expenseMinor: bigint };

type PythonResult = { history: unknown[]; forecast: unknown[]; method: string; hasData: boolean; disclaimer: string };
function pythonForecast(months: Array<{ month: string; inflowMinor: number; outflowMinor: number }>): Promise<PythonResult> {
  return new Promise((resolve, reject) => {
    const python = spawn('python3', [join(process.cwd(), 'analytics', 'finance_intelligence.py')], {
      stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH ?? '/usr/bin:/bin', PYTHONDONTWRITEBYTECODE: '1' }, shell: false,
    });
    let output = ''; let stderr = ''; let settled = false;
    const done = (error?: Error, value?: PythonResult) => {
      if (settled) return;
      settled = true; clearTimeout(timeout);
      if (error) reject(error); else resolve(value!);
    };
    const timeout = setTimeout(() => { python.kill('SIGKILL'); done(new Error('Finance analytics exceeded the execution time limit.')); }, 4000);
    python.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk;
      if (output.length > 128 * 1024) { python.kill('SIGKILL'); done(new Error('Finance analytics response exceeded its size limit.')); }
    });
    python.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-300); });
    python.on('error', (error) => done(error));
    python.on('close', (code) => {
      if (code !== 0) return done(new Error(stderr || 'Finance analytics worker failed.'));
      try { done(undefined, JSON.parse(output) as PythonResult); } catch { done(new Error('Finance analytics returned an invalid response.')); }
    });
    python.stdin.on('error', () => { /* closed worker is handled by its exit event */ });
    python.stdin.end(JSON.stringify({ version: 1, months }));
  });
}

@Controller('workspaces/:workspaceId/branches/:branchId/finance')
export class FinanceIntelligenceController {
  constructor(private readonly prisma: PrismaService) {}
  private async actor(req: FastifyRequest, tenantId: string, branchId: string) {
    validId(tenantId, 'Workspace'); validId(branchId, 'Branch');
    const token = sessionCookie(req);
    if (!token) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Sign in to view business finances.' });
    const session = await this.prisma.session.findFirst({ where: { tokenHash: hash(token), expiresAt: { gt: new Date() } }, select: { userId: true } });
    if (!session) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Sign in again.' });
    this.prisma.enterTenantContext(tenantId, session.userId);
    const membership = await this.prisma.membership.findUnique({ where: { tenantId_userId: { tenantId, userId: session.userId } }, select: { role: true, status: true } });
    if (!membership || membership.status !== 'ACTIVE') throw new NotFoundException('Workspace not found.');
    const branch = await this.prisma.branch.findFirst({ where: { tenantId, id: branchId }, select: { id: true } });
    if (!branch) throw new NotFoundException('Branch not found.');
    await assertBranchAccess(this.prisma, tenantId, branchId, session.userId, membership.role);
    return session.userId;
  }

  @Get('overview')
  async overview(@Param('workspaceId') tenantId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest) {
    await this.actor(req, tenantId, branchId);
    const [postedCount, months, cash] = await Promise.all([
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count FROM ledger_journals
        WHERE tenant_id=${tenantId}::uuid AND branch_id=${branchId}::uuid AND status='posted'`,
      this.prisma.$queryRaw<LedgerMonth[]>`
        SELECT to_char(date_trunc('month',j.entry_date),'YYYY-MM') AS month,
          COALESCE(sum(CASE WHEN a.account_type='revenue' THEN l.credit_minor-l.debit_minor ELSE 0 END),0)::bigint AS "revenueMinor",
          COALESCE(sum(CASE WHEN a.account_type='expense' THEN l.debit_minor-l.credit_minor ELSE 0 END),0)::bigint AS "expenseMinor",
          COALESCE(sum(CASE WHEN a.system_key IN ('cash','bank','mobile_money') AND l.debit_minor>0 THEN l.debit_minor ELSE 0 END),0)::bigint AS "inflowMinor",
          COALESCE(sum(CASE WHEN a.system_key IN ('cash','bank','mobile_money') AND l.credit_minor>0 THEN l.credit_minor ELSE 0 END),0)::bigint AS "outflowMinor"
        FROM ledger_journals j JOIN ledger_journal_lines l ON l.journal_id=j.id AND l.tenant_id=j.tenant_id
        JOIN ledger_accounts a ON a.id=l.account_id AND a.tenant_id=j.tenant_id
        WHERE j.tenant_id=${tenantId}::uuid AND j.branch_id=${branchId}::uuid AND j.status='posted'
          AND j.entry_date >= (date_trunc('month',CURRENT_DATE) - interval '5 months')
        GROUP BY date_trunc('month',j.entry_date) ORDER BY month`,
      this.prisma.$queryRaw<Array<{ balance: bigint }>>`
        SELECT COALESCE(sum(l.debit_minor-l.credit_minor),0)::bigint AS balance
        FROM ledger_journal_lines l JOIN ledger_journals j ON j.id=l.journal_id AND j.tenant_id=l.tenant_id
        JOIN ledger_accounts a ON a.id=l.account_id AND a.tenant_id=l.tenant_id
        WHERE j.tenant_id=${tenantId}::uuid AND j.branch_id=${branchId}::uuid AND j.status='posted'
          AND a.system_key IN ('cash','bank','mobile_money')`,
    ]);
    return {
      source: 'posted_ledger', workspaceId: tenantId, branchId,
      generatedAt: new Date().toISOString(), hasActivity: Number(postedCount[0]?.count ?? 0n) > 0,
      postedJournalCount: Number(postedCount[0]?.count ?? 0n),
      recordedCashBalanceMinor: String(cash[0]?.balance ?? 0n),
      monthly: months.map(row => ({ month: row.month, revenueMinor: String(row.revenueMinor), expenseMinor: String(row.expenseMinor), inflowMinor: String(row.inflowMinor), outflowMinor: String(row.outflowMinor) })),
    };
  }

  @Get('budgets')
  async budgets(@Param('workspaceId') tenantId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest) {
    await this.actor(req, tenantId, branchId);
    const rows = await this.prisma.$queryRaw<Array<{
      id: string; costCentreId: string; costCentreName: string; accountingPeriodId: string; periodKey: string;
      status: string; version: number; plannedMinor: bigint; actualMinor: bigint; createdAt: Date;
    }>>`
      SELECT b.id,b.cost_centre_id AS "costCentreId",cc.name AS "costCentreName",
        b.accounting_period_id AS "accountingPeriodId",p.period_key AS "periodKey", b.status,b.version,
        b.planned_minor AS "plannedMinor",b.created_at AS "createdAt",
        COALESCE((SELECT SUM(CASE WHEN l.debit_minor>0 THEN LEAST(alloc.amount_minor,l.debit_minor) ELSE -LEAST(alloc.amount_minor,l.credit_minor) END)
          FROM cost_centre_allocations alloc
          JOIN ledger_journal_lines l ON l.id=alloc.journal_line_id AND l.tenant_id=alloc.tenant_id
          JOIN ledger_journals j ON j.id=l.journal_id AND j.tenant_id=l.tenant_id
          JOIN ledger_accounts a ON a.id=l.account_id AND a.tenant_id=l.tenant_id
          WHERE alloc.tenant_id=${tenantId}::uuid AND alloc.cost_centre_id=b.cost_centre_id
            AND j.tenant_id=${tenantId}::uuid AND j.branch_id=b.branch_id AND j.status='posted'
            AND j.entry_date>=p.starts_on AND j.entry_date<=p.ends_on AND a.account_type='expense'),0)::bigint AS "actualMinor"
      FROM finance_budgets b
      JOIN cost_centres cc ON cc.id=b.cost_centre_id AND cc.tenant_id=b.tenant_id
      JOIN accounting_periods p ON p.id=b.accounting_period_id AND p.tenant_id=b.tenant_id
      WHERE b.tenant_id=${tenantId}::uuid AND b.branch_id=${branchId}::uuid
      ORDER BY p.starts_on DESC,cc.code LIMIT 250`;
    return rows.map(row => ({ ...row, plannedMinor: String(row.plannedMinor), actualMinor: String(row.actualMinor),
      committedMinor: null, // A purchase-order cost-centre commitment ledger does not yet exist.
    }));
  }

  @Post('budgets') @UseGuards(CsrfGuard)
  async createBudget(@Param('workspaceId') tenantId: string, @Param('branchId') branchId: string,
      @Body() body: unknown, @Req() req: FastifyRequest) {
    const userId = await this.actor(req, tenantId, branchId);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Budget details are required.');
    const data = body as Record<string, unknown>;
    const centreId = validId(data.costCentreId, 'Cost centre');
    const periodId = validId(data.accountingPeriodId, 'Accounting period');
    const plannedMinor = positiveMinor(data.plannedMinor);
    return this.prisma.$transaction(async tx => {
      const [centre, period] = await Promise.all([
        tx.costCentre.findFirst({ where: { id: centreId, tenantId, active: true }, select: { id: true } }),
        tx.accountingPeriod.findFirst({ where: { id: periodId, tenantId, status: 'open' }, select: { id: true } }),
      ]);
      if (!centre || !period) throw new BadRequestException('Choose an active cost centre and an open accounting period from this business.');
      const existing = await tx.financeBudget.findFirst({ where: { tenantId, branchId, accountingPeriodId: periodId, costCentreId: centreId } });
      if (existing) throw new ConflictException('A budget already exists for this cost centre and period.');
      const created = await tx.financeBudget.create({ data: { tenantId, branchId, costCentreId: centreId, accountingPeriodId: periodId, plannedMinor, createdByUserId: userId } });
      await tx.auditEvent.create({ data: { tenantId, actorUserId: userId, action: 'finance.budget.created', resourceType: 'finance_budget', resourceId: created.id, metadata: { branchId, periodId, centreId, plannedMinor: String(plannedMinor) } } });
      return { id: created.id, status: created.status, plannedMinor: String(created.plannedMinor) };
    }, { isolationLevel: 'Serializable' });
  }

  @Post('budgets/:budgetId/submit') @UseGuards(CsrfGuard)
  async submitBudget(@Param('workspaceId') tenantId: string, @Param('branchId') branchId: string,
      @Param('budgetId') budgetId: string, @Req() req: FastifyRequest) {
    const actor = await this.actor(req, tenantId, branchId);
    validId(budgetId, 'Budget');
    return this.prisma.$transaction(async tx => {
      const row = await tx.financeBudget.findFirst({ where: { id: budgetId, tenantId, branchId } });
      if (!row) throw new NotFoundException('Budget not found.');
      if (row.status !== 'draft') throw new ConflictException('Only draft budgets may be submitted.');
      const budget = await tx.financeBudget.update({ where: { id: budgetId }, data: { status: 'submitted', submittedAt: new Date(), version: { increment: 1 } } });
      await tx.auditEvent.create({ data: { tenantId, actorUserId: actor, action: 'finance.budget.submitted', resourceType: 'finance_budget', resourceId: budget.id, metadata: { branchId } } });
      return { id: budget.id, status: budget.status };
    }, { isolationLevel: 'Serializable' });
  }

  @Post('budgets/:budgetId/approve') @UseGuards(CsrfGuard)
  async approveBudget(@Param('workspaceId') tenantId: string, @Param('branchId') branchId: string,
      @Param('budgetId') budgetId: string, @Req() req: FastifyRequest) {
    const actor = await this.actor(req, tenantId, branchId);
    validId(budgetId, 'Budget');
    return this.prisma.$transaction(async tx => {
      const row = await tx.financeBudget.findFirst({ where: { id: budgetId, tenantId, branchId } });
      if (!row) throw new NotFoundException('Budget not found.');
      if (row.status !== 'submitted') throw new ConflictException('Only submitted budgets can be approved.');
      if (row.createdByUserId === actor) throw new ConflictException('Budget approval must be performed by a different authorized finance user.');
      const period = await tx.accountingPeriod.findFirst({ where: { id: row.accountingPeriodId, tenantId, status: 'open' } });
      if (!period) throw new ConflictException('The accounting period is closed.');
      const budget = await tx.financeBudget.update({ where: { id: budgetId }, data: { status: 'approved', approvedByUserId: actor, approvedAt: new Date(), version: { increment: 1 } } });
      await tx.auditEvent.create({ data: { tenantId, actorUserId: actor, action: 'finance.budget.approved', resourceType: 'finance_budget', resourceId: budget.id, metadata: { branchId } } });
      return { id: budget.id, status: budget.status };
    }, { isolationLevel: 'Serializable' });
  }

  @Get('analysis/cash-forecast')
  async cashForecast(@Param('workspaceId') tenantId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest) {
    await this.actor(req, tenantId, branchId);
    const rows = await this.prisma.$queryRaw<Monthly[]>`
      SELECT to_char(date_trunc('month',j.entry_date),'YYYY-MM') AS month,
        COALESCE(sum(CASE WHEN l.debit_minor>0 THEN l.debit_minor ELSE 0 END),0)::bigint AS "inflowMinor",
        COALESCE(sum(CASE WHEN l.credit_minor>0 THEN l.credit_minor ELSE 0 END),0)::bigint AS "outflowMinor"
      FROM ledger_journals j JOIN ledger_journal_lines l ON l.journal_id=j.id AND l.tenant_id=j.tenant_id
      JOIN ledger_accounts a ON a.id=l.account_id AND a.tenant_id=j.tenant_id
      WHERE j.tenant_id=${tenantId}::uuid AND j.branch_id=${branchId}::uuid AND j.status='posted'
        AND j.entry_date >= (date_trunc('month',CURRENT_DATE) - interval '11 months')
        AND a.system_key IN ('cash','bank','mobile_money')
      GROUP BY date_trunc('month',j.entry_date) ORDER BY month`;
    try {
      const result = await pythonForecast(rows.map(row => ({ month: row.month, inflowMinor: Number(row.inflowMinor), outflowMinor: Number(row.outflowMinor) })));
      return { ...result, source: 'posted_cash_ledger', generatedAt: new Date().toISOString() };
    } catch {
      // Analytics must never affect transaction availability or expose process details.
      throw new ServiceUnavailableException('Financial forecasting is temporarily unavailable. Posted accounting records are unaffected.');
    }
  }
}
