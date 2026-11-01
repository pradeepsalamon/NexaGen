// Who may cancel a class, and how (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md
// §1.3, V10). Shared so the API enforces and the web shows the matching control.

/** Direct cancellation is allowed only this far ahead of the start. */
export const CLASS_CANCEL_DIRECT_NOTICE_HOURS = 24;

/**
 * - `DIRECT`: more than 24 h before the start — the coach cancels now.
 * - `APPROVAL`: within 24 h of the start — a `CLASS_CANCEL` admin request.
 * - `EXCEPTIONAL`: the start time has passed or the class is running — a
 *   `CLASS_CANCEL_EXCEPTIONAL` request (always urgent).
 * - `NOT_ALLOWED`: already cancelled or completed.
 */
export type CancellationPath = "DIRECT" | "APPROVAL" | "EXCEPTIONAL" | "NOT_ALLOWED";

export type CancellableClass = {
  status: string;
  startsAt: string | Date;
};

export function resolveCancellationPath(cls: CancellableClass, now: Date | number = Date.now()): CancellationPath {
  if (cls.status === "CANCELLED" || cls.status === "COMPLETED") return "NOT_ALLOWED";
  if (cls.status === "LIVE" || cls.status === "IN_PROGRESS") return "EXCEPTIONAL";
  const startsAt = new Date(cls.startsAt).getTime();
  const nowMs = typeof now === "number" ? now : now.getTime();
  if (startsAt <= nowMs) return "EXCEPTIONAL";
  return startsAt - nowMs > CLASS_CANCEL_DIRECT_NOTICE_HOURS * 3_600_000 ? "DIRECT" : "APPROVAL";
}
