import { z } from "zod";
import type { PaginationMeta, UserRole } from "./index";

export const emailVerificationPolicySchema = z.enum(["OFF", "OPTIONAL", "REQUIRED"]);
export type EmailVerificationPolicy = z.infer<typeof emailVerificationPolicySchema>;

export const updateEmailVerificationPolicyRequestSchema = z.object({
  policy: emailVerificationPolicySchema
});
export type UpdateEmailVerificationPolicyRequest = z.infer<typeof updateEmailVerificationPolicyRequestSchema>;

export const setEmailVerifiedRequestSchema = z.object({ verified: z.boolean() });
export type SetEmailVerifiedRequest = z.infer<typeof setEmailVerifiedRequestSchema>;

export const DIRECT_EMAIL_SUBJECT_MAX = 200;
export const DIRECT_EMAIL_BODY_MAX = 20_000;
/** One compose sends one email per person, one at a time. */
export const DIRECT_EMAIL_MAX_RECIPIENTS = 50;

export const sendDirectEmailRequestSchema = z.object({
  body: z.string().trim().min(1, "Write a message.").max(DIRECT_EMAIL_BODY_MAX),
  subject: z
    .string()
    .trim()
    .min(1, "Add a subject.")
    .max(DIRECT_EMAIL_SUBJECT_MAX)
    .regex(/^[^\r\n]*$/, "The subject must be one line.")
});
export type SendDirectEmailRequest = z.infer<typeof sendDirectEmailRequestSchema>;

export type DirectEmailStatus = "PENDING" | "SENT" | "FAILED";

export type DirectEmailDto = {
  body: string;
  createdAt: string;
  error: string | null;
  id: string;
  recipientName: string;
  senderName: string | null;
  sentAt: string | null;
  status: DirectEmailStatus;
  subject: string;
  toEmail: string;
};

export type DirectEmailListResponse = {
  emails: DirectEmailDto[];
  pagination: PaginationMeta;
};

export type EmailAdminOverviewResponse = {
  policy: EmailVerificationPolicy;
  smtpConfigured: boolean;
  /** Students and coaches who could sign in but have not verified. Admins are never asked to. */
  unverifiedCount: number;
};

export type UnverifiedAccountDto = {
  email: string;
  id: string;
  name: string;
  role: string;
  status: string;
};

export type UnverifiedAccountListResponse = {
  accounts: UnverifiedAccountDto[];
  pagination: PaginationMeta;
};

export type EmailVerificationStatusResponse = {
  isEmailVerified: boolean;
  policy: EmailVerificationPolicy;
};

/**
 * What a non-essential email is about, so a person can stop one kind and keep the rest
 * (docs/MESSAGING.md "Email channel"). Every messaging-rule event has one
 * (`MESSAGING_EVENT_EMAIL_CATEGORY`); `ACADEMY_TEAM` is email staff write at `/admin/email`.
 * System emails (password reset, verification, invoices) have none and always send.
 */
export const emailCategorySchema = z.enum([
  "CLASSES",
  "HOMEWORK",
  "ANNOUNCEMENTS",
  "ACCOUNT",
  "REFERRALS",
  "ACADEMY_TEAM"
]);
export type EmailCategory = z.infer<typeof emailCategorySchema>;
export const EMAIL_CATEGORIES = emailCategorySchema.options;

export const EMAIL_CATEGORY_DEFINITIONS: Record<EmailCategory, { description: string; label: string }> = {
  ACADEMY_TEAM: {
    description: "Emails someone at the academy writes to you.",
    label: "Messages from the academy team"
  },
  ACCOUNT: {
    description: "Sign-up decisions, payments, refunds, payroll and requests you made or need to decide.",
    label: "Account, payments and requests"
  },
  ANNOUNCEMENTS: {
    description: "Announcements and tournaments.",
    label: "Announcements and tournaments"
  },
  CLASSES: {
    description: "New, moved and cancelled classes, and class reminders.",
    label: "Classes"
  },
  HOMEWORK: {
    description: "New homework, due dates, marks and revision reminders.",
    label: "Homework and revision"
  },
  REFERRALS: {
    description: "Your referrals' progress, rewards, points and vouchers.",
    label: "Referrals"
  }
};

/**
 * The kinds a person can be sent, so their settings list only those. A SALES
 * account only refers people (docs/REFERRALS.md § "The SALES role"): no
 * classes, homework or announcements reach it.
 */
export function emailCategoriesForRole(role: UserRole | undefined): readonly EmailCategory[] {
  return role === "SALES" ? ["ACCOUNT", "REFERRALS", "ACADEMY_TEAM"] : EMAIL_CATEGORIES;
}

/** A person's own choice about non-essential email. System emails always send. */
export type EmailPreferencesDto = {
  /** Kinds turned off on their own; empty when all are on. Ignored while `notificationEmails` is false. */
  disabledCategories: EmailCategory[];
  /** The master switch: false stops every category. */
  notificationEmails: boolean;
};

export const updateEmailPreferencesRequestSchema = z
  .object({
    disabledCategories: z.array(emailCategorySchema).max(EMAIL_CATEGORIES.length).optional(),
    notificationEmails: z.boolean().optional()
  })
  .refine((body) => body.disabledCategories !== undefined || body.notificationEmails !== undefined, {
    message: "Nothing to change."
  });
export type UpdateEmailPreferencesRequest = z.infer<typeof updateEmailPreferencesRequestSchema>;

/** The link in an email: it changes the setting without signing in. */
export const emailUnsubscribeRequestSchema = z.object({
  /** With a category, only that kind changes; without one, the master switch. */
  category: emailCategorySchema.optional(),
  /** False (the default) turns the emails off; true turns them back on from the same page. */
  notificationEmails: z.boolean().default(false),
  token: z.string().trim().min(20).max(200)
});
export type EmailUnsubscribeRequest = z.infer<typeof emailUnsubscribeRequestSchema>;

/** RFC 8058 one-click unsubscribe: the mail app POSTs to the header's link (query string only). */
export const emailOneClickQuerySchema = z.object({
  category: emailCategorySchema.optional(),
  token: z.string().trim().min(20).max(200)
});
export type EmailOneClickQuery = z.infer<typeof emailOneClickQuerySchema>;

/** Admin → Email → Opted out: someone who turned off some or all non-essential email. */
export type EmailOptOutAccountDto = {
  disabledCategories: EmailCategory[];
  email: string;
  id: string;
  name: string;
  /** False = everything off (the master switch). */
  notificationEmails: boolean;
  /** When they turned the master switch off; null while it is on. */
  optedOutAt: string | null;
  role: string;
};

export type EmailOptOutListResponse = {
  accounts: EmailOptOutAccountDto[];
  pagination: PaginationMeta;
};

export const EMAIL_UNSUBSCRIBE_PATH = "/unsubscribe";
