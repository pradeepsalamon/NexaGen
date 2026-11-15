import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { getApiEnv } from "@nexa-chess/config/api";
import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import type { Lead } from "@prisma/client";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { currentTenantId, runInTenant } from "../tenancy/tenant-context";
import { WHATSAPP_LEAD_REUSE_DAYS, WHATSAPP_LEAD_SOURCE } from "./lead-constants";

/** Waits before each retry; after the last one the push is FAILED. */
export const CRM_PUSH_BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];
export const CRM_PUSH_MAX_ATTEMPTS = CRM_PUSH_BACKOFF_MS.length + 1;
const CLAIM_LEASE_MS = 2 * 60_000;
const SWEEP_BATCH = 20;
const TIMEOUT_MS = 15_000;
/** A Frappe lead with the same number made within this many days gets a note instead of a twin. */
export const CRM_SAME_NUMBER_DAYS = WHATSAPP_LEAD_REUSE_DAYS;
/** Fewer digits than this is not a number worth matching on. */
const MIN_MATCH_DIGITS = 7;

export type FrappeCrmConfig = {
  apiKey: string;
  apiSecret: string;
  countryCode: string;
  leadSource: string;
  leadStatus: string;
  url: string;
  websiteLeadSource: string;
};

type PushLead = Pick<
  Lead,
  "campaign" | "createdAt" | "email" | "experienceLevel" | "id" | "parentName" | "phone" | "source" | "studentAge" | "studentName"
>;

function fromWhatsApp(lead: Pick<Lead, "source">): boolean {
  return lead.source === WHATSAPP_LEAD_SOURCE;
}

/** A Frappe answer that retrying can't fix (bad data, missing source/status). */
export class FrappeCrmRejectedError extends Error {}

