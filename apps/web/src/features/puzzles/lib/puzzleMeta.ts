import type {
  PuzzleDifficulty,
  PuzzleStatus,
  PuzzleType,
  PuzzleVisibility
} from "@nexa-chess/types";

export const PUZZLE_TYPE_LABELS: Record<PuzzleType, string> = {
  TACTICAL: "Tactical",
  CHECKMATE: "Checkmate",
  BEST_MOVE: "Best move",
  CALCULATION: "Calculation",
  ENDGAME: "Endgame",
  OPENING: "Opening",
  CUSTOM: "Custom"
};

export const PUZZLE_DIFFICULTY_LABELS: Record<PuzzleDifficulty, string> = {
  BEGINNER: "Beginner",
  EASY: "Easy",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  EXPERT: "Expert"
};

export const PUZZLE_STATUS_LABELS: Record<PuzzleStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived"
};

export const PUZZLE_VISIBILITY_LABELS: Record<PuzzleVisibility, string> = {
  GLOBAL: "Admin Library",
  PRIVATE: "Private"
};

export const PUZZLE_TYPE_OPTIONS = (
  Object.keys(PUZZLE_TYPE_LABELS) as PuzzleType[]
).map((value) => ({ value, label: PUZZLE_TYPE_LABELS[value] }));

export const PUZZLE_DIFFICULTY_OPTIONS = (
  Object.keys(PUZZLE_DIFFICULTY_LABELS) as PuzzleDifficulty[]
).map((value) => ({ value, label: PUZZLE_DIFFICULTY_LABELS[value] }));

export const PUZZLE_STATUS_OPTIONS = (
  Object.keys(PUZZLE_STATUS_LABELS) as PuzzleStatus[]
).map((value) => ({ value, label: PUZZLE_STATUS_LABELS[value] }));

export function difficultyBadgeVariant(
  difficulty: PuzzleDifficulty
): "success" | "secondary" | "warning" | "destructive" | "default" {
  switch (difficulty) {
    case "BEGINNER":
      return "success";
    case "EASY":
      return "secondary";
    case "INTERMEDIATE":
      return "default";
    case "ADVANCED":
      return "warning";
    case "EXPERT":
      return "destructive";
  }
}

export function statusBadgeVariant(
  status: PuzzleStatus
): "success" | "secondary" | "outline" {
  if (status === "PUBLISHED") return "success";
  if (status === "ARCHIVED") return "outline";
  return "secondary";
}
