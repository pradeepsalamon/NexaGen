import { z } from "zod";

// Academy leads CRM — the "book a demo" inquiry captured on the public
// marketing site (`/academy`). A `Lead` is a prospect an admin/coach triages
// through a status pipeline before any real enrollment exists; it is upstream
// of `DemoClassRegistration` (a signup for one already-scheduled demo class).

export const leadStatusSchema = z.enum([
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "DEMO_SCHEDULED",
  "DEMO_CONFIRMED",
  "DEMO_ATTENDED",
  "NO_SHOW",
  "FOLLOW_UP",
  "PAYMENT_PENDING",
  "CONVERTED",
  "ACTIVE_STUDENT",
  "LOST"
]);
export type LeadStatus = z.infer<typeof leadStatusSchema>;

export const LEAD_STATUSES = leadStatusSchema.options;

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  INTERESTED: "Interested",
  DEMO_SCHEDULED: "Demo booked",
  DEMO_CONFIRMED: "Demo confirmed",
  DEMO_ATTENDED: "Demo attended",
  NO_SHOW: "Missed demo",
  FOLLOW_UP: "Follow up",
  PAYMENT_PENDING: "Payment pending",
  CONVERTED: "Converted",
  ACTIVE_STUDENT: "Active student",
  LOST: "Lost"
};

/**
 * What happened to a lead that may move its stage on its own (docs/LEAD_STAGES.md).
 * A person can still set any stage by hand.
 */
export type LeadStageEvent = "DEMO_BOOKED" | "DEMO_CONFIRMED" | "DEMO_ATTENDED" | "DEMO_MISSED" | "REGISTERED" | "ENROLLED";

/** Stages a person decided; nothing automatic moves a lead out of them. */
export const LEAD_FINAL_STATUSES: readonly LeadStatus[] = ["CONVERTED", "ACTIVE_STUDENT", "LOST"];

/** Before the demo: where a booking may still change. */
const BEFORE_DEMO: readonly LeadStatus[] = ["NEW", "CONTACTED", "INTERESTED", "DEMO_SCHEDULED", "DEMO_CONFIRMED", "NO_SHOW"];

/**
 * The one rule for automatic stage moves: the stage `event` moves a lead in
 * `current` to, or null when it stays. Only forward, with one exception: a
 * lead who missed a demo can be booked again. Never out of a final stage, and
 * never back from Demo attended / Follow up / Payment pending (a second demo
 * keeps the further stage). Registering an account → Payment pending; an
 * approved account or a paid order → Converted (Frappe "Enrolled").
 */
export function nextLeadStatus(current: LeadStatus, event: LeadStageEvent): LeadStatus | null {
  if (LEAD_FINAL_STATUSES.includes(current)) return null;
  if (event === "ENROLLED") return "CONVERTED";
  if (event === "REGISTERED") {
    return current === "PAYMENT_PENDING" ? null : "PAYMENT_PENDING";
  }
  const target: LeadStatus | null =
    event === "DEMO_BOOKED"
      ? BEFORE_DEMO.includes(current) ? "DEMO_SCHEDULED" : null
      : event === "DEMO_CONFIRMED"
        ? current === "DEMO_SCHEDULED" ? "DEMO_CONFIRMED" : null
        : event === "DEMO_ATTENDED"
          ? BEFORE_DEMO.includes(current) ? "DEMO_ATTENDED" : null
          : current === "DEMO_SCHEDULED" || current === "DEMO_CONFIRMED" ? "NO_SHOW" : null;
  return target === current ? null : target;
}

/** `Lead.source` of a lead from a WhatsApp chat (the bot's booking, or lead capture). */
export const WHATSAPP_LEAD_SOURCE = "WhatsApp";
/** `Lead.source` of a lead whose first message came from a Click-to-WhatsApp ad. */
export const WHATSAPP_AD_LEAD_SOURCE = "WhatsApp ad";
export const WHATSAPP_LEAD_SOURCES: readonly string[] = [WHATSAPP_LEAD_SOURCE, WHATSAPP_AD_LEAD_SOURCE];

export function isWhatsAppLeadSource(source: string | null | undefined): boolean {
  return source !== null && source !== undefined && WHATSAPP_LEAD_SOURCES.includes(source);
}

