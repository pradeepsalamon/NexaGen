import { Injectable, Logger } from "@nestjs/common";
import {
  DEFAULT_TENANT_ID,
  LEAD_DETAILS_NOT_GIVEN,
  supportOptCommand,
  WHATSAPP_AD_LEAD_SOURCE,
  WHATSAPP_LEAD_SOURCE
} from "@nexa-chess/types";
import { LeadStatus, type Prisma, type WhatsAppWebhookEvent } from "@prisma/client";
import { FrappeCrmPushService, phoneTail } from "../lead/frappe-crm-push.service";
import { WHATSAPP_LEAD_REUSE_DAYS } from "../lead/lead-constants";
import { MetaCapiService } from "../meta-capi/meta-capi.service";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { currentTenantId } from "../tenancy/tenant-context";
import { requireTenantId } from "../tenancy/tenant-sql";
import type { EffectiveSupportSettings } from "./support-settings.service";
import type { AdReferral } from "./whatsapp-webhook.parse";

/** Fewer digits than this is not a number worth matching on. */
const MIN_MATCH_DIGITS = 7;
/** Stages that close a lead: a number whose only leads are here gets a new one. */
const CLOSED_STATUSES: LeadStatus[] = [LeadStatus.CONVERTED, LeadStatus.ACTIVE_STUDENT, LeadStatus.LOST];

/** What capture did with one message. */
export type LeadCaptureOutcome =
  | { kind: "ACCOUNT" }
  | { kind: "ATTACHED"; leadId: string }
  | { kind: "CREATED"; leadId: string }
  | { kind: "SEEN"; leadId: string }
  | { kind: "SKIPPED" };

export type CaptureEvent = Pick<WhatsAppWebhookEvent, "adReferral" | "occurredAt" | "profileName" | "providerMessageId" | "waId">;

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

/** The stored `adReferral` column, read defensively (it came from Meta). */
export function storedAdReferral(value: Prisma.JsonValue | null): AdReferral | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const json = value as Record<string, unknown>;
  const referral: AdReferral = {
    ctwaClid: text(json.ctwaClid, 512),
    headline: text(json.headline, 200),
    sourceId: text(json.sourceId, 64),
    sourceType: text(json.sourceType, 20),
    sourceUrl: text(json.sourceUrl, 1000)
  };
  return Object.values(referral).some((field) => field !== null) ? referral : null;
}

/**
 * WhatsApp lead capture (docs/LEAD_STAGES.md "WhatsApp lead capture"): every new number that
 * writes to Nexa's WhatsApp becomes a `Lead`, whether the bot is on or off. Sends nothing.
 *
 * - A number on an account (a user's phone, or a student's parent phone) gets no lead.
 * - A number with an open lead (last 90 days, not Lost / Converted) gets no second one; an ad
 *   click on its message is attached to that lead (`LeadAdClick`, first and latest click).
 * - Otherwise a lead: source "WhatsApp ad" (the message carried a Click-to-WhatsApp referral) or
 *   "WhatsApp", campaign = the ad's headline (else its id), parent = the WhatsApp profile name,
 *   child fields = `LEAD_DETAILS_NOT_GIVEN`. Copied to Frappe like the bot's leads.
 *
 * One transaction per message under a per-number xact lock, so two messages from a new number
 * make one lead; a re-run of the same message (Meta retry, lost lease) changes nothing.
 * Nexa's academy only for now.
 */
@Injectable()
export class SupportLeadCaptureService {
  private readonly logger = new Logger(SupportLeadCaptureService.name);

  constructor(
    private readonly crmPush: FrappeCrmPushService,
    private readonly metaCapi: MetaCapiService,
    private readonly prisma: PrismaService
  ) {}

  /** Whether capture runs for the current academy with these settings. */
  enabled(settings: Pick<EffectiveSupportSettings, "captureLeads">): boolean {
    return settings.captureLeads && currentTenantId() === DEFAULT_TENANT_ID;
  }

  /**
   * STOP / START from a number the bot isn't answering (capture with the bot off): recorded on
   * the contact like the bot's own opt-out, so proactive WhatsApp stops. Sends nothing (staff
   * answer in the WhatsApp Business app). Any other message changes nothing here.
   */
  async recordOptCommand(event: Pick<WhatsAppWebhookEvent, "occurredAt" | "profileName" | "text" | "waId">): Promise<void> {
    const command = supportOptCommand(event.text);
    if (!command) return;
    const tenantId = requireTenantId("whatsapp contact");
    if (command === "STOP") {
      await this.prisma.whatsAppContact.upsert({
        create: { lastInboundAt: event.occurredAt, optedOutAt: event.occurredAt, profileName: event.profileName, waId: event.waId },
        update: { lastInboundAt: event.occurredAt, optedOutAt: event.occurredAt },
        where: { tenantId_waId: { tenantId, waId: event.waId } }
      });
    } else {
      await this.prisma.whatsAppContact.updateMany({
        data: { lastInboundAt: event.occurredAt, optedOutAt: null },
        where: { optedOutAt: { not: null }, waId: event.waId }
      });
    }
  }

