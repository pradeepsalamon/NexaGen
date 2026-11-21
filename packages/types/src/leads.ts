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
export type LeadStageEvent = "DEMO_BOOKED" | "DEMO_CONFIRMED" | "DEMO_ATTENDED" | "DEMO_MISSED";

/** Stages a person decided; nothing automatic moves a lead out of them. */
export const LEAD_FINAL_STATUSES: readonly LeadStatus[] = ["CONVERTED", "ACTIVE_STUDENT", "LOST"];

/** Before the demo: where a booking may still change. */
const BEFORE_DEMO: readonly LeadStatus[] = ["NEW", "CONTACTED", "INTERESTED", "DEMO_SCHEDULED", "DEMO_CONFIRMED", "NO_SHOW"];

/**
 * The one rule for automatic stage moves: the stage `event` moves a lead in
 * `current` to, or null when it stays. Only forward, with one exception: a
 * lead who missed a demo can be booked again. Never out of a final stage, and
 * never back from Demo attended / Follow up / Payment pending (a second demo
 * keeps the further stage).
 */
export function nextLeadStatus(current: LeadStatus, event: LeadStageEvent): LeadStatus | null {
  if (LEAD_FINAL_STATUSES.includes(current)) return null;
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
  referralCode: z.string().trim().max(32).optional()
});
export type CreateLeadRequest = z.infer<typeof createLeadRequestSchema>;

export const trackVisitRequestSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  referrer: z.string().trim().max(2000).optional()
});
export type TrackVisitRequest = z.infer<typeof trackVisitRequestSchema>;

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
