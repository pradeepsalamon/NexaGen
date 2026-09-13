import { z } from "zod";

// Admin-configurable outbound messaging. One rule per event decides whether a
// message goes out, on which channels, to whom, how long before the moment it
// describes, and what it says. The API dispatches; this file is the contract
// both sides share so the admin UI previews exactly what the server will send.

export const messagingEventSchema = z.enum([
  "CLASS_SCHEDULED",
  "CLASS_REMINDER",
  "CLASS_REMINDER_COACH",
  "CLASS_CANCELLED",
  "ASSIGNMENT_ASSIGNED",
  "ASSIGNMENT_DUE_SOON",
  "ASSIGNMENT_GRADED",
  "ANNOUNCEMENT",
  "ACCOUNT_WELCOME",
  "ACCOUNT_APPROVED"
]);
export type MessagingEvent = z.infer<typeof messagingEventSchema>;

export const MESSAGING_EVENTS = messagingEventSchema.options;

/** Which side of a class/batch a rule talks to. Filtered per event. */
export const messagingAudienceSchema = z.enum([
  "STUDENTS",
  "COACHES",
  "STUDENTS_AND_COACHES"
]);
export type MessagingAudience = z.infer<typeof messagingAudienceSchema>;

export const messageChannelSchema = z.enum(["WHATSAPP", "IN_APP"]);
export type MessageChannel = z.infer<typeof messageChannelSchema>;

export const messageDeliveryStatusSchema = z.enum([
  "PENDING",
  "SENT",
  "FAILED",
  "SKIPPED"
]);
export type MessageDeliveryStatus = z.infer<typeof messageDeliveryStatusSchema>;

/**
 * When a rule's messages go out. IMMEDIATE queues them the moment the action
 * happens; DAILY/WEEKLY hold them for the next matching wall-clock time **in
 * each recipient's own timezone**, so nobody is pinged at 3am. Events with a
 * lead time (class reminder, assignment due soon) ignore this — their timing is
 * the lead time.
 */
export const messagingScheduleModeSchema = z.enum([
  "IMMEDIATE",
  "DAILY",
  "WEEKLY"
]);
export type MessagingScheduleMode = z.infer<typeof messagingScheduleModeSchema>;

/** Delivery attempts before the outbox gives up on a retryable failure. */
export const MESSAGE_MAX_ATTEMPTS = 5;

//
// EVENT CATALOGUE
//
// What the admin UI renders, and what the server validates a template against.
// `variables` is the complete set of placeholders the dispatcher binds for that
// event — anything else in a template renders empty.

export interface MessagingEventDefinition {
  event: MessagingEvent;
  label: string;
  description: string;
  /** Placeholders available to this event's templates, without the braces. */
  variables: readonly string[];
  /** Audiences that make sense here; a one-entry list is fixed, not a choice. */
  audiences: readonly MessagingAudience[];
  /**
   * Whether the rule is scheduled ahead of a moment. Immediate events fire from
   * the action that caused them and ignore `leadTimeMinutes`.
   */
  supportsLeadTime: boolean;
  /** Sensible lead time when the rule is first created, in minutes. */
  defaultLeadTimeMinutes?: number;
}

const RECIPIENT_VARIABLES = [
  "recipient.firstName",
  "recipient.lastName",
  "recipient.fullName",
  "academy.name"
] as const;

const CLASS_VARIABLES = [
  ...RECIPIENT_VARIABLES,
  "class.title",
  "class.topic",
  "class.date",
  "class.time",
  "class.dateTime",
  "class.startsInMinutes",
  "class.coachName",
  "batch.name",
  "links.class"
] as const;

const ASSIGNMENT_VARIABLES = [
  ...RECIPIENT_VARIABLES,
  "assignment.title",
  "assignment.dueDate",
  "assignment.dueTime",
  "assignment.dueDateTime",
  "batch.name",
  "links.assignment"
] as const;

export const MESSAGING_EVENT_DEFINITIONS: Record<
  MessagingEvent,
  MessagingEventDefinition
