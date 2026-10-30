import {
  BadRequestException,
  Body,
  ConflictException,
  ForbiddenException,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CsrfGuard } from '../core/csrf.guard';

type RequestBody = FastifyRequest & { body?: unknown };
type JsonObject = Record<string, unknown>;
type Tx = any;
const ACCOUNT_TYPES = new Set(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'COST_OF_SALES', 'EXPENSE']);
const CONTROL_KEYS = new Set(['CASH', 'AR', 'AP', 'INVENTORY']);
const REPORT_DATE = /^\d{4}-\d{2}-\d{2}$/;

function cookie(request: FastifyRequest, name: string): string | undefined {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0 || part.slice(0, at).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(at + 1).trim()); } catch { return undefined; }
  }
  return undefined;
}
function sha(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function object(value: unknown, label = 'Request body'): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException(`${label} must be an object.`);
  return value as JsonObject;
}
function stringValue(value: unknown, label: string, max = 180, optional = false): string | undefined {
  if ((value === undefined || value === null || value === '') && optional) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`${label} is required and must be at most ${max} characters.`);
  return value.trim();
}
function uuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new BadRequestException(`${label} is invalid.`);
  return value;
}
function dateValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !REPORT_DATE.test(value)) throw new BadRequestException(`${label} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException(`${label} is not a valid date.`);
  return value;
}
function amount(value: unknown, label: string, allowZero = false): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < (allowZero ? 0 : 1) || parsed > 2_000_000_000) throw new BadRequestException(`${label} must be a ${allowZero ? 'non-negative' : 'positive'} whole amount in minor currency units.`);
  return parsed;
}
function canPost(role: string): boolean { return ['owner', 'admin', 'accountant'].includes(role.toLowerCase()); }
function normalBalance(type: string): 'DEBIT' | 'CREDIT' {
  return ['ASSET', 'COST_OF_SALES', 'EXPENSE'].includes(type) ? 'DEBIT' : 'CREDIT';
}
function journalLines(value: unknown): Array<{ accountId: string; description?: string; debitMinor: number; creditMinor: number }> {
  if (!Array.isArray(value) || value.length < 2 || value.length > 100) throw new BadRequestException('A journal requires between 2 and 100 lines.');
  return value.map((item, index) => {
    const line = object(item, `Journal line ${index + 1}`);
    const debitMinor = amount(line.debitMinor ?? 0, `Line ${index + 1} debit`, true);
    const creditMinor = amount(line.creditMinor ?? 0, `Line ${index + 1} credit`, true);
    if ((debitMinor > 0) === (creditMinor > 0)) throw new BadRequestException(`Line ${index + 1} must contain either a debit or a credit, not both.`);
    return {
      accountId: uuid(line.accountId, `Line ${index + 1} account`),
      ...(typeof line.description === 'string' && line.description.trim() ? { description: line.description.trim().slice(0, 240) } : {}),
      debitMinor,
      creditMinor,
    };
  });
}

@Controller('workspaces/:workspaceId/branches/:branchId/general-ledger')
export class GeneralLedgerController {
  constructor(private readonly prisma: PrismaService) {}

  private async access(request: FastifyRequest, workspaceId: string, branchId: string) {
    uuid(workspaceId, 'Workspace ID'); uuid(branchId, 'Branch ID');
    const token = cookie(request, 'lexa_session');
    if (!token) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Sign in to continue.' });
    const session = await this.prisma.session.findFirst({ where: { tokenHash: sha(token), expiresAt: { gt: new Date() } }, select: { userId: true } });
    if (!session) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Sign in again.' });
    const membership = await this.prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: workspaceId, userId: session.userId } } });
    if (!membership || membership.status !== 'ACTIVE') throw new NotFoundException('Workspace not found.');
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId: workspaceId }, select: { id: true, currency: true } });
    if (!branch) throw new NotFoundException('Branch not found.');
    return { userId: session.userId, role: membership.role, currency: branch.currency };
  }

  private requireAccountant(role: string) {
    if (!canPost(role)) throw new ForbiddenException({ code: 'ACCOUNTING_PERMISSION_REQUIRED', message: 'An owner, administrator or accountant must perform this accounting action.' });
  }

  private async audit(tx: Tx, tenantId: string, actorId: string, action: string, resourceType: string, resourceId: string, metadata: JsonObject = {}) {
    await tx.$executeRaw`INSERT INTO audit_events(id,tenant_id,actor_user_id,action,resource_type,resource_id,metadata)
      VALUES (${randomUUID()}::uuid,${tenantId}::uuid,${actorId}::uuid,${action},${resourceType},${resourceId},${JSON.stringify(metadata)}::jsonb)`;
  }

  @Get('accounts')
  async accounts(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest) {
    await this.access(req, workspaceId, branchId);
    return this.prisma.$queryRaw<any[]>`SELECT a.id,a.code,a.name,a.account_type AS "accountType",a.normal_balance AS "normalBalance",
      a.parent_id AS "parentId",p.code AS "parentCode",a.control_key AS "controlKey",a.is_system AS "isSystem",a.is_active AS "isActive",a.description,
      COALESCE(jsonb_agg(DISTINCT jsonb_build_object('key',m.mapping_key)) FILTER (WHERE m.mapping_key IS NOT NULL),'[]'::jsonb) AS mappings
      FROM gl_accounts a LEFT JOIN gl_accounts p ON p.tenant_id=a.tenant_id AND p.id=a.parent_id
      LEFT JOIN gl_account_mappings m ON m.tenant_id=a.tenant_id AND m.account_id=a.id
      WHERE a.tenant_id=${workspaceId}::uuid GROUP BY a.id,p.code ORDER BY a.code`;
  }

  @Post('accounts')
  @UseGuards(CsrfGuard)
  async createAccount(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Body() raw: unknown, @Req() req: RequestBody) {
    const actor = await this.access(req, workspaceId, branchId); this.requireAccountant(actor.role);
    const body = object(raw);
    const code = stringValue(body.code, 'Account code', 24)!;
    const name = stringValue(body.name, 'Account name', 120)!;
    const accountType = stringValue(body.accountType, 'Account type', 30)!.toUpperCase();
    if (!ACCOUNT_TYPES.has(accountType)) throw new BadRequestException('Choose a supported account type.');
    const parentId = body.parentId ? uuid(body.parentId, 'Parent account ID') : null;
    const description = stringValue(body.description, 'Description', 500, true) ?? null;
    const controlKey = body.controlKey === undefined || body.controlKey === '' ? null : stringValue(body.controlKey, 'Control key', 20)!.toUpperCase();
    if (controlKey && !CONTROL_KEYS.has(controlKey)) throw new BadRequestException('Control key must be CASH, AR, AP or INVENTORY.');
    if (controlKey && !((controlKey === 'AP' && accountType === 'LIABILITY') || (controlKey !== 'AP' && accountType === 'ASSET'))) throw new BadRequestException('The selected control key is incompatible with the account type.');
    const id = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      if (parentId) {
        const parent = await tx.$queryRaw<any[]>`SELECT id FROM gl_accounts WHERE id=${parentId}::uuid AND tenant_id=${workspaceId}::uuid`;
        if (!parent.length) throw new NotFoundException('Parent account not found.');
      }
      await tx.$executeRaw`INSERT INTO gl_accounts(id,tenant_id,code,name,account_type,normal_balance,parent_id,control_key,description)
        VALUES (${id}::uuid,${workspaceId}::uuid,${code},${name},${accountType},${normalBalance(accountType)},${parentId}::uuid,${controlKey},${description})`;
      await this.audit(tx, workspaceId, actor.userId, 'gl.account.created', 'gl_account', id, { code, name, accountType });
      return { id, code, name, accountType, normalBalance: normalBalance(accountType), parentId, controlKey, isSystem: false, isActive: true };
    });
  }

  @Patch('accounts/:accountId')
  @UseGuards(CsrfGuard)
  async updateAccount(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('accountId') accountIdValue: string, @Body() raw: unknown, @Req() req: RequestBody) {
    const actor = await this.access(req, workspaceId, branchId); this.requireAccountant(actor.role);
    const accountId = uuid(accountIdValue, 'Account ID'); const body = object(raw);
    const name = body.name === undefined ? undefined : stringValue(body.name, 'Account name', 120)!;
    const description = body.description === undefined ? undefined : stringValue(body.description, 'Description', 500, true) ?? null;
    if (body.isActive !== undefined && typeof body.isActive !== 'boolean') throw new BadRequestException('isActive must be true or false.');
    const isActive = body.isActive as boolean | undefined;
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.$queryRaw<any[]>`SELECT id,code,is_system,is_active,(SELECT count(*)::int FROM gl_account_mappings WHERE tenant_id=${workspaceId}::uuid AND account_id=${accountId}::uuid) AS mapped_count FROM gl_accounts WHERE tenant_id=${workspaceId}::uuid AND id=${accountId}::uuid FOR UPDATE`;
      if (!current.length) throw new NotFoundException('Account not found.');
      if (isActive === false && Number(current[0].mapped_count ?? 0) > 0) throw new ConflictException('An account referenced by automatic posting mappings cannot be deactivated. Change its mappings first.');
      await tx.$executeRaw`UPDATE gl_accounts SET name=COALESCE(${name ?? null},name),description=CASE WHEN ${description === undefined} THEN description ELSE ${description} END,
        is_active=COALESCE(${isActive ?? null},is_active),updated_at=CURRENT_TIMESTAMP WHERE tenant_id=${workspaceId}::uuid AND id=${accountId}::uuid`;
      await this.audit(tx, workspaceId, actor.userId, 'gl.account.updated', 'gl_account', accountId, { name, description, isActive });
      return { id: accountId, updated: true };
    });
  }

  @Get('periods')
  async periods(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() req: FastifyRequest) {
    await this.access(req, workspaceId, branchId);
    return this.prisma.$queryRaw<any[]>`SELECT p.id,p.name,p.start_date AS "startDate",p.end_date AS "endDate",p.status,
      p.closed_at AS "closedAt",p.reopened_at AS "reopenedAt",u.display_name AS "closedBy"
      FROM gl_periods p LEFT JOIN users u ON u.id=p.closed_by_user_id
      WHERE p.tenant_id=${workspaceId}::uuid ORDER BY p.start_date DESC`;
  }

  @Post('periods')
  @UseGuards(CsrfGuard)
  async createPeriod(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Body() raw: unknown, @Req() req: RequestBody) {
    const actor = await this.access(req, workspaceId, branchId); this.requireAccountant(actor.role);
    const body = object(raw); const name = stringValue(body.name, 'Period name', 60)!;
    const startDate = dateValue(body.startDate, 'Start date'); const endDate = dateValue(body.endDate, 'End date');
    if (endDate < startDate) throw new BadRequestException('Period end date cannot precede its start date.');
    const id = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const overlap = await tx.$queryRaw<any[]>`SELECT id,name FROM gl_periods WHERE tenant_id=${workspaceId}::uuid AND daterange(start_date,end_date,'[]') && daterange(${startDate}::date,${endDate}::date,'[]') LIMIT 1`;
      if (overlap.length) throw new ConflictException(`This period overlaps ${overlap[0].name}. Accounting periods cannot overlap.`);
      await tx.$executeRaw`INSERT INTO gl_periods(id,tenant_id,name,start_date,end_date,status) VALUES (${id}::uuid,${workspaceId}::uuid,${name},${startDate}::date,${endDate}::date,'open')`;
      await this.audit(tx, workspaceId, actor.userId, 'gl.period.created', 'gl_period', id, { name, startDate, endDate });
      return { id, name, startDate, endDate, status: 'open' };
    });
  }

  @Patch('periods/:periodId')
  @UseGuards(CsrfGuard)
  async setPeriodStatus(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('periodId') periodIdValue: string, @Body() raw: unknown, @Req() req: RequestBody) {
    const actor = await this.access(req, workspaceId, branchId); this.requireAccountant(actor.role);
    const periodId = uuid(periodIdValue, 'Period ID'); const body = object(raw);
    const status = stringValue(body.status, 'Period status', 10)!.toLowerCase();
    if (!['open','closed'].includes(status)) throw new BadRequestException('Period status must be open or closed.');
    if (status === 'open' && actor.role.toLowerCase() !== 'owner' && actor.role.toLowerCase() !== 'admin') throw new ForbiddenException('Only an owner or administrator may reopen a closed accounting period.');
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<any[]>`SELECT * FROM gl_periods WHERE tenant_id=${workspaceId}::uuid AND id=${periodId}::uuid FOR UPDATE`;
      const period = rows[0]; if (!period) throw new NotFoundException('Accounting period not found.');
      if (period.status === status) return { id: periodId, status };
      if (status === 'closed') {
        const drafts = await tx.$queryRaw<any[]>`SELECT count(*)::int AS count FROM gl_journals WHERE tenant_id=${workspaceId}::uuid AND period_id=${periodId}::uuid AND status='draft'`;
        if (Number(drafts[0]?.count ?? 0) > 0) throw new ConflictException('Post or discard all draft journals before closing this period.');
        await tx.$queryRaw`SELECT set_config('lexa.gl_period_close','on',true)`;
        await tx.$executeRaw`UPDATE gl_periods SET status='closed',closed_by_user_id=${actor.userId}::uuid,closed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=${periodId}::uuid`;
      } else {
        await tx.$queryRaw`SELECT set_config('lexa.gl_period_reopen','on',true)`;
        await tx.$executeRaw`UPDATE gl_periods SET status='open',reopened_by_user_id=${actor.userId}::uuid,reopened_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=${periodId}::uuid`;
      }
      await this.audit(tx, workspaceId, actor.userId, status === 'closed' ? 'gl.period.closed' : 'gl.period.reopened', 'gl_period', periodId, { periodName: period.name });
      return { id: periodId, status };
    }, { isolationLevel: 'Serializable' });
  }

  @Get('journals')
  async journals(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Query('from') fromValue: string | undefined, @Query('to') toValue: string | undefined, @Query('status') statusValue: string | undefined, @Req() req: FastifyRequest) {
    await this.access(req, workspaceId, branchId);
    const from = fromValue ? dateValue(fromValue, 'From date') : null; const to = toValue ? dateValue(toValue, 'To date') : null;
    const status = statusValue && ['draft','posted','void'].includes(statusValue) ? statusValue : null;
    const rows=await this.prisma.$queryRaw<any[]>`SELECT j.id,j.journal_number AS "journalNumber",j.posting_date AS "postingDate",j.reference,j.description,j.currency,j.source_type AS "sourceType",j.source_id AS "sourceId",j.event_type AS "eventType",j.status,j.debit_total_minor AS "debitTotalMinor",j.credit_total_minor AS "creditTotalMinor",j.posted_at AS "postedAt",
      COALESCE(jsonb_agg(jsonb_build_object('id',l.id,'accountId',a.id,'accountCode',a.code,'accountName',a.name,'description',l.description,'debitMinor',l.debit_minor,'creditMinor',l.credit_minor) ORDER BY l.line_number) FILTER (WHERE l.id IS NOT NULL),'[]'::jsonb) AS lines
      FROM gl_journals j LEFT JOIN gl_journal_lines l ON l.tenant_id=j.tenant_id AND l.journal_id=j.id LEFT JOIN gl_accounts a ON a.tenant_id=l.tenant_id AND a.id=l.account_id
      WHERE j.tenant_id=${workspaceId}::uuid AND j.branch_id=${branchId}::uuid AND (${from}::date IS NULL OR j.posting_date>=${from}::date) AND (${to}::date IS NULL OR j.posting_date<=${to}::date) AND (${status}::text IS NULL OR j.status=${status})
      GROUP BY j.id ORDER BY j.posting_date DESC,j.created_at DESC LIMIT 500`;
    return rows.map(row=>({...row,debitTotalMinor:Number(row.debitTotalMinor),creditTotalMinor:Number(row.creditTotalMinor),lines:(row.lines??[]).map((line:any)=>({...line,debitMinor:Number(line.debitMinor),creditMinor:Number(line.creditMinor)}))}));
  }

  @Post('journals')
  @UseGuards(CsrfGuard)
  async createJournal(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Body() raw: unknown, @Req() req: RequestBody) {
    const actor = await this.access(req, workspaceId, branchId); this.requireAccountant(actor.role);
    const body = object(raw); const postingDate = dateValue(body.postingDate, 'Posting date');
    const description = stringValue(body.description, 'Journal description', 500)!;
    const reference = stringValue(body.reference, 'Journal reference', 120, true) ?? null;
    const currency = (stringValue(body.currency, 'Currency', 3, true) ?? actor.currency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('Currency must be a three-letter ISO code.');
    const lines = journalLines(body.lines);
    const debits = lines.reduce((sum,line) => sum+line.debitMinor,0); const credits = lines.reduce((sum,line) => sum+line.creditMinor,0);
    if (debits <= 0 || debits !== credits) throw new BadRequestException('Journal is not balanced. Total debits must equal total credits and be greater than zero.');
    const id = randomUUID(); const number = `MAN-${postingDate.replace(/-/g,'')}-${id.replace(/-/g,'').slice(0,8).toUpperCase()}`;
    return this.prisma.$transaction(async (tx) => {
      const periods = await tx.$queryRaw<any[]>`SELECT id FROM gl_periods WHERE tenant_id=${workspaceId}::uuid AND ${postingDate}::date BETWEEN start_date AND end_date AND status='open' LIMIT 1`;
      if (!periods.length) throw new ConflictException('There is no open accounting period for this posting date.');
      for (const line of lines) {
        const valid = await tx.$queryRaw<any[]>`SELECT id FROM gl_accounts WHERE tenant_id=${workspaceId}::uuid AND id=${line.accountId}::uuid AND is_active=true`;
        if (!valid.length) throw new BadRequestException(`Account ${line.accountId} is missing or inactive.`);
      }
      await tx.$executeRaw`INSERT INTO gl_journals(id,tenant_id,branch_id,period_id,journal_number,posting_date,reference,description,currency,event_type,status,created_by_user_id)
        VALUES (${id}::uuid,${workspaceId}::uuid,${branchId}::uuid,${periods[0].id}::uuid,${number},${postingDate}::date,${reference},${description},${currency},'manual.journal','draft',${actor.userId}::uuid)`;
      for (let index=0;index<lines.length;index++) {
        const line=lines[index];
        await tx.$executeRaw`INSERT INTO gl_journal_lines(id,tenant_id,journal_id,account_id,line_number,description,debit_minor,credit_minor)
          VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${id}::uuid,${line.accountId}::uuid,${index+1},${line.description ?? description},${line.debitMinor},${line.creditMinor})`;
      }
      await tx.$executeRaw`INSERT INTO gl_journal_audit(id,tenant_id,journal_id,actor_user_id,action,details) VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${id}::uuid,${actor.userId}::uuid,'draft_created',${JSON.stringify({lineCount:lines.length,debitMinor:debits,creditMinor:credits})}::jsonb)`;
      await this.audit(tx, workspaceId, actor.userId, 'gl.journal.created', 'gl_journal', id, { journalNumber: number, lineCount: lines.length, debitMinor: debits, creditMinor: credits });
      return { id, journalNumber: number, postingDate, reference, description, currency, status: 'draft', debitTotalMinor: debits, creditTotalMinor: credits };
    });
  }

  @Post('journals/:journalId/post')
  @UseGuards(CsrfGuard)
  async postJournal(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('journalId') journalIdValue: string, @Req() req: FastifyRequest) {
    const actor=await this.access(req,workspaceId,branchId); this.requireAccountant(actor.role); const journalId=uuid(journalIdValue,'Journal ID');
    return this.prisma.$transaction(async (tx) => {
      const rows=await tx.$queryRaw<any[]>`SELECT * FROM gl_journals WHERE id=${journalId}::uuid AND tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid FOR UPDATE`;
      const journal=rows[0]; if(!journal) throw new NotFoundException('Journal not found.');
      if(journal.status==='posted') return {id:journalId,status:'posted'};
      if(journal.status==='void') throw new ConflictException('A voided journal cannot be posted. Create a new draft instead.');
      const period=await tx.$queryRaw<any[]>`SELECT status FROM gl_periods WHERE tenant_id=${workspaceId}::uuid AND id=${journal.period_id}::uuid FOR SHARE`;
      if(!period.length || period[0].status!=='open') throw new ConflictException('The journal accounting period is closed.');
      const sums=await tx.$queryRaw<any[]>`SELECT COALESCE(sum(debit_minor),0)::bigint AS debit,COALESCE(sum(credit_minor),0)::bigint AS credit,count(*)::int AS lines FROM gl_journal_lines WHERE tenant_id=${workspaceId}::uuid AND journal_id=${journalId}::uuid`;
      const debit=Number(sums[0].debit); const credit=Number(sums[0].credit);
      if(Number(sums[0].lines)<2 || debit<=0 || debit!==credit) throw new ConflictException('Journal cannot post: at least two lines and equal positive debit/credit totals are required.');
      await tx.$executeRaw`UPDATE gl_journals SET status='posted',debit_total_minor=${debit},credit_total_minor=${credit},posted_by_user_id=${actor.userId}::uuid,posted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=${journalId}::uuid`;
      await tx.$executeRaw`INSERT INTO gl_journal_audit(id,tenant_id,journal_id,actor_user_id,action,details) VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${journalId}::uuid,${actor.userId}::uuid,'posted',${JSON.stringify({debitMinor:debit,creditMinor:credit})}::jsonb)`;
      await this.audit(tx,workspaceId,actor.userId,'gl.journal.posted','gl_journal',journalId,{debitMinor:debit,creditMinor:credit});
      return {id:journalId,status:'posted',debitTotalMinor:debit,creditTotalMinor:credit};
    },{isolationLevel:'Serializable'});
  }

  @Post('journals/:journalId/void')
  @UseGuards(CsrfGuard)
  async voidJournal(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('journalId') journalIdValue:string,@Req() req:FastifyRequest){
    const actor=await this.access(req,workspaceId,branchId);this.requireAccountant(actor.role);const journalId=uuid(journalIdValue,'Journal ID');
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<any[]>`SELECT id,status,journal_number FROM gl_journals WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND id=${journalId}::uuid FOR UPDATE`;
      const journal=rows[0];if(!journal) throw new NotFoundException('Journal not found.');
      if(journal.status==='posted') throw new ConflictException('A posted journal cannot be voided. Create a reversal journal instead.');
      if(journal.status==='void') return {id:journalId,status:'void'};
      await tx.$executeRaw`UPDATE gl_journals SET status='void',updated_at=CURRENT_TIMESTAMP WHERE id=${journalId}::uuid`;
      await tx.$executeRaw`INSERT INTO gl_journal_audit(id,tenant_id,journal_id,actor_user_id,action,details) VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${journalId}::uuid,${actor.userId}::uuid,'voided',${JSON.stringify({journalNumber:journal.journal_number})}::jsonb)`;
      await this.audit(tx,workspaceId,actor.userId,'gl.journal.voided','gl_journal',journalId,{journalNumber:journal.journal_number});
      return {id:journalId,status:'void'};
    });
  }

  @Post('journals/:journalId/reverse')
  @UseGuards(CsrfGuard)
  async reverseJournal(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('journalId') journalIdValue: string, @Body() raw: unknown, @Req() req: RequestBody) {
    const actor=await this.access(req,workspaceId,branchId); this.requireAccountant(actor.role); const journalId=uuid(journalIdValue,'Journal ID');
    const body=object(raw); const postingDate=dateValue(body.postingDate,'Reversal posting date');
    return this.prisma.$transaction(async (tx) => {
      const originals=await tx.$queryRaw<any[]>`SELECT * FROM gl_journals WHERE id=${journalId}::uuid AND tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid FOR SHARE`;
      const original=originals[0]; if(!original) throw new NotFoundException('Journal not found.');
      if(original.status!=='posted') throw new ConflictException('Only a posted journal can be reversed.');
      const existing=await tx.$queryRaw<any[]>`SELECT id,journal_number FROM gl_journals WHERE tenant_id=${workspaceId}::uuid AND source_type='gl_reversal' AND source_id=${journalId} AND event_type='manual.reversal' LIMIT 1`;
      if(existing.length) return {id:existing[0].id,journalNumber:existing[0].journal_number,status:'posted',alreadyReversed:true};
      const period=await tx.$queryRaw<any[]>`SELECT id FROM gl_periods WHERE tenant_id=${workspaceId}::uuid AND ${postingDate}::date BETWEEN start_date AND end_date AND status='open' LIMIT 1`;
      if(!period.length) throw new ConflictException('There is no open accounting period for this reversal date.');
      const originalLines=await tx.$queryRaw<any[]>`SELECT * FROM gl_journal_lines WHERE tenant_id=${workspaceId}::uuid AND journal_id=${journalId}::uuid ORDER BY line_number`;
      const id=randomUUID(); const number=`REV-${postingDate.replace(/-/g,'')}-${id.replace(/-/g,'').slice(0,8).toUpperCase()}`;
      await tx.$executeRaw`INSERT INTO gl_journals(id,tenant_id,branch_id,period_id,journal_number,posting_date,reference,description,currency,source_type,source_id,event_type,status,created_by_user_id,posted_by_user_id,posted_at,debit_total_minor,credit_total_minor)
        VALUES (${id}::uuid,${workspaceId}::uuid,${branchId}::uuid,${period[0].id}::uuid,${number},${postingDate}::date,${original.journal_number},${'Reversal of '+original.journal_number+': '+original.description},${original.currency},'gl_reversal',${journalId},'manual.reversal','draft',${actor.userId}::uuid,${actor.userId}::uuid,CURRENT_TIMESTAMP,${original.credit_total_minor},${original.debit_total_minor})`;
      for(let i=0;i<originalLines.length;i++){
        const line=originalLines[i];
        await tx.$executeRaw`INSERT INTO gl_journal_lines(id,tenant_id,journal_id,account_id,line_number,description,debit_minor,credit_minor)
          VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${id}::uuid,${line.account_id}::uuid,${i+1},${'Reversal — '+(line.description??original.description)},${line.credit_minor},${line.debit_minor})`;
      }
      await tx.$executeRaw`UPDATE gl_journals SET status='posted' WHERE id=${id}::uuid`;
      await tx.$executeRaw`INSERT INTO gl_journal_audit(id,tenant_id,journal_id,actor_user_id,action,details) VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${id}::uuid,${actor.userId}::uuid,'reversal_posted',${JSON.stringify({reverses:journalId,originalJournalNumber:original.journal_number})}::jsonb)`;
      await tx.$executeRaw`INSERT INTO gl_journal_audit(id,tenant_id,journal_id,actor_user_id,action,details) VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${journalId}::uuid,${actor.userId}::uuid,'reversed_by',${JSON.stringify({reversalJournalId:id,reversalJournalNumber:number})}::jsonb)`;
      await this.audit(tx,workspaceId,actor.userId,'gl.journal.reversed','gl_journal',journalId,{reversalJournalId:id,reversalJournalNumber:number});
      return {id,journalNumber:number,status:'posted',reverses:journalId};
    },{isolationLevel:'Serializable'});
  }

  @Get('journals/:journalId/audit')
  async journalAudit(@Param('workspaceId') workspaceId: string,@Param('branchId') branchId: string,@Param('journalId') journalIdValue: string,@Req() req: FastifyRequest){
    await this.access(req,workspaceId,branchId); const journalId=uuid(journalIdValue,'Journal ID');
    return this.prisma.$queryRaw<any[]>`SELECT a.id,a.action,a.details,a.created_at AS "createdAt",u.display_name AS "actorName"
      FROM gl_journal_audit a LEFT JOIN users u ON u.id=a.actor_user_id
      WHERE a.tenant_id=${workspaceId}::uuid AND a.journal_id=${journalId}::uuid AND EXISTS(SELECT 1 FROM gl_journals j WHERE j.tenant_id=a.tenant_id AND j.id=a.journal_id AND j.branch_id=${branchId}::uuid) ORDER BY a.created_at,a.id`;
  }

  @Get('posting-rules')
  async postingRules(@Param('workspaceId') workspaceId: string,@Param('branchId') branchId: string,@Req() req: FastifyRequest){
    await this.access(req,workspaceId,branchId);
    return this.prisma.$queryRaw<any[]>`SELECT r.event_type AS "eventType",r.label,r.description,r.enabled,
      COALESCE(jsonb_agg(jsonb_build_object('lineNumber',l.line_number,'mappingKey',l.mapping_key,'side',l.side,'amountBasis',l.amount_basis) ORDER BY l.line_number) FILTER(WHERE l.id IS NOT NULL),'[]'::jsonb) AS lines
      FROM gl_posting_rules r LEFT JOIN gl_posting_rule_lines l ON l.tenant_id=r.tenant_id AND l.event_type=r.event_type
      WHERE r.tenant_id=${workspaceId}::uuid GROUP BY r.id ORDER BY r.event_type`;
  }

  @Patch('posting-rules/:eventType')
  @UseGuards(CsrfGuard)
  async setPostingRule(@Param('workspaceId') workspaceId: string,@Param('branchId') branchId: string,@Param('eventType') eventType: string,@Body() raw: unknown,@Req() req: RequestBody){
    const actor=await this.access(req,workspaceId,branchId);this.requireAccountant(actor.role);const body=object(raw);
    if(typeof body.enabled!=='boolean') throw new BadRequestException('enabled must be true or false.');
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<any[]>`SELECT id FROM gl_posting_rules WHERE tenant_id=${workspaceId}::uuid AND event_type=${eventType}`;
      if(!rows.length) throw new NotFoundException('Posting rule not found.');
      await tx.$executeRaw`UPDATE gl_posting_rules SET enabled=${body.enabled as boolean},updated_at=CURRENT_TIMESTAMP WHERE tenant_id=${workspaceId}::uuid AND event_type=${eventType}`;
      await this.audit(tx,workspaceId,actor.userId,'gl.posting_rule.updated','gl_posting_rule',eventType,{enabled:body.enabled});
      return {eventType,enabled:body.enabled};
    });
  }

  @Get('mappings')
  async mappings(@Param('workspaceId') workspaceId: string,@Param('branchId') branchId: string,@Req() req: FastifyRequest){
    await this.access(req,workspaceId,branchId);
    return this.prisma.$queryRaw<any[]>`SELECT m.mapping_key AS "mappingKey",a.id AS "accountId",a.code AS "accountCode",a.name AS "accountName",a.account_type AS "accountType",a.is_active AS "isActive"
      FROM gl_account_mappings m JOIN gl_accounts a ON a.tenant_id=m.tenant_id AND a.id=m.account_id
      WHERE m.tenant_id=${workspaceId}::uuid ORDER BY m.mapping_key`;
  }

  @Patch('mappings/:mappingKey')
  @UseGuards(CsrfGuard)
  async updateMapping(@Param('workspaceId') workspaceId: string,@Param('branchId') branchId: string,@Param('mappingKey') mappingKey: string,@Body() raw: unknown,@Req() req: RequestBody){
    const actor=await this.access(req,workspaceId,branchId);this.requireAccountant(actor.role);const body=object(raw);const accountId=uuid(body.accountId,'Account ID');
    if(mappingKey.length>80) throw new BadRequestException('Mapping key is too long.');
    return this.prisma.$transaction(async tx=>{
      const account=await tx.$queryRaw<any[]>`SELECT id,code,name,is_active,account_type,normal_balance,control_key FROM gl_accounts WHERE tenant_id=${workspaceId}::uuid AND id=${accountId}::uuid`;
      if(!account.length || !account[0].is_active) throw new BadRequestException('Choose an active account in this workspace.');
      const key = mappingKey.toLowerCase();
      const allowed = key.startsWith('cash:') || ['accounts_receivable','inventory','input_tax'].includes(key) ? ['ASSET']
        : ['accounts_payable','goods_received_not_invoiced','interbranch_payable'].includes(key) ? ['LIABILITY']
        : ['owner_capital','opening_balance_equity'].includes(key) ? ['EQUITY']
        : ['sales_revenue','sales_returns','inventory_adjustment_gain'].includes(key) ? ['INCOME']
        : key === 'cost_of_sales' ? ['COST_OF_SALES']
        : ['inventory_adjustment_expense','inventory_write_off','purchase_price_variance'].includes(key) ? ['EXPENSE']
        : key === 'interbranch_receivable' ? ['ASSET'] : null;
      if (allowed && !allowed.includes(account[0].account_type)) throw new BadRequestException(`Mapping ${mappingKey} requires an account of type ${allowed.join(' or ')}.`);
      const requiredControl = key.startsWith('cash:') ? 'CASH' : ({accounts_receivable:'AR',accounts_payable:'AP',inventory:'INVENTORY'} as Record<string,string>)[key];
      if (requiredControl && account[0].control_key !== requiredControl) throw new BadRequestException(`Mapping ${mappingKey} must use an account marked as ${requiredControl} control.`);
      await tx.$executeRaw`INSERT INTO gl_account_mappings(id,tenant_id,mapping_key,account_id) VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${mappingKey},${accountId}::uuid)
        ON CONFLICT (tenant_id,mapping_key) DO UPDATE SET account_id=EXCLUDED.account_id,updated_at=CURRENT_TIMESTAMP`;
      await this.audit(tx,workspaceId,actor.userId,'gl.account_mapping.updated','gl_account_mapping',mappingKey,{accountId,accountCode:account[0].code});
      return {mappingKey,accountId,accountCode:account[0].code,accountName:account[0].name};
    });
  }

  @Get('trial-balance')
  async trialBalance(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Query('asAt') asAtValue:string|undefined,@Req() req:FastifyRequest){
    await this.access(req,workspaceId,branchId);const asAt=asAtValue?dateValue(asAtValue,'As-at date'):new Date().toISOString().slice(0,10);
    const rows=await this.prisma.$queryRaw<any[]>`WITH posted_lines AS (
        SELECT l.* FROM gl_journal_lines l JOIN gl_journals j ON j.tenant_id=l.tenant_id AND j.id=l.journal_id
        WHERE j.tenant_id=${workspaceId}::uuid AND j.branch_id=${branchId}::uuid AND j.status='posted' AND j.posting_date<=${asAt}::date
      )
      SELECT a.id,a.code,a.name,a.account_type AS "accountType",a.normal_balance AS "normalBalance",
      GREATEST(COALESCE(sum(l.debit_minor-l.credit_minor),0),0)::bigint AS "debitMinor",
      GREATEST(COALESCE(sum(l.credit_minor-l.debit_minor),0),0)::bigint AS "creditMinor",
      CASE WHEN a.normal_balance='DEBIT' THEN COALESCE(sum(l.debit_minor-l.credit_minor),0) ELSE COALESCE(sum(l.credit_minor-l.debit_minor),0) END::bigint AS "balanceMinor"
      FROM gl_accounts a LEFT JOIN posted_lines l ON l.tenant_id=a.tenant_id AND l.account_id=a.id
      WHERE a.tenant_id=${workspaceId}::uuid GROUP BY a.id ORDER BY a.code`;
    const normalized=rows.map(row=>({...row,debitMinor:Number(row.debitMinor),creditMinor:Number(row.creditMinor),balanceMinor:Number(row.balanceMinor)}));
    const totals=normalized.reduce((acc,row)=>({debit:acc.debit+row.debitMinor,credit:acc.credit+row.creditMinor}),{debit:0,credit:0});
    return {asAt,rows:normalized,totals:{debitMinor:totals.debit,creditMinor:totals.credit,differenceMinor:totals.debit-totals.credit,isBalanced:totals.debit===totals.credit}};
  }

  @Get('profit-and-loss')
  async profitAndLoss(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Query('from') fromValue:string|undefined,@Query('to') toValue:string|undefined,@Req() req:FastifyRequest){
    await this.access(req,workspaceId,branchId);const to=toValue?dateValue(toValue,'To date'):new Date().toISOString().slice(0,10);const from=fromValue?dateValue(fromValue,'From date'):`${to.slice(0,4)}-01-01`;
    if(from>to) throw new BadRequestException('From date cannot be after to date.');
    const rows=await this.prisma.$queryRaw<any[]>`SELECT a.id,a.code,a.name,a.account_type AS "accountType",a.normal_balance AS "normalBalance",
      COALESCE(sum(l.debit_minor),0)::bigint AS "debitMinor",COALESCE(sum(l.credit_minor),0)::bigint AS "creditMinor",
      CASE WHEN a.account_type='INCOME' THEN COALESCE(sum(l.credit_minor-l.debit_minor),0) ELSE COALESCE(sum(l.debit_minor-l.credit_minor),0) END::bigint AS "netMinor"
      FROM gl_accounts a JOIN gl_journal_lines l ON l.tenant_id=a.tenant_id AND l.account_id=a.id JOIN gl_journals j ON j.tenant_id=l.tenant_id AND j.id=l.journal_id AND j.status='posted'
      WHERE a.tenant_id=${workspaceId}::uuid AND j.branch_id=${branchId}::uuid AND j.posting_date BETWEEN ${from}::date AND ${to}::date AND a.account_type IN ('INCOME','COST_OF_SALES','EXPENSE')
      GROUP BY a.id ORDER BY a.account_type,a.code`;
    const normalized=rows.map(row=>({...row,debitMinor:Number(row.debitMinor),creditMinor:Number(row.creditMinor),netMinor:Number(row.netMinor)}));
    const sum=(type:string)=>normalized.filter(row=>row.accountType===type).reduce((acc,row)=>acc+row.netMinor,0);
    const revenue=sum('INCOME');const costOfSales=sum('COST_OF_SALES');const expenses=sum('EXPENSE');
    return {from,to,currency:(await this.access(req,workspaceId,branchId)).currency,rows:normalized,totals:{revenueMinor:revenue,costOfSalesMinor:costOfSales,grossProfitMinor:revenue-costOfSales,expensesMinor:expenses,netProfitMinor:revenue-costOfSales-expenses}};
  }

  @Get('balance-sheet')
  async balanceSheet(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Query('asAt') asAtValue:string|undefined,@Req() req:FastifyRequest){
    const actor=await this.access(req,workspaceId,branchId);const asAt=asAtValue?dateValue(asAtValue,'As-at date'):new Date().toISOString().slice(0,10);
    const rows=await this.prisma.$queryRaw<any[]>`WITH posted_lines AS (
        SELECT l.* FROM gl_journal_lines l JOIN gl_journals j ON j.tenant_id=l.tenant_id AND j.id=l.journal_id
        WHERE j.tenant_id=${workspaceId}::uuid AND j.branch_id=${branchId}::uuid AND j.status='posted' AND j.posting_date<=${asAt}::date
      )
      SELECT a.id,a.code,a.name,a.account_type AS "accountType",a.normal_balance AS "normalBalance",
      CASE WHEN a.normal_balance='DEBIT' THEN COALESCE(sum(l.debit_minor-l.credit_minor),0) ELSE COALESCE(sum(l.credit_minor-l.debit_minor),0) END::bigint AS "balanceMinor"
      FROM gl_accounts a LEFT JOIN posted_lines l ON l.tenant_id=a.tenant_id AND l.account_id=a.id
      WHERE a.tenant_id=${workspaceId}::uuid AND a.account_type IN ('ASSET','LIABILITY','EQUITY') GROUP BY a.id ORDER BY a.account_type,a.code`;
    const earnings=await this.prisma.$queryRaw<any[]>`SELECT COALESCE(sum(l.credit_minor-l.debit_minor),0)::bigint AS amount
      FROM gl_journal_lines l JOIN gl_accounts a ON a.tenant_id=l.tenant_id AND a.id=l.account_id JOIN gl_journals j ON j.tenant_id=l.tenant_id AND j.id=l.journal_id
      WHERE l.tenant_id=${workspaceId}::uuid AND j.branch_id=${branchId}::uuid AND j.status='posted' AND j.posting_date<=${asAt}::date AND a.account_type IN ('INCOME','COST_OF_SALES','EXPENSE')`;
    const normalized=rows.map(row=>({...row,balanceMinor:Number(row.balanceMinor)}));
    const section=(type:string)=>normalized.filter(row=>row.accountType===type);
    const total=(items:any[])=>items.reduce((acc,row)=>acc+Number(row.balanceMinor),0);
    const currentEarnings=Number(earnings[0]?.amount??0);const assets=total(section('ASSET'));const liabilities=total(section('LIABILITY'));const equity=total(section('EQUITY'));
    return {asAt,currency:actor.currency,assets:section('ASSET'),liabilities:section('LIABILITY'),equity:section('EQUITY'),currentEarningsMinor:currentEarnings,
      totals:{assetsMinor:assets,liabilitiesMinor:liabilities,equityMinor:equity+currentEarnings,liabilitiesAndEquityMinor:liabilities+equity+currentEarnings,differenceMinor:assets-liabilities-equity-currentEarnings}};
  }

  @Get('reconciliation')
  async reconciliation(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Req() req:FastifyRequest){
    await this.access(req,workspaceId,branchId);
    const control=await this.prisma.$queryRaw<any[]>`WITH control_accounts AS (
        SELECT 'AR'::text AS key,account_id FROM gl_account_mappings WHERE tenant_id=${workspaceId}::uuid AND mapping_key='accounts_receivable'
        UNION SELECT 'AP',account_id FROM gl_account_mappings WHERE tenant_id=${workspaceId}::uuid AND mapping_key='accounts_payable'
        UNION SELECT 'INVENTORY',account_id FROM gl_account_mappings WHERE tenant_id=${workspaceId}::uuid AND mapping_key='inventory'
        UNION SELECT 'CASH',account_id FROM gl_account_mappings WHERE tenant_id=${workspaceId}::uuid AND mapping_key LIKE 'cash:%'
      ), posted_lines AS (
        SELECT l.* FROM gl_journal_lines l JOIN gl_journals j ON j.tenant_id=l.tenant_id AND j.id=l.journal_id
        WHERE j.tenant_id=${workspaceId}::uuid AND j.branch_id=${branchId}::uuid AND j.status='posted'
      )
      SELECT ca.key,COALESCE(sum(CASE WHEN a.normal_balance='DEBIT' THEN l.debit_minor-l.credit_minor ELSE l.credit_minor-l.debit_minor END),0)::bigint AS balance
      FROM control_accounts ca JOIN gl_accounts a ON a.tenant_id=${workspaceId}::uuid AND a.id=ca.account_id
      LEFT JOIN posted_lines l ON l.tenant_id=a.tenant_id AND l.account_id=a.id GROUP BY ca.key`;
    const source=await this.prisma.$queryRaw<any[]>`SELECT
      (SELECT COALESCE(sum(s.total_minor),0)-COALESCE((SELECT sum(p.amount_minor) FROM sale_payments p JOIN sales s2 ON s2.id=p.sale_id WHERE p.tenant_id=${workspaceId}::uuid AND s2.branch_id=${branchId}::uuid AND s2.status='completed' AND p.kind='receipt'),0)
        -COALESCE((SELECT sum(r.amount_minor) FROM ar_customer_receipts r WHERE r.tenant_id=${workspaceId}::uuid AND r.branch_id=${branchId}::uuid AND r.kind='receipt' AND r.source_sale_payment_id IS NULL),0)
        +COALESCE((SELECT sum(r.amount_minor) FROM ar_customer_receipts r WHERE r.tenant_id=${workspaceId}::uuid AND r.branch_id=${branchId}::uuid AND r.kind='refund' AND r.source_sale_payment_id IS NULL),0)
       FROM sales s WHERE s.tenant_id=${workspaceId}::uuid AND s.branch_id=${branchId}::uuid AND s.status='completed')::bigint AS ar,
      ((SELECT COALESCE(sum(i.total_minor),0) FROM ap_supplier_invoices i WHERE i.tenant_id=${workspaceId}::uuid AND i.branch_id=${branchId}::uuid AND i.status IN ('approved','partially_paid','paid'))
        -(SELECT COALESCE(sum(p.amount_minor),0) FROM ap_supplier_payments p WHERE p.tenant_id=${workspaceId}::uuid AND p.branch_id=${branchId}::uuid))::bigint AS ap,
      (SELECT COALESCE(sum(CASE WHEN sm.quantity_delta<0 THEN -sm.cost_total_minor ELSE sm.cost_total_minor END),0)::bigint FROM stock_movements sm WHERE sm.tenant_id=${workspaceId}::uuid AND sm.branch_id=${branchId}::uuid) AS inventory,
      ((SELECT COALESCE(sum(CASE WHEN p.kind='refund' THEN -p.amount_minor ELSE p.amount_minor END),0) FROM sale_payments p JOIN sales s ON s.id=p.sale_id WHERE p.tenant_id=${workspaceId}::uuid AND s.branch_id=${branchId}::uuid AND s.status='completed')
       +(SELECT COALESCE(sum(CASE WHEN r.kind='refund' THEN -r.amount_minor ELSE r.amount_minor END),0) FROM ar_customer_receipts r WHERE r.tenant_id=${workspaceId}::uuid AND r.branch_id=${branchId}::uuid AND r.source_sale_payment_id IS NULL)
       -(SELECT COALESCE(sum(p.amount_minor),0) FROM ap_supplier_payments p WHERE p.tenant_id=${workspaceId}::uuid AND p.branch_id=${branchId}::uuid))::bigint AS cash`;
    const balances=Object.fromEntries(control.map(row=>[row.key,Number(row.balance)]));const src=source[0]??{};
    const rows=[
      {key:'AR',label:'Accounts receivable',ledgerMinor:balances.AR??0,sourceMinor:Number(src.ar??0),basis:'Completed sales less receipts, plus recorded customer refunds.'},
      {key:'AP',label:'Accounts payable',ledgerMinor:balances.AP??0,sourceMinor:Number(src.ap??0),basis:'Approved supplier invoices less supplier payments.'},
      {key:'INVENTORY',label:'Inventory',ledgerMinor:balances.INVENTORY??0,sourceMinor:Number(src.inventory??0),basis:'Signed inventory movement cost snapshots; legacy rows were backfilled using current product cost.'},
      {key:'CASH',label:'Cash & bank',ledgerMinor:balances.CASH??0,sourceMinor:Number(src.cash??0),basis:'POS and standalone AR receipts less AP payments; excludes unrecorded opening bank/cash balances.'},
    ].map(row=>({...row,differenceMinor:row.ledgerMinor-row.sourceMinor,status:row.ledgerMinor===row.sourceMinor?'matched':'review'}));
    return {rows,matched:rows.filter(row=>row.status==='matched').length,needsReview:rows.filter(row=>row.status!=='matched').length};
  }
}