/** +<country><number> for Frappe's Phone field; a number that already has a country code keeps it. */
export function frappePhone(phone: string, countryCode: string): string {
  const digits = phone.replace(/\D/g, "");
  const code = countryCode.replace(/\D/g, "");
  return digits.length === 10 && code ? `+${code}${digits}` : `+${digits}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** The last ten digits of a number: how the same family is recognised whatever the country-code spelling. */
export function phoneTail(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

/**
 * The `CRM Lead` document (fields checked against Frappe CRM v16 on crm.nexachess.in, 2026-11-15).
 * `student_name` is a custom field there; a Frappe site without it ignores the key. The parent's
 * email is left to the note: Frappe looks an `email` up with outside services.
 */
export function frappeLeadDocument(lead: PushLead, config: FrappeCrmConfig) {
  const whatsapp = fromWhatsApp(lead);
  return {
    first_name: lead.parentName.trim().slice(0, 140) || (whatsapp ? "WhatsApp lead" : "Website lead"),
    mobile_no: frappePhone(lead.phone, config.countryCode),
    source: whatsapp ? config.leadSource : config.websiteLeadSource,
    status: config.leadStatus,
    student_name: lead.studentName.trim().slice(0, 140)
  };
}

/** The line every note ends with; also how a retry knows its note is already there. */
export function frappeNoteMarker(leadId: string): string {
  return `NexaGen lead: ${leadId}`;
}

/** The `FCRM Note` on that lead: the child's age and level, and where the booking came from. HTML, escaped. */
export function frappeLeadNote(lead: PushLead): { content: string; title: string } {
  const whatsapp = fromWhatsApp(lead);
  const cameFrom = !whatsapp && lead.source ? `Came from: ${lead.source.slice(0, 200)}${lead.campaign ? ` (campaign ${lead.campaign.slice(0, 100)})` : ""}` : null;
  const lines = [
    `Student: ${lead.studentName} (age ${lead.studentAge}, ${lead.experienceLevel})`,
    `Parent: ${lead.parentName}`,
    lead.email ? `Email: ${lead.email}` : null,
    whatsapp ? "Booked a demo through the WhatsApp assistant." : "Booked a demo through the website form.",
    cameFrom,
    frappeNoteMarker(lead.id)
  ].filter((line): line is string => line !== null);
  return {
    content: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
    title: whatsapp ? "From NexaGen (WhatsApp)" : "From NexaGen (website form)"
  };
}

/** Frappe's filter datetime ("YYYY-MM-DD HH:mm:ss"). */
function frappeDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function resourceQuery(fields: string[], filters: unknown[], extra = ""): string {
  return `?fields=${encodeURIComponent(JSON.stringify(fields))}&filters=${encodeURIComponent(JSON.stringify(filters))}${extra}&limit_page_length=1`;
}

/**
 * One-way copy of new leads (the WhatsApp assistant's and the website form's)
 * into Frappe CRM, the sales team's CRM, for Nexa's own academy only (plan D6;
 * docs/WHATSAPP_SUPPORT.md §0 "Frappe CRM"). NexaGen's `Lead` stays the record:
 * demo booking and the inbox need it. A `CrmLeadPush` row is written in the
 * lead's transaction, sent after commit, and retried by a sweep; nothing comes
 * back from Frappe. A number Frappe already has a recent lead for gets a note
 * on that lead instead of a twin. Off unless FRAPPE_CRM_URL, FRAPPE_CRM_API_KEY
 * and FRAPPE_CRM_API_SECRET are set.
 */
@Injectable()
export class FrappeCrmPushService {
  private readonly logger = new Logger(FrappeCrmPushService.name);
  private warnedPartial = false;

  constructor(
    private readonly jobLocks: JobLockService,
    private readonly prisma: PrismaService
  ) {}

  /** Null = off. A method so tests can switch it on. */
  config(): FrappeCrmConfig | null {
    const env = getApiEnv();
    const url = env.FRAPPE_CRM_URL?.replace(/\/+$/, "");
    if (!url || !env.FRAPPE_CRM_API_KEY || !env.FRAPPE_CRM_API_SECRET) {
      if (!this.warnedPartial && (url || env.FRAPPE_CRM_API_KEY || env.FRAPPE_CRM_API_SECRET)) {
        this.warnedPartial = true;
        this.logger.warn("Frappe CRM push is off: set FRAPPE_CRM_URL, FRAPPE_CRM_API_KEY and FRAPPE_CRM_API_SECRET together.");
      }
      return null;
    }
    return {
      apiKey: env.FRAPPE_CRM_API_KEY,
      apiSecret: env.FRAPPE_CRM_API_SECRET,
      countryCode: env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? "",
      leadSource: env.FRAPPE_CRM_LEAD_SOURCE,
      leadStatus: env.FRAPPE_CRM_LEAD_STATUS,
      url,
      websiteLeadSource: env.FRAPPE_CRM_WEBSITE_LEAD_SOURCE
    };
  }

  /** In the lead's transaction: queue it, when the push is on and the lead is Nexa's. */
  async enqueue(tx: PrismaTransactionClient, leadId: string): Promise<boolean> {
    if (currentTenantId() !== DEFAULT_TENANT_ID || !this.config()) return false;
    await tx.crmLeadPush.create({ data: { leadId } });
    return true;
  }

  /** After commit: try it now. Never throws (the sweep retries). */
  async pushLead(leadId: string): Promise<void> {
    try {
      const row = await this.prisma.crmLeadPush.findUnique({ select: { id: true }, where: { leadId } });
      if (row) await this.send(row.id);
    } catch (error) {
      this.logger.warn(`Frappe CRM push for lead ${leadId} not sent yet: ${(error as Error).message}`);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    if (!this.config()) return;
    await this.jobLocks.runExclusive(JOB_LOCKS.crmLeadPush, () =>
      runInTenant(DEFAULT_TENANT_ID, "job:crm.lead-push", async () => {
        const due = await this.prisma.crmLeadPush.findMany({
          orderBy: { nextAttemptAt: "asc" },
          select: { id: true },
          take: SWEEP_BATCH,
          where: { nextAttemptAt: { lte: new Date() }, status: "PENDING" }
        });
        for (const row of due) await this.send(row.id);
      })
    );
  }

  /** Claims one push and sends it. Call inside Nexa's academy. */
  async send(id: string): Promise<void> {
    const config = this.config();
    if (!config) return;
    const now = new Date();
    const claim = await this.prisma.crmLeadPush.updateMany({
      data: { attempts: { increment: 1 }, claimedAt: now },
      where: {
        id,
        nextAttemptAt: { lte: now },
        OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(now.getTime() - CLAIM_LEASE_MS) } }],
        status: "PENDING"
      }
    });
    if (claim.count === 0) return;
    const row = await this.prisma.crmLeadPush.findUnique({ include: { lead: true }, where: { id } });
    if (!row) return;

    try {
      // Frappe may already have this family: from an ad form, the other channel, a lead the sales
      // team typed in, or an earlier attempt of this push whose answer was lost.
      const existing = await this.findSameNumber(config, row.lead, now);
      const name = existing ?? (await this.create(config, row.lead));
      if (existing) {
        // Here the note is the whole copy, so it must arrive (a retry never adds it twice).
        if (!(await this.hasNote(config, existing, row.lead))) await this.addNote(config, existing, row.lead);
      } else {
        // The child's age and level ride on a note; a lead without it is still a lead.
        try {
          await this.addNote(config, name, row.lead);
        } catch (error) {
          this.logger.warn(`Frappe CRM note for ${name} not added: ${(error as Error).message}`);
        }
      }
      await this.prisma.$transaction([
        this.prisma.crmLeadPush.update({ data: { claimedAt: null, error: null, externalId: name, sentAt: new Date(), status: "SENT" }, where: { id } }),
        this.prisma.leadActivity.create({
          data: existing
            ? {
                activityType: "CRM_PUSHED",
                description: `Frappe CRM already had lead ${name} for this number; a note was added there.`,
                leadId: row.leadId,
                title: "Added to a Frappe CRM lead"
              }
            : { activityType: "CRM_PUSHED", description: `Frappe CRM lead ${name}.`, leadId: row.leadId, title: "Sent to Frappe CRM" }
        })
      ]);
    } catch (error) {
      const message = (error as Error).message.slice(0, 300);
      const final = error instanceof FrappeCrmRejectedError || row.attempts >= CRM_PUSH_MAX_ATTEMPTS;
      this.logger.warn(`Frappe CRM push ${id} failed (attempt ${row.attempts}${final ? ", giving up" : ""}): ${message}`);
      const wait = CRM_PUSH_BACKOFF_MS[Math.min(row.attempts - 1, CRM_PUSH_BACKOFF_MS.length - 1)];
      await this.prisma.crmLeadPush.update({
        data: final
          ? { claimedAt: null, error: message, status: "FAILED" }
          : { claimedAt: null, error: message, nextAttemptAt: new Date(Date.now() + wait) },
        where: { id }
      });
      if (final) {
        await this.prisma.leadActivity.create({
          data: { activityType: "CRM_PUSH_FAILED", description: message, leadId: row.leadId, title: "Not sent to Frappe CRM" }
        });
      }
    }
  }

  private async request(config: FrappeCrmConfig, method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${config.url}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Accept: "application/json",
        Authorization: `token ${config.apiKey}:${config.apiSecret}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      method,
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = (json as { exception?: unknown; message?: unknown } | null)?.exception ?? (json as { message?: unknown } | null)?.message;
      const text = `Frappe answered ${res.status}${typeof detail === "string" ? `: ${detail}` : ""}`;
      // 400/404/409/417 = Frappe refused the document; 401/403/429/5xx may pass once fixed or later.
      throw [400, 404, 409, 417, 422].includes(res.status) ? new FrappeCrmRejectedError(text) : new Error(text);
    }
    return json;
  }

  private async create(config: FrappeCrmConfig, lead: PushLead): Promise<string> {
    const created = (await this.request(config, "POST", "/api/resource/CRM%20Lead", frappeLeadDocument(lead, config))) as { data?: { name?: unknown } };
    const name = created?.data?.name;
    if (typeof name !== "string" || !name) throw new Error("Frappe didn't return the new lead's name.");
    return name;
  }

  private async addNote(config: FrappeCrmConfig, name: string, lead: PushLead): Promise<void> {
    await this.request(config, "POST", "/api/resource/FCRM%20Note", { ...frappeLeadNote(lead), reference_docname: name, reference_doctype: "CRM Lead" });
  }

  private async hasNote(config: FrappeCrmConfig, name: string, lead: PushLead): Promise<boolean> {
    const filters = [
      ["reference_doctype", "=", "CRM Lead"],
      ["reference_docname", "=", name],
      ["content", "like", `%${frappeNoteMarker(lead.id)}%`]
    ];
    const found = (await this.request(config, "GET", `/api/resource/FCRM%20Note${resourceQuery(["name"], filters)}`)) as { data?: unknown[] };
    return Array.isArray(found?.data) && found.data.length > 0;
  }

  /** The newest Frappe lead of the last CRM_SAME_NUMBER_DAYS days whose mobile number ends in the same ten digits. */
  private async findSameNumber(config: FrappeCrmConfig, lead: PushLead, now: Date): Promise<string | null> {
    const tail = phoneTail(lead.phone);
    if (tail.length < MIN_MATCH_DIGITS) return null;
    const since = new Date(now.getTime() - CRM_SAME_NUMBER_DAYS * 24 * 60 * 60_000);
    const filters = [
      ["mobile_no", "like", `%${tail}`],
      ["creation", ">=", frappeDateTime(since)]
    ];
    const found = (await this.request(
      config,
      "GET",
      `/api/resource/CRM%20Lead${resourceQuery(["name"], filters, `&order_by=${encodeURIComponent("creation desc")}`)}`
    )) as { data?: { name?: unknown }[] };
    const name = found?.data?.[0]?.name;
    return typeof name === "string" && name ? name : null;
  }
}
