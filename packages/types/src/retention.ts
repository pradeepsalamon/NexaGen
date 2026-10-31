import { z } from "zod";

// Data retention (docs/INFRASTRUCTURE.md "Retention"). Two kinds of rule:
//  - fixed operational windows in code (expired sessions, webhook dedupe, ...);
//  - one admin-set window per category below. A category with no window is
//    kept forever, which is also the default: nothing is deleted until a
//    super admin chooses a window.
// The nightly sweep deletes for good. Nothing goes through Trash.

export const retentionCategorySchema = z.enum([
  "CHAT_MESSAGES",
  "LIVE_CHAT_MESSAGES",
  "NOTIFICATIONS",
  "MESSAGE_DELIVERIES",
  "ANALYTICS_EVENTS"
]);
export type RetentionCategory = z.infer<typeof retentionCategorySchema>;

export const RETENTION_MAX_DAYS = 3650;

export type RetentionCategoryInfo = {
  label: string;
  /** What the records are. */
  description: string;
  /** What is lost when they go. Shown before saving. */
  impact: string;
  /** Below this, something the app still reads would break. */
  minDays: number;
  /** Offered as a one-click choice. */
  recommendedDays: number;
};

export const RETENTION_CATALOGUE: Record<RetentionCategory, RetentionCategoryInfo> = {
  CHAT_MESSAGES: {
    description: "Messages in batch threads, direct messages and coach groups (Messages page).",
    impact: "Older messages disappear from every thread and from data exports.",
    label: "Chat messages",
    minDays: 30,
    recommendedDays: 365
  },
  LIVE_CHAT_MESSAGES: {
    description: "Room and private messages sent during live classes.",
    impact: "The chat history of older classes is gone.",
    label: "Live class chat",
    minDays: 30,
    recommendedDays: 180
  },
  NOTIFICATIONS: {
    description: "In-app notifications under the bell (read and unread).",
    impact: "Older notifications disappear from the bell.",
    label: "In-app notifications",
    minDays: 30,
    recommendedDays: 90
  },
  MESSAGE_DELIVERIES: {
    description: "The log of sent, failed and skipped messages (Messaging → Deliveries). Queued messages are never deleted.",
    impact: "The delivery log only goes back this far.",
    label: "Message delivery log",
    minDays: 30,
    recommendedDays: 180
  },
  ANALYTICS_EVENTS: {
    description: "Activity events behind the engagement analytics (logins, class joins, submissions, recording views).",
    impact: "Engagement charts show no activity before the window. Active-user counts need at least the last 30 days.",
    label: "Activity analytics",
    minDays: 90,
    recommendedDays: 400
  }
};

/** The one validation rule for a window, shared by the API and the form. Null = no error. */
export function retentionDaysError(category: RetentionCategory, days: number | null): string | null {
  if (days === null) return null;
  const { minDays } = RETENTION_CATALOGUE[category];
  if (!Number.isInteger(days)) return "Use a whole number of days.";
  if (days < minDays) return `Keep at least ${minDays} days.`;
  if (days > RETENTION_MAX_DAYS) return `At most ${RETENTION_MAX_DAYS} days.`;
  return null;
}

export const updateRetentionPolicySchema = z.object({
  /** null = keep forever. */
  days: z.number().int().min(1).max(RETENTION_MAX_DAYS).nullable()
});
export type UpdateRetentionPolicyRequest = z.infer<typeof updateRetentionPolicySchema>;

export const retentionPreviewQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(RETENTION_MAX_DAYS)
});
export type RetentionPreviewQuery = z.infer<typeof retentionPreviewQuerySchema>;

export type RetentionPolicyItem = {
  category: RetentionCategory;
  /** null = kept forever. */
  days: number | null;
  /** ISO; the oldest record still stored, null when there are none. */
  oldestRecordAt: string | null;
  /** Records the saved window would delete at the next sweep; null when kept forever. */
  eligibleCount: number | null;
  /** ISO; the last sweep that applied this window. */
  lastSweptAt: string | null;
  lastDeletedCount: number | null;
  /** ISO; null while the default (kept forever) was never changed. */
  updatedAt: string | null;
  updatedByName: string | null;
};

/** A window fixed in code, listed so admins see everything that is deleted. */
export type FixedRetentionRule = {
  label: string;
  days: number;
};

export type RetentionPolicyListResponse = {
  policies: RetentionPolicyItem[];
  fixedRules: FixedRetentionRule[];
  /** ISO; when the nightly sweep runs next. */
  nextSweepAt: string;
};

export type RetentionPreviewResponse = {
  category: RetentionCategory;
  days: number;
  /** ISO; records created before this are deleted. */
  cutoff: string;
  eligibleCount: number;
};
