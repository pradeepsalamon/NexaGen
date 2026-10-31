import { z } from "zod";
import { extractTemplateVariables } from "./messaging";

// The fixed messages the platform sends outside the rules: sign-in emails,
// receipts, demo-class invites and notices to staff. Each can be reworded by an
// admin; its trigger and recipient cannot be changed. No saved row means the
// default below is used.

export const systemMessageKeySchema = z.enum([
  "PASSWORD_RESET",
  "EMAIL_VERIFICATION",
  "EMAIL_CHANGED",
  "ACCOUNT_DELETION_COMPLETED",
  "ACCOUNT_DELETION_DECLINED",
  "INVOICE_EMAIL",
  "DEMO_REGISTRATION_EMAIL",
  "DEMO_REGISTRATION_WHATSAPP",
  "DEMO_INVITATION_EMAIL",
  "DEMO_INVITATION_WHATSAPP",
  "NEW_LEAD_ADMIN",
  "ACCOUNT_DELETION_REQUESTED_ADMIN"
]);
export type SystemMessageKey = z.infer<typeof systemMessageKeySchema>;

export const SYSTEM_MESSAGE_KEYS = systemMessageKeySchema.options;

export type SystemMessageChannel = "EMAIL" | "WHATSAPP";
export type SystemMessageGroup = "ACCOUNT" | "BILLING" | "DEMO" | "ADMIN";

export const SYSTEM_MESSAGE_GROUP_LABELS: Record<SystemMessageGroup, string> = {
  ACCOUNT: "Sign-in and account",
  BILLING: "Billing",
  DEMO: "Demo classes",
  ADMIN: "Sent to admins"
};

export interface SystemMessageDefinition {
  key: SystemMessageKey;
  group: SystemMessageGroup;
  channel: SystemMessageChannel;
  label: string;
  description: string;
  /** Who receives it, in plain words. */
  sentTo: string;
  variables: readonly string[];
  /** A body that drops one of these would be useless, so the API refuses to save it. */
  requiredVariables?: readonly string[];
  /** A button added below the email. The code adds it, so an edit can't lose the link. */
  actionVariable?: string;
  defaults: { subject: string | null; body: string; actionLabel: string | null };
}

const DEMO_VARIABLES = ["academy.name", "guest.name", "demo.topic", "demo.dateTime", "links.join"];

