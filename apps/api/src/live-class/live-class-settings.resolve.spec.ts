import {
  DEFAULT_LIVE_CLASS_SETTINGS,
  deriveLiveKitGrants,
  liveClassLockSources,
  lockedFieldsChanged,
  readLiveClassLocks,
  resolveJoinState,
  resolveLiveClassSettings,
  withoutLockedFields,
} from "@nexa-chess/types";

describe("resolveLiveClassSettings (pure engine)", () => {
  it("returns the safe baseline for an empty system blob", () => {
    const r = resolveLiveClassSettings({ system: {} });
    expect(r).toEqual(DEFAULT_LIVE_CLASS_SETTINGS);
    expect(r.student.mic).toBe("JOIN_MUTED");
    expect(r.recording).toBe("MANUAL");
  });

  it("applies batch then class, last layer wins", () => {
    const r = resolveLiveClassSettings({
      system: {},
      batch: { student: { mic: "JOIN_UNMUTED", camera: "JOIN_ON" } },
      class: { student: { camera: "FORCED_OFF" } },
    });
    expect(r.student.mic).toBe("JOIN_UNMUTED"); // from batch
    expect(r.student.camera).toBe("FORCED_OFF"); // class overrode batch
    expect(r.student.chat).toBe("ENABLED"); // untouched -> system default
  });

  it("ignores null/undefined layers", () => {
    const r = resolveLiveClassSettings({ system: {}, batch: null, class: undefined });
    expect(r).toEqual(DEFAULT_LIVE_CLASS_SETTINGS);
  });

  it("re-parses a raw DB-shaped system blob", () => {
    const r = resolveLiveClassSettings({
      system: { student: { screenShare: "ALLOWED" }, recording: "AUTO_START" },
    });
    expect(r.student.screenShare).toBe("ALLOWED");
    expect(r.recording).toBe("AUTO_START");
    expect(r.coach.mic).toBe("JOIN_UNMUTED");
  });
});

describe("deriveLiveKitGrants (enforcement)", () => {
  it("gives coaches and admins full publish + roomAdmin", () => {
    for (const role of ["COACH", "ADMIN", "SUPER_ADMIN"] as const) {
      const g = deriveLiveKitGrants(DEFAULT_LIVE_CLASS_SETTINGS, role);
      expect(g.roomAdmin).toBe(true);
      expect(g.canPublishSources).toEqual(
        expect.arrayContaining(["camera", "microphone", "screen_share"]),
      );
    }
  });

  it("drops microphone when a student's mic is FORCED_OFF", () => {
    const settings = resolveLiveClassSettings({
      system: { student: { mic: "FORCED_OFF" } },
    });
    const g = deriveLiveKitGrants(settings, "STUDENT");
    expect(g.canPublishSources).not.toContain("microphone");
    expect(g.canPublishSources).toContain("camera");
    expect(g.roomAdmin).toBe(false);
    expect(g.canUpdateOwnMetadata).toBe(false);
  });

  it("adds screen_share only when explicitly ALLOWED", () => {
    const off = deriveLiveKitGrants(DEFAULT_LIVE_CLASS_SETTINGS, "STUDENT");
    expect(off.canPublishSources).not.toContain("screen_share");

    const on = deriveLiveKitGrants(
      resolveLiveClassSettings({ system: { student: { screenShare: "ALLOWED" } } }),
      "STUDENT",
    );
    expect(on.canPublishSources).toContain("screen_share");
  });

  it("reports canPublish false when a student may publish nothing", () => {
    const settings = resolveLiveClassSettings({
      system: { student: { mic: "FORCED_OFF", camera: "FORCED_OFF", screenShare: "DISABLED" } },
    });
    const g = deriveLiveKitGrants(settings, "STUDENT");
    expect(g.canPublish).toBe(false);
    expect(g.canPublishSources).toEqual([]);
  });
});

