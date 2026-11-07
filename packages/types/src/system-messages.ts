import { z } from "zod";
import { extractTemplateVariables } from "./messaging";
import { WHATSAPP_TEMPLATE_LIMITS } from "./whatsapp-template";

// The fixed messages the platform sends outside the rules: sign-in emails,
// receipts, demo-class invites and notices to staff. Each can be reworded by an
// admin and sent by email, WhatsApp and in-app, each channel switched on or off
// per message; its trigger and recipient cannot be changed. No saved row means
// the defaults below are used.

export const systemMessageKeySchema = z.enum([
  "PASSWORD_RESET",
  "ACCOUNT_ACCESS",
  "ACADEMY_ADMIN_INVITE",
  "EMAIL_VERIFICATION",
  "EMAIL_CHANGED",
  "PARENT_CONTACT_CHANGED",
  "ACCOUNT_DELETION_COMPLETED",
  "ACCOUNT_DELETION_DECLINED",
  "INVOICE_EMAIL",
  "DEMO_BOOKING",
  "DEMO_REGISTRATION",
  "DEMO_INVITATION",
  "NEW_LEAD_ADMIN",
  "ACCOUNT_DELETION_REQUESTED_ADMIN",
  "TENANT_INTEGRITY_ALERT"
]);
export type SystemMessageKey = z.infer<typeof systemMessageKeySchema>;

export const SYSTEM_MESSAGE_KEYS = systemMessageKeySchema.options;

export const systemMessageChannelSchema = z.enum(["EMAIL", "WHATSAPP", "IN_APP"]);
export type SystemMessageChannel = z.infer<typeof systemMessageChannelSchema>;
export const SYSTEM_MESSAGE_CHANNELS = systemMessageChannelSchema.options;
export const SYSTEM_MESSAGE_CHANNEL_LABELS: Record<SystemMessageChannel, string> = {
  EMAIL: "Email",
  IN_APP: "In-app",
  WHATSAPP: "WhatsApp"
};

export type SystemMessageGroup = "ACCOUNT" | "BILLING" | "DEMO" | "ADMIN" | "PLATFORM";

export const SYSTEM_MESSAGE_GROUP_LABELS: Record<SystemMessageGroup, string> = {
  ACCOUNT: "Sign-in and account",
  BILLING: "Billing",
  DEMO: "Demo classes",
  ADMIN: "Sent to admins",
  PLATFORM: "Sent to platform operators"
};

export interface SystemMessageDefinition {
  key: SystemMessageKey;
  group: SystemMessageGroup;
  label: string;
  description: string;
  /** Who receives it, in plain words. */
  sentTo: string;
  /**
   * Channels it can go out on. Every message supports all three unless a channel can't reach
   * the recipient or would break the message's purpose; `channelNote` says why.
   */
  channels: readonly SystemMessageChannel[];
  /** The channels that are on until an admin changes them. */
  defaultChannels: readonly SystemMessageChannel[];
  /** Why a channel is missing from `channels`, shown in the editor. */
  channelNote?: string;
  variables: readonly string[];
  /** A body that drops one of these would be useless, so the API refuses to save it. */
  requiredVariables?: readonly string[];
  /**
   * A link the code adds so an edit can't lose it: a button below the email, a "label: link"
   * line under a WhatsApp text (unless the text already has it), the in-app notification's link.
   */
  actionVariable?: string;
  /** Nexa's platform operators only: hidden from (and not editable by) other academies. */
  platformOnly?: boolean;
  /** Where the in-app notification opens when there is no action link (a path in the app). */
  inAppLink?: string;
  /**
   * `subject` is the email subject and the in-app title. `whatsappBody` null = the WhatsApp text
   * is `body`.
   */
  defaults: { subject: string; body: string; actionLabel: string | null; whatsappBody: string | null };
}

