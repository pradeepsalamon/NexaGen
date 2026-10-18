import { z } from "zod";

// ──────────────────────────────────────────────────────────────
// Live-class "Interactives" — classroom tools shared contract
// ──────────────────────────────────────────────────────────────
// Fourteen coach tools open from the toolbar's Interactives launcher. Eight of
// them hold state worth keeping (a goal in progress, the teams, the running
// timer…): that state is one `LiveClassToolState` row per (scope, tool),
// written by the class's coach/admin and readable by every participant. REST is
// the source of truth; the `classroom_tools` topic is a server-injected nudge to
// refetch. The other four (Chess Balance, Opening of the Day, Video Generator,
// Rating Calculator) are personal and keep nothing on the server. Puzzle
// Storm and Puzzle Racer are rounds every student plays; their state is its own
// model (`puzzle-rush.ts`), not a tool-state row.
//
// Students never open tools themselves. The coach *presents* one: PRESENTING
// names the tool open on the coach's screen (plus, for the personal tools, a
// small snapshot of what the coach is looking at), and every student's main
// stage shows that tool live, read-only.

export const LIVE_CLASS_TOOLS_TOPIC = "classroom_tools";

export const liveClassToolKindSchema = z.enum([
  "PICK_STUDENT",
  "MYSTERY_BOX",
  "WALL_OF_MOMENTS",
  "TEAMS",
  "GM_MAPPER",
  "SIDES",
  "LEGENDS",
  "TIMER",
  "PRESENTING"
]);
export type LiveClassToolKind = z.infer<typeof liveClassToolKindSchema>;

/**
 * Where a tool's state lives. BATCH state carries over from class to class (a
 * goal the batch works toward over weeks); CLASS state starts fresh each class.
 * A class with no batch keeps everything per class.
 */
export const LIVE_CLASS_TOOL_SCOPE: Record<LiveClassToolKind, "BATCH" | "CLASS"> = {
  GM_MAPPER: "BATCH",
  LEGENDS: "CLASS",
  MYSTERY_BOX: "BATCH",
  PICK_STUDENT: "CLASS",
  SIDES: "CLASS",
  TEAMS: "CLASS",
  PRESENTING: "CLASS",
  TIMER: "CLASS",
  WALL_OF_MOMENTS: "BATCH"
};

/** The fourteen Interactives, by the id the web registry uses. Persisted in PRESENTING — never rename one. */
export const LIVE_CLASS_INTERACTIVE_IDS = [
  "pick-student",
  "mystery-box",
  "wall-of-moments",
  "team-generator",
  "grandmaster-mapper",
  "chess-balance",
  "white-or-black",
  "chess-legends",
  "opening-of-the-day",
  "video-generator",
  "rating-calculator",
  "classroom-timer",
  "puzzle-storm",
  "puzzle-racer"
] as const;
export const liveClassInteractiveIdSchema = z.enum(LIVE_CLASS_INTERACTIVE_IDS);
export type LiveClassInteractiveId = z.infer<typeof liveClassInteractiveIdSchema>;

/** Upper bound on a presented tool's view snapshot (serialized JSON characters). */
export const PRESENTED_VIEW_MAX_CHARS = 4000;

const id = z.string().trim().min(1).max(64);
const name = z.string().trim().min(1).max(120);
const isoDate = z.string().datetime();
const studentRef = z.object({ id, name });
export type ToolStudentRef = z.infer<typeof studentRef>;

export const pickStudentStateSchema = z.object({
  /** Most recent first, capped. */
  history: z.array(studentRef.extend({ pickedAt: isoDate })).max(30),
  /** Skip students already picked until everyone has had a turn. */
  noRepeat: z.boolean()
});
export type PickStudentState = z.infer<typeof pickStudentStateSchema>;

