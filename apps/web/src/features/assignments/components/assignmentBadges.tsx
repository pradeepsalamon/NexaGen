import {
  resolveAssignmentDueStatus,
  type AssignmentActivityType,
  type AssignmentDifficulty,
  type AssignmentDueStatus,
  type AssignmentStatus
} from "@nexa-chess/types";
import { BookOpen, Bot, Microscope, Puzzle, Target, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

type BadgeVariant = "default" | "destructive" | "info" | "outline" | "secondary" | "success" | "warning";

export const ACTIVITY_LABEL: Record<AssignmentActivityType, string> = {
  REPLAY: "Study PGN",
  SOLVE_LINE: "Solve position",
  PLAY_VS_ENGINE: "Play vs engine",
  FREE_ANALYSIS: "Free analysis",
  PUZZLE_SET: "Puzzle set"
};

/** One neutral glyph per activity, for list rows. */
export const ACTIVITY_ICON: Record<AssignmentActivityType, LucideIcon> = {
  FREE_ANALYSIS: Microscope,
  PLAY_VS_ENGINE: Bot,
  PUZZLE_SET: Puzzle,
  REPLAY: BookOpen,
  SOLVE_LINE: Target
};

const ACTIVITY_VARIANT: Record<AssignmentActivityType, BadgeVariant> = {
  REPLAY: "default",
  SOLVE_LINE: "default",
  PLAY_VS_ENGINE: "success",
  FREE_ANALYSIS: "secondary",
  PUZZLE_SET: "info"
};

export function ActivityBadge({ activityType }: { activityType: AssignmentActivityType }) {
  return (
    <Badge variant={ACTIVITY_VARIANT[activityType]}>
      {ACTIVITY_LABEL[activityType]}
    </Badge>
  );
}

export const DIFFICULTY_LABEL: Record<AssignmentDifficulty, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced"
};

const STATUS_VARIANT: Record<AssignmentStatus, BadgeVariant> = {
  PENDING: "secondary",
  IN_PROGRESS: "warning",
  COMPLETED: "success"
};

const STATUS_LABEL: Record<AssignmentStatus, string> = {
  PENDING: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed"
};

/** Neutral on purpose: difficulty is not a status, and red "Advanced" read as an error. */
export function DifficultyBadge({ difficulty }: { difficulty: AssignmentDifficulty }) {
  return (
    <Badge variant="outline">
      {DIFFICULTY_LABEL[difficulty]}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: AssignmentStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export const DUE_VARIANT: Record<AssignmentDueStatus, BadgeVariant> = {
  COMPLETED: "secondary",
  DUE_SOON: "info",
  DUE_TODAY: "warning",
  OVERDUE: "destructive",
  UPCOMING: "secondary"
};

const DUE_PREFIX: Record<AssignmentDueStatus, string> = {
  COMPLETED: "Due ",
  DUE_SOON: "Due soon · ",
  DUE_TODAY: "Due today · ",
  OVERDUE: "Overdue · ",
  UPCOMING: "Due "
};

/** Due date coloured by `resolveAssignmentDueStatus` — finished work is never "overdue". */
export function DueBadge({
  completed = false,
  dueDate,
  formatted,
  timeZone
}: {
  completed?: boolean;
  dueDate: string;
  formatted: string;
  timeZone: string;
}) {
  const status = resolveAssignmentDueStatus({ completed, dueDate }, new Date(), timeZone);
  return (
    <Badge variant={DUE_VARIANT[status]}>
      {DUE_PREFIX[status]}
      {formatted}
    </Badge>
  );
}