/**
 * The child details a lead captured from a WhatsApp chat doesn't have yet (docs/LEAD_STAGES.md
 * "WhatsApp lead capture"): the required columns get these. Shown as "—", never sent to Frappe
 * as if real, and filled in when the bot (or staff) learns them.
 */
export const LEAD_DETAILS_NOT_GIVEN = {
  experienceLevel: "not_given",
  studentAge: 0,
  studentName: ""
} as const;

/** Whether a lead has real child details (not the capture placeholders). */
export function leadChildDetailsGiven(lead: { studentAge: number; studentName: string }): boolean {
  return lead.studentAge !== LEAD_DETAILS_NOT_GIVEN.studentAge && lead.studentName.trim() !== "";
}

export const leadExperienceLevelSchema = z.enum([
  "beginner",
  "intermediate",
  "advanced"
]);
export type LeadExperienceLevel = z.infer<typeof leadExperienceLevelSchema>;

// ── Public (unauthenticated) requests ──

export const createLeadRequestSchema = z.object({
  studentName: z.string().trim().min(1, "Student name is required").max(120),
  parentName: z.string().trim().min(1, "Parent name is required").max(120),
  studentAge: z
    .number()
    .int("Age must be a whole number")
    .min(3, "Age must be at least 3")
    .max(99, "Enter a valid age"),
  experienceLevel: leadExperienceLevelSchema,
  phone: z
    .string()
    .trim()
    .refine(
      (value) => value.replace(/\D/g, "").length === 10,
      "Enter a valid 10-digit phone number"
    ),
  /** Optional; an empty field is sent as "" and stored as no email. */
  email: z
    .union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email address").max(254)])
    .optional(),
  /**
   * The referral code remembered from a `/r/<code>` visit. Fallback only: the
   * API prefers its own attribution cookie, and an unknown code is ignored.
   */
  referralCode: z.string().trim().max(32).optional(),
  /**
   * The Meta Pixel's event id for this form's Lead event, when the visitor accepted the pixel
   * (docs/AD_MEASUREMENT.md): the server's Conversions API event reuses it so Meta counts one.
   */
  metaEventId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.:-]{8,64}$/)
    .optional()
});
export type CreateLeadRequest = z.infer<typeof createLeadRequestSchema>;

export const trackVisitRequestSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  referrer: z.string().trim().max(2000).optional()
});
export type TrackVisitRequest = z.infer<typeof trackVisitRequestSchema>;

/** The cookie banner's answer (docs/AD_MEASUREMENT.md): Accept = true, Decline = false. */
export const adConsentRequestSchema = z.object({
  consent: z.boolean(),
  /** The page it was given on: starts the visit when the tracking call hasn't run yet. */
  url: z.string().trim().min(1).max(2000),
  referrer: z.string().trim().max(2000).optional()
});
export type AdConsentRequest = z.infer<typeof adConsentRequestSchema>;

// ── Admin (authenticated) requests ──

export const updateLeadStatusRequestSchema = z.object({
  status: leadStatusSchema,
  description: z.string().trim().max(500).optional()
});
export type UpdateLeadStatusRequest = z.infer<typeof updateLeadStatusRequestSchema>;

export const createLeadNoteRequestSchema = z.object({
  note: z.string().trim().min(1, "Note cannot be empty").max(2000)
});
export type CreateLeadNoteRequest = z.infer<typeof createLeadNoteRequestSchema>;

export const assignLeadDemoClassRequestSchema = z.object({
  classId: z.string().trim().min(1, "classId is required")
});
export type AssignLeadDemoClassRequest = z.infer<typeof assignLeadDemoClassRequestSchema>;

// ── Responses ──

export interface LeadPaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface LeadListItem {
  id: string;
  studentName: string;
  parentName: string;
  studentAge: number;
  experienceLevel: string;
  phone: string;
  email: string | null;
  status: LeadStatus;
  source: string | null;
  campaign: string | null;
  lastActivityAt: string | null;
  convertedAt: string | null;
  assignedClassId: string | null;
  createdAt: string;
}

/** A scheduled demo class an admin can book a lead into. */
export interface LeadAssignableDemoClass {
  id: string;
  topic: string;
  startsAt: string;
  endsAt: string;
  coachName: string;
}