/** The keys an academy's admins see: platform-only messages belong to Nexa's academy. */
export function systemMessageKeysFor(isPlatformAcademy: boolean): SystemMessageKey[] {
  return SYSTEM_MESSAGE_KEYS.filter((key) => isPlatformAcademy || !SYSTEM_MESSAGE_DEFINITIONS[key].platformOnly);
}

const ALL_CHANNELS = SYSTEM_MESSAGE_CHANNELS;
const NO_ACCOUNT = "In-app needs an account to show in, and this person has none.";
const ONE_TIME_LINK =
  "No in-app: the message carries a one-time sign-in link, which is never stored in the app's inbox (and the person is usually signed out).";
const EMAIL_AND_WHATSAPP: readonly SystemMessageChannel[] = ["EMAIL", "WHATSAPP"];
const DEMO_VARIABLES = ["academy.name", "guest.name", "demo.topic", "demo.dateTime", "links.join"];
const DEMO_BOOKING_VARIABLES = ["academy.name", "lead.parentName", "lead.studentName"];

export const SYSTEM_MESSAGE_DEFINITIONS: Record<SystemMessageKey, SystemMessageDefinition> = {
  PASSWORD_RESET: {
    key: "PASSWORD_RESET",
    group: "ACCOUNT",
    label: "Password reset",
    description: "Sent when someone asks to reset their password.",
    sentTo: "The person who asked (their email, the phone on their account, their in-app inbox)",
    channels: EMAIL_AND_WHATSAPP,
    channelNote: ONE_TIME_LINK,
    defaultChannels: ["EMAIL"],
    variables: ["academy.name", "links.reset"],
    actionVariable: "links.reset",
    defaults: {
      subject: "Reset your {{academy.name}} password",
      body: "Use the button below to choose a new password. This link expires in 30 minutes.\n\nIf you did not request it, you can ignore this message.",
      actionLabel: "Reset password",
      whatsappBody: "Use this link to choose a new {{academy.name}} password. It expires in 30 minutes. If you did not request it, ignore this message."
    }
  },
  ACCOUNT_ACCESS: {
    key: "ACCOUNT_ACCESS",
    group: "ACCOUNT",
    label: "Sign-in link from an admin",
    description:
      "Sent when an admin sends a sales account its sign-in link. The link sets a password. The admin picks the channels each time they send it.",
    sentTo: "The sales account",
    channels: EMAIL_AND_WHATSAPP,
    channelNote: ONE_TIME_LINK,
    defaultChannels: ["EMAIL", "WHATSAPP"],
    variables: ["academy.name", "recipient.firstName", "links.reset"],
    actionVariable: "links.reset",
    defaults: {
      subject: "Your {{academy.name}} referral board",
      body: "Hi {{recipient.firstName}},\n\nUse the button below to set your password and sign in to your referral board. This link works once and expires in 24 hours.",
      actionLabel: "Set password and sign in",
      whatsappBody: "Hi {{recipient.firstName}}, set your password and sign in to your {{academy.name}} referral board here (works once, expires in 24 hours): {{links.reset}}"
    }
  },
  ACADEMY_ADMIN_INVITE: {
    key: "ACADEMY_ADMIN_INVITE",
    group: "ACCOUNT",
    label: "New academy: first super admin",
    description: "Sent when the platform creates an academy. The link sets the super admin's password on the academy's own address.",
    sentTo: "The academy's first super admin",
    channels: EMAIL_AND_WHATSAPP,
    channelNote: ONE_TIME_LINK,
    defaultChannels: ["EMAIL"],
    variables: ["academy.name", "recipient.firstName", "links.reset"],
    requiredVariables: ["links.reset"],
    actionVariable: "links.reset",
    defaults: {
      subject: "Your {{academy.name}} academy is ready",
      body: "Hi {{recipient.firstName}},\n\nYour academy {{academy.name}} has been set up. Use the button below to choose your password and sign in. This link works once and expires in 7 days.",
      actionLabel: "Set password and sign in",
      whatsappBody: null
    }
  },
  EMAIL_VERIFICATION: {
    key: "EMAIL_VERIFICATION",
    group: "ACCOUNT",
    label: "Email verification",
    description: "Sent when an address needs confirming. Depends on the policy at Admin → Email.",
    sentTo: "The person signing up",
    channels: ["EMAIL"],
    defaultChannels: ["EMAIL"],
    channelNote:
      "Email only: opening the link proves the person owns the email address. Sent anywhere else, it would verify an address nobody checked.",
    variables: ["academy.name", "links.verify"],
    actionVariable: "links.verify",
    defaults: {
      subject: "Verify your {{academy.name}} email address",
      body: "Welcome to {{academy.name}}! Please verify your email address using the button below. This link expires in 24 hours.\n\nIf you did not create an account, you can ignore this email.",
      actionLabel: "Verify email address",
      whatsappBody: null
    }
  },
  EMAIL_CHANGED: {
    key: "EMAIL_CHANGED",
    group: "ACCOUNT",
    label: "Email address changed",
    description: "Warns the account's owner that its email changed, so a hijacked account's owner finds out.",
    sentTo: "The account's old email address, its phone and its in-app inbox",
    channels: ALL_CHANNELS,
    defaultChannels: ["EMAIL", "IN_APP"],
    inAppLink: "/profile",
    variables: ["academy.name", "email.new"],
    defaults: {
      subject: "Your {{academy.name}} email address was changed",
      body: "The email address on your {{academy.name}} account was changed to {{email.new}}.\n\nIf you made this change, no action is needed.\nIf you did not, contact the academy immediately: someone else may have access to your account.",
      actionLabel: null,
      whatsappBody: null
    }
  },
  PARENT_CONTACT_CHANGED: {
    key: "PARENT_CONTACT_CHANGED",
    group: "ACCOUNT",
    label: "Parent contact changed",
    description:
      "Tells the previous parent/guardian that a student changed the parent contact on their profile. Never includes the new details.",
    sentTo: "The previous parent/guardian email and phone; in-app, the student's own inbox",
    channels: ALL_CHANNELS,
    defaultChannels: ["EMAIL"],
    inAppLink: "/profile",
    variables: ["academy.name", "student.fullName"],
    defaults: {
      subject: "The parent contact on a {{academy.name}} account was changed",
      body: "The parent/guardian contact details on {{student.fullName}}'s {{academy.name}} account were changed.\n\nIf you expected this change, no action is needed.\nIf you did not, please contact the academy.",
      actionLabel: null,
      whatsappBody: null
    }
  },
  ACCOUNT_DELETION_COMPLETED: {
    key: "ACCOUNT_DELETION_COMPLETED",
    group: "ACCOUNT",
    label: "Account deleted",
    description: "Sent when staff complete a deletion request.",
    sentTo: "The person who asked",
    channels: ["EMAIL", "WHATSAPP"],
    defaultChannels: ["EMAIL"],
    channelNote: "No in-app: the account is deleted, so its inbox can't be opened.",
    variables: ["academy.name", "request.noteLine"],
    defaults: {
      subject: "Your account has been deleted",
      body: "As you asked, your {{academy.name}} account has been deleted. Invoices and payment records are kept as the law requires.\n\n{{request.noteLine}}",
      actionLabel: null,
      whatsappBody: null
    }
  },
  ACCOUNT_DELETION_DECLINED: {
    key: "ACCOUNT_DELETION_DECLINED",
    group: "ACCOUNT",
    label: "Account deletion declined",
    description: "Sent when staff decline a deletion request.",
    sentTo: "The person who asked",
    channels: ALL_CHANNELS,
    defaultChannels: ["EMAIL", "IN_APP"],
    inAppLink: "/profile",
    variables: ["academy.name", "request.noteLine"],
    defaults: {
      subject: "About your account deletion request",
      body: "Your request to delete your {{academy.name}} account was not completed.\n\n{{request.noteLine}}",
      actionLabel: null,
      whatsappBody: null
    }
  },
  INVOICE_EMAIL: {
    key: "INVOICE_EMAIL",
    group: "BILLING",
    label: "Invoice email",
    description: "The receipt, sent once a payment is verified. The PDF or download button is added automatically.",
    sentTo: "The billed customer",
    channels: ["EMAIL"],
    defaultChannels: ["EMAIL"],
    channelNote:
      "In-app and WhatsApp (with the PDF attached) for invoices are the \"Invoice issued\" rule under Rules, so a customer never gets two copies.",
    variables: [
      "academy.name",
      "customer.name",
      "invoice.number",
      "invoice.amount",
      "invoice.attachmentNote",
      "invoice.downloadNote",
      "seller.name",
      "support.line",
      "links.download"
    ],
    actionVariable: "links.download",
    defaults: {
      subject: "Your {{seller.name}} invoice {{invoice.number}}",
      body: "Hi {{customer.name}},\n\nThank you for your payment of {{invoice.amount}}.\nYour invoice {{invoice.number}} is ready. {{invoice.attachmentNote}}\n\nYou can also find it any time under Billing in your dashboard. {{invoice.downloadNote}}\n\n{{support.line}}",
      actionLabel: "Download invoice",
      whatsappBody: null
    }
  },
  DEMO_BOOKING: {
    key: "DEMO_BOOKING",
    group: "DEMO",
    label: "Demo booking received",
    description:
      "Confirms a booking made on the academy site's \"book a free demo\" form. No class is chosen yet; the class invitation follows once staff assign one.",
    sentTo: "The parent who booked (their email if they gave one, and their phone)",
    channels: ["EMAIL", "WHATSAPP"],
    defaultChannels: ["EMAIL", "WHATSAPP"],
    channelNote: NO_ACCOUNT,
    variables: DEMO_BOOKING_VARIABLES,
    defaults: {
      subject: "We've received your demo booking",
      body: "Hi {{lead.parentName}},\n\nThank you for booking a free demo class for {{lead.studentName}} with {{academy.name}}. Our team will contact you shortly to pick a time, and you'll get the class details and a join link once it's scheduled.\n\nSee you soon!",
      actionLabel: null,
      whatsappBody:
        "Hi {{lead.parentName}}, thank you for booking a free demo class for {{lead.studentName}} with {{academy.name}}. We'll contact you shortly to pick a time."
    }
  },
  DEMO_REGISTRATION: {
    key: "DEMO_REGISTRATION",
    group: "DEMO",
    label: "Demo registration",
    description: "Confirms a visitor's own registration for a demo class.",
    sentTo: "The guest, at the email or phone they registered with",
    channels: ["EMAIL", "WHATSAPP"],
    defaultChannels: ["EMAIL", "WHATSAPP"],
    channelNote: NO_ACCOUNT,
    variables: DEMO_VARIABLES,
    actionVariable: "links.join",
    defaults: {
      subject: "You're registered: {{demo.topic}}",
      body: "Hi {{guest.name}},\n\nYou're registered for the demo class \"{{demo.topic}}\", scheduled for {{demo.dateTime}}.\n\nSee you there!",
      actionLabel: "Join once it starts",
      whatsappBody: "Hi {{guest.name}}, you're registered for the demo class \"{{demo.topic}}\". We'll see you there!"
    }
  },
  DEMO_INVITATION: {
    key: "DEMO_INVITATION",
    group: "DEMO",
    label: "Demo invitation",
    description: "Sent when staff invite someone to a demo class (or assign a lead one). The join link is personal to them.",
    sentTo: "The invited guest, at their email or phone",
    channels: ["EMAIL", "WHATSAPP"],
    defaultChannels: ["EMAIL", "WHATSAPP"],
    channelNote: NO_ACCOUNT,
    variables: [...DEMO_VARIABLES, "guest.email"],
    actionVariable: "links.join",
    defaults: {
      subject: "You're invited: {{demo.topic}}",
      body: "Hi {{guest.name}},\n\nYou're invited to the demo class \"{{demo.topic}}\", scheduled for {{demo.dateTime}}.\n\nYour join link is personal to you. If it doesn't work, open the class page and enter this email address ({{guest.email}}).\n\nSee you there!",
      actionLabel: "Join once it starts",
      whatsappBody:
        "Hi {{guest.name}}, you're invited to the demo class \"{{demo.topic}}\". Your personal link — open it once the class starts: {{links.join}}"
    }
  },
  NEW_LEAD_ADMIN: {
    key: "NEW_LEAD_ADMIN",
    group: "ADMIN",
    label: "New demo booking",
    description: "Sent when someone books a demo on the academy site.",
    sentTo: "Email: the addresses in ADMIN_EMAILS. WhatsApp and in-app: the academy's admins and super admins",
    channels: ALL_CHANNELS,
    defaultChannels: ["EMAIL", "IN_APP"],
    inAppLink: "/admin/leads",
    variables: [
      "academy.name",
      "lead.studentName",
      "lead.studentAge",
      "lead.parentName",
      "lead.experience",
      "lead.phone",
      "lead.email",
      "lead.source",
      "lead.campaign"
    ],
    defaults: {
      subject: "New demo booking: {{lead.studentName}}",
      body: "A new demo class inquiry came in from the academy site.\n\nStudent: {{lead.studentName}} (age {{lead.studentAge}})\nParent: {{lead.parentName}}\nExperience: {{lead.experience}}\nPhone: {{lead.phone}}\nEmail: {{lead.email}}\nSource: {{lead.source}}\nCampaign: {{lead.campaign}}",
      actionLabel: null,
      whatsappBody: null
    }
  },
  ACCOUNT_DELETION_REQUESTED_ADMIN: {
    key: "ACCOUNT_DELETION_REQUESTED_ADMIN",
    group: "ADMIN",
    label: "Account deletion requested",
    description: "Sent when someone asks for their account to be deleted.",
    sentTo: "Email: the addresses in ADMIN_EMAILS. WhatsApp and in-app: the academy's admins and super admins",
    channels: ALL_CHANNELS,
    defaultChannels: ["EMAIL", "IN_APP"],
    inAppLink: "/admin/privacy",
    variables: ["academy.name", "requester.name", "requester.email", "requester.role", "request.reason"],
    defaults: {
      subject: "Account deletion requested: {{requester.name}}",
      body: "{{requester.name}} ({{requester.email}}, {{requester.role}}) asked for their account to be deleted.\n\nReason: {{request.reason}}\n\nReview it in Admin → Privacy.",
      actionLabel: null,
      whatsappBody: null
    }
  },
  TENANT_INTEGRITY_ALERT: {
    key: "TENANT_INTEGRITY_ALERT",
    group: "PLATFORM",
    label: "Tenant integrity alert",
    description:
      "Sent when the nightly integrity check finds rows that point at another academy's rows, or could not check some relationships. Monitoring only: nothing was blocked.",
    sentTo: "Nexa's platform operators (super admins)",
    platformOnly: true,
    channels: ALL_CHANNELS,
    defaultChannels: ["EMAIL", "IN_APP"],
    variables: ["academy.name", "integrity.violationCount", "integrity.linksChecked", "integrity.summary", "links.integrity"],
    requiredVariables: ["integrity.summary"],
    actionVariable: "links.integrity",
    defaults: {
      subject: "Tenant integrity check: {{integrity.violationCount}} cross-academy rows",
      body: "The nightly tenant integrity check went through {{integrity.linksChecked}} relationships and found {{integrity.violationCount}} rows that point at another academy's rows.\n\n{{integrity.summary}}\n\nThis is monitoring only: nothing was blocked or changed. Open the platform console to see every table, row id and academy.",
      actionLabel: "Open the integrity report",
      whatsappBody: null
    }
  }
};