export const mysteryBoxStateSchema = z.object({
  goal: z.string().trim().min(1).max(160),
  target: z.number().int().min(1).max(1000),
  progress: z.number().int().min(0).max(1000),
  /** Id of the reward revealed when the goal was reached; null until then. */
  rewardId: z.string().max(64).nullable(),
  /** Recent awards, most recent first. */
  log: z
    .array(z.object({ amount: z.number().int(), note: z.string().max(120), at: isoDate }))
    .max(50)
});
export type MysteryBoxState = z.infer<typeof mysteryBoxStateSchema>;

export const wallMomentSchema = z.object({
  id,
  studentId: z.string().max(64).nullable(),
  studentName: name,
  title: z.string().trim().min(1).max(80),
  note: z.string().max(240),
  /** Emoji badge shown on the card. */
  badge: z.string().max(16),
  createdAt: isoDate
});
export type WallMoment = z.infer<typeof wallMomentSchema>;

export const wallOfMomentsStateSchema = z.object({
  title: z.string().trim().min(1).max(80),
  moments: z.array(wallMomentSchema).max(60)
});
export type WallOfMomentsState = z.infer<typeof wallOfMomentsStateSchema>;

export const teamsStateSchema = z.object({
  mode: z.enum(["COUNT", "SIZE"]),
  value: z.number().int().min(1).max(50),
  teams: z.array(z.object({ name, members: z.array(studentRef).max(200) })).max(50),
  generatedAt: isoDate
});
export type TeamsState = z.infer<typeof teamsStateSchema>;

export const gmMapperStateSchema = z.object({
  /** Student id → grandmaster profile id (the catalogue lives in the web app). */
  assignments: z.array(studentRef.extend({ gmId: id })).max(200),
  generatedAt: isoDate
});
export type GmMapperState = z.infer<typeof gmMapperStateSchema>;

export const sidesStateSchema = z.object({
  results: z
    .array(
      z.object({
        label: z.string().max(120),
        white: z.string().max(120),
        black: z.string().max(120),
        at: isoDate
      })
    )
    .max(20)
});
export type SidesState = z.infer<typeof sidesStateSchema>;

export const legendsStateSchema = z.object({
  /** The story the coach is showing the class; null when none. */
  storyId: z.string().max(64).nullable()
});
export type LegendsState = z.infer<typeof legendsStateSchema>;

export const timerPhaseSchema = z.object({
  id,
  label: z.string().trim().min(1).max(40),
  seconds: z.number().int().min(10).max(4 * 60 * 60)
});
export type TimerPhase = z.infer<typeof timerPhaseSchema>;

export const timerStateSchema = z.object({
  phases: z.array(timerPhaseSchema).min(1).max(12),
  index: z.number().int().min(0),
  status: z.enum(["IDLE", "RUNNING", "PAUSED", "DONE"]),
  /** Remaining ms in the current phase at `since` (or now, when not running). */
  remainingMs: z.number().int().min(0),
  /** RUNNING: ISO time `remainingMs` was taken. Otherwise null. */
  since: isoDate.nullable()
});
export type TimerState = z.infer<typeof timerStateSchema>;

export const presentingStateSchema = z.object({
  /** The tool on the coach's screen that students see; null = nothing shown. */
  toolId: liveClassInteractiveIdSchema.nullable(),
  /** When this tool started being shown — a new value re-opens it for students who closed it. */
  startedAt: isoDate.nullable(),
  /**
   * What the coach is looking at in a personal tool (the scale's pieces, the
   * opening and move). Each tool validates its own shape on read; shared-state
   * tools leave it null.
   */
  view: z
    .unknown()
    .nullable()
    .refine((v) => v === null || v === undefined || JSON.stringify(v).length <= PRESENTED_VIEW_MAX_CHARS, {
      message: "The presented view is too large."
    })
});
export type PresentingState = z.infer<typeof presentingStateSchema>;

