import type { PuzzleDifficulty } from "./puzzle";

// Student progress: a puzzle rating (Elo against a fixed rating per puzzle
// difficulty) and a daily practice streak. Only a student's FIRST finished
// attempt at each puzzle is rated, so retrying a known puzzle can't farm points.

export const INITIAL_PUZZLE_RATING = 1200;
export const MIN_PUZZLE_RATING = 100;
/** Games below this count move the rating faster, so a new student settles quickly. */
export const PROVISIONAL_RATED_PUZZLES = 20;

export const PUZZLE_DIFFICULTY_RATINGS: Record<PuzzleDifficulty, number> = {
  BEGINNER: 800,
  EASY: 1000,
  INTERMEDIATE: 1300,
  ADVANCED: 1600,
  EXPERT: 1900
};

/** 1 for a clean solve, ½ for a solve that needed hints, 0 otherwise. */
export function puzzleResultScore(solved: boolean, hintsUsed: number): number {
  if (!solved) return 0;
  return hintsUsed > 0 ? 0.5 : 1;
}

export function nextPuzzleRating(params: {
  rating: number;
  ratedPuzzles: number;
  difficulty: PuzzleDifficulty;
  score: number;
}): number {
  const opponent = PUZZLE_DIFFICULTY_RATINGS[params.difficulty];
  const expected = 1 / (1 + 10 ** ((opponent - params.rating) / 400));
  const k = params.ratedPuzzles < PROVISIONAL_RATED_PUZZLES ? 40 : 20;
  return Math.max(MIN_PUZZLE_RATING, Math.round(params.rating + k * (params.score - expected)));
}

/**
 * Streak after activity on `today` given the last active day (both
 * `YYYY-MM-DD` in the student's own timezone). Same day: unchanged; the day
 * after: +1; any gap: restarts at 1.
 */
export function nextStreak(current: number, lastActiveDay: string | null, today: string): number {
  if (lastActiveDay === today) return Math.max(current, 1);
  if (lastActiveDay && addDays(lastActiveDay, 1) === today) return current + 1;
  return 1;
}

/** The streak as it stands on `today` — broken if the student missed yesterday. */
export function liveStreak(current: number, lastActiveDay: string | null, today: string): number {
  if (!lastActiveDay) return 0;
  return lastActiveDay === today || addDays(lastActiveDay, 1) === today ? current : 0;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type RatingPoint = { at: string; rating: number };

export type RecentPuzzleResult = {
  puzzleId: string;
  title: string;
  difficulty: PuzzleDifficulty;
  solved: boolean;
  /** null when the attempt wasn't rated (a repeat of a puzzle already rated). */
  ratingChange: number | null;
  at: string;
};

export type StudentProgressDto = {
  studentId: string;
  studentName: string;
  puzzleRating: number;
  peakRating: number;
  ratedPuzzles: number;
  currentStreak: number;
  longestStreak: number;
  /** `YYYY-MM-DD` in the student's timezone, or null before any activity. */
  lastActiveDay: string | null;
  puzzlesSolved: number;
  puzzlesAttempted: number;
  assignmentsCompleted: number;
  averageAssignmentScore: number | null;
  ratingHistory: RatingPoint[];
  recentPuzzles: RecentPuzzleResult[];
};

export type StudentProgressResponse = { progress: StudentProgressDto };