describe("resolveJoinState (pre-join + auto-join)", () => {
  it("locks the student mic toggle when FORCED_OFF", () => {
    const s = resolveLiveClassSettings({ system: { student: { mic: "FORCED_OFF" } } });
    const state = resolveJoinState(s, "STUDENT", { mic: true });
    expect(state.mic).toEqual({ defaultOn: false, locked: true });
  });

  it("honours a remembered 'off' preference but never a forced default", () => {
    const s = resolveLiveClassSettings({ system: { student: { mic: "JOIN_UNMUTED" } } });
    expect(resolveJoinState(s, "STUDENT", { mic: false }).mic.defaultOn).toBe(false);
    expect(resolveJoinState(s, "STUDENT", { mic: true }).mic.defaultOn).toBe(true);
  });

  it("exposes the per-role auto-join flag", () => {
    const s = resolveLiveClassSettings({
      system: { autoJoin: { student: "ENABLED", coach: "DISABLED" } },
    });
    expect(resolveJoinState(s, "STUDENT").autoJoin).toBe(true);
    expect(resolveJoinState(s, "COACH").autoJoin).toBe(false);
  });
});

// V1 (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md §2.5): admin locks.
describe("live-class setting locks (pure engine)", () => {
  it("an academy lock ignores the batch and class layers", () => {
    const r = resolveLiveClassSettings({
      system: { recording: "DISABLED", waitingRoom: "ENABLED" },
      batch: { recording: "MANUAL", waitingRoom: "DISABLED" },
      class: { recording: "AUTO_START" },
      systemLocks: ["recording"],
    });
    expect(r.recording).toBe("DISABLED"); // locked: batch and class ignored
    expect(r.waitingRoom).toBe("DISABLED"); // unlocked: batch still wins
  });

  it("a batch lock ignores the class layer only", () => {
    const r = resolveLiveClassSettings({
      system: {},
      batch: { student: { camera: "FORCED_OFF", mic: "JOIN_MUTED" } },
      class: { student: { camera: "JOIN_ON", mic: "JOIN_UNMUTED" } },
      batchLocks: ["student.camera"],
    });
    expect(r.student.camera).toBe("FORCED_OFF");
    expect(r.student.mic).toBe("JOIN_UNMUTED");
  });

  it("locks reach LiveKit grants: a locked FORCED_OFF camera is never publishable", () => {
    const r = resolveLiveClassSettings({
      system: { student: { camera: "FORCED_OFF", screenShare: "DISABLED" } },
      class: { student: { camera: "JOIN_ON", screenShare: "ALLOWED" } },
      systemLocks: ["student.camera", "student.screenShare"],
    });
    const grants = deriveLiveKitGrants(r, "STUDENT");
    expect(grants.canPublishSources).not.toContain("camera");
    expect(grants.canPublishSources).not.toContain("screen_share");
  });

  it("reads a lock list from a layer's JSON, dropping junk, in catalogue order", () => {
    expect(readLiveClassLocks({ locks: ["waitingRoom", "nope", "student.mic", 3, "student.mic"] })).toEqual([
      "student.mic",
      "waitingRoom",
    ]);
    expect(readLiveClassLocks(null)).toEqual([]);
    expect(readLiveClassLocks({ student: { mic: "JOIN_MUTED" } })).toEqual([]);
  });

  it("strips locked fields and drops emptied sections", () => {
    expect(
      withoutLockedFields({ student: { camera: "JOIN_ON" }, recording: "MANUAL", waitingRoom: "ENABLED" }, [
        "student.camera",
        "recording",
      ]),
    ).toEqual({ waitingRoom: "ENABLED" });
  });

  it("only counts a real change to a locked field (stale-but-unchanged values pass)", () => {
    const locked = resolveLiveClassSettings({ system: { recording: "DISABLED" } });
    const base = { locked, locks: ["recording" as const] };
    expect(lockedFieldsChanged({ ...base, next: { recording: "AUTO_START" }, previous: null })).toEqual(["recording"]);
    expect(lockedFieldsChanged({ ...base, next: { recording: "DISABLED" }, previous: null })).toEqual([]);
    expect(
      lockedFieldsChanged({ ...base, next: { recording: "MANUAL" }, previous: { recording: "MANUAL" } }),
    ).toEqual([]);
    expect(lockedFieldsChanged({ ...base, next: { student: { chat: "DISABLED" } }, previous: null })).toEqual([]);
  });

  it("labels the lock source, academy winning over batch", () => {
    expect(liveClassLockSources({ systemLocks: ["recording"], batchLocks: ["recording", "waitingRoom"] })).toEqual({
      recording: "ACADEMY",
      waitingRoom: "BATCH",
    });
  });
});