> = {
  CLASS_SCHEDULED: {
    event: "CLASS_SCHEDULED",
    label: "New class scheduled",
    description:
      "Sent when a coach or admin schedules a class, to everyone in the batch.",
    variables: CLASS_VARIABLES,
    audiences: ["STUDENTS", "COACHES", "STUDENTS_AND_COACHES"],
    supportsLeadTime: false
  },
  CLASS_REMINDER: {
    event: "CLASS_REMINDER",
    label: "Before a class starts (students)",
    description:
      "Sent to the batch ahead of every scheduled class. The lead time is how long before the start time it goes out.",
    variables: CLASS_VARIABLES,
    audiences: ["STUDENTS"],
    supportsLeadTime: true,
    defaultLeadTimeMinutes: 30
  },
  CLASS_REMINDER_COACH: {
    event: "CLASS_REMINDER_COACH",
    label: "Before a class starts (coach)",
    description:
      "The same moment seen from the other side: sent to the coach taking the class, on its own lead time and wording.",
    variables: CLASS_VARIABLES,
    audiences: ["COACHES"],
    supportsLeadTime: true,
    defaultLeadTimeMinutes: 60
  },
  CLASS_CANCELLED: {
    event: "CLASS_CANCELLED",
    label: "Class cancelled",
    description: "Sent when a scheduled class is cancelled.",
    variables: CLASS_VARIABLES,
    audiences: ["STUDENTS", "COACHES", "STUDENTS_AND_COACHES"],
    supportsLeadTime: false
  },
  ASSIGNMENT_ASSIGNED: {
    event: "ASSIGNMENT_ASSIGNED",
    label: "New assignment",
    description: "Sent when an assignment is deployed to a batch.",
    variables: ASSIGNMENT_VARIABLES,
    audiences: ["STUDENTS"],
    supportsLeadTime: false
  },
  ASSIGNMENT_DUE_SOON: {
    event: "ASSIGNMENT_DUE_SOON",
    label: "Assignment due soon",
    description:
      "Sent ahead of an assignment's due date, to students who have not finished it.",
    variables: ASSIGNMENT_VARIABLES,
    audiences: ["STUDENTS"],
    supportsLeadTime: true,
    defaultLeadTimeMinutes: 24 * 60
  },
  ASSIGNMENT_GRADED: {
    event: "ASSIGNMENT_GRADED",
    label: "Assignment submitted / graded",
    description:
      "Sent to the coach who deployed the assignment when a student finishes it.",
    variables: [
      ...ASSIGNMENT_VARIABLES,
      "student.fullName",
      "result.score",
      "result.outcome"
    ],
    audiences: ["COACHES"],
    supportsLeadTime: false
  },
  ANNOUNCEMENT: {
    event: "ANNOUNCEMENT",
    label: "Announcement",
    description:
      "Sent when an admin publishes an announcement, to the audience chosen on the announcement itself.",
    variables: [
      ...RECIPIENT_VARIABLES,
      "announcement.title",
      "announcement.body"
    ],
    audiences: ["STUDENTS_AND_COACHES"],
    supportsLeadTime: false
  },
  ACCOUNT_WELCOME: {
    event: "ACCOUNT_WELCOME",
    label: "Welcome message",
    description: "Sent to a new account right after it registers.",
    variables: [...RECIPIENT_VARIABLES, "links.login"],
    audiences: ["STUDENTS", "COACHES", "STUDENTS_AND_COACHES"],
    supportsLeadTime: false
  },
  ACCOUNT_APPROVED: {
    event: "ACCOUNT_APPROVED",
    label: "Account approved",
    description:
      "Sent when an admin activates a pending account (a coach approval, for example).",
    variables: [...RECIPIENT_VARIABLES, "links.login"],
    audiences: ["STUDENTS", "COACHES", "STUDENTS_AND_COACHES"],
    supportsLeadTime: false
  }
};

//
// TEMPLATE RENDERING
//
// `{{variable.path}}` substitution, shared so the preview in the admin UI is
// the same string the dispatcher builds.

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Flat map keyed exactly like the catalogue: `{ "class.title": "Endgames" }`. */
export type MessageVariables = Record<string, string>;

export function renderMessageTemplate(
  template: string,
  variables: MessageVariables
): string {
  return template.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
    const value = variables[name];
    return value === undefined || value === null ? "" : String(value);
  });
}

/** Every placeholder used in a template, de-duplicated, in first-use order. */
export function extractTemplateVariables(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    found.add(match[1]);
  }
  return [...found];
}

/** Placeholders the event cannot bind — these render empty. Used to warn admins. */
export function findUnknownTemplateVariables(
  event: MessagingEvent,
  template: string
): string[] {
  const known = new Set(MESSAGING_EVENT_DEFINITIONS[event].variables);
  return extractTemplateVariables(template).filter((name) => !known.has(name));
}