/**
 * The WhatsApp text: the WhatsApp wording (else the body), with the action link appended as
 * "label: link" unless the text already contains it, so an edit can't drop the link.
 */
export function composeWhatsAppText(text: string, action: { label: string; url: string } | null): string {
  if (!action || text.includes(action.url)) return text;
  return `${text}\n\n${action.label}: ${action.url}`;
}

/** The channels on for a message: the admin's saved switches, else its defaults, never an unsupported one. */
export function effectiveSystemChannels(
  key: SystemMessageKey,
  saved: Partial<Record<SystemMessageChannel, boolean | null>> | null
): SystemMessageChannel[] {
  const definition = SYSTEM_MESSAGE_DEFINITIONS[key];
  return definition.channels.filter((channel) => saved?.[channel] ?? definition.defaultChannels.includes(channel));
}

/** Placeholders the message must keep but doesn't. Empty means it can be saved. */
export function findMissingRequiredVariables(key: SystemMessageKey, body: string): string[] {
  const used = new Set(extractTemplateVariables(body));
  return (SYSTEM_MESSAGE_DEFINITIONS[key].requiredVariables ?? []).filter((name) => !used.has(name));
}

/** Placeholders this message can't fill, so they send as empty. Used to warn admins. */
export function findUnknownSystemMessageVariables(key: SystemMessageKey, template: string): string[] {
  const known = new Set(SYSTEM_MESSAGE_DEFINITIONS[key].variables);
  return extractTemplateVariables(template).filter((name) => !known.has(name));
}

