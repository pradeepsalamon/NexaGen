import { z } from "zod";
import { liveBoardStateSchema } from "./live-class-board-state";

// ──────────────────────────────────────────────────────────────
// Live-class chapters — the coach's study list (Lichess Study-style)
// ──────────────────────────────────────────────────────────────
// A chapter is a saved board: position, the whole move tree (variations,
// comments), arrows/highlights and orientation. The coach loads one onto the
// shared board — the ordinary board sync carries it to every student — or asks
// the class about its position through "Share current". Chapters belong to the
// batch (they carry over from class to class, like the batch-scoped
// Interactives); a class with no batch keeps its own. Only the class's coach or
// an admin reads or writes them: a saved line may well hold a puzzle's answer.

/** What a chapter keeps of the board — the durable snapshot minus clock and UI state. */
export const liveClassChapterStateSchema = liveBoardStateSchema.omit({
  activeTab: true,
  clock: true,
  savedAt: true
});
export type LiveClassChapterState = z.infer<typeof liveClassChapterStateSchema>;

export const MAX_LIVE_CLASS_CHAPTERS = 64;
export const LIVE_CLASS_CHAPTER_TITLE_MAX = 80;

const chapterTitleSchema = z
  .string()
  .trim()
  .min(1, "Give the chapter a title.")
  .max(LIVE_CLASS_CHAPTER_TITLE_MAX, `At most ${LIVE_CLASS_CHAPTER_TITLE_MAX} characters.`);

export const createLiveClassChapterRequestSchema = z.object({
  title: chapterTitleSchema,
  state: liveClassChapterStateSchema,
  /** The library puzzle this position came from, if any (prefills "Ask"). */
  puzzleId: z.string().min(1).max(64).nullable().optional(),
  /** Generated once by the client; a retried create returns the same chapter. */
  clientId: z.string().min(8).max(64)
});
export type CreateLiveClassChapterRequest = z.infer<typeof createLiveClassChapterRequestSchema>;

/** Adds library puzzles as chapters, in the order given (already-added puzzles are skipped). */
export const importLiveClassChaptersRequestSchema = z.object({
  puzzleIds: z.array(z.string().min(1).max(64)).min(1).max(MAX_LIVE_CLASS_CHAPTERS)
});
export type ImportLiveClassChaptersRequest = z.infer<typeof importLiveClassChaptersRequestSchema>;

export const updateLiveClassChapterRequestSchema = z
  .object({
    title: chapterTitleSchema.optional(),
    /** Saves the current board into the chapter. */
    state: liveClassChapterStateSchema.optional()
  })
  .refine((v) => v.title !== undefined || v.state !== undefined, "Nothing to update.");
export type UpdateLiveClassChapterRequest = z.infer<typeof updateLiveClassChapterRequestSchema>;

/** The full new order — every chapter id exactly once. */
export const reorderLiveClassChaptersRequestSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).max(MAX_LIVE_CLASS_CHAPTERS)
});
export type ReorderLiveClassChaptersRequest = z.infer<typeof reorderLiveClassChaptersRequestSchema>;

/**
 * "Delete all": the ids the coach confirmed. Only those are removed, so a
 * chapter added after the dialog opened survives, and a retry deletes nothing more.
 */
export const deleteLiveClassChaptersRequestSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(MAX_LIVE_CLASS_CHAPTERS)
});
export type DeleteLiveClassChaptersRequest = z.infer<typeof deleteLiveClassChaptersRequestSchema>;

export interface LiveClassChapter {
  id: string;
  title: string;
  /** 0-based, contiguous. */
  position: number;
  state: LiveClassChapterState;
  puzzleId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LiveClassChaptersResponse {
  chapters: LiveClassChapter[];
  /** BATCH when the chapters carry over between this batch's classes. */
  scope: "BATCH" | "CLASS";
}

export interface DeleteLiveClassChaptersResponse extends LiveClassChaptersResponse {
  /** How many of the requested chapters this call removed (0 on a retry). */
  deleted: number;
}