/** Placeholder values for previews and test sends — never real member data. */
export function sampleVariablesFor(event: MessagingEvent): MessageVariables {
  const samples: MessageVariables = {
    "recipient.firstName": "Asha",
    "recipient.lastName": "Menon",
    "recipient.fullName": "Asha Menon",
    "academy.name": "Nexa Chess",
    "class.title": "Rook Endgames",
    "class.topic": "Lucena position",
    "class.date": "Mon, 14 Sep 2026",
    "class.time": "6:00 pm",
    "class.dateTime": "Mon, 14 Sep 2026 at 6:00 pm",
    "class.startsInMinutes": "30",
    "class.coachName": "Coach Ravi",
    "batch.name": "Intermediate B",
    "links.class": "https://nexa.test/student/classes",
    "assignment.title": "Knight forks drill",
    "assignment.dueDate": "Fri, 18 Sep 2026",
    "assignment.dueTime": "11:59 pm",
    "assignment.dueDateTime": "Fri, 18 Sep 2026 at 11:59 pm",
    "links.assignment": "https://nexa.test/student/assignments",
    "student.fullName": "Asha Menon",
    "result.score": "82%",
    "result.outcome": "Passed",
    "announcement.title": "Holiday break",
    "announcement.body": "No classes from 20-24 September.",
    "links.login": "https://nexa.test/login"
  };

  const known = MESSAGING_EVENT_DEFINITIONS[event].variables;
  return Object.fromEntries(
    known.map((name) => [name, samples[name] ?? `{{${name}}}`])
  );
}

//
// DEFAULTS
//
// Seeded on first read so an admin edits real copy instead of an empty box.
// Everything ships disabled — turning a rule on is a deliberate act.

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

