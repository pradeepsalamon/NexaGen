import type { MoveClassification, TacticOutcome } from "@nexa-chess/types";

type BadgeVariant = "default" | "secondary" | "success" | "warning" | "info" | "destructive" | "outline";

/** Badge colour + the short PGN-style mark for each move label. */
export const CLASSIFICATION_STYLE: Record<MoveClassification, { variant: BadgeVariant; mark: string }> = {
  BEST: { mark: "★", variant: "success" },
  BLUNDER: { mark: "??", variant: "destructive" },
  FORCED: { mark: "□", variant: "outline" },
  GOOD: { mark: "", variant: "secondary" },
  INACCURACY: { mark: "?!", variant: "info" },
  MATE_ALLOWED: { mark: "??", variant: "destructive" },
  MISSED_DRAW: { mark: "?", variant: "warning" },
  MISSED_MATE: { mark: "?", variant: "destructive" },
  MISSED_WIN: { mark: "?", variant: "warning" },
  MISTAKE: { mark: "?", variant: "warning" },
  UNCLASSIFIED: { mark: "", variant: "outline" },
};

/** Moves worth listing under "Key moments". */
export const KEY_MOMENT_CLASSES: ReadonlySet<MoveClassification> = new Set([
  "MISTAKE",
  "BLUNDER",
  "MISSED_WIN",
  "MISSED_MATE",
  "MISSED_DRAW",
  "MATE_ALLOWED",
]);

export const OUTCOME_STYLE: Record<TacticOutcome, { label: string; variant: BadgeVariant }> = {
  ALTERNATIVE: { label: "Played another good move", variant: "secondary" },
  FOUND: { label: "Found", variant: "success" },
  MISSED: { label: "Missed", variant: "warning" },
  UNKNOWN: { label: "Not judged", variant: "outline" },
};

/** "12." for White's 12th move, "12…" for Black's. */
export function moveNumberLabel(ply: number): string {
  const n = Math.floor(ply / 2) + 1;
  return ply % 2 === 0 ? `${n}.` : `${n}…`;
}
