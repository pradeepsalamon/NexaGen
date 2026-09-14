import { z } from "zod";

// Pre-class settings shared contract. Resolved through four layers (last wins):
// System defaults → Batch default → Class config → Preset (copied into the
// class, never referenced). Used by api (token grants, snapshot, CRUD) and web
// (config UI, pre-join + in-room lock state).

export const toggleModeSchema = z.enum(["DISABLED", "ENABLED"]);
export type ToggleMode = z.infer<typeof toggleModeSchema>;

/** Default mic state for a student + whether they may change it. */
export const studentMicModeSchema = z.enum(["JOIN_MUTED", "JOIN_UNMUTED", "FORCED_OFF"]);
export type StudentMicMode = z.infer<typeof studentMicModeSchema>;

export const studentCameraModeSchema = z.enum(["JOIN_OFF", "JOIN_ON", "FORCED_OFF"]);
export type StudentCameraMode = z.infer<typeof studentCameraModeSchema>;

export const coachMicModeSchema = z.enum(["JOIN_MUTED", "JOIN_UNMUTED"]);
export type CoachMicMode = z.infer<typeof coachMicModeSchema>;

export const coachCameraModeSchema = z.enum(["JOIN_OFF", "JOIN_ON"]);
export type CoachCameraMode = z.infer<typeof coachCameraModeSchema>;

export const screenShareModeSchema = z.enum(["DISABLED", "ALLOWED"]);
export type ScreenShareMode = z.infer<typeof screenShareModeSchema>;

/** Student's default interaction level with the shared chessboard. */
export const boardInteractionModeSchema = z.enum(["VIEW_ONLY", "INTERACTIVE"]);
export type BoardInteractionMode = z.infer<typeof boardInteractionModeSchema>;

export const recordingModeSchema = z.enum(["DISABLED", "MANUAL", "AUTO_START"]);
export type RecordingMode = z.infer<typeof recordingModeSchema>;

/** Whether students must be explicitly admitted by the coach before joining. */
export const waitingRoomModeSchema = z.enum(["DISABLED", "ENABLED"]);
export type WaitingRoomMode = z.infer<typeof waitingRoomModeSchema>;

/**
 * The fully-resolved settings shape. Every field has a default, so
 * `liveClassSettingsSchema.parse({})` yields the system-wide safe baseline.
 */
export const liveClassSettingsSchema = z
  .object({
    autoJoin: z
      .object({
        student: toggleModeSchema.default("DISABLED"),
        coach: toggleModeSchema.default("DISABLED"),
      })
      .prefault({}),
    student: z
      .object({
        mic: studentMicModeSchema.default("JOIN_MUTED"),
        camera: studentCameraModeSchema.default("JOIN_OFF"),
        screenShare: screenShareModeSchema.default("DISABLED"),
        chat: toggleModeSchema.default("ENABLED"),
        // Student <-> coach direct messages. There is deliberately no
        // student <-> student option: see `privateChatRecipientAllowed`.
        privateChat: toggleModeSchema.default("ENABLED"),
        board: boardInteractionModeSchema.default("VIEW_ONLY"),
      })
      .prefault({}),
    coach: z
      .object({
        mic: coachMicModeSchema.default("JOIN_UNMUTED"),
        camera: coachCameraModeSchema.default("JOIN_ON"),
      })
      .prefault({}),
    recording: recordingModeSchema.default("MANUAL"),
    waitingRoom: waitingRoomModeSchema.default("DISABLED"),
  })
  .prefault({});

export type LiveClassSettings = z.infer<typeof liveClassSettingsSchema>;

/** The safe baseline used as Layer 1 when no system policy row exists yet. */
export const DEFAULT_LIVE_CLASS_SETTINGS: LiveClassSettings = liveClassSettingsSchema.parse({});

/**
 * Partial-override shape stored on Batch / CoachClass / LiveClassPreset. Only
 * the keys an author actually set are present; everything else inherits.
 */
export const liveClassSettingsOverrideSchema = z.object({
  autoJoin: z
    .object({
      student: toggleModeSchema.optional(),
      coach: toggleModeSchema.optional(),
    })
    .optional(),
  student: z
    .object({
      mic: studentMicModeSchema.optional(),
      camera: studentCameraModeSchema.optional(),
      screenShare: screenShareModeSchema.optional(),
      chat: toggleModeSchema.optional(),
      privateChat: toggleModeSchema.optional(),
      board: boardInteractionModeSchema.optional(),
    })
    .optional(),
  coach: z
    .object({
      mic: coachMicModeSchema.optional(),
      camera: coachCameraModeSchema.optional(),
    })
    .optional(),
  recording: recordingModeSchema.optional(),
  waitingRoom: waitingRoomModeSchema.optional(),
});

export type LiveClassSettingsOverride = z.infer<typeof liveClassSettingsOverrideSchema>;

// ──────────────────────────────────────────────
// Resolution
// ──────────────────────────────────────────────