export interface SystemMessageItem {
  key: SystemMessageKey;
  subject: string;
  body: string;
  /** The academy's own WhatsApp wording. Null = the standard one (`defaults.whatsappBody`, else `body`). */
  whatsappBody: string | null;
  actionLabel: string | null;
  /** The channels switched on now (saved switches, else the defaults). */
  channels: SystemMessageChannel[];
  /** Approved WhatsApp template sent instead of free text (whatsapp-template.ts). Null name = free text. */
  whatsappTemplateName: string | null;
  whatsappTemplateLanguage: string | null;
  whatsappTemplateParams: string[];
  /** False while the default wording is in use. */
  isCustomized: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
}

export interface SystemMessageListResponse {
  messages: SystemMessageItem[];
  emailConfigured: boolean;
  whatsappConfigured: boolean;
}

export const updateSystemMessageRequestSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4096),
  /** Null = the standard WhatsApp text (`defaults.whatsappBody`, else `body`). */
  whatsappBody: z.string().trim().min(1).max(4096).nullable(),
  actionLabel: z.string().trim().min(1).max(60).nullable(),
  /** The channels to switch on; any the message doesn't support are refused. */
  channels: z.array(systemMessageChannelSchema).max(3),
  /**
   * Approved WhatsApp template (whatsapp-template.ts). Omitted = keep what is saved, so a client
   * that doesn't know these fields can't clear them; null / [] = no template, send free text.
   */
  whatsappTemplateName: z.string().trim().max(WHATSAPP_TEMPLATE_LIMITS.maxNameLength).nullable().optional(),
  whatsappTemplateLanguage: z.string().trim().max(20).nullable().optional(),
  whatsappTemplateParams: z
    .array(z.string().max(WHATSAPP_TEMPLATE_LIMITS.maxParamLength))
    .max(WHATSAPP_TEMPLATE_LIMITS.maxParams)
    .optional()
});
export type UpdateSystemMessageRequest = z.infer<typeof updateSystemMessageRequestSchema>;

export const testSystemMessageRequestSchema = z.object({
  /** Which channel to test. An email test goes to the admin's own address, in-app to their own inbox. */
  channel: systemMessageChannelSchema.default("EMAIL"),
  /** WhatsApp only. Defaults to the admin's own number. */
  phoneNumber: z.string().trim().max(30).optional()
});
export type TestSystemMessageRequest = z.infer<typeof testSystemMessageRequestSchema>;
