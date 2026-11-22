import { z } from "zod";
import type { PaginationMeta } from "./index";

/**
 * Closing an academy (docs/ACADEMY_CLOSURE.md). Owner's call (2026-11-21):
 * it happens only when the academy asks, and the academy chooses to keep its
 * data (closed, can be reopened) or to delete it. A platform operator approves.
 * Deleting waits ACADEMY_CLOSURE_UNDO_DAYS, then a purge erases everything
 * except the financial records the law requires to be kept.
 */

/** Days between approving "delete" and the purge, during which an operator can cancel it. */
export const ACADEMY_CLOSURE_UNDO_DAYS = 7;

export const tenantClosureChoiceSchema = z.enum(["KEEP_DATA", "DELETE_DATA"]);
export type TenantClosureChoice = z.infer<typeof tenantClosureChoiceSchema>;

export const tenantClosureStatusSchema = z.enum([
  "REQUESTED",
  "WITHDRAWN",
  "DECLINED",
  "CLOSED",
  "PURGE_SCHEDULED",
  "PURGING",
  "PURGED",
  "CANCELLED",
  "REOPENED"
]);
export type TenantClosureStatus = z.infer<typeof tenantClosureStatusSchema>;

/** Statuses of a closure still in play (one per academy at a time). */
export const OPEN_CLOSURE_STATUSES: readonly TenantClosureStatus[] = ["REQUESTED", "PURGE_SCHEDULED", "PURGING"];

export const TENANT_CLOSURE_CHOICE_LABELS: Record<TenantClosureChoice, string> = {
  DELETE_DATA: "Delete everything (invoices and payments are kept as the law requires)",
  KEEP_DATA: "Keep our data (the academy is closed and can be reopened later)"
};

export const TENANT_CLOSURE_STATUS_LABELS: Record<TenantClosureStatus, string> = {
  CANCELLED: "Deletion cancelled (closed, data kept)",
  CLOSED: "Closed, data kept",
  DECLINED: "Declined",
  PURGED: "Data deleted",
  PURGE_SCHEDULED: "Closed, deletion scheduled",
  PURGING: "Deleting data",
  REOPENED: "Reopened",
  REQUESTED: "Waiting for the platform",
  WITHDRAWN: "Withdrawn"
};

const note = z.string().trim().max(2000);

/**
 * Typed back to confirm: the academy's exact name (any case, spaces trimmed).
 * Checked by the API against the stored name with `closureNameMatches`.
 */
const confirmName = z.string().trim().min(1, "Type the academy's name to confirm.").max(200);

export function closureNameMatches(typed: string, academyName: string): boolean {
  return typed.trim().toLowerCase() === academyName.trim().toLowerCase();
}

/** The academy's super admin asks to close it. */
export const requestAcademyClosureSchema = z.object({
  choice: tenantClosureChoiceSchema,
  confirmName,
  reason: note.min(1, "Tell us why the academy is closing.")
});
export type RequestAcademyClosureRequest = z.infer<typeof requestAcademyClosureSchema>;

/** An operator records a request the academy made by email or phone and decides it at once. */
export const operatorCloseAcademySchema = z.object({
  choice: tenantClosureChoiceSchema,
  confirmName,
  reason: note.min(1, "Write down how and when the academy asked.")
});
export type OperatorCloseAcademyRequest = z.infer<typeof operatorCloseAcademySchema>;

export const approveClosureSchema = z.object({ confirmName, note: note.optional() });
export type ApproveClosureRequest = z.infer<typeof approveClosureSchema>;

export const closureNoteSchema = z.object({ note: note.min(1, "Add a short note for the record.") });
export type ClosureNoteRequest = z.infer<typeof closureNoteSchema>;

export type TenantClosureSummary = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  choice: TenantClosureChoice;
  status: TenantClosureStatus;
  reason: string | null;
  requestedByName: string | null;
  requestedByEmail: string | null;
  requestedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  purgeAfter: string | null;
  purgedAt: string | null;
  purgeReport: AcademyPurgeReport | null;
};

/** What the purge did, table by table (stored on the closure). */
export type AcademyPurgeReport = {
  deletedRows: number;
  /** Rows still there, by table: the kept financial records and what they point at. */
  keptRows: Record<string, number>;
  anonymisedUsers: number;
  /**
   * Rows labelled with another academy that point at this academy's kept rows
   * (`table.column` → count). They keep those rows alive and are never deleted
   * here; a non-zero count is also a tenant integrity finding.
   */
  crossAcademyLinks: Record<string, number>;
  deletedFiles: number;
  /** Uploaded files that couldn't be removed from storage (ids only). */
  fileErrors: number;
  passes: number;
  startedAt: string;
  finishedAt: string;
};

export type AcademyClosureResponse = { closure: TenantClosureSummary | null };
export type TenantClosureResponse = { closure: TenantClosureSummary };
export type TenantClosuresResponse = { closures: TenantClosureSummary[]; pagination: PaginationMeta };

/** First line of an academy export (gzip, one JSON object per line). */
export type AcademyExportHeader = {
  format: "nexa-academy-export";
  version: 1;
  exportedAt: string;
  tenant: { id: string; name: string; slug: string };
  /** Column names left out of every row because they hold secrets (password hashes, tokens, keys). */
  redactedColumns: string[];
};
/** Every other line: one row of one table. */
export type AcademyExportLine = { table: string; row: Record<string, unknown> };
