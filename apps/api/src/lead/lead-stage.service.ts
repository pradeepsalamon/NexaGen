import { Injectable, Logger } from "@nestjs/common";
import { nextLeadStatus, type LeadStageEvent } from "@nexa-chess/types";
import { MetaCapiService } from "../meta-capi/meta-capi.service";
import { ReferralTrackerService } from "../referral/referral-tracker.service";
import { PrismaService } from "../prisma/prisma.service";
import { FrappeCrmPushService } from "./frappe-crm-push.service";

/** Activity type written for each automatic move. */
const ACTIVITY_TYPES: Record<LeadStageEvent, string> = {
  DEMO_ATTENDED: "DEMO_ATTENDED",
  DEMO_BOOKED: "DEMO_STAGE",
  DEMO_CONFIRMED: "DEMO_CONFIRMED",
  DEMO_MISSED: "DEMO_MISSED",
  ENROLLED: "ENROLLED",
  REGISTERED: "REGISTERED"
};

/**
 * What referral progress an event is, when it is one. Registration and enrolment are left
 * out on purpose: referral rewards follow the referral's own sign-up and payment rules.
 */
const REFERRAL_TRIGGERS: Partial<Record<LeadStageEvent, "DEMO_ATTENDED" | "DEMO_BOOKED">> = {
  DEMO_ATTENDED: "DEMO_ATTENDED",
  DEMO_BOOKED: "DEMO_BOOKED"
};

export type LeadStageMove = {
  actorId?: string | null;
  /** Written on the lead's timeline, also when the stage doesn't change (e.g. a second booking). */
  activity?: { description?: string; title: string; type?: string };
};

/**
 * Moves a lead's stage on its own (docs/LEAD_STAGES.md). The rule is
 * `nextLeadStatus` in @nexa-chess/types; this applies it with a status-filtered
 * claim, writes the timeline, moves a linked referral and queues the change for
 * Frappe CRM. A stage a person set by hand goes through LeadService instead.
 */
@Injectable()
export class LeadStageService {
  private readonly logger = new Logger(LeadStageService.name);

  constructor(
    private readonly crmPush: FrappeCrmPushService,
    private readonly metaCapi: MetaCapiService,
    private readonly prisma: PrismaService,
    private readonly referrals: ReferralTrackerService
  ) {}

  /** Returns the new stage, or null when it stayed. Throws only on a database error. */
  async apply(leadId: string, event: LeadStageEvent, move: LeadStageMove = {}): Promise<string | null> {
    const lead = await this.prisma.lead.findUnique({ select: { status: true }, where: { id: leadId } });
    if (!lead) return null;
    const target = nextLeadStatus(lead.status, event);
    const now = new Date();
    let moved = false;
    await this.prisma.$transaction(async (tx) => {
      if (target) {
        // Lost race (a person or another event changed it meanwhile): their stage wins.
        const claim = await tx.lead.updateMany({ data: { lastActivityAt: now, status: target }, where: { id: leadId, status: lead.status } });
        moved = claim.count === 1;
      } else if (move.activity) {
        await tx.lead.update({ data: { lastActivityAt: now }, where: { id: leadId } });
      }
      if (move.activity) {
        await tx.leadActivity.create({
          data: {
            activityType: move.activity.type ?? ACTIVITY_TYPES[event],
            createdById: move.actorId ?? null,
            description: move.activity.description ?? null,
            leadId,
            title: move.activity.title
          }
        });
      }
      if (moved && target) {
        await this.crmPush.markStageChanged(tx, leadId);
        await this.metaCapi.onLeadStatus(tx, leadId, target, now);
      }
    });

    const trigger = REFERRAL_TRIGGERS[event];
    if (trigger) await this.referrals.onLeadEvent(leadId, trigger, move.actorId ?? null);
    if (moved) void this.crmPush.pushLead(leadId);
    return moved ? target : null;
  }

  /** Best-effort form for callers that must never fail on it (join, webhooks). */
  async applyQuietly(leadId: string, event: LeadStageEvent, move: LeadStageMove = {}): Promise<void> {
    try {
      await this.apply(leadId, event, move);
    } catch (error) {
      this.logger.warn(`Lead ${leadId} stage (${event}) not updated: ${(error as Error).message}`);
    }
  }
}