export const SYSTEM_MESSAGE_DEFINITIONS: Record<SystemMessageKey, SystemMessageDefinition> = {
  PASSWORD_RESET: {
    key: "PASSWORD_RESET",
    group: "ACCOUNT",
    channel: "EMAIL",
    label: "Password reset",
    description: "Sent when someone asks to reset their password.",
    sentTo: "The person who asked",
    variables: ["academy.name", "links.reset"],
    actionVariable: "links.reset",
    defaults: {
      subject: "Reset your {{academy.name}} password",
      body: "Use the button below to choose a new password. This link expires in 30 minutes.\n\nIf you did not request it, you can ignore this email.",
      actionLabel: "Reset password"
    }
  },
  EMAIL_VERIFICATION: {
    key: "EMAIL_VERIFICATION",
    group: "ACCOUNT",
    channel: "EMAIL",
    label: "Email verification",
    description: "Sent when an address needs confirming. Depends on the policy at Admin → Email.",
    sentTo: "The person signing up",
    variables: ["academy.name", "links.verify"],
    actionVariable: "links.verify",
    defaults: {
      subject: "Verify your {{academy.name}} email address",
      body: "Welcome to {{academy.name}}! Please verify your email address using the button below. This link expires in 24 hours.\n\nIf you did not create an account, you can ignore this email.",
      actionLabel: "Verify email address"
    }
  },
  EMAIL_CHANGED: {
    key: "EMAIL_CHANGED",
    group: "ACCOUNT",
    channel: "EMAIL",
    label: "Email address changed",
    description: "Warns the old address that the account's email changed, so a hijacked account's owner finds out.",
    sentTo: "The account's old email address",
    variables: ["academy.name", "email.new"],
    defaults: {
      subject: "Your {{academy.name}} email address was changed",
      body: "The email address on your {{academy.name}} account was changed to {{email.new}}.\n\nIf you made this change, no action is needed.\nIf you did not, contact the academy immediately: someone else may have access to your account.",
      actionLabel: null
    }
  },
  ACCOUNT_DELETION_COMPLETED: {
    key: "ACCOUNT_DELETION_COMPLETED",
    group: "ACCOUNT",
    channel: "EMAIL",
    label: "Account deleted",
    description: "Sent when staff complete a deletion request.",
    sentTo: "The person who asked",
    variables: ["academy.name", "request.noteLine"],
    defaults: {
      subject: "Your account has been deleted",
      body: "As you asked, your {{academy.name}} account has been deleted. Invoices and payment records are kept as the law requires.\n\n{{request.noteLine}}",
      actionLabel: null
    }
  },
  ACCOUNT_DELETION_DECLINED: {
    key: "ACCOUNT_DELETION_DECLINED",
    group: "ACCOUNT",
    channel: "EMAIL",
    label: "Account deletion declined",
    description: "Sent when staff decline a deletion request.",
    sentTo: "The person who asked",
    variables: ["academy.name", "request.noteLine"],
    defaults: {
      subject: "About your account deletion request",
      body: "Your request to delete your {{academy.name}} account was not completed.\n\n{{request.noteLine}}",
      actionLabel: null
    }
  },
  INVOICE_EMAIL: {
    key: "INVOICE_EMAIL",
    group: "BILLING",
    channel: "EMAIL",
    label: "Invoice email",
    description: "The receipt, sent once a payment is verified. The PDF or download button is added automatically.",
    sentTo: "The billed customer",
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
      actionLabel: "Download invoice"
    }
  },
  DEMO_REGISTRATION_EMAIL: {
    key: "DEMO_REGISTRATION_EMAIL",
    group: "DEMO",
    channel: "EMAIL",
    label: "Demo registration (email)",
    description: "Confirms a visitor's own registration for a demo class.",
    sentTo: "The guest",
    variables: DEMO_VARIABLES,
    actionVariable: "links.join",
    defaults: {
      subject: "You're registered: {{demo.topic}}",
      body: "Hi {{guest.name}},\n\nYou're registered for the demo class \"{{demo.topic}}\", scheduled for {{demo.dateTime}}.\n\nSee you there!",
      actionLabel: "Join once it starts"
    }
  },
  DEMO_REGISTRATION_WHATSAPP: {
    key: "DEMO_REGISTRATION_WHATSAPP",
    group: "DEMO",
    channel: "WHATSAPP",
    label: "Demo registration (WhatsApp)",
    description: "The same confirmation for a guest who gave a phone number instead of an email address.",
    sentTo: "The guest",
    variables: DEMO_VARIABLES,
    defaults: {
      subject: null,
      body: "Hi {{guest.name}}, you're registered for the demo class \"{{demo.topic}}\". We'll see you there!",
      actionLabel: null
    }
  },
  DEMO_INVITATION_EMAIL: {
    key: "DEMO_INVITATION_EMAIL",
    group: "DEMO",
    channel: "EMAIL",
    label: "Demo invitation (email)",
    description: "Sent when staff invite someone to a demo class. The join link is personal to them.",
    sentTo: "The invited guest",
    variables: [...DEMO_VARIABLES, "guest.email"],
    actionVariable: "links.join",
    defaults: {
      subject: "You're invited: {{demo.topic}}",
      body: "Hi {{guest.name}},\n\nYou're invited to the demo class \"{{demo.topic}}\", scheduled for {{demo.dateTime}}.\n\nYour join link is personal to you. If it doesn't work, open the class page and enter this email address ({{guest.email}}).\n\nSee you there!",
      actionLabel: "Join once it starts"
    }
  },
  DEMO_INVITATION_WHATSAPP: {
    key: "DEMO_INVITATION_WHATSAPP",
    group: "DEMO",
    channel: "WHATSAPP",
    label: "Demo invitation (WhatsApp)",
    description: "The same invitation for a guest with a phone number. It must include the join link.",
    sentTo: "The invited guest",
    variables: DEMO_VARIABLES,
    requiredVariables: ["links.join"],
    defaults: {
      subject: null,
      body: "Hi {{guest.name}}, you're invited to the demo class \"{{demo.topic}}\". Your personal link — open it once the class starts: {{links.join}}",
      actionLabel: null
    }
  },
  NEW_LEAD_ADMIN: {
    key: "NEW_LEAD_ADMIN",
    group: "ADMIN",
    channel: "EMAIL",
    label: "New demo booking",
    description: "Sent when someone books a demo on the academy site.",
    sentTo: "Addresses in ADMIN_EMAILS",
    variables: [
      "academy.name",
      "lead.studentName",
      "lead.studentAge",
      "lead.parentName",
      "lead.experience",
      "lead.phone",
      "lead.source",
      "lead.campaign"
    ],
    defaults: {
      subject: "New demo booking: {{lead.studentName}}",
      body: "A new demo class inquiry came in from the academy site.\n\nStudent: {{lead.studentName}} (age {{lead.studentAge}})\nParent: {{lead.parentName}}\nExperience: {{lead.experience}}\nPhone: {{lead.phone}}\nSource: {{lead.source}}\nCampaign: {{lead.campaign}}",
      actionLabel: null
    }
  },
  ACCOUNT_DELETION_REQUESTED_ADMIN: {
    key: "ACCOUNT_DELETION_REQUESTED_ADMIN",
    group: "ADMIN",
    channel: "EMAIL",
    label: "Account deletion requested",
    description: "Sent when someone asks for their account to be deleted.",
    sentTo: "Addresses in ADMIN_EMAILS",
    variables: ["academy.name", "requester.name", "requester.email", "requester.role", "request.reason"],
    defaults: {
      subject: "Account deletion requested: {{requester.name}}",
      body: "{{requester.name}} ({{requester.email}}, {{requester.role}}) asked for their account to be deleted.\n\nReason: {{request.reason}}\n\nReview it in Admin → Privacy.",
      actionLabel: null
    }
  }
};

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
  subject: string | null;
  body: string;
  actionLabel: string | null;
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
  subject: z.string().trim().min(1).max(200).nullable(),
  body: z.string().trim().min(1).max(4096),
  actionLabel: z.string().trim().min(1).max(60).nullable()
});
export type UpdateSystemMessageRequest = z.infer<typeof updateSystemMessageRequestSchema>;

export const testSystemMessageRequestSchema = z.object({
  /** WhatsApp only. Defaults to the admin's own number. An email test goes to their account. */
  phoneNumber: z.string().trim().max(30).optional()
});
export type TestSystemMessageRequest = z.infer<typeof testSystemMessageRequestSchema>;
