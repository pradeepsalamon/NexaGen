import { Injectable, Logger } from "@nestjs/common";
import type { ReferralBenefitItem, ReferralVisitResponse } from "@nexa-chess/types";
import { type LeadStatus, type ReferralStageTrigger, UserStatus } from "@prisma/client";
import { parseUserAgent } from "../lead/lead-tracking.util";
import { isUniqueViolation } from "../payments/payments.util";
import { EntitlementService } from "../platform/entitlement.service";
import { PrismaService } from "../prisma/prisma.service";
import { REFERRAL_FOR_MOVE, ReferralPipelineService } from "./referral-pipeline.service";
import { ReferralSettingsService } from "./referral-settings.service";
import { requireTenantId } from "../tenancy/tenant-sql";

/** Lead CRM statuses that move a referral, and where to. */
const LEAD_STATUS_TRIGGERS: Partial<Record<LeadStatus, ReferralStageTrigger>> = {
  ACTIVE_STUDENT: "CONVERTED",
  CONVERTED: "CONVERTED",
  DEMO_ATTENDED: "DEMO_ATTENDED",
  DEMO_SCHEDULED: "DEMO_BOOKED",
  LOST: "LOST"
};

/**
 * Turns public activity into referral progress: link visits, demo bookings
 * (the academy lead form) and lead-pipeline events. Called by the lead and
 * demo-class code; nothing here ever throws into those flows.
 */
@Injectable()
export class ReferralTrackerService {
  private readonly logger = new Logger(ReferralTrackerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: ReferralPipelineService,
    private readonly settings: ReferralSettingsService,
    private readonly entitlements: EntitlementService
  ) {}

