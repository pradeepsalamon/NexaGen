/**
 * The mail background queue.
 *
 * A feature module owns its queue name (there is no central registry — see
 * docs/INFRASTRUCTURE.md), so the constant and its job payloads live here
 * beside the producer (`MailService`) and the processor that use them.
 */
export const MAIL_QUEUE = "mail";

export const MAIL_JOBS = {
  passwordReset: "password-reset"
} as const;

export type PasswordResetJob = {
  to: string;
  resetLink: string;
};
