import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { getApiEnv } from "@nexa-chess/config/api";
import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { type LeadStatus, OrderStatus } from "@prisma/client";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { currentTenantId, runInTenant } from "../tenancy/tenant-context";
import {
  META_EVENT_NAMES,
  buildMetaCapiEvent,
  metaMilestoneForStatus,
  type MetaCapiChannel,
  type MetaLeadMilestone
} from "./meta-capi.payload";

/** Waits before each retry; after the last one the event is FAILED. */
export const META_CAPI_BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];
export const META_CAPI_MAX_ATTEMPTS = META_CAPI_BACKOFF_MS.length + 1;
const CLAIM_LEASE_MS = 2 * 60_000;
const SWEEP_BATCH = 20;
const TIMEOUT_MS = 15_000;
/** Meta refuses events older than 7 days; a row that waited longer is given up. */
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60_000;
const GRAPH_BASE = "https://graph.facebook.com";
/** Graph error codes Meta documents as temporary (unknown, service, app/user rate limits). */
const TRANSIENT_GRAPH_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);
const PURCHASE_EVENT = "Purchase";
/** How long a Purchase waits for its paid order (inside Meta's 7-day limit), looking hourly. */
export const PURCHASE_VALUE_WAIT_MS = 6 * 24 * 60 * 60_000;
const PURCHASE_VALUE_RECHECK_MS = 60 * 60_000;
/** A caller's event id (shared with the pixel) must look like one. */
const EVENT_ID = /^[A-Za-z0-9_.:-]{8,64}$/;

export type MetaCapiConfig = {
  accessToken: string;
  apiVersion: string;
  countryCode: string;
  datasetId: string;
  testEventCode: string | null;
  /** Nexa's WhatsApp Business Account id; without it WhatsApp events are skipped. */
  wabaId: string | null;
};

/** A refusal retrying can't fix (bad parameter, expired token, unknown dataset). */
class MetaRejectedError extends Error {}

/** The page a website event happened on, without its query (no click ids or form values ride along). */
function pageWithoutQuery(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? `${parsed.origin}${parsed.pathname}` : null;
  } catch {
    return null;
  }
}

/**
 * Meta Conversions API for lead events (docs/AD_MEASUREMENT.md), Nexa's academy only.
 *
 * A lead's milestones (created, demo booked, converted) are written to the `MetaCapiEvent` outbox in
 * the transaction that made the lead or moved its stage, once per event name, and sent by a minute
 * sweep with retries. A WhatsApp lead (one with a Click-to-WhatsApp click id) is a business-messaging
 * event; a website lead needs the visitor's banner consent, checked again before sending. Leads with
 * neither are not sent. Off unless META_DATASET_ID and META_CAPI_ACCESS_TOKEN are set.
 */
@Injectable()
export class MetaCapiService {
  private readonly logger = new Logger(MetaCapiService.name);

  constructor(
    private readonly jobLocks: JobLockService,
    private readonly prisma: PrismaService
  ) {}

  /** Null = off. A method so tests can switch it on. */
  config(): MetaCapiConfig | null {
    const env = getApiEnv();
    if (!env.META_DATASET_ID || !env.META_CAPI_ACCESS_TOKEN) return null;
    return {
      accessToken: env.META_CAPI_ACCESS_TOKEN,
      apiVersion: env.META_GRAPH_API_VERSION,
      countryCode: env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? "91",
      datasetId: env.META_DATASET_ID,
      testEventCode: env.META_CAPI_TEST_EVENT_CODE || null,
      wabaId: env.WHATSAPP_BUSINESS_ACCOUNT_ID || null
    };
  }

  /** The HTTP call; a method so tests replace it (no test ever reaches Meta). */
  async post(url: string, init: RequestInit): Promise<Response> {
    return fetch(url, init);
  }

  /** In the lead's creating transaction. `eventId` = the pixel's id for the same website Lead. */
  async onLeadCreated(tx: PrismaTransactionClient, leadId: string, at: Date, eventId?: string): Promise<void> {
    await this.enqueue(tx, leadId, "CREATED", at, eventId);
  }

  /** In the transaction that moved a lead's stage (automatic, by hand, or from Frappe). */
  async onLeadStatus(tx: PrismaTransactionClient, leadId: string, status: LeadStatus, at: Date): Promise<void> {
    const milestone = metaMilestoneForStatus(status);
    if (milestone) await this.enqueue(tx, leadId, milestone, at);
  }