type Section = "autoJoin" | "student" | "coach";

function mergeOverride(
  base: LiveClassSettings,
  override: LiveClassSettingsOverride | null | undefined,
): LiveClassSettings {
  if (!override) return base;
  const next: LiveClassSettings = {
    autoJoin: { ...base.autoJoin },
    student: { ...base.student },
    coach: { ...base.coach },
    recording: base.recording,
    waitingRoom: base.waitingRoom,
  };
  for (const section of ["autoJoin", "student", "coach"] as Section[]) {
    const patch = override[section];
    if (patch) {
      next[section] = { ...next[section], ...pruneUndefined(patch) } as never;
    }
  }
  if (override.recording !== undefined) next.recording = override.recording;
  if (override.waitingRoom !== undefined) next.waitingRoom = override.waitingRoom;
  return next;
}

function pruneUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

/**
 * Resolve the effective settings for a class. `system` is the Layer 1 blob
 * (may be a raw JSON value from the DB — it is re-parsed here), `batch` and
 * `class` are partial overrides. Last layer wins; a class may loosen a batch
 * default on purpose (§26).
 */
export function resolveLiveClassSettings(layers: {
  system?: unknown;
  batch?: LiveClassSettingsOverride | null;
  class?: LiveClassSettingsOverride | null;
}): LiveClassSettings {
  const base = liveClassSettingsSchema.parse(layers.system ?? {});
  const merged = mergeOverride(mergeOverride(base, layers.batch), layers.class);
  // Re-parse so the output is always a clean, fully-populated object.
  return liveClassSettingsSchema.parse(merged);
}

// ──────────────────────────────────────────────
// LiveKit grant derivation (enforcement)
// ──────────────────────────────────────────────

export type LiveKitTrackSource =
  | "camera"
  | "microphone"
  | "screen_share"
  | "screen_share_audio";

export interface DerivedLiveKitGrants {
  canPublish: boolean;
  canPublishSources: LiveKitTrackSource[];
  canPublishData: boolean;
  canSubscribe: boolean;
  roomAdmin: boolean;
  canUpdateOwnMetadata: boolean;
}

const FULL_SOURCES: LiveKitTrackSource[] = [
  "camera",
  "microphone",
  "screen_share",
  "screen_share_audio",
];

/**
 * Map resolved settings + participant role to LiveKit VideoGrant fields. This
 * is the server-side enforcement point: a student whose policy forbids the
 * microphone never receives `microphone` in `canPublishSources`, so the SFU
 * rejects the publish regardless of client state.
 */
export function deriveLiveKitGrants(
  settings: LiveClassSettings,
  role: "COACH" | "STUDENT" | "ADMIN" | "SUPER_ADMIN",
): DerivedLiveKitGrants {
  if (role !== "STUDENT") {
    return {
      canPublish: true,
      canPublishSources: [...FULL_SOURCES],
      canPublishData: true,
      canSubscribe: true,
      roomAdmin: true,
      canUpdateOwnMetadata: true,
    };
  }

  const sources: LiveKitTrackSource[] = [];
  if (settings.student.mic !== "FORCED_OFF") sources.push("microphone");
  if (settings.student.camera !== "FORCED_OFF") sources.push("camera");
  if (settings.student.screenShare === "ALLOWED") {
    sources.push("screen_share", "screen_share_audio");
  }

  return {
    canPublish: sources.length > 0,
    canPublishSources: sources,
    canPublishData: true,
    canSubscribe: true,
    roomAdmin: false,
    // Students must never rewrite their own metadata — the client derives role
    // (chat badge, board authority) from it (AUDIT C7).
    canUpdateOwnMetadata: false,
  };
}

// ──────────────────────────────────────────────
// Mid-class settings broadcast (LiveKit data channel)
// ──────────────────────────────────────────────

/**
 * LiveKit data-channel topic the API server-injects a `SETTINGS_UPDATE` on when
 * a coach changes the class settings mid-session. Every client re-locks its UI
 * and re-seeds the board default from the payload — the token grants are also
 * pushed via `updateParticipant`, so the message only keeps the UI honest.
 */
export const LIVE_CLASS_SETTINGS_TOPIC = "live_class_settings";

export const liveClassSettingsMessageSchema = z.object({
  type: z.literal("SETTINGS_UPDATE"),
  settings: liveClassSettingsSchema,
});
export type LiveClassSettingsMessage = z.infer<typeof liveClassSettingsMessageSchema>;

// ──────────────────────────────────────────────
// Join-time state (pre-join screen + auto-join)
// ──────────────────────────────────────────────

export interface DeviceJoinState {
  /** Whether the track should be enabled on join. */
  defaultOn: boolean;
  /** Whether the participant is forbidden from turning it on. */
  locked: boolean;
}

export interface ResolvedJoinState {
  mic: DeviceJoinState;
  camera: DeviceJoinState;
  autoJoin: boolean;
}

