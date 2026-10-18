/**
 * The `type` values written to `analytics_events`. Kept as a plain const map
 * (the column is an unconstrained string, matching the codebase convention for
 * `LiveSession.status`, `CoachAttendanceLog.eventType`, etc.).
 */
export const ANALYTICS_EVENT_TYPES = {
  LOGIN: "LOGIN",
  CLASS_JOIN: "CLASS_JOIN",
  ASSIGNMENT_ATTEMPT: "ASSIGNMENT_ATTEMPT",
  PUZZLE_ATTEMPT: "PUZZLE_ATTEMPT",
  RECORDING_WATCH: "RECORDING_WATCH",
  DASHBOARD_VIEW: "DASHBOARD_VIEW"
} as const;

export type AnalyticsEventType =
  (typeof ANALYTICS_EVENT_TYPES)[keyof typeof ANALYTICS_EVENT_TYPES];
