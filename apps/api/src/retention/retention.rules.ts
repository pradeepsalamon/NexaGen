/**
 * Operational rows nothing reads once they age out. Business and audit records
 * (chat, notifications, message deliveries, analytics, payment webhooks) are
 * deliberately not here — their retention is a policy decision, not cleanup.
 */
export type RetentionRule = {
  /** Postgres table, as mapped in schema.prisma. */
  table: string;
  /** `timestamp WITHOUT time zone` column compared with the cutoff. */
  column: string;
  days: number;
  /** Extra SQL condition on alias `t`. */
  where?: string;
};

export const RETENTION_RULES: readonly RetentionRule[] = [
  // `refresh` only matches rows with expiresAt in the future, and a rotation
  // chain inherits its first row's expiry, so expired rows are dead weight.
  { column: "expiresAt", days: 1, table: "auth_sessions" },
  { column: "expiresAt", days: 1, table: "password_reset_tokens" },
  { column: "expiresAt", days: 1, table: "email_verification_tokens" },
  // LiveKit dedupe only matters while it is still retrying (minutes).
  { column: "processedAt", days: 30, table: "processed_webhook_events" },
  // Anonymous IP/user-agent rows; a lead's attribution keeps its own.
  {
    column: "lastVisit",
    days: 180,
    table: "visitor_sessions",
    where: `NOT EXISTS (SELECT 1 FROM "leads" l WHERE l."visitorSessionId" = t."id")`
  },
  // Help-centre searches (free text typed by students, who are minors): only
  // the recent window feeds the unanswered inbox and topic trends.
  { column: "createdAt", days: 90, table: "knowledge_search_logs" }
];

export const RETENTION_BATCH_SIZE = 5000;
