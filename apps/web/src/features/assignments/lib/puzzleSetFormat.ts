import type { PuzzleSetItemStatus } from "@nexa-chess/types";

/** "4:05" — puzzle times are seconds to a few minutes, so `formatDuration`'s "0 min" hides them. */
export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0) return "—";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const mm = hrs > 0 ? String(mins).padStart(2, "0") : String(mins);
  return `${hrs > 0 ? `${hrs}:` : ""}${mm}:${String(secs).padStart(2, "0")}`;
}

export function formatPoints(points: number | null | undefined, max?: number): string {
  if (points === null || points === undefined) return "—";
  return max === undefined ? String(points) : `${points} / ${max}`;
}

/** Badge variant per puzzle outcome (shared `Badge` variants only). */
export const ITEM_STATUS_VARIANT: Record<
  PuzzleSetItemStatus,
  "success" | "destructive" | "warning" | "outline"
> = {
  FAILED: "destructive",
  IN_PROGRESS: "warning",
  NOT_STARTED: "outline",
  SOLVED: "success"
};