  private async enqueue(tx: PrismaTransactionClient, leadId: string, milestone: MetaLeadMilestone, at: Date, eventId?: string): Promise<void> {
    if (currentTenantId() !== DEFAULT_TENANT_ID || !this.config()) return;
    const lead = await tx.lead.findUnique({
      select: {
        adClick: { select: { firstCtwaClid: true, latestCtwaClid: true } },
        userId: true,
        visitorSession: { select: { adConsent: true } }
      },
      where: { id: leadId }
    });
    if (!lead) return;
    const channel = this.channelOf(lead);
    if (!channel) return;

    // Purchase without a paid order yet: the send looks again (`send`, `PURCHASE_VALUE_WAIT_MS`).
    const value = milestone === "CONVERTED" ? await this.paidValue(tx, lead.userId) : null;

    const eventName = META_EVENT_NAMES[milestone][channel];
    await tx.metaCapiEvent.createMany({
      data: [
        {
          channel,
          currency: value?.currency ?? null,
          eventId: eventId && EVENT_ID.test(eventId) ? eventId : `nexa.${eventName}.${leadId}`,
          eventName,
          eventTime: at,
          leadId,
          valueMinor: value?.minor ?? null
        }
      ],
      // Once per lead and event name: a demo booked twice is one QualifiedLead.
      skipDuplicates: true
    });
  }

  /** The student's latest paid order (`PAID` or `PARTIALLY_REFUNDED`) as the Purchase value. */
  private async paidValue(
    client: Pick<PrismaTransactionClient, "order">,
    userId: string | null
  ): Promise<{ currency: string; minor: number } | null> {
    if (!userId) return null;
    const order = await client.order.findFirst({
      orderBy: { paidAt: "desc" },
      select: { amount: true, currency: true },
      where: { paidAt: { not: null }, status: { in: [OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED] }, userId }
    });
    return order && order.amount > 0 ? { currency: order.currency, minor: order.amount } : null;
  }

  /** WhatsApp when an ad click id is known; else the website, only with the visitor's consent. */
  private channelOf(lead: {
    adClick: { firstCtwaClid: string | null; latestCtwaClid: string | null } | null;
    visitorSession: { adConsent: boolean | null } | null;
  }): MetaCapiChannel | null {
    if (lead.adClick?.latestCtwaClid || lead.adClick?.firstCtwaClid) return "whatsapp";
    if (lead.visitorSession?.adConsent === true) return "website";
    return null;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    if (!this.config()) return;
    await this.jobLocks.runExclusive(JOB_LOCKS.metaCapiSend, () =>
      runInTenant(DEFAULT_TENANT_ID, "job:meta-capi.send", async () => {
        const due = await this.prisma.metaCapiEvent.findMany({
          orderBy: { nextAttemptAt: "asc" },
          select: { id: true },
          take: SWEEP_BATCH,
          where: { nextAttemptAt: { lte: new Date() }, status: "PENDING" }
        });
        for (const row of due) await this.send(row.id);
      })
    );
  }

