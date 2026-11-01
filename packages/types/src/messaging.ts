import { z } from "zod";
import { escapeMarkdown } from "./markdown";

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
  "ASSIGNMENT_OVERDUE_COACH",
  "REVISION_DUE",
  "ANNOUNCEMENT",
  "ACCOUNT_WELCOME",
  "ACCOUNT_APPROVED",
  "PAYMENT_RECEIVED",
  "PAYMENT_FAILED",
  "REFUND_PROCESSED",
  "SUBSCRIPTION_RENEWAL_FAILED",
  "INVOICE_ISSUED",
  "PAYROLL_FINALIZED",
  "PAYROLL_PAID",
  "APPROVAL_REQUESTED",
  "APPROVAL_DECIDED"
]);
export type MessagingEvent = z.infer<typeof messagingEventSchema>;

export const MESSAGING_EVENTS = messagingEventSchema.options;

/** Which side of a class/batch a rule talks to. Filtered per event. */
export const messagingAudienceSchema = z.enum([
  "STUDENTS",
  "COACHES",
  "STUDENTS_AND_COACHES",
  /** Admin-side events only (approval requests); never a class/assignment audience. */
  "ADMINS"
]);
export type MessagingAudience = z.infer<typeof messagingAudienceSchema>;

export const messageChannelSchema = z.enum(["WHATSAPP", "IN_APP", "EMAIL"]);
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
  /** False when another email already covers this moment. Omitted = true. */
  supportsEmail?: boolean;
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

const PAYMENT_VARIABLES = [
  ...RECIPIENT_VARIABLES,
  "payment.amount",
  "payment.currency",
  "payment.method",
  "payment.status",
  "order.number",
  "plan.name",
  "invoice.number",
  "links.billing"
] as const;

/**
 * The invoice document's own variables. `invoice.total` is the figure actually
 * charged, read back from the invoice row — a message can never assert an
 * amount the document does not carry.
 */
const INVOICE_VARIABLES = [
  ...RECIPIENT_VARIABLES,
  "invoice.number",
  "invoice.total",
  "invoice.date",
  "invoice.currency",
  "order.number",
  "plan.name",
  "links.invoice"
] as const;

/**
 * A coach's own payroll moment — never the amount alone: no bank/payment
 * detail is ever a template variable here (CLAUDE.md payroll §28).
 */
const PAYROLL_VARIABLES = [
  ...RECIPIENT_VARIABLES,
  "payroll.periodLabel",
  "payroll.netPayable",
  "links.earnings"
] as const;

/**
 * An admin-approval request (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md
 * §2.7). The reason is the requester's own words; nothing about consent or
 * money is ever a variable here.
 */
