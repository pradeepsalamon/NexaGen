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
        // Emoji reactions (the `reaction` data topic) sent by students.
        reactions: toggleModeSchema.default("ENABLED"),
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
      reactions: toggleModeSchema.optional(),
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
// Admin locks (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md §2.5)
// ──────────────────────────────────────────────

/**
 * Fields an admin may lock at the academy (system policy) or batch layer. A
 * locked field ignores every lower layer: a coach's class override (or a
 * preset copied into the class) can never change it. The coach's own mic and
 * camera defaults and coach auto-join are the coach's own business, not
 * academy policy, so they are not lockable.
 */
export const LOCKABLE_LIVE_SETTINGS = [
  "student.mic",
  "student.camera",
  "student.screenShare",
  "student.chat",
  "student.privateChat",
  "student.reactions",
  "student.board",
  "autoJoin.student",
  "recording",
  "waitingRoom",
] as const;

export const lockableLiveSettingSchema = z.enum(LOCKABLE_LIVE_SETTINGS);
export type LockableLiveSetting = z.infer<typeof lockableLiveSettingSchema>;

/** Short names for errors and audit text (the web form has its own longer help). */
export const LOCKABLE_LIVE_SETTING_LABELS: Record<LockableLiveSetting, string> = {
  "student.mic": "Student microphone",
  "student.camera": "Student camera",
  "student.screenShare": "Student screen share",
  "student.chat": "Student chat",
  "student.privateChat": "Private messages",
  "student.reactions": "Student reactions",
  "student.board": "Student board access",
  "autoJoin.student": "Student auto-join",
  recording: "Recording",
  waitingRoom: "Waiting room",
};

/** A layer's lock list: deduplicated, in catalogue order. */
export const liveClassLocksSchema = z
  .array(lockableLiveSettingSchema)
  .max(LOCKABLE_LIVE_SETTINGS.length * 2)
  .transform((locks) => LOCKABLE_LIVE_SETTINGS.filter((field) => locks.includes(field)));

/**
 * The lock list stored beside a layer's settings in the same JSON column
 * (`LiveClassPolicy.settings.locks`, `Batch.liveClassSettings.locks`). Unknown
 * or malformed entries are dropped rather than failing the whole layer.
 */
export function readLiveClassLocks(layerJson: unknown): LockableLiveSetting[] {
  if (!layerJson || typeof layerJson !== "object") return [];
  const raw = (layerJson as { locks?: unknown }).locks;
  if (!Array.isArray(raw)) return [];
  const known = raw.filter((value): value is LockableLiveSetting =>
    (LOCKABLE_LIVE_SETTINGS as readonly string[]).includes(value as string),
  );
  return LOCKABLE_LIVE_SETTINGS.filter((field) => known.includes(field));
}

/** Who locked a field, as shown to the coach. Academy wins when both did. */
export type LiveClassLockSource = "ACADEMY" | "BATCH";

export function liveClassLockSources(layers: {
  systemLocks?: readonly LockableLiveSetting[] | null;
  batchLocks?: readonly LockableLiveSetting[] | null;
}): Partial<Record<LockableLiveSetting, LiveClassLockSource>> {
  const out: Partial<Record<LockableLiveSetting, LiveClassLockSource>> = {};
  for (const field of layers.batchLocks ?? []) out[field] = "BATCH";
  for (const field of layers.systemLocks ?? []) out[field] = "ACADEMY";
  return out;
}

function getOverrideValue(override: LiveClassSettingsOverride, path: LockableLiveSetting): unknown {
  const [head, tail] = path.split(".") as [string, string | undefined];
  const node = (override as Record<string, unknown>)[head];
  if (tail === undefined) return node;
  return node && typeof node === "object" ? (node as Record<string, unknown>)[tail] : undefined;
}

/** A copy of `override` with every locked field removed (empty sections dropped). */
export function withoutLockedFields(
  override: LiveClassSettingsOverride | null | undefined,
  locks: readonly LockableLiveSetting[],
): LiveClassSettingsOverride | null {
  if (!override) return override ?? null;
  if (locks.length === 0) return override;
  const next: Record<string, unknown> = JSON.parse(JSON.stringify(override));
  for (const path of locks) {
    const [head, tail] = path.split(".") as [string, string | undefined];
    if (tail === undefined) {
      delete next[head];
    } else if (next[head] && typeof next[head] === "object") {
      const section = next[head] as Record<string, unknown>;
      delete section[tail];
      if (Object.keys(section).length === 0) delete next[head];
    }
  }
  return next as LiveClassSettingsOverride;
}

/** A copy of `override` holding only the given fields (null when none are set). */
export function onlyLockedFields(
  override: LiveClassSettingsOverride | null | undefined,
  fields: readonly LockableLiveSetting[],
): LiveClassSettingsOverride | null {
  if (!override || fields.length === 0) return null;
  const out: Record<string, unknown> = {};
  for (const path of fields) {
    const value = getOverrideValue(override, path);
    if (value === undefined) continue;
    const [head, tail] = path.split(".") as [string, string | undefined];
    if (tail === undefined) {
      out[head] = value;
    } else {
      out[head] = { ...((out[head] as Record<string, unknown> | undefined) ?? {}), [tail]: value };
    }
  }
  return Object.keys(out).length > 0 ? (out as LiveClassSettingsOverride) : null;
}

/**
 * The locked fields a write would actually change: the new override sets a
 * value that differs both from the locked effective value and from what the
 * layer already held. A stale-but-unchanged value (saved before the lock
 * existed) is not a change, so old configs keep saving; it is stripped anyway.
 */
export function lockedFieldsChanged(input: {
  next: LiveClassSettingsOverride | null | undefined;
  previous: LiveClassSettingsOverride | null | undefined;
  locked: LiveClassSettings;
  locks: readonly LockableLiveSetting[];
}): LockableLiveSetting[] {
  if (!input.next) return [];
  return input.locks.filter((path) => {
    const value = getOverrideValue(input.next!, path);
    if (value === undefined) return false;
    const lockedValue = getAtSettingsPath(input.locked, path);
    const previousValue = input.previous ? getOverrideValue(input.previous, path) : undefined;
    return value !== lockedValue && value !== previousValue;
  });
}

function getAtSettingsPath(settings: LiveClassSettings, path: LockableLiveSetting): unknown {
  return getOverrideValue(settings as unknown as LiveClassSettingsOverride, path);
}

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
 * `class` are partial overrides. Last layer wins — a class may loosen a batch
 * default on purpose (§26) — except for locked fields: an academy lock
 * (`systemLocks`) ignores the batch and class layers, a batch lock
 * (`batchLocks`) ignores the class layer. The same function feeds the frozen
 * session snapshot and LiveKit grants, so a lock is enforced at token level.
 */
export function resolveLiveClassSettings(layers: {
  system?: unknown;
  batch?: LiveClassSettingsOverride | null;
  class?: LiveClassSettingsOverride | null;
  systemLocks?: readonly LockableLiveSetting[] | null;
  batchLocks?: readonly LockableLiveSetting[] | null;
}): LiveClassSettings {
  const base = liveClassSettingsSchema.parse(layers.system ?? {});
  const systemLocks = layers.systemLocks ?? [];
  const allLocks = [...systemLocks, ...(layers.batchLocks ?? [])];
  const merged = mergeOverride(
    mergeOverride(base, withoutLockedFields(layers.batch, systemLocks)),
    withoutLockedFields(layers.class, allLocks),
  );
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
  if (settings.student.reactions === "DISABLED") {
    warnings.push("Students will not be able to send emoji reactions.");
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
