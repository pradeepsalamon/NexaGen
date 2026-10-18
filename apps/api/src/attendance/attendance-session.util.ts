/**
 * Pure decision helpers for the multi-tab attendance case (P0 reliability
 * Phase 4, RELIABILITY_DESIGN.md §2.8): a student can have more than one open
 * JOIN/RECONNECT session on the same ClassAttendance row when they have two
 * browser tabs of the same class open at once. Kept free of Prisma so the
 * decision logic is unit-testable directly, and shared between the webhook
 * controller (what to record on join) and AttendanceService (which open
 * session a LEAVE/DISCONNECT closes).
 */

export type OpenAttendanceLog = {
  id: string;
  clientId: string | null;
  timestamp: Date;
};

export type JoinAction =
  | { kind: "FIRST_JOIN" }
  | { kind: "DUPLICATE_SKIP"; adoptLogId?: string }
  | { kind: "GHOST_DROP_RECONNECT"; staleLogId: string }
  | { kind: "CONCURRENT_RECONNECT" };

/**
 * Decides what a `participant_joined` webhook should do, given every
 * currently-open (JOIN/RECONNECT, sessionEnd: null) log on the student's
 * ClassAttendance row.
 *
 * When `clientId` is known, only THIS tab's own open log is treated as the
 * "reference" session for the duplicate/ghost-drop check — a different tab's
 * open log is left untouched rather than ghost-dropped, since it may
 * genuinely still be connected (the previous behavior ghost-dropped whichever
 * session was most recently open regardless of tab, which is exactly the
 * misfire: a second tab's join would close the first tab's still-live
 * session, and that first tab's own later clean leave would then close the
 * second tab's session out from under it). When `clientId` is unknown (older
 * client), falls back to whichever session is open, matching the
 * single-session behavior from before this phase.
 */
export function resolveJoinAction(
  hasExistingAttendance: boolean,
  openLogs: OpenAttendanceLog[],
  clientId: string | undefined,
  now: Date,
  duplicateJoinWindowMs: number
): JoinAction {
  if (!hasExistingAttendance) return { kind: "FIRST_JOIN" };

  const reference = clientId
    ? openLogs.find((log) => log.clientId === clientId)
    : [...openLogs].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

  if (!reference) {
    // The token request's JOIN carries no clientId on older clients — the
    // webhook for that same join must adopt it, not open a parallel session.
    const unscoped = clientId
      ? openLogs.find(
          (log) =>
            log.clientId === null &&
            now.getTime() - log.timestamp.getTime() >= 0 &&
            now.getTime() - log.timestamp.getTime() < duplicateJoinWindowMs
        )
      : undefined;
    if (unscoped) return { kind: "DUPLICATE_SKIP", adoptLogId: unscoped.id };
    return { kind: "CONCURRENT_RECONNECT" };
  }

  const ageMs = now.getTime() - reference.timestamp.getTime();
  if (ageMs >= 0 && ageMs < duplicateJoinWindowMs) {
    return { kind: "DUPLICATE_SKIP" };
  }

  return { kind: "GHOST_DROP_RECONNECT", staleLogId: reference.id };
}

/**
 * Decides which open session a LEAVE/DISCONNECT event should close: the tab
 * that actually sent the event when its clientId is known, otherwise the
 * most recently opened session (legacy fallback, and the heartbeat-timeout
 * sweep, which has no clientId of its own and only fires once every tab's
 * heartbeat has gone stale).
 */
export function selectSessionToClose(
  openLogs: OpenAttendanceLog[],
  clientId: string | undefined
): string | undefined {
  if (openLogs.length === 0) return undefined;

  if (clientId) {
    const scoped = openLogs.find((log) => log.clientId === clientId);
    if (scoped) return scoped.id;
  }

  return [...openLogs].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0].id;
}
