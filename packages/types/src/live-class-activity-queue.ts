import { z } from "zod";
import { liveClassChapterStateSchema, type LiveClassChapterState } from "./live-class-chapter";

// ──────────────────────────────────────────────────────────────
// Live-class activity queue — a coach's prepared lesson sequence
// ──────────────────────────────────────────────────────────────
// The coach drafts an ordered list of activities for one class (before or
// during it), launches it once, and steps the whole class through it together
// (shared progression). Each item only *references* what already exists:
//   PUZZLE   → shared through the ordinary live puzzle (server-scored attempts)
//   QUESTION → asked through the ordinary move poll ("what would you play?")
//   CHAPTER  → a saved chapter, loaded onto the coach's shared board
// so the queue adds no second solver, attempt engine or board. Responses stay
// where those features already keep them; the queue records which puzzle share
// or poll each item produced, which is what ties a response to an item.
//
// REST is the source of truth; the `activity_queue` topic is a server-injected
// nudge to refetch. Students only ever see the running queue's progress (never
// upcoming items) and only whether they themselves have responded.

export const LIVE_CLASS_ACTIVITY_QUEUE_TOPIC = "activity_queue";

export const MAX_ACTIVITY_QUEUE_ITEMS = 40;
export const MAX_ACTIVITY_QUEUES_PER_CLASS = 20;
export const ACTIVITY_QUEUE_TITLE_MAX = 80;
export const ACTIVITY_QUEUE_PROMPT_MAX = 200;
// Mirrors the live puzzle's own timer bounds.
export const ACTIVITY_QUEUE_TIMER_MIN_SECONDS = 30;
export const ACTIVITY_QUEUE_TIMER_MAX_SECONDS = 3600;

export const activityQueueStatusSchema = z.enum(["DRAFT", "LIVE", "FINISHED"]);
export type ActivityQueueStatus = z.infer<typeof activityQueueStatusSchema>;

export const activityKindSchema = z.enum(["PUZZLE", "QUESTION", "CHAPTER"]);
export type ActivityKind = z.infer<typeof activityKindSchema>;

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  CHAPTER: "Position",
  PUZZLE: "Puzzle",
  QUESTION: "Question"
};

const uciSchema = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, "Not a UCI move.");
const idSchema = z.string().min(1).max(64);

const queueTitleSchema = z
  .string()
  .trim()
  .min(1, "Give the queue a name.")
  .max(ACTIVITY_QUEUE_TITLE_MAX, `At most ${ACTIVITY_QUEUE_TITLE_MAX} characters.`);

// ── Requests ──

export const createActivityQueueRequestSchema = z.object({
  title: queueTitleSchema,
  /** Generated once by the client; a retried create returns the same queue. */
  clientId: z.string().min(8).max(64)
});
export type CreateActivityQueueRequest = z.infer<typeof createActivityQueueRequestSchema>;

export const renameActivityQueueRequestSchema = z.object({ title: queueTitleSchema });
export type RenameActivityQueueRequest = z.infer<typeof renameActivityQueueRequestSchema>;

export const activityQueueItemInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("PUZZLE"),
    puzzleId: idSchema,
    /** null / absent = untimed. */
    durationSeconds: z
      .number()
      .int()
      .min(ACTIVITY_QUEUE_TIMER_MIN_SECONDS)
      .max(ACTIVITY_QUEUE_TIMER_MAX_SECONDS)
      .nullable()
      .optional()
  }),
  z.object({
    kind: z.literal("QUESTION"),
    fen: z.string().min(10).max(120),
    prompt: z.string().trim().max(ACTIVITY_QUEUE_PROMPT_MAX).optional(),
    /** The move that counts as correct; without one answers are only "submitted". */
    correctUci: uciSchema.nullable().optional()
  }),
  z.object({ kind: z.literal("CHAPTER"), chapterId: idSchema })
]);
export type ActivityQueueItemInput = z.infer<typeof activityQueueItemInputSchema>;

/** Appends items in the order given. */
export const addActivityQueueItemsRequestSchema = z.object({
  items: z.array(activityQueueItemInputSchema).min(1).max(MAX_ACTIVITY_QUEUE_ITEMS)
});
export type AddActivityQueueItemsRequest = z.infer<typeof addActivityQueueItemsRequestSchema>;

/** The full new order — every item id exactly once. */
export const reorderActivityQueueRequestSchema = z.object({
  ids: z.array(idSchema).max(MAX_ACTIVITY_QUEUE_ITEMS)
});
export type ReorderActivityQueueRequest = z.infer<typeof reorderActivityQueueRequestSchema>;

