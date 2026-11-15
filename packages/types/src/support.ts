import { z } from "zod";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CONVERSATION_STATUSES,
  type SupportCategory,
  type SupportConversationStatus
} from "./support-flows";

// The staff side of WhatsApp support (docs/WHATSAPP_SUPPORT.md): tickets the
// bot creates, the conversation transcript, notes and agent replies.
// Admins and super admins only (v1).

export const supportCategorySchema = z.enum(SUPPORT_CATEGORIES);
export const supportConversationStatusSchema = z.enum(SUPPORT_CONVERSATION_STATUSES);

export const supportTicketStatusSchema = z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]);
export type SupportTicketStatus = z.infer<typeof supportTicketStatusSchema>;
export const SUPPORT_TICKET_STATUSES = supportTicketStatusSchema.options;

export const SUPPORT_TICKET_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  IN_PROGRESS: "In progress",
  OPEN: "Open",
  RESOLVED: "Resolved"
};

export const SUPPORT_CONVERSATION_STATUS_LABELS: Record<SupportConversationStatus, string> = {
  AGENT: "Staff replying",
  BOT: "With the bot",
  CLOSED: "Closed",
  WAITING_AGENT: "Waiting for staff"
};

export type SupportMessageDirection = "INBOUND" | "OUTBOUND";
export type SupportMessageStatus = "RECEIVED" | "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";
export type SupportMessageAuthor = "CUSTOMER" | "BOT" | "AGENT";

export interface SupportPerson {
  id: string;
  name: string;
}

export interface SupportContactSummary {
  id: string;
  /** WhatsApp number (digits, with country code). Unmasked: the inbox is staff-only. */
  waId: string;
  profileName: string | null;
  optedOut: boolean;
  /** When the 24-hour customer-service window closes; null = closed (only a template can be sent). */
  replyWindowEndsAt: string | null;
}

export interface SupportTicketListItem {
  id: string;
  reference: string;
  category: SupportCategory;
  status: SupportTicketStatus;
  contact: { waId: string; profileName: string | null };
  studentName: string | null;
  /** First line of what the customer wrote. */
  summary: string | null;
  handoff: boolean;
  assignedTo: SupportPerson | null;
  conversationStatus: SupportConversationStatus;
  lastInboundAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketListResponse {
  items: SupportTicketListItem[];
  pagination: { total: number; page: number; pageSize: number; totalPages: number };
}

export type SupportTicketCounts = Record<SupportTicketStatus, number>;

export type SupportTicketEventKind = "CREATED" | "ASSIGNED" | "STATUS_CHANGED" | "NOTE" | "HANDOFF" | "TAKEN_OVER" | "RETURNED_TO_BOT";

export interface SupportTicketEventItem {
  id: string;
  kind: SupportTicketEventKind;
  /** The note's text, or a short description of the change. */
  body: string | null;
  actor: SupportPerson | null;
  createdAt: string;
}

export interface SupportTicketDetail extends SupportTicketListItem {
  details: string | null;
  conversationId: string;
  contact: SupportContactSummary;
  events: SupportTicketEventItem[];
  resolvedAt: string | null;
  lead: SupportTicketLead | null;
}

export interface SupportMessageItem {
  id: string;
  direction: SupportMessageDirection;
  author: SupportMessageAuthor;
  /** Already redacted (card numbers, OTPs). */
  body: string;
  status: SupportMessageStatus;
  error: string | null;
  sentBy: SupportPerson | null;
  createdAt: string;
}

export interface SupportMessagePage {
  items: SupportMessageItem[];
  nextCursor: string | null;
}

// ── Requests ──

export const SUPPORT_REPLY_MAX = 4000;

export const supportTicketListQuerySchema = z.object({
  assigned: z.enum(["me", "unassigned"]).optional(),
  category: supportCategorySchema.optional(),
  order: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(100).optional(),
  status: supportTicketStatusSchema.optional()
});
export type SupportTicketListQuery = z.input<typeof supportTicketListQuerySchema>;

export const supportReplyRequestSchema = z.object({
  body: z.string().trim().min(1, "Write a reply").max(SUPPORT_REPLY_MAX)
});
export type SupportReplyRequest = z.infer<typeof supportReplyRequestSchema>;

export const supportNoteRequestSchema = z.object({
  body: z.string().trim().min(1, "Write a note").max(SUPPORT_REPLY_MAX)
});
export type SupportNoteRequest = z.infer<typeof supportNoteRequestSchema>;

export const updateSupportTicketRequestSchema = z
  .object({
    /** null = unassign. */
    assignedToId: z.string().min(1).max(64).nullable().optional(),
    status: supportTicketStatusSchema.optional()
  })
  .refine((body) => body.status !== undefined || body.assignedToId !== undefined, "Nothing to change");
export type UpdateSupportTicketRequest = z.infer<typeof updateSupportTicketRequestSchema>;

// ── Saved answers ──
// Written once by admins (fees, timings, levels…). The bot sends the ones with
// `showInBot` when a customer taps them or types a keyword; staff insert any
// of them into a reply. The bot shows the first SUPPORT_BOT_ANSWERS_MAX in
// `sortOrder`.

export const SUPPORT_SAVED_REPLY_LIMITS = {
  body: 4000,
  description: 72,
  keyword: 40,
  keywords: 20,
  /** Per academy: the list is small and loaded whole. */
  total: 100,
  title: 24
} as const;

export const supportSavedReplyRequestSchema = z.object({
  body: z.string().trim().min(1, "Write the answer").max(SUPPORT_SAVED_REPLY_LIMITS.body),
  description: z
    .string()
    .trim()
    .max(SUPPORT_SAVED_REPLY_LIMITS.description, `At most ${SUPPORT_SAVED_REPLY_LIMITS.description} characters`)
    .nullable()
    .optional()
    .transform((value) => value || null),
  keywords: z
    .array(z.string().trim().min(1).max(SUPPORT_SAVED_REPLY_LIMITS.keyword, `A keyword is at most ${SUPPORT_SAVED_REPLY_LIMITS.keyword} characters`))
    .max(SUPPORT_SAVED_REPLY_LIMITS.keywords, `At most ${SUPPORT_SAVED_REPLY_LIMITS.keywords} keywords`)
    .default([]),
  showInBot: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
  title: z
    .string()
    .trim()
    .min(1, "Give it a title")
    .max(SUPPORT_SAVED_REPLY_LIMITS.title, `At most ${SUPPORT_SAVED_REPLY_LIMITS.title} characters (a WhatsApp limit)`)
});
export type SupportSavedReplyRequest = z.input<typeof supportSavedReplyRequestSchema>;
/** The request after validation (defaults filled in). */
export type SupportSavedReplyInput = z.output<typeof supportSavedReplyRequestSchema>;

export interface SupportSavedReplyItem {
  id: string;
  title: string;
  description: string | null;
  body: string;
  keywords: string[];
  showInBot: boolean;
  sortOrder: number;
  /** Among the first SUPPORT_BOT_ANSWERS_MAX bot answers, so the bot offers it. */
  inBotMenu: boolean;
  updatedBy: SupportPerson | null;
  updatedAt: string;
}

/** The lead a free-demo booking created or matched. */
export interface SupportTicketLead {
  id: string;
  studentName: string;
  status: string;
}

// ── Questions the bot couldn't answer ──
// What parents typed that no saved answer matched (or that they said wasn't
// what they meant). Repeats of the same wording count on one row; admins
// write an answer or dismiss it. Kept 90 days after it was last asked.

export interface SupportUnansweredQuestionItem {
  id: string;
  /** The latest wording (card numbers and codes already removed). */
  text: string;
  timesAsked: number;
  firstAskedAt: string;
  lastAskedAt: string;
}

export interface SupportUnansweredQuestionListResponse {
  items: SupportUnansweredQuestionItem[];
  pagination: { total: number; page: number; pageSize: number; totalPages: number };
}

export const supportUnansweredListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(100).optional()
});
export type SupportUnansweredListQuery = z.input<typeof supportUnansweredListQuerySchema>;

