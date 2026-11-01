import {
  BadRequestException, ConflictException, Controller, ForbiddenException, Get, HttpCode,
  NotFoundException, Post, Put, Patch, Delete, Body, Param, Query, Req, Res, UseGuards,
  UnauthorizedException, ServiceUnavailableException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import { CsrfGuard } from './csrf.guard';

const scrypt = promisify(scryptCallback);
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const RESET_SECONDS = 60 * 30;
const IDEMPOTENCY_SECONDS = 60 * 60 * 24;
const PAYMENT_METHODS = new Set(['cash', 'mtn_momo', 'airtel_money', 'bank_transfer', 'card_recorded', 'other']);

type RequestWithBody = FastifyRequest & { body?: unknown };
type JsonObject = Record<string, unknown>;

function cookieValue(request: FastifyRequest, name: string): string | undefined {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0 || part.slice(0, i).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return undefined; }
  }
  return undefined;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function asObject(value: unknown, label = 'request body'): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException(`${label} must be an object.`);
  return value as JsonObject;
}

function requiredString(value: unknown, label: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new BadRequestException(`${label} is required and must be no longer than ${max} characters.`);
  }
  return value.trim();
}

function optionalString(value: unknown, max = 500): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.trim().length > max) throw new BadRequestException('A text field is invalid or too long.');
  return value.trim();
}

function moneyMinor(value: unknown, label: string, allowZero = true): number {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(amount) || amount < (allowZero ? 0 : 1) || amount > 2_000_000_000) {
    throw new BadRequestException(`${label} must be a valid amount in minor currency units.`);
  }
  return amount;
}

function positiveQuantity(value: unknown, label = 'quantity'): number {
  const quantity = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000 || Math.round(quantity * 1000) !== quantity * 1000) {
    throw new BadRequestException(`${label} must be greater than zero and have at most three decimal places.`);
  }
  return quantity;
}

function slugify(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'business';
}

function toWorkspace(tenant: any) {
  return {
    id: tenant.id,
    businessName: tenant.name,
    businessType: tenant.businessType,
    currency: tenant.currency,
    timezone: tenant.timezone,
    enabledModules: tenant.enabledModules,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  };
}

function toBranch(branch: any) {
  return {
    id: branch.id,
    workspaceId: branch.tenantId,
    name: branch.name,
    ...(branch.address ? { address: branch.address } : {}),
    createdAt: branch.createdAt.toISOString(),
    updatedAt: branch.updatedAt.toISOString(),
  };
}

function toProduct(product: any) {
  return {
    id: product.id,
    workspaceId: product.tenantId,
    name: product.name,
    sku: product.sku,
    ...(product.barcode ? { barcode: product.barcode } : {}),
    ...(product.brand ? { brand: product.brand } : {}),
    ...(product.unitOfMeasure ? { unitOfMeasure: product.unitOfMeasure } : {}),
    ...(product.supplierSku ? { supplierSku: product.supplierSku } : {}),
    ...(product.categoryId ? { categoryId: product.categoryId } : {}),
    costPriceMinor: product.costPriceMinor,
    sellingPriceMinor: product.sellingPriceMinor,
    lowStockThreshold: Number(product.lowStockThreshold),
    trackStock: product.trackStock,
    active: product.active,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function toSale(sale: any) {
  return {
    id: sale.id,
    receiptNumber: sale.receiptNumber,
    workspaceId: sale.tenantId,
    branchId: sale.branchId,
    ...(sale.customerName ? { customerName: sale.customerName } : {}),
    ...(sale.customerPhone ? { customerPhone: sale.customerPhone } : {}),
    ...(sale.promisedPaymentDate ? { promisedPaymentDate: sale.promisedPaymentDate.toISOString().slice(0, 10) } : {}),
    totalMinor: sale.totalMinor,
    status: 'completed' as const,
    createdAt: sale.createdAt.toISOString(),
  };
}

function toMovement(movement: any) {
  return {
    id: movement.id,
    workspaceId: movement.tenantId,
    branchId: movement.branchId,
    productId: movement.productId,
    type: movement.type,
    quantityDelta: Number(movement.quantityDelta),
    reason: movement.reason,
    ...(movement.sourceId ? { sourceId: movement.sourceId } : {}),
    createdAt: movement.createdAt.toISOString(),
  };
}


function parseCsvRows(raw: unknown): { headers: string[]; rows: string[][] } {
  if (typeof raw !== 'string' || !raw.trim()) throw new BadRequestException('CSV content is required.');
  if (raw.length > 5_000_000) throw new BadRequestException('CSV files must be 5 MB or smaller.');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (quoted) {
      if (char === '"' && raw[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell.trim()); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && raw[index + 1] === '\n') index += 1;
      row.push(cell.trim()); cell = '';
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
    } else cell += char;
    if (rows.length > 5001) throw new BadRequestException('CSV files can contain at most 5000 data rows.');
  }
  if (quoted) throw new BadRequestException('The CSV contains an unclosed quote.');
  row.push(cell.trim());
  if (row.some((value) => value.length)) rows.push(row);
  if (rows.length < 2) throw new BadRequestException('CSV must include a header row and at least one data row.');
  const rawHeaders = rows[0]!;
  const headers = rawHeaders.map((value) => value.toLowerCase().replace(/[\s_-]+/g, ''));
  if (new Set(headers).size !== headers.length) throw new BadRequestException('CSV contains duplicate column names after normalisation.');
  if (rows.slice(1).some((value) => value.length !== rawHeaders.length)) throw new BadRequestException('CSV rows must all have the same number of columns.');
  return { headers, rows: rows.slice(1) };
}

function csvCell(row: string[], headers: string[], ...names: string[]): string {
  for (const name of names) {
    const index = headers.indexOf(name.toLowerCase().replace(/[\s_-]+/g, ''));
    if (index >= 0) return (row[index] ?? '').trim();
  }
  return '';
}

function requiredCsvCell(row: string[], headers: string[], name: string, rowNumber: number): string {
  const value = csvCell(row, headers, name);
  if (!value) throw new BadRequestException(`CSV row ${rowNumber}: ${name} is required.`);
  return value;
}

function currencyFactor(currency: string): number {
  try {
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid currency');
    const fractionDigits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
    return 10 ** fractionDigits;
  } catch {
    throw new BadRequestException('Currency must be a supported three-letter currency code.');
  }
}

function csvMoneyMinor(value: string, currency: string, minorUnits: boolean, field: string, rowNumber: number): number {
  const number = Number(value.replace(/,/g, ''));
  if (!Number.isFinite(number) || number < 0) throw new BadRequestException(`CSV row ${rowNumber}: ${field} must be a non-negative amount.`);
  const result = minorUnits ? number : Math.round((number + Number.EPSILON) * currencyFactor(currency));
  if (!Number.isSafeInteger(result) || result > 2_000_000_000) throw new BadRequestException(`CSV row ${rowNumber}: ${field} is outside the supported amount range.`);
  return result;
}


function backupDate(value: unknown, field: string, optional = false): Date | null {
  if ((value === null || value === undefined || value === '') && optional) return null;
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : new Date(Number.NaN);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`Backup field ${field} must be a valid date.`);
  return date;
}

function backupArray(tables: JsonObject, name: string): JsonObject[] {
  const value = tables[name];
  if (!Array.isArray(value) || value.length > 20_000) throw new BadRequestException(`Backup table ${name} must be an array of at most 20000 records.`);
  return value.map((row, index) => asObject(row, `backup ${name} row ${index + 1}`));
}

function backupUuid(value: unknown, field: string): string {
  const id = requiredString(value, field, 80);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new BadRequestException(`Backup field ${field} must contain a valid UUID.`);
  return id;
}

function toModuleRecord(row: any) {
  const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {};
  return { ...data, id: row.recordId, status: typeof data.status === 'string' ? data.status : 'Open', updatedAt: row.updatedAt.toISOString() };
}

@Controller()
export class CoreController {
  constructor(private readonly prisma: PrismaService) {}

  private setCsrfCookie(reply: FastifyReply, token: string): void {
    reply.header('Set-Cookie', `lexa_csrf=${encodeURIComponent(token)}; Path=/; Secure; SameSite=None; Max-Age=3600`);
  }

  private setSessionCookie(reply: FastifyReply, token: string): void {
    // Keep the current CSRF cookie during registration; the browser client has already cached its matching token.
    // Login subsequently clears the client cache, so its next unsafe request obtains a fresh CSRF token.
    reply.header('Set-Cookie', `lexa_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${SESSION_SECONDS}`);
  }