const APPROVAL_VARIABLES = [
  ...RECIPIENT_VARIABLES,
  "approval.action",
  "approval.requesterName",
  "approval.subject",
  "approval.reason",
  "approval.decision",
  "approval.note",
  "links.approval"
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
  ASSIGNMENT_OVERDUE_COACH: {
    event: "ASSIGNMENT_OVERDUE_COACH",
    label: "Assignment overdue (coach)",
    description:
      "Sent once to the coach who deployed an assignment when its due date passes with students still unfinished.",
    variables: [...ASSIGNMENT_VARIABLES, "assignment.overdueCount", "assignment.studentCount"],
    audiences: ["COACHES"],
    supportsLeadTime: false
  },
  REVISION_DUE: {
    event: "REVISION_DUE",
    label: "Revision due",
    description:
      "Sent at most once a day to students with puzzles due for revision. Reviews fall due at local midnight, so keep a daily send time.",
    variables: [...RECIPIENT_VARIABLES, "links.revision"],
    audiences: ["STUDENTS"],
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
  },
  PAYMENT_RECEIVED: {
    event: "PAYMENT_RECEIVED",
    label: "Payment received",
    description:
      "Sent once a payment is verified server-side and access has been granted. Never sent on a frontend success callback alone.",
    variables: PAYMENT_VARIABLES,
    audiences: ["STUDENTS"],
    supportsLeadTime: false
  },
  PAYMENT_FAILED: {
    event: "PAYMENT_FAILED",
    label: "Payment failed",
    description:
      "Sent when a payment attempt ends in a confirmed failure, with a link back to retry.",
    variables: PAYMENT_VARIABLES,
    audiences: ["STUDENTS"],
    supportsLeadTime: false
  },
  REFUND_PROCESSED: {
    event: "REFUND_PROCESSED",
    label: "Refund completed",
    description:
      "Sent when the provider confirms a refund has actually settled — not when the refund was requested.",
    variables: PAYMENT_VARIABLES,
    audiences: ["STUDENTS"],
    supportsLeadTime: false
  },
  SUBSCRIPTION_RENEWAL_FAILED: {
    event: "SUBSCRIPTION_RENEWAL_FAILED",
    label: "Subscription renewal failed",
    description:
      "Sent when a recurring charge could not be collected, so the member can update their payment method before access lapses.",
    variables: PAYMENT_VARIABLES,
    audiences: ["STUDENTS"],
    supportsLeadTime: false
  },
  INVOICE_ISSUED: {
    event: "INVOICE_ISSUED",
    label: "Invoice issued",
    description:
      "Sends the invoice itself once its PDF is ready. On WhatsApp the PDF is attached as a document, so a parent gets the receipt in the chat rather than a link to chase. Fires after the payment is verified, and never twice for one invoice.",
    variables: INVOICE_VARIABLES,
    audiences: ["STUDENTS"],
    supportsLeadTime: false,
    // The invoice email is a system message, so a rule email would be a second copy.
    supportsEmail: false
  },
  PAYROLL_FINALIZED: {
    event: "PAYROLL_FINALIZED",
    label: "Payslip ready",
    description:
      "Sent to a coach when an admin finalizes the payroll period they're included in — their payslip is generating.",
    variables: PAYROLL_VARIABLES,
    audiences: ["COACHES"],
    supportsLeadTime: false
  },
  PAYROLL_PAID: {
    event: "PAYROLL_PAID",
    label: "Payroll paid",
    description: "Sent to a coach once their payout for a period is marked paid.",
    variables: PAYROLL_VARIABLES,
    audiences: ["COACHES"],
    supportsLeadTime: false
  },
  APPROVAL_REQUESTED: {
    event: "APPROVAL_REQUESTED",
    label: "Approval request received",
    description:
      "Sent to every admin who can decide it when a coach asks for something beyond their own authority (e.g. cancelling a class within 24 hours). Never sent to the person who asked.",
    variables: APPROVAL_VARIABLES,
    audiences: ["ADMINS"],
    supportsLeadTime: false
  },
  APPROVAL_DECIDED: {
    event: "APPROVAL_DECIDED",
    label: "Approval request decided",
    description: "Sent to the person who asked once an admin approves or rejects the request, or it expires undecided.",
    variables: APPROVAL_VARIABLES,
    audiences: ["COACHES"],
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

/** Staff-written text whose formatting should survive. Every other value is data. */
const FORMATTED_VARIABLES = new Set(["announcement.body"]);

/** A message body: the template's formatting counts, a value's never does (see escapeMarkdown). */
export function renderFormattedTemplate(template: string, variables: MessageVariables): string {
  const escaped = Object.fromEntries(
    Object.entries(variables).map(([name, value]) => [
      name,
      FORMATTED_VARIABLES.has(name) || value === undefined || value === null
        ? value
        : escapeMarkdown(String(value))
    ])
  );
  return renderMessageTemplate(template, escaped);
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

/** What each placeholder means, with the example value previews and test sends use. */
export const MESSAGE_VARIABLE_DOCS: Record<string, { label: string; sample: string }> = {
  "recipient.firstName": { label: "Recipient's first name", sample: "Asha" },
  "recipient.lastName": { label: "Recipient's last name", sample: "Menon" },
  "recipient.fullName": { label: "Recipient's full name", sample: "Asha Menon" },
  "academy.name": { label: "Academy name", sample: "Nexa Chess" },
  "class.title": { label: "Class title", sample: "Rook Endgames" },
  "class.topic": { label: "Class topic", sample: "Lucena position" },
  "class.date": { label: "Class date", sample: "Mon, 14 Sep 2026" },
  "class.time": { label: "Class start time", sample: "6:00 pm" },
  "class.dateTime": { label: "Class date and time", sample: "Mon, 14 Sep 2026 at 6:00 pm" },
  "class.startsInMinutes": { label: "Minutes until the class starts", sample: "30" },
  "class.coachName": { label: "Coach's name", sample: "Coach Ravi" },
  "batch.name": { label: "Batch name", sample: "Intermediate B" },
  "links.class": { label: "Link to the classes page", sample: "https://nexa.test/student/classes" },
  "assignment.title": { label: "Assignment title", sample: "Knight forks drill" },
  "assignment.dueDate": { label: "Due date", sample: "Fri, 18 Sep 2026" },
  "assignment.dueTime": { label: "Due time", sample: "11:59 pm" },
  "assignment.dueDateTime": { label: "Due date and time", sample: "Fri, 18 Sep 2026 at 11:59 pm" },
  "assignment.overdueCount": { label: "Students who haven't finished", sample: "3" },
  "assignment.studentCount": { label: "Students assigned", sample: "12" },
  "links.assignment": { label: "Link to the assignment", sample: "https://nexa.test/student/assignments" },
  "student.fullName": { label: "Student's full name", sample: "Asha Menon" },
  "result.score": { label: "Score", sample: "82%" },
  "result.outcome": { label: "Result", sample: "Passed" },
  "announcement.title": { label: "Announcement title", sample: "Holiday break" },
  "announcement.body": { label: "Announcement text", sample: "No classes from 20-24 September." },
  "links.login": { label: "Sign-in link", sample: "https://nexa.test/login" },
  "links.revision": { label: "Link to revision", sample: "https://nexa.test/student/revision" },
  "payment.amount": { label: "Amount", sample: "₹999.00" },
  "payment.currency": { label: "Currency", sample: "INR" },
  "payment.method": { label: "Payment method", sample: "UPI" },
  "payment.status": { label: "Payment status", sample: "Paid" },
  "order.number": { label: "Order number", sample: "NEXA-2026-7F3K9Q" },
  "plan.name": { label: "Plan name", sample: "Premium Membership" },
  "links.billing": { label: "Link to billing", sample: "https://nexa.test/student/billing" },
  "invoice.number": { label: "Invoice number", sample: "NEXA/2026/000123" },
  "invoice.total": { label: "Invoice total", sample: "₹999.00" },
  "invoice.date": { label: "Invoice date", sample: "Mon, 14 Sep 2026" },
  "invoice.currency": { label: "Invoice currency", sample: "INR" },
  "links.invoice": { label: "Link to the invoice", sample: "https://nexa.test/student/billing/invoices/1" },
  "payroll.periodLabel": { label: "Payroll period", sample: "September 2026" },
  "payroll.netPayable": { label: "Net pay", sample: "₹19,750.00" },
  "links.earnings": { label: "Link to earnings", sample: "https://nexa.test/coach/earnings" },
  "approval.action": { label: "What was asked", sample: "Cancel a class within 24 hours of its start" },
  "approval.requesterName": { label: "Who asked", sample: "Coach Ravi" },
  "approval.subject": { label: "What it's about (class or student)", sample: "Rook Endgames, Mon, 14 Sep 2026" },
  "approval.reason": { label: "The requester's reason", sample: "Unwell today" },
  "approval.decision": { label: "Outcome (approved / rejected / expired)", sample: "approved" },
  "approval.note": { label: "The admin's note or rejection reason (may be empty)", sample: "Note: we'll schedule a make-up class." },
  "links.approval": { label: "Link to the request", sample: "https://nexa.test/admin/requests" },
  // System messages (./system-messages)
  "links.reset": { label: "Password reset link", sample: "https://nexa.test/reset-password?token=sample" },
  "links.verify": { label: "Email verification link", sample: "https://nexa.test/verify-email?token=sample" },
  "email.new": { label: "The new email address", sample: "asha.new@example.com" },
  "customer.name": { label: "Billed customer's name", sample: "Asha Menon" },
  "invoice.amount": { label: "Amount paid", sample: "₹999.00" },
  "invoice.attachmentNote": { label: "Says the PDF is attached (empty if it isn't)", sample: "It is attached to this email as a PDF." },
  "invoice.downloadNote": { label: "Says when the link expires (empty without a link)", sample: "This download link expires in 7 days." },
  "seller.name": { label: "Seller's legal name", sample: "Nexa Chess Academy" },
  "support.line": { label: "How to reach support", sample: "Questions? Reply to this email or write to help@nexa.test." },
  "links.download": { label: "Invoice download link", sample: "https://nexa.test/invoices/sample.pdf" },
  "guest.name": { label: "Guest's name", sample: "Asha Menon" },
  "guest.email": { label: "Guest's email address", sample: "asha@example.com" },
  "demo.topic": { label: "Demo class topic", sample: "Rook Endgames" },
  "demo.dateTime": { label: "Demo class date and time (UTC)", sample: "Monday, Sep 14, 06:00 PM UTC" },
  "links.join": { label: "Link to join the class", sample: "https://nexa.test/demo/sample" },
  "lead.studentName": { label: "Student's name", sample: "Asha Menon" },
  "lead.studentAge": { label: "Student's age", sample: "11" },
  "lead.parentName": { label: "Parent's name", sample: "Priya Menon" },
  "lead.experience": { label: "Experience level", sample: "Beginner" },
  "lead.phone": { label: "Phone number", sample: "+91 98765 43210" },
  "lead.source": { label: "Where the lead came from", sample: "Website" },
  "lead.campaign": { label: "Campaign", sample: "-" },
  "requester.name": { label: "Requester's name", sample: "Asha Menon" },
  "requester.email": { label: "Requester's email address", sample: "asha@example.com" },
  "requester.role": { label: "Requester's role", sample: "STUDENT" },
  "request.reason": { label: "Reason they gave", sample: "Moving to another academy." },
  "request.noteLine": { label: "The academy's note (empty if none)", sample: "Note from the academy: Your invoices are kept as the law requires." }
};

/** Example values for a set of placeholders, for previews and test sends — never real member data. */
export function sampleVariables(names: readonly string[]): MessageVariables {
  return Object.fromEntries(
    names.map((name) => [name, MESSAGE_VARIABLE_DOCS[name]?.sample ?? `{{${name}}}`])
  );
}

export function sampleVariablesFor(event: MessagingEvent): MessageVariables {
  return sampleVariables(MESSAGING_EVENT_DEFINITIONS[event].variables);
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
  /** Omitted = IMMEDIATE. */
  scheduleMode?: MessagingScheduleMode;
  scheduleHour?: number;
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
  // Coach-facing, in-app only like ASSIGNMENT_GRADED: the coach should hear
  // about unfinished homework without an admin having to opt in first.
  ASSIGNMENT_OVERDUE_COACH: {
    enabled: true,
    whatsappEnabled: false,
    inAppEnabled: true,
    audience: "COACHES",
    leadTimeMinutes: null,
    title: "Assignment overdue",
    body: "\"{{assignment.title}}\" for {{batch.name}} was due {{assignment.dueDateTime}}. {{assignment.overdueCount}} of {{assignment.studentCount}} students haven't finished it."
  },
  // Off: a daily nudge to minors is the academy's call. 5pm, because reviews
  // fall due at local midnight and IMMEDIATE would send then.
  REVISION_DUE: {
    enabled: false,
    whatsappEnabled: false,
    inAppEnabled: true,
    audience: "STUDENTS",
    leadTimeMinutes: null,
    scheduleMode: "DAILY",
    scheduleHour: 17,
    title: "Time to revise",
    body: "Hi {{recipient.firstName}}, you have puzzles ready to revise. A few minutes today keeps them fresh: {{links.revision}}"
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
  },
  // Payment rules ship ENABLED and in-app only. A receipt is transactional, not
  // marketing: the member must be told their money arrived. WhatsApp stays off
  // until an admin turns it on, because that needs an approved template.
  PAYMENT_RECEIVED: {
    enabled: true,
    whatsappEnabled: false,
    inAppEnabled: true,
    audience: "STUDENTS",
    leadTimeMinutes: null,
    title: "Payment successful",
    body: "Hi {{recipient.firstName}}, we have received {{payment.amount}} for {{plan.name}}. Order {{order.number}}. Your invoice is at {{links.billing}}."
  },
  PAYMENT_FAILED: {
    enabled: true,
    whatsappEnabled: false,
    inAppEnabled: true,
    audience: "STUDENTS",
    leadTimeMinutes: null,
    title: "Payment could not be completed",
    body: "Hi {{recipient.firstName}}, your payment of {{payment.amount}} for {{plan.name}} could not be completed. Nothing has been charged. You can try again at {{links.billing}}."
  },
  REFUND_PROCESSED: {
    enabled: true,
    whatsappEnabled: false,
    inAppEnabled: true,
    audience: "STUDENTS",
    leadTimeMinutes: null,
    title: "Refund completed",
    body: "Hi {{recipient.firstName}}, a refund of {{payment.amount}} for order {{order.number}} has been processed. Banks usually take 5-7 working days to show it."
  },
  SUBSCRIPTION_RENEWAL_FAILED: {
    enabled: true,
    whatsappEnabled: false,
    inAppEnabled: true,
    audience: "STUDENTS",
    leadTimeMinutes: null,
    title: "Subscription renewal failed",
    body: "Hi {{recipient.firstName}}, we could not renew your {{plan.name}} subscription. Please update your payment method at {{links.billing}} to keep your access."
  },
  INVOICE_ISSUED: {
    enabled: true,
    whatsappEnabled: false,
    inAppEnabled: true,
    audience: "STUDENTS",
    leadTimeMinutes: null,
    title: "Invoice {{invoice.number}}",
    body: "Hi {{recipient.firstName}}, here is your invoice {{invoice.number}} for {{invoice.total}}. You can also download it any time from {{links.invoice}}."
  },
  // Payroll rules ship ENABLED and in-app only, same reasoning as payments:
  // a payslip/payout is transactional, not marketing. The body deliberately
  // never carries a bank/payment detail (CLAUDE.md payroll §28).
  PAYROLL_FINALIZED: {
    enabled: true,
    whatsappEnabled: false,
    inAppEnabled: true,
    audience: "COACHES",
    leadTimeMinutes: null,
    title: "Your payslip is ready",
    body: "Hi {{recipient.firstName}}, your payslip for {{payroll.periodLabel}} is ready. View it at {{links.earnings}}."
  },
  PAYROLL_PAID: {
    enabled: true,
    whatsappEnabled: false,
    inAppEnabled: true,
    audience: "COACHES",
    leadTimeMinutes: null,
    title: "Payment sent",
    body: "Hi {{recipient.firstName}}, your payment of {{payroll.netPayable}} for {{payroll.periodLabel}} has been processed."
  },
  // Approval rules ship ENABLED and in-app only: a request that nobody sees
  // blocks the coach, and the inbox is where it gets decided.
  APPROVAL_REQUESTED: {
    enabled: true,
    whatsappEnabled: false,
    inAppEnabled: true,
    audience: "ADMINS",
    leadTimeMinutes: null,
    title: "Request: {{approval.action}}",
    body: "{{approval.requesterName}} asks: {{approval.action}} ({{approval.subject}}). Reason: {{approval.reason}}. Review it at {{links.approval}}."
  },
  APPROVAL_DECIDED: {
    enabled: true,
    whatsappEnabled: false,
    inAppEnabled: true,
    audience: "COACHES",
    leadTimeMinutes: null,
    title: "Your request was {{approval.decision}}",
    body: "Hi {{recipient.firstName}}, your request ({{approval.action}}, {{approval.subject}}) was {{approval.decision}}. {{approval.note}}"
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
  emailEnabled: boolean;
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
  /** In-app heading and email subject. Unused by WhatsApp, which has no subject. */
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
  /** False when SMTP_* env is unset. */
  emailConfigured: boolean;
}

export const updateMessagingRuleRequestSchema = z.object({
  enabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
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
  /** Omitted = WhatsApp. An email test only ever goes to the admin's own account. */
  channel: z.enum(["WHATSAPP", "EMAIL"]).optional(),
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
  /** Masked phone or email address — the log is not a phone book. */
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
    /** Off publishes to the dashboard feed only, with no WhatsApp/in-app/email send. */
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
  queuedEmail: number;
  /** Recipients skipped for a missing or unusable phone number. */
  missingPhone: number;
  /** Recipients skipped because the academy requires verified addresses and theirs isn't. */
  unverifiedEmail: number;
  /** When the earliest queued message is due; null if it is due now. */
  scheduledFor: string | null;
}
