import {
  BadRequestException,
  Body,
  ConflictException,
  ForbiddenException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertBranchAccess } from '../authorization/branch-scope';
import { isWorkspaceAdministrator } from '../authorization/role-policy';
import { CsrfGuard } from '../core/csrf.guard';

type JsonObject = Record<string, unknown>;
type Db = any;

function cookie(request: FastifyRequest, name: string): string | undefined {
  for (const item of (request.headers.cookie ?? '').split(';')) {
    const index = item.indexOf('=');
    if (index < 0 || item.slice(0, index).trim() !== name) continue;
    try { return decodeURIComponent(item.slice(index + 1).trim()); } catch { return undefined; }
  }
  return undefined;
}
function sha(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function object(value: unknown, label = 'Request body'): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException(`${label} must be an object.`);
  return value as JsonObject;
}
function requiredText(value: unknown, label: string, maximum = 300): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) throw new BadRequestException(`${label} is required and must be at most ${maximum} characters.`);
  return value.trim();
}
function dateOnly(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${label} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException(`${label} is not a valid calendar date.`);
  return value;
}
function amount(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 9_000_000_000_000) throw new BadRequestException(`${label} must be a positive whole number in minor currency units.`);
  return parsed;
}
function uuid(value: string, label: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new BadRequestException(`${label} is invalid.`);
  return value;
}
function journalNumber(): string {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, '');
  return `JRN-${date}-${randomBytes(3).toString('hex').toUpperCase()}`;
}
function rowsToJournal(row: any, lines: any[] = []) {
  return {
    id: row.id,
    journalNumber: row.journal_number,
    entryDate: row.entry_date instanceof Date ? row.entry_date.toISOString().slice(0, 10) : String(row.entry_date).slice(0, 10),
    memo: row.memo,
    status: row.status,
    sourceType: row.source_type ?? undefined,
    sourceId: row.source_id ?? undefined,
    reversalOfId: row.reversal_of_id ?? undefined,
    debitMinor: Number(row.debit_minor ?? 0),
    creditMinor: Number(row.credit_minor ?? 0),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    postedAt: row.posted_at ? (row.posted_at instanceof Date ? row.posted_at.toISOString() : row.posted_at) : undefined,
    lines: lines.map((line) => ({
      id: line.id,
      lineNumber: Number(line.line_number),
      accountId: line.account_id,
      accountCode: line.account_code,
      accountName: line.account_name,
      description: line.description ?? undefined,
      debitMinor: Number(line.debit_minor),
      creditMinor: Number(line.credit_minor),
    })),
  };
}

@Controller('workspaces/:workspaceId/branches/:branchId/ledger')
export class GeneralLedgerController {
  constructor(private readonly prisma: PrismaService) {}

