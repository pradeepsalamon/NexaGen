import type { RetentionCategory } from "@nexa-chess/types";

/** A table and the timestamp column its age is measured on. */
export type RetentionTarget = {
  /** Postgres table, as mapped in schema.prisma. */
  table: string;
  /** `timestamp WITHOUT time zone` column compared with the cutoff. */
  column: string;
  /** Extra SQL condition on alias `t`. Rows it excludes are never deleted. */
  where?: string;
};

export type RetentionRule = RetentionTarget & { days: number };

/** Fixed operational windows: rows nothing reads once they age out. */
export type FixedRetentionRuleDef = RetentionRule & { label: string };

export const RETENTION_RULES: readonly FixedRetentionRuleDef[] = [
  // `refresh` only matches rows with expiresAt in the future, and a rotation
  // chain inherits its first row's expiry, so expired rows are dead weight.
  { column: "expiresAt", days: 1, label: "Expired sign-in sessions", table: "auth_sessions" },
  { column: "expiresAt", days: 1, label: "Expired password reset links", table: "password_reset_tokens" },
  { column: "expiresAt", days: 1, label: "Expired email verification links", table: "email_verification_tokens" },
  // LiveKit dedupe only matters while it is still retrying (minutes).
  { column: "processedAt", days: 30, label: "Video webhook dedupe records", table: "processed_webhook_events" },
  // Anonymous IP/user-agent rows; a lead's attribution keeps its own.
  {
    column: "lastVisit",
    days: 180,
    label: "Website visit records (unless a demo was booked)",
    table: "visitor_sessions",
    where: `NOT EXISTS (SELECT 1 FROM "leads" l WHERE l."visitorSessionId" = t."id")`
  },
  // Help-centre searches (free text typed by students, who are minors): only
  // the recent window feeds the unanswered inbox and topic trends.
  { column: "createdAt", days: 90, label: "Help-centre searches", table: "knowledge_search_logs" },
  { column: "createdAt", days: 365, label: "Emails sent by staff", table: "direct_emails" }
];

/**
 * What each admin-set category deletes. The window comes from the
 * `retention_policies` row; no row or `days` null means kept forever.
 */
export const RETENTION_CATEGORY_TARGETS: Record<RetentionCategory, RetentionTarget> = {
  ANALYTICS_EVENTS: { column: "occurredAt", table: "analytics_events" },
  CHAT_MESSAGES: { column: "createdAt", table: "chat_messages" },
  LIVE_CHAT_MESSAGES: { column: "createdAt", table: "live_chat_messages" },
  // A queued message (PENDING, maybe scheduled for later) is outbox work, not
  // log, and its dedupe key is what stops a double send.
  MESSAGE_DELIVERIES: { column: "createdAt", table: "message_deliveries", where: `t."status" <> 'PENDING'` },
  NOTIFICATIONS: { column: "createdAt", table: "notifications" }
};

export const RETENTION_BATCH_SIZE = 5000;

/** The sweep runs daily at this hour, UTC. */
export const RETENTION_SWEEP_HOUR_UTC = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Naive-UTC ISO text for the cutoff. Bind it as `$1::timestamp`, never as a
 * Date (CLAUDE.md §3.4).
 */
export function retentionCutoff(days: number, now: Date): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

export function nextRetentionSweep(now: Date): Date {
  const next = new Date(now);
  next.setUTCHours(RETENTION_SWEEP_HOUR_UTC, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

const extra = (target: RetentionTarget) => (target.where ? ` AND ${target.where}` : "");

/** `$1` = cutoff. Deletes at most one batch; repeat until it comes back short. */
export function deleteBatchSql(target: RetentionTarget): string {
  return (
    `DELETE FROM "${target.table}" WHERE "id" IN (` +
    `SELECT t."id" FROM "${target.table}" t WHERE t."${target.column}" < $1::timestamp${extra(target)} ` +
    `LIMIT ${RETENTION_BATCH_SIZE})`
  );
}

/** `$1` = cutoff. */
export function countEligibleSql(target: RetentionTarget): string {
  return (
    `SELECT count(*)::bigint AS "count" FROM "${target.table}" t ` +
    `WHERE t."${target.column}" < $1::timestamp${extra(target)}`
  );
}

/** The oldest row the sweep could ever reach (honours `where`). */
export function oldestRecordSql(target: RetentionTarget): string {
  const where = target.where ? ` WHERE ${target.where}` : "";
  return `SELECT min(t."${target.column}") AS "oldest" FROM "${target.table}" t${where}`;
}
