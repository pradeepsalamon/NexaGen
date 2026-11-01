// Hands a confirmed position to the existing "New puzzle" form.
//
// The form is a separate page (and, from a live class, a separate tab), so the
// prefill rides localStorage for a few minutes and is consumed once. Nothing
// is saved by this: the coach still checks the solution, fills in the topic
// and difficulty and saves through the normal puzzle workflow.

import { solutionMoveSchema, type SolutionMove } from "@nexa-chess/types";

const KEY = "nexa-diagram-import-handoff";
const TTL_MS = 10 * 60 * 1000;

export type PuzzlePrefill = {
  fen: string;
  title: string;
  description: string;
  tags: string[];
  /** Moves printed next to the diagram and legal from `fen`; the coach checks them. */
  solutionMoves?: SolutionMove[];
};

export const PDF_IMPORT_TAG = "pdf-import";

export function storePuzzlePrefill(prefill: PuzzlePrefill) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), prefill }));
  } catch {
    // Storage blocked: the form simply opens empty.
  }
}

/** Reads and clears the prefill; null when there is none or it went stale. */
export function takePuzzlePrefill(): PuzzlePrefill | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    window.localStorage.removeItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; prefill?: PuzzlePrefill };
    if (!parsed?.prefill || typeof parsed.at !== "number" || Date.now() - parsed.at > TTL_MS) return null;
    const p = parsed.prefill;
    if (typeof p.fen !== "string" || typeof p.title !== "string" || typeof p.description !== "string") return null;
    const moves = solutionMoveSchema.array().safeParse(p.solutionMoves);
    return {
      ...p,
      solutionMoves: moves.success ? moves.data : [],
      tags: Array.isArray(p.tags) ? p.tags.filter((t) => typeof t === "string") : [],
    };
  } catch {
    return null;
  }
}