// ── Per-academy bot settings (docs/WHATSAPP_SUPPORT_MODES_PLAN.md §9) ──

export const SUPPORT_SETTINGS_LIMITS = {
  testNumbersMax: 20,
  staffReminderMinutesMax: 1440,
  /** The nudge must go inside the free 24-hour reply window. */
  leadNudgeHoursMax: 23,
  templateNameMax: 512
} as const;

export const updateSupportSettingsRequestSchema = z.object({
  botEnabled: z.boolean(),
  /** Numbers with country code; the API normalizes them (spaces, "+", a national number). */
  testNumbers: z.array(z.string().trim().min(1).max(30)).max(SUPPORT_SETTINGS_LIMITS.testNumbersMax),
  staffReminderMinutes: z.number().int().min(0).max(SUPPORT_SETTINGS_LIMITS.staffReminderMinutesMax),
  leadNudgeHours: z.number().int().min(0).max(SUPPORT_SETTINGS_LIMITS.leadNudgeHoursMax),
  /** Name as in WhatsApp Manager; empty = none (staff can't reply after the 24-hour window). */
  agentReplyTemplate: z
    .string()
    .trim()
    .max(SUPPORT_SETTINGS_LIMITS.templateNameMax)
    .regex(/^[a-z0-9_]*$/, "Lower-case letters, digits and _ only, as in WhatsApp Manager."),
  agentReplyTemplateLanguage: z
    .string()
    .trim()
    .regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, "A language code such as en or en_US.")
});
export type UpdateSupportSettingsRequest = z.infer<typeof updateSupportSettingsRequestSchema>;

/** The settings the bot uses now. */
export interface SupportSettingsValues {
  botEnabled: boolean;
  /** Normalized (digits with country code). Empty = everyone. */
  testNumbers: string[];
  staffReminderMinutes: number;
  leadNudgeHours: number;
  /** null = none. */
  agentReplyTemplate: string | null;
  agentReplyTemplateLanguage: string;
}

export interface SupportSettingsResponse extends SupportSettingsValues {
  /** ACADEMY = saved on this page; SERVER = Nexa's academy, still on the server's defaults until the first save. */
  source: "ACADEMY" | "SERVER";
  /** Whether WhatsApp can reach the bot for this academy. */
  connection: {
    /** Nexa's academy (the server's number). */
    usesPlatformNumber: boolean;
    /** Incoming messages are set up (an academy: token + app secret + switched on; Nexa: the server's secret). */
    receiving: boolean;
    lastWebhookAt: string | null;
  };
  updatedAt: string | null;
}