/**
 * Compute the initial device state for a participant, clamped to policy. A
 * remembered local preference (`pref`) may turn a device *off* but never
 * override a `FORCED_OFF` lock or a `JOIN_*` default the coach chose.
 */
export function resolveJoinState(
  settings: LiveClassSettings,
  role: "COACH" | "STUDENT" | "ADMIN" | "SUPER_ADMIN",
  pref?: { mic?: boolean; camera?: boolean },
): ResolvedJoinState {
  if (role !== "STUDENT") {
    return {
      mic: { defaultOn: settings.coach.mic === "JOIN_UNMUTED" && pref?.mic !== false, locked: false },
      camera: {
        defaultOn: settings.coach.camera === "JOIN_ON" && pref?.camera !== false,
        locked: false,
      },
      autoJoin: settings.autoJoin.coach === "ENABLED",
    };
  }

  const micLocked = settings.student.mic === "FORCED_OFF";
  const cameraLocked = settings.student.camera === "FORCED_OFF";

  return {
    mic: {
      defaultOn: micLocked ? false : settings.student.mic === "JOIN_UNMUTED" && pref?.mic !== false,
      locked: micLocked,
    },
    camera: {
      defaultOn: cameraLocked
        ? false
        : settings.student.camera === "JOIN_ON" && pref?.camera !== false,
      locked: cameraLocked,
    },
    autoJoin: settings.autoJoin.student === "ENABLED",
  };
}

// ──────────────────────────────────────────────
// Validation & warnings (config UI)
// ──────────────────────────────────────────────

/**
 * Returns human-readable problems with a resolved config. v1 has no truly
 * contradictory states (enum values are mutually exclusive), but this is the
 * hook point for future combos (waiting-room vs auto-join, etc. — §40).
 */
export function validateLiveClassSettings(settings: LiveClassSettings): string[] {
  const issues: string[] = [];
  if (settings.waitingRoom !== "DISABLED" && settings.autoJoin.student === "ENABLED") {
    issues.push("Auto-join and the waiting room cannot both be enabled for students.");
  }
  return issues;
}

/** Non-blocking advisories shown next to disruptive toggles (§28). */
export function getLiveClassSettingsWarnings(settings: LiveClassSettings): string[] {
  const warnings: string[] = [];
  if (settings.student.mic === "FORCED_OFF") {
    warnings.push("Students will not be able to unmute themselves.");
  }
  if (settings.student.camera === "FORCED_OFF") {
    warnings.push("Students will not be able to turn their camera on.");
  }
  if (settings.autoJoin.student === "ENABLED") {
    warnings.push("Students may enter the classroom automatically when the class becomes available.");
  }
  if (settings.waitingRoom === "ENABLED") {
    warnings.push("Students will need to be admitted individually before they can join.");
  }
  if (settings.recording === "AUTO_START") {
    warnings.push("Recording starts automatically; participants are notified when it begins.");
  }
  if (settings.student.chat === "DISABLED") {
    warnings.push("Students will not be able to send chat messages.");
  }
  if (settings.student.privateChat === "DISABLED") {
    warnings.push("Students will not be able to message the coach privately.");
  }
  return warnings;
}

// ──────────────────────────────────────────────
// Waiting room (join-time admit flow)
// ──────────────────────────────────────────────

export const waitingRoomStatusSchema = z.enum(["PENDING", "ADMITTED", "DENIED"]);
export type WaitingRoomStatus = z.infer<typeof waitingRoomStatusSchema>;

export interface WaitingRoomEntry {
  id: string;
  studentId: string;
  studentName: string;
  avatarUrl: string | null;
  status: WaitingRoomStatus;
  /** ISO-8601 UTC. */
  requestedAt: string;
}

export const resolveWaitingRoomRequestSchema = z.object({
  studentId: z.string().min(1),
  action: z.enum(["ADMIT", "DENY"]),
});
export type ResolveWaitingRoomRequest = z.infer<typeof resolveWaitingRoomRequestSchema>;

export interface WaitingRoomListResponse {
  entries: WaitingRoomEntry[];
}

/**
 * LiveKit data-channel topic the API server-injects a waiting-room event on so
 * a coach/admin already connected to the room sees a new request (or another
 * tab's resolution) without waiting on a poll. Purely a nudge — the REST list
 * endpoint is the source of truth, same as `LIVE_CLASS_MODERATION_TOPIC`.
 */
export const LIVE_CLASS_WAITING_ROOM_TOPIC = "waiting_room";

export const waitingRoomEventSchema = z.object({
  type: z.enum(["JOIN_REQUESTED", "REQUEST_RESOLVED"]),
  entry: z.object({
    id: z.string(),
    studentId: z.string(),
    studentName: z.string(),
    avatarUrl: z.string().nullable(),
    status: waitingRoomStatusSchema,
    requestedAt: z.string(),
  }),
});
export type WaitingRoomEvent = z.infer<typeof waitingRoomEventSchema>;