  /** An active code whose owner may still refer, or null. */
  private async findLiveCode(rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,16}$/.test(code)) return null;
    const settings = await this.settings.get();
    if (!settings.enabled || !(await this.entitlements.hasFeature("referralProgram"))) return null;
    const row = await this.prisma.referralCode.findUnique({
      include: { user: { select: { firstName: true, id: true, role: true, status: true } } },
      where: { tenantId_code: { code, tenantId: requireTenantId("referralCode") } }
    });
    if (!row || !row.isActive || row.user.status !== UserStatus.ACTIVE) return null;
    if (!this.settings.isEligible(row.user, settings)) return null;
    return { ...row, settings };
  }

  /**
   * Records a visit. One `Referral` per (code, browser); each hit adds a
   * `ReferralVisit`. The owner opening their own link counts nothing.
   */
  async recordVisit(input: {
    code: string;
    visitorId: string;
    url?: string;
    referrer?: string;
    userAgent?: string;
    viewerUserId?: string;
  }): Promise<ReferralVisitResponse & { referralId: string | null; attributionDays: number }> {
    const code = await this.findLiveCode(input.code);
    if (!code) return { attributionDays: 0, benefits: [], referralId: null, referrerFirstName: null, valid: false };

    const base = {
      attributionDays: code.settings.attributionDays,
      benefits: await this.benefits(),
      referrerFirstName: code.user.firstName,
      valid: true
    };
    if (input.viewerUserId === code.userId) return { ...base, referralId: null };

    const referralId = await this.findOrCreateReferral(code.id, code.userId, input.visitorId);
    await this.prisma.referralVisit.create({
      data: {
        codeId: code.id,
        deviceType: parseUserAgent(input.userAgent).deviceType,
        landingUrl: input.url?.slice(0, 2000) ?? null,
        referralId,
        referrer: input.referrer?.slice(0, 2000) ?? null,
        visitorId: input.visitorId
      }
    });
    return { ...base, referralId };
  }

  /** The points a new member gets at each stage for joining through a link. */
  async benefits(): Promise<ReferralBenefitItem[]> {
    const stages = await this.prisma.referralStage.findMany({
      orderBy: { position: "asc" },
      select: { id: true, name: true, newMemberPoints: true },
      where: { newMemberPoints: { gt: 0 } }
    });
    return stages.map((stage) => ({ points: stage.newMemberPoints, stageId: stage.id, stageName: stage.name }));
  }

  /**
   * A new account was created: link it to the referral that brought it in —
   * the referral cookie from a link visit, else a referral whose lead used
   * the same email — and give its welcome benefits. Never throws into sign-up.
   */
  async linkSignup(input: { userId: string; email: string; referralId?: string }): Promise<void> {
    try {
      let referralId: string | null = null;
      if (input.referralId) {
        const fromCookie = await this.prisma.referral.findUnique({
          select: { id: true, referredUserId: true, referrerId: true },
          where: { id: input.referralId }
        });
        if (fromCookie && !fromCookie.referredUserId && fromCookie.referrerId !== input.userId) referralId = fromCookie.id;
      }
      if (!referralId) {
        const byEmail = await this.prisma.referral.findFirst({
          orderBy: { createdAt: "desc" },
          select: { id: true },
          where: {
            lead: { email: { equals: input.email, mode: "insensitive" } },
            referredUserId: null,
            referrerId: { not: input.userId }
          }
        });
        referralId = byEmail?.id ?? null;
      }
      if (referralId) await this.pipeline.linkReferredUser(referralId, input.userId, null);
    } catch (error) {
      this.logger.warn(`Could not link new account ${input.userId} to a referral: ${(error as Error).message}`);
    }
  }

  private async findOrCreateReferral(codeId: string, referrerId: string, visitorId: string | null): Promise<string> {
    if (visitorId) {
      const existing = await this.prisma.referral.findUnique({
        select: { id: true },
        where: { codeId_visitorId: { codeId, visitorId } }
      });
      if (existing) return existing.id;
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const stages = await this.pipeline.listStages(tx);
        const entry = this.pipeline.entryStage(stages);
        const referral = await tx.referral.create({
          data: { codeId, referrerId, stageId: entry.id, visitorId },
          select: REFERRAL_FOR_MOVE
        });
        await this.pipeline.recordEntry(tx, referral, stages);
        return referral.id;
      });
    } catch (error) {
      // A parallel first hit from the same browser created it.
      if (visitorId && isUniqueViolation(error)) {
        const raced = await this.prisma.referral.findUniqueOrThrow({
          select: { id: true },
          where: { codeId_visitorId: { codeId, visitorId } }
        });
        return raced.id;
      }
      throw error;
    }
  }

  /**
   * A demo was booked through the academy form. Attribution: the referral
   * cookie from a link visit, else a typed/remembered code. A browser that
   * books a second lead starts a second referral for the same referrer.
   */
  async attachLead(input: {
    leadId: string;
    prospectName: string;
    referralId?: string;
    referralCode?: string;
  }): Promise<void> {
    try {
      let referralId: string | null = null;

      if (input.referralId) {
        const referral = await this.prisma.referral.findUnique({
          include: { code: true },
          where: { id: input.referralId }
        });
        const live = referral ? await this.findLiveCode(referral.code.code) : null;
        if (referral && live) {
          referralId = referral.leadId
            ? await this.findOrCreateReferral(referral.codeId, referral.referrerId, null)
            : referral.id;
        }
      }
      if (!referralId && input.referralCode) {
        const live = await this.findLiveCode(input.referralCode);
        if (live) referralId = await this.findOrCreateReferral(live.id, live.userId, null);
      }
      if (!referralId) return;

      const { count } = await this.prisma.referral.updateMany({
        data: { leadId: input.leadId, prospectName: input.prospectName.slice(0, 120) },
        where: { id: referralId, leadId: null }
      });
      if (count === 0) return;
      await this.pipeline.advance(referralId, "DEMO_BOOKED");
    } catch (error) {
      this.logger.warn(`Could not attribute lead ${input.leadId} to a referral: ${(error as Error).message}`);
    }
  }

  /** A lead moved in the CRM (admin) — mirror it onto its referral. */
  async onLeadStatus(leadId: string, status: LeadStatus, actorId: string | null): Promise<void> {
    const trigger = LEAD_STATUS_TRIGGERS[status];
    if (trigger) await this.onLeadEvent(leadId, trigger, actorId);
  }

  /** Demo booked into a class, or the guest joined it. */
  async onLeadEvent(leadId: string, trigger: ReferralStageTrigger, actorId: string | null = null): Promise<void> {
    try {
      const referral = await this.prisma.referral.findUnique({ select: { id: true }, where: { leadId } });
      if (referral) await this.pipeline.advance(referral.id, trigger, { actorId });
    } catch (error) {
      this.logger.warn(`Referral update for lead ${leadId} failed: ${(error as Error).message}`);
    }
  }
}
