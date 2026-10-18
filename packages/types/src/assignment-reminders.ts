import { z } from "zod";

// Where an assignment sits against its due date. One rule, shared by the API
// (reminders, coach overview) and the web (badges, banner), so a student's
// "Due today" and the coach's overview can never disagree.

export const ASSIGNMENT_DUE_STATUSES = ["OVERDUE", "DUE_TODAY", "DUE_SOON", "UPCOMING", "COMPLETED"] as const;
export type AssignmentDueStatus = (typeof ASSIGNMENT_DUE_STATUSES)[number];

/** "Due soon" = due within this many hours (and not today). */
export const ASSIGNMENT_DUE_SOON_HOURS = 48;
/** The coach overview covers due dates from this many days back… */
export const ASSIGNMENT_OVERVIEW_PAST_DAYS = 30;
/** …to this many days ahead. */
export const ASSIGNMENT_OVERVIEW_AHEAD_DAYS = 14;

export const ASSIGNMENT_DUE_STATUS_LABELS: Record<AssignmentDueStatus, string> = {
  COMPLETED: "Completed",
  DUE_SOON: "Due soon",
  DUE_TODAY: "Due today",
  OVERDUE: "Overdue",
  UPCOMING: "Upcoming",
};

const HOUR_MS = 3_600_000;

/** "YYYY-MM-DD" of an instant on the wall calendar of `timeZone`. */
function calendarDay(at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone, year: "numeric" }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/**
 * Due status of one student's assignment (or, with `completed: false`, of a
 * deployment as a whole). "Due today" is the viewer's own calendar day, so a
 * deadline at 23:59 IST is "today" in Kolkata all day long.
 *  - finished → COMPLETED (whatever the date);
 *  - deadline passed → OVERDUE;
 *  - deadline later today → DUE_TODAY;
 *  - within ASSIGNMENT_DUE_SOON_HOURS → DUE_SOON;
 *  - otherwise UPCOMING.
 */
export function resolveAssignmentDueStatus(
  input: { dueDate: string | Date; completed: boolean },
  now: Date,
  timeZone: string,
): AssignmentDueStatus {
  if (input.completed) return "COMPLETED";
  const due = typeof input.dueDate === "string" ? new Date(input.dueDate) : input.dueDate;
  const dueMs = due.getTime();
  if (Number.isNaN(dueMs)) return "UPCOMING";
  if (dueMs <= now.getTime()) return "OVERDUE";
  if (calendarDay(due, timeZone) === calendarDay(now, timeZone)) return "DUE_TODAY";
  if (dueMs - now.getTime() <= ASSIGNMENT_DUE_SOON_HOURS * HOUR_MS) return "DUE_SOON";
  return "UPCOMING";
}

/** Statuses a student is actively reminded about (banner, badge, popup). */
export function isAssignmentReminderStatus(status: AssignmentDueStatus): boolean {
  return status === "OVERDUE" || status === "DUE_TODAY" || status === "DUE_SOON";
}

// ── Student: GET /assignments/mine-reminders ─────────────────────────────

export interface AssignmentReminderItem {
  /** StudentAssignment id — the `/student/practice/:id` route. */
  id: string;
  title: string;
  batchName: string;
  /** ISO-8601 UTC. */
  dueDate: string;
  status: "PENDING" | "IN_PROGRESS";
  dueStatus: Extract<AssignmentDueStatus, "OVERDUE" | "DUE_TODAY" | "DUE_SOON">;
}

export interface AssignmentRemindersResponse {
  /** Overdue first (oldest deadline first), then due today, then due soon. */
  items: AssignmentReminderItem[];
  counts: { overdue: number; dueToday: number; dueSoon: number };
  /** ISO; lets the client re-derive a status as time passes. */
  serverTime: string;
}

// ── Coach / admin: GET /assignments/overview ─────────────────────────────

export const assignmentOverviewQuerySchema = z.object({
  batchId: z.string().min(1).max(64).optional(),
  dueStatus: z.enum(["OVERDUE", "DUE_TODAY", "DUE_SOON", "UPCOMING"]).optional(),
});
export type AssignmentOverviewQuery = z.infer<typeof assignmentOverviewQuerySchema>;

export interface AssignmentOverviewStudent {
  /** StudentAssignment id. */
  id: string;
  studentId: string;
  name: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  completedAt: string | null;
}

export interface AssignmentOverviewRow {
  /** AssignmentBatch (deployment) id. */
  deploymentId: string;
  assignmentId: string;
  title: string;
  batchId: string;
  batchName: string;
  dueDate: string;
  /** The deployment's own position: COMPLETED once every student finished. */
  dueStatus: AssignmentDueStatus;
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  /** Students who have not finished, for the overdue / due-today drill-down. */
  outstanding: AssignmentOverviewStudent[];
}

export interface AssignmentOverviewResponse {
  rows: AssignmentOverviewRow[];
  totals: {
    /** Deployments past their deadline with someone unfinished. */
    overdueDeployments: number;
    /** Student-assignments past their deadline and unfinished. */
    overdueStudents: number;
    dueToday: number;
    dueSoon: number;
  };
  /** Batches the caller may filter by. */
  batches: { id: string; name: string }[];
  serverTime: string;
}