/** "9:00 am" from 24h parts, for schedule labels. */
export function formatClock(hour: number, minute: number): string {
  const suffix = hour < 12 ? "am" : "pm";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** Plain-language timing for a rule, for the rules list and the editor. */
export function describeSchedule(rule: {
  event: MessagingEvent;
  leadTimeMinutes: number | null;
  scheduleMode: MessagingScheduleMode;
  scheduleHour: number | null;
  scheduleMinute: number | null;
  scheduleDayOfWeek: number | null;
  weekdaysOnly: boolean;
}): string {
  if (MESSAGING_EVENT_DEFINITIONS[rule.event].supportsLeadTime) {
    const minutes = rule.leadTimeMinutes ?? 0;
    if (!minutes) return "No lead time set";
    if (minutes % (24 * 60) === 0) {
      const days = minutes / (24 * 60);
      return `${days} day${days === 1 ? "" : "s"} before`;
    }
    if (minutes % 60 === 0) {
      const hours = minutes / 60;
      return `${hours} hour${hours === 1 ? "" : "s"} before`;
    }
    return `${minutes} min before`;
  }

  if (rule.scheduleMode === "IMMEDIATE") return "Immediately";

  const at = formatClock(rule.scheduleHour ?? 9, rule.scheduleMinute ?? 0);
  if (rule.scheduleMode === "WEEKLY") {
    return `${DAY_LABELS[rule.scheduleDayOfWeek ?? 1]}s at ${at}`;
  }
  return rule.weekdaysOnly ? `Weekdays at ${at}` : `Daily at ${at}`;
}

export interface MessagingRuleDefaults {
  /**
   * Most rules ship off — turning one on is a deliberate act. The two that ship
   * on are the in-app notifications this feature absorbed, which were
   * unconditional before it existed; disabling them here would be a silent
   * regression for every academy on upgrade.
   */
  enabled: boolean;
  whatsappEnabled: boolean;
  inAppEnabled: boolean;
  audience: MessagingAudience;
  leadTimeMinutes: number | null;
  title: string;
  body: string;
}

export const DEFAULT_MESSAGING_RULES: Record<
  MessagingEvent,
  MessagingRuleDefaults
> = {
  CLASS_SCHEDULED: {
    enabled: false,
    whatsappEnabled: true,
    inAppEnabled: true,
    audience: "STUDENTS",
    leadTimeMinutes: null,
    title: "New class scheduled",
    body: "Hi {{recipient.firstName}}, a new class \"{{class.title}}\" has been scheduled for {{batch.name}} on {{class.dateTime}} with {{class.coachName}}."
  },
  CLASS_REMINDER: {
    enabled: false,
    whatsappEnabled: true,
    inAppEnabled: true,
    audience: "STUDENTS",
    leadTimeMinutes: 30,
    title: "Class starts soon",
    body: "Hi {{recipient.firstName}}, your class \"{{class.title}}\" starts in {{class.startsInMinutes}} minutes ({{class.time}}). See you there!"
  },
  CLASS_REMINDER_COACH: {
    enabled: false,
    whatsappEnabled: true,
    inAppEnabled: true,
    audience: "COACHES",
    leadTimeMinutes: 60,
    title: "You're teaching soon",
    body: "Hi {{recipient.firstName}}, you're taking \"{{class.title}}\" with {{batch.name}} at {{class.time}} ({{class.startsInMinutes}} minutes from now)."
  },
  CLASS_CANCELLED: {
    enabled: false,
    whatsappEnabled: true,
    inAppEnabled: true,
    audience: "STUDENTS",
    leadTimeMinutes: null,
    title: "Class cancelled",
    body: "Hi {{recipient.firstName}}, the class \"{{class.title}}\" on {{class.dateTime}} has been cancelled. We'll share a new time soon."
  },
  ASSIGNMENT_ASSIGNED: {
    enabled: false,
    whatsappEnabled: true,
    inAppEnabled: true,
    audience: "STUDENTS",
    leadTimeMinutes: null,
    title: "New assignment",
    body: "Hi {{recipient.firstName}}, a new assignment \"{{assignment.title}}\" has been added for {{batch.name}}. It's due {{assignment.dueDateTime}}."
  },
  ASSIGNMENT_DUE_SOON: {
    enabled: true,
    whatsappEnabled: false,
    inAppEnabled: true,
    audience: "STUDENTS",
    leadTimeMinutes: 24 * 60,
    title: "Assignment due soon",
    body: "Hi {{recipient.firstName}}, \"{{assignment.title}}\" is due {{assignment.dueDateTime}} and isn't finished yet."
  },
  ASSIGNMENT_GRADED: {
    enabled: true,
    whatsappEnabled: false,
    inAppEnabled: true,
    audience: "COACHES",
    leadTimeMinutes: null,
    title: "Assignment submitted",
    body: "{{student.fullName}} finished \"{{assignment.title}}\" — {{result.outcome}}, {{result.score}}."
  },
  ANNOUNCEMENT: {
    enabled: false,
    whatsappEnabled: true,
    inAppEnabled: true,
    audience: "STUDENTS_AND_COACHES",
    leadTimeMinutes: null,
    title: "{{announcement.title}}",
    body: "{{announcement.title}}\n\n{{announcement.body}}"
  },
  ACCOUNT_WELCOME: {
    enabled: false,
    whatsappEnabled: true,
    inAppEnabled: true,
    audience: "STUDENTS_AND_COACHES",
    leadTimeMinutes: null,
    title: "Welcome to {{academy.name}}",
    body: "Welcome to {{academy.name}}, {{recipient.firstName}}! Sign in any time at {{links.login}}."
  },
  ACCOUNT_APPROVED: {
    enabled: false,
    whatsappEnabled: true,
    inAppEnabled: true,
    audience: "STUDENTS_AND_COACHES",
    leadTimeMinutes: null,
    title: "Your account is ready",
    body: "Hi {{recipient.firstName}}, your {{academy.name}} account has been approved. Sign in at {{links.login}}."
  }
};

//
// API CONTRACT
//

export interface MessagingRuleItem {
  event: MessagingEvent;
  /** Master switch. Off means nothing goes out on any channel. */
  enabled: boolean;
  whatsappEnabled: boolean;
  inAppEnabled: boolean;
  audience: MessagingAudience;
  /** Minutes before the moment, for lead-time events only. */
  leadTimeMinutes: number | null;
  /** When queued messages become due. Ignored by lead-time events. */
  scheduleMode: MessagingScheduleMode;
  /** 0-23, read in the recipient's own timezone. Null while IMMEDIATE. */
  scheduleHour: number | null;
  scheduleMinute: number | null;
  /** 0 = Sunday … 6 = Saturday. WEEKLY only. */
  scheduleDayOfWeek: number | null;
  /** DAILY only: push a Saturday/Sunday send to the following Monday. */
  weekdaysOnly: boolean;
  /** In-app notification heading. Unused by WhatsApp, which has no subject. */
  title: string;
  body: string;
  /**
   * Approved WhatsApp template to use instead of free-form text. Required for
   * anything that may land outside the 24h customer-service window.
   */
  whatsappTemplateName: string | null;
  whatsappTemplateLanguage: string | null;
  /** Positional {{1}},{{2}}… values for the template, each its own mini-template. */
  whatsappTemplateParams: string[];
  updatedAt: string;
  updatedByName: string | null;
}

export interface MessagingRuleListResponse {
  rules: MessagingRuleItem[];
  /** False when WHATSAPP_* env is unset — the UI warns instead of lying. */
  whatsappConfigured: boolean;
}

export const updateMessagingRuleRequestSchema = z.object({
  enabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  audience: messagingAudienceSchema.optional(),
  leadTimeMinutes: z.number().int().min(1).max(30 * 24 * 60).nullable().optional(),
  scheduleMode: messagingScheduleModeSchema.optional(),
  scheduleHour: z.number().int().min(0).max(23).nullable().optional(),
  scheduleMinute: z.number().int().min(0).max(59).nullable().optional(),
  scheduleDayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  weekdaysOnly: z.boolean().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(4096).optional(),
  // Empty string clears it; the API normalizes that to null. No transform here,
  // or the parsed type would stop matching what a form actually sends.
  whatsappTemplateName: z.string().trim().max(200).nullable().optional(),
  whatsappTemplateLanguage: z.string().trim().max(20).nullable().optional(),
  whatsappTemplateParams: z.array(z.string().max(500)).max(10).optional()
});
export type UpdateMessagingRuleRequest = z.infer<
  typeof updateMessagingRuleRequestSchema
>;

export interface MessagingRuleResponse {
  rule: MessagingRuleItem;
}

export const testMessagingRuleRequestSchema = z.object({
  /** Defaults to the requesting admin's own number. */
  phoneNumber: z.string().trim().max(30).optional()
});
export type TestMessagingRuleRequest = z.infer<
  typeof testMessagingRuleRequestSchema
>;

export interface TestMessagingRuleResponse {
  sent: boolean;
  to: string | null;
  /** Exactly what was rendered, sample values and all. */
  preview: string;
  error: string | null;
}

export interface MessageDeliveryItem {
  id: string;
  event: MessagingEvent;
  channel: MessageChannel;
  status: MessageDeliveryStatus;
  recipientName: string | null;
  /** Masked to the last 4 digits — the log is not a phone book. */
  recipientMasked: string | null;
  body: string;
  error: string | null;
  /** Sends tried so far. > 0 on a PENDING row means it is being retried. */
  attempts: number;
  /** When the outbox will send it (or did). */
  scheduledFor: string;
  createdAt: string;
}

export interface MessageDeliveryListResponse {
  deliveries: MessageDeliveryItem[];
  counts: { pending: number; sent: number; failed: number; skipped: number };
}

export const messageDeliveryQuerySchema = z.object({
  event: messagingEventSchema.optional(),
  status: messageDeliveryStatusSchema.optional(),
  channel: messageChannelSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});
export type MessageDeliveryQuery = z.infer<typeof messageDeliveryQuerySchema>;

//
// ANNOUNCEMENTS
//

export const announcementAudienceSchema = z.enum([
  "EVERYONE",
  "STUDENTS",
  "COACHES",
  "BATCH"
]);
export type AnnouncementAudience = z.infer<typeof announcementAudienceSchema>;

export const createAnnouncementRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(4000),
    audience: announcementAudienceSchema,
    batchId: z.string().trim().min(1).optional(),
    /** Off publishes to the dashboard feed only, with no WhatsApp/in-app send. */
    sendMessages: z.boolean().default(true)
  })
  .refine((value) => value.audience !== "BATCH" || Boolean(value.batchId), {
    message: "Choose a batch for a batch announcement.",
    path: ["batchId"]
  });
export type CreateAnnouncementRequest = z.infer<
  typeof createAnnouncementRequestSchema
>;

export interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  batchId: string | null;
  batchName: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface AnnouncementListResponse {
  announcements: AnnouncementItem[];
}

export interface CreateAnnouncementResponse {
  announcement: AnnouncementItem;
  /** What the ANNOUNCEMENT rule actually did with it. */
  dispatch: MessagingDispatchSummary;
}

export interface MessagingDispatchSummary {
  /** False when the rule is off — nothing was queued. */
  ruleEnabled: boolean;
  recipients: number;
  /** Messages written to the outbox. The cron sends them; see MESSAGE_MAX_ATTEMPTS. */
  queuedWhatsApp: number;
  queuedInApp: number;
  /** Recipients skipped for a missing or unusable phone number. */
  missingPhone: number;
  /** When the earliest queued message is due; null if it is due now. */
  scheduledFor: string | null;
}