  /** Claims one event and sends it. Call inside Nexa's academy. Never throws on Meta's answer. */
  async send(id: string): Promise<void> {
    const config = this.config();
    if (!config) return;
    const now = new Date();
    const claim = await this.prisma.metaCapiEvent.updateMany({
      data: { attempts: { increment: 1 }, claimedAt: now },
      where: {
        id,
        nextAttemptAt: { lte: now },
        OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(now.getTime() - CLAIM_LEASE_MS) } }],
        status: "PENDING"
      }
    });
    if (claim.count === 0) return;
    const row = await this.prisma.metaCapiEvent.findUnique({
      include: {
        lead: {
          select: {
            adClick: { select: { firstCtwaClid: true, latestCtwaClid: true } },
            email: true,
            isDeleted: true,
            phone: true,
            userId: true,
            visitorSession: { select: { adConsent: true, fbclid: true, fbp: true, firstVisit: true, ipAddress: true, landingPage: true, userAgent: true } }
          }
        }
      },
      where: { id }
    });
    if (!row) return;

    const skip = (why: string) =>
      this.prisma.metaCapiEvent.update({ data: { claimedAt: null, error: why, status: "SKIPPED" }, where: { id } });
    // A to-one include still returns a trashed lead: its details never go to Meta (review Part 1 #3).
    if (row.lead.isDeleted) return void (await skip("The lead was deleted."));
    if (now.getTime() - row.eventTime.getTime() > MAX_EVENT_AGE_MS) return void (await skip("Older than Meta's 7-day limit."));

    // Meta requires a Purchase's value and currency: wait for the paid order (an enrolment marked
    // before the payment lands), then give up rather than send a Purchase without them.
    if (row.eventName === PURCHASE_EVENT && row.valueMinor === null) {
      const value = await this.paidValue(this.prisma, row.lead.userId);
      if (value) {
        await this.prisma.metaCapiEvent.update({ data: { currency: value.currency, valueMinor: value.minor }, where: { id } });
        row.currency = value.currency;
        row.valueMinor = value.minor;
      } else if (now.getTime() - row.eventTime.getTime() < PURCHASE_VALUE_WAIT_MS) {
        // Not an attempt: look again in an hour.
        await this.prisma.metaCapiEvent.update({
          data: { attempts: { decrement: 1 }, claimedAt: null, nextAttemptAt: new Date(now.getTime() + PURCHASE_VALUE_RECHECK_MS) },
          where: { id }
        });
        return;
      } else {
        return void (await skip("No paid order: Meta needs a Purchase's value."));
      }
    }

    let event: Record<string, unknown>;
    if (row.channel === "whatsapp") {
      const ctwaClid = row.lead.adClick?.latestCtwaClid ?? row.lead.adClick?.firstCtwaClid;
      if (!config.wabaId) return void (await skip("WHATSAPP_BUSINESS_ACCOUNT_ID is not set."));
      if (!ctwaClid) return void (await skip("The lead has no ad click id."));
      event = buildMetaCapiEvent({ ...this.common(row), whatsapp: { ctwaClid, wabaId: config.wabaId } });
    } else {
      const visit = row.lead.visitorSession;
      // Consent is read again: a visitor who declined since is never sent.
      if (visit?.adConsent !== true) return void (await skip("No ad measurement consent for this visit."));
      event = buildMetaCapiEvent({
        ...this.common(row),
        website: {
          clientIp: visit.ipAddress,
          countryCode: config.countryCode,
          email: row.lead.email,
          fbclid: visit.fbclid,
          fbclidSeenAt: visit.firstVisit,
          fbp: visit.fbp,
          pageUrl: pageWithoutQuery(visit.landingPage),
          phone: row.lead.phone,
          userAgent: visit.userAgent
        }
      });
    }

    try {
      await this.deliver(config, event);
      await this.prisma.metaCapiEvent.update({ data: { claimedAt: null, error: null, sentAt: new Date(), status: "SENT" }, where: { id } });
    } catch (error) {
      const message = (error as Error).message.slice(0, 300);
      const final = error instanceof MetaRejectedError || row.attempts >= META_CAPI_MAX_ATTEMPTS;
      this.logger.warn(`Meta event ${id} (${row.eventName}) failed (attempt ${row.attempts}${final ? ", giving up" : ""}): ${message}`);
      const wait = META_CAPI_BACKOFF_MS[Math.min(row.attempts - 1, META_CAPI_BACKOFF_MS.length - 1)];
      await this.prisma.metaCapiEvent.update({
        data: final
          ? { claimedAt: null, error: message, status: "FAILED" }
          : { claimedAt: null, error: message, nextAttemptAt: new Date(Date.now() + wait) },
        where: { id }
      });
    }
  }

  private common(row: { channel: string; currency: string | null; eventId: string; eventName: string; eventTime: Date; valueMinor: number | null }) {
    return {
      channel: row.channel as MetaCapiChannel,
      eventId: row.eventId,
      eventName: row.eventName,
      eventTime: row.eventTime,
      value: row.valueMinor !== null && row.currency ? { currency: row.currency, minor: row.valueMinor } : null
    };
  }

  private async deliver(config: MetaCapiConfig, event: Record<string, unknown>): Promise<void> {
    const res = await this.post(`${GRAPH_BASE}/${encodeURIComponent(config.apiVersion)}/${encodeURIComponent(config.datasetId)}/events`, {
      body: JSON.stringify({ data: [event], ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}) }),
      headers: { Accept: "application/json", Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const json = (await res.json().catch(() => null)) as {
      error?: { code?: unknown; is_transient?: unknown; message?: unknown };
      events_received?: unknown;
    } | null;
    if (!res.ok) {
      const detail = typeof json?.error?.message === "string" ? `: ${json.error.message}` : "";
      const text = `Meta answered ${res.status}${detail}`;
      // 400/401/403/404 = refused (bad event, token, dataset): retrying won't help, unless Meta
      // marks the error temporary (`is_transient`, or a throttling/service code). 429/5xx may pass later.
      const transient = json?.error?.is_transient === true || TRANSIENT_GRAPH_CODES.has(Number(json?.error?.code));
      throw [400, 401, 403, 404].includes(res.status) && !transient ? new MetaRejectedError(text) : new Error(text);
    }
    if (json?.events_received !== 1) throw new Error("Meta didn't confirm the event.");
  }
}
