import { z } from "zod";
import type { PaginationMeta } from "./index";

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