/**
 * Moves the class from `fromItemId` to the next item (or finishes the queue
 * after the last one). Naming the item the coach is looking at makes a double
 * click or a second coach tab a 409 instead of skipping an activity.
 */
export const advanceActivityQueueRequestSchema = z.object({ fromItemId: idSchema });
export type AdvanceActivityQueueRequest = z.infer<typeof advanceActivityQueueRequestSchema>;

// ── Responses ──

export type ActivityQueueItem = {
  id: string;
  /** 0-based, contiguous. */
  position: number;
  kind: ActivityKind;
  title: string;
  puzzleId: string | null;
  chapterId: string | null;
  /** QUESTION: the position asked about. */
  fen: string | null;
  prompt: string | null;
  correctUci: string | null;
  durationSeconds: number | null;
  /** CHAPTER: the chapter's saved board (coach view only); null once the chapter is deleted. */
  chapterState: LiveClassChapterState | null;
  /** False when the referenced puzzle / chapter is gone or no longer usable. */
  available: boolean;
  activatedAt: string | null;
  completedAt: string | null;
  /** Why the activity couldn't be started when the class reached it. */
  activationError: string | null;
};

export type ActivityQueue = {
  id: string;
  classId: string;
  title: string;
  status: ActivityQueueStatus;
  currentItemId: string | null;
  launchedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: ActivityQueueItem[];
};

/** Coach-owner / admin: every queue of the class, newest first. */
export type ActivityQueuesResponse = {
  queues: ActivityQueue[];
  /** True while the class is LIVE, i.e. a queue may be launched. */
  classLive: boolean;
};

export type ActivityQueueResponse = { queue: ActivityQueue };

/** What a student may know about the running queue. */
export type StudentActivityQueueView = {
  queueId: string;
  title: string;
  /** 1-based position of the current activity. */
  currentNumber: number;
  total: number;
  current: { kind: ActivityKind; title: string } | null;
  /** One entry per activity the class has reached, in order: did *I* respond? */
  mine: { number: number; kind: ActivityKind; responded: boolean }[];
};

export type StudentActivityQueueResponse = { queue: StudentActivityQueueView | null };

/**
 * PENDING      reached, nothing from this student yet (still current)
 * IN_PROGRESS  a puzzle attempt is open
 * SUBMITTED    answered a question that has no marked answer
 * CORRECT / INCORRECT  scored by the activity's own rules
 * MISSED       the class moved on without a response
 */
export const activityResponseStateSchema = z.enum([
  "PENDING",
  "IN_PROGRESS",
  "SUBMITTED",
  "CORRECT",
  "INCORRECT",
  "MISSED"
]);
export type ActivityResponseState = z.infer<typeof activityResponseStateSchema>;

export type ActivityResponseCell = {
  state: ActivityResponseState;
  /** e.g. the SAN played, or "2 tries · 1 hint". */
  detail: string | null;
};

/** Coach-owner / admin: one row per student, one cell per reached PUZZLE / QUESTION item. */
export type ActivityQueueProgressResponse = {
  queueId: string;
  students: { studentId: string; studentName: string }[];
  /** itemId → studentId → cell. CHAPTER items and items not yet reached have none. */
  cells: Record<string, Record<string, ActivityResponseCell>>;
  /** itemId → number of students who responded at all. */
  respondedCounts: Record<string, number>;
};

export const ACTIVITY_RESPONSE_LABELS: Record<ActivityResponseState, string> = {
  CORRECT: "Correct",
  INCORRECT: "Incorrect",
  IN_PROGRESS: "Working",
  MISSED: "Missed",
  PENDING: "Waiting",
  SUBMITTED: "Answered"
};

/** True when the student did respond (any state but waiting / missed). */
export function isActivityResponded(state: ActivityResponseState): boolean {
  return state !== "PENDING" && state !== "MISSED";
}

// ── Data-channel message ──

export const activityQueueMessageSchema = z.object({
  type: z.literal("QUEUE_CHANGED"),
  queueId: z.string()
});
export type ActivityQueueMessage = z.infer<typeof activityQueueMessageSchema>;

export function encodeActivityQueueMessage(msg: ActivityQueueMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

export function decodeActivityQueueMessage(payload: Uint8Array): ActivityQueueMessage | null {
  try {
    const parsed = activityQueueMessageSchema.safeParse(JSON.parse(new TextDecoder().decode(payload)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** A stored chapter state, or null when it no longer matches the shared schema. */
export function parseActivityChapterState(value: unknown): LiveClassChapterState | null {
  const parsed = liveClassChapterStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