  private async passwordHash(password: string): Promise<string> {
    if (password.length < 12 || password.length > 1024) throw new BadRequestException('Use a password between 12 and 1024 characters.');
    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, 64) as Buffer;
    return `${salt.toString('hex')}:${derived.toString('hex')}`;
  }

  private async passwordMatches(password: string, encoded: string | null): Promise<boolean> {
    if (!encoded) return false;
    const [saltHex, hashHex] = encoded.split(':');
    if (!saltHex || !hashHex) return false;
    try {
      const expected = Buffer.from(hashHex, 'hex');
      const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length) as Buffer;
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    } catch { return false; }
  }

  private async createSession(userId: string, reply: FastifyReply): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000) },
    });
    this.setSessionCookie(reply, token);
  }

  private async sessionFor(request: FastifyRequest): Promise<any> {
    const token = cookieValue(request, 'lexa_session');
    if (!token) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Sign in to continue.' });
    const session = await this.prisma.session.findFirst({
      where: { tokenHash: sha256(token), expiresAt: { gt: new Date() } },
      include: { user: { include: { memberships: { where: { status: 'ACTIVE' }, include: { tenant: true } } } } },
    });
    if (!session) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Your session has expired. Sign in again.' });
    return session;
  }

  private async membershipFor(userId: string, tenantId: string): Promise<any> {
    const membership = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      include: { tenant: true },
    });
    if (!membership || membership.status !== 'ACTIVE') throw new NotFoundException('Workspace not found.');
    return membership;
  }

  private async branchFor(tenantId: string, branchId: string): Promise<any> {
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId } });
    if (!branch) throw new NotFoundException('Branch not found.');
    return branch;
  }

  private async audit(tenantId: string, actorUserId: string | null, action: string, resourceType: string, resourceId?: string, requestId?: string): Promise<void> {
    await this.prisma.auditEvent.create({ data: { tenantId, actorUserId, action, resourceType, resourceId, requestId } });
  }

  private async stockBalance(client: any, tenantId: string, branchId: string, productId: string): Promise<number> {
    const rows = await client.stockMovement.findMany({ where: { tenantId, branchId, productId }, select: { quantityDelta: true } });
    return rows.reduce((sum: number, row: any) => sum + Number(row.quantityDelta), 0);
  }

  private async idempotentResponse(tenantId: string, key: string, requestHash: string): Promise<any | null> {
    const existing = await this.prisma.idempotencyRecord.findUnique({ where: { tenantId_key: { tenantId, key } } });
    if (!existing) return null;
    if (existing.requestHash !== requestHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This request key has already been used for a different request.' });
    if (existing.status === 'COMPLETED' && existing.responseBody) return existing.responseBody;
    throw new ConflictException({ code: 'REQUEST_IN_PROGRESS', message: 'This request is already being processed. Retry with the same request key.' });
  }

  @Get('auth/bootstrap/status')
  async bootstrapStatus(): Promise<{ available: boolean }> {
    // Never expose an open first-admin registration endpoint on the public API.
    return { available: Boolean(process.env.LEXA_BOOTSTRAP_SECRET) && (await this.prisma.user.count()) === 0 };
  }

  @Get('auth/csrf')
  csrf(@Res({ passthrough: true }) reply: FastifyReply): { token: string } {
    const token = randomBytes(32).toString('base64url');
    this.setCsrfCookie(reply, token);
    return { token };
  }

  @Post('auth/register')
  @UseGuards(CsrfGuard)
  async register(@Body() raw: unknown, @Req() request: RequestWithBody, @Res({ passthrough: true }) reply: FastifyReply) {
    const body = asObject(raw);
    const expectedBootstrapSecret = process.env.LEXA_BOOTSTRAP_SECRET;
    if (!expectedBootstrapSecret) throw new ServiceUnavailableException({ code: 'BOOTSTRAP_NOT_CONFIGURED', message: 'First-account setup has not been enabled by the administrator.' });
    const suppliedBootstrapSecret = requiredString(body.bootstrapSecret, 'One-time setup code', 256);
    const expectedBytes = Buffer.from(expectedBootstrapSecret);
    const suppliedBytes = Buffer.from(suppliedBootstrapSecret);
    if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
      throw new UnauthorizedException({ code: 'BOOTSTRAP_CODE_INVALID', message: 'The one-time setup code is invalid.' });
    }
    const displayName = requiredString(body.displayName, 'Display name', 100);
    const email = requiredString(body.email, 'Email', 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Enter a valid email address.');
    const password = requiredString(body.password, 'Password', 1024);
    const passwordHash = await this.passwordHash(password);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const existingUsers = await tx.user.count();
        if (existingUsers !== 0) throw new ConflictException({ code: 'BOOTSTRAP_CLOSED', message: 'The first administrator account has already been created.' });
        return tx.user.create({ data: { email, displayName, passwordHash } });
      }, { isolationLevel: 'Serializable' });
      await this.createSession(user.id, reply);
      return { user: { id: user.id, email: user.email, displayName: user.displayName ?? undefined }, roles: ['owner'] };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      const maybe = error as { code?: string };
      if (maybe.code === 'P2002') throw new ConflictException('An account with this email already exists.');
      throw error;
    }
  }

  @Post('auth/login')
  @UseGuards(CsrfGuard)
  async login(@Body() raw: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const body = asObject(raw);
    const email = requiredString(body.email, 'Email', 254).toLowerCase();
    const password = requiredString(body.password, 'Password', 1024);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await this.passwordMatches(password, user.passwordHash))) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' });
    }
    await this.createSession(user.id, reply);
    const memberships = await this.prisma.membership.findMany({ where: { userId: user.id, status: 'ACTIVE' } });
    return { user: { id: user.id, email: user.email, displayName: user.displayName ?? undefined }, roles: [...new Set(memberships.map((m) => m.role))] };
  }

  @Get('auth/session')
  async authenticatedSession(@Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    return {
      user: { id: session.user.id, email: session.user.email, displayName: session.user.displayName ?? undefined },
      roles: [...new Set(session.user.memberships.map((m: any) => m.role))],
    };
  }

  @Get('session')
  async sessionAlias(@Req() request: FastifyRequest) {
    return this.authenticatedSession(request);
  }

  @Post('auth/logout')
  @UseGuards(CsrfGuard)
  @HttpCode(204)
  async logout(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply): Promise<void> {
    const token = cookieValue(request, 'lexa_session');
    if (token) await this.prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
    reply.header('Set-Cookie', [
      'lexa_session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0',
      'lexa_csrf=; Path=/; Secure; SameSite=None; Max-Age=0',
    ]);
  }

  @Post('auth/password/forgot')
  @UseGuards(CsrfGuard)
  @HttpCode(202)
  async forgotPassword(@Body() raw: unknown): Promise<{ accepted: true }> {
    const body = asObject(raw);
    const email = requiredString(body.email, 'Email', 254).toLowerCase();
    const deliveryUrl = process.env.PASSWORD_RESET_DELIVERY_URL;
    const frontendUrl = process.env.FRONTEND_PUBLIC_URL ?? 'https://lexareview.vercel.app';
    if (!deliveryUrl) throw new ServiceUnavailableException({ code: 'PASSWORD_RESET_DELIVERY_NOT_CONFIGURED', message: 'Password recovery delivery is not configured yet. Contact the administrator.' });
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      const rawToken = randomBytes(32).toString('base64url');
      const tokenHash = sha256(rawToken);
      await this.prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + RESET_SECONDS * 1000) } });
      const resetUrl = `${frontendUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}`;
      try {
        const response = await fetch(deliveryUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, displayName: user.displayName, resetUrl, expiresInMinutes: RESET_SECONDS / 60 }) });
        if (!response.ok) throw new Error(`Delivery returned ${response.status}`);
      } catch {
        await this.prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
        throw new ServiceUnavailableException({ code: 'PASSWORD_RESET_DELIVERY_FAILED', message: 'Recovery instructions could not be delivered. Contact the administrator.' });
      }
    }
    return { accepted: true };
  }

  @Post('auth/password/reset')
  @UseGuards(CsrfGuard)
  @HttpCode(204)
  async resetPassword(@Body() raw: unknown): Promise<void> {
    const body = asObject(raw);
    const token = requiredString(body.token, 'Recovery token', 500);
    const passwordHash = await this.passwordHash(requiredString(body.password, 'Password', 1024));
    const row = await this.prisma.passwordResetToken.findFirst({ where: { tokenHash: sha256(token), consumedAt: null, expiresAt: { gt: new Date() } } });
    if (!row) throw new BadRequestException({ code: 'RESET_TOKEN_INVALID', message: 'This recovery link is expired or invalid. Request a new one.' });
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.passwordResetToken.updateMany({ where: { id: row.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
      if (updated.count !== 1) throw new BadRequestException('This recovery link has already been used.');
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: row.userId } });
    });
  }

  @Get('workspaces')
  async listWorkspaces(@Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    const memberships = await this.prisma.membership.findMany({ where: { userId: session.userId, status: 'ACTIVE' }, include: { tenant: true }, orderBy: { createdAt: 'asc' } });
    return memberships.map((membership) => toWorkspace(membership.tenant));
  }

  @Post('workspaces')
  @UseGuards(CsrfGuard)
  async createWorkspace(@Body() raw: unknown, @Req() request: RequestWithBody) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    const businessName = requiredString(body.businessName, 'Business name', 100);
    const businessType = requiredString(body.businessType ?? 'general', 'Business type', 80);
    const branchName = requiredString(body.branchName ?? 'Main branch', 'Branch name', 80);
    const currency = requiredString(body.currency ?? 'UGX', 'Currency', 3).toUpperCase();
    const timezone = requiredString(body.timezone ?? 'Africa/Kampala', 'Timezone', 80);
    if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('Currency must be a three-letter ISO currency code.');
    const tenant = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({ data: { name: businessName, slug: `${slugify(businessName)}-${randomBytes(3).toString('hex')}`, businessType, currency, timezone } });
      await tx.membership.create({ data: { tenantId: created.id, userId: session.userId, role: 'owner', status: 'ACTIVE' } });
      await tx.branch.create({ data: { tenantId: created.id, code: 'MAIN', name: branchName, timezone, currency } });
      await tx.auditEvent.create({ data: { tenantId: created.id, actorUserId: session.userId, action: 'workspace.created', resourceType: 'workspace', resourceId: created.id, requestId: request.headers['x-request-id'] as string | undefined } });
      return created;
    });
    return toWorkspace(tenant);
  }

  @Get('workspaces/:workspaceId')
  async getWorkspace(@Param('workspaceId') workspaceId: string, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    const membership = await this.membershipFor(session.userId, workspaceId);
    return toWorkspace(membership.tenant);
  }

  @Patch('workspaces/:workspaceId')
  @UseGuards(CsrfGuard)
  async updateWorkspace(@Param('workspaceId') workspaceId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    const membership = await this.membershipFor(session.userId, workspaceId);
    if (!['owner', 'admin'].includes(membership.role)) throw new ForbiddenException('You do not have permission to update this workspace.');
    const data: Record<string, string> = {};
    if (body.businessName !== undefined) data.name = requiredString(body.businessName, 'Business name', 100);
    if (body.businessType !== undefined) data.businessType = requiredString(body.businessType, 'Business type', 80);
    if (body.timezone !== undefined) data.timezone = requiredString(body.timezone, 'Timezone', 80);
    if (!Object.keys(data).length) throw new BadRequestException('No supported workspace fields were supplied.');
    const updated = await this.prisma.tenant.update({ where: { id: workspaceId }, data });
    await this.audit(workspaceId, session.userId, 'workspace.updated', 'workspace', workspaceId, request.headers['x-request-id'] as string | undefined);
    return toWorkspace(updated);
  }

  @Get('workspaces/:workspaceId/branches')
  async listBranches(@Param('workspaceId') workspaceId: string, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const rows = await this.prisma.branch.findMany({ where: { tenantId: workspaceId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toBranch);
  }

  @Post('workspaces/:workspaceId/branches')
  @UseGuards(CsrfGuard)
  async createBranch(@Param('workspaceId') workspaceId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    const membership = await this.membershipFor(session.userId, workspaceId);
    if (!['owner', 'admin'].includes(membership.role)) throw new ForbiddenException('You do not have permission to create branches.');
    const name = requiredString(body.name, 'Branch name', 80);
    const address = optionalString(body.address, 250);
    const code = `${slugify(name).replace(/-/g, '').toUpperCase().slice(0, 8)}${randomBytes(2).toString('hex').toUpperCase()}`;
    const branch = await this.prisma.branch.create({ data: { tenantId: workspaceId, name, code, address, timezone: membership.tenant.timezone, currency: membership.tenant.currency } });
    await this.audit(workspaceId, session.userId, 'branch.created', 'branch', branch.id, request.headers['x-request-id'] as string | undefined);
    return toBranch(branch);
  }

  @Get('workspaces/:workspaceId/memberships/:userId/branches')
  async listMemberBranches(@Param('workspaceId') workspaceId: string, @Param('userId') userId: string, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    const actor = await this.membershipFor(session.userId, workspaceId);
    if (!['owner', 'admin'].includes(actor.role)) throw new ForbiddenException('Only workspace owners and administrators can manage branch access.');
    const target = await this.prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: workspaceId, userId } }, select: { userId: true, status: true, role: true } });
    if (!target) throw new NotFoundException('Workspace member not found.');
    const rows = await this.prisma.$queryRaw<Array<{ branchId: string }>>`SELECT branch_id AS "branchId" FROM branch_memberships WHERE tenant_id=${workspaceId}::uuid AND user_id=${userId}::uuid ORDER BY branch_id`;
    return { userId, role: target.role, status: target.status, branchIds: rows.map((row) => row.branchId), allBranches: rows.length === 0 };
  }

  @Put('workspaces/:workspaceId/memberships/:userId/branches')
  @UseGuards(CsrfGuard)
  async replaceMemberBranches(@Param('workspaceId') workspaceId: string, @Param('userId') userId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    const actor = await this.membershipFor(session.userId, workspaceId);
    if (!['owner', 'admin'].includes(actor.role)) throw new ForbiddenException('Only workspace owners and administrators can manage branch access.');
    const target = await this.prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: workspaceId, userId } }, select: { userId: true, status: true, role: true } });
    if (!target || target.status !== 'ACTIVE') throw new NotFoundException('Active workspace member not found.');
    if (!Array.isArray(body.branchIds) || body.branchIds.length > 500 || body.branchIds.some((id) => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) throw new BadRequestException('Branch IDs must be an array of valid branch UUIDs.');
    const branchIds = [...new Set(body.branchIds as string[])];
    const branches = await this.prisma.branch.findMany({ where: { tenantId: workspaceId, id: { in: branchIds } }, select: { id: true } });
    if (branches.length !== branchIds.length) throw new BadRequestException('Every selected branch must belong to this workspace.');
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM branch_memberships WHERE tenant_id=${workspaceId}::uuid AND user_id=${userId}::uuid`;
      if (branchIds.length) await tx.$executeRaw`INSERT INTO branch_memberships (tenant_id,branch_id,user_id,created_by_user_id) SELECT ${workspaceId}::uuid, value::uuid, ${userId}::uuid, ${session.userId}::uuid FROM unnest(${branchIds}::uuid[]) AS value`;
      await tx.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: session.userId, action: 'membership.branch_scope_updated', resourceType: 'membership', resourceId: userId, requestId: request.headers['x-request-id'] as string | undefined, metadata: { branchIds } } });
    }, { isolationLevel: 'Serializable' });
    return { userId, branchIds, allBranches: branchIds.length === 0 };
  }

  @Get('workspaces/:workspaceId/categories')
  async listCategories(@Param('workspaceId') workspaceId: string, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const categories = await this.prisma.category.findMany({ where: { tenantId: workspaceId }, orderBy: { name: 'asc' } });
    return categories.map((c) => ({ id: c.id, workspaceId: c.tenantId, name: c.name, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() }));
  }

  @Get('workspaces/:workspaceId/products')
  async listProducts(@Param('workspaceId') workspaceId: string, @Query('search') search: string | undefined, @Query('activeOnly') activeOnly: string | undefined, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const where: any = { tenantId: workspaceId };
    if (activeOnly === 'true') where.active = true;
    if (search?.trim()) where.OR = [{ name: { contains: search.trim(), mode: 'insensitive' } }, { sku: { contains: search.trim(), mode: 'insensitive' } }, { barcode: { contains: search.trim(), mode: 'insensitive' } }];
    const products = await this.prisma.product.findMany({ where, orderBy: { name: 'asc' }, take: 1000 });
    return products.map(toProduct);
  }

  @Post('workspaces/:workspaceId/products')
  @UseGuards(CsrfGuard)
  async createProduct(@Param('workspaceId') workspaceId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const name = requiredString(body.name, 'Product name', 150);
    const sku = requiredString(body.sku, 'SKU', 100);
    const categoryName = optionalString(body.categoryName, 100);
    const costPriceMinor = moneyMinor(body.costPriceMinor, 'Cost price');
    const sellingPriceMinor = moneyMinor(body.sellingPriceMinor, 'Selling price');
    const lowStockThreshold = body.lowStockThreshold === undefined ? 0 : Number(body.lowStockThreshold);
    if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) throw new BadRequestException('Low-stock threshold must be zero or greater.');
    let categoryId: string | undefined;
    if (categoryName) {
      const category = await this.prisma.category.upsert({ where: { tenantId_name: { tenantId: workspaceId, name: categoryName } }, create: { tenantId: workspaceId, name: categoryName }, update: {} });
      categoryId = category.id;
    }
    try {
      const product = await this.prisma.product.create({ data: {
        tenantId: workspaceId, name, sku, categoryId,
        barcode: optionalString(body.barcode, 100), brand: optionalString(body.brand, 100),
        unitOfMeasure: optionalString(body.unitOfMeasure, 40), supplierSku: optionalString(body.supplierSku, 100),
        costPriceMinor, sellingPriceMinor, lowStockThreshold: String(lowStockThreshold),
        trackStock: body.trackStock !== false, active: true,
      } });
      await this.audit(workspaceId, session.userId, 'product.created', 'product', product.id, request.headers['x-request-id'] as string | undefined);
      return toProduct(product);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('This SKU already exists in the workspace.');
      throw error;
    }
  }

  @Patch('workspaces/:workspaceId/products/:productId')
  @UseGuards(CsrfGuard)
  async updateProduct(@Param('workspaceId') workspaceId: string, @Param('productId') productId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const existing = await this.prisma.product.findFirst({ where: { id: productId, tenantId: workspaceId } });
    if (!existing) throw new NotFoundException('Product not found.');
    let categoryId: string | null | undefined = existing.categoryId;
    if (body.categoryName !== undefined) {
      const categoryName = optionalString(body.categoryName, 100);
      if (!categoryName) categoryId = null;
      else categoryId = (await this.prisma.category.upsert({ where: { tenantId_name: { tenantId: workspaceId, name: categoryName } }, create: { tenantId: workspaceId, name: categoryName }, update: {} })).id;
    } else if (body.categoryId !== undefined) categoryId = optionalString(body.categoryId, 100) ?? null;
    try {
      const product = await this.prisma.product.update({ where: { id: existing.id }, data: {
        name: body.name === undefined ? existing.name : requiredString(body.name, 'Product name', 150),
        sku: body.sku === undefined ? existing.sku : requiredString(body.sku, 'SKU', 100),
        barcode: body.barcode === undefined ? existing.barcode : optionalString(body.barcode, 100) ?? null,
        brand: body.brand === undefined ? existing.brand : optionalString(body.brand, 100) ?? null,
        unitOfMeasure: body.unitOfMeasure === undefined ? existing.unitOfMeasure : optionalString(body.unitOfMeasure, 40) ?? null,
        supplierSku: body.supplierSku === undefined ? existing.supplierSku : optionalString(body.supplierSku, 100) ?? null,
        categoryId,
        costPriceMinor: body.costPriceMinor === undefined ? existing.costPriceMinor : moneyMinor(body.costPriceMinor, 'Cost price'),
        sellingPriceMinor: body.sellingPriceMinor === undefined ? existing.sellingPriceMinor : moneyMinor(body.sellingPriceMinor, 'Selling price'),
        lowStockThreshold: body.lowStockThreshold === undefined ? existing.lowStockThreshold : String(Number(body.lowStockThreshold)),
        trackStock: body.trackStock === undefined ? existing.trackStock : body.trackStock === true,
        active: body.active === undefined ? existing.active : body.active === true,
      } });
      await this.audit(workspaceId, session.userId, 'product.updated', 'product', product.id, request.headers['x-request-id'] as string | undefined);
      return toProduct(product);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('This SKU already exists in the workspace.');
      throw error;
    }
  }

  @Get('workspaces/:workspaceId/branches/:branchId/inventory/movements')
  async listMovements(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Query('limit') limit: string | undefined, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    await this.branchFor(workspaceId, branchId);
    const take = Math.min(1000, Math.max(1, Number.parseInt(limit ?? '100', 10) || 100));
    const rows = await this.prisma.stockMovement.findMany({ where: { tenantId: workspaceId, branchId }, orderBy: { createdAt: 'desc' }, take });
    return rows.map(toMovement);
  }

  @Post('workspaces/:workspaceId/branches/:branchId/inventory/movements')
  @UseGuards(CsrfGuard)
  async recordMovement(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Body() raw: unknown, @Req() request: RequestWithBody) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    const membership = await this.membershipFor(session.userId, workspaceId);
    await this.branchFor(workspaceId, branchId);
    const productId = requiredString(body.productId, 'Product ID', 80);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) throw new BadRequestException('Product ID is invalid.');
    const delta = Number(body.quantityDelta);
    const reason = requiredString(body.reason, 'Reason', 500);
    const type = body.movementType === 'opening' ? 'opening' : 'adjustment';
    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 1_000_000 || Math.round(delta * 1000) !== delta * 1000) throw new BadRequestException('Quantity adjustment must be a non-zero number, no greater than one million, with at most three decimal places.');
    const rawKey = request.headers['idempotency-key'];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!key || key.length > 200) throw new BadRequestException('Idempotency-Key header is required for inventory adjustments.');
    const requestHash = sha256(JSON.stringify({ workspaceId, branchId, productId, delta, reason, type }));
    const duplicate = await this.idempotentResponse(workspaceId, key, requestHash);
    if (duplicate) return duplicate;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.idempotencyRecord.findUnique({ where: { tenantId_key: { tenantId: workspaceId, key } } });
        if (existing) {
          if (existing.requestHash !== requestHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This request key has already been used for different inventory data.' });
          if (existing.status === 'COMPLETED' && existing.responseBody) return existing.responseBody as any;
          throw new ConflictException({ code: 'REQUEST_IN_PROGRESS', message: 'This inventory adjustment is already being processed. Retry with the same request key.' });
        }
        await tx.idempotencyRecord.create({ data: { tenantId: workspaceId, key, requestHash, status: 'IN_PROGRESS', expiresAt: new Date(Date.now() + IDEMPOTENCY_SECONDS * 1000) } });
        const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM products WHERE id = ${productId}::uuid AND tenant_id = ${workspaceId}::uuid FOR UPDATE`;
        if (!locked.length) throw new NotFoundException('Product not found.');
        const product = await tx.product.findFirst({ where: { id: productId, tenantId: workspaceId } });
        if (!product) throw new NotFoundException('Product not found.');
        const aggregate = await tx.stockMovement.aggregate({ where: { tenantId: workspaceId, branchId, productId }, _sum: { quantityDelta: true } });
        const balance = Number(aggregate._sum.quantityDelta ?? 0);
        if (product.trackStock && balance + delta < 0) throw new ConflictException({ code: 'INSUFFICIENT_STOCK', message: 'This adjustment would make stock negative.' });
        const movement = await tx.stockMovement.create({ data: { tenantId: workspaceId, branchId, productId, type, quantityDelta: String(delta), reason } });
        await tx.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: session.userId, action: 'inventory.movement.created', resourceType: 'stock_movement', resourceId: movement.id, requestId: request.headers['x-request-id'] as string | undefined } });
        const response = toMovement(movement);
        await tx.idempotencyRecord.update({ where: { tenantId_key: { tenantId: workspaceId, key } }, data: { status: 'COMPLETED', responseStatus: 201, responseBody: response as any } });
        return response;
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const retry = await this.idempotentResponse(workspaceId, key, requestHash);
        if (retry) return retry;
      }
      if ((error as { code?: string }).code === 'P2034') throw new ConflictException({ code: 'INVENTORY_CONCURRENCY_CONFLICT', message: 'Inventory changed during this adjustment. Retry using the same request key.' });
      throw error;
    }
  }

  @Get('workspaces/:workspaceId/branches/:branchId/inventory/balances')
  async inventoryBalances(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    await this.branchFor(workspaceId, branchId);
    const rows = await this.prisma.stockMovement.findMany({ where: { tenantId: workspaceId, branchId }, select: { productId: true, quantityDelta: true } });
    const balances: Record<string, number> = {};
    for (const row of rows) balances[row.productId] = (balances[row.productId] ?? 0) + Number(row.quantityDelta);
    return balances;
  }

  @Get('workspaces/:workspaceId/branches/:branchId/modules/:moduleId/records')
  async listModuleRecords(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('moduleId') moduleId: string, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    await this.branchFor(workspaceId, branchId);
    const rows = await this.prisma.moduleRecord.findMany({ where: { tenantId: workspaceId, branchId, moduleId }, orderBy: { updatedAt: 'desc' }, take: 5000 });
    return rows.map(toModuleRecord);
  }

  @Put('workspaces/:workspaceId/branches/:branchId/modules/:moduleId/records')
  @UseGuards(CsrfGuard)
  async replaceModuleRecords(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('moduleId') moduleId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    const membership = await this.membershipFor(session.userId, workspaceId);
    if (!['owner', 'admin'].includes(membership.role)) throw new ForbiddenException('Only workspace administrators can replace a complete module collection.');
    await this.branchFor(workspaceId, branchId);
    if (!Array.isArray(body.records) || body.records.length > 5000) throw new BadRequestException('Records must be an array with no more than 5000 items.');
    const records = body.records.map((rawRecord) => {
      const record = asObject(rawRecord, 'record');
      const id = requiredString(record.id, 'Record ID', 160);
      if (typeof record.status !== 'string' || typeof record.updatedAt !== 'string') throw new BadRequestException('Each record must contain a status and updatedAt value.');
      return { recordId: id, data: record };
    });
    if (new Set(records.map((r) => r.recordId)).size !== records.length) throw new BadRequestException('Record IDs must be unique within a module.');
    await this.prisma.$transaction(async (tx) => {
      await tx.moduleRecord.deleteMany({ where: { tenantId: workspaceId, branchId, moduleId } });
      if (records.length) await tx.moduleRecord.createMany({ data: records.map((r) => ({ tenantId: workspaceId, branchId, moduleId, recordId: r.recordId, data: r.data as any, createdAt: new Date(), updatedAt: new Date() })) });
      await tx.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: session.userId, action: 'module.records.replaced', resourceType: 'module', resourceId: moduleId, requestId: request.headers['x-request-id'] as string | undefined, metadata: { count: records.length } } });
    });
    const saved = await this.prisma.moduleRecord.findMany({ where: { tenantId: workspaceId, branchId, moduleId }, orderBy: { updatedAt: 'desc' } });
    return saved.map(toModuleRecord);
  }

  @Delete('workspaces/:workspaceId/branches/:branchId/modules/:moduleId/records')
  @UseGuards(CsrfGuard)
  @HttpCode(204)
  async deleteModuleRecords(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('moduleId') moduleId: string, @Req() request: FastifyRequest): Promise<void> {
    const session = await this.sessionFor(request);
    const membership = await this.membershipFor(session.userId, workspaceId);
    if (!['owner', 'admin'].includes(membership.role)) throw new ForbiddenException('Only workspace administrators can clear a module collection.');
    await this.branchFor(workspaceId, branchId);
    await this.prisma.$transaction(async (tx) => {
      await tx.moduleRecord.deleteMany({ where: { tenantId: workspaceId, branchId, moduleId } });
      await tx.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: session.userId, action: 'module.records.cleared', resourceType: 'module', resourceId: moduleId, requestId: request.headers['x-request-id'] as string | undefined } });
    });
  }

  @Put('workspaces/:workspaceId/branches/:branchId/modules/:moduleId/records/:recordId')
  @UseGuards(CsrfGuard)
  async saveModuleRecord(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('moduleId') moduleId: string, @Param('recordId') recordId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw, 'record');
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    await this.branchFor(workspaceId, branchId);
    const bodyId = requiredString(body.id, 'Record ID', 160);
    if (bodyId !== recordId) throw new BadRequestException('The record ID in the URL and body must match.');
    if (typeof body.status !== 'string' || !body.status.trim()) throw new BadRequestException('Record status is required.');
    const row = await this.prisma.moduleRecord.upsert({
      where: { tenantId_branchId_moduleId_recordId: { tenantId: workspaceId, branchId, moduleId, recordId } },
      create: { tenantId: workspaceId, branchId, moduleId, recordId, data: body as any },
      update: { data: body as any, version: { increment: 1 } },
    });
    await this.audit(workspaceId, session.userId, 'module.record.saved', 'module_record', row.id, request.headers['x-request-id'] as string | undefined);
    return toModuleRecord(row);
  }

  @Patch('workspaces/:workspaceId/branches/:branchId/modules/:moduleId/records/:recordId/status')
  @UseGuards(CsrfGuard)
  async updateModuleStatus(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('moduleId') moduleId: string, @Param('recordId') recordId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const status = requiredString(body.status, 'Status', 80);
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    await this.branchFor(workspaceId, branchId);
    const row = await this.prisma.moduleRecord.findUnique({ where: { tenantId_branchId_moduleId_recordId: { tenantId: workspaceId, branchId, moduleId, recordId } } });
    if (!row) throw new NotFoundException('Record not found.');
    const current = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {};
    const updated = await this.prisma.moduleRecord.update({ where: { id: row.id }, data: { data: { ...current, status, updatedAt: new Date().toISOString() } as any, version: { increment: 1 } } });
    await this.audit(workspaceId, session.userId, 'module.record.status_changed', 'module_record', row.id, request.headers['x-request-id'] as string | undefined);
    const records = await this.prisma.moduleRecord.findMany({ where: { tenantId: workspaceId, branchId, moduleId }, orderBy: { updatedAt: 'desc' } });
    return records.map(toModuleRecord);
  }

  @Get('workspaces/:workspaceId/sales')
  async listSales(@Param('workspaceId') workspaceId: string, @Query('limit') limit: string | undefined, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const take = Math.min(1000, Math.max(1, Number.parseInt(limit ?? '100', 10) || 100));
    const rows = await this.prisma.sale.findMany({ where: { tenantId: workspaceId }, orderBy: { createdAt: 'desc' }, take });
    return rows.map(toSale);
  }

  @Get('workspaces/:workspaceId/sales/:saleId')
  async getSale(@Param('workspaceId') workspaceId: string, @Param('saleId') saleId: string, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const sale = await this.prisma.sale.findFirst({ where: { tenantId: workspaceId, id: saleId }, include: { lines: true, payments: true, returns: { include: { lines: true } } } });
    if (!sale) throw new NotFoundException('Sale not found.');
    return {
      sale: toSale(sale),
      lines: sale.lines.map((line: any) => ({ id: line.id, workspaceId: line.tenantId, saleId: line.saleId, productId: line.productId, productNameSnapshot: line.productNameSnapshot, quantity: Number(line.quantity), unitPriceMinor: line.unitPriceMinor, lineTotalMinor: line.lineTotalMinor })),
      returns: sale.returns.map((r: any) => ({ id: r.id, workspaceId: r.tenantId, branchId: r.branchId, saleId: r.saleId, returnNumber: r.returnNumber, totalMinor: r.totalMinor, reason: r.reason, refundRecorded: r.refundRecorded, createdAt: r.createdAt.toISOString() })),
      returnLines: sale.returns.flatMap((r: any) => r.lines.map((line: any) => ({ id: line.id, workspaceId: line.tenantId, returnId: line.returnId, originalSaleLineId: line.originalSaleLineId, productId: line.productId, productNameSnapshot: line.productNameSnapshot, quantity: Number(line.quantity), unitPriceMinor: line.unitPriceMinor, lineTotalMinor: line.lineTotalMinor }))),
      payments: sale.payments.map((p: any) => ({ id: p.id, workspaceId: p.tenantId, saleId: p.saleId, kind: p.kind, method: p.method, amountMinor: p.amountMinor, ...(p.reference ? { reference: p.reference } : {}), createdAt: p.createdAt.toISOString() })),
    };
  }

  @Post('workspaces/:workspaceId/branches/:branchId/sales/complete')
  @UseGuards(CsrfGuard)
  async completeSale(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Body() raw: unknown, @Req() request: RequestWithBody) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    await this.branchFor(workspaceId, branchId);
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 200) throw new BadRequestException('A sale must contain between 1 and 200 items.');
    const items = body.items.map((item) => {
      const row = asObject(item, 'sale item');
      return { productId: requiredString(row.productId, 'Product ID', 80), quantity: positiveQuantity(row.quantity) };
    });
    const promisedPaymentDateValue = optionalString(body.promisedPaymentDate, 20);
    if (promisedPaymentDateValue) {
      const parsedDate = new Date(`${promisedPaymentDateValue}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(promisedPaymentDateValue) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== promisedPaymentDateValue) {
        throw new BadRequestException('Promised payment date must be a valid calendar date in YYYY-MM-DD format.');
      }
    }
    const payments = Array.isArray(body.payments) ? body.payments.map((item) => {
      const row = asObject(item, 'payment');
      const method = requiredString(row.method, 'Payment method', 40);
      if (!PAYMENT_METHODS.has(method)) throw new BadRequestException('Unsupported payment method.');
      return { method, amountMinor: moneyMinor(row.amountMinor, 'Payment amount'), reference: optionalString(row.reference, 200) };
    }) : [];
    const idempotencyKey = request.headers['idempotency-key'];
    const key = Array.isArray(idempotencyKey) ? idempotencyKey[0] : idempotencyKey;
    if (!key || key.length > 200) throw new BadRequestException('Idempotency-Key header is required for completing a sale.');
    const requestHash = sha256(JSON.stringify({ items, payments, customerName: body.customerName ?? null, customerPhone: body.customerPhone ?? null, promisedPaymentDate: promisedPaymentDateValue ?? null }));
    const duplicate = await this.idempotentResponse(workspaceId, key, requestHash);
    if (duplicate) return duplicate;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const already = await tx.idempotencyRecord.findUnique({ where: { tenantId_key: { tenantId: workspaceId, key } } });
        if (already) {
          if (already.requestHash !== requestHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This request key was used for different sale data.' });
          if (already.status === 'COMPLETED' && already.responseBody) return already.responseBody as any;
          throw new ConflictException({ code: 'REQUEST_IN_PROGRESS', message: 'This sale request is already being processed.' });
        }
        await tx.idempotencyRecord.create({ data: { tenantId: workspaceId, key, requestHash, status: 'IN_PROGRESS', expiresAt: new Date(Date.now() + IDEMPOTENCY_SECONDS * 1000) } });
        const productIds = [...new Set(items.map((item) => item.productId))].sort();
        if (productIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) throw new BadRequestException('A product ID is invalid.');
        await tx.$queryRaw`SELECT id FROM products WHERE tenant_id = ${workspaceId}::uuid AND id = ANY(${productIds}::uuid[]) ORDER BY id FOR UPDATE`;
        const createdLines: any[] = [];
        const requestedStock = new Map<string, number>();
        for (const item of items) requestedStock.set(item.productId, (requestedStock.get(item.productId) ?? 0) + item.quantity);
        let totalMinor = 0;
        const stockValidatedProducts = new Set<string>();
        for (const item of items) {
          const product = await tx.product.findFirst({ where: { id: item.productId, tenantId: workspaceId, active: true } });
          if (!product) throw new NotFoundException('One of the selected products is unavailable.');
          const lineTotalMinor = Math.round(product.sellingPriceMinor * item.quantity);
          if (!Number.isSafeInteger(lineTotalMinor) || lineTotalMinor < 0) throw new BadRequestException('A product total is outside the supported range.');
          if (product.trackStock && !stockValidatedProducts.has(product.id)) {
            const rows = await tx.stockMovement.findMany({ where: { tenantId: workspaceId, branchId, productId: product.id }, select: { quantityDelta: true } });
            const balance = rows.reduce((sum: number, r: any) => sum + Number(r.quantityDelta), 0);
            const requestedQuantity = requestedStock.get(product.id) ?? item.quantity;
            if (balance < requestedQuantity) throw new ConflictException({ code: 'INSUFFICIENT_STOCK', message: `${product.name} does not have enough stock to complete this sale.` });
            stockValidatedProducts.add(product.id);
          }
          createdLines.push({ product, quantity: item.quantity, unitPriceMinor: product.sellingPriceMinor, lineTotalMinor });
          totalMinor += lineTotalMinor;
          if (!Number.isSafeInteger(totalMinor) || totalMinor > 2_000_000_000) throw new BadRequestException('Sale total exceeds the supported amount.');
        }
        const paidMinor = payments.reduce((sum, p) => sum + p.amountMinor, 0);
        if (paidMinor > totalMinor) throw new BadRequestException('Recorded payments cannot exceed the sale total.');
        const receiptNumber = `LX-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(4).toString('hex').toUpperCase()}`;
        const sale = await tx.sale.create({ data: {
          tenantId: workspaceId, branchId, receiptNumber, customerName: optionalString(body.customerName, 150), customerPhone: optionalString(body.customerPhone, 80),
          promisedPaymentDate: promisedPaymentDateValue ? new Date(`${promisedPaymentDateValue}T00:00:00.000Z`) : null,
          totalMinor, status: 'completed',
        } });
        for (const line of createdLines) {
          await tx.saleLine.create({ data: { tenantId: workspaceId, saleId: sale.id, productId: line.product.id, productNameSnapshot: line.product.name, quantity: String(line.quantity), unitPriceMinor: line.unitPriceMinor, lineTotalMinor: line.lineTotalMinor } });
          if (line.product.trackStock) await tx.stockMovement.create({ data: { tenantId: workspaceId, branchId, productId: line.product.id, type: 'sale', quantityDelta: String(-line.quantity), reason: `Sale ${receiptNumber}`, sourceId: sale.id } });
        }
        for (const payment of payments) await tx.salePayment.create({ data: { tenantId: workspaceId, saleId: sale.id, kind: 'receipt', method: payment.method, amountMinor: payment.amountMinor, reference: payment.reference } });
        await tx.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: session.userId, action: 'sale.completed', resourceType: 'sale', resourceId: sale.id, requestId: request.headers['x-request-id'] as string | undefined } });
        const response = { sale: toSale(sale) };
        await tx.idempotencyRecord.update({ where: { tenantId_key: { tenantId: workspaceId, key } }, data: { status: 'COMPLETED', responseStatus: 201, responseBody: response as any } });
        return response;
      }, { isolationLevel: 'Serializable' });
      return result;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const retry = await this.idempotentResponse(workspaceId, key, requestHash);
        if (retry) return retry;
      }
      if ((error as { code?: string }).code === 'P2034') throw new ConflictException({ code: 'SALES_CONCURRENCY_CONFLICT', message: 'The sale conflicted with another inventory operation. Retry using the same request key.' });
      throw error;
    }
  }

  @Post('workspaces/:workspaceId/branches/:branchId/sales/:saleId/payments')
  @UseGuards(CsrfGuard)
  async receivePayment(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('saleId') saleId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    await this.branchFor(workspaceId, branchId);
    const amountMinor = moneyMinor(body.amountMinor, 'Payment amount', false);
    const method = requiredString(body.method, 'Payment method', 40);
    if (!PAYMENT_METHODS.has(method)) throw new BadRequestException('Unsupported payment method.');
    const reference = optionalString(body.reference, 200);
    const rawKey = request.headers['idempotency-key'];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!key || key.length > 200) throw new BadRequestException('Idempotency-Key header is required for recording a payment.');
    const requestHash = sha256(JSON.stringify({ workspaceId, branchId, saleId, amountMinor, method, reference: reference ?? null }));
    const duplicate = await this.idempotentResponse(workspaceId, key, requestHash);
    if (duplicate) return duplicate;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.idempotencyRecord.findUnique({ where: { tenantId_key: { tenantId: workspaceId, key } } });
        if (existing) {
          if (existing.requestHash !== requestHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This request key was used for different payment data.' });
          if (existing.status === 'COMPLETED' && existing.responseBody) return existing.responseBody as any;
          throw new ConflictException({ code: 'REQUEST_IN_PROGRESS', message: 'This payment request is already being processed.' });
        }
        await tx.idempotencyRecord.create({ data: { tenantId: workspaceId, key, requestHash, status: 'IN_PROGRESS', expiresAt: new Date(Date.now() + IDEMPOTENCY_SECONDS * 1000) } });
        const lockedSale = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM sales WHERE id = ${saleId}::uuid AND tenant_id = ${workspaceId}::uuid AND branch_id = ${branchId}::uuid FOR UPDATE`;
        if (!lockedSale.length) throw new NotFoundException('Sale not found.');
        const sale = await tx.sale.findFirst({ where: { id: saleId, tenantId: workspaceId, branchId } });
        if (!sale) throw new NotFoundException('Sale not found.');
        const priorPayments = await tx.salePayment.findMany({ where: { tenantId: workspaceId, saleId } });
        const alreadyPaid = priorPayments.reduce((sum: number, p: any) => sum + (p.kind === 'refund' ? -p.amountMinor : p.amountMinor), 0);
        const balance = sale.totalMinor - alreadyPaid;
        if (amountMinor > balance) throw new ConflictException('Payment exceeds the current outstanding balance.');
        const payment = await tx.salePayment.create({ data: { tenantId: workspaceId, saleId, kind: 'receipt', method, amountMinor, reference } });
        await tx.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: session.userId, action: 'sale.payment.received', resourceType: 'sale_payment', resourceId: payment.id, requestId: request.headers['x-request-id'] as string | undefined } });
        const response = { payment: { id: payment.id, workspaceId, saleId, kind: payment.kind, method: payment.method, amountMinor: payment.amountMinor, ...(payment.reference ? { reference: payment.reference } : {}), createdAt: payment.createdAt.toISOString() }, outstandingMinor: balance - amountMinor };
        await tx.idempotencyRecord.update({ where: { tenantId_key: { tenantId: workspaceId, key } }, data: { status: 'COMPLETED', responseStatus: 201, responseBody: response as any } });
        return response;
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const retry = await this.idempotentResponse(workspaceId, key, requestHash);
        if (retry) return retry;
      }
      if ((error as { code?: string }).code === 'P2034') throw new ConflictException({ code: 'PAYMENT_CONCURRENCY_CONFLICT', message: 'The outstanding balance changed during payment recording. Retry using the same request key.' });
      throw error;
    }
  }

  @Post('workspaces/:workspaceId/branches/:branchId/sales/:saleId/returns')
  @UseGuards(CsrfGuard)
  async recordReturn(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('saleId') saleId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    await this.branchFor(workspaceId, branchId);
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 200) throw new BadRequestException('Select between 1 and 200 items to return.');
    const reason = requiredString(body.reason, 'Return reason', 500);
    const recordRefund = body.recordRefund === true;
    const refundMethod = requiredString(body.refundMethod ?? 'other', 'Refund method', 40);
    if (!PAYMENT_METHODS.has(refundMethod)) throw new BadRequestException('Unsupported refund method.');
    const requested = body.items.map((item) => { const row = asObject(item, 'return item'); return { saleLineId: requiredString(row.saleLineId, 'Sale line ID', 80), quantity: positiveQuantity(row.quantity) }; });
    if (new Set(requested.map((item) => item.saleLineId)).size !== requested.length) {
      throw new BadRequestException('A sale line can appear only once in a return request. Combine quantities for the same line.');
    }
    const rawKey = request.headers['idempotency-key'];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!key || key.length > 200) throw new BadRequestException('Idempotency-Key header is required for recording a return.');
    const requestHash = sha256(JSON.stringify({ workspaceId, branchId, saleId, items: requested, reason, recordRefund, refundMethod }));
    const duplicate = await this.idempotentResponse(workspaceId, key, requestHash);
    if (duplicate) return duplicate;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.idempotencyRecord.findUnique({ where: { tenantId_key: { tenantId: workspaceId, key } } });
        if (existing) {
          if (existing.requestHash !== requestHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This request key was used for different return data.' });
          if (existing.status === 'COMPLETED' && existing.responseBody) return existing.responseBody as any;
          throw new ConflictException({ code: 'REQUEST_IN_PROGRESS', message: 'This return request is already being processed.' });
        }
        await tx.idempotencyRecord.create({ data: { tenantId: workspaceId, key, requestHash, status: 'IN_PROGRESS', expiresAt: new Date(Date.now() + IDEMPOTENCY_SECONDS * 1000) } });
        const lockedSale = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM sales WHERE id = ${saleId}::uuid AND tenant_id = ${workspaceId}::uuid AND branch_id = ${branchId}::uuid FOR UPDATE`;
        if (!lockedSale.length) throw new NotFoundException('Sale not found.');
        const sale = await tx.sale.findFirst({ where: { id: saleId, tenantId: workspaceId, branchId }, include: { lines: true } });
        if (!sale) throw new NotFoundException('Sale not found.');
        const returnProductIds = [...new Set(sale.lines.map((line: any) => line.productId))].sort();
        if (returnProductIds.length) await tx.$queryRaw`SELECT id FROM products WHERE tenant_id = ${workspaceId}::uuid AND id = ANY(${returnProductIds}::uuid[]) ORDER BY id FOR UPDATE`;
        const oldReturns = await tx.saleReturn.findMany({ where: { tenantId: workspaceId, saleId }, include: { lines: true } });
        let totalMinor = 0;
        const resolved: any[] = [];
        for (const item of requested) {
          const line = sale.lines.find((l: any) => l.id === item.saleLineId);
          if (!line) throw new BadRequestException('A return item does not belong to this sale.');
          const previouslyReturned = oldReturns.flatMap((r: any) => r.lines).filter((l: any) => l.originalSaleLineId === line.id).reduce((sum: number, l: any) => sum + Number(l.quantity), 0);
          if (previouslyReturned + item.quantity > Number(line.quantity)) throw new ConflictException('Return quantity exceeds the quantity originally sold minus prior returns.');
          const amount = Math.round(line.unitPriceMinor * item.quantity);
          totalMinor += amount;
          resolved.push({ line, quantity: item.quantity, amount });
        }
        const returnNumber = `LR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(4).toString('hex').toUpperCase()}`;
        if (recordRefund) {
          const priorPayments = await tx.salePayment.findMany({ where: { tenantId: workspaceId, saleId }, select: { kind: true, amountMinor: true } });
          const grossReceipts = priorPayments.filter((payment: any) => payment.kind === 'receipt').reduce((sum: number, payment: any) => sum + payment.amountMinor, 0);
          const refundsAlreadyRecorded = priorPayments.filter((payment: any) => payment.kind === 'refund').reduce((sum: number, payment: any) => sum + payment.amountMinor, 0);
          const refundable = Math.max(0, grossReceipts - refundsAlreadyRecorded);
          if (totalMinor > refundable) throw new ConflictException({ code: 'REFUND_EXCEEDS_RECEIPTS', message: `Only ${refundable} minor currency units have been received and remain refundable.` });
        }
        const returned = await tx.saleReturn.create({ data: { tenantId: workspaceId, branchId, saleId, returnNumber, totalMinor, reason, refundRecorded: recordRefund } });
        for (const item of resolved) {
          await tx.saleReturnLine.create({ data: { tenantId: workspaceId, returnId: returned.id, originalSaleLineId: item.line.id, productId: item.line.productId, productNameSnapshot: item.line.productNameSnapshot, quantity: String(item.quantity), unitPriceMinor: item.line.unitPriceMinor, lineTotalMinor: item.amount } });
          await tx.stockMovement.create({ data: { tenantId: workspaceId, branchId, productId: item.line.productId, type: 'return', quantityDelta: String(item.quantity), reason: `Return ${returnNumber}`, sourceId: returned.id } });
        }
        if (recordRefund) await tx.salePayment.create({ data: { tenantId: workspaceId, saleId, kind: 'refund', method: refundMethod, amountMinor: totalMinor, reference: returnNumber } });
        await tx.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: session.userId, action: 'sale.return.recorded', resourceType: 'sale_return', resourceId: returned.id, requestId: request.headers['x-request-id'] as string | undefined } });
        const response = { returnRecord: { id: returned.id, workspaceId, branchId, saleId, returnNumber, totalMinor, reason, refundRecorded: recordRefund, createdAt: returned.createdAt.toISOString() } };
        await tx.idempotencyRecord.update({ where: { tenantId_key: { tenantId: workspaceId, key } }, data: { status: 'COMPLETED', responseStatus: 201, responseBody: response as any } });
        return response;
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const retry = await this.idempotentResponse(workspaceId, key, requestHash);
        if (retry) return retry;
      }
      if ((error as { code?: string }).code === 'P2034') throw new ConflictException({ code: 'RETURN_CONCURRENCY_CONFLICT', message: 'The sale changed during return processing. Retry using the same request key.' });
      throw error;
    }
  }

  @Get('workspaces/:workspaceId/branches/:branchId/dashboard')
  async dashboard(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    await this.branchFor(workspaceId, branchId);
    const [products, recentSalesRows, recentMovementRows, saleSum, returnSum, receiptsSum, refundsSum, saleCount, movements] = await Promise.all([
      this.prisma.product.findMany({ where: { tenantId: workspaceId, active: true }, orderBy: { name: 'asc' } }),
      this.prisma.sale.findMany({ where: { tenantId: workspaceId, branchId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.prisma.stockMovement.findMany({ where: { tenantId: workspaceId, branchId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.sale.aggregate({ where: { tenantId: workspaceId, branchId }, _sum: { totalMinor: true } }),
      this.prisma.saleReturn.aggregate({ where: { tenantId: workspaceId, branchId }, _sum: { totalMinor: true } }),
      this.prisma.salePayment.aggregate({ where: { tenantId: workspaceId, sale: { branchId }, kind: 'receipt' }, _sum: { amountMinor: true } }),
      this.prisma.salePayment.aggregate({ where: { tenantId: workspaceId, sale: { branchId }, kind: 'refund' }, _sum: { amountMinor: true } }),
      this.prisma.sale.count({ where: { tenantId: workspaceId, branchId } }),
      this.prisma.stockMovement.findMany({ where: { tenantId: workspaceId, branchId }, select: { productId: true, quantityDelta: true } }),
    ]);
    const stock: Record<string, number> = {};
    for (const movement of movements) stock[movement.productId] = (stock[movement.productId] ?? 0) + Number(movement.quantityDelta);
    const lowStockProducts = products.filter((product) => product.trackStock && (stock[product.id] ?? 0) <= Number(product.lowStockThreshold));
    const grossSalesMinor = saleSum._sum.totalMinor ?? 0;
    const returnsMinor = returnSum._sum.totalMinor ?? 0;
    const recordedReceiptsMinor = receiptsSum._sum.amountMinor ?? 0;
    const recordedRefundsMinor = refundsSum._sum.amountMinor ?? 0;
    const netSalesMinor = grossSalesMinor - returnsMinor;
    return {
      activeProductCount: products.length,
      lowStockCount: lowStockProducts.length,
      itemsInStock: products.filter((p) => p.trackStock).reduce((sum, p) => sum + Math.max(0, stock[p.id] ?? 0), 0),
      grossSalesMinor,
      returnsMinor,
      netSalesMinor,
      recordedReceiptsMinor,
      recordedRefundsMinor,
      outstandingMinor: netSalesMinor - recordedReceiptsMinor + recordedRefundsMinor,
      saleCount,
      recentSales: recentSalesRows.map(toSale),
      recentMovements: recentMovementRows.map(toMovement),
      lowStockProducts: lowStockProducts.map((product) => ({ product: toProduct(product), onHand: stock[product.id] ?? 0 })),
    };
  }

  @Get('workspaces/:workspaceId/branches/:branchId/analytics/overview')
  async analyticsOverview(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Query('period') periodQuery: string | undefined, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    await this.branchFor(workspaceId, branchId);
    const period = periodQuery ?? '30d';
    const durationByPeriod: Record<string, number> = { today: 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000, '30d': 30 * 24 * 60 * 60 * 1000, '90d': 90 * 24 * 60 * 60 * 1000, '12m': 365 * 24 * 60 * 60 * 1000 };
    const duration = durationByPeriod[period];
    if (!duration) throw new BadRequestException('Unsupported analytics period.');
    const now = new Date();
    const currentStart = new Date(now.getTime() - duration);
    if (period === 'today') currentStart.setUTCHours(0, 0, 0, 0);
    const previousStart = new Date(currentStart.getTime() - duration);
    const [tenant, currentSales, priorSales, products, stockRows, movementRows] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: workspaceId }, select: { currency: true } }),
      this.prisma.sale.findMany({ where: { tenantId: workspaceId, branchId, createdAt: { gte: currentStart, lte: now } }, orderBy: { createdAt: 'asc' }, take: 5000 }),
      this.prisma.sale.findMany({ where: { tenantId: workspaceId, branchId, createdAt: { gte: previousStart, lt: currentStart } }, orderBy: { createdAt: 'asc' }, take: 5000 }),
      this.prisma.product.findMany({ where: { tenantId: workspaceId, active: true }, orderBy: { name: 'asc' } }),
      this.prisma.stockMovement.findMany({ where: { tenantId: workspaceId, branchId }, select: { productId: true, quantityDelta: true } }),
      this.prisma.stockMovement.findMany({ where: { tenantId: workspaceId, branchId }, orderBy: { createdAt: 'desc' }, take: 12 }),
    ]);
    const currency = tenant?.currency ?? 'UGX';
    const factor = 10 ** (new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0);
    const currentTotalMinor = currentSales.reduce((sum, sale) => sum + sale.totalMinor, 0);
    const priorTotalMinor = priorSales.reduce((sum, sale) => sum + sale.totalMinor, 0);
    const currentReturns = await this.prisma.saleReturn.aggregate({ where: { tenantId: workspaceId, branchId, createdAt: { gte: currentStart, lte: now } }, _sum: { totalMinor: true } });
    const priorReturns = await this.prisma.saleReturn.aggregate({ where: { tenantId: workspaceId, branchId, createdAt: { gte: previousStart, lt: currentStart } }, _sum: { totalMinor: true } });
    const currentNet = currentTotalMinor - (currentReturns._sum.totalMinor ?? 0);
    const priorNet = priorTotalMinor - (priorReturns._sum.totalMinor ?? 0);
    const changePercent = priorNet === 0 ? null : ((currentNet - priorNet) / Math.abs(priorNet)) * 100;
    const stock: Record<string, number> = {};
    for (const movement of stockRows) stock[movement.productId] = (stock[movement.productId] ?? 0) + Number(movement.quantityDelta);
    const low = products.filter((p) => p.trackStock && (stock[p.id] ?? 0) <= Number(p.lowStockThreshold));
    const stockHealth = [
      { label: 'In stock', value: products.filter((p) => p.trackStock && (stock[p.id] ?? 0) > Number(p.lowStockThreshold)).length },
      { label: 'Low stock', value: low.filter((p) => (stock[p.id] ?? 0) > 0).length },
      { label: 'Out of stock', value: products.filter((p) => p.trackStock && (stock[p.id] ?? 0) <= 0).length },
    ].filter((row) => row.value > 0);
    const bucketBy = (date: Date) => {
      if (period === '12m') return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      if (period === '90d') return `Week of ${date.toISOString().slice(0, 10)}`;
      if (period === 'today') return `${String(date.getUTCHours()).padStart(2, '0')}:00`;
      return date.toISOString().slice(0, 10);
    };
    const trendMap = new Map<string, number>();
    for (const sale of currentSales) {
      const label = bucketBy(sale.createdAt);
      trendMap.set(label, (trendMap.get(label) ?? 0) + sale.totalMinor / factor);
    }
    const salesTrend = [...trendMap.entries()].map(([label, value]) => ({ label, value }));
    const recentActivity = [
      ...currentSales.slice(-8).map((sale) => ({ id: sale.id, kind: 'sale', summary: `Sale ${sale.receiptNumber} recorded`, occurredAt: sale.createdAt.toISOString(), href: `/sales/${sale.id}` })),
      ...movementRows.slice(0, 8).map((movement) => ({ id: movement.id, kind: 'inventory', summary: `${Number(movement.quantityDelta) > 0 ? 'Stock increased' : 'Stock decreased'}: ${movement.reason}`, occurredAt: movement.createdAt.toISOString(), href: '/inventory' })),
    ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 10);
    const exceptions = low.slice(0, 10).map((product) => ({ id: product.id, severity: (stock[product.id] ?? 0) <= 0 ? 'critical' as const : 'warning' as const, title: `${product.name}: low stock`, detail: `Current on-hand quantity is ${stock[product.id] ?? 0}.`, href: '/inventory' }));
    return {
      generatedAt: now.toISOString(), period, comparisonPeriod: `Previous comparable ${period}`,
      kpis: [
        { key: 'net-sales', label: 'Net sales', value: currentNet / factor, unit: 'currency' as const, changePercent, previousValue: priorNet / factor, trend: changePercent === null ? 'flat' as const : changePercent > 0 ? 'up' as const : changePercent < 0 ? 'down' as const : 'flat' as const, description: 'Recorded sales less recorded returns.' },
        { key: 'sales-count', label: 'Sales recorded', value: currentSales.length, unit: 'number' as const, previousValue: priorSales.length, description: 'Completed sales in the selected period.' },
        { key: 'active-products', label: 'Active products', value: products.length, unit: 'number' as const, description: 'Active catalogue products in this workspace.' },
        { key: 'low-stock', label: 'Low-stock products', value: low.length, unit: 'number' as const, description: 'Products at or below their reorder threshold.' },
      ],
      salesTrend,
      // Sales channels are not stored in the present schema; returning an empty series is more honest than inventing a breakdown.
      salesByChannel: [],
      stockHealth,
      recentActivity,
      exceptions,
      sourceCoverage: { sales: true, inventory: true, finance: true, crm: false, workforce: false },
    };
  }

  @Get('workspaces/:workspaceId/branches/:branchId/business-tools/snapshot')
  async businessToolsSnapshot(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    await this.branchFor(workspaceId, branchId);
    const [products, sales, returns, payments, movements] = await Promise.all([
      this.prisma.product.findMany({ where: { tenantId: workspaceId }, orderBy: { name: 'asc' }, take: 5000 }),
      this.prisma.sale.findMany({ where: { tenantId: workspaceId, branchId }, orderBy: { createdAt: 'desc' }, take: 5000 }),
      this.prisma.saleReturn.findMany({ where: { tenantId: workspaceId, branchId }, orderBy: { createdAt: 'desc' }, take: 5000 }),
      this.prisma.salePayment.findMany({ where: { tenantId: workspaceId, sale: { branchId } }, orderBy: { createdAt: 'desc' }, take: 5000 }),
      this.prisma.stockMovement.findMany({ where: { tenantId: workspaceId, branchId }, orderBy: { createdAt: 'desc' }, take: 5000 }),
    ]);
    return {
      products: products.map(toProduct),
      sales: sales.map(toSale),
      returns: returns.map((row) => ({ id: row.id, workspaceId: row.tenantId, branchId: row.branchId, saleId: row.saleId, returnNumber: row.returnNumber, totalMinor: row.totalMinor, reason: row.reason, refundRecorded: row.refundRecorded, createdAt: row.createdAt.toISOString() })),
      payments: payments.map((row) => ({ id: row.id, workspaceId: row.tenantId, saleId: row.saleId, kind: row.kind, method: row.method, amountMinor: row.amountMinor, ...(row.reference ? { reference: row.reference } : {}), createdAt: row.createdAt.toISOString() })),
      movements: movements.map(toMovement),
    };
  }

  @Get('workspaces/:workspaceId/business-tools/tax-profile')
  async getTaxProfile(@Param('workspaceId') workspaceId: string, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const branch = await this.prisma.branch.findFirst({ where: { tenantId: workspaceId }, orderBy: { createdAt: 'asc' } });
    if (!branch) throw new ConflictException('Create a branch before configuring business tax settings.');
    const row = await this.prisma.moduleRecord.findUnique({ where: { tenantId_branchId_moduleId_recordId: { tenantId: workspaceId, branchId: branch.id, moduleId: 'business-tools-tax-profile', recordId: 'profile' } } });
    if (row?.data && typeof row.data === 'object' && !Array.isArray(row.data)) return row.data;
    return { tin: '', vatRegistered: false, sector: '', efrisOverride: 'auto', vatThreshold: '', efrisTurnoverThreshold: '', ruleSource: '', ruleEffectiveFrom: '' };
  }

  @Put('workspaces/:workspaceId/business-tools/tax-profile')
  @UseGuards(CsrfGuard)
  async saveTaxProfile(@Param('workspaceId') workspaceId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    const membership = await this.membershipFor(session.userId, workspaceId);
    if (!['owner', 'admin'].includes(membership.role)) throw new ForbiddenException('Only workspace administrators can change the tax profile.');
    const branch = await this.prisma.branch.findFirst({ where: { tenantId: workspaceId }, orderBy: { createdAt: 'asc' } });
    if (!branch) throw new ConflictException('Create a branch before configuring business tax settings.');
    const efrisOverride = requiredString(body.efrisOverride ?? 'auto', 'EFRIS setting', 10);
    if (!['auto', 'yes', 'no'].includes(efrisOverride)) throw new BadRequestException('EFRIS setting must be auto, yes or no.');
    const profile = {
      tin: optionalString(body.tin, 100) ?? '',
      vatRegistered: body.vatRegistered === true,
      sector: optionalString(body.sector, 120) ?? '',
      efrisOverride,
      vatThreshold: optionalString(body.vatThreshold, 80) ?? '',
      efrisTurnoverThreshold: optionalString(body.efrisTurnoverThreshold, 80) ?? '',
      ruleSource: optionalString(body.ruleSource, 200) ?? '',
      ruleEffectiveFrom: optionalString(body.ruleEffectiveFrom, 30) ?? '',
    };
    await this.prisma.moduleRecord.upsert({
      where: { tenantId_branchId_moduleId_recordId: { tenantId: workspaceId, branchId: branch.id, moduleId: 'business-tools-tax-profile', recordId: 'profile' } },
      create: { tenantId: workspaceId, branchId: branch.id, moduleId: 'business-tools-tax-profile', recordId: 'profile', data: profile as any },
      update: { data: profile as any, version: { increment: 1 } },
    });
    await this.audit(workspaceId, session.userId, 'business.tax_profile.updated', 'tax_profile', 'profile', request.headers['x-request-id'] as string | undefined);
    return profile;
  }

  @Get('workspaces/:workspaceId/branches/:branchId/cash-ups')
  async listCashUps(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    await this.branchFor(workspaceId, branchId);
    const rows = await this.prisma.moduleRecord.findMany({ where: { tenantId: workspaceId, branchId, moduleId: 'cash-ups' }, orderBy: { recordId: 'desc' }, take: 500 });
    return rows.map((row) => row.data);
  }

  @Put('workspaces/:workspaceId/branches/:branchId/cash-ups/:cashUpDate')
  @UseGuards(CsrfGuard)
  async saveCashUp(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Param('cashUpDate') cashUpDate: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    const membership = await this.membershipFor(session.userId, workspaceId);
    if (!['owner', 'admin', 'manager', 'member'].includes(membership.role)) throw new ForbiddenException('You cannot record a cash-up.');
    await this.branchFor(workspaceId, branchId);
    const dateText = requiredString(cashUpDate, 'Cash-up date', 10);
    const date = new Date(`${dateText}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateText) throw new BadRequestException('Cash-up date must be a valid YYYY-MM-DD date.');
    if (body.date !== undefined && body.date !== dateText) throw new BadRequestException('The date in the URL and body must match.');
    const openingFloatMinor = moneyMinor(body.openingFloatMinor, 'Opening float');
    const otherCashInMinor = moneyMinor(body.otherCashInMinor, 'Other cash in');
    const otherCashOutMinor = moneyMinor(body.otherCashOutMinor, 'Other cash out');
    const countedCashMinor = moneyMinor(body.countedCashMinor, 'Counted cash');
    const reason = optionalString(body.reason, 500) ?? '';
    const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    const [cashReceipts, cashRefunds] = await Promise.all([
      this.prisma.salePayment.aggregate({ where: { tenantId: workspaceId, method: 'cash', kind: 'receipt', createdAt: { gte: date, lt: nextDate }, sale: { branchId } }, _sum: { amountMinor: true } }),
      this.prisma.salePayment.aggregate({ where: { tenantId: workspaceId, method: 'cash', kind: 'refund', createdAt: { gte: date, lt: nextDate }, sale: { branchId } }, _sum: { amountMinor: true } }),
    ]);
    const expectedCashMinor = openingFloatMinor + otherCashInMinor - otherCashOutMinor + (cashReceipts._sum.amountMinor ?? 0) - (cashRefunds._sum.amountMinor ?? 0);
    if (!Number.isSafeInteger(expectedCashMinor) || expectedCashMinor < 0) throw new ConflictException('Calculated expected cash is invalid; reconcile the opening float and cash movements first.');
    const savedAt = new Date().toISOString();
    const cashUp = { workspaceId, branchId, date: dateText, openingFloatMinor, otherCashInMinor, otherCashOutMinor, expectedCashMinor, countedCashMinor, varianceMinor: countedCashMinor - expectedCashMinor, reason, savedAt };
    await this.prisma.moduleRecord.upsert({
      where: { tenantId_branchId_moduleId_recordId: { tenantId: workspaceId, branchId, moduleId: 'cash-ups', recordId: dateText } },
      create: { tenantId: workspaceId, branchId, moduleId: 'cash-ups', recordId: dateText, data: cashUp as any },
      update: { data: cashUp as any, version: { increment: 1 } },
    });
    await this.audit(workspaceId, session.userId, 'cash_up.saved', 'cash_up', dateText, request.headers['x-request-id'] as string | undefined);
    return cashUp;
  }

  @Get('workspaces/:workspaceId/compliance-notes')
  async listComplianceNotes(@Param('workspaceId') workspaceId: string, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const branches = await this.prisma.branch.findMany({ where: { tenantId: workspaceId }, select: { id: true } });
    if (!branches.length) return [];
    const rows = await this.prisma.moduleRecord.findMany({ where: { tenantId: workspaceId, branchId: { in: branches.map((branch) => branch.id) }, moduleId: 'compliance-notes' }, orderBy: { createdAt: 'desc' }, take: 1000 });
    return rows.map((row) => row.data);
  }

  @Post('workspaces/:workspaceId/compliance-notes')
  @UseGuards(CsrfGuard)
  async createComplianceNote(@Param('workspaceId') workspaceId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const branch = await this.prisma.branch.findFirst({ where: { tenantId: workspaceId }, orderBy: { createdAt: 'asc' } });
    if (!branch) throw new ConflictException('Create a branch before adding a compliance note.');
    const dateText = requiredString(body.date, 'Date', 10);
    const parsedDate = new Date(`${dateText}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dateText) throw new BadRequestException('Date must be a valid YYYY-MM-DD date.');
    const note = {
      id: randomUUID(), date: dateText,
      documentType: requiredString(body.documentType, 'Document type', 100),
      internalReference: requiredString(body.internalReference, 'Internal reference', 150),
      fdn: optionalString(body.fdn, 150) ?? '',
      status: requiredString(body.status, 'Status', 80),
      notes: optionalString(body.notes, 4000) ?? '',
    };
    await this.prisma.moduleRecord.create({ data: { tenantId: workspaceId, branchId: branch.id, moduleId: 'compliance-notes', recordId: note.id, data: note as any } });
    await this.audit(workspaceId, session.userId, 'compliance_note.created', 'compliance_note', note.id, request.headers['x-request-id'] as string | undefined);
    return note;
  }

  @Get('workspaces/:workspaceId/search')
  async globalSearch(@Param('workspaceId') workspaceId: string, @Query('branchId') branchId: string | undefined, @Query('q') query: string | undefined, @Query('limit') limit: string | undefined, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const text = (query ?? '').trim();
    if (text.length < 2) return [];
    if (text.length > 160) throw new BadRequestException('Search text is too long.');
    if (!branchId) throw new BadRequestException('A branch ID is required for global search.');
    await this.branchFor(workspaceId, branchId);
    const take = Math.min(20, Math.max(1, Number.parseInt(limit ?? '20', 10) || 20));
    const [products, sales, rows] = await Promise.all([
      this.prisma.product.findMany({ where: { tenantId: workspaceId, OR: [{ name: { contains: text, mode: 'insensitive' } }, { sku: { contains: text, mode: 'insensitive' } }, { barcode: { contains: text, mode: 'insensitive' } }] }, orderBy: { updatedAt: 'desc' }, take }),
      this.prisma.sale.findMany({ where: { tenantId: workspaceId, branchId, OR: [{ receiptNumber: { contains: text, mode: 'insensitive' } }, { customerName: { contains: text, mode: 'insensitive' } }, { customerPhone: { contains: text, mode: 'insensitive' } }] }, orderBy: { createdAt: 'desc' }, take }),
      this.prisma.moduleRecord.findMany({ where: { tenantId: workspaceId, branchId }, orderBy: { updatedAt: 'desc' }, take: 1500 }),
    ]);
    const results: Array<{ id: string; type: string; label: string; description?: string; href: string; reference?: string }> = [];
    for (const product of products) results.push({ id: product.id, type: 'product', label: product.name, description: `SKU ${product.sku}${product.barcode ? ` · Barcode ${product.barcode}` : ''}`, href: `/products?search=${encodeURIComponent(product.sku)}`, reference: product.sku });
    for (const sale of sales) results.push({ id: sale.id, type: 'sale', label: sale.receiptNumber, description: sale.customerName ?? 'Sale record', href: `/sales/${sale.id}`, reference: sale.receiptNumber });
    const normalizedQuery = text.toLocaleLowerCase();
    for (const row of rows) {
      const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {};
      const candidate = Object.entries(data).find(([key, value]) => !['password', 'token', 'secret'].some((s) => key.toLowerCase().includes(s)) && typeof value === 'string' && value.toLocaleLowerCase().includes(normalizedQuery));
      if (!candidate) continue;
      const label = String(data.title ?? data.name ?? data.customer ?? data.reference ?? data.orderNumber ?? row.moduleId);
      results.push({ id: row.recordId, type: row.moduleId, label, description: `${candidate[0]}: ${String(candidate[1]).slice(0, 180)}`, href: `/modules/${encodeURIComponent(row.moduleId)}?recordId=${encodeURIComponent(row.recordId)}` });
    }
    return results.slice(0, take);
  }

  @Get('workspaces/:workspaceId/inbox/threads')
  async listInboxThreads(@Param('workspaceId') workspaceId: string, @Query('branchId') branchId: string | undefined, @Query('recordType') recordType: string | undefined, @Query('recordId') recordId: string | undefined, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    if (!branchId) throw new BadRequestException('A branch ID is required to list inbox threads.');
    await this.branchFor(workspaceId, branchId);
    const [threads, messages, reads] = await Promise.all([
      this.prisma.moduleRecord.findMany({ where: { tenantId: workspaceId, branchId, moduleId: 'inbox-threads' }, orderBy: { updatedAt: 'desc' }, take: 500 }),
      this.prisma.moduleRecord.findMany({ where: { tenantId: workspaceId, branchId, moduleId: 'inbox-messages' }, orderBy: { createdAt: 'desc' }, take: 5000 }),
      this.prisma.moduleRecord.findMany({ where: { tenantId: workspaceId, branchId, moduleId: 'inbox-thread-reads' }, take: 5000 }),
    ]);
    return threads.flatMap((thread) => {
      const data = thread.data && typeof thread.data === 'object' && !Array.isArray(thread.data) ? thread.data as Record<string, unknown> : {};
      if (!Array.isArray(data.participants) || !data.participants.includes(session.userId)) return [];
      if (recordType && data.recordType !== recordType) return [];
      if (recordId && data.recordId !== recordId) return [];
      const threadMessages = messages.filter((message) => (message.data as Record<string, unknown>)?.threadId === thread.recordId);
      const last = threadMessages[0];
      const lastData = last?.data && typeof last.data === 'object' ? last.data as Record<string, unknown> : {};
      const readRow = reads.find((read) => read.recordId === `${thread.recordId}:${session.userId}`);
      const readData = readRow?.data && typeof readRow.data === 'object' ? readRow.data as Record<string, unknown> : {};
      const readAt = typeof readData.readAt === 'string' ? readData.readAt : '';
      const unreadCount = threadMessages.filter((message) => {
        const messageData = message.data && typeof message.data === 'object' ? message.data as Record<string, unknown> : {};
        return messageData.senderId !== session.userId && String(messageData.sentAt ?? '') > readAt;
      }).length;
      return [{
        id: thread.recordId, title: String(data.title ?? 'Conversation'), kind: data.kind === 'record' ? 'record' : data.kind === 'group' ? 'group' : 'direct',
        ...(typeof lastData.body === 'string' ? { lastMessage: lastData.body } : {}),
        ...(typeof lastData.sentAt === 'string' ? { lastMessageAt: lastData.sentAt } : {}),
        unreadCount, participants: Array.isArray(data.participants) ? data.participants.filter((x): x is string => typeof x === 'string') : [],
        ...(typeof data.recordType === 'string' ? { recordType: data.recordType } : {}), ...(typeof data.recordId === 'string' ? { recordId: data.recordId } : {}),
        ...(typeof data.recordType === 'string' ? { recordHref: data.recordType === 'sale' && typeof data.recordId === 'string' ? `/sales/${data.recordId}` : `/modules/${String(data.recordType)}` } : {}),
      }];
    });
  }

  @Post('workspaces/:workspaceId/inbox/threads')
  @UseGuards(CsrfGuard)
  async createInboxThread(@Param('workspaceId') workspaceId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const branchId = requiredString(body.branchId, 'Branch ID', 80);
    await this.branchFor(workspaceId, branchId);
    const title = requiredString(body.title, 'Conversation title', 200);
    const participantIds = Array.isArray(body.participantIds) ? body.participantIds.map((id) => requiredString(id, 'Participant ID', 80)) : [];
    const participants = [...new Set([...participantIds, session.userId])];
    if (participants.length > 50) throw new BadRequestException('A conversation cannot have more than 50 participants.');
    const active = await this.prisma.membership.findMany({ where: { tenantId: workspaceId, userId: { in: participants }, status: 'ACTIVE' }, select: { userId: true } });
    if (active.length !== participants.length) throw new BadRequestException('All conversation participants must be active members of this workspace.');
    const kind = body.kind === 'record' ? 'record' : participants.length > 2 ? 'group' : 'direct';
    const recordType = body.recordType === undefined ? undefined : requiredString(body.recordType, 'Record type', 100);
    const relatedRecordId = body.recordId === undefined ? undefined : requiredString(body.recordId, 'Record ID', 160);
    if ((recordType && !relatedRecordId) || (!recordType && relatedRecordId)) throw new BadRequestException('Related conversations need both a record type and record ID.');
    const id = randomUUID();
    const now = new Date().toISOString();
    const data = { id, title, kind, participants, ...(recordType ? { recordType, recordId: relatedRecordId } : {}), createdBy: session.userId, createdAt: now, updatedAt: now };
    await this.prisma.moduleRecord.create({ data: { tenantId: workspaceId, branchId, moduleId: 'inbox-threads', recordId: id, data: data as any } });
    await this.audit(workspaceId, session.userId, 'inbox.thread.created', 'inbox_thread', id, request.headers['x-request-id'] as string | undefined);
    return { id };
  }

  @Get('workspaces/:workspaceId/inbox/threads/:threadId/messages')
  async listInboxMessages(@Param('workspaceId') workspaceId: string, @Param('threadId') threadId: string, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const thread = await this.prisma.moduleRecord.findFirst({ where: { tenantId: workspaceId, moduleId: 'inbox-threads', recordId: threadId } });
    if (!thread) throw new NotFoundException('Conversation not found.');
    const threadData = thread.data && typeof thread.data === 'object' && !Array.isArray(thread.data) ? thread.data as Record<string, unknown> : {};
    if (!Array.isArray(threadData.participants) || !threadData.participants.includes(session.userId)) throw new NotFoundException('Conversation not found.');
    const rows = await this.prisma.moduleRecord.findMany({ where: { tenantId: workspaceId, branchId: thread.branchId, moduleId: 'inbox-messages' }, orderBy: { createdAt: 'asc' }, take: 5000 });
    return rows.flatMap((row) => {
      const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {};
      if (data.threadId !== threadId) return [];
      const reactionUsers = data.reactionUsers && typeof data.reactionUsers === 'object' && !Array.isArray(data.reactionUsers) ? data.reactionUsers as Record<string, unknown> : {};
      const reactions = Object.entries(reactionUsers).map(([emoji, rawUsers]) => {
        const users = Array.isArray(rawUsers) ? rawUsers.filter((value): value is string => typeof value === 'string') : [];
        return { emoji, count: users.length, reactedByMe: users.includes(session.userId) };
      });
      return [{ id: row.recordId, threadId, body: String(data.body ?? ''), senderId: String(data.senderId ?? ''), senderName: String(data.senderName ?? 'Workspace member'), sentAt: String(data.sentAt ?? row.createdAt.toISOString()), ...(typeof data.editedAt === 'string' ? { editedAt: data.editedAt } : {}), reactions }];
    });
  }

  @Post('workspaces/:workspaceId/inbox/threads/:threadId/messages')
  @UseGuards(CsrfGuard)
  async sendInboxMessage(@Param('workspaceId') workspaceId: string, @Param('threadId') threadId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const thread = await this.prisma.moduleRecord.findFirst({ where: { tenantId: workspaceId, moduleId: 'inbox-threads', recordId: threadId } });
    if (!thread) throw new NotFoundException('Conversation not found.');
    const threadData = thread.data && typeof thread.data === 'object' && !Array.isArray(thread.data) ? thread.data as Record<string, unknown> : {};
    if (!Array.isArray(threadData.participants) || !threadData.participants.includes(session.userId)) throw new NotFoundException('Conversation not found.');
    if (Array.isArray(body.attachmentIds) && body.attachmentIds.length) throw new ServiceUnavailableException({ code: 'ATTACHMENTS_NOT_CONFIGURED', message: 'File attachments are not configured on this backend yet. Send the message without attachments.' });
    const content = requiredString(body.body, 'Message', 10000);
    const user = await this.prisma.user.findUnique({ where: { id: session.userId }, select: { displayName: true, email: true } });
    const id = randomUUID();
    const sentAt = new Date().toISOString();
    const data = { id, threadId, body: content, senderId: session.userId, senderName: user?.displayName || user?.email || 'Workspace member', sentAt, reactionUsers: {} };
    const message = await this.prisma.moduleRecord.create({ data: { tenantId: workspaceId, branchId: thread.branchId, moduleId: 'inbox-messages', recordId: id, data: data as any } });
    const currentThreadData = thread.data && typeof thread.data === 'object' && !Array.isArray(thread.data) ? thread.data as Record<string, unknown> : {};
    await this.prisma.moduleRecord.update({ where: { id: thread.id }, data: { data: { ...currentThreadData, updatedAt: sentAt } as any, version: { increment: 1 } } });
    await this.audit(workspaceId, session.userId, 'inbox.message.sent', 'inbox_message', id, request.headers['x-request-id'] as string | undefined);
    return { id: message.recordId, threadId, body: content, senderId: session.userId, senderName: data.senderName, sentAt, reactions: [] };
  }

  @Post('workspaces/:workspaceId/inbox/threads/:threadId/messages/:messageId/reactions')
  @UseGuards(CsrfGuard)
  async reactToInboxMessage(@Param('workspaceId') workspaceId: string, @Param('threadId') threadId: string, @Param('messageId') messageId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const thread = await this.prisma.moduleRecord.findFirst({ where: { tenantId: workspaceId, moduleId: 'inbox-threads', recordId: threadId } });
    const threadData = thread?.data && typeof thread.data === 'object' && !Array.isArray(thread.data) ? thread.data as Record<string, unknown> : {};
    if (!thread || !Array.isArray(threadData.participants) || !threadData.participants.includes(session.userId)) throw new NotFoundException('Conversation not found.');
    const row = await this.prisma.moduleRecord.findFirst({ where: { tenantId: workspaceId, branchId: thread.branchId, moduleId: 'inbox-messages', recordId: messageId } });
    if (!row) throw new NotFoundException('Message not found.');
    const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {};
    if (data.threadId !== threadId) throw new NotFoundException('Message not found in this conversation.');
    const emoji = requiredString(body.emoji, 'Reaction', 16);
    const reactionUsers = data.reactionUsers && typeof data.reactionUsers === 'object' && !Array.isArray(data.reactionUsers) ? { ...(data.reactionUsers as Record<string, unknown>) } : {};
    const rawUsers = reactionUsers[emoji];
    const users = Array.isArray(rawUsers) ? rawUsers.filter((value): value is string => typeof value === 'string') : [];
    const updatedUsers = users.includes(session.userId) ? users.filter((id) => id !== session.userId) : [...users, session.userId];
    if (updatedUsers.length) reactionUsers[emoji] = updatedUsers; else delete reactionUsers[emoji];
    await this.prisma.moduleRecord.update({ where: { id: row.id }, data: { data: { ...data, reactionUsers } as any, version: { increment: 1 } } });
    return { reactions: Object.entries(reactionUsers).map(([key, values]) => { const ids = Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : []; return { emoji: key, count: ids.length, reactedByMe: ids.includes(session.userId) }; }) };
  }

  @Post('workspaces/:workspaceId/inbox/threads/:threadId/read')
  @UseGuards(CsrfGuard)
  @HttpCode(204)
  async markInboxThreadRead(@Param('workspaceId') workspaceId: string, @Param('threadId') threadId: string, @Req() request: FastifyRequest): Promise<void> {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const thread = await this.prisma.moduleRecord.findFirst({ where: { tenantId: workspaceId, moduleId: 'inbox-threads', recordId: threadId } });
    const threadData = thread?.data && typeof thread.data === 'object' && !Array.isArray(thread.data) ? thread.data as Record<string, unknown> : {};
    if (!thread || !Array.isArray(threadData.participants) || !threadData.participants.includes(session.userId)) throw new NotFoundException('Conversation not found.');
    const recordId = `${threadId}:${session.userId}`;
    const data = { threadId, userId: session.userId, readAt: new Date().toISOString() };
    await this.prisma.moduleRecord.upsert({ where: { tenantId_branchId_moduleId_recordId: { tenantId: workspaceId, branchId: thread.branchId, moduleId: 'inbox-thread-reads', recordId } }, create: { tenantId: workspaceId, branchId: thread.branchId, moduleId: 'inbox-thread-reads', recordId, data }, update: { data, version: { increment: 1 } } });
  }

  @Get('workspaces/:workspaceId/tasks')
  async listTasks(@Param('workspaceId') workspaceId: string, @Query('branchId') branchId: string | undefined, @Query('status') status: string | undefined, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    if (!branchId) throw new BadRequestException('A branch ID is required to list tasks.');
    await this.branchFor(workspaceId, branchId);
    const rows = await this.prisma.moduleRecord.findMany({ where: { tenantId: workspaceId, branchId, moduleId: 'tasks' }, orderBy: { updatedAt: 'desc' }, take: 2000 });
    return rows.flatMap((row) => { const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {}; return status && data.status !== status ? [] : [{ ...data, id: row.recordId }]; });
  }

  @Post('workspaces/:workspaceId/tasks')
  @UseGuards(CsrfGuard)
  async createTask(@Param('workspaceId') workspaceId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const branchId = requiredString(body.branchId, 'Branch ID', 80);
    await this.branchFor(workspaceId, branchId);
    const title = requiredString(body.title, 'Task title', 200);
    const priority = requiredString(body.priority ?? 'normal', 'Priority', 20);
    if (!['low', 'normal', 'high', 'urgent'].includes(priority)) throw new BadRequestException('Unsupported task priority.');
    const assigneeId = optionalString(body.assigneeId, 80);
    let assigneeName: string | undefined;
    if (assigneeId) {
      const membership = await this.prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: workspaceId, userId: assigneeId } }, include: { user: true } });
      if (!membership || membership.status !== 'ACTIVE') throw new BadRequestException('Assignee must be an active member of this workspace.');
      assigneeName = membership.user.displayName || membership.user.email;
    }
    const dueAt = optionalString(body.dueAt, 40);
    if (dueAt && Number.isNaN(Date.parse(dueAt))) throw new BadRequestException('Due date is invalid.');
    const id = randomUUID();
    const now = new Date().toISOString();
    const task = { id, title, description: optionalString(body.description, 4000) ?? '', status: 'open', priority, ...(dueAt ? { dueAt } : {}), ...(assigneeId ? { assigneeId, assigneeName } : {}), createdBy: session.userId, createdAt: now, updatedAt: now };
    await this.prisma.moduleRecord.create({ data: { tenantId: workspaceId, branchId, moduleId: 'tasks', recordId: id, data: task as any } });
    await this.audit(workspaceId, session.userId, 'task.created', 'task', id, request.headers['x-request-id'] as string | undefined);
    return task;
  }

  @Patch('workspaces/:workspaceId/tasks/:taskId')
  @UseGuards(CsrfGuard)
  async updateTask(@Param('workspaceId') workspaceId: string, @Param('taskId') taskId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const status = requiredString(body.status, 'Task status', 20);
    if (!['open', 'in_progress', 'blocked', 'done', 'cancelled'].includes(status)) throw new BadRequestException('Unsupported task status.');
    const row = await this.prisma.moduleRecord.findFirst({ where: { tenantId: workspaceId, moduleId: 'tasks', recordId: taskId } });
    if (!row) throw new NotFoundException('Task not found.');
    const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {};
    const updated = { ...data, status, updatedAt: new Date().toISOString() };
    await this.prisma.moduleRecord.update({ where: { id: row.id }, data: { data: updated as any, version: { increment: 1 } } });
    await this.audit(workspaceId, session.userId, 'task.status_changed', 'task', taskId, request.headers['x-request-id'] as string | undefined);
    return { ...updated, id: row.recordId };
  }

  @Get('workspaces/:workspaceId/approvals')
  async listApprovals(@Param('workspaceId') workspaceId: string, @Query('branchId') branchId: string | undefined, @Query('status') status: string | undefined, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    if (!branchId) throw new BadRequestException('A branch ID is required to list approvals.');
    await this.branchFor(workspaceId, branchId);
    const rows = await this.prisma.moduleRecord.findMany({ where: { tenantId: workspaceId, branchId, moduleId: 'approvals' }, orderBy: { createdAt: 'desc' }, take: 1000 });
    return rows.flatMap((row) => { const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {}; return status && data.status !== status ? [] : [{ ...data, id: row.recordId }]; });
  }

  @Post('workspaces/:workspaceId/approvals/:approvalId/decision')
  @UseGuards(CsrfGuard)
  async decideApproval(@Param('workspaceId') workspaceId: string, @Param('approvalId') approvalId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    const membership = await this.membershipFor(session.userId, workspaceId);
    if (!['owner', 'admin', 'manager'].includes(membership.role)) throw new ForbiddenException('You do not have permission to decide approvals.');
    const decision = requiredString(body.decision, 'Decision', 20);
    if (!['approve', 'reject'].includes(decision)) throw new BadRequestException('Decision must be approve or reject.');
    const row = await this.prisma.moduleRecord.findFirst({ where: { tenantId: workspaceId, moduleId: 'approvals', recordId: approvalId } });
    if (!row) throw new NotFoundException('Approval not found.');
    const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {};
    if (data.status !== 'pending') throw new ConflictException('This approval has already been decided.');
    const updated = { ...data, status: decision === 'approve' ? 'approved' : 'rejected', decisionComment: optionalString(body.comment, 1000) ?? '', decidedBy: session.userId, decidedAt: new Date().toISOString() };
    await this.prisma.moduleRecord.update({ where: { id: row.id }, data: { data: updated as any, version: { increment: 1 } } });
    await this.audit(workspaceId, session.userId, 'approval.decided', 'approval', approvalId, request.headers['x-request-id'] as string | undefined);
    return { ...updated, id: approvalId };
  }

  @Get('workspaces/:workspaceId/notifications')
  async listNotifications(@Param('workspaceId') workspaceId: string, @Query('branchId') branchId: string | undefined, @Query('limit') limit: string | undefined, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    if (!branchId) throw new BadRequestException('A branch ID is required to list notifications.');
    await this.branchFor(workspaceId, branchId);
    const [rows, reads] = await Promise.all([
      this.prisma.moduleRecord.findMany({ where: { tenantId: workspaceId, branchId, moduleId: 'notifications' }, orderBy: { createdAt: 'desc' }, take: Math.min(500, Math.max(1, Number.parseInt(limit ?? '100', 10) || 100)) }),
      this.prisma.moduleRecord.findMany({ where: { tenantId: workspaceId, branchId, moduleId: 'notification-reads' }, take: 5000 }),
    ]);
    return rows.map((row) => {
      const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {};
      const read = reads.find((entry) => entry.recordId === `${row.recordId}:${session.userId}`);
      const readData = read?.data && typeof read.data === 'object' && !Array.isArray(read.data) ? read.data as Record<string, unknown> : {};
      return { ...data, id: row.recordId, readAt: typeof readData.readAt === 'string' ? readData.readAt : null };
    });
  }

  @Post('workspaces/:workspaceId/notifications/:notificationId/read')
  @UseGuards(CsrfGuard)
  @HttpCode(204)
  async markNotificationRead(@Param('workspaceId') workspaceId: string, @Param('notificationId') notificationId: string, @Req() request: FastifyRequest): Promise<void> {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const notification = await this.prisma.moduleRecord.findFirst({ where: { tenantId: workspaceId, moduleId: 'notifications', recordId: notificationId } });
    if (!notification) throw new NotFoundException('Notification not found.');
    const recordId = `${notificationId}:${session.userId}`;
    const data = { notificationId, userId: session.userId, readAt: new Date().toISOString() };
    await this.prisma.moduleRecord.upsert({ where: { tenantId_branchId_moduleId_recordId: { tenantId: workspaceId, branchId: notification.branchId, moduleId: 'notification-reads', recordId } }, create: { tenantId: workspaceId, branchId: notification.branchId, moduleId: 'notification-reads', recordId, data }, update: { data, version: { increment: 1 } } });
  }

  @Post('workspaces/:workspaceId/notifications/read-all')
  @UseGuards(CsrfGuard)
  @HttpCode(204)
  async markAllNotificationsRead(@Param('workspaceId') workspaceId: string, @Req() request: FastifyRequest): Promise<void> {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const rows = await this.prisma.moduleRecord.findMany({ where: { tenantId: workspaceId, moduleId: 'notifications' }, take: 5000 });
    const readAt = new Date().toISOString();
    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const recordId = `${row.recordId}:${session.userId}`;
        const data = { notificationId: row.recordId, userId: session.userId, readAt };
        await tx.moduleRecord.upsert({ where: { tenantId_branchId_moduleId_recordId: { tenantId: workspaceId, branchId: row.branchId, moduleId: 'notification-reads', recordId } }, create: { tenantId: workspaceId, branchId: row.branchId, moduleId: 'notification-reads', recordId, data }, update: { data, version: { increment: 1 } } });
      }
    });
  }

  @Get('workspaces/:workspaceId/activity')
  async listActivity(@Param('workspaceId') workspaceId: string, @Query('branchId') branchId: string | undefined, @Query('limit') limit: string | undefined, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    if (branchId) await this.branchFor(workspaceId, branchId);
    const take = Math.min(500, Math.max(1, Number.parseInt(limit ?? '100', 10) || 100));
    const rows = await this.prisma.auditEvent.findMany({ where: { tenantId: workspaceId }, include: { actor: true }, orderBy: { createdAt: 'desc' }, take });
    return rows.map((row) => ({ id: row.id, kind: row.action, summary: `${row.actor?.displayName || row.actor?.email || 'Workspace user'} ${row.action.replace(/[._]/g, ' ')}${row.resourceType ? ` (${row.resourceType})` : ''}`, ...(row.actor?.displayName || row.actor?.email ? { actorName: row.actor.displayName || row.actor.email } : {}), occurredAt: row.createdAt.toISOString(), href: row.resourceType === 'sale' && row.resourceId ? `/sales/${row.resourceId}` : undefined }));
  }

  @Get('workspaces/:workspaceId/branches/:branchId/reports/modules')
  async moduleReport(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Query('report') reportQuery: string | undefined, @Query('period') periodQuery: string | undefined, @Query('currency') currencyQuery: string | undefined, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    await this.branchFor(workspaceId, branchId);
    const report = requiredString(reportQuery, 'Report name', 120);
    const period = requiredString(periodQuery, 'Report period', 40);
    const currency = requiredString(currencyQuery, 'Currency', 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('Currency must be a three-letter code.');
    const knownPeriods = new Set(['Today', 'Last 7 days', 'Last 30 days', 'Last 90 days', 'Year to date', 'Next 7 days', 'Next 30 days', 'Next 90 days']);
    if (!knownPeriods.has(period)) throw new BadRequestException('Unsupported report period.');
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const dayMs = 24 * 60 * 60 * 1000;
    let from = new Date(`${today}T00:00:00.000Z`);
    let to = new Date(from);
    const dayCount = period === 'Today' ? 1 : period === 'Last 7 days' ? 7 : period === 'Last 30 days' ? 30 : period === 'Last 90 days' ? 90 : period === 'Year to date' ? 0 : period === 'Next 7 days' ? 7 : period === 'Next 30 days' ? 30 : 90;
    if (period === 'Year to date') from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    else if (period.startsWith('Next')) to = new Date(from.getTime() + (dayCount - 1) * dayMs);
    else from = new Date(from.getTime() - (dayCount - 1) * dayMs);
    if (!period.startsWith('Next')) to = new Date(`${today}T23:59:59.999Z`);
    const allRows = await this.prisma.moduleRecord.findMany({ where: { tenantId: workspaceId, branchId }, orderBy: { updatedAt: 'desc' }, take: 5000 });
    const dateKey = (data: Record<string, unknown>) => String(data.date ?? data.issueDate ?? data.invoiceDate ?? data.orderDate ?? data.dueDate ?? data.createdAt ?? '').slice(0, 10);
    const eligible = allRows.filter((row) => {
      const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {};
      if (period.startsWith('Next')) return dateKey(data) >= today && dateKey(data) <= to.toISOString().slice(0, 10);
      const dateValue = dateKey(data);
      return !dateValue || (dateValue >= from.toISOString().slice(0, 10) && dateValue <= today);
    });
    const grouped = new Map<string, number>();
    const countByModule = new Map<string, number>();
    for (const row of eligible) {
      const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {};
      countByModule.set(row.moduleId, (countByModule.get(row.moduleId) ?? 0) + 1);
      const amount = ['total', 'amount', 'amountDue', 'creditAmount', 'taxAmount', 'outstandingBalance', 'outstandingPayable'].reduce((sum, key) => sum + (typeof data[key] === 'number' && Number.isFinite(data[key]) ? data[key] as number : 0), 0);
      grouped.set(row.moduleId, (grouped.get(row.moduleId) ?? 0) + amount);
    }
    const entries = [...countByModule.entries()].map(([module, count]) => ({ label: `${module} · ${count} records`, value: Math.round((grouped.get(module) ?? 0) * 100) / 100 }));
    const recordCount = eligible.length;
    const amountTotal = Math.round(entries.reduce((sum, entry) => sum + entry.value, 0) * 100) / 100;
    return {
      report, period, currency, unit: 'currency', entries,
      metrics: [{ label: 'Records in scope', value: recordCount, unit: 'count' }, { label: 'Recorded amount fields (unreconciled)', value: amountTotal, unit: 'currency' }],
      filteredRecordCounts: Object.fromEntries(countByModule), generatedAt: now.toISOString(), persistenceMode: 'server', sourceLabel: 'Backend records',
      interpretationNote: 'This operational snapshot groups the saved records in this workspace and branch. Amount fields are aggregated generically and are not a certified ledger, statutory tax calculation, balance sheet or audited financial statement.',
    };
  }


  @Post('workspaces/:workspaceId/imports/products-csv')
  @UseGuards(CsrfGuard)
  async importProductsCsv(@Param('workspaceId') workspaceId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    const membership = await this.membershipFor(session.userId, workspaceId);
    if (!['owner', 'admin', 'manager'].includes(membership.role)) throw new ForbiddenException('Only workspace managers can import products.');
    const currency = requiredString(body.currency ?? membership.tenant.currency, 'Currency', 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('Currency must be a three-letter code.');
    const parsed = parseCsvRows(body.csv);
    const { headers, rows } = parsed;
    const existing = await this.prisma.product.findMany({ where: { tenantId: workspaceId }, select: { sku: true, barcode: true } });
    const skuSet = new Set(existing.map((item) => item.sku.trim().toLowerCase()));
    const barcodeSet = new Set(existing.map((item) => (item.barcode ?? '').trim().toLowerCase()).filter(Boolean));
    const items = rows.map((row, i) => {
      const rowNumber = i + 2;
      const name = requiredCsvCell(row, headers, 'name', rowNumber);
      const sku = requiredCsvCell(row, headers, 'sku', rowNumber);
      const barcode = csvCell(row, headers, 'barcode');
      if (skuSet.has(sku.toLowerCase())) throw new ConflictException(`CSV row ${rowNumber}: SKU ${sku} already exists or is duplicated in this import.`);
      skuSet.add(sku.toLowerCase());
      if (barcode) {
        if (barcodeSet.has(barcode.toLowerCase())) throw new ConflictException(`CSV row ${rowNumber}: barcode ${barcode} already exists or is duplicated in this import.`);
        barcodeSet.add(barcode.toLowerCase());
      }
      const costText = csvCell(row, headers, 'costPriceMinor', 'costPrice') || '0';
      const sellText = csvCell(row, headers, 'sellingPriceMinor', 'sellingPrice');
      if (!sellText) throw new BadRequestException(`CSV row ${rowNumber}: sellingPrice or sellingPriceMinor is required.`);
      const costPriceMinor = csvMoneyMinor(costText, currency, headers.includes('costpriceminor'), 'cost price', rowNumber);
      const sellingPriceMinor = csvMoneyMinor(sellText, currency, headers.includes('sellingpriceminor'), 'selling price', rowNumber);
      const thresholdText = csvCell(row, headers, 'lowStockThreshold') || '0';
      const lowStockThreshold = Number(thresholdText);
      if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0 || lowStockThreshold > 1_000_000 || Math.round(lowStockThreshold * 1000) !== lowStockThreshold * 1000) throw new BadRequestException(`CSV row ${rowNumber}: lowStockThreshold must be a non-negative number with at most three decimals.`);
      const trackText = csvCell(row, headers, 'trackStock').toLowerCase();
      if (trackText && !['true', 'yes', '1', 'y', 'false', 'no', '0', 'n'].includes(trackText)) throw new BadRequestException(`CSV row ${rowNumber}: trackStock must be true/false or yes/no.`);
      return { name, sku, barcode, brand: csvCell(row, headers, 'brand'), unitOfMeasure: csvCell(row, headers, 'unitOfMeasure'), supplierSku: csvCell(row, headers, 'supplierSku'), categoryName: csvCell(row, headers, 'categoryName'), costPriceMinor, sellingPriceMinor, lowStockThreshold, trackStock: trackText ? ['true', 'yes', '1', 'y'].includes(trackText) : true };
    });
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const item of items) {
          let categoryId: string | undefined;
          if (item.categoryName) categoryId = (await tx.category.upsert({ where: { tenantId_name: { tenantId: workspaceId, name: item.categoryName } }, create: { tenantId: workspaceId, name: item.categoryName }, update: {} })).id;
          await tx.product.create({ data: {
            tenantId: workspaceId, name: item.name, sku: item.sku,
            barcode: item.barcode || null, brand: item.brand || null, unitOfMeasure: item.unitOfMeasure || null, supplierSku: item.supplierSku || null,
            categoryId, costPriceMinor: item.costPriceMinor, sellingPriceMinor: item.sellingPriceMinor,
            lowStockThreshold: String(item.lowStockThreshold), trackStock: item.trackStock, active: true,
          } });
        }
        await tx.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: session.userId, action: 'products.csv_imported', resourceType: 'product_import', resourceId: undefined, requestId: request.headers['x-request-id'] as string | undefined, metadata: { importedCount: items.length } } });
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('The import contains a duplicate SKU or another unique-field conflict. No rows were imported.');
      throw error;
    }
    return { importedCount: items.length };
  }

  @Post('workspaces/:workspaceId/branches/:branchId/imports/opening-stock-csv')
  @UseGuards(CsrfGuard)
  async importOpeningStockCsv(@Param('workspaceId') workspaceId: string, @Param('branchId') branchId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    const membership = await this.membershipFor(session.userId, workspaceId);
    if (!['owner', 'admin', 'manager'].includes(membership.role)) throw new ForbiddenException('Only workspace managers can import opening stock.');
    await this.branchFor(workspaceId, branchId);
    const { headers, rows } = parseCsvRows(body.csv);
    const seen = new Set<string>();
    const items = rows.map((row, i) => {
      const rowNumber = i + 2;
      const sku = requiredCsvCell(row, headers, 'sku', rowNumber);
      const normalizedSku = sku.toLowerCase();
      if (seen.has(normalizedSku)) throw new ConflictException(`CSV row ${rowNumber}: SKU ${sku} is duplicated in this import.`);
      seen.add(normalizedSku);
      const quantity = Number(requiredCsvCell(row, headers, 'quantity', rowNumber));
      if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1_000_000) throw new BadRequestException(`CSV row ${rowNumber}: opening quantity must be a positive whole number.`);
      return { sku, quantity, reason: csvCell(row, headers, 'reason') || 'Opening stock imported from validated CSV', rowNumber };
    });
    try {
      await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        const product = await tx.product.findFirst({ where: { tenantId: workspaceId, sku: { equals: item.sku, mode: 'insensitive' } } });
        if (!product) throw new NotFoundException(`CSV row ${item.rowNumber}: SKU ${item.sku} was not found. Import products first.`);
        if (!product.trackStock) throw new BadRequestException(`CSV row ${item.rowNumber}: stock tracking is disabled for ${product.name}.`);
        await tx.$queryRaw`SELECT id FROM products WHERE id=${product.id}::uuid AND tenant_id=${workspaceId}::uuid FOR UPDATE`;
        const prior = await tx.stockMovement.count({ where: { tenantId: workspaceId, branchId, productId: product.id } });
        if (prior) throw new ConflictException(`CSV row ${item.rowNumber}: opening stock already exists for ${product.name}. Use the stock adjustment workflow instead.`);
        await tx.stockMovement.create({ data: { tenantId: workspaceId, branchId, productId: product.id, type: 'opening', quantityDelta: String(item.quantity), reason: requiredString(item.reason, 'Reason', 500) } });
      }
      await tx.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: session.userId, action: 'opening_stock.csv_imported', resourceType: 'stock_import', requestId: request.headers['x-request-id'] as string | undefined, metadata: { importedCount: items.length, branchId } } });
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2034') throw new ConflictException({ code: 'OPENING_STOCK_CONCURRENCY_CONFLICT', message: 'Opening stock changed during import. Refresh the stock register and retry.' });
      throw error;
    }
    return { importedCount: items.length };
  }

  @Get('workspaces/:workspaceId/backup')
  async exportWorkspaceBackup(@Param('workspaceId') workspaceId: string, @Req() request: FastifyRequest) {
    const session = await this.sessionFor(request);
    await this.membershipFor(session.userId, workspaceId);
    const [workspace, branches, categories, products, stockMovements, sales, saleLines, salePayments, saleReturns, saleReturnLines, moduleRecords] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: workspaceId }, select: { id: true, name: true, slug: true, businessType: true, currency: true, timezone: true, enabledModules: true } }),
      this.prisma.branch.findMany({ where: { tenantId: workspaceId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.category.findMany({ where: { tenantId: workspaceId }, orderBy: { name: 'asc' } }),
      this.prisma.product.findMany({ where: { tenantId: workspaceId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.stockMovement.findMany({ where: { tenantId: workspaceId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.sale.findMany({ where: { tenantId: workspaceId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.saleLine.findMany({ where: { tenantId: workspaceId }, orderBy: { saleId: 'asc' } }),
      this.prisma.salePayment.findMany({ where: { tenantId: workspaceId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.saleReturn.findMany({ where: { tenantId: workspaceId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.saleReturnLine.findMany({ where: { tenantId: workspaceId }, orderBy: { returnId: 'asc' } }),
      this.prisma.moduleRecord.findMany({ where: { tenantId: workspaceId }, orderBy: { createdAt: 'asc' } }),
    ]);
    if (!workspace) throw new NotFoundException('Workspace not found.');
    const recordCount = branches.length + categories.length + products.length + stockMovements.length + sales.length + saleLines.length + salePayments.length + saleReturns.length + saleReturnLines.length + moduleRecords.length;
    if (recordCount > 50_000) throw new ServiceUnavailableException('This workspace backup exceeds the current export limit. Use a managed database export for larger workspaces.');
    return {
      format: 'lexa-server-workspace-backup', version: 1, database: 'neon-postgresql', createdAt: new Date().toISOString(), workspaceId,
      workspace,
      tables: { branches, categories, products, stockMovements, sales, saleLines, salePayments, saleReturns, saleReturnLines, moduleRecords },
      exclusions: ['User credentials and password hashes', 'Sessions and password-reset tokens', 'Audit history', 'Uploaded files and attachment bytes'],
    };
  }

  @Post('workspaces/:workspaceId/backup/restore')
  @UseGuards(CsrfGuard)
  async restoreWorkspaceBackup(@Param('workspaceId') workspaceId: string, @Body() raw: unknown, @Req() request: FastifyRequest) {
    const body = asObject(raw);
    const session = await this.sessionFor(request);
    const membership = await this.membershipFor(session.userId, workspaceId);
    if (!['owner', 'admin'].includes(membership.role)) throw new ForbiddenException('Only a workspace owner or administrator can restore a backup.');
    const backup = asObject(body.backup, 'backup');
    if (backup.format !== 'lexa-server-workspace-backup' || backup.version !== 1 || backup.database !== 'neon-postgresql') throw new BadRequestException('This is not a supported LEXA server backup. Upload a backup downloaded from the LEXA backend.');
    if (backup.workspaceId !== workspaceId) throw new BadRequestException('A server backup can only be restored into the same workspace it was exported from.');
    const workspaceData = asObject(backup.workspace, 'backup workspace');
    if (workspaceData.id !== workspaceId) throw new BadRequestException('The workspace identity in this backup does not match the selected workspace.');
    const tables = asObject(backup.tables, 'backup tables');
    const rawBranches = backupArray(tables, 'branches');
    const rawCategories = backupArray(tables, 'categories');
    const rawProducts = backupArray(tables, 'products');
    const rawMovements = backupArray(tables, 'stockMovements');
    const rawSales = backupArray(tables, 'sales');
    const rawSaleLines = backupArray(tables, 'saleLines');
    const rawPayments = backupArray(tables, 'salePayments');
    const rawReturns = backupArray(tables, 'saleReturns');
    const rawReturnLines = backupArray(tables, 'saleReturnLines');
    const rawModuleRecords = backupArray(tables, 'moduleRecords');
    const recordsTotal = rawBranches.length + rawCategories.length + rawProducts.length + rawMovements.length + rawSales.length + rawSaleLines.length + rawPayments.length + rawReturns.length + rawReturnLines.length + rawModuleRecords.length;
    if (recordsTotal > 50_000) throw new BadRequestException('This backup exceeds the restore limit of 50000 records.');
    if (!rawBranches.length) throw new BadRequestException('A business backup must contain at least one branch.');
    const branches = rawBranches.map((r) => {
      if (r.tenantId !== workspaceId) throw new BadRequestException('Backup branch belongs to a different workspace.');
      return { id: backupUuid(r.id, 'branch.id'), tenantId: workspaceId, code: requiredString(r.code, 'branch.code', 30), name: requiredString(r.name, 'branch.name', 100), address: optionalString(r.address, 250) ?? null, timezone: requiredString(r.timezone ?? 'Africa/Kampala', 'branch.timezone', 80), currency: requiredString(r.currency ?? 'UGX', 'branch.currency', 3), createdAt: backupDate(r.createdAt, 'branch.createdAt')!, updatedAt: backupDate(r.updatedAt, 'branch.updatedAt')! };
    });
    const branchIds = new Set(branches.map((r) => r.id));
    if (branchIds.size !== branches.length) throw new BadRequestException('Backup contains duplicate branch IDs.');
    const categories = rawCategories.map((r) => {
      if (r.tenantId !== workspaceId) throw new BadRequestException('Backup category belongs to a different workspace.');
      return { id: backupUuid(r.id, 'category.id'), tenantId: workspaceId, name: requiredString(r.name, 'category.name', 150), createdAt: backupDate(r.createdAt, 'category.createdAt')!, updatedAt: backupDate(r.updatedAt, 'category.updatedAt')! };
    });
    const categoryIds = new Set(categories.map((r) => r.id));
    if (categoryIds.size !== categories.length) throw new BadRequestException('Backup contains duplicate category IDs.');
    const products = rawProducts.map((r) => {
      if (r.tenantId !== workspaceId) throw new BadRequestException('Backup product belongs to a different workspace.');
      const categoryId = optionalString(r.categoryId, 80) ?? null;
      if (categoryId && !categoryIds.has(categoryId)) throw new BadRequestException('Backup product references a category that is missing from the backup.');
      const threshold = Number(r.lowStockThreshold ?? 0);
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1_000_000) throw new BadRequestException('Backup product has an invalid low-stock threshold.');
      return { id: backupUuid(r.id, 'product.id'), tenantId: workspaceId, name: requiredString(r.name, 'product.name', 150), sku: requiredString(r.sku, 'product.sku', 100), barcode: optionalString(r.barcode, 100) ?? null, brand: optionalString(r.brand, 100) ?? null, unitOfMeasure: optionalString(r.unitOfMeasure, 40) ?? null, supplierSku: optionalString(r.supplierSku, 100) ?? null, categoryId, costPriceMinor: moneyMinor(r.costPriceMinor, 'product.costPriceMinor'), sellingPriceMinor: moneyMinor(r.sellingPriceMinor, 'product.sellingPriceMinor'), lowStockThreshold: String(threshold), trackStock: r.trackStock === true, active: r.active !== false, createdAt: backupDate(r.createdAt, 'product.createdAt')!, updatedAt: backupDate(r.updatedAt, 'product.updatedAt')! };
    });
    const productIds = new Set(products.map((r) => r.id));
    if (productIds.size !== products.length) throw new BadRequestException('Backup contains duplicate product IDs.');
    const sales = rawSales.map((r) => {
      if (r.tenantId !== workspaceId || !branchIds.has(String(r.branchId))) throw new BadRequestException('Backup sale references a different workspace or missing branch.');
      return { id: backupUuid(r.id, 'sale.id'), tenantId: workspaceId, branchId: String(r.branchId), receiptNumber: requiredString(r.receiptNumber, 'sale.receiptNumber', 100), customerName: optionalString(r.customerName, 150) ?? null, customerPhone: optionalString(r.customerPhone, 80) ?? null, promisedPaymentDate: backupDate(r.promisedPaymentDate, 'sale.promisedPaymentDate', true), totalMinor: moneyMinor(r.totalMinor, 'sale.totalMinor'), status: requiredString(r.status, 'sale.status', 40), createdAt: backupDate(r.createdAt, 'sale.createdAt')! };
    });
    const saleIds = new Set(sales.map((r) => r.id));
    if (saleIds.size !== sales.length) throw new BadRequestException('Backup contains duplicate sale IDs.');
    const saleLines = rawSaleLines.map((r) => {
      if (r.tenantId !== workspaceId || !saleIds.has(String(r.saleId)) || !productIds.has(String(r.productId))) throw new BadRequestException('Backup sale line references missing business records.');
      return { id: backupUuid(r.id, 'saleLine.id'), tenantId: workspaceId, saleId: String(r.saleId), productId: String(r.productId), productNameSnapshot: requiredString(r.productNameSnapshot, 'saleLine.productNameSnapshot', 180), quantity: String(positiveQuantity(r.quantity)), unitPriceMinor: moneyMinor(r.unitPriceMinor, 'saleLine.unitPriceMinor'), lineTotalMinor: moneyMinor(r.lineTotalMinor, 'saleLine.lineTotalMinor') };
    });
    const saleLineIds = new Set(saleLines.map((r) => r.id));
    if (saleLineIds.size !== saleLines.length) throw new BadRequestException('Backup contains duplicate sale-line IDs.');
    const salePayments = rawPayments.map((r) => {
      if (r.tenantId !== workspaceId || !saleIds.has(String(r.saleId))) throw new BadRequestException('Backup payment references a missing sale.');
      return { id: backupUuid(r.id, 'salePayment.id'), tenantId: workspaceId, saleId: String(r.saleId), kind: requiredString(r.kind ?? 'receipt', 'salePayment.kind', 30), method: requiredString(r.method, 'salePayment.method', 40), amountMinor: moneyMinor(r.amountMinor, 'salePayment.amountMinor'), reference: optionalString(r.reference, 200) ?? null, createdAt: backupDate(r.createdAt, 'salePayment.createdAt')! };
    });
    const saleReturns = rawReturns.map((r) => {
      if (r.tenantId !== workspaceId || !branchIds.has(String(r.branchId)) || !saleIds.has(String(r.saleId))) throw new BadRequestException('Backup return references missing business records.');
      return { id: backupUuid(r.id, 'saleReturn.id'), tenantId: workspaceId, branchId: String(r.branchId), saleId: String(r.saleId), returnNumber: requiredString(r.returnNumber, 'saleReturn.returnNumber', 100), totalMinor: moneyMinor(r.totalMinor, 'saleReturn.totalMinor'), reason: requiredString(r.reason, 'saleReturn.reason', 500), refundRecorded: r.refundRecorded === true, createdAt: backupDate(r.createdAt, 'saleReturn.createdAt')! };
    });
    const returnIds = new Set(saleReturns.map((r) => r.id));
    if (returnIds.size !== saleReturns.length) throw new BadRequestException('Backup contains duplicate return IDs.');
    const saleReturnLines = rawReturnLines.map((r) => {
      if (r.tenantId !== workspaceId || !returnIds.has(String(r.returnId)) || !saleLineIds.has(String(r.originalSaleLineId)) || !productIds.has(String(r.productId))) throw new BadRequestException('Backup return line references missing business records.');
      return { id: backupUuid(r.id, 'saleReturnLine.id'), tenantId: workspaceId, returnId: String(r.returnId), originalSaleLineId: String(r.originalSaleLineId), productId: String(r.productId), productNameSnapshot: requiredString(r.productNameSnapshot, 'saleReturnLine.productNameSnapshot', 180), quantity: String(positiveQuantity(r.quantity)), unitPriceMinor: moneyMinor(r.unitPriceMinor, 'saleReturnLine.unitPriceMinor'), lineTotalMinor: moneyMinor(r.lineTotalMinor, 'saleReturnLine.lineTotalMinor') };
    });
    const stockMovements = rawMovements.map((r) => {
      if (r.tenantId !== workspaceId || !branchIds.has(String(r.branchId)) || !productIds.has(String(r.productId))) throw new BadRequestException('Backup stock movement references missing business records.');
      const type = requiredString(r.type, 'stockMovement.type', 30);
      if (!['opening', 'receiving', 'sale', 'return', 'adjustment', 'transfer_in', 'transfer_out', 'write_off'].includes(type)) throw new BadRequestException('Backup has an unsupported stock movement type.');
      const quantityDelta = Number(r.quantityDelta);
      if (!Number.isFinite(quantityDelta) || Math.abs(quantityDelta) > 1_000_000 || Math.round(quantityDelta * 1000) !== quantityDelta * 1000) throw new BadRequestException('Backup stock movement quantity is invalid.');
      return { id: backupUuid(r.id, 'stockMovement.id'), tenantId: workspaceId, branchId: String(r.branchId), productId: String(r.productId), type, quantityDelta: String(quantityDelta), reason: requiredString(r.reason, 'stockMovement.reason', 500), sourceId: optionalString(r.sourceId, 200) ?? null, createdAt: backupDate(r.createdAt, 'stockMovement.createdAt')! };
    });
    const moduleRecords = rawModuleRecords.map((r) => {
      if (r.tenantId !== workspaceId || !branchIds.has(String(r.branchId))) throw new BadRequestException('Backup module record references a different workspace or missing branch.');
      return { id: backupUuid(r.id, 'moduleRecord.id'), tenantId: workspaceId, branchId: String(r.branchId), moduleId: requiredString(r.moduleId, 'moduleRecord.moduleId', 120), recordId: requiredString(r.recordId, 'moduleRecord.recordId', 200), data: asObject(r.data, 'moduleRecord.data') as any, version: Math.max(1, typeof r.version === 'number' && Number.isSafeInteger(r.version) ? r.version : 1), createdAt: backupDate(r.createdAt, 'moduleRecord.createdAt')!, updatedAt: backupDate(r.updatedAt, 'moduleRecord.updatedAt')! };
    });
    const moduleKeys = new Set<string>();
    for (const row of moduleRecords) {
      const key = `${row.branchId}:${row.moduleId}:${row.recordId}`;
      if (moduleKeys.has(key)) throw new BadRequestException('Backup contains duplicate module record IDs.');
      moduleKeys.add(key);
    }
    const enabledModules = Array.isArray(workspaceData.enabledModules) ? workspaceData.enabledModules.filter((value): value is string => typeof value === 'string').slice(0, 500) : [];
    const businessName = requiredString(workspaceData.name, 'backup.workspace.name', 100);
    const businessType = requiredString(workspaceData.businessType ?? 'general', 'backup.workspace.businessType', 80);
    const currency = requiredString(workspaceData.currency ?? 'UGX', 'backup.workspace.currency', 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('Backup workspace currency is invalid.');
    const timezone = requiredString(workspaceData.timezone ?? 'Africa/Kampala', 'backup.workspace.timezone', 80);
    const tablesRestored = 10;
    await this.prisma.$transaction(async (tx) => {
      // Restore is workspace-scoped and transactional. Audit history and authentication records are preserved separately.
      await tx.saleReturnLine.deleteMany({ where: { tenantId: workspaceId } });
      await tx.salePayment.deleteMany({ where: { tenantId: workspaceId } });
      await tx.saleLine.deleteMany({ where: { tenantId: workspaceId } });
      await tx.saleReturn.deleteMany({ where: { tenantId: workspaceId } });
      await tx.sale.deleteMany({ where: { tenantId: workspaceId } });
      await tx.stockMovement.deleteMany({ where: { tenantId: workspaceId } });
      await tx.moduleRecord.deleteMany({ where: { tenantId: workspaceId } });
      await tx.product.deleteMany({ where: { tenantId: workspaceId } });
      await tx.category.deleteMany({ where: { tenantId: workspaceId } });
      await tx.branch.deleteMany({ where: { tenantId: workspaceId } });
      await tx.idempotencyRecord.deleteMany({ where: { tenantId: workspaceId } });
      await tx.tenant.update({ where: { id: workspaceId }, data: { name: businessName, businessType, currency, timezone, enabledModules } });
      await tx.branch.createMany({ data: branches as any });
      if (categories.length) await tx.category.createMany({ data: categories as any });
      if (products.length) await tx.product.createMany({ data: products as any });
      if (sales.length) await tx.sale.createMany({ data: sales as any });
      if (saleLines.length) await tx.saleLine.createMany({ data: saleLines as any });
      if (salePayments.length) await tx.salePayment.createMany({ data: salePayments as any });
      if (saleReturns.length) await tx.saleReturn.createMany({ data: saleReturns as any });
      if (saleReturnLines.length) await tx.saleReturnLine.createMany({ data: saleReturnLines as any });
      if (stockMovements.length) await tx.stockMovement.createMany({ data: stockMovements as any });
      if (moduleRecords.length) await tx.moduleRecord.createMany({ data: moduleRecords as any });
      await tx.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: session.userId, action: 'workspace.backup_restored', resourceType: 'workspace', resourceId: workspaceId, requestId: request.headers['x-request-id'] as string | undefined, metadata: { recordsRestored: recordsTotal, tablesRestored } } });
    }, { isolationLevel: 'Serializable' });
    return { accepted: true, tablesRestored, recordsRestored: recordsTotal };
  }

}
