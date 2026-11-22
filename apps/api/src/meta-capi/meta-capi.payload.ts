import { createHash } from "node:crypto";
import type { LeadStatus } from "@prisma/client";

/** Where a lead came from, as Meta measures it. */
export type MetaCapiChannel = "website" | "whatsapp";

/** What happened to the lead that Meta hears about (docs/AD_MEASUREMENT.md). */
export type MetaLeadMilestone = "CREATED" | "DEMO_BOOKED" | "CONVERTED";

/**
 * The one rule for event names: Meta's standard events for business messaging (WhatsApp) and
 * for the website. Purchase is the same on both.
 */
export const META_EVENT_NAMES: Record<MetaLeadMilestone, Record<MetaCapiChannel, string>> = {
  CONVERTED: { website: "Purchase", whatsapp: "Purchase" },
  CREATED: { website: "Lead", whatsapp: "LeadSubmitted" },
  DEMO_BOOKED: { website: "Schedule", whatsapp: "QualifiedLead" }
};

/** The milestone a stage change reaches, or null for a stage Meta doesn't hear about. */
export function metaMilestoneForStatus(status: LeadStatus): MetaLeadMilestone | null {
  if (status === "DEMO_SCHEDULED") return "DEMO_BOOKED";
  if (status === "CONVERTED" || status === "ACTIVE_STUDENT") return "CONVERTED";
  return null;
}

/** SHA-256, lower-case hex, as Meta wants every user_data match key. */
export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Digits with the country code, no "+" or leading zeros (Meta's `ph` before hashing). Null = unusable. */
export function normalizeMetaPhone(phone: string, countryCode: string): string | null {
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  const code = countryCode.replace(/\D/g, "");
  const full = digits.length === 10 && code ? `${code}${digits}` : digits;
  return full.length >= 8 && full.length <= 15 ? full : null;
}

/** Trimmed, lower-case (Meta's `em` before hashing). Null = not an address. */
export function normalizeMetaEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

/** Meta's `fbc` from a stored `fbclid` and when it was first seen: `fb.1.<ms>.<fbclid>`. */
export function metaFbc(fbclid: string | null | undefined, seenAt: Date | null | undefined): string | null {
  if (!fbclid || !seenAt) return null;
  return `fb.1.${seenAt.getTime()}.${fbclid}`;
}

export type MetaCapiEventInput = {
  channel: MetaCapiChannel;
  eventId: string;
  eventName: string;
  eventTime: Date;
  /** Purchase only. */
  value: { currency: string; minor: number } | null;
  /** Business messaging: the WhatsApp Business Account and the ad click id. */
  whatsapp?: { ctwaClid: string; wabaId: string };
  /**
   * Website: the parent's contact details from the lead (hashed here, never the child's or the
   * account's), and the visit's browser signals.
   */
  website?: {
    clientIp: string | null;
    countryCode: string;
    email: string | null;
    fbclid: string | null;
    fbclidSeenAt: Date | null;
    fbp: string | null;
    pageUrl: string | null;
    phone: string;
    userAgent: string | null;
  };
};

/**
 * One entry of the Conversions API `data` array. Pure: the same input always gives the same event.
 * Never carries a child's name or age or any account detail: only the inputs above.
 */
export function buildMetaCapiEvent(input: MetaCapiEventInput): Record<string, unknown> {
  const event: Record<string, unknown> = {
    event_id: input.eventId,
    event_name: input.eventName,
    event_time: Math.floor(input.eventTime.getTime() / 1000)
  };
  if (input.value) {
    // Meta wants major units ("value": 2499.5) with an ISO currency.
    event.custom_data = { currency: input.value.currency.toUpperCase(), value: input.value.minor / 100 };
  }
  if (input.channel === "whatsapp") {
    if (!input.whatsapp) throw new Error("A WhatsApp event needs the account id and the click id.");
    event.action_source = "business_messaging";
    event.messaging_channel = "whatsapp";
    event.user_data = { ctwa_clid: input.whatsapp.ctwaClid, whatsapp_business_account_id: input.whatsapp.wabaId };
    return event;
  }
  if (!input.website) throw new Error("A website event needs the visit.");
  const site = input.website;
  const userData: Record<string, unknown> = {};
  const phone = normalizeMetaPhone(site.phone, site.countryCode);
  if (phone) userData.ph = [sha256(phone)];
  const email = normalizeMetaEmail(site.email);
  if (email) userData.em = [sha256(email)];
  const fbc = metaFbc(site.fbclid, site.fbclidSeenAt);
  if (fbc) userData.fbc = fbc;
  if (site.fbp) userData.fbp = site.fbp;
  if (site.clientIp) userData.client_ip_address = site.clientIp;
  if (site.userAgent) userData.client_user_agent = site.userAgent;
  event.action_source = "website";
  if (site.pageUrl) event.event_source_url = site.pageUrl;
  event.user_data = userData;
  return event;
}
