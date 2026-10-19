import { resolveJoinAction, selectSessionToClose } from "./attendance-session.util";

// Multi-tab attendance correctness (P0 reliability Phase 4,
// RELIABILITY_DESIGN.md §2.8): two browser tabs of the same student produce
// interleaved join/leave webhook events on the same ClassAttendance row.
// These pure decision helpers are what stops one tab's event from clobbering
// the other tab's still-open session.

describe("resolveJoinAction", () => {
  const now = new Date("2026-01-01T10:10:00Z");
  const WINDOW_MS = 2 * 60_000;

  it("is a first join when the student has no attendance row yet", () => {
    expect(resolveJoinAction(false, [], "tab-a", now, WINDOW_MS)).toEqual({
      kind: "FIRST_JOIN",
    });
  });

  it("skips a duplicate join for the same tab arriving within the window", () => {
    const openLogs = [
      { id: "log-a", clientId: "tab-a", timestamp: new Date("2026-01-01T10:09:30Z") },
    ];
    expect(resolveJoinAction(true, openLogs, "tab-a", now, WINDOW_MS)).toEqual({
      kind: "DUPLICATE_SKIP",
    });
  });

  it("ghost-drops the same tab's own stale open session (crash + reload)", () => {
    const openLogs = [
      { id: "log-a", clientId: "tab-a", timestamp: new Date("2026-01-01T09:00:00Z") },
    ];
    expect(resolveJoinAction(true, openLogs, "tab-a", now, WINDOW_MS)).toEqual({
      kind: "GHOST_DROP_RECONNECT",
      staleLogId: "log-a",
    });
  });

  it("does NOT ghost-drop a different tab's open session when a second tab joins", () => {
    // Tab A is still open (started long enough ago to be outside the
    // duplicate-join window). Tab B joining must not treat tab A's session
    // as stale — that was the exact misfire: tab A's live session getting
    // closed under it by tab B's own join.
    const openLogs = [
      { id: "log-tab-a", clientId: "tab-a", timestamp: new Date("2026-01-01T09:00:00Z") },
    ];
    expect(resolveJoinAction(true, openLogs, "tab-b", now, WINDOW_MS)).toEqual({
      kind: "CONCURRENT_RECONNECT",
    });
  });

  it("falls back to the newest open session when clientId is unknown (legacy client)", () => {
    const openLogs = [
      { id: "log-older", clientId: null, timestamp: new Date("2026-01-01T08:00:00Z") },
      { id: "log-newer", clientId: null, timestamp: new Date("2026-01-01T09:00:00Z") },
    ];
    expect(resolveJoinAction(true, openLogs, undefined, now, WINDOW_MS)).toEqual({
      kind: "GHOST_DROP_RECONNECT",
      staleLogId: "log-newer",
    });
  });

  it("adopts a fresh clientId-less token JOIN instead of opening a parallel session", () => {
    const openLogs = [
      { id: "log-token", clientId: null, timestamp: new Date("2026-01-01T10:09:55Z") },
    ];
    expect(resolveJoinAction(true, openLogs, "tab-a", now, WINDOW_MS)).toEqual({
      kind: "DUPLICATE_SKIP",
      adoptLogId: "log-token",
    });
  });

  it("is a plain reconnect when nothing is currently open", () => {
    expect(resolveJoinAction(true, [], "tab-a", now, WINDOW_MS)).toEqual({
      kind: "CONCURRENT_RECONNECT",
    });
  });
});

describe("selectSessionToClose", () => {
  it("returns undefined when nothing is open", () => {
    expect(selectSessionToClose([], "tab-a")).toBeUndefined();
  });

  it("closes only the tab that sent the event when both tabs have an open session", () => {
    const openLogs = [
      { id: "log-tab-a", clientId: "tab-a", timestamp: new Date("2026-01-01T09:00:00Z") },
      { id: "log-tab-b", clientId: "tab-b", timestamp: new Date("2026-01-01T09:05:00Z") },
    ];
    // Tab A leaves — must close tab A's session, not tab B's more-recent one.
    expect(selectSessionToClose(openLogs, "tab-a")).toBe("log-tab-a");
    // Tab B leaves — must close tab B's, leaving tab A's (if it were still
    // open) alone.
    expect(selectSessionToClose(openLogs, "tab-b")).toBe("log-tab-b");
  });

  it("falls back to the most recently opened session when the clientId has no open session of its own", () => {
    const openLogs = [
      { id: "log-older", clientId: "tab-a", timestamp: new Date("2026-01-01T09:00:00Z") },
      { id: "log-newer", clientId: "tab-a", timestamp: new Date("2026-01-01T09:05:00Z") },
    ];
    expect(selectSessionToClose(openLogs, "tab-unknown")).toBe("log-newer");
  });

  it("falls back to the most recently opened session when clientId is undefined (heartbeat sweep)", () => {
    const openLogs = [
      { id: "log-older", clientId: "tab-a", timestamp: new Date("2026-01-01T09:00:00Z") },
      { id: "log-newer", clientId: "tab-b", timestamp: new Date("2026-01-01T09:05:00Z") },
    ];
    expect(selectSessionToClose(openLogs, undefined)).toBe("log-newer");
  });
});
