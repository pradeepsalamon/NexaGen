/**
 * The one set of rules for where a class sits in time and what can be done
 * with it — shared by the API (which enforces them) and the web app (which
 * shows the same answer before the click), so a button never offers an action
 * the server will refuse.
 *
 * `ClassStatus` is what is stored; a SCHEDULED class whose window has passed
 * without ever starting is still stored as SCHEDULED (history is never
 * rewritten), but it is shown as `NOT_HELD`, not as upcoming.
 */

/** How long before `startsAt` a coach may open the live room. */
export const CLASS_EARLY_START_MINUTES = 30;

export type ClassDisplayStatus = "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED" | "NOT_HELD";

export type ClassTiming = {
  status: string;
  startsAt: string | Date;
  endsAt: string | Date;
};

const toMs = (value: string | Date) =>
  typeof value === "string" ? new Date(value).getTime() : value.getTime();

const nowMs = (now: Date | number) => (typeof now === "number" ? now : now.getTime());

export function isLiveClassStatus(status: string) {
  return status === "LIVE" || status === "IN_PROGRESS";
}

export function resolveClassDisplayStatus(
  cls: ClassTiming,
  now: Date | number = Date.now()
): ClassDisplayStatus {
  if (isLiveClassStatus(cls.status)) return "LIVE";
  if (cls.status === "COMPLETED") return "COMPLETED";
  if (cls.status === "CANCELLED") return "CANCELLED";
  return toMs(cls.endsAt) <= nowMs(now) ? "NOT_HELD" : "SCHEDULED";
}

/**
 * "Upcoming" lists: a live class, or a scheduled one that is not over yet.
 * A cancelled class is never upcoming — it will not happen.
 */
export function isUpcomingClass(cls: ClassTiming, now: Date | number = Date.now()) {
  const display = resolveClassDisplayStatus(cls, now);
  return display === "LIVE" || display === "SCHEDULED";
}

/**
 * "Past" lists: held, not held, or cancelled once its date has arrived. A
 * cancelled class still ahead stays off both lists (the calendar shows it).
 */
export function isPastClass(cls: ClassTiming, now: Date | number = Date.now()) {
  const display = resolveClassDisplayStatus(cls, now);
  if (display === "COMPLETED" || display === "NOT_HELD") return true;
  return display === "CANCELLED" && toMs(cls.startsAt) <= nowMs(now);
}

/** The first instant a coach may start the class. */
export function classStartOpensAt(startsAt: string | Date): Date {
  return new Date(toMs(startsAt) - CLASS_EARLY_START_MINUTES * 60_000);
}

export type ClassStartBlockReason =
  | "CANCELLED"
  | "COMPLETED"
  | "ALREADY_LIVE"
  | "TOO_EARLY"
  | "WINDOW_PASSED";

export type ClassStartAvailability =
  | { canStart: true }
  | { canStart: false; reason: ClassStartBlockReason; opensAt?: string };

/**
 * Whether the class may be started now. Starting is the only thing that can
 * mark a class COMPLETED (ending it does), so the window is what keeps a class
 * days ahead from being "completed" before it was due: no earlier than
 * `CLASS_EARLY_START_MINUTES` before it, and not once its window has ended —
 * a missed class is rescheduled through a class change request instead.
 */
export function getClassStartAvailability(
  cls: ClassTiming,
  now: Date | number = Date.now()
): ClassStartAvailability {
  if (cls.status === "CANCELLED") return { canStart: false, reason: "CANCELLED" };
  if (cls.status === "COMPLETED") return { canStart: false, reason: "COMPLETED" };
  if (isLiveClassStatus(cls.status)) return { canStart: false, reason: "ALREADY_LIVE" };

  const at = nowMs(now);
  if (toMs(cls.endsAt) <= at) return { canStart: false, reason: "WINDOW_PASSED" };
  const opensAt = classStartOpensAt(cls.startsAt);
  if (opensAt.getTime() > at) {
    return { canStart: false, reason: "TOO_EARLY", opensAt: opensAt.toISOString() };
  }
  return { canStart: true };
}

export const CLASS_START_BLOCK_MESSAGES: Record<ClassStartBlockReason, string> = {
  ALREADY_LIVE: "This class is already live.",
  CANCELLED: "This class was cancelled.",
  COMPLETED: "This class has already ended.",
  TOO_EARLY: `A class can be started at most ${CLASS_EARLY_START_MINUTES} minutes before its scheduled time.`,
  WINDOW_PASSED:
    "This class's scheduled time has passed. Request a reschedule to teach it."
};

/**
 * A student can join only while the coach has the class live; before that the
 * room does not exist, and the server refuses a token.
 */
export function canJoinClass(cls: { status: string }) {
  return isLiveClassStatus(cls.status);
}