  /** Captures one customer message. Throws only on a database error (the webhook retries). */
  async capture(event: CaptureEvent): Promise<LeadCaptureOutcome> {
    const tail = phoneTail(event.waId);
    if (tail.length < MIN_MATCH_DIGITS) return { kind: "SKIPPED" };
    const referral = storedAdReferral(event.adReferral);
    const since = new Date(event.occurredAt.getTime() - WHATSAPP_LEAD_REUSE_DAYS * 24 * 60 * 60_000);

    const outcome = await this.prisma.$transaction(async (tx): Promise<LeadCaptureOutcome> => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lead-capture:${currentTenantId() ?? ""}:${tail}`}))`;

      const open = await tx.lead.findFirst({
        orderBy: { createdAt: "desc" },
        select: { id: true },
        where: { createdAt: { gte: since }, phone: { endsWith: tail }, status: { notIn: CLOSED_STATUSES } }
      });
      if (open) {
        if (!referral) return { kind: "SEEN", leadId: open.id };
        const recorded = await this.recordClick(tx, open.id, referral, event);
        return recorded ? { kind: "ATTACHED", leadId: open.id } : { kind: "SEEN", leadId: open.id };
      }

      const account = await tx.user.findFirst({
        select: { id: true },
        where: { OR: [{ phoneNumber: { endsWith: tail } }, { studentProfile: { parentPhone: { endsWith: tail } } }] }
      });
      if (account) return { kind: "ACCOUNT" };

      const lead = await tx.lead.create({
        data: {
          ...LEAD_DETAILS_NOT_GIVEN,
          activities: {
            create: {
              activityType: "WHATSAPP_CHAT",
              description: referral ? `From a Click-to-WhatsApp ad: ${adLabel(referral)}.` : "Wrote to the academy's WhatsApp number.",
              title: "Started a WhatsApp chat"
            }
          },
          campaign: referral ? (referral.headline ?? referral.sourceId) : null,
          lastActivityAt: event.occurredAt,
          parentName: (event.profileName ?? "").trim().slice(0, 120),
          phone: event.waId,
          source: referral ? WHATSAPP_AD_LEAD_SOURCE : WHATSAPP_LEAD_SOURCE
        },
        select: { id: true }
      });
      if (referral) await this.recordClick(tx, lead.id, referral, event);
      await this.crmPush.enqueue(tx, lead.id);
      // A WhatsApp ad lead is Meta's LeadSubmitted (needs the click id; nothing for an organic chat).
      await this.metaCapi.onLeadCreated(tx, lead.id, event.occurredAt);
      return { kind: "CREATED", leadId: lead.id };
    });

    if (outcome.kind === "CREATED") {
      this.logger.log(`WhatsApp chat became lead ${outcome.leadId}.`);
      void this.crmPush.pushLead(outcome.leadId);
    }
    return outcome;
  }

  /** Keeps the first click and the latest one. False when this message was already recorded. */
  private async recordClick(tx: PrismaTransactionClient, leadId: string, referral: AdReferral, event: CaptureEvent): Promise<boolean> {
    const latest = {
      latestAdId: referral.sourceId,
      latestCtwaClid: referral.ctwaClid,
      latestHeadline: referral.headline,
      latestMessageId: event.providerMessageId,
      latestSeenAt: event.occurredAt,
      latestSourceType: referral.sourceType,
      latestSourceUrl: referral.sourceUrl
    };
    // Once per message, whichever click it was (review Part 1 #2): an older message processed again
    // never becomes the latest, so the latest message id alone can't tell.
    const sourceKey = `wa-ad:${event.providerMessageId}`;
    if (await tx.leadActivity.findFirst({ select: { id: true }, where: { leadId, sourceKey } })) return false;
    const existing = await tx.leadAdClick.findUnique({ select: { latestMessageId: true, latestSeenAt: true }, where: { leadId } });
    if (!existing) {
      await tx.leadAdClick.create({
        data: {
          ...latest,
          firstAdId: referral.sourceId,
          firstCtwaClid: referral.ctwaClid,
          firstHeadline: referral.headline,
          firstSeenAt: event.occurredAt,
          firstSourceType: referral.sourceType,
          firstSourceUrl: referral.sourceUrl,
          leadId
        }
      });
    } else {
      if (existing.latestMessageId === event.providerMessageId) return false;
      await tx.leadAdClick.update({
        // An older message processed late counts, but never replaces a newer click.
        data: { clicks: { increment: 1 }, ...(event.occurredAt >= existing.latestSeenAt ? latest : {}) },
        where: { leadId }
      });
    }
    await tx.leadActivity.create({
      data: { activityType: "WHATSAPP_AD_CLICK", description: adLabel(referral), leadId, sourceKey, title: "Came from a WhatsApp ad" }
    });
    await tx.lead.update({ data: { lastActivityAt: event.occurredAt }, where: { id: leadId } });
    return true;
  }
}

function adLabel(referral: AdReferral): string {
  const name = referral.headline ? `"${referral.headline}"` : "an ad";
  return referral.sourceId ? `${name} (${referral.sourceType ?? "ad"} ${referral.sourceId})` : name;
}
