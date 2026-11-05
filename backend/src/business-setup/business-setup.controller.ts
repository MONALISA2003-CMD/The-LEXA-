import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Param, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CsrfGuard } from '../core/csrf.guard';
import { normalizeRole } from '../authorization/role-policy';
import { validateSetupStep, availablePaymentCodes, SetupValidationError, normaliseSavedIndustries } from './business-setup.rules';
import { BUSINESS_SPECIALTY_POLICY_HASH, validateBusinessSpecialties } from '../catalog/business-specialties.generated';

// Global TenantAuthorizationGuard verifies the signed-in membership, tenant scope,
// permissions and RLS before any business-setup handler runs.
@Controller('workspaces/:workspaceId/business-setup')
export class BusinessSetupController {
  constructor(private readonly prisma: PrismaService) {}

  private async member(workspaceId: string, request: FastifyRequest) {
    // Recheck the signed-in identity inside the controller. A request-context
    // entered in a guard is not guaranteed to survive every NestJS async boundary.
    const raw = (request.headers.cookie ?? '').split(';').map(x => x.trim()).find(x => x.startsWith('lexa_session='));
    let cookie = '';
    try { cookie = decodeURIComponent(raw?.slice('lexa_session='.length) ?? ''); } catch { /* Reject malformed session. */ }
    if (!cookie) throw new UnauthorizedException('Sign in to manage a business.');
    const session = await this.prisma.session.findFirst({
      where: { tokenHash: createHash('sha256').update(cookie).digest('hex'), expiresAt: { gt: new Date() } },
      select: { userId: true },
    });
    if (!session) throw new UnauthorizedException('Your session expired. Sign in again.');
    const membership = await this.prisma.runWithTenantContext({ tenantId: workspaceId, userId: session.userId }, () => this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: workspaceId, userId: session.userId } },
      select: { role: true, status: true },
    }));
    if (membership?.status !== 'ACTIVE') throw new ForbiddenException('Business access is no longer active.');
    return { userId: session.userId, isOwner: ['owner','owner_administrator'].includes(normalizeRole(membership.role)) };
  }

  @Get()
  async read(@Param('workspaceId') workspaceId: string, @Req() request: FastifyRequest) {
    const member = await this.member(workspaceId, request);
    return this.prisma.runWithTenantContext({ tenantId: workspaceId, userId: member.userId }, async () => {
    const [tenant, branch, profile, savedMethods, lastActivityChange] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: workspaceId } }),
      this.prisma.branch.findFirst({ where: { tenantId: workspaceId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.businessProfile.findUnique({ where: { tenantId: workspaceId } }),
      this.prisma.businessPaymentMethod.findMany({ where: { tenantId: workspaceId } }),
      this.prisma.businessActivityRevision.findFirst({where:{tenantId:workspaceId},orderBy:{version:'desc'},select:{version:true,changedAt:true,actorUserId:true}}),
    ]);
    if (!tenant) throw new ForbiddenException('Business not found.');
    if (!member.isOwner) return { workspaceId, isOwner: false, completedAt: profile?.completedAt?.toISOString() ?? null };
    const saved = new Map(savedMethods.map(m => [m.code,m]));
    return {
      workspaceId, isOwner: member.isOwner, businessName: tenant.name,
      currency: tenant.currency, timezone: tenant.timezone,
      branchId: branch?.id ?? null, branchName: branch?.name ?? 'Main branch', branchAddress: branch?.address ?? '',
      tradingName: profile?.tradingName ?? '', legalName: profile?.legalName ?? '',
      country: profile?.country ?? 'UG', district: profile?.district ?? '', city: profile?.city ?? '',
      physicalAddress: profile?.physicalAddress ?? '', onlineOnly: profile?.onlineOnly ?? false,
      email: profile?.email ?? '', phone: profile?.phone ?? '', website: profile?.website ?? '',
      registrationNumber: profile?.registrationNumber ?? '', taxIdentificationNumber: profile?.taxIdentificationNumber ?? '',
      industry: normaliseSavedIndustries(profile?.industries,profile?.industry)[0] ?? 'other', industries: normaliseSavedIndustries(profile?.industries,profile?.industry),
      subActivityCodes:profile?.subActivityCodes??[],activityRevision:profile?.activityRevision??0,
      lastActivityChange:lastActivityChange?{version:lastActivityChange.version,changedAt:lastActivityChange.changedAt.toISOString(),actorUserId:lastActivityChange.actorUserId}:null, businessModels: (profile?.businessModels?.filter(model=>model!=='manufacturing').length ? profile.businessModels.filter(model=>model!=='manufacturing') : [tenant.businessType==='wholesale'?'wholesale':tenant.businessType==='services'?'services':'other']),
      offeringTypes: profile?.offeringTypes ?? [], offeringsDescription: profile?.offeringsDescription ?? '',
      sellingChannels: profile?.sellingChannels ?? [], setupStep: profile?.setupStep ?? 1,
      completedAt: profile?.completedAt?.toISOString() ?? null,
      manualPaymentsConfirmedAt: profile?.manualPaymentsConfirmedAt?.toISOString() ?? null,
      paymentMethods: availablePaymentCodes.map(item => ({ code: item.code, label: saved.get(item.code)?.label ?? item.label, enabled: saved.get(item.code)?.enabled ?? (savedMethods.length === 0 && item.code === 'cash') })),
    };
    });
  }

  @Patch()
  @UseGuards(CsrfGuard)
  async save(@Param('workspaceId') workspaceId: string, @Body() body: unknown, @Req() request: FastifyRequest) {
    const member = await this.member(workspaceId, request);
    if (!member.isOwner) throw new ForbiddenException('Only a business owner may confirm its business setup and payment options.');
    let payload: ReturnType<typeof validateSetupStep>;
    try { payload = validateSetupStep(body); }
    catch (error) { if (error instanceof SetupValidationError) throw new BadRequestException(error.message); throw error; }
    return this.prisma.runWithTenantContext({ tenantId: workspaceId, userId: member.userId }, () => this.prisma.$transaction(async tx => {
      const tenant = await tx.tenant.findUnique({ where: { id: workspaceId } });
      if (!tenant) throw new ForbiddenException('Business unavailable.');
      const step = payload.step;
      const record: Record<string, unknown> = {};
      if (step === 1) {
        const { step: _step, businessName, branchName, ...fields } = payload;
        Object.assign(record, fields);
        await tx.tenant.update({ where: { id: workspaceId }, data: { name: businessName } });
        const firstBranch = await tx.branch.findFirst({ where: { tenantId: workspaceId }, orderBy: { createdAt: 'asc' } });
        if (firstBranch) await tx.branch.update({ where: { id: firstBranch.id }, data: { name: branchName, address: fields.physicalAddress || null } });
      }
      if (step === 2) {
        const { industry, industries, businessModels, offeringTypes, offeringsDescription, sellingChannels } = payload;
        Object.assign(record, { industry, industries, businessModels, offeringTypes, offeringsDescription, sellingChannels });
        await tx.tenant.update({ where: { id: workspaceId }, data: { businessType: businessModels[0] ?? 'general' } });
      }
      if (step === 3) {
        const { currency, timezone, methods, confirmation } = payload;
        if (tenant.currency !== currency) {
          const [sales, products, journals, moduleRecords] = await Promise.all([
            tx.sale.count({ where: { tenantId: workspaceId } }),
            tx.product.count({ where: { tenantId: workspaceId } }),
            tx.ledgerJournal.count({ where: { tenantId: workspaceId } }),
            tx.moduleRecord.count({ where: { tenantId: workspaceId } }),
          ]);
          if (sales || products || journals || moduleRecords) throw new BadRequestException('Currency is locked after business transactions or products exist.');
        }
        await tx.tenant.update({ where: { id: workspaceId }, data: { currency, timezone } });
        await tx.branch.updateMany({ where: { tenantId: workspaceId }, data: { currency, timezone } });
        record.manualPaymentsConfirmedAt = confirmation ? new Date() : null;
        for (const method of availablePaymentCodes) {
          const enabled = methods.includes(method.code);
          await tx.businessPaymentMethod.upsert({
            where: { tenantId_code: { tenantId: workspaceId, code: method.code } },
            create: { tenantId: workspaceId, code: method.code, label: method.label, enabled },
            update: { enabled, label: method.label },
          });
        }
      }
      const existing = await tx.businessProfile.findUnique({ where: { tenantId: workspaceId } });
      if(step===2){
        const updated=payload as Extract<ReturnType<typeof validateSetupStep>,{step:2}>;
        const previousIndustries=normaliseSavedIndustries(existing?.industries,existing?.industry);
        const previousSpecialties=existing?.subActivityCodes??[];
        if(updated.activityRevision!==undefined && updated.activityRevision!==(existing?.activityRevision??0))
          throw new ConflictException('Business activities changed in another session. Reload the business profile before saving.');
        // Never clear a previously selected specialty because a legacy caller did
        // not yet know about subActivityCodes. Explicit [] still clears it.
        // Specialty codes have their own prefixes (e.g. fashion.boutique).
        // Revalidate saved selections against the authoritative industry registry.
        const retainedSpecialties=updated.subActivityCodes??previousSpecialties.filter(code=>{
          try{return validateBusinessSpecialties([code],updated.industries).length===1;}catch{return false;}
        });
        record.subActivityCodes=retainedSpecialties;
        const changed=JSON.stringify([...previousIndustries].sort())!==JSON.stringify([...updated.industries].sort()) ||
          JSON.stringify([...previousSpecialties].sort())!==JSON.stringify([...retainedSpecialties].sort());
        if(changed){
          const retired=previousIndustries.filter(code=>!updated.industries.includes(code));
          if(retired.length&&!updated.confirmActivityChange){
            const activeProducts=await tx.product.count({where:{tenantId:workspaceId,active:true}});
            if(activeProducts>0)throw new BadRequestException(`Review your ${activeProducts} active products and any outstanding orders before removing business activities. Confirm that historical records remain accessible.`);
          }
          const version=(existing?.activityRevision??0)+1;
          record.activityRevision=version;
          const currentIndustries=[...updated.industries].sort(),currentSpecialties=[...retainedSpecialties].sort();
          const policyHash=createHash('sha256').update(JSON.stringify({currentIndustries,currentSpecialties,registry:BUSINESS_SPECIALTY_POLICY_HASH})).digest('hex');
          await tx.businessActivityRevision.create({data:{tenantId:workspaceId,version,previousIndustries,previousSpecialties,currentIndustries,currentSpecialties,policyHash,actorUserId:member.userId}});
        }
      }
      await tx.businessProfile.upsert({
        where: { tenantId: workspaceId },
        create: { tenantId: workspaceId, ...record, setupStep: Math.min(4, step + 1) },
        update: { ...record, setupStep: Math.max(existing?.setupStep ?? 1, Math.min(4, step + 1)) },
      });
      await tx.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: member.userId, action: `business.setup.step_${step}.saved`, resourceType: 'business_profile', resourceId: workspaceId } });
      return { saved: true, step, nextStep: Math.min(4, step + 1) };
    }));
  }

  @Post('complete')
  @UseGuards(CsrfGuard)
  async complete(@Param('workspaceId') workspaceId: string, @Req() request: FastifyRequest) {
    const member = await this.member(workspaceId, request);
    if (!member.isOwner) throw new ForbiddenException('Only the owner may complete business setup.');
    return this.prisma.runWithTenantContext({ tenantId: workspaceId, userId: member.userId }, () => this.prisma.$transaction(async tx => {
      const [profile, methods] = await Promise.all([
        tx.businessProfile.findUnique({ where: { tenantId: workspaceId } }),
        tx.businessPaymentMethod.findMany({ where: { tenantId: workspaceId, enabled: true } }),
      ]);
      if (!profile?.country || !(profile.industries.length || profile.industry) || !profile.businessModels.length ||
          !profile.offeringTypes.length || !profile.offeringsDescription ||
          !profile.manualPaymentsConfirmedAt || methods.length === 0 || profile.setupStep < 4) {
        throw new BadRequestException('Complete business identity, activities and your manually confirmed payment methods first.');
      }
      const completed = await tx.businessProfile.update({ where: { tenantId: workspaceId }, data: { completedAt: profile.completedAt ?? new Date() } });
      await tx.auditEvent.create({ data: { tenantId: workspaceId, actorUserId: member.userId, action: 'business.setup.completed', resourceType: 'business_profile', resourceId: workspaceId } });
      return { completed: true, completedAt: completed.completedAt?.toISOString() };
    }));
  }
}
