import { z } from "zod";

/** Version tag on every export, so a later shape change is detectable. */
export const PERSONAL_DATA_EXPORT_FORMAT = "nexa-personal-data/v1";

export type PersonalDataRecord = Record<string, unknown>;

/**
 * Everything the platform holds about the caller, as JSON. Secrets (password
 * hash, MFA secret, session and reset tokens) are never included, nor are
 * actions the caller took on other people's records as staff.
 */
export type PersonalDataExport = {
  format: typeof PERSONAL_DATA_EXPORT_FORMAT;
  exportedAt: string;
  account: PersonalDataRecord;
  /** One array per kind of record; an empty array means none exist. */
  sections: Record<string, PersonalDataRecord[]>;
};

// ── Account deletion requests ──

export const accountDeletionStatusSchema = z.enum(["PENDING", "COMPLETED", "REJECTED", "WITHDRAWN"]);
export type AccountDeletionStatus = z.infer<typeof accountDeletionStatusSchema>;

export const ACCOUNT_DELETION_STATUS_LABELS: Record<AccountDeletionStatus, string> = {
  COMPLETED: "Deleted",
  PENDING: "Waiting for review",
  REJECTED: "Declined",
  WITHDRAWN: "Withdrawn"
};

export type AccountDeletionRequestItem = {
  id: string;
  status: AccountDeletionStatus;
  /** Null once the purge has removed the account; the snapshot fields remain. */
  userId: string | null;
  userEmail: string;
  userName: string;
  userRole: string;
  reason: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  createdAt: string;
};

export type MyAccountDeletionResponse = { request: AccountDeletionRequestItem | null };
export type AccountDeletionRequestListResponse = { requests: AccountDeletionRequestItem[] };
export type AccountDeletionRequestResponse = { request: AccountDeletionRequestItem };

/** The password proves a stolen session alone can't ask to delete the account. */
export const createAccountDeletionRequestSchema = z.object({
  currentPassword: z.string().min(1, "Enter your password."),
  reason: z.string().trim().max(1000).optional()
});
export type CreateAccountDeletionRequest = z.infer<typeof createAccountDeletionRequestSchema>;

export const resolveAccountDeletionRequestSchema = z.object({
  note: z.string().trim().max(1000).optional()
});
export type ResolveAccountDeletionRequest = z.infer<typeof resolveAccountDeletionRequestSchema>;

export const rejectAccountDeletionRequestSchema = z.object({
  note: z.string().trim().min(1, "Say why, so the user can be told.").max(1000)
});
export type RejectAccountDeletionRequest = z.infer<typeof rejectAccountDeletionRequestSchema>;