export const LIVE_CLASS_TOOL_STATE_SCHEMAS = {
  GM_MAPPER: gmMapperStateSchema,
  LEGENDS: legendsStateSchema,
  MYSTERY_BOX: mysteryBoxStateSchema,
  PICK_STUDENT: pickStudentStateSchema,
  PRESENTING: presentingStateSchema,
  SIDES: sidesStateSchema,
  TEAMS: teamsStateSchema,
  TIMER: timerStateSchema,
  WALL_OF_MOMENTS: wallOfMomentsStateSchema
} satisfies Record<LiveClassToolKind, z.ZodTypeAny>;

export type LiveClassToolStateMap = {
  [K in LiveClassToolKind]: z.infer<(typeof LIVE_CLASS_TOOL_STATE_SCHEMAS)[K]>;
};

export type LiveClassToolEntry<K extends LiveClassToolKind = LiveClassToolKind> = {
  state: LiveClassToolStateMap[K];
  updatedAt: string;
};

export type LiveClassToolsResponse = {
  tools: { [K in LiveClassToolKind]?: LiveClassToolEntry<K> };
  /** ISO server time — clients derive clock skew from it (the timer). */
  serverTime: string;
};

export type LiveClassToolResponse = {
  tool: LiveClassToolKind;
  entry: LiveClassToolEntry | null;
  serverTime: string;
};

export const updateLiveClassToolRequestSchema = z.object({ state: z.unknown() });
export type UpdateLiveClassToolRequest<K extends LiveClassToolKind = LiveClassToolKind> = {
  state: LiveClassToolStateMap[K];
};

// ── Data-channel message ──

export const liveClassToolsMessageSchema = z.object({
  type: z.literal("TOOL_CHANGED"),
  tool: liveClassToolKindSchema
});
export type LiveClassToolsMessage = z.infer<typeof liveClassToolsMessageSchema>;

export function encodeLiveClassToolsMessage(msg: LiveClassToolsMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

export function decodeLiveClassToolsMessage(payload: Uint8Array): LiveClassToolsMessage | null {
  try {
    const parsed = liveClassToolsMessageSchema.safeParse(JSON.parse(new TextDecoder().decode(payload)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ── Pure helpers (shared by the tools and their specs) ──

/** Fisher–Yates with an injectable random source (tests pass a seeded one). */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Splits `members` into balanced groups: COUNT = that many teams, SIZE = teams
 * of about that size (the remainder spreads one per team rather than leaving a
 * lone straggler). Team sizes never differ by more than one.
 */
export function splitIntoTeams<T>(members: readonly T[], mode: "COUNT" | "SIZE", value: number): T[][] {
  if (members.length === 0 || value < 1) return [];
  const count =
    mode === "COUNT"
      ? Math.min(value, members.length)
      : Math.max(1, Math.floor(members.length / Math.min(value, members.length)));
  const teams: T[][] = Array.from({ length: count }, () => []);
  members.forEach((m, i) => teams[i % count].push(m));
  return teams;
}

export const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9 } as const;
export type ValuedPiece = keyof typeof PIECE_VALUES;

export function materialValue(counts: Partial<Record<ValuedPiece, number>>): number {
  return (Object.keys(PIECE_VALUES) as ValuedPiece[]).reduce(
    (sum, p) => sum + PIECE_VALUES[p] * Math.max(0, counts[p] ?? 0),
    0
  );
}

/** Expected score of a player rated `rating` against `opponent` (Elo / FIDE). */
export function eloExpectedScore(rating: number, opponent: number): number {
  // FIDE caps the difference at 400 for rating purposes.
  const diff = Math.max(-400, Math.min(400, opponent - rating));
  return 1 / (1 + 10 ** (diff / 400));
}

/** Rating change for one game: K × (score − expected), unrounded. */
export function eloRatingChange(rating: number, opponent: number, score: number, k: number): number {
  return k * (score - eloExpectedScore(rating, opponent));
}

/** Remaining ms of the current timer phase at `nowMs` (server-adjusted). */
export function timerRemainingMs(state: TimerState, nowMs: number): number {
  if (state.status !== "RUNNING" || !state.since) return state.remainingMs;
  return Math.max(0, state.remainingMs - (nowMs - Date.parse(state.since)));
}