export interface LeadListResponse {
  items: LeadListItem[];
  pagination: LeadPaginationMeta;
}

export interface LeadVisitorAttribution {
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  referrer: string | null;
  landingPage: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  fbclid: string | null;
  gclid: string | null;
  firstVisit: string;
  lastVisit: string;
  pageViews: number;
}

/** The Click-to-WhatsApp ad click(s) behind a lead (first and latest). */
export interface LeadAdClickDto {
  clicks: number;
  firstAdId: string | null;
  firstHeadline: string | null;
  firstSeenAt: string;
  latestAdId: string | null;
  latestHeadline: string | null;
  latestSeenAt: string;
}

export interface LeadActivityDto {
  id: string;
  activityType: string;
  title: string;
  description: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface LeadNoteDto {
  id: string;
  note: string;
  createdByName: string | null;
  createdAt: string;
}

export interface LeadDetail extends LeadListItem {
  visitorAttribution: LeadVisitorAttribution | null;
  /** Set when a Click-to-WhatsApp ad brought this lead (WhatsApp lead capture). */
  adClick: LeadAdClickDto | null;
  assignedClass: LeadAssignableDemoClass | null;
  activities: LeadActivityDto[];
  notes: LeadNoteDto[];
  /** The newest WhatsApp support ticket for this lead (a demo booked through the bot), to reply from. */
  whatsappTicket: { id: string; reference: string } | null;
}

export interface LeadDetailResponse {
  lead: LeadDetail;
}

export interface CreateLeadResponse {
  lead: LeadListItem;
}

export interface LeadMetricsResponse {
  leads: { total: number; today: number };
  visitors: { total: number; today: number };
  conversion: { rate: number; count: number };
  statusDistribution: Record<string, number>;
  sourceDistribution: Record<string, number>;
}


// ── Funnel report (admin Leads → Funnel; docs/AD_MEASUREMENT.md "Funnel report") ──

/** Longest range the funnel report covers in one request. */
export const LEAD_FUNNEL_MAX_DAYS = 366;

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/** `from` / `to`: calendar days in the academy's time zone, both included. */
export const leadFunnelQuerySchema = z
  .object({ from: ymdSchema, to: ymdSchema })
  .refine((query) => query.from <= query.to, { message: "from must not be after to", path: ["from"] });
export type LeadFunnelQuery = z.infer<typeof leadFunnelQuerySchema>;

/** Stages a demo booking puts a lead in (or past, for a missed demo). */
const BOOKED_STATUSES: readonly LeadStatus[] = ["DEMO_SCHEDULED", "DEMO_CONFIRMED", "DEMO_ATTENDED", "NO_SHOW"];

/**
 * The one rule for how far a lead got (funnel report): from facts first (a demo registration, a
 * guest who joined, a conversion date), then the stage, so a lead later moved to Follow up or
 * Lost still counts where it got to.
 */
export function leadFunnelReach(lead: {
  attendedDemo: boolean;
  bookedDemo: boolean;
  convertedAt: Date | string | null;
  status: LeadStatus;
}): { attended: boolean; booked: boolean; enrolled: boolean } {
  const enrolled = lead.convertedAt !== null || lead.status === "CONVERTED" || lead.status === "ACTIVE_STUDENT";
  const attended = lead.attendedDemo || lead.status === "DEMO_ATTENDED";
  const booked = attended || lead.bookedDemo || BOOKED_STATUSES.includes(lead.status);
  return { attended, booked, enrolled };
}

/** One source + campaign in the funnel report. Spend is null when Meta's ad spend isn't known for it. */
export interface LeadFunnelRow {
  source: string;
  campaign: string | null;
  leads: number;
  demoBooked: number;
  demoAttended: number;
  enrolled: number;
  /** Matched Meta ad spend in minor units (ad ids for WhatsApp ad leads, campaign name for website leads). */
  spendMinor: number | null;
}

export interface LeadFunnelResponse {
  from: string;
  to: string;
  timeZone: string;
  rows: LeadFunnelRow[];
  totals: Omit<LeadFunnelRow, "campaign" | "source">;
  /** Meta ad spend (read-only Insights), when META_ADS_* are set; null = not configured. */
  spend: { currency: string; totalMinor: number; error: string | null } | null;
}