  private async access(request: FastifyRequest, workspaceId: string, branchId: string) {
    const token = cookie(request, 'lexa_session');
    if (!token) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Sign in to continue.' });
    const session = await this.prisma.session.findFirst({ where: { tokenHash: sha(token), expiresAt: { gt: new Date() } }, select: { userId: true } });
    if (!session) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Sign in again.' });
    const membership = await this.prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: workspaceId, userId: session.userId } }, select: { status: true, role: true } });
    if (!membership || membership.status !== 'ACTIVE') throw new UnauthorizedException({ code: 'WORKSPACE_ACCESS_DENIED', message: 'Workspace access is unavailable.' });
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId: workspaceId }, select: { id: true, currency: true } });
    if (!branch) throw new UnauthorizedException({ code: 'BRANCH_ACCESS_DENIED', message: 'Branch access is unavailable.' });
    await assertBranchAccess(this.prisma, workspaceId, branchId, session.userId, membership.role);
    return { userId: session.userId, role: membership.role, currency: branch.currency };
  }

  private async journalWithLines(db: Db, workspaceId: string, branchId: string, journalId: string) {
    const journal = await db.$queryRaw<any[]>`
      SELECT j.*, COALESCE(SUM(l.debit_minor),0)::bigint AS debit_minor,
             COALESCE(SUM(l.credit_minor),0)::bigint AS credit_minor
      FROM ledger_journals j LEFT JOIN ledger_journal_lines l
        ON l.tenant_id=j.tenant_id AND l.journal_id=j.id
      WHERE j.tenant_id=${workspaceId}::uuid AND j.branch_id=${branchId}::uuid AND j.id=${journalId}::uuid
      GROUP BY j.id LIMIT 1`;
    if (!journal.length) return null;
    const lines = await db.$queryRaw<any[]>`
      SELECT l.id,l.line_number,l.account_id,a.account_code,a.account_name,l.description,l.debit_minor,l.credit_minor
      FROM ledger_journal_lines l JOIN ledger_accounts a
        ON a.tenant_id=l.tenant_id AND a.id=l.account_id
      WHERE l.tenant_id=${workspaceId}::uuid AND l.journal_id=${journalId}::uuid
      ORDER BY l.line_number`;
    return rowsToJournal(journal[0], lines);
  }

  private async ensureLedgerDefaults(workspaceId: string) {
    await this.prisma.$executeRaw`INSERT INTO ledger_accounts (id,tenant_id,account_code,account_name,account_type,normal_balance,system_key)
      SELECT gen_random_uuid(),${workspaceId}::uuid,a.code,a.name,a.kind,a.normal,a.system_key FROM (VALUES
        ('1000','Cash on hand','asset','debit','cash'),('1010','Bank accounts','asset','debit','bank'),
        ('1020','Mobile money clearing','asset','debit','mobile_money'),('1030','Other payment clearing','asset','debit','other_clearing'),
        ('1100','Accounts receivable control','asset','debit','accounts_receivable'),('1200','Inventory control','asset','debit','inventory'),
        ('1300','Input tax recoverable','asset','debit','input_tax'),('2000','Accounts payable control','liability','credit','accounts_payable'),
        ('2050','Goods received not invoiced','liability','credit','goods_received_not_invoiced'),('2100','Tax payable','liability','credit','tax_payable'),
        ('2200','Customer credit balances','liability','credit','customer_credit_liability'),('3000','Owner equity','equity','credit','owner_equity'),
        ('4000','Sales revenue','revenue','credit','sales_revenue'),('4050','Sales returns and allowances','revenue','debit','sales_returns'),
        ('4100','Other income','revenue','credit','other_income'),('4200','Inventory adjustment gains','revenue','credit','inventory_adjustment_gain'),
        ('5000','Cost of goods sold','expense','debit','cost_of_goods_sold'),('5100','Purchase price variance','expense','debit','purchase_price_variance'),
        ('5200','Inventory shrinkage and write-offs','expense','debit','inventory_shrinkage'),('6000','Operating expenses','expense','debit','operating_expenses')
      ) AS a(code,name,kind,normal,system_key) ON CONFLICT (tenant_id,account_code) DO NOTHING`;
    await this.prisma.$executeRaw`INSERT INTO accounting_periods (id,tenant_id,period_key,starts_on,ends_on,status,closed_at)
      SELECT gen_random_uuid(),${workspaceId}::uuid,to_char(m.start_date,'YYYY-MM'),m.start_date::date,(m.start_date+interval '1 month - 1 day')::date,
        CASE WHEN m.start_date < date_trunc('month',CURRENT_DATE)::date THEN 'closed' ELSE 'open' END,
        CASE WHEN m.start_date < date_trunc('month',CURRENT_DATE)::date THEN CURRENT_TIMESTAMP ELSE NULL END
      FROM generate_series((date_trunc('month',CURRENT_DATE)-interval '60 months')::date,(date_trunc('month',CURRENT_DATE)+interval '24 months')::date,interval '1 month') AS m(start_date)
      ON CONFLICT (tenant_id,period_key) DO NOTHING`;
  }

  @Get('accounts')
  async accounts(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest) {
    await this.access(req, workspaceId, branchId);
    await this.ensureLedgerDefaults(workspaceId);
    return this.prisma.$queryRaw<any[]>`
      SELECT id,account_code AS "accountCode",account_name AS "accountName",account_type AS "accountType",
             normal_balance AS "normalBalance",system_key AS "systemKey",is_active AS "isActive"
      FROM ledger_accounts WHERE tenant_id=${workspaceId}::uuid
      ORDER BY account_code`;
  }

  @Post('accounts')
  @UseGuards(CsrfGuard)
  async createAccount(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Body() raw: unknown, @Req() req: FastifyRequest) {
    const actor = await this.access(req, workspaceId, branchId);
    const body = object(raw);
    const accountCode = requiredText(body.accountCode, 'Account code', 24);
    const accountName = requiredText(body.accountName, 'Account name', 120);
    const accountType = requiredText(body.accountType, 'Account type', 20).toLowerCase();
    const normalBalance = requiredText(body.normalBalance, 'Normal balance', 10).toLowerCase();
    if (!['asset','liability','equity','revenue','expense'].includes(accountType)) throw new BadRequestException('Choose a supported account type.');
    if (!['debit','credit'].includes(normalBalance)) throw new BadRequestException('Normal balance must be debit or credit.');
    try {
      const id = randomUUID();
      await this.prisma.$executeRaw`INSERT INTO ledger_accounts (id,tenant_id,account_code,account_name,account_type,normal_balance)
        VALUES (${id}::uuid,${workspaceId}::uuid,${accountCode},${accountName},${accountType},${normalBalance})`;
      await this.prisma.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: actor.userId, action: 'ledger.account.created', resourceType: 'ledger_account', resourceId: id } });
      return { id, accountCode, accountName, accountType, normalBalance, isActive: true };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002' || String((error as Error).message).includes('23505')) throw new ConflictException('An account with this code already exists in the workspace.');
      throw error;
    }
  }

  @Get('periods')
  async periods(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest) {
    await this.access(req, workspaceId, branchId);
    await this.ensureLedgerDefaults(workspaceId);
    return this.prisma.$queryRaw<any[]>`
      SELECT id,period_key AS "periodKey",starts_on AS "startsOn",ends_on AS "endsOn",status,closed_at AS "closedAt"
      FROM accounting_periods WHERE tenant_id=${workspaceId}::uuid ORDER BY starts_on DESC LIMIT 36`;
  }

  @Post('periods/:periodId/close')
  @UseGuards(CsrfGuard)
  async closePeriod(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('periodId') periodId: string, @Req() req: FastifyRequest) {
    const actor = await this.access(req, workspaceId, branchId); uuid(periodId, 'Accounting period ID');
    if (!isWorkspaceAdministrator(actor.role)) throw new ForbiddenException('Only a workspace owner or administrator can close a workspace accounting period.');
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<any[]>`SELECT id,status,starts_on,ends_on FROM accounting_periods WHERE tenant_id=${workspaceId}::uuid AND id=${periodId}::uuid FOR UPDATE`;
      if (!rows.length) throw new ConflictException('Accounting period not found.');
      if (rows[0].status === 'closed') return;
      const drafts = await tx.$queryRaw<any[]>`SELECT journal_number,branch_id FROM ledger_journals
        WHERE tenant_id=${workspaceId}::uuid AND status='draft'
          AND entry_date BETWEEN ${rows[0].starts_on}::date AND ${rows[0].ends_on}::date
        ORDER BY entry_date,created_at LIMIT 10`;
      if (drafts.length) throw new ConflictException({ code: 'PERIOD_HAS_DRAFT_JOURNALS', message: 'This period still contains draft journals. Post or remove them before closing the period.', journals: drafts.map((item) => item.journal_number) });
      await tx.$executeRaw`UPDATE accounting_periods SET status='closed',closed_at=CURRENT_TIMESTAMP,closed_by_user_id=${actor.userId}::uuid WHERE tenant_id=${workspaceId}::uuid AND id=${periodId}::uuid AND status='open'`;
      await tx.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: actor.userId, action: 'ledger.period.closed', resourceType: 'accounting_period', resourceId: periodId } });
    }, { isolationLevel: 'Serializable' });
    return { id: periodId, status: 'closed' };
  }

  @Get('journals')
  async journals(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest, @Query('from') from?: string, @Query('to') to?: string) {
    await this.access(req, workspaceId, branchId);
    const start = from ? dateOnly(from, 'From date') : '1900-01-01';
    const end = to ? dateOnly(to, 'To date') : '2999-12-31';
    if (start > end) throw new BadRequestException('From date must not be after To date.');
    const journals = await this.prisma.$queryRaw<any[]>`
      SELECT j.id,j.journal_number,j.entry_date,j.memo,j.status,j.source_type,j.source_id,j.reversal_of_id,
             j.created_at,j.posted_at,COALESCE(SUM(l.debit_minor),0)::bigint AS debit_minor,
             COALESCE(SUM(l.credit_minor),0)::bigint AS credit_minor
      FROM ledger_journals j LEFT JOIN ledger_journal_lines l ON l.tenant_id=j.tenant_id AND l.journal_id=j.id
      WHERE j.tenant_id=${workspaceId}::uuid AND j.branch_id=${branchId}::uuid
        AND j.entry_date BETWEEN ${start}::date AND ${end}::date
      GROUP BY j.id ORDER BY j.entry_date DESC,j.created_at DESC LIMIT 300`;
    return journals.map((row) => rowsToJournal(row));
  }

  @Post('journals')
  @UseGuards(CsrfGuard)
  async createJournal(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Body() raw: unknown, @Req() req: FastifyRequest) {
    const actor = await this.access(req, workspaceId, branchId);
    const body = object(raw);
    const entryDate = dateOnly(body.entryDate, 'Entry date');
    const memo = requiredText(body.memo, 'Journal description', 500);
    if (!Array.isArray(body.lines) || body.lines.length < 2 || body.lines.length > 100) throw new BadRequestException('A journal must contain between 2 and 100 lines.');
    const lines = body.lines.map((item, index) => {
      const line = object(item, `Journal line ${index + 1}`);
      const accountId = uuid(requiredText(line.accountId, `Account on line ${index + 1}`, 50), `Account on line ${index + 1}`);
      const debitMinor = line.debitMinor === undefined || line.debitMinor === null || line.debitMinor === '' || Number(line.debitMinor) === 0 ? 0 : amount(line.debitMinor, `Debit on line ${index + 1}`);
      const creditMinor = line.creditMinor === undefined || line.creditMinor === null || line.creditMinor === '' || Number(line.creditMinor) === 0 ? 0 : amount(line.creditMinor, `Credit on line ${index + 1}`);
      if ((debitMinor > 0) === (creditMinor > 0)) throw new BadRequestException(`Line ${index + 1} must contain either a debit or a credit, not both.`);
      return { accountId, debitMinor, creditMinor, description: typeof line.description === 'string' ? line.description.trim().slice(0, 300) : null };
    });
    const debitTotal = lines.reduce((sum, line) => sum + line.debitMinor, 0);
    const creditTotal = lines.reduce((sum, line) => sum + line.creditMinor, 0);
    if (!Number.isSafeInteger(debitTotal) || debitTotal <= 0 || debitTotal !== creditTotal) throw new BadRequestException('Journal debits and credits must balance to the same positive amount.');
    const rawKey = req.headers['idempotency-key'];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!key || key.length > 200) throw new BadRequestException('Idempotency-Key header is required to create a journal.');
    const requestHash = sha(JSON.stringify({ workspaceId, branchId, entryDate, memo, lines }));
    try {
      let id: string = randomUUID();
      await this.prisma.$transaction(async (tx) => {
        const prior = await tx.$queryRaw<any[]>`SELECT id,request_hash FROM ledger_journals WHERE tenant_id=${workspaceId}::uuid AND idempotency_key=${key} LIMIT 1`;
        if (prior.length) {
          if (prior[0].request_hash !== requestHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This request key was already used for different journal data.' });
          id = String(prior[0].id);
          return;
        }
        const accountIds = [...new Set(lines.map((line) => line.accountId))].sort();
        const accounts = await tx.$queryRaw<any[]>`
          SELECT id FROM ledger_accounts WHERE tenant_id=${workspaceId}::uuid AND is_active=true AND id=ANY(${accountIds}::uuid[]) FOR SHARE`;
        if (accounts.length !== accountIds.length) throw new BadRequestException('One or more selected accounts are inactive or do not belong to this workspace.');
        await tx.$executeRaw`INSERT INTO ledger_journals
          (id,tenant_id,branch_id,journal_number,entry_date,memo,status,idempotency_key,request_hash,created_by_user_id)
          VALUES (${id}::uuid,${workspaceId}::uuid,${branchId}::uuid,${journalNumber()},${entryDate}::date,${memo},'draft',${key},${requestHash},${actor.userId}::uuid)`;
        for (let index = 0; index < lines.length; index++) {
          const line = lines[index];
          await tx.$executeRaw`INSERT INTO ledger_journal_lines
            (id,tenant_id,journal_id,line_number,account_id,description,debit_minor,credit_minor)
            VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${id}::uuid,${index + 1},${line.accountId}::uuid,${line.description},${line.debitMinor},${line.creditMinor})`;
        }
        await tx.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: actor.userId, action: 'ledger.journal.created', resourceType: 'ledger_journal', resourceId: id } });
      }, { isolationLevel: 'Serializable' });
      const found = await this.prisma.$queryRaw<any[]>`SELECT id FROM ledger_journals WHERE tenant_id=${workspaceId}::uuid AND idempotency_key=${key} LIMIT 1`;
      const journal = await this.journalWithLines(this.prisma, workspaceId, branchId, String(found[0]?.id ?? id));
      if (!journal) throw new ConflictException('The journal could not be loaded after creation.');
      return journal;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const prior = await this.prisma.$queryRaw<any[]>`SELECT id,request_hash FROM ledger_journals WHERE tenant_id=${workspaceId}::uuid AND idempotency_key=${key} LIMIT 1`;
        if (prior.length && prior[0].request_hash === requestHash) return this.journalWithLines(this.prisma, workspaceId, branchId, String(prior[0].id));
      }
      throw error;
    }
  }

  @Post('journals/:journalId/post')
  @UseGuards(CsrfGuard)
  async postJournal(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('journalId') journalId: string, @Req() req: FastifyRequest) {
    const actor = await this.access(req, workspaceId, branchId); uuid(journalId, 'Journal ID');
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<any[]>`SELECT id,status FROM ledger_journals WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND id=${journalId}::uuid FOR UPDATE`;
      if (!rows.length) throw new ConflictException('Journal not found in this workspace and branch.');
      if (rows[0].status === 'posted') return;
      await tx.$executeRaw`UPDATE ledger_journals SET status='posted',posted_by_user_id=${actor.userId}::uuid,posted_at=CURRENT_TIMESTAMP WHERE tenant_id=${workspaceId}::uuid AND id=${journalId}::uuid AND status='draft'`;
      await tx.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: actor.userId, action: 'ledger.journal.posted', resourceType: 'ledger_journal', resourceId: journalId } });
    }, { isolationLevel: 'Serializable' });
    return this.journalWithLines(this.prisma, workspaceId, branchId, journalId);
  }

  @Post('journals/:journalId/reverse')
  @UseGuards(CsrfGuard)
  async reverseJournal(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('journalId') journalId: string, @Body() raw: unknown, @Req() req: FastifyRequest) {
    const actor = await this.access(req, workspaceId, branchId); uuid(journalId, 'Journal ID');
    const reason = requiredText(object(raw).reason, 'Reversal reason', 500);
    let reversalId = '';
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<any[]>`SELECT * FROM ledger_journals WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND id=${journalId}::uuid FOR UPDATE`;
      const original = rows[0];
      if (!original) throw new ConflictException('Journal not found in this workspace and branch.');
      if (original.status !== 'posted') throw new ConflictException('Only a posted journal can be reversed.');
      const prior = await tx.$queryRaw<any[]>`SELECT id FROM ledger_journals WHERE tenant_id=${workspaceId}::uuid AND reversal_of_id=${journalId}::uuid LIMIT 1`;
      if (prior.length) { reversalId = String(prior[0].id); return; }
      const lines = await tx.$queryRaw<any[]>`SELECT * FROM ledger_journal_lines WHERE tenant_id=${workspaceId}::uuid AND journal_id=${journalId}::uuid ORDER BY line_number`;
      if (lines.length < 2) throw new ConflictException('The posted journal has no valid lines to reverse.');
      reversalId = randomUUID();
      await tx.$executeRaw`INSERT INTO ledger_journals
        (id,tenant_id,branch_id,journal_number,entry_date,memo,status,reversal_of_id,source_type,source_id,created_by_user_id)
        VALUES (${reversalId}::uuid,${workspaceId}::uuid,${branchId}::uuid,${journalNumber()},CURRENT_DATE,${`Reversal: ${reason}`},'draft',${journalId}::uuid,'reversal',${journalId},${actor.userId}::uuid)`;
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        await tx.$executeRaw`INSERT INTO ledger_journal_lines
          (id,tenant_id,journal_id,line_number,account_id,description,debit_minor,credit_minor)
          VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${reversalId}::uuid,${index + 1},${line.account_id}::uuid,${`Reversal of ${original.journal_number}`},${Number(line.credit_minor)},${Number(line.debit_minor)})`;
      }
      await tx.$executeRaw`UPDATE ledger_journals SET status='posted',posted_by_user_id=${actor.userId}::uuid,posted_at=CURRENT_TIMESTAMP WHERE tenant_id=${workspaceId}::uuid AND id=${reversalId}::uuid`;
      await tx.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: actor.userId, action: 'ledger.journal.reversed', resourceType: 'ledger_journal', resourceId: journalId, metadata: { reversalId, reason } } });
    }, { isolationLevel: 'Serializable' });
    return this.journalWithLines(this.prisma, workspaceId, branchId, reversalId);
  }

  @Get('reports/trial-balance')
  async trialBalance(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest, @Query('asOf') asOf?: string) {
    await this.access(req, workspaceId, branchId);
    const date = asOf ? dateOnly(asOf, 'As-of date') : new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date());
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT a.id,a.account_code AS "accountCode",a.account_name AS "accountName",a.account_type AS "accountType",
        COALESCE(b.debit_minor,0)::bigint AS "debitMinor",
        COALESCE(b.credit_minor,0)::bigint AS "creditMinor",
        (COALESCE(b.debit_minor,0)-COALESCE(b.credit_minor,0))::bigint AS "netDebitMinor"
      FROM ledger_accounts a LEFT JOIN (
        SELECT l.tenant_id,l.account_id,SUM(l.debit_minor)::bigint AS debit_minor,SUM(l.credit_minor)::bigint AS credit_minor
        FROM ledger_journal_lines l JOIN ledger_journals j ON j.tenant_id=l.tenant_id AND j.id=l.journal_id
        WHERE j.tenant_id=${workspaceId}::uuid AND j.branch_id=${branchId}::uuid AND j.status='posted' AND j.entry_date<=${date}::date
        GROUP BY l.tenant_id,l.account_id
      ) b ON b.tenant_id=a.tenant_id AND b.account_id=a.id
      WHERE a.tenant_id=${workspaceId}::uuid AND a.is_active=true
      ORDER BY a.account_code`;
    return rows.map((row) => ({ ...row, debitMinor: Number(row.debitMinor), creditMinor: Number(row.creditMinor), netDebitMinor: Number(row.netDebitMinor) }));
  }

  @Get('reports/profit-and-loss')
  async profitAndLoss(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest, @Query('from') from?: string, @Query('to') to?: string) {
    await this.access(req, workspaceId, branchId);
    const yearStart = `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala', year: 'numeric' }).format(new Date())}-01-01`;
    const start = from ? dateOnly(from, 'From date') : yearStart;
    const end = to ? dateOnly(to, 'To date') : new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date());
    if (start > end) throw new BadRequestException('From date must not be after To date.');
    const rows = await this.prisma.$queryRaw<any[]>`
      WITH balances AS (
        SELECT l.tenant_id,l.account_id,SUM(l.debit_minor)::bigint AS debit_minor,SUM(l.credit_minor)::bigint AS credit_minor
        FROM ledger_journal_lines l JOIN ledger_journals j ON j.tenant_id=l.tenant_id AND j.id=l.journal_id
        WHERE j.tenant_id=${workspaceId}::uuid AND j.branch_id=${branchId}::uuid AND j.status='posted'
          AND j.entry_date BETWEEN ${start}::date AND ${end}::date
        GROUP BY l.tenant_id,l.account_id
      )
      SELECT a.id,a.account_code AS "accountCode",a.account_name AS "accountName",a.account_type AS "accountType",
        CASE WHEN a.account_type='revenue' AND a.normal_balance='debit'
          THEN COALESCE(b.credit_minor,0)-COALESCE(b.debit_minor,0)
          WHEN a.normal_balance='credit' THEN COALESCE(b.credit_minor,0)-COALESCE(b.debit_minor,0)
          ELSE COALESCE(b.debit_minor,0)-COALESCE(b.credit_minor,0) END::bigint AS "amountMinor"
      FROM ledger_accounts a LEFT JOIN balances b ON b.tenant_id=a.tenant_id AND b.account_id=a.id
      WHERE a.tenant_id=${workspaceId}::uuid AND a.is_active=true AND a.account_type IN ('revenue','expense')
      ORDER BY a.account_type,a.account_code`;
    const accounts = rows.map((row) => ({ ...row, amountMinor: Number(row.amountMinor) }));
    const revenueMinor = accounts.filter((row) => row.accountType === 'revenue').reduce((sum, row) => sum + row.amountMinor, 0);
    const expensesMinor = accounts.filter((row) => row.accountType === 'expense').reduce((sum, row) => sum + row.amountMinor, 0);
    return { from: start, to: end, revenueMinor, expensesMinor, netProfitMinor: revenueMinor - expensesMinor, accounts };
  }

  @Get('reports/balance-sheet')
  async balanceSheet(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest, @Query('asOf') asOf?: string) {
    await this.access(req, workspaceId, branchId);
    const date = asOf ? dateOnly(asOf, 'As-of date') : new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date());
    const rows = await this.prisma.$queryRaw<any[]>`
      WITH balances AS (
        SELECT l.tenant_id,l.account_id,SUM(l.debit_minor)::bigint AS debit_minor,SUM(l.credit_minor)::bigint AS credit_minor
        FROM ledger_journal_lines l JOIN ledger_journals j ON j.tenant_id=l.tenant_id AND j.id=l.journal_id
        WHERE j.tenant_id=${workspaceId}::uuid AND j.branch_id=${branchId}::uuid AND j.status='posted' AND j.entry_date<=${date}::date
        GROUP BY l.tenant_id,l.account_id
      )
      SELECT a.id,a.account_code AS "accountCode",a.account_name AS "accountName",a.account_type AS "accountType",
        CASE WHEN a.normal_balance='credit' THEN COALESCE(b.credit_minor,0)-COALESCE(b.debit_minor,0)
          ELSE COALESCE(b.debit_minor,0)-COALESCE(b.credit_minor,0) END::bigint AS "balanceMinor"
      FROM ledger_accounts a LEFT JOIN balances b ON b.tenant_id=a.tenant_id AND b.account_id=a.id
      WHERE a.tenant_id=${workspaceId}::uuid AND a.is_active=true AND a.account_type IN ('asset','liability','equity')
      ORDER BY a.account_type,a.account_code`;
    const accounts = rows.map((row) => ({ ...row, balanceMinor: Number(row.balanceMinor) }));
    const earningsRows = await this.prisma.$queryRaw<any[]>`
      WITH balances AS (
        SELECT l.tenant_id,l.account_id,SUM(l.debit_minor)::bigint AS debit_minor,SUM(l.credit_minor)::bigint AS credit_minor
        FROM ledger_journal_lines l JOIN ledger_journals j ON j.tenant_id=l.tenant_id AND j.id=l.journal_id
        WHERE j.tenant_id=${workspaceId}::uuid AND j.branch_id=${branchId}::uuid AND j.status='posted' AND j.entry_date<=${date}::date
        GROUP BY l.tenant_id,l.account_id
      )
      SELECT
        COALESCE(SUM(CASE WHEN a.account_type='revenue' AND a.normal_balance='debit' THEN COALESCE(b.credit_minor,0)-COALESCE(b.debit_minor,0)
          WHEN a.account_type='revenue' AND a.normal_balance='credit' THEN COALESCE(b.credit_minor,0)-COALESCE(b.debit_minor,0) ELSE 0 END),0)::bigint AS revenue_minor,
        COALESCE(SUM(CASE WHEN a.account_type='expense' AND a.normal_balance='credit' THEN COALESCE(b.credit_minor,0)-COALESCE(b.debit_minor,0)
          WHEN a.account_type='expense' AND a.normal_balance='debit' THEN COALESCE(b.debit_minor,0)-COALESCE(b.credit_minor,0) ELSE 0 END),0)::bigint AS expenses_minor
      FROM ledger_accounts a LEFT JOIN balances b ON b.tenant_id=a.tenant_id AND b.account_id=a.id
      WHERE a.tenant_id=${workspaceId}::uuid AND a.account_type IN ('revenue','expense')`;
    const revenueToDateMinor = Number(earningsRows[0]?.revenue_minor ?? 0);
    const expensesToDateMinor = Number(earningsRows[0]?.expenses_minor ?? 0);
    const accumulatedEarningsMinor = revenueToDateMinor - expensesToDateMinor;
    if (accumulatedEarningsMinor !== 0) accounts.push({ id: 'virtual-accumulated-earnings', accountCode: 'RETAINED', accountName: 'Current and prior earnings', accountType: 'equity', balanceMinor: accumulatedEarningsMinor });
    const totalAssetsMinor = accounts.filter((row) => row.accountType === 'asset').reduce((sum, row) => sum + row.balanceMinor, 0);
    const totalLiabilitiesMinor = accounts.filter((row) => row.accountType === 'liability').reduce((sum, row) => sum + row.balanceMinor, 0);
    const totalEquityMinor = accounts.filter((row) => row.accountType === 'equity').reduce((sum, row) => sum + row.balanceMinor, 0);
    return { asOf: date, totalAssetsMinor, totalLiabilitiesMinor, totalEquityMinor, accumulatedEarningsMinor, liabilitiesAndEquityMinor: totalLiabilitiesMinor + totalEquityMinor, accounts };
  }

  @Get('accounts/:accountId/activity')
  async accountActivity(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('accountId') accountId: string, @Req() req: FastifyRequest, @Query('from') from?: string, @Query('to') to?: string) {
    await this.access(req, workspaceId, branchId); uuid(accountId, 'Account ID');
    const start = from ? dateOnly(from, 'From date') : '1900-01-01';
    const end = to ? dateOnly(to, 'To date') : '2999-12-31';
    if (start > end) throw new BadRequestException('From date must not be after To date.');
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT j.id AS "journalId",j.journal_number AS "journalNumber",j.entry_date AS "entryDate",j.memo,l.description,
        l.debit_minor AS "debitMinor",l.credit_minor AS "creditMinor"
      FROM ledger_journal_lines l JOIN ledger_journals j ON j.tenant_id=l.tenant_id AND j.id=l.journal_id
      WHERE l.tenant_id=${workspaceId}::uuid AND j.tenant_id=${workspaceId}::uuid AND j.branch_id=${branchId}::uuid AND l.account_id=${accountId}::uuid
        AND j.status='posted' AND j.entry_date BETWEEN ${start}::date AND ${end}::date
      ORDER BY j.entry_date,j.created_at,l.line_number LIMIT 1000`;
    return rows.map((row) => ({ ...row, entryDate: row.entryDate instanceof Date ? row.entryDate.toISOString().slice(0, 10) : String(row.entryDate).slice(0, 10), debitMinor: Number(row.debitMinor), creditMinor: Number(row.creditMinor) }));
  }
}
