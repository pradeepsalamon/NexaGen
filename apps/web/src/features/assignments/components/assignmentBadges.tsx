import {
  resolveAssignmentDueStatus,
  type AssignmentActivityType,
  type AssignmentDifficulty,
  type AssignmentDueStatus,
  type AssignmentStatus
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

export const ACTIVITY_LABEL: Record<AssignmentActivityType, string> = {
  REPLAY: "Study PGN",
  SOLVE_LINE: "Solve position",
  PLAY_VS_ENGINE: "Play vs engine",
  FREE_ANALYSIS: "Free analysis",
  PUZZLE_SET: "Puzzle set"
};

const ACTIVITY_STYLE: Record<AssignmentActivityType, string> = {
  REPLAY: "border-primary/40 bg-primary/10 text-primary-ink",
  SOLVE_LINE: "border-warm/40 bg-warm/10 text-warm-ink",
  PLAY_VS_ENGINE: "border-accent/40 bg-accent/10 text-accent-ink",
  FREE_ANALYSIS: "border-app-border bg-app-soft text-app-text",
  PUZZLE_SET: "border-secondary/40 bg-secondary/10 text-secondary-ink"
};

export function ActivityBadge({ activityType }: { activityType: AssignmentActivityType }) {
  return (
    <Badge variant="outline" className={ACTIVITY_STYLE[activityType]}>
      {ACTIVITY_LABEL[activityType]}
    </Badge>
  );
}

const DIFFICULTY_STYLE: Record<AssignmentDifficulty, string> = {
  BEGINNER: "border-success/30 bg-success/10 text-success-ink",
  INTERMEDIATE: "border-warning/30 bg-warning/10 text-warning-ink",
  ADVANCED: "border-app-danger/30 bg-app-danger/10 text-app-danger-ink"
};

const DIFFICULTY_LABEL: Record<AssignmentDifficulty, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced"
};

const STATUS_STYLE: Record<AssignmentStatus, string> = {
  PENDING: "border-app-border bg-app-background text-app-muted",
  IN_PROGRESS: "border-warning/30 bg-warning/10 text-warning-ink",
  COMPLETED: "border-success/30 bg-success/10 text-success-ink"
};

const STATUS_LABEL: Record<AssignmentStatus, string> = {
  PENDING: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed"
};

export function DifficultyBadge({ difficulty }: { difficulty: AssignmentDifficulty }) {
  return (
    <Badge variant="outline" className={DIFFICULTY_STYLE[difficulty]}>
      {DIFFICULTY_LABEL[difficulty]}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: AssignmentStatus }) {
  return (
    <Badge variant="outline" className={STATUS_STYLE[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

const DUE_STYLE: Record<AssignmentDueStatus, string> = {
  COMPLETED: "border-app-border bg-app-background text-app-muted",
  DUE_SOON: "border-secondary/40 bg-secondary/10 text-secondary-ink",
  DUE_TODAY: "border-warning/40 bg-warning/10 text-warning-ink",
  OVERDUE: "border-app-danger/30 bg-app-danger/10 text-app-danger-ink",
  UPCOMING: "border-app-border bg-app-background text-app-muted"
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
    <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", DUE_STYLE[status])}>
      {DUE_PREFIX[status]}
      {formatted}
    </span>
  );
}
