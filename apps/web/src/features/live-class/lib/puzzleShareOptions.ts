import type { PuzzleLeaderboardOverride, PuzzleScoringOverride } from "@nexa-chess/types";

/**
 * The coach's last share options, remembered per browser so a coach who always
 * runs "−10 per wrong move, leaderboard after the end" sets it once. Only the
 * fields they actually changed are kept (and sent), so a puzzle's own points
 * still apply to everything else.
 */
const LAST_OPTIONS_KEY = "nexa-live-puzzle-share-options";

export type ShareOptions = {
  durationSeconds: string;
  leaderboard: PuzzleLeaderboardOverride;
  scoring: PuzzleScoringOverride;
};

export function loadLastShareOptions(): ShareOptions {
  const empty: ShareOptions = { durationSeconds: "", leaderboard: {}, scoring: {} };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(LAST_OPTIONS_KEY);
    return raw ? { ...empty, ...(JSON.parse(raw) as Partial<ShareOptions>) } : empty;
  } catch {
    return empty;
  }
}

export function saveLastShareOptions(options: ShareOptions) {
  try {
    window.localStorage.setItem(LAST_OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // Storage blocked — the options just aren't remembered.
  }
}
